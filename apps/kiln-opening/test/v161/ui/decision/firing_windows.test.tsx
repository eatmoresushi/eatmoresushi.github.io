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
  "heat_markers",
  "jun",
  "after_quality",
  "second_firing",
  "salvage",
  "orders",
  "hand_limit",
  "final",
  "waiting",
]);

const B5_STUBS = ["Contributions", "TestPieces", "HeatMarkers", "Jun", "AfterQuality", "SecondFiring", "Salvage", "OrderTurn", "OrderCompletionPicker", "CrackleDeclarations", "HandTrim", "FinalSummary", "Waiting"];

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

describe("titles, alternatives and window content", () => {
  it("Contributions: who has chosen, never what; the owner's 5 Contribution cards with Fuel Ledger (v1.6.2 change 26)", () => {
    const html = en("m9_contributions_step1_3p");
    expect(heading(html)).toBe("Choose your Contribution");
    expect(heading(zh("m9_contributions_step1_3p"))).toBe("暗选控火");
    // First Player order from Zhao: Zhao has chosen (never what), the viewer is choosing; Wen has no ceramic in the Shared Kiln.
    expect(perceivable(html)).toMatch(/Zhao: chosen .*Lin \(you\): choosing…/);
    expect(perceivable(html)).not.toMatch(/Zhao: chosen [^.]*(Tend|Bank|Stoke)/);
    expect(perceivable(html)).not.toMatch(/Wen: (chosen|choosing)/);
    expect(inputs(html).filter((input) => input["name"] === "card").map((input) => input["value"])).toEqual(["TEND", "BANK", "STOKE", "FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"]);
    expect(inputs(html).some((input) => input["name"] === "fuelLedger")).toBe(false);
    expect(alt(html)).toBeNull();
  });

  it("Test Pieces: the private peek, marked only you", () => {
    const decide = en("m11a_test_pieces_decision");
    expect(heading(decide)).toBe("Use Test Pieces?");
    const bury = en("w-test-pieces-bury");
    expect(heading(bury)).toBe("Test Pieces: the card you saw");
    expect(perceivable(bury)).toContain("The card you saw Only you can see");
    expect(bury).toContain('data-fire="0"');
  });

  it("Heat markers: the marked ceramic in words with its place, and the three choices", () => {
    const html = en("m3_heat_marker_step_3p");
    expect(heading(html)).toBe("Decide your Heat marker");
    expect(perceivable(html)).toContain("White Censer, Painted (in Middle 2), Heat marker, face down");
    expect(inputs(html).filter((input) => input["name"] === "ownMarker").map((input) => input["value"])).toEqual(["1", "-1", "return"]);
    expect(perceivable(html)).toContain("Adds +1 to this ceramic’s Actual Heat.");
  });

  it("Jun: decline is the alternative (step 8 only)", () => {
    const first = en("m13_jun_heat_adjustment");
    expect(heading(first)).toBe("Jun Kiln · Kiln Transformation");
    expect(alt(first)).toBe("Decline");
    expect(first).not.toContain('data-form="second-firing"');
    expect(first).not.toContain('name="cardIndex"');
  });

  it("Second Firing: the 2 revealed cards as radios, the ceramic, and R7's Jun when ready; no Quality preview (v1.6.2 L631, D3)", () => {
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

  it("Contributions with Fuel Ledger: free Bank and Stoke, and its own 2 cards at 1 Wood each (v1.6.2 L634, change 26)", () => {
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

  it("after-Quality with Protective Saggars: the floored ceramic says so, Saggars costs nothing, and each summary states the effect (v1.6.2 L636, R4)", () => {
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
    expect(summary({ choice: { ability: "ge_crackle", ceramicId: "c1" } })).toBe("Use Ge Kiln · Crackle Mastery: Moon White Bowl, Plain · Standard becomes Fine with a Crackle marker");
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

  it("after-Quality and Salvage: their alternatives", () => {
    expect(alt(en("m4_after_quality_3p"))).toBe("Done — decline the rest");
    expect(alt(zh("m4_after_quality_3p"))).toBe("完成——其余不使用");
    expect(alt(en("m14_salvage"))).toBe("Keep it");
    expect(heading(en("m14_salvage"))).toBe("Salvage a Flawed ceramic");
  });

  it("Order Phase: held Orders only, End turn, and the note that the display cannot be completed", () => {
    const html = en("m6_order_phase_crackle_3p");
    expect(heading(html)).toBe("Complete held Orders");
    expect(alt(html)).toBe("End turn");
    expect(perceivable(html)).toContain("2 of 5 can be completed");
    expect(perceivable(html)).toContain("O42 16 VP 0 Coins ×2 2 Crowns Brush Washer + Censer; different Glazes; same Decoration · Fine+ each; ≥1 Masterpiece No matching ceramics");
    expect(perceivable(html)).not.toMatch(/O25 9 VP 5 Coins [^.]*No matching ceramics/);
    expect(perceivable(html)).toContain("Only held Orders can be completed; Orders on the display cannot.");
  });

  it("Order Phase with a seeded draft: groups in words, the Crackle verdicts and the rewards (S07's Decoration alternative, change 23)", () => {
    const id = "w-order-phase-with-ru-tribute-ware-and-a-crackle-wildcard";
    const draft = { orderId: "S07", ceramicIds: ["c3"], declarations: [{ ceramicId: "c3", decoration: "plain" }], declineKilnAbility: false, declineTributeWare: false, end: false };
    const html = en(id, draft);
    const seen = perceivable(html);
    expect(seen).toContain("Option 1 Celadon Vase, Plain · Fine · Crackle");
    // "Carved, Impressed or Painted": a Crackle ceramic counts as any one of them, never as Plain.
    expect(seen).toContain("Carved ✓ satisfies S07");
    expect(seen).toContain("Painted ✓ satisfies S07");
    expect(seen).toContain("Plain ✕ does not satisfy S07");
    expect(inputs(html).find((input) => input["name"] === "decoration:c3" && input["value"] === "plain")?.["checked"]).toBe("");
    // The engine's own reason, beside the disabled Confirm.
    expect(html).toMatch(/<p class="confirm-error"[^>]*>[^<]+<\/p>/);
    expect(html).toMatch(/data-action="confirm"[^>]*aria-disabled="true"|aria-disabled="true"[^>]*data-action="confirm"/);
    expect(seen).not.toContain("Rewards");
    const carved = perceivable(en(id, { ...draft, declarations: [{ ceramicId: "c3", decoration: "carved" }] }));
    expect(carved).toContain("Rewards +3 VP +3 Coins");
    expect(carved).toContain("Complete S07 with Celadon Vase, Plain · Fine · Crackle (as Carved)");
  });

  it("Order Phase: Canal Barge's 2 Coins show with the rewards of the first completion of the round (v1.6.2 L622)", () => {
    const id = "m6_order_phase_crackle_3p";
    const withBarge = editedFixtureSource(id, (entry) => {
      const p = entry.playerView.game.players[entry.viewerId]!;
      p.techs = [...p.techs, { id: "T23", acquiredInRound: 1, usedThisRound: false }];
    });
    const draft = { orderId: "O25", ceramicIds: ["c5", "c9"], declarations: "auto", declineKilnAbility: false, declineTributeWare: false, end: false };
    const html = renderWindow(withBarge, { locale: "en", draft });
    expect(perceivable(html)).toContain("Rewards +9 VP +5 Coins Canal Barge: +2 Coins");
    expect(perceivable(renderWindow(withBarge, { locale: "zh-CN", draft }))).toContain("「漕船」：得2铜钱");
    // Not offered as a choice: it is automatic, never declined.
    expect(inputs(html).filter((input) => input["name"] === "optional").map((input) => input["value"])).not.toContain("canalBarge");
    expect(perceivable(en(id, draft))).not.toContain("Canal Barge");
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
    expect(heading(en("m8_final_results_4p"))).toBe("Game over");
    expect(perceivable(en("t-tie-break-winner"))).toContain("Decided by Imperial Recognition.");
    expect(heading(en("t-final-2p"))).toBe("Game over");
    expect(heading(zh("t-final-2p"))).toBe("终局");
  });

  it("waiting: the queue of the step, and someone else's private look", () => {
    expect(perceivable(en("t-imperial-only-firing"))).toContain("Queue Lin: deciding");
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
    expect(perceivable(html)).toContain("Full rules: Order O25");
    const body = panel(html, "Full rules: Order O25");
    expect(textOf(body)).toContain("Full rule 2 different Shapes; any Glazes; any Decorations Standard+ each");
    expect(textOf(body)).not.toMatch(/Reward \d+ VP|9 VP|Crown Order Reward/);
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
  const CROWNS = "w-order-phase-with-ru-tribute-ware-and-a-crackle-wildcard";
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
    const html = en("m6_order_phase_crackle_3p", { orderId: "O25", ceramicIds: ["c5", "c9"], declarations: "auto", declineKilnAbility: false, declineTributeWare: false, end: false });
    expect(perceivable(html)).toContain("Rewards +9 VP +5 Coins");
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
      })}
    </pre>
  );
}

function probe(id: string, draft: unknown): { orderTargets: Record<string, string>; highlighted: string[] } {
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
    const result = probe("m6_order_phase_crackle_3p", { orderId: "O25", ceramicIds: ["c5", "c9"], declarations: "auto", declineKilnAbility: false, declineTributeWare: false, end: false });
    expect(result.orderTargets).toEqual({ S07: "completable", O42: "blocked", O46: "blocked", O25: "chosen", O40: "blocked" });
    expect(result.highlighted).toEqual(["c5", "c9"]);
  });

  it("hand trim: the Orders marked for discard", () => {
    const result = probe("w-cleanup-hand-limit", { orderIds: ["O01", "S02"] });
    expect(result.orderTargets).toEqual({ S01: "choosable", S02: "discard", O01: "discard", O02: "choosable", O03: "choosable", O04: "choosable" });
  });

  it("firing windows highlight the draft's target ceramic", () => {
    expect(probe("w-after-quality-saggars-and-ge", { choice: { ability: "protective_saggars", ceramicId: "c2" } }).highlighted).toEqual(["c2"]);
    expect(probe("w-jun-heat-adjustment", { ceramicId: "c1", delta: 1, decline: false }).highlighted).toEqual(["c1"]);
    expect(probe("w-salvage", { choice: "c1" }).highlighted).toEqual(["c1"]);
    expect(probe("w-heat-marker-step-with-a-face-down-marker-and-kiln-master", { own: "return", kmTarget: "c2", kmValue: 1 }).highlighted).toEqual(["c1", "c2"]);
  });
});
