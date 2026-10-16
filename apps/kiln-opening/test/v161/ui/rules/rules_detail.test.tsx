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
  clarificationTags,
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
  locationName,
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
import { RulesDetail, clarificationSourceLabel } from "../../../../src/app/rules/RulesDetail.tsx";
import { fixture, fixtureSource } from "../support/fixtures.ts";
import { renderComponent, renderScreen as renderScreenMarkup } from "../support/render.tsx";
import { decode, panel, panels, textOf } from "../table/markup.ts";

const EN = createTranslator("en", { strict: true });
const ZH = createTranslator("zh-CN", { strict: true });
const M1 = "m1_work_phase_r2_3p";

function render(id: string, element: ReactElement, locale: "en" | "zh-CN" = "en"): string {
  return renderComponent(fixtureSource(id), element, { locale });
}

/** Every clarification of a component, with its source label, is in the panel. */
function expectClarifications(html: string, items: readonly ClarificationDefinition[], locale: "en" | "zh-CN") {
  const t = locale === "en" ? EN : ZH;
  const text = textOf(html);
  expect(items.length).toBeGreaterThan(0);
  for (const item of items) {
    expect(text).toContain(decode(locale === "en" ? item.en : item.zh));
    expect(text).toContain(t("rules.source", { source: clarificationSourceLabel(clarificationTags(item.source), t) }));
  }
}

describe("clarification source labels", () => {
  it("labels each tag kind as the clarifications doc's Source tags table says", () => {
    expect(clarificationSourceLabel(["L375", "L211", "D7"], EN)).toBe("Rulebook “Advanced Tech Rules”, “Guild Hall” · Wording D7");
    expect(clarificationSourceLabel(["A1"], EN)).toBe("Owner amendment A1");
    expect(clarificationSourceLabel(["R12", "L653"], EN)).toBe("Owner ruling R12 · Rulebook “Tech Clarifications (Appendix B)”");
    expect(clarificationSourceLabel(["B3"], EN)).toBe("Owner ruling B3");
    expect(clarificationSourceLabel(["ED L714"], EN)).toBe("Editorial correction to “Action Summary (Appendix E)”");
    // Two lines of one section name it once.
    expect(clarificationSourceLabel(["L647", "L652"], EN)).toBe("Rulebook “Tech Clarifications (Appendix B)”");
    expect(clarificationSourceLabel(["L139"], EN)).toBe("Rulebook “Phase 2 — Work Phase”");
    expect(clarificationSourceLabel(["INT Decorator's Kit"], EN)).toBe("Recorded interpretation: Decorator's Kit");
    expect(clarificationSourceLabel(["P2"], EN)).toBe("Provisional ruling P2 (owner may change)");
    expect(clarificationSourceLabel(["L375", "L211", "D7"], ZH)).toBe("规则书「技艺规则」、「陶工行」 · 措辞D7");
    expect(clarificationSourceLabel(["ED L714"], ZH)).toBe("勘误「行动一览（附录E）」");
    expect(clarificationSourceLabel(["R4"], ZH)).toBe("业主裁定R4");
    expect(clarificationSourceLabel(["A1"], ZH)).toBe("规则修订A1");
    expect(clarificationSourceLabel(["INT Decorator's Kit"], ZH)).toBe("规则解释");
    expect(clarificationSourceLabel(["P1"], ZH)).toBe("暂定裁定P1（业主可改）");
  });

  it("labels every source tag in the content", () => {
    const sources = [
      ...TECH_IDS.flatMap((id) => TECHS[id].clarifications),
      ...Object.values(KILNS).flatMap((kiln) => kiln.clarifications),
      ...Object.values(LOCATIONS).flatMap((location) => location.clarifications),
      ...IMPERIAL_TRACK.track.flatMap((space) => space.clarifications),
      ...IMPERIAL_TRACK.clarifications.imperial_overflow,
      ...ORDER_CLARIFICATIONS.starting,
      ...ORDER_CLARIFICATIONS.main,
    ].map((item) => item.source);
    for (const source of new Set(sources)) {
      for (const t of [EN, ZH]) {
        const label = clarificationSourceLabel(clarificationTags(source), t);
        expect(label, source).not.toBe("");
        expect(label, source).not.toMatch(/\{|\}/);
        // A player cannot look up a Markdown line number (the printed rulebook has none).
        expect(label, source).not.toMatch(/\bL\d+/);
      }
    }
  });
});

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
  it.each(TECH_IDS.map((id) => [id] as const))("%s: short text, full ability, clarifications and facts in EN and ZH", (techId: TechId) => {
    for (const locale of ["en", "zh-CN"] as const) {
      const t = locale === "en" ? EN : ZH;
      const html = render(M1, <TechCard techId={techId} />, locale);
      const text = techText(techId, locale);
      const body = panel(html, t("rules.label", { name: text.name }));
      // The trigger is the tile: a button that discloses the panel.
      expect(html).toMatch(/<button type="button" class="kit-detail-trigger" aria-expanded="false" aria-controls="[^"]+-panel">/);
      expect(textOf(body)).toContain(decode(text.short));
      expect(textOf(body)).toContain(decode(text.ability));
      expectClarifications(body, TECHS[techId].clarifications, locale);
      const facts = techFacts(techId);
      expect(textOf(body)).toContain(t("common.amount.coins", { n: facts.cost }));
      expect(textOf(body)).toContain(t("rules.fact.vpWhenGained", { n: 1 }));
      if (facts.oncePerRound) expect(textOf(body)).toContain(t("rules.fact.oncePerRound"));
      if (facts.adds !== null) expect(textOf(body)).toContain(t("rules.fact.addsSpace", { location: locationName(facts.adds, locale) }));
    }
  });

  it("adds This round: Ready / Used this round for an owned once-per-round Tech", () => {
    const html = render(M1, <TechSlots playerId="p3" />);
    const body = panel(html, "Rules: Prepared Clay");
    expect(textOf(body)).toContain("This round Ready");
  });
});

