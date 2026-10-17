/**
 * Rules details (owner decision D10, UI architecture K15): every Tech tile, Kiln Player Board,
 * location, Order card and Recognition milestone opens a panel with its short text (timing clause
 * in bold), its full rule word for word, the clarifications for that component only with their
 * source labels, and its card facts. No advice, odds or previews.
 *
 * One shared panel (`src/app/rules/RulesDetail.tsx`, B6) serves the table, the boards, the kiln,
 * the firing stage, the results and every decision form; its content accessors live in
 * `i18n/content.ts` (change requests CR B2-4, B3-2, B4-1, B5-1).
 */
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import {
  IMPERIAL_TRACK,
  KILNS,
  LOCATIONS,
  ORDERS,
  ORDER_CLARIFICATIONS,
  TECHS,
  TECH_IDS,
} from "../../../../src/game/index.ts";
import type { ClarificationDefinition, TechId } from "../../../../src/game/index.ts";
import { KilnTradition } from "../../../../src/app/boards/KilnTradition.tsx";
import { PlayerBoard } from "../../../../src/app/boards/PlayerBoard.tsx";
import { TechSlots } from "../../../../src/app/boards/TechSlots.tsx";
import {
  IMPERIAL_KILN_RECOGNITION,
  IMPERIAL_PRIORITY_RECOGNITION,
  RECOGNITION_MAX,
  kilnFacts,
  kilnText,
  locationFacts,
  orderFacts,
  overflowClarifications,
  rulesClarifications,
  techFacts,
  techText,
} from "../../../../src/app/i18n/content.ts";
import { createTranslator } from "../../../../src/app/i18n/translator.ts";
import { CentralBoard } from "../../../../src/app/table/CentralBoard.tsx";
import { OrderDisplay } from "../../../../src/app/table/OrderDisplay.tsx";
import { RecognitionTrack } from "../../../../src/app/table/RecognitionTrack.tsx";
import { TechCard } from "../../../../src/app/table/TechCard.tsx";
import { RulesDetail } from "../../../../src/app/rules/RulesDetail.tsx";
import { fixture, fixtureSource } from "../support/fixtures.ts";
import { renderComponent, renderScreen as renderScreenMarkup } from "../support/render.tsx";
import { decode, panel, panels, textOf } from "../table/markup.ts";

const EN = createTranslator("en", { strict: true });
const ZH = createTranslator("zh-CN", { strict: true });
const M1 = "m1_work_phase_r2_3p";

function render(id: string, element: ReactElement, locale: "en" | "zh-CN" = "en"): string {
  return renderComponent(fixtureSource(id), element, { locale });
}

/** Every clarification of a component is in the panel, as plain text: no source labels (owner review, 2026-10-17). */
function expectClarifications(html: string, items: readonly ClarificationDefinition[], locale: "en" | "zh-CN") {
  const text = textOf(html);
  for (const item of items) expect(text).toContain(decode(locale === "en" ? item.en : item.zh));
  expect(text).not.toMatch(/Source:|出处：/);
}

/** The panel shows only the full rule and the clarifications: no card text, card facts, owner or this-round rows. */
function expectOnlyRuleAndClarifications(html: string) {
  const text = textOf(html);
  expect(text).not.toMatch(/Card text|Card facts|牌面文字|牌面信息|This round|本轮状态|Owner|Here now/);
}

describe("content accessors (i18n/content.ts)", () => {
  it("returns each component's own clarifications and printed facts", () => {
    expect(rulesClarifications({ kind: "tech", id: "T17" }, "en").map((item) => item.text)).toEqual(TECHS.T17.clarifications.map((item) => item.en));
    expect(rulesClarifications({ kind: "kiln", id: "RU" }, "zh-CN").map((item) => item.text)).toEqual(KILNS.RU.clarifications.map((item) => item.zh));
    expect(rulesClarifications({ kind: "recognition", space: 4 }, "en")).toHaveLength(
      IMPERIAL_TRACK.track[4]!.clarifications.length + IMPERIAL_TRACK.clarifications.imperial_overflow.length,
    );
    expect(rulesClarifications({ kind: "recognition", space: 0 }, "en")).toEqual([]);
    expect(rulesClarifications({ kind: "order", id: "S01" }, "en")).toHaveLength(ORDER_CLARIFICATIONS.starting.length);
    expect(rulesClarifications({ kind: "order", id: "O33" }, "en")).toHaveLength(ORDER_CLARIFICATIONS.main.length);
    for (const id of TECH_IDS) {
      expect(techFacts(id)).toEqual({ discipline: TECHS[id].discipline, cost: TECHS[id].cost, oncePerRound: TECHS[id].oncePerRound, adds: TECHS[id].unlocks });
    }
    for (const kiln of Object.values(KILNS)) expect(kilnFacts(kiln.id)).toEqual({ oncePerRound: kiln.oncePerRound });
    expect(orderFacts("O21")).toEqual({ deck: "main", kind: "crown", vp: ORDERS.O21.vp, coins: ORDERS.O21.coins, crowns: ORDERS.O21.crowns });
    expect(orderFacts("O01").kind).toBe("commercial");
    expect(orderFacts("S01").kind).toBe("starting");
  });
});

