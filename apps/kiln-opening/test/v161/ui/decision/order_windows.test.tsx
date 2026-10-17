/**
 * The Order Phase window with V1.6.2's Starting deck and Canal Barge (owner revision 2, change
 * 23; v1.6.2 L622), rendered in English and Chinese. Owner: the Orders area.
 *
 * - S07 "Carved, Impressed or Painted": a Crackle ceramic's auto declaration says what it counts
 *   as ("Counts as Carved."), from the engine's own search (`crackleDeclarationChecks`), and the
 *   ConfirmBar summary names it; an explicit declaration of the printed Decoration is not
 *   repeated as "(as Plain)".
 * - Canal Barge's 2 Coins show with the rewards of the played moment m23, automatic: never an
 *   optional ability, never a field of the command.
 * - The window keeps to the table's information (D3/D4), names no ceramic by ID (D9) and offers
 *   a "Full rules" pill on each Order (D10).
 */
import { describe, expect, it } from "vitest";
import { crackleDeclarationChecks } from "../../../../src/game/index.ts";
import type { CeramicId, OrderId } from "../../../../src/game/index.ts";
import { orderDraft } from "../../../../src/app/decision/orders/orderDraft.ts";
import { decorationName } from "../../../../src/app/i18n/content.ts";
import { buildGameModel, engineViewOf } from "../../../../src/app/state/model.ts";
import { fixture, fixtureSource } from "../support/fixtures.ts";
import { renderWindow } from "../support/render.tsx";

