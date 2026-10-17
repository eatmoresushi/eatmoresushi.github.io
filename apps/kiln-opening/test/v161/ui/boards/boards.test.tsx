/**
 * Kiln Player Boards (B2; UI_V1.6.1_ARCHITECTURE §9.2 `boards/`): the D1 board area, a full
 * board, the D7 personal spaces, Tech slots, workers, ceramics and the marker line.
 */
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { KILNS, shortTextSegments } from "../../../../src/game/index.ts";
import { BoardArea } from "../../../../src/app/boards/BoardArea.tsx";
import { CeramicsRow } from "../../../../src/app/boards/CeramicsRow.tsx";
import { KilnTradition, MarkerLine } from "../../../../src/app/boards/KilnTradition.tsx";
import { PersonalSpaces } from "../../../../src/app/boards/PersonalSpaces.tsx";
import { PlayerBoard } from "../../../../src/app/boards/PlayerBoard.tsx";
import { TechSlots } from "../../../../src/app/boards/TechSlots.tsx";
import { WorkersRow } from "../../../../src/app/boards/WorkersRow.tsx";
import { kilnShortName, techName, techText } from "../../../../src/app/i18n/content.ts";
import { ruleErrorText } from "../../../../src/app/i18n/errors.ts";
import { FixtureGameSource } from "../../../../src/app/session/fixtureSource.ts";
import { gameModelOf } from "../../../../src/app/state/model.ts";
import { allFixtures, fixture, fixtureSource, secretIds } from "../support/fixtures.ts";
import { renderComponent } from "../support/render.tsx";
import type { RenderOptions } from "../support/render.tsx";
import { textOf, visibleText } from "../table/markup.ts";
import { TABLE_WINDOWS, withModelCeramics } from "../table/tableWindows.tsx";

function render(id: string, element: ReactElement, options: RenderOptions = {}): string {
  return renderComponent(fixtureSource(id), element, { registry: TABLE_WINDOWS, ...options });
}

const M1 = "m1_work_phase_r2_3p";

