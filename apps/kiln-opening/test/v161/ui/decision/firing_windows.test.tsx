/**
 * SSR of B5's windows from every scenario and moment, in English and Chinese
 * (UI_V1.6.1_ARCHITECTURE §9.2, §10.3 B5). Owner: B5.
 *
 * - Every firing, Order, Cleanup, final and waiting window renders its real component (no
 *   phase A placeholder), with its title and its alternative button.
 * - Owner decisions D3/D4: no odds, previews, ladders or Fire-deck counts in any of them.
 * - D10: Tech, Kiln and Order names open rules details with only the full rule and the
 *   clarifications, as plain text: no card text, card facts or source labels (owner review,
 *   2026-10-17).
 * - Seeded drafts show their table targets through `useTableSelection` (§3.5).
 */
import { describe, expect, it } from "vitest";
import { IMPERIAL_TRACK, KILNS, ORDER_CLARIFICATIONS, TECHS } from "../../../../src/game/index.ts";
import type { ClarificationDefinition } from "../../../../src/game/index.ts";
import { DecisionPane } from "../../../../src/app/decision/DecisionPane.tsx";
import { kilnText, techText } from "../../../../src/app/i18n/content.ts";
import { createTranslator } from "../../../../src/app/i18n/translator.ts";
import { decisionWindow } from "../../../../src/app/state/decisionWindow.ts";
import type { DecisionWindowKind } from "../../../../src/app/state/decisionWindow.ts";
import { useTableSelection } from "../../../../src/app/state/hooks.ts";
import { FixtureGameSource } from "../../../../src/app/session/fixtureSource.ts";
import { allFixtures, fixture, fixtureSource } from "../support/fixtures.ts";
import { renderComponent, renderWindow } from "../support/render.tsx";
import { decode, panel, textOf } from "../table/markup.ts";

const B5_KINDS: ReadonlySet<DecisionWindowKind> = new Set<DecisionWindowKind>([
  "contributions",
  "test_pieces",
  "jun",
  "after_quality",
  "second_firing",
  "orders",
  "hand_limit",
  "final",
  "waiting",
]);

const B5_STUBS = ["Contributions", "TestPieces", "Jun", "AfterQuality", "SecondFiring", "OrderTurn", "OrderCompletionPicker", "CrackleDeclarations", "HandTrim", "FinalSummary", "Waiting"];

/** What a player perceives: text nodes plus `aria-label`, `title` and `alt` values. */
function perceivable(html: string): string {
  const attributes = [...html.matchAll(/\s(?:aria-label|title|alt)="([^"]*)"/g)].map((match) => match[1]);
  return [html.replace(/<[^>]*>/g, " "), ...attributes].join(" ").replace(/\s+/g, " ");
}

/** D3/D4 vocabulary (§9.2): "ledger" is allowed only as the Fuel Ledger name. */
const BANNED_EN = /\b(odds|chance|probability|ladder|preview|expected)\b|cards left|cards remaining|left in the deck/i;
const BANNED_ZH = /概率|几率|余张|预估|预览|剩余火牌|牌堆剩余/;

const entries = allFixtures().filter((entry) => B5_KINDS.has(decisionWindow(entry.playerView).kind));

describe("B5 windows render from every fixture", () => {
  it("covers every B5 window kind", () => {
    const kinds = new Set(entries.map((entry) => decisionWindow(entry.playerView).kind));
    expect([...kinds].sort()).toEqual([...B5_KINDS].sort());
  });

  it.each(entries.map((entry) => [entry.id] as const))("%s", (id) => {
    const window = decisionWindow(allFixtures().find((entry) => entry.id === id)!.playerView);
    for (const locale of ["en", "zh-CN"] as const) {
      const html = renderWindow(fixtureSource(id), { locale });
      expect(html).toContain(`data-window="${window.kind}"`);
      for (const stub of B5_STUBS) expect(html, stub).not.toContain(`data-placeholder="${stub}"`);
      const seen = perceivable(html);
      expect(seen).not.toMatch(locale === "en" ? BANNED_EN : BANNED_ZH);
      expect(seen.replace(/Fuel Ledger/g, "")).not.toMatch(/\bledger\b/i);
      expect(seen, "ceramic ID").not.toMatch(/\bc\d+\b/);
    }
  });
});

/** A fixture with an edit, as a source (a state no fixture captured). */
function editedFixtureSource(id: string, edit: (entry: ReturnType<typeof fixture>) => void): FixtureGameSource {
  const entry = structuredClone(fixture(id));
  edit(entry);
  return new FixtureGameSource(entry);
}