/** What a player perceives: text nodes plus `aria-label`, `title` and `alt` values. */
function perceivable(html: string): string {
  const attributes = [...html.matchAll(/\s(?:aria-label|title|alt)="([^"]*)"/g)].map((match) => match[1]);
  return [html.replace(/<[^>]*>/g, " "), ...attributes].join(" ").replace(/\s+/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');
}

/** Every `<input>` as its attributes. */
function inputs(html: string): Record<string, string>[] {
  return [...html.matchAll(/<input\b([^>]*)\/?>/g)].map((match) => Object.fromEntries([...(match[1] ?? "").matchAll(/([\w-]+)="([^"]*)"/g)].map((attr) => [attr[1]!, attr[2]!])));
}

const RU = "w-order-phase-with-ru-tribute-ware-and-a-crackle-wildcard";
const draftOf = (orderId: OrderId, ceramicIds: CeramicId[], declarations: unknown = "auto") => ({
  orderId,
  ceramicIds,
  declarations,
  declineKilnAbility: false,
  declineTributeWare: false,
  end: false,
});

/** The Decoration the engine's auto search records for one Crackle ceramic of a group. */
function autoDecoration(id: string, orderId: OrderId, ceramicIds: CeramicId[]) {
  const view = fixture(id).playerView;
  const checks = crackleDeclarationChecks(view, orderId, ceramicIds, []);
  if (!checks.auto.ok) throw new Error("the auto mode completes nothing");
  const [entry] = checks.auto.match.crackleDeclarations;
  if (entry === undefined) throw new Error("no Crackle declaration recorded");
  return entry.decoration;
}

describe("S07 \"Carved, Impressed or Painted\" (change 23)", () => {
  const draft = draftOf("S07", ["c3"]);

  it("the auto declaration says which of the three the Crackle ceramic counts as, in both languages", () => {
    const recorded = autoDecoration(RU, "S07", ["c3"]);
    expect(["carved", "impressed", "painted"]).toContain(recorded);
    const en = perceivable(renderWindow(fixtureSource(RU), { locale: "en", draft }));
    expect(en).toContain(`Find a declaration for me ✓ satisfies S07 The game picks Decorations for your Crackle ceramics that complete the Order, and records them. Counts as ${decorationName(recorded, "en")}.`);
    expect(en).toContain(`Complete S07 with Celadon Vase, Plain · Fine · Crackle (as ${decorationName(recorded, "en")})`);
    expect(en).toContain("Rewards +3 VP +3 Coins");
    const zh = perceivable(renderWindow(fixtureSource(RU), { locale: "zh-CN", draft }));
    expect(zh).toContain(`视为${decorationName(recorded, "zh-CN")}。`);
    expect(zh).toContain(`（视为${decorationName(recorded, "zh-CN")}）`);
    expect(zh).toContain("满足S07");
  });

  it("the auto command still omits the declaration; the engine records its own", () => {
    const view = structuredClone(fixture(RU).playerView);
    const model = buildGameModel(view, []);
    const engine = engineViewOf(view);
    expect(orderDraft.build(draft as never, model, engine)).toEqual({ type: "COMPLETE_ORDER", orderId: "S07", ceramicIds: ["c3"] });
  });

  it("an explicit declaration of the printed Decoration is not repeated as \"(as Plain)\" and does not satisfy S07", () => {
    const plain = perceivable(renderWindow(fixtureSource(RU), { locale: "en", draft: draftOf("S07", ["c3"], [{ ceramicId: "c3", decoration: "plain" }]) }));
    expect(plain).toContain("Complete S07 with Celadon Vase, Plain · Fine · Crackle");
    expect(plain).not.toContain("(as Plain)");
    expect(plain).toContain("Plain ✕ does not satisfy S07");
    // The auto choice beside it still says what it would record.
    expect(plain).toContain("Find a declaration for me ✓ satisfies S07");
  });

  it("a group without a Crackle ceramic has no declaration step", () => {
    const html = renderWindow(fixtureSource(RU), { locale: "en", draft: draftOf("S01", ["c4"]) });
    expect(inputs(html).some((input) => input["name"] === "crackleDeclarations")).toBe(false);
    expect(perceivable(html)).not.toContain("Counts as");
  });
});

describe("m23: S07 with Canal Barge, a played moment (v1.6.2 L622)", () => {
  const id = "m23_order_phase_s07";
  const s07Group = () => {
    const view = fixture(id).playerView;
    const model = buildGameModel(structuredClone(view), []);
    const engine = engineViewOf(structuredClone(view));
    const chosen = orderDraft.reduce(orderDraft.initial(model, engine), { type: "order", orderId: "S07" }, model, engine);
    if (chosen.ceramicIds === null) throw new Error("S07 has several groups in m23");
    return chosen;
  };

  it("lists S07's printed requirement and shows Canal Barge's 2 Coins with the rewards, in both languages", () => {
    const draft = s07Group();
    const en = perceivable(renderWindow(fixtureSource(id), { locale: "en", draft }));
    expect(en).toContain("S07 3 VP 3 Coins any Shape · any Glaze · Carved, Impressed or Painted · Standard+");
    expect(en).toMatch(/Rewards \+3 VP \+3 Coins Canal Barge: \+2 Coins/);
    expect(en).toContain("Full rules: Order S07");
    const zh = perceivable(renderWindow(fixtureSource(id), { locale: "zh-CN", draft }));
    expect(zh).toContain("任意器型 · 任意釉 · 刻花、印花或画花");
    expect(zh).toContain("「漕船」：得2铜钱");
  });

  it("Canal Barge is never a choice: no optional checkbox, and the command carries no flag for it", () => {
    const draft = s07Group();
    const html = renderWindow(fixtureSource(id), { locale: "en", draft });
    expect(inputs(html).filter((input) => input["name"] === "optional").map((input) => input["value"])).not.toContain("canalBarge");
    const view = structuredClone(fixture(id).playerView);
    const command = orderDraft.build(draft, buildGameModel(view, []), engineViewOf(view));
    expect(command?.type).toBe("COMPLETE_ORDER");
    expect(Object.keys(command ?? {}).sort()).toEqual(["ceramicIds", "orderId", "type"]);
  });

  it("shows no odds, previews or ceramic IDs (D3, D4, D9)", () => {
    for (const locale of ["en", "zh-CN"] as const) {
      const seen = perceivable(renderWindow(fixtureSource(id), { locale, draft: s07Group() }));
      expect(seen).not.toMatch(/\b(odds|chance|probability|preview|expected)\b|概率|几率|预估|预览/i);
      expect(seen).not.toMatch(/\bc\d+\b/);
    }
  });
});