/** React's text escaping, for comparing markup with content strings. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

describe("D7: personal spaces are added by learning a Tech (m1)", () => {
  it("says which Tech added the second Form & Decorate space, and how to add the Glaze & Load one", () => {
    const viewer = fixture(M1).viewerId;
    const en = render(M1, <PersonalSpaces playerId={viewer} />);
    expect(en).toContain(`Added by <strong>${techName("T17", "en")}</strong>`);
    expect(textOf(en)).toContain("Added by Prepared Clay");
    const hint = ruleErrorText({ code: "PERSONAL_SPACE_LOCKED", details: { locationId: "glaze_load" } }, "en");
    expect(hint).toBe("Learn a Glazing & Loading Tech to add this space.");
    expect(textOf(en)).toContain(hint);
    expect(textOf(en)).not.toMatch(/\b(un)?lock/i);

    const zh = render(M1, <PersonalSpaces playerId={viewer} />, { locale: "zh-CN" });
    expect(zh).toContain("由「<strong>练泥</strong>」添设");
    expect(textOf(zh)).toContain("习得釉作技艺即添此工位");
    expect(textOf(zh)).not.toMatch(/锁|封条|启封|封存|上锁|解锁/);
  });

  it("marks the next free space when the draft chooses a personal location, with Place shortcuts", () => {
    const viewer = fixture(M1).viewerId;
    const plain = render(M1, <PersonalSpaces playerId={viewer} />);
    expect(plain).toContain('aria-label="Place Shifu at Glaze &amp; Load"');
    expect(plain).not.toContain("psp-slot--pending");
    const seeded = render(M1, <PersonalSpaces playerId={viewer} />, { draft: { locationId: "glaze_load", workerKey: "shifu" } });
    expect(seeded).toContain("psp-slot--pending");
    expect(seeded).toMatch(/aria-pressed="true"[^>]*aria-label="Place Shifu at Glaze &amp; Load"/);
    // Another player's board never offers the viewer's shortcuts.
    const other = render(M1, <PersonalSpaces playerId="p1" />);
    expect(other).not.toContain('data-act="place"');
  });
});

describe("D1 board tabs", () => {
  it("shows the viewer's board under Your workshop by default, with one tab per other player (m1)", () => {
    const html = render(M1, <BoardArea />);
    expect(html).toContain('role="tablist" aria-label="Kiln Player Boards"');
    const tabs = [...html.matchAll(/role="tab"[^>]*aria-selected="(true|false)"[^>]*>(.*?)<\/button>/g)].map((match) => ({ selected: match[1] === "true", text: textOf(match[2] ?? "") }));
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toEqual({ selected: true, text: "Your workshop" });
    const game = fixture(M1).playerView.game;
    expect(tabs.slice(1).map((tab) => tab.text)).toEqual(
      ["p1", "p2"].map((id) => `${game.players[id]!.displayName} · ${kilnShortName(game.players[id]!.kilnId!, "en")}`),
    );
    expect(html).toContain('role="tabpanel"');
    expect(html).toMatch(/role="tabpanel"[^>]*>[\s\S]*data-player-id="p3"/);
    expect(textOf(html)).toContain("Wen (you)");
  });

  it("opens another player's board from UI state (the seat chips use the same state)", () => {
    const html = render(M1, <BoardArea />, { ui: { boardShown: "p1" } });
    expect(html).toMatch(/aria-selected="true"[^>]*>Lin · /);
    expect(html).toMatch(/<article class="kpb"[^>]*data-player-id="p1"/);
    expect(textOf(html)).toContain("Public information");
    // An unknown board falls back to the viewer's own.
    expect(render(M1, <BoardArea />, { ui: { boardShown: "nobody" } })).toMatch(/<article class="kpb"[^>]*data-player-id="p3"/);
  });

  it("names the tabs in Chinese from content", () => {
    const html = render(M1, <BoardArea />, { locale: "zh-CN" });
    expect(html).toContain('aria-label="窑口板"');
    expect(textOf(html)).toContain("你的作坊");
    expect(textOf(html)).toContain("Lin · 钧窑");
  });
});

describe("PlayerBoard", () => {
  it("shows another player's hand as card backs and a count only (m2)", () => {
    const id = "m2_commission_market_look_r3_4p";
    const game = fixture(id).playerView.game;
    for (const playerId of game.playerOrder) {
      if (playerId === fixture(id).viewerId) continue;
      const html = render(id, <PlayerBoard playerId={playerId} />);
      expect(visibleText(html)).toContain(`${game.counts.orderHands[playerId] ?? 0} · contents hidden`);
      expect(html).not.toContain("Only you can see");
      for (const secret of secretIds(id)) expect(html).not.toMatch(new RegExp(`\\b${secret}\\b`));
    }
    const own = render(id, <PlayerBoard playerId={fixture(id).viewerId} />);
    expect(textOf(own)).toContain("Only you can see");
  });

  it("shows the recorded score, Recognition, First Player and completed Orders (m8)", () => {
    const id = "m8_final_results_3p";
    const game = fixture(id).playerView.game;
    const playerId = game.playerOrder.find((candidate) => game.players[candidate]!.completedOrders.length > 0)!;
    const html = render(id, <PlayerBoard playerId={playerId} />);
    const player = game.players[playerId]!;
    const recorded = player.score.orders + player.score.kilnAbilities + player.score.recognitionOverflow + player.score.imperialAudience + player.score.techs;
    expect(html).toContain(`<strong>${recorded}</strong> VP`);
    expect(textOf(html)).toContain(`Recognition ${player.imperial.recognition}/4`);
    for (const record of player.completedOrders) expect(textOf(html)).toContain(`${record.orderId} · ${record.vp} VP`);
    const first = render(id, <PlayerBoard playerId={game.firstPlayerId} />);
    expect(textOf(first)).toContain("First Player");
  });
});

describe("KilnTradition and the marker line", () => {
  it("shows the Kiln, its ability, Ready and the short text with its timing in bold (m1)", () => {
    const html = render(M1, <KilnTradition playerId="p3" />);
    expect(textOf(html)).toContain("Ge Kiln · Crackle Mastery");
    expect(textOf(html)).toContain("Ready");
    expect(html).toContain("<strong>Once per round, after Quality is assigned:</strong>");
    expect(html).toContain("<strong>Orders:</strong>");
    expect(KILNS.GE.shortText).toContain("Orders:");
    const zh = render(M1, <KilnTradition playerId="p3" />, { locale: "zh-CN" });
    expect(zh).toContain("<strong>每轮一次，定品后：</strong>");
    expect(zh).toContain("<strong>完成委托时：</strong>");
  });

  it("says where the Heat marker is, face down or turned, in words (D9)", () => {
    const supply = textOf(render(M1, <MarkerLine playerId="p3" />));
    expect(supply).toContain("Heat marker in supply");
    expect(supply).toContain("Imperial Kiln: not yet gained");
    const id = "m3_heat_marker_step_3p";
    const game = fixture(id).playerView.game;
    const marked = Object.values(game.ceramics).find((ceramic) => ceramic.stage === "loaded" && ceramic.heatMarker !== null && ceramic.heatMarker.source === "own");
    expect(marked).toBeDefined();
    const html = render(id, <MarkerLine playerId={marked!.ownerId} />);
    expect(textOf(html)).toMatch(/Heat marker (\(face down\)|[+−]1) on /);
    expect(textOf(html)).not.toMatch(/\bc\d+\b/);
  });
});

describe("TechSlots, WorkersRow and CeramicsRow", () => {
  it("shows the owned Tech per discipline with its state, and empty slots (m1)", () => {
    const html = render(M1, <TechSlots playerId="p3" />);
    expect(textOf(html)).toContain("Form & Decorate Prepared Clay Ready");
    expect(textOf(html)).toContain("Glazing & Loading: empty");
    expect(textOf(html)).toContain("Firing: empty");
  });

  it("prints each owned Tech's short text, timing clause in bold, and opens no rules details (owner review, 2026-10-17)", () => {
    const html = render(M1, <TechSlots playerId="p3" />);
    expect(textOf(html)).toContain(`Prepared Clay Ready ${textOf(techText("T17", "en").short)}`);
    const bold = shortTextSegments(techText("T17", "en").short).filter((segment) => segment.emphasis);
    expect(bold.length).toBeGreaterThan(0);
    for (const segment of bold) expect(html).toContain(`<strong>${escapeHtml(segment.text)}</strong>`);
    expect(html).toContain('class="tech-short"');
    // Not a control: no rules-details trigger or panel, no button at all.
    expect(html).not.toContain("<button");
    expect(html).not.toContain("kit-detail");
    const zh = render(M1, <TechSlots playerId="p3" />, { locale: "zh-CN" });
    for (const segment of shortTextSegments(techText("T17", "zh-CN").short).filter((part) => part.emphasis)) expect(zh).toContain(`<strong>${escapeHtml(segment.text)}</strong>`);
    expect(textOf(zh)).toContain("可用");
  });

  it("keeps every owned Tech's state visible on its tile: Ready, Used this round or Ongoing", () => {
    const seen = new Set<string>();
    for (const entry of allFixtures()) {
      const model = gameModelOf(entry.playerView, []);
      for (const summary of model.players) {
        if (summary.techs.length === 0) continue;
        const html = renderComponent(new FixtureGameSource(entry), <TechSlots playerId={summary.playerId} />, { registry: TABLE_WINDOWS });
        for (const tech of summary.techs) {
          const start = html.indexOf(`data-tech-id="${tech.techId}"`);
          expect(start, `${entry.id} ${tech.techId}`).toBeGreaterThan(0);
          const tile = html.slice(start, html.indexOf("</li>", start));
          const state = !tech.oncePerRound ? "Ongoing" : tech.ready ? "Ready" : "Used this round";
          const tone = !tech.oncePerRound ? "kit-chip--neutral" : tech.ready ? "kit-chip--ok" : "kit-chip--used";
          expect(tile, `${entry.id} ${tech.techId}`).toContain(`<span class="kit-chip ${tone}">${state}</span>`);
          expect(textOf(tile)).toContain(textOf(techText(tech.techId, "en").short));
          expect(tile).not.toContain("kit-detail");
          seen.add(state);
        }
      }
    }
    expect([...seen].sort()).toEqual(["Ongoing", "Ready", "Used this round"]);
  });

  it("names placed workers with where they stand (m5)", () => {
    const html = render("m5_two_player_board_2p", <WorkersRow playerId="p1" />);
    expect(html).toContain('aria-label="Your Shifu at Canal Wharf"');
    expect(html).toContain('aria-label="Your Apprentice at Materials Yard"');
    expect(html).toContain('aria-label="Your Apprentice at Glaze &amp; Load"');
    expect(html).toContain('aria-label="Your Apprentice"');
    expect((html.match(/wk--dim/g) ?? []).length).toBe(3);
    const other = render("m5_two_player_board_2p", <WorkersRow playerId="p2" />);
    expect(other).toContain('aria-label="Zhao’s Apprentice at Magistrate&#x27;s Hall"');
    expect(other).not.toMatch(/\bp\d:(shifu|apprentice)/);
  });

  it("draws Shaped and Finished ceramics in words from model.ceramics (CR B2-1)", () => {
    expect(textOf(render(M1, <CeramicsRow playerId="p3" />))).not.toContain("Shaped 2 ceramics");
    const html = renderComponent(withModelCeramics(fixtureSource(M1)), <CeramicsRow playerId="p3" />, { registry: TABLE_WINDOWS });
    expect((html.match(/data-motion="ceramic"/g) ?? []).length).toBe(2);
    expect(textOf(html)).toContain("Brush Washer, Plain");
    expect(textOf(html)).toContain("Brush Washer, Impressed");
    expect(textOf(html)).not.toMatch(/\bc\d+\b/);
    const zh = renderComponent(withModelCeramics(fixtureSource(M1)), <CeramicsRow playerId="p3" />, { registry: TABLE_WINDOWS, locale: "zh-CN" });
    expect(textOf(zh)).toContain("笔洗 · 印花");
  });
});