describe("Tech tiles (TechCard, Tech slots)", () => {
  it.each(TECH_IDS.map((id) => [id] as const))("%s: the full ability and the clarifications only, in EN and ZH", (techId: TechId) => {
    for (const locale of ["en", "zh-CN"] as const) {
      const t = locale === "en" ? EN : ZH;
      const html = render(M1, <TechCard techId={techId} />, locale);
      const text = techText(techId, locale);
      const body = panel(html, t("rules.label", { name: text.name }));
      // The trigger is the tile: a button that discloses the panel.
      expect(html).toMatch(/<button type="button" class="kit-detail-trigger" aria-expanded="false" aria-controls="[^"]+-panel">/);
      expect(textOf(body)).toContain(decode(text.ability));
      expectClarifications(body, TECHS[techId].clarifications, locale);
      expectOnlyRuleAndClarifications(body);
    }
  });

  it("shows no owner or this-round row, even for the viewer's own Tech", () => {
    const html = render(M1, <TechSlots playerId="p3" />);
    expectOnlyRuleAndClarifications(panel(html, "Full rules: Prepared Clay"));
  });
});

describe("Kiln Player Board, locations, Orders and milestones", () => {
  it("the Kiln Tradition opens the Kiln's rules details", () => {
    const html = render(M1, <KilnTradition playerId="p3" />);
    const text = kilnText("GE", "en");
    const body = panel(html, `Full rules: ${text.name} · ${text.abilityName}`);
    expect(textOf(body)).toContain(decode(text.ability));
    expectClarifications(body, KILNS.GE.clarifications, "en");
    expectOnlyRuleAndClarifications(body);
    const zh = render(M1, <KilnTradition playerId="p3" />, "zh-CN");
    expectClarifications(panel(zh, `完整规则：${kilnText("GE", "zh-CN").name} · ${kilnText("GE", "zh-CN").abilityName}`), KILNS.GE.clarifications, "zh-CN");
  });

  it("no action space opens rules details, on the table or on the board (owner review, 2026-10-17)", () => {
    const html = render(M1, <><CentralBoard /><PlayerBoard playerId="p3" /></>);
    for (const location of Object.values(LOCATIONS)) {
      const label = `Full rules: ${decode(location.name)}`;
      expect(panels(html).some((entry) => entry.label === label), location.name).toBe(false);
    }
    // A location's panel, wherever one is shown: both effects word for word and its clarifications only.
    for (const location of Object.values(LOCATIONS)) {
      const body = panel(render(M1, <RulesDetail subject={{ kind: "location", id: location.id }} />), `Full rules: ${decode(location.name)}`);
      expect(textOf(body)).toContain(decode(location.shifuText));
      expectClarifications(body, location.clarifications, "en");
    }
    expectOnlyRuleAndClarifications(panel(render(M1, <RulesDetail subject={{ kind: "location", id: "magistrates_hall" }} />), "Full rules: Magistrate's Hall"));
  });

  it("an Order card opens its rules details with the Main or Starting Order clarifications", () => {
    const html = render(M1, <><OrderDisplay /><PlayerBoard playerId="p3" /></>);
    const display = fixture(M1).playerView.game.market.display.filter((id): id is NonNullable<typeof id> => id !== null);
    for (const orderId of display) {
      const body = panel(html, `Full rules: Order ${orderId}`);
      expect(textOf(body)).toContain(decode(ORDERS[orderId].requirements));
      expectClarifications(body, ORDER_CLARIFICATIONS.main, "en");
      expect(textOf(body)).not.toMatch(/Reward \d+ VP/);
    }
  });

  it("each Recognition milestone opens its rules details; Recognition 4 includes the Crowns beyond 4", () => {
    const html = render("m5_two_player_board_2p", <RecognitionTrack />);
    const labels = panels(html).map((entry) => entry.label);
    expect(labels).toHaveLength(IMPERIAL_TRACK.track.length);
    const four = panel(html, `Full rules: Recognition 4 · ${IMPERIAL_TRACK.track[4]!.title}`);
    expectClarifications(four, [...IMPERIAL_TRACK.track[4]!.clarifications, ...IMPERIAL_TRACK.clarifications.imperial_overflow], "en");
    expectOnlyRuleAndClarifications(panel(html, `Full rules: Recognition 2 · ${IMPERIAL_TRACK.track[2]!.title}`));
  });

  it("never says odds, chance, probability, ladder, preview or cards left in any panel", () => {
    for (const locale of ["en", "zh-CN"] as const) {
      const html = render(M1, <><CentralBoard /><OrderDisplay /><RecognitionTrack /><PlayerBoard playerId="p3" /></>, locale);
      for (const entry of panels(html)) {
        expect(textOf(entry.html)).not.toMatch(/\b(odds|chance|probability|ladder|preview|expected)\b|cards (left|remaining)|left in the deck/i);
        expect(textOf(entry.html)).not.toMatch(/概率|几率|余张|预估|预览|剩余火牌|牌堆剩余/);
      }
    }
  });
});

