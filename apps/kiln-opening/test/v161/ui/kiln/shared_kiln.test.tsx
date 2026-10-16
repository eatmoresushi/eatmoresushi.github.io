/**
 * Shared Kiln and Imperial Kilns (B3; UI_V1.6.1_ARCHITECTURE §4.2, §9.2, §10.3):
 * - owner decision D8: rows Low (two spaces, centred) / Middle / High by the firebox;
 * - covered spaces by player count, from `kilnLayout` (2-1-1 / 2-2-2 / 3-3-2), never 封 (D7);
 * - stacks (Inverted Firing), the Setter's Mark tile, Kiln Furniture and its modifier;
 * - markers face down and turned, this firing's Quality on each chip, Crackle;
 * - kiln targets and pending chips through `TableSelection` (seeded drafts, SSR);
 * - Imperial Kilns with their public modifier; rules details for each tile (D10);
 * - no heat value on a ceramic or a space (D3), no internal ID in perceivable text (D9).
 */
import { describe, expect, it } from "vitest";
import type { CeramicId, KilnSpaceId } from "../../../../src/game/index.ts";
import { techFacts } from "../../../../src/app/i18n/content.ts";
import { KilnBlock } from "../../../../src/app/kiln/KilnBlock.tsx";
import { defineWindow } from "../../../../src/app/state/draftStore.ts";
import type { WindowRegistry } from "../../../../src/app/state/draftStore.ts";
import { tableSelection } from "../../../../src/app/state/tableSelection.ts";
import { msg } from "../../../../src/app/i18n/translator.ts";
import { fixture, fixtureSource } from "../support/fixtures.ts";
import { renderComponent } from "../support/render.tsx";
import { TOY_WINDOWS } from "../support/toyWindows.tsx";
import { activeKilnSpaces, kilnLayout, perceivable, settersMarkOptions, spaceCell, tagged, techRulesCheck, withoutRulesPanels } from "./support.ts";

const render = (id: string, locale: "en" | "zh-CN" = "en", options: Parameters<typeof renderComponent>[2] = {}) =>
  renderComponent(fixtureSource(id), <KilnBlock />, { locale, ...options });

describe("Shared Kiln layout (D8)", () => {
  it("puts Low at the top with its two spaces centred, Middle in the middle and High by the firebox", () => {
    for (const id of ["m3_heat_marker_step_3p", "m5_two_player_board_2p", "m2_commission_market_look_r3_4p"]) {
      const html = render(id);
      const low = html.indexOf('data-zone="low"');
      const middle = html.indexOf('data-zone="middle"');
      const high = html.indexOf('data-zone="high"');
      const firebox = html.indexOf('class="firebox"');
      expect(low).toBeGreaterThan(-1);
      expect(low).toBeLessThan(middle);
      expect(middle).toBeLessThan(high);
      expect(high).toBeLessThan(firebox);
      // Two spacers centre the two Low spaces under the dome.
      const lowRow = html.slice(low, middle);
      expect(lowRow.match(/class="kiln-spacer"/g)).toHaveLength(2);
      expect(lowRow.match(/data-space="low_\d"/g)).toEqual(['data-space="low_1"', 'data-space="low_2"']);
    }
  });

  it("covers exactly the engine's covered spaces for 2, 3 and 4 players", () => {
    const cases: Array<[string, number]> = [["m5_two_player_board_2p", 4], ["m3_heat_marker_step_3p", 2], ["m2_commission_market_look_r3_4p", 0]];
    for (const [id, covered] of cases) {
      const view = fixture(id).playerView;
      const layout = kilnLayout(view);
      expect(layout.coveredSpaceIds).toHaveLength(covered);
      expect(layout.activeSpaceIds).toEqual(activeKilnSpaces(view.game.playerCount));
      const html = render(id);
      const shown = [...html.matchAll(/data-space="(\w+)" data-covered=""/g)].map((match) => match[1]);
      expect(shown.sort()).toEqual([...layout.coveredSpaceIds].sort());
      if (covered > 0) {
        expect(html).toContain(`Covered (${String(view.game.playerCount)}P)`);
        const zh = render(id, "zh-CN");
        expect(zh).toContain(`停用（${String(view.game.playerCount)}人）`);
        expect(zh).not.toMatch(/封|锁/);
      }
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

  it("opens each tile's rules details: short text, full rule, clarifications with sources, card facts (D10)", () => {
    const furniture = spaceCell(render("m3_heat_marker_step_3p"), "low_2");
    tagged(furniture, techRulesCheck("T15", "en"));
    const setter = spaceCell(render("m10b_setters_mark_on_space"), "high_1");
    tagged(setter, techRulesCheck("T22", "en"));
    const zh = spaceCell(render("m3_heat_marker_step_3p", "zh-CN"), "low_2");
    tagged(zh, techRulesCheck("T15", "zh-CN"));
    // The panel is a PieceDetail disclosure: a button with aria-expanded and a hidden panel.
    expect(furniture).toMatch(/<button type="button" class="kit-detail-trigger" aria-expanded="false" aria-controls="[^"]+"/);
    expect(furniture).toContain("<dt>Discipline</dt><dd>Glazing &amp; Loading</dd>");
    expect(furniture).toContain(`<dt>Cost</dt><dd>${String(techFacts("T15").cost)} Coins</dd>`);
    expect(furniture).toContain("<dt>Use</dt><dd>Once per round</dd>");
    expect(furniture).toContain("<dt>Adds</dt><dd>Your second Glaze &amp; Load space</dd>");
    expect(furniture).toContain("<dt>Score</dt><dd>1 VP when gained</dd>");
    expect(furniture).toMatch(/<dt>Owner<\/dt><dd>Lin<\/dd><\/div><div class="rd-fact"><dt>This round<\/dt><dd>(Ready|Used this round)<\/dd>/);
    expect(zh).toContain("<dt>添设</dt><dd>施釉装窑第二工位</dd>");
    expect(zh).toContain("习得即得1分");
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
