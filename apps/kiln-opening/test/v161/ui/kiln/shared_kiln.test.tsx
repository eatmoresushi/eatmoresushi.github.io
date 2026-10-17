/**
 * Shared Kiln and Imperial Kilns (B3; UI_V1.6.1_ARCHITECTURE §4.2, §9.2, §10.3):
 * - owner decision D8: rows Low (centred under the dome) / Middle / High by the firebox;
 * - only the engine's active spaces by player count (`activeKilnSpaces`, `kilnLayout`): a covered
 *   space is not drawn at all, and the rows reflow evenly (owner review, 2026-10-17);
 * - stacks (Inverted Firing), the Setter's Mark tile, Kiln Furniture and its modifier;
 * - markers face down and turned, this firing's Quality on each chip, Crackle;
 * - kiln targets and pending chips through `TableSelection` (seeded drafts, SSR);
 * - Imperial Kilns with their public modifier; rules details for each tile (D10);
 * - no heat value on a ceramic or a space (D3), no internal ID in perceivable text (D9).
 */
import { describe, expect, it } from "vitest";
import { TECHS, zoneOf } from "../../../../src/game/index.ts";
import type { CeramicId, KilnSpaceId, KilnZone, PlayerCount } from "../../../../src/game/index.ts";
import { techText } from "../../../../src/app/i18n/content.ts";
import { KilnBlock } from "../../../../src/app/kiln/KilnBlock.tsx";
import { defineWindow } from "../../../../src/app/state/draftStore.ts";
import type { WindowRegistry } from "../../../../src/app/state/draftStore.ts";
import { tableSelection } from "../../../../src/app/state/tableSelection.ts";
import { createTranslator, msg } from "../../../../src/app/i18n/translator.ts";
import { fixture, fixtureSource } from "../support/fixtures.ts";
import { renderComponent } from "../support/render.tsx";
import { TOY_WINDOWS } from "../support/toyWindows.tsx";
import { panel, textOf } from "../table/markup.ts";
import { activeKilnSpaces, elementAt, kilnLayout, perceivable, settersMarkOptions, spaceCell, tagged, techRulesCheck, withoutRulesPanels } from "./support.ts";

const render = (id: string, locale: "en" | "zh-CN" = "en", options: Parameters<typeof renderComponent>[2] = {}) =>
  renderComponent(fixtureSource(id), <KilnBlock />, { locale, ...options });

/** The Shared Kiln fixtures for 2, 3 and 4 players. */
const BY_PLAYERS: ReadonlyArray<readonly [string, PlayerCount]> = [
  ["m5_two_player_board_2p", 2],
  ["m3_heat_marker_step_3p", 3],
  ["m2_commission_market_look_r3_4p", 4],
];

/** The `data-space` values inside one row (`data-zone`) of the rendered kiln, in order. */
function rowSpaces(html: string, zone: KilnZone): string[] {
  const at = html.indexOf(`data-zone="${zone}"`);
  if (at < 0) return [];
  const row = elementAt(html.slice(html.lastIndexOf("<div", at)), /<div/);
  return [...row.matchAll(/data-space="(\w+)"/g)].map((match) => match[1] ?? "");
}