describe("one shared panel (B6 consolidation)", () => {
  it("is the only rules-details implementation in src/app", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const { join, relative } = await import("node:path");
    const { ROOT } = await import("../../support/glossary.ts");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : [path];
      });
    const copies = walk(join(ROOT, "src/app")).filter((path) => /RulesDetail\.(tsx|css)$|rulesPieces|rulesContent|useClipClamp/.test(path)).map((path) => relative(ROOT, path));
    expect(copies.sort()).toEqual(["src/app/rules/RulesDetail.css", "src/app/rules/RulesDetail.tsx"]);
  });

  it("renders a small Full rules button by default, the name with look=name, and a given piece otherwise", () => {
    const button = render(M1, <RulesDetail subject={{ kind: "tech", id: "T17" }} />);
    expect(button).toContain('aria-label="Full rules: Prepared Clay"');
    expect(button).toContain('class="rd-button"');
    expect(button).toContain('data-size="wide"');
    const named = render(M1, <RulesDetail subject={{ kind: "tech", id: "T17" }} look="name" />);
    expect(named).toContain('<span class="rd-name">Prepared Clay</span>');
    expect(named).not.toMatch(/<button[^>]*class="kit-detail-trigger"[^>]*aria-label=/);
    const piece = render(M1, <RulesDetail subject={{ kind: "tech", id: "T17" }} trigger={<span className="x">tile</span>} />);
    expect(piece).toContain('<span class="x">tile</span>');
  });

  it("shows two sections only: the full rule, then the clarifications (owner review, 2026-10-17)", () => {
    for (const locale of ["en", "zh-CN"] as const) {
      const t = locale === "en" ? EN : ZH;
      const body = panel(render(M1, <RulesDetail subject={{ kind: "tech", id: "T17" }} />, locale), t("rules.label", { name: techText("T17", locale).name }));
      const headings = [...body.matchAll(/<p class="rd-h">([^<]*)<\/p>/g)].map((match) => match[1]);
      expect(headings).toEqual([t("rules.fullRule"), t("rules.clarifications")]);
      expectOnlyRuleAndClarifications(body);
    }
  });

  it("shows the whole Recognition track, and the Crowns beyond its top", () => {
    for (const locale of ["en", "zh-CN"] as const) {
      const t = locale === "en" ? EN : ZH;
      const track = render(M1, <RulesDetail subject={{ kind: "recognitionTrack" }} look="name" />, locale);
      const body = textOf(panel(track, t("rules.label", { name: t("rules.track.name") })));
      for (const space of IMPERIAL_TRACK.track) {
        const reward = locale === "en" ? space.rewardText : space.rewardTextZh;
        if (reward !== null) expect(body).toContain(decode(reward));
      }
      expect(body).toContain(t("rules.track.overflow", { vp: IMPERIAL_TRACK.overflowVpPerCrown }));
      expectClarifications(panel(track, t("rules.label", { name: t("rules.track.name") })), IMPERIAL_TRACK.clarifications.imperial_overflow, locale);
      const overflow = render(M1, <RulesDetail subject={{ kind: "recognitionOverflow" }} title="Crowns beyond the track" trigger={<span>row</span>} />, locale);
      expectClarifications(panel(overflow, t("rules.label", { name: "Crowns beyond the track" })), IMPERIAL_TRACK.clarifications.imperial_overflow, locale);
    }
    expect(overflowClarifications("en")).toHaveLength(IMPERIAL_TRACK.clarifications.imperial_overflow.length);
    expect(RECOGNITION_MAX).toBe(Math.max(...IMPERIAL_TRACK.track.map((space) => space.space)));
    expect(IMPERIAL_KILN_RECOGNITION).toBe(IMPERIAL_TRACK.track.find((space) => space.reward?.kind === "imperial_kiln")?.space);
    expect(IMPERIAL_PRIORITY_RECOGNITION).toBe(IMPERIAL_TRACK.track.find((space) => space.reward?.kind === "imperial_priority")?.space);
  });

  it("prints each location's capacity for the player count from content", () => {
    for (const players of [2, 3, 4]) {
      for (const location of Object.values(LOCATIONS)) {
        const facts = locationFacts(location.id, players);
        expect(facts.scope).toBe(location.scope);
        if (location.capacity !== null) expect(facts.capacity).toBe(location.capacity[String(players) as "2" | "3" | "4"]);
        else expect(facts.capacity).toBeNull();
      }
    }
  });

  it("is the same panel in a decision form as on the table (work, firing and Order windows)", () => {
    for (const id of ["m1_work_phase_r2_3p", "m9_contributions_step1_3p", "m6_order_phase_crackle_3p"]) {
      const html = renderScreenOf(id);
      const found = panels(html).filter((entry) => entry.html.includes("data-rules-detail"));
      expect(found.length, id).toBeGreaterThan(0);
      for (const entry of found) expect(entry.label.startsWith("Full rules: "), entry.label).toBe(true);
    }
  });
});

function renderScreenOf(id: string): string {
  return renderScreenMarkup(fixtureSource(id));
}
