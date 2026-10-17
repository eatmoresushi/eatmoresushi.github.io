/**
 * The firing stage (B3; UI_V1.6.1_ARCHITECTURE §4.2, §9.2, §10.3; owner decisions D3, D4):
 * - it takes over the world column in the Firing Phase (first section) and is absent otherwise;
 * - the step rail with the open step, done steps and First-Player marks;
 * - the heat equation EN/ZH: m3 (Base Heat known, Fire face down), m4 (Fire turned, Global
 *   Heat), m9 (secret Contributions: who has chosen, never what), an Imperial-only firing (no
 *   Contribution participants: Base Heat = Kiln Die), and two lines on phones;
 * - Second Firing's 2 revealed Fire cards in the equation and beside their ceramic, while the
 *   owner chooses one (v1.6.2 L631; the R7 scenario and m18);
 * - the queue and the submissions row; public Test Pieces records; the open Fire discard only
 *   (never a deck size, odds or previews).
 */
import { describe, expect, it } from "vitest";
import { firingStageView } from "../../../../src/game/index.ts";
import { FiringStage } from "../../../../src/app/firing/FiringStage.tsx";
import { HeatEquation } from "../../../../src/app/firing/HeatEquation.tsx";
import { StepRail } from "../../../../src/app/firing/StepRail.tsx";
import { firingStepCount } from "../../../../src/app/i18n/content.ts";
import { FixtureGameSource } from "../../../../src/app/session/fixtureSource.ts";
import { fixture, fixtureSource } from "../support/fixtures.ts";
import type { UiFixture } from "../support/fixtures.ts";
import { renderComponent, renderScreen } from "../support/render.tsx";
import { elementAt, perceivable, spaceCell, withoutRulesPanels } from "../kiln/support.ts";

const stage = (id: string) => {
  const view = firingStageView(fixture(id).playerView);
  if (view === null) throw new Error(`${id} has no firing`);
  return view;
};
/** A modifier as the table prints it: +1, 0, −1 (U+2212). */
const signed = (n: number) => (n > 0 ? `+${String(n)}` : n < 0 ? `−${String(-n)}` : "0");
const render = (id: string, locale: "en" | "zh-CN" = "en") => renderComponent(fixtureSource(id), <FiringStage />, { locale });

/** D3/D4 vocabulary the stage must never use (rendered_text's list, §9.2). */
const BANNED_EN = /\b(odds|chance|probability|ladder|preview|expected)\b|cards left|cards remaining|left in the deck/i;
const BANNED_ZH = /概率|几率|余张|预估|预览|剩余火牌|牌堆剩余/;

describe("the stage takes over the column in the Firing Phase (D3)", () => {
  it("is the first world section during a firing and absent outside one", () => {
    const firing = renderScreen(fixtureSource("m3_heat_marker_step_3p"));
    const first = /<section id="sec-(\w+)"/.exec(firing)?.[1];
    expect(first).toBe("firing");
    expect(firing).toContain('data-webgl-mount="firing-stage"');
    const work = renderScreen(fixtureSource("m1_work_phase_r2_3p"));
    expect(work).not.toContain('id="sec-firing"');
    expect(work).not.toContain('data-webgl-mount="firing-stage"');
  });

  it("names the open step, says whose turn it is and points to the decision panel", () => {
    const html = render("m3_heat_marker_step_3p");
    const total = firingStepCount();
    expect(total).toBe(12);
    expect(html).toContain(`Your turn · Step 5/${String(total)}`);
    expect(html).toContain('<h3 class="stage-title">Heat markers</h3>');
    expect(html).toContain("Make your choice in the decision panel.");
    const zh = render("m3_heat_marker_step_3p", "zh-CN");
    expect(zh).toContain("轮到你了 · 第5步／共12步");
    expect(zh).toContain("翻火标");
    // A waiting viewer sees the step without "your turn".
    const waiting = render("m11b_test_pieces_bury");
    expect(waiting).toContain("Step 4/12");
  });
});

