/**
 * Final results (B3; UI_V1.6.1_ARCHITECTURE §4.2, §9.2, §10.3): the podium, the score table in
 * `SCORE_BREAKDOWN_ROWS` order with the A1 Techs row listed once, and the tie-breakers in
 * `TIE_BREAK_ORDER` with the deciding one marked — m8 (shared victory), the tie-break winner
 * scenario, 2- and 4-player finals — in English and Chinese. Every number is `finalResult`'s.
 */
import { describe, expect, it } from "vitest";
import { SCORE_BREAKDOWN_ROWS, TIE_BREAK_ORDER } from "../../../../src/game/index.ts";
import type { FinalResult } from "../../../../src/game/index.ts";
import { ResultsSection } from "../../../../src/app/results/ResultsSection.tsx";
import { fixture, fixtureSource } from "../support/fixtures.ts";
import { renderComponent, renderScreen } from "../support/render.tsx";
import { elementAt, escapeHtml, kilnRulesCheck, milestoneRulesCheck, perceivable, tagged, techRulesCheck, withoutRulesPanels } from "../kiln/support.ts";

const render = (id: string, locale: "en" | "zh-CN" = "en") => renderComponent(fixtureSource(id), <ResultsSection />, { locale });
const resultOf = (id: string): FinalResult => {
  const result = fixture(id).playerView.game.finalResult;
  if (result === null) throw new Error(`${id} is not finished`);
  return result;
};
const nameOf = (id: string, playerId: string) => fixture(id).playerView.game.players[playerId]?.displayName ?? "";

describe("podium", () => {
  it("a shared victory names both winners and ranks the rest", () => {
    const id = "d-final-shared-victory";
    const result = resultOf(id);
    expect(result.resolvedBy).toBe("shared_victory");
    const html = render(id);
    const podium = elementAt(html, /<ol class="podium"/);
    expect(podium.match(/class="stand stand--win"/g)).toHaveLength(result.winnerIds.length);
    expect(perceivable(podium).match(/Shared victory/g)).toHaveLength(2);
    const third = result.standings.find((standing) => standing.rank === 3)!;
    expect(perceivable(podium)).toContain("Rank 3");
    expect(perceivable(podium)).toMatch(new RegExp(`${String(third.total)}\\s+VP`));
    expect(perceivable(html)).toContain("Tied on total VP and every tie-breaker: the victory is shared.");
    const zh = render(id, "zh-CN");
    expect(perceivable(zh)).toContain("共享胜利");
    expect(perceivable(zh)).toContain("第3名");
    // m8 (revision 3's seed-5 game) is a single winner: tied on VP and Recognition, decided by printed Crowns.
    expect(resultOf("m8_final_results_4p").resolvedBy).toBe("printed_crowns");
  });

  it("the tie-break winner: one Winner, decided by Imperial Recognition", () => {
    const result = resultOf("t-tie-break-winner");
    expect(result.resolvedBy).toBe("imperial_recognition");
    const text = perceivable(withoutRulesPanels(render("t-tie-break-winner")));
    expect(text).toContain("Winner");
    expect(text).toContain("Decided by: Imperial Recognition");
    expect(perceivable(render("t-tie-break-winner", "zh-CN"))).toContain("以御府声望决出");
  });

  it("opens each player's Kiln rules details from the podium (D10)", () => {
    const view = fixture("m8_final_results_4p").playerView;
    const html = render("m8_final_results_4p");
    for (const standing of resultOf("m8_final_results_4p").standings) {
      const kilnId = view.game.players[standing.playerId]?.kilnId;
      if (kilnId === null || kilnId === undefined) continue;
      const card = elementAt(html, new RegExp(`<li class="stand[^"]*"[^>]*data-player-id="${standing.playerId}"`));
      tagged(card, kilnRulesCheck(kilnId, "en"));
    }
  });
});