describe("Kiln Player Board, locations, Orders and milestones", () => {
  it("the Kiln Tradition opens the Kiln's rules details", () => {
    const html = render(M1, <KilnTradition playerId="p3" />);
    const text = kilnText("GE", "en");
    const body = panel(html, `Rules: ${text.name} · ${text.abilityName}`);
    expect(textOf(body)).toContain(decode(text.ability));
    expectClarifications(body, KILNS.GE.clarifications, "en");
    expect(textOf(body)).toContain("Once per round");
    expect(textOf(body)).toContain("This round Ready");
    const zh = render(M1, <KilnTradition playerId="p3" />, "zh-CN");
    expectClarifications(panel(zh, `规则：${kilnText("GE", "zh-CN").name} · ${kilnText("GE", "zh-CN").abilityName}`), KILNS.GE.clarifications, "zh-CN");
  });

  it("every central and personal location opens its rules details", () => {
    const html = render(M1, <><CentralBoard /><PlayerBoard playerId="p3" /></>);
    for (const location of Object.values(LOCATIONS)) {
      const body = panel(html, `Rules: ${decode(location.name)}`);
      expect(textOf(body)).toContain(decode(location.apprenticeText));
      expect(textOf(body)).toContain(decode(location.shifuText));
      expectClarifications(body, location.clarifications, "en");
    }
    expect(textOf(panel(html, "Rules: Magistrate's Hall"))).toContain("Capacity (3 players) 1 space");
    expect(textOf(panel(html, "Rules: Canal Wharf"))).toContain("Capacity (3 players) No limit");
    expect(textOf(panel(html, "Rules: Glaze & Load"))).toContain("Personal location");
  });

  it("an Order card opens its rules details with the Main or Starting Order clarifications", () => {
    const html = render(M1, <><OrderDisplay /><PlayerBoard playerId="p3" /></>);
    const display = fixture(M1).playerView.game.market.display.filter((id): id is NonNullable<typeof id> => id !== null);
    for (const orderId of display) {
      const body = panel(html, `Rules: Order ${orderId}`);
      expect(textOf(body)).toContain(decode(ORDERS[orderId].requirements));
      expectClarifications(body, ORDER_CLARIFICATIONS.main, "en");
      expect(textOf(body)).toMatch(/Reward \d+ VP · \d+ Coins?/);
    }
  });

  it("each Recognition milestone opens its rules details; Recognition 4 includes the Crowns beyond 4", () => {
    const html = render("m5_two_player_board_2p", <RecognitionTrack />);
    const labels = panels(html).map((entry) => entry.label);
    expect(labels).toHaveLength(IMPERIAL_TRACK.track.length);
    const four = panel(html, `Rules: Recognition 4 · ${IMPERIAL_TRACK.track[4]!.title}`);
    expectClarifications(four, [...IMPERIAL_TRACK.track[4]!.clarifications, ...IMPERIAL_TRACK.clarifications.imperial_overflow], "en");
    const two = panel(html, `Rules: Recognition 2 · ${IMPERIAL_TRACK.track[2]!.title}`);
    expect(textOf(two)).toContain("Here now Zhao");
    expect(textOf(panel(html, `Rules: Recognition 3 · ${IMPERIAL_TRACK.track[3]!.title}`))).toContain("Here now Nobody");
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

  it("renders a small Rules button by default, the name with look=name, and a given piece otherwise", () => {
    const button = render(M1, <RulesDetail subject={{ kind: "tech", id: "T17" }} />);
    expect(button).toContain('aria-label="Rules: Prepared Clay"');
    expect(button).toContain('class="rd-button"');
    expect(button).toContain('data-size="wide"');
    const named = render(M1, <RulesDetail subject={{ kind: "tech", id: "T17" }} look="name" />);
    expect(named).toContain('<span class="rd-name">Prepared Clay</span>');
    expect(named).not.toMatch(/<button[^>]*class="kit-detail-trigger"[^>]*aria-label=/);
    const piece = render(M1, <RulesDetail subject={{ kind: "tech", id: "T17" }} trigger={<span className="x">tile</span>} />);
    expect(piece).toContain('<span class="x">tile</span>');
  });

  it("adds the owner and this round's use only for a card that player owns", () => {
    // m1: p3 (the viewer) owns Prepared Clay (T17).
    const own = textOf(panel(render(M1, <RulesDetail subject={{ kind: "tech", id: "T17" }} />), "Rules: Prepared Clay"));
    expect(own).toMatch(/Owner \S+ This round (Ready|Used this round)/);
    const other = panel(render(M1, <RulesDetail subject={{ kind: "tech", id: "T17" }} ownerId="p1" />), "Rules: Prepared Clay");
    expect(other).not.toContain("<dt>Owner</dt>");
    const nobody = panel(render(M1, <RulesDetail subject={{ kind: "tech", id: "T17" }} ownerId={null} />), "Rules: Prepared Clay");
    expect(nobody).not.toContain("<dt>Owner</dt>");
  });

  it("adds a caller's facts about this component now", () => {
    const html = render(M1, <RulesDetail subject={{ kind: "tech", id: "T17" }} extraFacts={[{ label: EN("rules.fact.price"), value: "2 Coins" }]} />);
    expect(textOf(panel(html, "Rules: Prepared Clay"))).toContain("You pay 2 Coins");
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
      for (const entry of found) expect(entry.label.startsWith("Rules: "), entry.label).toBe(true);
    }
  });
});

function renderScreenOf(id: string): string {
  return renderScreenMarkup(fixtureSource(id));
}