describe("step rail", () => {
  it("marks the open step, the steps before it and the First-Player-order steps", () => {
    const html = renderComponent(fixtureSource("m3_heat_marker_step_3p"), <StepRail stage={stage("m3_heat_marker_step_3p")} />);
    expect(html.match(/<li /g)).toHaveLength(12);
    expect(html).toMatch(/<li class="steps-item steps-item--on steps-item--fp" aria-current="step" title="Heat markers" data-step="5">/);
    // The rail may scroll inside a narrow stage, so it takes keyboard focus (axe scrollable-region-focusable).
    expect(html).toMatch(/<ol class="steps" aria-label="[^"]+" tabindex="0">/);
    for (const n of [1, 2, 3, 4]) expect(html).toMatch(new RegExp(`class="steps-item steps-item--done[^"]*"[^>]*data-step="${String(n)}"`));
    for (const n of [4, 5, 8, 10]) expect(html).toMatch(new RegExp(`class="[^"]*steps-item--fp[^"]*"[^>]*data-step="${String(n)}"`));
    for (const n of [6, 7, 9, 11, 12]) expect(html).not.toMatch(new RegExp(`class="[^"]*steps-item--(fp|done|on)[^"]*"[^>]*data-step="${String(n)}"`));
    expect(html).toContain("Step 5: Heat markers");
    expect(html).toContain("(in First Player order)");
    const zh = renderComponent(fixtureSource("m3_heat_marker_step_3p"), <StepRail stage={stage("m3_heat_marker_step_3p")} />, { locale: "zh-CN" });
    expect(zh).toContain("第5步：翻火标");
    expect(zh).toContain("（按起始玩家顺序）");
    expect(zh).toContain("开窑取器");
  });
});

describe("heat equation", () => {
  it("m3: Kiln Die + revealed Contributions = Base Heat; the Fire card still face down", () => {
    const view = stage("m3_heat_marker_step_3p");
    const html = renderComponent(fixtureSource("m3_heat_marker_step_3p"), <HeatEquation stage={view} />);
    const text = perceivable(html);
    expect(text).toContain(`Kiln Die: ${String(view.kilnDie)}`);
    expect(text).toContain("Contributions (revealed)");
    expect(text).toMatch(/Zhao \(you\)\s+Stoke the Fire\s+\+1 · paid 1 Wood/);
    expect(text).toMatch(/Wen\s+Tend the Fire\s+0/);
    expect(text).toContain("Base Heat (0–5)");
    expect(html).toContain(`<b class="eq-val num">${String(view.baseHeat)}</b>`);
    expect(text).toContain("Fire card, face down");
    expect(text).toContain("Global Heat");
    expect(text).toContain("not known yet");
    expect(text).toContain("Fire discard (open)");
    expect(html.match(/data-fire="(-?\d)"/g)?.length).toBe(view.fireDiscard.length);
  });

  it("m3 (zh): name, card and heat are spaced apart, as in the wireframe (glossary §1.2–1.3)", () => {
    const view = stage("m3_heat_marker_step_3p");
    const html = renderComponent(fixtureSource("m3_heat_marker_step_3p"), <HeatEquation stage={view} />, { locale: "zh-CN" });
    // The text a reader sees: tags removed without adding spaces, so run-together text shows.
    const text = html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ");
    expect(text).toMatch(/Zhao（你） 添柴 \+1 · 付1柴/);
    expect(text).toMatch(/Wen 守火 0/);
    expect(text).not.toMatch(/(Zhao（你）|Wen)(守火|添柴|压火)/);
  });

  it("m4: the turned Fire card and Global Heat", () => {
    const view = stage("m4_after_quality_3p");
    const html = renderComponent(fixtureSource("m4_after_quality_3p"), <HeatEquation stage={view} />);
    expect(view.fireModifier).not.toBeNull();
    expect(perceivable(html)).toContain(`Fire card ${signed(view.fireModifier!)}`);
    expect(html).toContain(`<b class="eq-val num">${String(view.globalHeat)}</b>`);
  });

  it("m9: Contributions stay secret until all are in (who has chosen, never what)", () => {
    const view = stage("m9_contributions_step1_3p");
    const html = renderComponent(fixtureSource("m9_contributions_step1_3p"), <HeatEquation stage={view} />);
    const text = perceivable(html);
    expect(text).toContain("Contributions (secret until all are in)");
    expect(text).toMatch(/Wen\s+submitted, card hidden/);
    expect(text).toMatch(/Lin\s+submitted, card hidden/);
    expect(text).toMatch(/Zhao \(you\)\s+choosing…/);
    expect(text).not.toMatch(/Bank the Fire|Tend the Fire|Stoke the Fire/);
    expect(html).not.toContain("data-contribution=");
    const zh = perceivable(renderComponent(fixtureSource("m9_contributions_step1_3p"), <HeatEquation stage={view} />, { locale: "zh-CN" }));
    expect(zh).toContain("控火（全部选定前保密）");
    expect(zh).toContain("已选，牌面保密");
    expect(zh).toContain("基础火候（限定0–5）");
  });

  it("an Imperial-only firing has no Contribution participants: Base Heat is the Kiln Die", () => {
    const view = stage("t-imperial-only-firing");
    expect(view.contributions).toEqual([]);
    const html = renderComponent(fixtureSource("t-imperial-only-firing"), <HeatEquation stage={view} />);
    expect(perceivable(html)).toContain("none: nobody has a ceramic in the Shared Kiln");
    expect(html).toContain(`<b class="eq-val num">${String(view.kilnDie)}</b>`);
    expect(render("t-imperial-only-firing")).toContain("Queue");
  });

  it("has two lines on phones: Base Heat repeats, decoratively, at the start of the second", () => {
    const html = renderComponent(fixtureSource("m3_heat_marker_step_3p"), <HeatEquation stage={stage("m3_heat_marker_step_3p")} />);
    const base = elementAt(html, /<div class="eq-line eq-line--base">/);
    const global = elementAt(html, /<div class="eq-line eq-line--global">/);
    expect(perceivable(base)).toMatch(/Kiln Die[\s\S]*Contributions[\s\S]*Base Heat/);
    expect(global).toMatch(/^<div class="eq-line eq-line--global"><div class="eq-term eq-term--key eq-term--repeat" aria-hidden="true">/);
    expect(perceivable(global)).toMatch(/Fire[\s\S]*Global Heat/);
  });

  it("after a reshuffle the open discard is empty and says so", () => {
    expect(perceivable(render("t-fire-deck-reshuffle"))).toMatch(/Fire discard \(open\)\s+empty/);
  });
});