describe("score table", () => {
  it.each(["m8_final_results_4p", "t-tie-break-winner", "t-final-2p", "t-final-4p"])("%s: rows in SCORE_BREAKDOWN_ROWS order, columns by standing, totals from finalResult", (id) => {
    const result = resultOf(id);
    const html = render(id);
    const table = elementAt(html, /<table class="calc score">/);
    const rows = [...table.matchAll(/<tr[^>]*data-row="(\w+)"/g)].map((match) => match[1]);
    expect(rows).toEqual([...SCORE_BREAKDOWN_ROWS]);
    const head = elementAt(table, /<thead>/);
    const names = result.standings.map((standing) => nameOf(id, standing.playerId));
    let at = -1;
    for (const name of names) {
      const next = head.indexOf(escapeHtml(name), at + 1);
      expect(next).toBeGreaterThan(at);
      at = next;
    }
    const total = elementAt(table, /<tr class="score-total" data-row="total">/);
    for (const standing of result.standings) expect(total).toContain(`<b>${String(standing.total)}</b>`);
    expect(head.match(/<th scope="col"/g)?.length).toBe(result.standings.length + 1);
  });

  it("has no Tech row or note: a Tech scores nothing (v1.6.2 change 27); Connoisseur's Cabinet keeps its end-game row", () => {
    const result = resultOf("m8_final_results_4p");
    for (const locale of ["en", "zh-CN"] as const) {
      const html = render("m8_final_results_4p", locale);
      expect(html).not.toContain('data-row="techs"');
      expect(html).not.toContain("score-a1");
      expect(html).not.toContain('class="results-note"');
      expect(perceivable(html)).not.toMatch(locale === "en" ? /VP each when gained|when it was gained/ : /技艺分|习得时得|习得时已得/);
      const cabinet = elementAt(html, /<tr data-row="connoisseur">/);
      expect(perceivable(cabinet)).toContain(locale === "en" ? "Connoisseur's Cabinet" : "清玩斋");
      for (const standing of result.standings) expect(cabinet).toContain(`<td class="num">${String(result.scores[standing.playerId]!.connoisseur)}</td>`);
    }
    expect(Object.keys(result.scores[result.standings[0]!.playerId]!)).not.toContain("techs");
    expect(perceivable(render("m8_final_results_4p", "zh-CN"))).toContain("余钱折分 · 每3铜钱1分，至多5分");
  });

  it("splits the Exhibition into its Quality, Shapes and Glazes parts", () => {
    const result = resultOf("m8_final_results_4p");
    const html = render("m8_final_results_4p");
    const row = elementAt(html, /<tr data-row="exhibition">/);
    for (const standing of result.standings) {
      const exhibition = result.scores[standing.playerId]!.exhibition;
      expect(perceivable(row)).toContain(`Quality ${String(exhibition.qualityVp)} + Shapes ${String(exhibition.shapesBonus)} + Glazes ${String(exhibition.glazesBonus)}`);
    }
    expect(perceivable(row)).not.toMatch(/\bc\d+\b/);
  });

  it("opens the Imperial Audience, Crown overflow and Connoisseur's Cabinet rules details under the table (D10)", () => {
    const html = render("m8_final_results_4p");
    // The table scrolls inside itself, so no rules panel (or other disclosure) sits in it.
    expect(elementAt(html, /<div class="calc-wrap"/)).not.toContain("kit-detail");
    // The tables scroll inside their box on phones, so the box takes keyboard focus.
    expect(html).toContain('<div class="calc-wrap" role="group" aria-labelledby="results-score-title" tabindex="0">');
    expect(html).toContain('<div class="calc-wrap" role="group" aria-labelledby="results-tie-title" tabindex="0">');
    expect(perceivable(elementAt(html, /<tr data-row="imperialAudience">/))).toContain("Imperial Audience");
    tagged(elementAt(html, /<li data-rules-row="imperialAudience">/), milestoneRulesCheck(4, "en"));
    const overflow = elementAt(html, /<li data-rules-row="recognitionOverflow">/);
    expect(perceivable(overflow)).toContain("Crowns beyond Recognition 4");
    expect(perceivable(overflow)).toContain("Tribute Ware's bonus Crown scores past Recognition 4");
    tagged(elementAt(html, /<li data-rules-row="connoisseur">/), techRulesCheck("T19", "en"));
    expect(perceivable(html)).toContain("Rules for these rows:");
    const zh = render("m8_final_results_4p", "zh-CN");
    expect(perceivable(zh)).toContain("相关规则：");
    tagged(elementAt(zh, /<li data-rules-row="connoisseur">/), techRulesCheck("T19", "zh-CN"));
  });
});

describe("tie-breakers", () => {
  it("lists TIE_BREAK_ORDER then shared victory, marking the row that decided", () => {
    const html = render("t-tie-break-winner");
    const table = html.slice(html.indexOf('id="results-tie-title"'));
    const rows = [...table.matchAll(/data-tie="(\w+)"/g)].map((match) => match[1]);
    expect(rows).toEqual([...TIE_BREAK_ORDER.map((step) => step.key), "shared_victory"]);
    expect(table).toMatch(/<tr class="tie-decisive" data-tie="recognition">/);
    expect(perceivable(table)).toContain("(decided the winner)");
    const shared = render("d-final-shared-victory");
    const sharedTable = shared.slice(shared.indexOf('id="results-tie-title"'));
    expect(sharedTable).toMatch(/<tr class="tie-decisive" data-tie="shared_victory">/);
    expect(perceivable(sharedTable)).toMatch(/Tied: \w+/);
  });
});

describe("in the game screen", () => {
  it("is the first section once the game is finished, and absent before", () => {
    const html = renderScreen(fixtureSource("m8_final_results_4p"));
    expect(/<section id="sec-(\w+)"/.exec(html)?.[1]).toBe("results");
    expect(renderScreen(fixtureSource("m1_work_phase_r2_3p"))).not.toContain('class="podium"');
  });
});