const en = (id: string, draft?: unknown) => renderWindow(fixtureSource(id), { locale: "en", ...(draft === undefined ? {} : { draft }) });
const zh = (id: string, draft?: unknown) => renderWindow(fixtureSource(id), { locale: "zh-CN", ...(draft === undefined ? {} : { draft }) });
/** Every `<input>` as its attributes. */
function inputs(html: string): Record<string, string>[] {
  return [...html.matchAll(/<input\b([^>]*)\/?>/g)].map((match) => Object.fromEntries([...(match[1] ?? "").matchAll(/([\w-]+)="([^"]*)"/g)].map((attr) => [attr[1]!, attr[2]!])));
}
const heading = (html: string) => /<h2 [^>]*class="pane-heading"[^>]*>(.*?)<\/h2>/.exec(html)?.[1]?.replace(/<[^>]*>/g, "") ?? "";

const EN = createTranslator("en", { strict: true });
const ZH = createTranslator("zh-CN", { strict: true });

/**
 * A rules-details panel shows only the full rule, then the component's clarifications as plain
 * text (owner review, 2026-10-17): no card text, card facts or source labels. The clarifications
 * come from the data, so the check holds however many a component keeps.
 */
function expectRuleAndClarifications(body: string, items: readonly ClarificationDefinition[], locale: "en" | "zh-CN") {
  const t = locale === "en" ? EN : ZH;
  const headings = [...body.matchAll(/<p class="rd-h">([^<]*)<\/p>/g)].map((match) => decode(match[1]!));
  expect(headings).toEqual([t("rules.fullRule"), ...(items.length > 0 ? [t("rules.clarifications")] : [])]);
  const text = textOf(body);
  for (const item of items) expect(text).toContain(decode(locale === "en" ? item.en : item.zh));
  expect(body, "card text").not.toContain("rd-short");
  expect(body, "card facts").not.toMatch(/<dl\b|<dt>/);
  expect(text, "source label").not.toMatch(/Source:|出处：|Owner (ruling|amendment)|业主(裁定|修订)|Rulebook “|规则书「/);
}
const alt = (html: string) => /data-action="alt"[^>]*>(.*?)<\/button>/.exec(html)?.[1]?.replace(/<[^>]*>/g, "") ?? null;
/** The split Confirm's two buttons (owner UI decision D21). */
const confirmText = (html: string) => /data-action="confirm"[^>]*>(.*?)<\/button>/.exec(html)?.[1]?.replace(/<[^>]*>/g, "") ?? null;
const stayText = (html: string) => /data-action="confirm-stay"[^>]*>(.*?)<\/button>/.exec(html)?.[1]?.replace(/<[^>]*>/g, "") ?? null;
const valuesOf = (html: string, name: string) => [...html.matchAll(/<input[^>]*>/g)].map((match) => match[0]).filter((input) => input.includes(`name="${name}"`)).map((input) => /value="([^"]*)"/.exec(input)?.[1] ?? "");

describe("titles, alternatives and window content", () => {
  it("Contributions: who has chosen, never what; the owner's 5 Contribution cards with Fuel Ledger (v1.6.2 change 26)", () => {
    const html = en("m9_contributions_step1_3p");
    expect(heading(html)).toBe("Choose your Contribution");
    expect(heading(zh("m9_contributions_step1_3p"))).toBe("暗选控火");
    // The participants in First Player order: Lin has chosen (never what), the viewer is choosing.
    expect(perceivable(html)).toMatch(/Lin: chosen Wen \(you\): choosing…/);
    expect(perceivable(html)).not.toMatch(/Lin: chosen [^.]*(Tend|Bank|Stoke)/);
    expect(inputs(html).filter((input) => input["name"] === "card").map((input) => input["value"])).toEqual(["TEND", "BANK", "STOKE", "FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"]);
    expect(inputs(html).some((input) => input["name"] === "fuelLedger")).toBe(false);
    expect(alt(html)).toBeNull();
  });

  it("says First Player order only in the windows whose players take turns (glossary §2.11; Appendix D step 5)", () => {
    // The secret, simultaneous Contributions and Test Pieces (one tile, at the end of step 1).
    for (const id of ["m9_contributions_step1_3p", "m11a_test_pieces_decision", "w-test-pieces-bury"]) {
      expect(perceivable(en(id)), id).toContain("Firing step 1");
      expect(perceivable(en(id)), id).not.toContain("in First Player order");
      expect(perceivable(zh(id)), id).toContain("烧窑步骤1");
      expect(perceivable(zh(id)), id).not.toContain("按起始玩家顺序");
    }
    expect(perceivable(en("m4_after_quality_3p"))).toContain("Firing step 5, in First Player order");
    expect(perceivable(zh("m4_after_quality_3p"))).toContain("烧窑步骤5，按起始玩家顺序");
  });

  it("Test Pieces: the private peek, marked only you", () => {
    const decide = en("m11a_test_pieces_decision");
    expect(heading(decide)).toBe("Use Test Pieces?");
    const bury = en("w-test-pieces-bury");
    expect(heading(bury)).toBe("Test Pieces: the card you saw");
    expect(perceivable(bury)).toContain("The card you saw Only you can see");
    expect(bury).toContain('data-fire="0"');
  });

  it("Kiln Master's marker: chosen at loading, it shows face up on its ceramic in the Jun window (L647, R22; no Heat-marker step)", () => {
    const html = en("m3_kiln_master_marker_3p");
    expect(heading(html)).toBe("Jun Kiln · Kiln Transformation");
    expect(perceivable(html)).toContain("White Plate, Carved (in Middle 1), Kiln Master marker +1");
    expect(html).toContain('class="hm hm--kiln-master"');
    expect(perceivable(zh("m3_kiln_master_marker_3p"))).toContain("窑工标+1");
    // No Heat-marker choice exists any more.
    expect(inputs(html).some((input) => input["name"] === "ownMarker")).toBe(false);
    expect(perceivable(html)).not.toMatch(/Heat marker/);
  });

  it("Jun: decline is the alternative (step 3 only)", () => {
    const first = en("m13_jun_heat_adjustment");
    expect(heading(first)).toBe("Jun Kiln · Kiln Transformation");
    expect(alt(first)).toBe("Decline");
    expect(first).not.toContain('data-form="second-firing"');
    expect(first).not.toContain('name="cardIndex"');
  });

  it("Second Firing: the 2 revealed cards as radios, the ceramic, and R7's Jun when ready; no Quality preview (v1.6.2 L646, D3)", () => {
    const id = "w-second-firing-choice-with-jun-r7";
    const html = en(id);
    expect(heading(html)).toBe("Second Firing: choose a Fire card");
    expect(heading(zh(id))).toBe("「复烧」：选一张窑火牌");
    expect(alt(html)).toBeNull();
    const cards = inputs(html).filter((input) => input["name"] === "cardIndex");
    expect(cards.map((input) => input["value"])).toEqual(["0", "1"]);
    const seen = perceivable(html);
    expect(seen).toContain("Second Firing turned 2 extra Fire cards face up, for everyone to see. Choose the one your ceramic is fired with again.");
    expect(seen).toContain("Ceramic Moon White Bowl, Plain · Flawed (in Low 1)");
    // Two numbered steps: the card, then Jun (R7).
    expect([...html.matchAll(/<span class="kit-optgroup-step" aria-hidden="true">(\d)<\/span><span class="kit-optgroup-title">([^<]*)</g)].map((match) => [match[1], decode(match[2]!)])).toEqual([
      ["1", "Choose a Fire card"],
      ["2", "Kiln Transformation (optional)"],
    ]);
    expect(seen).toContain("The new Quality replaces the old one, even if it is worse.");
    expect(seen).toContain("The 2 cards then go to the Fire discard, face up.");
    expect(seen).toMatch(/Card 1: \+1 .*Card 2: −1/);
    expect(html).toContain('data-fire="1"');
    expect(html).toContain('data-fire="-1"');
    // The card pictures in the radios are decorative (the label says the value), and carry no
    // motion key of their own: the table's cards are the pieces.
    const radios = html.slice(html.indexOf('name="cardIndex"') - 400, html.lastIndexOf('name="cardIndex"') + 900);
    expect(radios).toMatch(/<span aria-hidden="true"><span class="firec[^"]*"/);
    expect(radios).not.toContain("data-motion-key");
    // R7: Jun's +1 or −1 for its Wood, or not to use it ("Do not use" is the default, R4).
    const jun = inputs(html).filter((input) => input["name"] === "jun");
    expect(jun.map((input) => input["value"])).toEqual(["none", "1", "-1"]);
    expect(jun.find((input) => input["value"] === "none")?.["checked"]).toBe("");
    expect(seen).toContain("Cost: 1 Wood On this ceramic, after the recalculation and before its new Quality.");
    expect(seen).not.toMatch(/Actual Heat \d|Heat Difference|would (be|give)/);
    const chinese = perceivable(zh(id));
    expect(chinese).toContain("「复烧」额外翻开了2张窑火牌，大家都能看到。选一张，用它为你的器物复烧。");
    expect(chinese).toContain("新品质取代原来的品质，即使更差也一样。");
    expect(chinese).toContain("这2张牌随后都正面朝上放入窑火弃牌堆。");
    expect(chinese).toContain("「窑变天成」（可选） 费用：1柴 用在这件器物上：重算之后、定新品质之前。");
    // A played Jun owner (m18) gets the same two steps.
    const played = en("m18_jun_second_firing");
    expect(inputs(played).filter((input) => input["name"] === "jun").map((input) => input["value"])).toEqual(["none", "1", "-1"]);
    expect(perceivable(played)).toContain("Kiln Transformation (optional)");
    // No Jun Kiln (the same choice on the Ding Kiln): no Jun at all, and no step numbers.
    const noJun = renderWindow(
      editedFixtureSource(id, (entry) => {
        entry.playerView.game.players[entry.viewerId]!.kilnId = "DI";
      }),
      { locale: "en" },
    );
    expect(inputs(noJun).filter((input) => input["name"] === "jun")).toEqual([]);
    expect(inputs(noJun).filter((input) => input["name"] === "cardIndex")).toHaveLength(2);
    expect(noJun).not.toContain("kit-optgroup-step");
    expect(perceivable(noJun)).not.toContain("Kiln Transformation");
    const chosen = en(id, { cardIndex: 1, jun: 1 });
    expect(/<p class="confirm-summary">(.*?)<\/p>/.exec(chosen)?.[1]?.replace(/<[^>]*>/g, "")).toBe("Fire Moon White Bowl, Plain · Flawed again with Fire card −1, then Kiln Transformation +1 for 1 Wood");
  });

  it.each([
    ["used in step 8", "kilnAbilityUsedThisRound", "Jun Kiln has already been used this round.", "钧窑本轮已用"],
    ["without Wood", "wood", "Not enough Wood: you need 1 and have 0.", "柴不足：需1，现有0"],
  ] as const)("Second Firing: a Jun owner whose Jun is not ready (%s) sees why, with no Jun choice (R7)", (_, change, english, chinese) => {
    const source = () =>
      editedFixtureSource("w-second-firing-choice-with-jun-r7", (entry) => {
        const player = entry.playerView.game.players[entry.viewerId]!;
        if (change === "wood") player.resources.wood = 0;
        else player.kilnAbilityUsedThisRound = true;
      });
    const html = renderWindow(source(), { locale: "en" });
    expect(inputs(html).filter((input) => input["name"] === "jun")).toEqual([]);
    expect(html).not.toContain("kit-optgroup-step");
    expect(perceivable(html)).toContain(`Kiln Transformation (optional) Cost: 1 Wood On this ceramic, after the recalculation and before its new Quality. ${english}`);
    expect(perceivable(renderWindow(source(), { locale: "zh-CN" }))).toContain(chinese);
  });

  it("Contributions with Fuel Ledger: free Bank and Stoke, and its own 2 cards at 1 Wood each (v1.6.2 L644, change 26)", () => {
    const id = "w-secret-contributions-with-fuel-ledger";
    const html = en(id);
    const seen = perceivable(html);
    expect(seen).toMatch(/Tend the Fire no Wood Heat 0/);
    expect(seen).toMatch(/Bank the Fire no Wood: Fuel Ledger Heat −1/);
    expect(seen).toMatch(/Stoke the Fire no Wood: Fuel Ledger Heat \+1/);
    expect(seen).toMatch(/Fuel Ledger Bank 1 Wood at reveal Heat −2 · came with Fuel Ledger/);
    expect(seen).toMatch(/Fuel Ledger Stoke 1 Wood at reveal Heat \+2 · came with Fuel Ledger/);
    expect(seen).not.toMatch(/commit|Secretly commit/i);
    const zhSeen = perceivable(zh(id));
    expect(zhSeen).toContain("压火 不付柴（「柴簿」）");
    expect(zhSeen).toContain("守火 不付柴");
    expect(zhSeen).not.toContain("耗柴");
    expect(zhSeen).toMatch(/柴簿压火 亮牌时付1柴 火候−2 · 随「柴簿」获得/);
    expect(zhSeen).toMatch(/柴簿添柴 亮牌时付1柴 火候\+2 · 随「柴簿」获得/);
    expect(zhSeen).not.toMatch(/暗附|加柴/);
    expect(perceivable(en(id, { card: "FUEL_LEDGER_STOKE" }))).toContain("Submit Fuel Ledger Stoke in secret: Heat +2, 1 Wood at reveal");
    expect(perceivable(zh(id, { card: "FUEL_LEDGER_BANK" }))).toMatch(/暗选\s*柴簿压火\s*：火候−2，亮牌时付1柴/);
    // The Tech the 2 cards came with: its rules details and what it brings.
    expect(seen).toContain("Fuel Ledger Bank and Fuel Ledger Stoke came with Fuel Ledger. With it, your Bank the Fire and Stoke the Fire cost no Wood. Wood is paid at the reveal.");
    expect(html).toMatch(/<span class="rd-name">Fuel Ledger<\/span>/);
    expect(zhSeen).toContain("柴簿压火与柴簿添柴随「柴簿」获得。有了它，你的压火与添柴不付柴。柴在亮牌时支付。");
    // No Wood: its own 2 cards are greyed out with the reason; Bank and Stoke stay free.
    const poor = editedFixtureSource(id, (entry) => {
      entry.playerView.game.players[entry.viewerId]!.resources.wood = 0;
    });
    const poorHtml = renderWindow(poor, { locale: "en" });
    const disabled = inputs(poorHtml).filter((input) => input["name"] === "card" && input["aria-disabled"] === "true").map((input) => input["value"]);
    expect(disabled).toEqual(["FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"]);
    expect(perceivable(poorHtml)).toContain("Not enough Wood");
    expect(perceivable(poorHtml)).toMatch(/Bank the Fire no Wood: Fuel Ledger Heat −1/);
    // Without Fuel Ledger: the 3 cards every player holds, Bank and Stoke at their printed Wood.
    const plain = editedFixtureSource(id, (entry) => {
      const player = entry.playerView.game.players[entry.viewerId]!;
      player.techs = player.techs.filter((tech) => tech.id !== "T12");
      player.contributionCards = player.contributionCards.filter((card) => card === "BANK" || card === "TEND" || card === "STOKE");
    });
    const plainHtml = renderWindow(plain, { locale: "en" });
    expect(inputs(plainHtml).filter((input) => input["name"] === "card").map((input) => input["value"])).toEqual(["TEND", "BANK", "STOKE"]);
    const plainSeen = perceivable(plainHtml);
    expect(plainSeen).toMatch(/Bank the Fire 1 Wood at reveal Heat −1/);
    expect(plainSeen).not.toContain("Fuel Ledger");
  });

  it("after-Quality with Protective Saggars: the floored ceramic says so, Saggars costs nothing, and each summary states the effect (v1.6.2 L643, R4)", () => {
    const id = "w-after-quality-saggars-and-ge";
    const html = en(id);
    const seen = perceivable(html);
    expect(heading(html)).toBe("After-Quality abilities");
    expect(alt(html)).toBe("Done — decline the rest");
    // c2 had a Heat Difference of 3+: Standard, not Flawed, and the window says why.
    expect(seen).toContain("Moon White Plate, Plain · Standard Protective Saggars: counts as Standard, not Flawed");
    expect(seen.match(/Protective Saggars: counts as Standard, not Flawed/g)?.length).toBe(3);
    expect(perceivable(zh(id))).toContain("「匣钵护烧」：算作良品，不为瑕品");
    expect(seen).not.toMatch(/Cost:/);
    expect(seen).not.toContain("Flawed ×");
    const summary = (draft: unknown) => /<p class="confirm-summary">(.*?)<\/p>/.exec(en(id, draft))?.[1]?.replace(/<[^>]*>/g, "");
    expect(summary({ choice: { ability: "protective_saggars", ceramicId: "c2" } })).toBe("Use Protective Saggars: Moon White Plate, Plain · Standard becomes Fine");
    expect(summary({ choice: { ability: "ge_crackle", ceramicId: "c1" } })).toBe("Use Ge Kiln · Crackle Mastery: Moon White Bowl, Plain · Standard gains a Crackle marker and becomes Fine");
    // Rev. 5 L482 (change 39, R30): Ge crackles any ceramic of the firing; a Fine one stays Fine.
    expect(summary({ choice: { ability: "ge_crackle", ceramicId: "c3" } })).toBe("Use Ge Kiln · Crackle Mastery: Celadon Vase, Plain · Fine gains a Crackle marker and stays Fine");
    expect(inputs(html).filter((input) => input["name"] === "afterQuality").map((input) => input["value"])).toEqual([
      "protective_saggars:c1",
      "protective_saggars:c2",
      "ge_crackle:c1",
      "ge_crackle:c2",
      "ge_crackle:c3",
    ]);
    // No sale during the firing (owner revision 5, R26).
    expect(seen).not.toContain("Sell a Flawed ceramic");
    expect(summary({ choice: "end" })).toBe("Finish your after-Quality turn; decline the rest");
  });

  it("after-Quality: once Saggars made the floored ceramic Fine, the window no longer says it counts as Standard", () => {
    // The engine keeps `saggarsFloor` after the upgrade (its invariant allows Standard or Fine);
    // the window stays open because Ge can still Crackle the Bowl.
    const source = editedFixtureSource("w-after-quality-saggars-and-ge", (entry) => {
      const game = entry.playerView.game;
      const record = game.firing!.ceramics["c2"]!;
      record.history = [...record.history, { cause: "protective_saggars", from: "standard", to: "fine" }];
      record.quality = "fine";
      for (const tech of game.players[entry.viewerId]!.techs) if (tech.id === "T11") tech.usedThisRound = true;
    });
    const seen = perceivable(renderWindow(source, { locale: "en" }));
    expect(seen).toContain("Moon White Plate, Plain · Fine");
    expect(seen).not.toContain("counts as Standard");
    expect(perceivable(renderWindow(source, { locale: "zh-CN" }))).not.toContain("「匣钵护烧」：算作良品");
  });

  it("after-Quality: its alternative; there is no salvage window since revision 4 (R20)", () => {
    expect(alt(en("m4_after_quality_3p"))).toBe("Done — decline the rest");
    expect(alt(zh("m4_after_quality_3p"))).toBe("完成——其余不使用");
    for (const entry of allFixtures()) expect(decisionWindow(entry.playerView).kind as string).not.toBe("salvage");
  });

  it("the own after-Quality turn with a Flawed ceramic of this firing offers Second Firing and no sale (owner revision 5, R26)", () => {
    const id = "t-after-quality-no-sale";
    const html = en(id);
    const seen = perceivable(html);
    expect(heading(html)).toBe("After-Quality abilities");
    expect(inputs(html).filter((input) => input["name"] === "afterQuality").map((input) => input["value"])).toEqual(["second_firing:c1"]);
    expect(inputs(html).some((input) => input["name"] === "afterQuality.sell")).toBe(false);
    expect(seen).not.toContain("Sell a Flawed ceramic");
    expect(html).not.toContain('data-act="sell"');
    const chinese = perceivable(zh(id));
    expect(chinese).not.toMatch(/卖出瑕品|折卖/);
  });

  it("Order Phase: the post-firing free-action window; the free-action list of the held Orders it can complete, and Done (D21)", () => {
    const html = en("m6_order_phase_crackle_3p");
    expect(heading(html)).toBe("Order Phase: free actions");
    expect(heading(zh("m6_order_phase_crackle_3p"))).toBe("交货阶段：自由行动");
    expect(alt(html)).toBe("Done");
    // Chinese: 完成 is the verb of completing an Order in this pane, so the button says what it does.
    expect(alt(zh("m6_order_phase_crackle_3p"))).toBe("结束回合");
    expect(perceivable(html)).toContain("Take any number of free actions, one at a time: complete held Orders, sell a Flawed ceramic, use Imperial Priority.");
    // Deliver ⟨Order⟩ per held Order it can complete; the others are not in the list.
    expect(valuesOf(html, "freeAction")).toEqual(["complete-S05", "complete-O38"]);
    expect(perceivable(html)).toContain("Deliver S05");
    expect(perceivable(html)).toContain("Deliver O38");
    expect(perceivable(html)).not.toContain("Deliver S03");
    // With nothing chosen, Done is the only button; a choice brings the split Confirm.
    expect(html).not.toContain('data-action="confirm"');
    const chosen = en("m6_order_phase_crackle_3p", { orderId: "O38", ceramicIds: ["c10", "c11"], declarations: "auto", declineKilnAbility: false, declineTributeWare: false, end: false, sell: null });
    expect(perceivable(chosen)).toContain("Only held Orders can be completed; Orders on the display cannot.");
    expect(confirmText(chosen)).toBe("Deliver · done");
    expect(stayText(chosen)).toBe("Deliver");
    expect(alt(chosen)).toBe("Done");
    // No Flawed ceramic and no Imperial Priority: no sale group, no Imperial Priority form.
    expect(perceivable(html)).not.toContain("Sell a Flawed ceramic");
    expect(html).not.toContain('data-b4="imperial-priority"');
  });

  it("Order Phase: Imperial Priority alone opens the turn; its form says the ceramic waits for the next round's firing (R28)", () => {
    const id = "w-order-phase-imperial-priority";
    const html = en(id);
    expect(heading(html)).toBe("Order Phase: free actions");
    expect(alt(html)).toBe("Done");
    // Its only entry waits for the player's own press; Done is the only button until then (D21).
    expect(valuesOf(html, "freeAction")).toEqual(["imperial_priority"]);
    expect(html).not.toContain('data-b4="imperial-priority"');
    expect(confirmText(html)).toBeNull();
    const open = { orderId: null, ceramicIds: null, declarations: "auto", declineKilnAbility: false, declineTributeWare: false, end: false, sell: null, imperialPriority: { ceramicId: null, glaze: null, modifier: null, rework: null, kilnMaster: null } };
    const form = en(id, open);
    const seen = perceivable(form);
    expect(form).toContain('data-b4="imperial-priority"');
    expect(seen).toContain("A free action that costs nothing.");
    expect(seen).toContain("This round’s firing is over: the ceramic waits in your Imperial Kiln and is fired in the next round’s firing.");
    expect(seen).not.toContain("Deliver");
    expect(perceivable(zh(id, open))).toContain("本轮烧窑已经结束：这件器物留在你的御窑里，到下一轮烧窑时才烧成。");
    // The last round: never fired, said plainly.
    const last = editedFixtureSource(id, (entry) => {
      entry.playerView.game.round = 5;
    });
    expect(perceivable(renderWindow(last, { locale: "en", draft: open }))).toContain("This is the last round: a ceramic loaded now is never fired and does not score.");
    expect(perceivable(renderWindow(last, { locale: "zh-CN", draft: open }))).toContain("这是最后一轮：现在装进御窑的器物不会烧成，也不计分。");
  });

  it("Order Phase with a seeded draft: groups in words, the Crackle verdicts and the rewards (S07's Decoration alternative, change 23)", () => {
    const id = "w-order-phase-with-a-crackle-wildcard";
    const draft = { orderId: "S07", ceramicIds: ["c2"], declarations: [{ ceramicId: "c2", decoration: "plain" }], declineKilnAbility: false, declineTributeWare: false, end: false };
    const html = en(id, draft);
    const seen = perceivable(html);
    expect(seen).toContain("Option 2 Celadon Vase, Plain · Fine · Crackle");
    // "Carved, Impressed or Painted": a Crackle ceramic counts as any one of them, never as Plain.
    expect(seen).toContain("Carved ✓ satisfies S07");
    expect(seen).toContain("Painted ✓ satisfies S07");
    expect(seen).toContain("Plain ✕ does not satisfy S07");
    expect(inputs(html).find((input) => input["name"] === "decoration:c2" && input["value"] === "plain")?.["checked"]).toBe("");
    // The engine's own reason, beside the disabled Confirm.
    expect(html).toMatch(/<p class="confirm-error"[^>]*>[^<]+<\/p>/);
    expect(html).toMatch(/data-action="confirm"[^>]*aria-disabled="true"|aria-disabled="true"[^>]*data-action="confirm"/);
    expect(seen).not.toContain("Rewards");
    const carved = perceivable(en(id, { ...draft, declarations: [{ ceramicId: "c2", decoration: "carved" }] }));
    // The delivered Crackle ceramic's 1 VP shows with the rewards (L484).
    expect(carved).toContain("Rewards +3 VP +3 Coins Crackle: +1 VP");
    expect(carved).toContain("Complete S07 with Celadon Vase, Plain · Fine · Crackle (as Carved)");
  });

  it("Order Phase: Canal Barge's 2 Coins show with the rewards of the first completion of the round (v1.6.2 L637)", () => {
    const id = "m6_order_phase_crackle_3p";
    const withBarge = editedFixtureSource(id, (entry) => {
      const p = entry.playerView.game.players[entry.viewerId]!;
      p.techs = [...p.techs, { id: "T23", acquiredInRound: 1, usedThisRound: false }];
    });
    const draft = { orderId: "S05", ceramicIds: ["c11"], declarations: "auto", declineKilnAbility: false, declineTributeWare: false, end: false };
    const html = renderWindow(withBarge, { locale: "en", draft });
    expect(perceivable(html)).toContain("Rewards +3 VP +4 Coins Canal Barge: +2 Coins");
    expect(perceivable(renderWindow(withBarge, { locale: "zh-CN", draft }))).toContain("「漕船」：得2铜钱");
    // Not offered as a choice: it is automatic, never declined.
    expect(inputs(html).filter((input) => input["name"] === "optional").map((input) => input["value"])).not.toContain("canalBarge");
    expect(perceivable(en(id, draft))).not.toContain("Canal Barge");
  });

  it("Order Phase: a Crackle ceramic delivered scores 1 VP, shown with the rewards (Ge, L484)", () => {
    const id = "m6_order_phase_crackle_3p";
    // S05 with the Ge player's crackled Masterpiece Plate (c10).
    const crackle = { orderId: "S05", ceramicIds: ["c10"], declarations: "auto", declineKilnAbility: false, declineTributeWare: false, end: false };
    expect(perceivable(en(id, crackle))).toContain("Rewards +3 VP +4 Coins Crackle: +1 VP");
    expect(perceivable(zh(id, crackle))).toContain("开片器+1分");
    // Another group without a Crackle ceramic: no Crackle VP.
    expect(perceivable(en(id, { ...crackle, ceramicIds: ["c11"] }))).not.toContain("Crackle: +1 VP");
    // The played Crackle VP moment (m27) opens with such a completion chosen in the gallery.
    const m27 = fixture("m27_crackle_vp_completion");
    expect(m27.draftCommand).toMatchObject({ type: "COMPLETE_ORDER", orderId: "O29", ceramicIds: ["c6", "c13"] });
    expect(perceivable(en("m27_crackle_vp_completion", { orderId: "O29", ceramicIds: ["c6", "c13"], declarations: "auto", declineKilnAbility: false, declineTributeWare: false, end: false }))).toContain("Crackle: +1 VP");
  });

  it("Order Phase: a Flawed ceramic may be sold in the turn (a free action), which the Order Phase opens for even with nothing to complete (R28)", () => {
    const id = "w-order-phase-sell-a-flawed-ceramic";
    const html = en(id);
    const seen = perceivable(html);
    // Its only entry waits for the player's own press: a sale cannot be undone (D21). Then the
    // only ceramic comes chosen too.
    expect(valuesOf(html, "freeAction")).toEqual(["sell_flawed"]);
    expect(seen).toContain("Sell Flawed (+2 Coins)");
    expect(inputs(html).filter((input) => input["name"] === "orders.sell")).toEqual([]);
    expect(alt(html)).toBe("Done");
    expect(confirmText(html)).toBeNull();
    const selling = en(id, { orderId: null, ceramicIds: null, declarations: "auto", declineKilnAbility: false, declineTributeWare: false, end: false, selling: true, sell: "c1" });
    expect(inputs(selling).filter((input) => input["name"] === "orders.sell").map((input) => input["value"])).toEqual(["c1"]);
    expect(confirmText(selling)).toBe("Sell · done");
    expect(stayText(selling)).toBe("Sell");
    const sold = en(id, { orderId: null, ceramicIds: null, declarations: "auto", declineKilnAbility: false, declineTributeWare: false, end: false, sell: "c1" });
    expect(/<p class="confirm-summary">(.*?)<\/p>/.exec(sold)?.[1]?.replace(/<[^>]*>/g, "")).toBe("Sell White Bowl, Plain · Flawed for 2 Coins");
    expect(sold).not.toMatch(/data-action="confirm"[^>]*aria-disabled="true"/);
    // The played moment: a completable Order and a sale in the same turn.
    expect(valuesOf(en("m14_sell_flawed"), "freeAction").filter((value) => value.startsWith("complete-"))).toHaveLength(1);
    expect(valuesOf(en("m14_sell_flawed"), "freeAction")).toContain("sell_flawed");
  });

  it("hand trim: own Orders only you can see, the count and the parallel note", () => {
    const html = en("m7_cleanup_hand_limit_3p");
    expect(heading(html)).toBe("Discard down to your hand limit");
    expect(perceivable(html)).toContain("You hold 5 Orders and your limit is 4: discard exactly 1.");
    expect(perceivable(html)).toContain("Only you can see");
    expect(inputs(html).filter((input) => input["type"] === "checkbox" && input["name"] === "orderIds")).toHaveLength(5);
  });

  it("final: winner, tie-breaker and shared victory from finalResult", () => {
    expect(heading(en("d-final-shared-victory"))).toBe("Shared victory");
    expect(heading(en("m8_final_results_3p"))).toBe("Game over");
    expect(perceivable(en("t-tie-break-winner"))).toContain("Decided by Imperial Recognition.");
    expect(heading(en("t-final-2p"))).toBe("Game over");
    expect(heading(zh("t-final-2p"))).toBe("终局");
  });

  it("waiting: the queue of the step, and someone else's private look", () => {
    expect(perceivable(en("t-fuel-ledger-reveal"))).toContain("Queue Lin: deciding");
    const looking = allFixtures().filter((entry) => {
      const look = entry.playerView.game.counts.pendingLook;
      return decisionWindow(entry.playerView).kind === "waiting" && look !== null && look.playerId !== entry.viewerId;
    });
    for (const entry of looking) expect(perceivable(en(entry.id))).toMatch(/is looking at \d cards? in private/);
  });
});

describe("rules details (D10)", () => {
  it("a Tech: its name opens the full rule and its clarifications, with no card text or source labels", () => {
    const html = en("m9_contributions_step1_3p");
    const body = panel(html, `Full rules: ${techText("T12", "en").name}`);
    expect(textOf(body)).toContain(decode(techText("T12", "en").ability));
    expect(body).not.toContain("<strong>");
    expectRuleAndClarifications(body, TECHS.T12.clarifications, "en");
    const zhBody = panel(zh("m9_contributions_step1_3p"), `完整规则：${techText("T12", "zh-CN").name}`);
    expect(textOf(zhBody)).toContain(decode(techText("T12", "zh-CN").ability));
    expectRuleAndClarifications(zhBody, TECHS.T12.clarifications, "zh-CN");
    expect(html).toMatch(/<button type="button" class="kit-detail-trigger" aria-expanded="false" aria-controls="[^"]+"><span class="rd-name">Fuel Ledger<\/span><\/button>/);
  });

  it("a Kiln: the Kiln Tradition's full rule and every clarification, with no card facts, round state or source labels", () => {
    const name = (locale: "en" | "zh-CN") => `${kilnText("JU", locale).name} · ${kilnText("JU", locale).abilityName}`;
    const body = panel(en("m13_jun_heat_adjustment"), `Full rules: ${name("en")}`);
    expect(textOf(body)).toContain(decode(kilnText("JU", "en").ability));
    expect(textOf(body)).not.toMatch(/Use Once per round|This round (Ready|Used)/);
    expectRuleAndClarifications(body, KILNS.JU.clarifications, "en");
    const zhBody = panel(zh("m13_jun_heat_adjustment"), `完整规则：${name("zh-CN")}`);
    expect(textOf(zhBody)).toContain(decode(kilnText("JU", "zh-CN").ability));
    expectRuleAndClarifications(zhBody, KILNS.JU.clarifications, "zh-CN");
  });

  it("an Order: its requirement and quality line, then the deck's clarifications, with no printed facts", () => {
    const html = en("m6_order_phase_crackle_3p");
    // The list's Deliver entries carry them; O39 is one of the viewer's completable Orders' rules.
    const orderId = valuesOf(html, "freeAction")[1]!.slice("complete-".length);
    expect(orderId).toBe("O38");
    expect(perceivable(html)).toContain("Full rules: Order O38");
    const body = panel(html, "Full rules: Order O38");
    expect(textOf(body)).toContain("Full rule");
    expect(textOf(body)).not.toMatch(/Reward \d+ VP|13 VP|Crown Order Reward/);
    expectRuleAndClarifications(body, ORDER_CLARIFICATIONS.main, "en");
    expect(perceivable(zh("m7_cleanup_hand_limit_3p"))).toContain("完整规则：委托");
  });
});

describe("rules details (D10): one Order trigger across the pane (verifier finding, B5 minor)", () => {
  /** Every Order option's details trigger: the shared "Full rules" pill, inside its option card. */
  function orderTriggers(html: string): { cards: number; pills: string[]; names: string[] } {
    const cards = [...html.matchAll(/class="kit-opt kit-opt--card ord-opt"/g)].length;
    const pills = [...html.matchAll(/<div class="kit-opt kit-opt--card ord-opt"[^>]*>[\s\S]*?<\/label><span class="ord-details">[\s\S]*?class="rd-button"/g)].map((match) => match[0]);
    const names = [...html.matchAll(/aria-label="((?:Full rules: Order|完整规则：委托)[^"]*)"/g)].map((match) => match[1]!);
    return { cards, pills, names };
  }

  it.each(["m6_order_phase_crackle_3p", "m7_cleanup_hand_limit_3p"])("%s: \"Full rules: Order Oxx\" pills, never \"Details:\"", (id) => {
    const english = en(id);
    const found = orderTriggers(english);
    expect(found.cards).toBeGreaterThan(0);
    expect(found.pills).toHaveLength(found.cards);
    expect(found.names.length).toBeGreaterThanOrEqual(found.cards);
    for (const name of found.names) expect(name).toMatch(/^Full rules: Order [OS]\d{2}$/);
    expect(perceivable(english)).not.toContain("Details:");
    expect(perceivable(english)).not.toMatch(/\bRules: Order/);
    const chinese = zh(id);
    expect(orderTriggers(chinese).names.every((name) => /^完整规则：委托[OS]\d{2}$/.test(name))).toBe(true);
    expect(orderTriggers(chinese).names.length).toBeGreaterThan(0);
    expect(perceivable(chinese)).not.toContain("详情：");
  });
});

describe("rules details (D10): Imperial Recognition beside a completion's Crowns", () => {
  // O22 (1 Crown) in the scripted Ru / Tribute Ware Order Phase.
  const CROWNS = "w-order-phase-with-ru-and-tribute-ware";
  const draft = { orderId: "O22", ceramicIds: ["c1"], declarations: "auto", declineKilnAbility: false, declineTributeWare: false, end: false };

  it("lists the milestones, the reward beyond the track and the Crown clarifications, with no track facts or source labels", () => {
    const html = en(CROWNS, draft);
    const seen = perceivable(html);
    expect(html).toMatch(/<span class="rd-name">Imperial Recognition<\/span>/);
    expect(seen).toContain("Crowns advance Imperial Recognition one at a time, resolving every milestone crossed; beyond Recognition 4, each Crown scores 1 VP immediately.");
    const body = panel(html, "Full rules: Imperial Recognition");
    const text = textOf(body);
    expect(text).toContain("Recognition 1 · Imperial Grant");
    expect(text).toContain("Recognition 4 · Imperial Audience");
    expect(text).toContain("Each further Crown: +1 VP");
    expect(text).not.toContain("Track Recognition 0–4");
    expectRuleAndClarifications(body, IMPERIAL_TRACK.clarifications.imperial_overflow, "en");
    const zhHtml = renderWindow(fixtureSource(CROWNS), { locale: "zh-CN", draft });
    const zhBody = panel(zhHtml, "完整规则：御府声望");
    expect(textOf(zhBody)).toContain("声望2 · 赐御窑");
    expect(textOf(zhBody)).toContain("声望满后每个御令+1分");
    expectRuleAndClarifications(zhBody, IMPERIAL_TRACK.clarifications.imperial_overflow, "zh-CN");
  });

  it("is not offered for an Order without Crowns", () => {
    const html = en("m6_order_phase_crackle_3p", { orderId: "S05", ceramicIds: ["c11"], declarations: "auto", declineKilnAbility: false, declineTributeWare: false, end: false });
    expect(perceivable(html)).toContain("Rewards +3 VP +4 Coins");
    expect(html).not.toContain('<span class="rd-name">Imperial Recognition</span>');
    expect(html).not.toContain("ord-crown-note");
  });
});

/** Prints the table selection the open window's draft drives. */
function TableProbe() {
  const selection = useTableSelection();
  return (
    <pre data-probe="">
      {JSON.stringify({
        orderTargets: Object.fromEntries([...selection.orderTargets].map(([key, target]) => [key, target.state])),
        highlighted: [...selection.highlightedCeramicIds],
        sellTargets: Object.fromEntries([...selection.sellTargets].map(([key, target]) => [key, target.pressed])),
      })}
    </pre>
  );
}

function probe(id: string, draft: unknown): { orderTargets: Record<string, string>; highlighted: string[]; sellTargets: Record<string, boolean> } {
  const html = renderComponent(
    fixtureSource(id),
    <>
      <DecisionPane />
      <TableProbe />
    </>,
    { draft },
  );
  const json = /<pre data-probe="">(.*?)<\/pre>/.exec(html)?.[1] ?? "{}";
  return JSON.parse(json.replace(/&quot;/g, '"'));
}

describe("seeded drafts drive the table (§3.5)", () => {
  it("Order Phase: Order states and the chosen group's ceramics", () => {
    const result = probe("m6_order_phase_crackle_3p", { orderId: "O38", ceramicIds: ["c10", "c11"], declarations: "auto", declineKilnAbility: false, declineTributeWare: false, end: false });
    expect(result.orderTargets).toEqual({ S05: "completable", S03: "blocked", O38: "chosen", O39: "blocked" });
    expect(result.highlighted).toEqual(["c10", "c11"]);
    expect(result.sellTargets).toEqual({});
  });

  it("hand trim: the Orders marked for discard", () => {
    const result = probe("w-cleanup-hand-limit", { orderIds: ["O01", "S02"] });
    expect(result.orderTargets).toEqual({ S01: "choosable", S02: "discard", O01: "discard", O02: "choosable", O03: "choosable", O04: "choosable" });
  });

  it("firing windows highlight the draft's target ceramic", () => {
    expect(probe("w-after-quality-saggars-and-ge", { choice: { ability: "protective_saggars", ceramicId: "c2" } }).highlighted).toEqual(["c2"]);
    expect(probe("w-jun-heat-adjustment", { ceramicId: "c1", delta: 1, decline: false }).highlighted).toEqual(["c1"]);
  });

  it("the Order Phase puts a Sell button on each sellable Flawed ceramic, the chosen one pressed; the firing and the trim put none (R26, R28)", () => {
    expect(probe("w-order-phase-sell-a-flawed-ceramic", { orderId: null, ceramicIds: null, declarations: "auto", declineKilnAbility: false, declineTributeWare: false, end: false, sell: null }).sellTargets).toEqual({ c1: false });
    const chosen = probe("w-order-phase-sell-a-flawed-ceramic", { orderId: null, ceramicIds: null, declarations: "auto", declineKilnAbility: false, declineTributeWare: false, end: false, sell: "c1" });
    expect(chosen.sellTargets).toEqual({ c1: true });
    expect(chosen.highlighted).toEqual(["c1"]);
    // No free actions during the firing or at Cleanup: no Sell button, a Flawed ceramic or not.
    expect(probe("t-after-quality-no-sale", { choice: null }).sellTargets).toEqual({});
    expect(probe("t-cleanup-no-sale", { orderIds: [] }).sellTargets).toEqual({});
    expect(probe("w-after-quality-saggars-and-ge", { choice: null }).sellTargets).toEqual({});
  });
});