describe("Second Firing's 2 revealed Fire cards (v1.6.2 L631)", () => {
  it.each(["w-second-firing-choice-with-jun-r7", "m18_jun_second_firing"])("%s shows both cards in the equation and beside their ceramic", (id) => {
    const view = stage(id);
    expect(view.extraFire).not.toBeNull();
    const extra = view.extraFire!;
    expect(extra.modifiers).toHaveLength(2);
    const html = render(id);
    const equation = elementAt(html, /<div class="eq-extra"/);
    expect(perceivable(equation)).toMatch(/Second Firing, extra Fire cards: (Your|\w+’s) /);
    expect(equation.match(/data-fire="-?\d"/g)).toEqual(extra.modifiers.map((modifier) => `data-fire="${String(modifier)}"`));
    const record = view.ceramics.find((ceramic) => ceramic.id === extra.ceramicId);
    expect(record).toBeDefined();
    // Beside the ceramic, wherever it is (a Shared Kiln space or the Imperial Kiln).
    const beside = record!.spaceId === null ? elementAt(html, new RegExp(`<div class="imp"[^>]*data-player-id="${extra.playerId}"`)) : spaceCell(html, record!.spaceId);
    expect(beside).toContain('class="kcer-extra"');
    expect(perceivable(beside)).toContain(`Second Firing: extra Fire cards ${extra.modifiers.map(signed).join(", ")}, one to be chosen`);
    const zh = render(id, "zh-CN");
    expect(perceivable(elementAt(zh, /<div class="eq-extra"/))).toContain("「复烧」额外翻开的窑火牌：");
  });
});

/**
 * The R7 scenario right after SECOND_FIRING_CHOOSE took card 2 (−1) without Jun: back in the
 * after-Quality step, the chosen card recorded on the ceramic, both cards in the discard in
 * reveal order (v1.6.2 L631; the engine's `resolveSecondFiringChoice`).
 */
function afterSecondFiringChoice(): UiFixture {
  const entry = structuredClone(fixture("w-second-firing-choice-with-jun-r7"));
  const game = entry.playerView.game;
  const firing = game.firing!;
  const record = firing.ceramics["c1"]!;
  const pending = firing.pendingExtraFire!;
  const chosen = pending.modifiers[1];
  record.second = { ...record.first!, fireModifier: chosen, heatSource: record.first!.heatSource + chosen - record.first!.fireModifier };
  record.secondFiringCards = [pending.modifiers[0], pending.modifiers[1]];
  firing.pendingExtraFire = null;
  game.fireDiscard = [...game.fireDiscard, ...pending.modifiers];
  game.phase = { type: "firing_after_quality", queue: { actorIds: [entry.viewerId], index: 0 } } as typeof game.phase;
  return entry;
}