describe("Shared Kiln layout (D8)", () => {
  it("puts Low at the top, Middle in the middle and High by the firebox, for 2, 3 and 4 players", () => {
    for (const [id] of BY_PLAYERS) {
      const html = render(id);
      const low = html.indexOf('data-zone="low"');
      const middle = html.indexOf('data-zone="middle"');
      const high = html.indexOf('data-zone="high"');
      const firebox = html.indexOf('class="firebox"');
      expect(low).toBeGreaterThan(-1);
      expect(low).toBeLessThan(middle);
      expect(middle).toBeLessThan(high);
      expect(high).toBeLessThan(firebox);
      // Centring is CSS (one column width, rows centred): no spacer elements.
      expect(html).not.toContain("kiln-spacer");
    }
  });

  it("draws only the engine's active spaces for 2, 3 and 4 players; a covered space is not shown at all", () => {
    for (const [id, players] of BY_PLAYERS) {
      const view = fixture(id).playerView;
      expect(view.game.playerCount).toBe(players);
      const layout = kilnLayout(view);
      expect(layout.activeSpaceIds).toEqual(activeKilnSpaces(players));
      for (const locale of ["en", "zh-CN"] as const) {
        const html = render(id, locale);
        const shown = [...html.matchAll(/data-space="(\w+)"/g)].map((match) => match[1]);
        // D8 order on screen (Low first); the same set as the engine's active spaces.
        expect([...shown].sort(), `${id} ${locale}`).toEqual([...layout.activeSpaceIds].sort());
        for (const spaceId of layout.coveredSpaceIds) expect(html).not.toContain(`data-space="${spaceId}"`);
        expect(html).not.toContain("data-covered");
        // Rulebook text in a rules-details panel may name covered spaces; the kiln itself does not.
        expect(perceivable(withoutRulesPanels(html))).not.toMatch(/covered|停用|封|锁/i);
      }
    }
  });

  it("reflows each row to its active spaces, every space one column of the widest row", () => {
    // The owner's review (2026-10-17): 4 players 2 Low / 3 Middle / 3 High, 3 players 2 / 2 / 2,
    // 2 players (2-1-1 cover) Low 1 / Middle 1 / High 2 — the engine's `activeKilnSpaces`.
    const expected: Readonly<Record<PlayerCount, Readonly<Record<KilnZone, number>>>> = {
      2: { low: 1, middle: 1, high: 2 },
      3: { low: 2, middle: 2, high: 2 },
      4: { low: 2, middle: 3, high: 3 },
    };
    for (const [id, players] of BY_PLAYERS) {
      const html = render(id);
      const active = activeKilnSpaces(players);
      const counts = { low: 0, middle: 0, high: 0 } as Record<KilnZone, number>;
      for (const zone of ["low", "middle", "high"] as const) {
        const inRow = active.filter((spaceId) => zoneOf(spaceId) === zone);
        expect(rowSpaces(html, zone), `${id} ${zone}`).toEqual(inRow);
        counts[zone] = inRow.length;
      }
      expect(counts, id).toEqual(expected[players]);
      expect(html).toContain(`--kiln-cols:${String(Math.max(...Object.values(counts)))}`);
    }
  });

  it("labels rows and spaces in both languages", () => {
    const en = render("m3_heat_marker_step_3p");
    expect(en).toContain('aria-label="Low zone, modifier −1"');
    expect(en).toContain('aria-label="High zone, modifier +1"');
    expect(en).toContain("Shared Kiln · 3P");
    const zh = render("m3_heat_marker_step_3p", "zh-CN");
    expect(zh).toContain('aria-label="低温区，温区修正−1"');
    expect(zh).toContain("共窑 · 3人");
    expect(zh).toContain("高温区1");
  });
});