describe("Second Firing after the choice (v1.6.2 L631)", () => {
  const entry = afterSecondFiringChoice();
  const html = renderComponent(new FixtureGameSource(entry), <FiringStage />);

  it("the equation no longer shows the 2 cards; both lie in the open discard, in reveal order", () => {
    expect(html).not.toContain('class="eq-extra"');
    const discard = [...elementAt(html, /<ol class="fdiscard-list"/).matchAll(/data-fire="(-?\d)"/g)].map((match) => Number(match[1]));
    expect(discard.slice(-2)).toEqual([1, -1]);
  });

  it("the ceramic shows the chosen card, and the stage records it in words, in both languages", () => {
    const cell = spaceCell(html, "low_1");
    expect(cell).toContain('class="kcer-extra"');
    expect(cell.match(/class="kcer-extra"[\s\S]*?data-fire="(-?\d)"/)?.[1]).toBe("-1");
    expect(perceivable(cell)).toContain("Second Firing: fired again with Fire card −1");
    const records = perceivable(withoutRulesPanels(elementAt(html, /<ul class="stage-records"/)));
    expect(records).toContain("Your Moon White Bowl, Plain · Flawed: fired again with Fire card −1 (Second Firing).");
    const zh = renderComponent(new FixtureGameSource(entry), <FiringStage />, { locale: "zh-CN" });
    expect(perceivable(withoutRulesPanels(elementAt(zh, /<ul class="stage-records"/)))).toContain("：用窑火牌−1复烧（「复烧」）。");
    expect(perceivable(spaceCell(zh, "low_1"))).toContain("「复烧」：用窑火牌−1复烧");
  });
});

describe("Protective Saggars' floor on the table (v1.6.2 L636)", () => {
  it("the ceramic shows the engine's Quality, and its details say Saggars kept it Standard", () => {
    const id = "w-after-quality-saggars-and-ge";
    expect(stage(id).ceramics.find((ceramic) => ceramic.id === "c2")).toMatchObject({ quality: "standard", saggarsFloor: true });
    const html = render(id);
    const floored = spaceCell(html, "low_1");
    expect(floored).toContain('data-quality="standard"');
    expect(floored).not.toContain('data-quality="flawed"');
    expect(perceivable(floored)).toContain("Protective Saggars: counts as Standard, not Flawed");
    expect(perceivable(spaceCell(render(id, "zh-CN"), "low_1"))).toContain("「匣钵护烧」：算作良品，不为瑕品");
    // A Standard ceramic the floor did not touch says nothing of it.
    expect(perceivable(spaceCell(html, "middle_1"))).not.toContain("Protective Saggars");
  });

  it("once Saggars' own upgrade makes it Fine, its details no longer say it counts as Standard", () => {
    // The engine keeps `saggarsFloor` set after the upgrade (Standard or Fine).
    const entry = structuredClone(fixture("w-after-quality-saggars-and-ge"));
    const record = entry.playerView.game.firing!.ceramics["c2"]!;
    record.history = [...record.history, { cause: "protective_saggars", from: "standard", to: "fine" }];
    record.quality = "fine";
    const cell = spaceCell(renderComponent(new FixtureGameSource(entry), <FiringStage />), "low_1");
    expect(cell).toContain('data-quality="fine"');
    expect(perceivable(cell)).toContain("Quality this firing: Fine");
    expect(perceivable(cell)).not.toContain("counts as Standard");
    expect(perceivable(spaceCell(renderComponent(new FixtureGameSource(entry), <FiringStage />, { locale: "zh-CN" }), "low_1"))).not.toContain("「匣钵护烧」：算作良品");
  });
});

describe("queue, submissions and public records", () => {
  it("shows the queue in First Player order with who decides now", () => {
    const view = stage("m3_heat_marker_step_3p");
    const html = render("m3_heat_marker_step_3p");
    expect(view.queue?.actorIds).toEqual(["p2", "p3", "p1"]);
    const text = perceivable(html);
    expect(text).toContain("Zhao (you), deciding now");
    expect(text).toContain("Wen, waiting");
    expect(html).toContain("queue-item--now");
  });

  it("shows who has chosen a Contribution, never what", () => {
    const text = perceivable(render("m9_contributions_step1_3p"));
    expect(text).toContain("Who has chosen");
    expect(text).toContain("Lin, chosen");
    expect(text).toContain("Wen, chosen");
    expect(text).toContain("Zhao (you), choosing");
  });

  it("records Test Pieces publicly (who paid; never the card)", () => {
    const html = withoutRulesPanels(render("m11b_test_pieces_bury"));
    expect(perceivable(html)).toContain("Lin (you) paid for Test Pieces and looked at the top Fire card.");
  });

  it.each(["m3_heat_marker_step_3p", "m4_after_quality_3p", "m9_contributions_step1_3p", "m11b_test_pieces_bury", "m13_jun_heat_adjustment", "m14_salvage", "m18_jun_second_firing", "t-imperial-only-firing", "t-fire-deck-reshuffle", "w-secret-contributions-with-fuel-ledger", "w-salvage"])(
    "%s uses no odds, deck-size or preview wording, in either language (D3, D4)",
    (id) => {
      expect(perceivable(withoutRulesPanels(render(id)))).not.toMatch(BANNED_EN);
      expect(perceivable(withoutRulesPanels(render(id, "zh-CN")))).not.toMatch(BANNED_ZH);
      expect(render(id)).not.toMatch(/\bc\d+\b(?![^<]*")/);
    },
  );
});