describe("ceramics, markers and tiles", () => {
  it("shows face-down and turned Heat markers in words, never a heat value", () => {
    const step5 = perceivable(render("m3_heat_marker_step_3p"));
    expect(step5).toContain("Heat marker, face down");
    const step10 = perceivable(render("m4_after_quality_3p"));
    expect(step10).toContain("Heat marker −1");
    expect(step10).toContain("Kiln Master marker −1");
    // Outside the rules-details panels (rulebook text may name Actual Heat), no heat word or value.
    for (const id of ["m3_heat_marker_step_3p", "m4_after_quality_3p", "m18_jun_second_firing"]) {
      const text = perceivable(withoutRulesPanels(render(id)));
      expect(text).not.toMatch(/Actual Heat|Heat Difference|odds|chance|probability|preview|expected|cards left|left in the deck/i);
    }
  });

  it("shows the Quality each ceramic recorded in this firing, as a word", () => {
    const html = render("m4_after_quality_3p");
    const text = perceivable(html);
    expect(text).toContain("Masterpiece");
    expect(text).toContain("Fine");
    expect(text).toContain("Standard");
    expect(perceivable(render("m4_after_quality_3p", "zh-CN"))).toMatch(/臻品|上品|良品/);
    // Before Quality there is none.
    expect(render("m3_heat_marker_step_3p")).not.toMatch(/data-quality=/);
  });

  it("stacks two ceramics in one space with the Inverted Firing tile", () => {
    const html = render("m9_contributions_step1_3p");
    const cell = spaceCell(html, "middle_1");
    expect(cell).toContain("2 stacked");
    expect(cell).toContain('class="kstack"');
    expect(cell).toContain("Inverted Firing");
    expect(spaceCell(render("m9_contributions_step1_3p", "zh-CN"), "middle_1")).toContain("2件叠烧");
  });

  it("shows Kiln Furniture under its ceramic, with its owner, and the space's modifier becomes the tile's", () => {
    const html = render("m3_heat_marker_step_3p");
    const cell = spaceCell(html, "low_2");
    expect(cell).toContain("Kiln Furniture −1 · Lin");
    expect(cell).toContain('aria-label="Low 2, Kiln Furniture modifier −1"');
    const m9 = spaceCell(render("m9_contributions_step1_3p"), "low_1");
    expect(m9).toContain('aria-label="Low 1, Kiln Furniture modifier +1"');
    expect(m9).toMatch(/class="ksp-mod num">\+1</);
  });

  it("shows the Setter's Mark tile on its space in its owner's colour", () => {
    const view = fixture("m10b_setters_mark_on_space").playerView;
    const owner = view.game.players[view.game.sharedKiln.spaces.high_1.setterMarkOwnerId ?? ""]?.displayName ?? "";
    const cell = spaceCell(render("m10b_setters_mark_on_space"), "high_1");
    expect(cell).toContain("ktile--setter");
    expect(perceivable(cell)).toContain(`Setter's Mark · ${owner}`);
  });

  it("opens each tile's rules details: only the full rule and clarifications, with no card text, card facts or source labels (D10)", () => {
    const furniture = spaceCell(render("m3_heat_marker_step_3p"), "low_2");
    tagged(furniture, techRulesCheck("T15", "en"));
    const setter = spaceCell(render("m10b_setters_mark_on_space"), "high_1");
    tagged(setter, techRulesCheck("T22", "en"));
    const zh = spaceCell(render("m3_heat_marker_step_3p", "zh-CN"), "low_2");
    tagged(zh, techRulesCheck("T15", "zh-CN"));
    // The panel is a PieceDetail disclosure: a button with aria-expanded and a hidden panel.
    expect(furniture).toMatch(/<button type="button" class="kit-detail-trigger" aria-expanded="false" aria-controls="[^"]+"/);
    // The tile names its owner; the panel adds no card facts, owner or this-round rows (owner review, 2026-10-17).
    expect(perceivable(furniture)).toContain("Kiln Furniture −1 · Lin");
    for (const [html, techId, locale] of [[furniture, "T15", "en"], [setter, "T22", "en"], [zh, "T15", "zh-CN"]] as const) {
      const t = createTranslator(locale, { strict: true });
      const body = panel(html, t("rules.label", { name: techText(techId, locale).name }));
      const headings = [...body.matchAll(/<p class="rd-h">([^<]*)<\/p>/g)].map((match) => match[1]);
      expect(headings).toEqual([t("rules.fullRule"), ...(TECHS[techId].clarifications.length > 0 ? [t("rules.clarifications")] : [])]);
      expect(body).not.toMatch(/<dl\b|<dt>/);
      expect(body).not.toContain("rd-short");
    }
    const panelText = textOf(panel(furniture, "Full rules: Kiln Furniture"));
    expect(panelText).not.toMatch(/\bLin\b|Ready|Used this round|1 VP when gained|Your second Glaze & Load space/);
    expect(perceivable(furniture)).not.toMatch(/\b(un)?lock/i);
  });

  it("describes ceramics in words with no internal ID (D9)", () => {
    for (const id of ["m3_heat_marker_step_3p", "m4_after_quality_3p", "m9_contributions_step1_3p", "m14_salvage", "m18_jun_second_firing"]) {
      for (const locale of ["en", "zh-CN"] as const) {
        const text = perceivable(render(id, locale));
        expect(text).not.toMatch(/\bc\d+\b/);
        expect(text).not.toMatch(/\bp\d+\b/);
      }
    }
  });
});

describe("Imperial Kilns", () => {
  it("shows each gained Imperial Kiln with its ceramic and public modifier, and who has none yet", () => {
    const view = fixture("m3_heat_marker_step_3p").playerView;
    const html = render("m3_heat_marker_step_3p");
    const zhao = view.game.players["p2"]!;
    expect(html).toContain('data-webgl-mount="imperial-kiln" data-player-id="p2"');
    const ceramic = Object.values(view.game.ceramics).find((c) => c.stage === "loaded" && c.placement.kiln === "imperial");
    expect(ceramic).toBeDefined();
    const modifier = ceramic?.stage === "loaded" && ceramic.placement.kiln === "imperial" ? ceramic.placement.imperialModifier : null;
    const signedValue = modifier === null ? "" : modifier > 0 ? `+${String(modifier)}` : modifier < 0 ? `−${String(-modifier)}` : "0";
    expect(html).toContain(`aria-label="Imperial modifier ${signedValue}"`);
    expect(html).toContain(`imp-mod imp-mod--on`);
    expect(html).toMatch(/: none yet \(Recognition 2\)/);
    expect(html).toContain("Court-fired: Kiln Die + Fire + modifier + marker; ignores Contributions.");
    // The viewer (Zhao) reads "Your Imperial Kiln"; another player's tile is named after them.
    expect(view.viewerId).toBe("p2");
    expect(zhao.displayName).not.toBe("");
    expect(html).toContain('aria-label="Your Imperial Kiln"');
    // The heading opens the Imperial Gift milestone's rules details.
    expect(html).toContain("Imperial Gift");
    const zh = render("m3_heat_marker_step_3p", "zh-CN");
    expect(zh).toContain("御窑修正");
    expect(zh).toMatch(/：尚无（御府声望2获得）/);
  });

  it("shows 'empty this round' for an Imperial Kiln without a ceramic", () => {
    const entries = ["m14_salvage", "m4_after_quality_3p", "t-imperial-only-firing"].map((id) => render(id));
    expect(entries.some((html) => html.includes('class="imp-mods"'))).toBe(true);
  });
});

// ── Table selection: kiln targets and pending chips ─────────────────────────────────────────

describe("kiln targets and pending chips through TableSelection (§3.5)", () => {
  it("renders the Setter's Mark spaces as toggle buttons from a seeded draft", () => {
    const id = "w-setters-mark-window";
    const offered = settersMarkOptions(fixture(id).playerView);
    expect(offered.length).toBeGreaterThan(1);
    const chosen = offered[0] as KilnSpaceId;
    const html = render(id, "en", { registry: TOY_WINDOWS, draft: { spaceId: chosen } });
    for (const spaceId of offered) {
      const cell = spaceCell(html, spaceId);
      expect(cell.startsWith("<button")).toBe(true);
      expect(cell).toContain(`aria-pressed="${String(spaceId === chosen)}"`);
      expect(perceivable(cell)).toMatch(/Place Setter's Mark on (High|Middle|Low) \d/);
    }
    // Spaces the window does not offer stay plain.
    const plain = [...html.matchAll(/<div class="ksp" role="group"[^>]*data-space="(\w+)"/g)].map((match) => match[1]);
    for (const spaceId of plain) expect(offered).not.toContain(spaceId);
    // Without a table adapter, nothing is a target.
    const { table: _table, ...withoutTable } = TOY_WINDOWS.setters_mark;
    void _table;
    const inert = render(id, "en", { registry: { ...TOY_WINDOWS, setters_mark: withoutTable as WindowRegistry["setters_mark"] }, draft: { spaceId: chosen } });
    expect(inert).not.toContain('data-act="kiln-space"');
  });

  it("shows ceramics the draft would load as dashed pending chips in the space and the Imperial Kiln", () => {
    const id = "t-glaze-load-imperial-furniture";
    const view = fixture(id).playerView;
    const viewer = view.viewerId!;
    const shaped = Object.values(view.game.ceramics).filter((ceramic) => ceramic.ownerId === viewer && ceramic.stage === "shaped");
    expect(shaped.length).toBeGreaterThan(0);
    const target = kilnLayout(view).emptyActiveSpaceIds[0] as KilnSpaceId;
    const loads: Array<{ ceramicId: CeramicId; glaze: "celadon" | "white"; at: KilnSpaceId | "imperial" }> = [
      { ceramicId: shaped[0]!.id, glaze: "celadon", at: target },
      ...(shaped[1] === undefined ? [] : [{ ceramicId: shaped[1].id, glaze: "white" as const, at: "imperial" as const }]),
    ];
    const registry: WindowRegistry = {
      ...TOY_WINDOWS,
      work: defineWindow({
        kind: "work",
        Component: () => null,
        draft: TOY_WINDOWS.setters_mark.draft as never,
        title: () => msg("common.verb.decide"),
        table: {
          select: () => tableSelection({ kilnTargets: new Map([[target, { pressed: true }]]), pendingCeramics: loads }),
          act: () => null,
        },
      }) as WindowRegistry["work"],
    };
    const html = render(id, "en", { registry });
    const cell = spaceCell(html, target);
    expect(cell).toContain('aria-pressed="true"');
    expect(cell).toMatch(/aria-label="Load into (High|Middle|Low) \d"/);
    expect(cell).toContain('class="kpend"');
    expect(perceivable(cell)).toContain("(pending)");
    if (loads.length > 1) {
      const imperial = html.slice(html.indexOf(`data-player-id="${viewer}"`));
      expect(imperial).toContain('class="kpend"');
    }
    const zh = render(id, "zh-CN", { registry });
    expect(perceivable(spaceCell(zh, target))).toContain("（待确认）");
  });
});
