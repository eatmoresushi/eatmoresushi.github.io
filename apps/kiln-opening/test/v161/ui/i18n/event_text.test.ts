/**
 * Event text templates (UI_V1.6.1_ARCHITECTURE §5 gap 4, §9.2; B1).
 *
 * - `EVENT_TEXT` covers every `GameEventType` (the typed sample table below fails `typecheck` if
 *   one is missing), and every template renders in English and Chinese with a strict translator:
 *   no placeholder left, no internal ID (D9), no `undefined`/`NaN`.
 * - Every fixture's log renders in both languages, own secrets included, with none of that
 *   viewer's secret Order or Tech IDs.
 * - Own-secret variants are used only for the viewer's own secret; another seat's secret is
 *   never read (it falls back to the public line).
 * - D3/D4: no odds, preview or Fire-deck count wording; the Contribution submission never names
 *   a card. D7: an added personal space is never "unlocked".
 */
import { describe, expect, it } from "vitest";
import type { GameEvent, GameEventType, LoadedCeramic, PlayerId, PublicGameEvent } from "../../../../src/game/index.ts";
import { EVENT_TEXT, OWN_EVENT_TEXT, OWN_SECRET_TYPES, eventText, foldedEntry, ownSecretOf, publicEventText, repeatsNextEntry, repeatsPreviousEntry } from "../../../../src/app/i18n/events.ts";
import type { EventTextContext } from "../../../../src/app/i18n/events.ts";
import type { CeramicFacts, CeramicLabelModelView } from "../../../../src/app/i18n/ceramicLabel.ts";
import { createTranslator } from "../../../../src/app/i18n/translator.ts";
import type { Locale } from "../../../../src/app/i18n/translator.ts";
import { fixtureSnapshot } from "../../../../src/app/session/fixtureSource.ts";
import type { LogEntry } from "../../../../src/app/session/gameSource.ts";
import { gameModelOf } from "../../../../src/app/state/model.ts";
import { logCeramicView } from "../../../../src/app/shell/logCeramics.ts";
import { allFixtures, fixture, secretIds } from "../support/fixtures.ts";

const LOCALES: readonly Locale[] = ["en", "zh-CN"];
const translators = { en: createTranslator("en", { strict: true }), "zh-CN": createTranslator("zh-CN", { strict: true }) } as const;

const CERAMICS: Readonly<Record<string, CeramicFacts>> = {
  c1: { id: "c1", ownerId: "p1", shape: "bowl", decoration: "carved", glaze: "celadon", stage: "loaded", placement: { kiln: "shared", spaceId: "high_1", stacked: false } },
  c2: { id: "c2", ownerId: "p2", shape: "vase", decoration: "painted", glaze: null, stage: "shaped" },
  c3: { id: "c3", ownerId: "p1", shape: "censer", decoration: "plain", glaze: "moon_white", quality: "fine", crackle: true, stage: "finished" },
};

const VIEW: CeramicLabelModelView = {
  viewerId: "p1",
  players: [
    { playerId: "p1", displayName: "Lin" },
    { playerId: "p2", displayName: "Zhao" },
  ],
  ceramics: CERAMICS,
};

const context = (locale: Locale, view: CeramicLabelModelView = VIEW, viewerId: PlayerId | null = "p1"): EventTextContext => ({
  t: translators[locale],
  view,
  viewerId,
});

const FINAL = fixture("t-final-2p").playerView.game.finalResult;
if (FINAL === null) throw new Error("t-final-2p has no final result");
const calc = {} as never;

/** One public sample per event type; a missing type fails `typecheck`. */
const SAMPLES: { readonly [T in GameEventType]: Extract<PublicGameEvent, { type: T }> } = {
  GAME_CREATED: { type: "GAME_CREATED", playerOrder: ["p1", "p2"], firstPlayerId: "p1", playerCount: 2 },
  ORDERS_DEALT: { type: "ORDERS_DEALT", playerId: "p2", startingCount: 2 },
  KILN_SELECTED: { type: "KILN_SELECTED", playerId: "p2", kilnId: "JU" },
  ROUND_STARTED: { type: "ROUND_STARTED", round: 2, firstPlayerId: "p2" },
  KILN_DIE_ROLLED: { type: "KILN_DIE_ROLLED", round: 2, value: 3 },
  MAIN_DISPLAY_ROTATED: { type: "MAIN_DISPLAY_ROTATED", round: 2, discardedOrderIds: ["O04", "O11"], display: [] },
  DISPLAY_REFILLED: { type: "DISPLAY_REFILLED", cause: "end_of_turn", revealedOrderIds: ["O33"], display: [] },
  MAIN_DECK_RESHUFFLED: { type: "MAIN_DECK_RESHUFFLED", cardCount: 12 },
  ABILITIES_READIED: { type: "ABILITIES_READIED", round: 2 },
  SETTERS_MARK_PLACED: { type: "SETTERS_MARK_PLACED", playerId: "p2", spaceId: "middle_2" },
  SETTERS_MARK_RETURNED: { type: "SETTERS_MARK_RETURNED", playerId: "p2", spaceId: "middle_2", cause: "cleanup" },
  WORK_TURN_STARTED: { type: "WORK_TURN_STARTED", playerId: "p2" },
  WORKER_PLACED: { type: "WORKER_PLACED", playerId: "p2", workerId: "p2:shifu", kind: "shifu", locationId: "materials_yard", spaceIndex: 0, effect: "shifu", viaSeniorApprentice: false },
  RESOURCES_CHANGED: { type: "RESOURCES_CHANGED", playerId: "p2", clay: 0, wood: 0, coins: 2, reason: "canal_barge" },
  CERAMIC_FORMED: { type: "CERAMIC_FORMED", playerId: "p2", ceramicId: "c2", shape: "vase", decoration: "painted", formedBy: "prepared_clay" },
  CERAMIC_RESHAPED: { type: "CERAMIC_RESHAPED", playerId: "p1", ceramicId: "c1", from: "plate", to: "bowl" },
  CERAMIC_LOADED: { type: "CERAMIC_LOADED", playerId: "p1", ceramicId: "c1", glaze: "celadon", placement: { kiln: "shared", spaceId: "high_1", stacked: false }, loadedBy: "glaze_load" },
  KILN_FURNITURE_PLACED: { type: "KILN_FURNITURE_PLACED", playerId: "p1", spaceId: "high_1", modifier: -1 },
  ORDER_RESERVED: { type: "ORDER_RESERVED", playerId: "p2", via: "commission_market", source: "face_up", slotIndex: 2, orderId: "O17" },
  PRIVATE_LOOK_OPENED: { type: "PRIVATE_LOOK_OPENED", playerId: "p2", kind: "commission_market", discipline: null, count: 3 },
  LOOKED_ORDERS_DISCARDED: { type: "LOOKED_ORDERS_DISCARDED", playerId: "p2", count: 2 },
  HELD_ORDER_DISCARDED: { type: "HELD_ORDER_DISCARDED", playerId: "p2", cause: "colour_samples_swap", to: "main_discard" },
  TECH_ACQUIRED: { type: "TECH_ACQUIRED", playerId: "p2", techId: "T13", source: "face_up", cost: 3 },
  CONTRIBUTION_CARDS_GAINED: { type: "CONTRIBUTION_CARDS_GAINED", playerId: "p2", techId: "T12", cards: ["FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"] },
  TECHS_RETURNED_TO_BOTTOM: { type: "TECHS_RETURNED_TO_BOTTOM", playerId: "p2", discipline: "firing", count: 1 },
  TECH_DISPLAY_REFILLED: { type: "TECH_DISPLAY_REFILLED", discipline: "workshop", revealedTechIds: ["T05"], display: ["T05", "T16"] },
  PERSONAL_SPACE_UNLOCKED: { type: "PERSONAL_SPACE_UNLOCKED", playerId: "p2", locationId: "form_decorate" },
  TECH_USED: { type: "TECH_USED", playerId: "p2", techId: "T13" },
  KILN_ABILITY_USED: { type: "KILN_ABILITY_USED", playerId: "p2", kilnId: "JU" },
  IMPERIAL_PRIORITY_USED: { type: "IMPERIAL_PRIORITY_USED", playerId: "p1", ceramicId: "c1", window: "before_action" },
  WORK_TURN_ENDED: { type: "WORK_TURN_ENDED", playerId: "p2", automatic: false },
  WORK_PHASE_ENDED: { type: "WORK_PHASE_ENDED", round: 2 },
  RECOGNITION_ADVANCED: { type: "RECOGNITION_ADVANCED", playerId: "p2", from: 1, to: 2, source: "printed_crown", orderId: "O33" },
  CROWN_OVERFLOW_VP: { type: "CROWN_OVERFLOW_VP", playerId: "p2", source: "printed_crown", vp: 1 },
  IMPERIAL_GRANT_RECEIVED: { type: "IMPERIAL_GRANT_RECEIVED", playerId: "p2", clay: 1, wood: 1, coins: 1 },
  IMPERIAL_KILN_GAINED: { type: "IMPERIAL_KILN_GAINED", playerId: "p2" },
  IMPERIAL_PRIORITY_GAINED: { type: "IMPERIAL_PRIORITY_GAINED", playerId: "p2" },
  IMPERIAL_AUDIENCE_GAINED: { type: "IMPERIAL_AUDIENCE_GAINED", playerId: "p2", vp: 6 },
  FIRING_SKIPPED: { type: "FIRING_SKIPPED", round: 2 },
  FIRING_STARTED: { type: "FIRING_STARTED", round: 2, participantIds: ["p1", "p2"], firingPlayerIds: ["p1", "p2"] },
  CONTRIBUTION_SUBMITTED: { type: "CONTRIBUTION_SUBMITTED", playerId: "p2", windowId: "w-1" },
  CONTRIBUTIONS_REVEALED: {
    type: "CONTRIBUTIONS_REVEALED",
    windowId: "w-1",
    contributions: { p1: { card: "FUEL_LEDGER_STOKE", heat: 2, woodPaid: 1 }, p2: { card: "BANK", heat: -1, woodPaid: 1 } },
  },
  BASE_HEAT_DETERMINED: { type: "BASE_HEAT_DETERMINED", kilnDie: 3, contributionSum: 3, unclamped: 6, baseHeat: 5 },
  TEST_PIECES_PEEKED: { type: "TEST_PIECES_PEEKED", playerId: "p2" },
  TEST_PIECES_USED: { type: "TEST_PIECES_USED", playerId: "p2", buried: true },
  KILN_MASTER_PLACED: { type: "KILN_MASTER_PLACED", playerId: "p2", ceramicId: "c1", value: 1 },
  FIRE_REVEALED: { type: "FIRE_REVEALED", modifier: -2, baseHeat: 3, globalHeat: 1 },
  FIRE_DECK_RESHUFFLED: { type: "FIRE_DECK_RESHUFFLED", cardCount: 9, buriedBelow: 0 },
  ACTUAL_HEAT_CALCULATED: { type: "ACTUAL_HEAT_CALCULATED", results: [{ ceramicId: "c1", calculation: calc }] },
  JUN_ADJUSTED: { type: "JUN_ADJUSTED", playerId: "p1", ceramicId: "c1", delta: 1, finalActualHeat: 3, during: "first_firing" },
  QUALITY_ASSIGNED: { type: "QUALITY_ASSIGNED", ceramicId: "c1", quality: "fine", heatDifference: 1, cause: "fired", saggarsFloor: false },
  QUALITY_IMPROVED: { type: "QUALITY_IMPROVED", ceramicId: "c3", from: "standard", to: "fine", cause: "ge_crackle" },
  SECOND_FIRING_REVEALED: { type: "SECOND_FIRING_REVEALED", playerId: "p1", ceramicId: "c1", modifiers: [2, -1] },
  SECOND_FIRING_CHOSEN: { type: "SECOND_FIRING_CHOSEN", playerId: "p1", ceramicId: "c1", cardIndex: 1, modifier: -1, calculation: calc },
  CRACKLE_APPLIED: { type: "CRACKLE_APPLIED", playerId: "p1", ceramicId: "c3" },
  CERAMIC_SOLD: { type: "CERAMIC_SOLD", playerId: "p2", ceramicId: "c2", coins: 2, window: "after_action" },
  FIRING_FINISHED: { type: "FIRING_FINISHED", round: 2, finishedCeramicIds: ["c1", "c3"] },
  ORDER_TURN_STARTED: { type: "ORDER_TURN_STARTED", playerId: "p2" },
  ORDER_COMPLETED: {
    type: "ORDER_COMPLETED",
    playerId: "p2",
    window: "order_phase",
    record: { orderId: "O39", ceramicIds: ["c3"], round: 2, canalBargeCoins: 2, vp: 7, coins: 2, printedCrowns: 1, bonusCrowns: 0, crackleDeclarations: [], kilnAbility: null, crackleVp: 1 },
  },
  ORDER_TURN_ENDED: { type: "ORDER_TURN_ENDED", playerId: "p2", automatic: true },
  WORKERS_RETURNED: { type: "WORKERS_RETURNED", round: 2 },
  HAND_TRIMMED: { type: "HAND_TRIMMED", playerId: "p2", count: 1 },
  FIRST_PLAYER_PASSED: { type: "FIRST_PLAYER_PASSED", from: "p1", to: "p2" },
  FINAL_SCORE_CALCULATED: { type: "FINAL_SCORE_CALCULATED", result: FINAL },
};

/** The viewer's own secret versions (visible to p1). */
const OWN: { readonly [T in (typeof OWN_SECRET_TYPES)[number]]: Extract<GameEvent, { type: T }> } = {
  ORDERS_DEALT: { type: "ORDERS_DEALT", playerId: "p1", startingCount: 2, secret: { visibleTo: "p1", startingOrderIds: ["S02", "S05"] } },
  ORDER_RESERVED: { type: "ORDER_RESERVED", playerId: "p1", via: "commission_market", source: "looked", slotIndex: null, orderId: null, secret: { visibleTo: "p1", orderId: "O20" } },
  PRIVATE_LOOK_OPENED: { type: "PRIVATE_LOOK_OPENED", playerId: "p1", kind: "guild_inspection", discipline: "glazing_loading", count: 2, secret: { visibleTo: "p1", orderIds: [], techIds: ["T15", "T22"] } },
  LOOKED_ORDERS_DISCARDED: { type: "LOOKED_ORDERS_DISCARDED", playerId: "p1", count: 2, secret: { visibleTo: "p1", orderIds: ["O14", "O39"] } },
  HELD_ORDER_DISCARDED: { type: "HELD_ORDER_DISCARDED", playerId: "p1", cause: "colour_samples_swap", to: "box", secret: { visibleTo: "p1", orderId: "S05" } },
  TECHS_RETURNED_TO_BOTTOM: { type: "TECHS_RETURNED_TO_BOTTOM", playerId: "p1", discipline: "glazing_loading", count: 2, secret: { visibleTo: "p1", techIds: ["T22", "T15"] } },
  TEST_PIECES_PEEKED: { type: "TEST_PIECES_PEEKED", playerId: "p1", secret: { visibleTo: "p1", modifier: -1 } },
  HAND_TRIMMED: { type: "HAND_TRIMMED", playerId: "p1", count: 1, secret: { visibleTo: "p1", orderIds: ["S02"] } },
};

const TYPES = Object.keys(SAMPLES) as GameEventType[];

/** Problems no rendered line may have. */
function problems(text: string): string[] {
  const found: string[] = [];
  if (text.trim() === "") found.push("empty");
  if (/[{}]/.test(text)) found.push("placeholder left");
  if (/\bc\d+\b/.test(text)) found.push("ceramic ID");
  if (/\bp\d+\b/.test(text)) found.push("player ID");
  if (/\b(undefined|null|NaN)\b/.test(text)) found.push("undefined/null/NaN");
  if (/\b(odds|chance|probability|ladder|preview|expected)\b/i.test(text)) found.push("D3/D4 vocabulary");
  if (/cards? (left|remaining)|left in the deck|概率|几率|余张|预估|预览|剩余火牌|牌堆剩余/i.test(text)) found.push("deck count wording");
  if (/\b(un)?lock/i.test(text) || /锁|解锁/.test(text)) found.push("D7 lock wording");
  return found;
}

const entry = (event: PublicGameEvent, sequence = 1, own?: GameEvent): LogEntry => ({
  sequence,
  revision: 1,
  actorId: "p1",
  event,
  ...(own === undefined ? {} : { own }),
});

describe("EVENT_TEXT", () => {
  it("has one template per engine event type (64: revision 4 drops the three Heat-marker events, and the sale replaces salvage)", () => {
    expect(Object.keys(EVENT_TEXT).sort()).toEqual([...TYPES].sort());
    expect(TYPES).toHaveLength(64);
    for (const retired of ["HEAT_MARKER_PLACED", "HEAT_MARKER_TURNED", "HEAT_MARKER_RETURNED", "CERAMIC_SALVAGED", "LOOKED_ORDERS_TO_BOTTOM"]) expect(TYPES).not.toContain(retired);
  });

  it("has an own-secret template for each of the eight secret events", () => {
    expect(OWN_SECRET_TYPES).toHaveLength(8);
    expect(Object.keys(OWN_EVENT_TEXT).sort()).toEqual([...OWN_SECRET_TYPES].sort());
  });

  describe.each(LOCALES)("in %s", (locale) => {
    it.each(TYPES)("%s renders a whole line", (type) => {
      const text = publicEventText(SAMPLES[type], context(locale));
      expect(problems(text), text).toEqual([]);
    });

    it.each([...OWN_SECRET_TYPES])("%s has an own-secret line", (type) => {
      const own = OWN[type];
      const { secret: _secret, ...publicPart } = own as GameEvent & { secret?: unknown };
      const text = eventText(entry(publicPart as PublicGameEvent, 1, own), context(locale));
      expect(problems(text), text).toEqual([]);
      expect(text).not.toBe(publicEventText(publicPart as PublicGameEvent, context(locale)));
    });
  });
});

describe("D9 and public facts", () => {
  it("names ceramics in words, with the owner only for someone else's ceramic", () => {
    const en = context("en");
    expect(publicEventText(SAMPLES.CERAMIC_LOADED, en)).toBe("Lin glazed and loaded Celadon Bowl, Carved into High 1");
    expect(publicEventText(SAMPLES.KILN_MASTER_PLACED, en)).toContain("Your Celadon Bowl, Carved");
    expect(publicEventText(SAMPLES.QUALITY_ASSIGNED, en)).toBe("Your Celadon Bowl, Carved: Fine (Heat Difference 1)");
    expect(publicEventText(SAMPLES.CERAMIC_FORMED, en)).toBe("Zhao formed a vessel: Vase, Painted (Prepared Clay)");
  });

  it("describes an unknown ceramic generically, never by its ID", () => {
    const empty: CeramicLabelModelView = { ...VIEW, ceramics: {} };
    for (const locale of LOCALES) {
      const text = publicEventText({ type: "KILN_MASTER_PLACED", playerId: "p2", ceramicId: "c99", value: 1 }, context(locale, empty));
      expect(text).not.toMatch(/c99/);
      expect(problems(text)).toEqual([]);
    }
  });

  it("never names a Contribution card before the reveal, and states the reveal in full", () => {
    expect(publicEventText(SAMPLES.CONTRIBUTION_SUBMITTED, context("en"))).toBe("Zhao chose a Contribution in secret");
    // A Fuel Ledger card is named as the card it is (v1.6.2 change 26).
    expect(publicEventText(SAMPLES.CONTRIBUTIONS_REVEALED, context("en"))).toBe("Contributions revealed: Lin Fuel Ledger Stoke +2, Zhao Bank the Fire −1");
    expect(publicEventText(SAMPLES.CONTRIBUTIONS_REVEALED, context("zh-CN"))).toBe("控火亮牌：Lin柴簿添柴+2、Zhao压火−1");
    const bank: PublicGameEvent = { type: "CONTRIBUTIONS_REVEALED", windowId: "w-1", contributions: { p1: { card: "FUEL_LEDGER_BANK", heat: -2, woodPaid: 1 } } };
    expect(publicEventText(bank, context("en"))).toBe("Contributions revealed: Lin Fuel Ledger Bank −2");
    expect(publicEventText(bank, context("zh-CN"))).toBe("控火亮牌：Lin柴簿压火−2");
  });

  it("states Base Heat with the clamp, and never the Fire deck's size", () => {
    expect(publicEventText(SAMPLES.BASE_HEAT_DETERMINED, context("en"))).toBe("Base Heat 5: Kiln Die 3, Contributions +3, kept within 0–5");
    expect(publicEventText(SAMPLES.FIRE_DECK_RESHUFFLED, context("en"))).not.toMatch(/\d/);
    expect(publicEventText(SAMPLES.FIRE_DECK_RESHUFFLED, context("zh-CN"))).not.toMatch(/\d/);
    // R15: above buried cards; still no count (D4: fireBuried is never shown).
    const buried: PublicGameEvent = { ...SAMPLES.FIRE_DECK_RESHUFFLED, buriedBelow: 2 };
    expect(publicEventText(buried, context("en"))).toBe("The Fire discard was shuffled and put on top of the Fire deck, above what Test Pieces put on the bottom");
    expect(publicEventText(buried, context("en"))).not.toMatch(/\d/);
    expect(publicEventText(buried, context("zh-CN"))).not.toMatch(/\d/);
    expect(publicEventText(SAMPLES.FIRE_REVEALED, context("en"))).toBe("Fire card −2 turned: Global Heat 1");
  });

  it("says an added personal space the D7 way", () => {
    expect(publicEventText(SAMPLES.PERSONAL_SPACE_UNLOCKED, context("en"))).toBe("Zhao added a second Form & Decorate space");
    expect(publicEventText(SAMPLES.PERSONAL_SPACE_UNLOCKED, context("zh-CN"))).toBe("Zhao添设制坯饰纹第二工位");
  });

  it("writes Chinese without VP or a space before units", () => {
    for (const type of TYPES) {
      const text = publicEventText(SAMPLES[type], context("zh-CN"));
      expect(text, type).not.toMatch(/VP/);
      expect(text, type).not.toMatch(/\d\s+[一-鿿]/);
    }
  });
});

describe("V1.6.2 lines", () => {
  const en = context("en");
  const zh = context("zh-CN");

  it("states a Commission or Colour Samples reservation from a look without naming the card, except to its owner", () => {
    const looked: PublicGameEvent = { type: "ORDER_RESERVED", playerId: "p2", via: "commission_market", source: "looked", slotIndex: null, orderId: null };
    expect(publicEventText(looked, en)).toBe("Zhao reserved one of the Orders they looked at");
    expect(publicEventText(looked, zh)).toBe("Zhao承接所看的一张委托");
    expect(publicEventText({ ...looked, via: "colour_samples" }, en)).toBe("Zhao reserved an Order with Colour Samples");
    expect(publicEventText({ ...looked, via: "colour_samples_swap" }, en)).toBe("Zhao reserved one of the Orders they looked at (Colour Samples swap)");
    const own = OWN.ORDER_RESERVED;
    const { secret: _secret, ...publicPart } = own;
    expect(eventText(entry(publicPart, 1, own), en)).toBe("Lin reserved O20");
    expect(eventText(entry(publicPart, 1, own), context("en", VIEW, "p2"))).not.toMatch(/O20/);
  });

  it("states a face-up reservation by any Select, naming the Order and Colour Samples where it took it (v1.6.2 L80, change 25)", () => {
    const faceUp = SAMPLES.ORDER_RESERVED;
    expect(publicEventText(faceUp, en)).toBe("Zhao reserved O17 from the display");
    expect(publicEventText({ ...faceUp, via: "colour_samples" }, en)).toBe("Zhao reserved O17 from the display with Colour Samples");
    expect(publicEventText({ ...faceUp, via: "colour_samples" }, zh)).toBe("Zhao用「色样簿」承接委托榜上的O17");
    expect(publicEventText({ ...faceUp, via: "colour_samples_swap" }, en)).toBe("Zhao reserved O17 from the display (Colour Samples swap)");
    expect(publicEventText({ ...faceUp, via: "colour_samples_swap" }, zh)).toBe("Zhao用「色样簿」换单，承接委托榜上的O17");
  });

  it("states the Contribution cards that come with Fuel Ledger, by name (v1.6.2 change 26)", () => {
    expect(publicEventText(SAMPLES.CONTRIBUTION_CARDS_GAINED, en)).toBe("Zhao took the Contribution cards that come with Fuel Ledger: Fuel Ledger Bank, Fuel Ledger Stoke");
    expect(publicEventText(SAMPLES.CONTRIBUTION_CARDS_GAINED, zh)).toBe("Zhao拿取随「柴簿」附带的控火牌：柴簿压火、柴簿添柴");
  });

  it("states the Canal Wharf Shifu's unseen card, named only to its owner", () => {
    const drawn: PublicGameEvent = { type: "ORDER_RESERVED", playerId: "p2", via: "canal_wharf", source: "deck_top", slotIndex: null, orderId: null };
    expect(publicEventText(drawn, en)).toBe("Zhao took the top Main Order into their hand, unseen");
    expect(publicEventText(drawn, zh)).toBe("Zhao不看牌面拿取主委托牌堆顶一张，收入手中");
    const own: GameEvent = { type: "ORDER_RESERVED", playerId: "p1", via: "canal_wharf", source: "deck_top", slotIndex: null, orderId: null, secret: { visibleTo: "p1", orderId: "O07" } };
    const { secret: _secret, ...publicPart } = own as GameEvent & { secret?: unknown };
    expect(eventText(entry(publicPart as PublicGameEvent, 1, own), en)).toBe("Lin took O07 from the top of the Main Order deck");
  });

  it("discards a Select's looked cards face down (R25): a count for others, the cards for the looker", () => {
    expect(publicEventText(SAMPLES.LOOKED_ORDERS_DISCARDED, en)).toBe("Zhao discarded 2 looked-at Orders face down");
    expect(publicEventText(SAMPLES.LOOKED_ORDERS_DISCARDED, zh)).toBe("Zhao把看过的2张委托面朝下弃置");
    expect(publicEventText({ ...SAMPLES.LOOKED_ORDERS_DISCARDED, count: 1 }, en)).toBe("Zhao discarded 1 looked-at Order face down");
    const own = OWN.LOOKED_ORDERS_DISCARDED;
    const { secret: _secret, ...publicPart } = own;
    expect(eventText(entry(publicPart, 1, own), en)).toBe("Lin discarded O14, O39 face down");
    expect(eventText(entry(publicPart, 1, own), zh)).toBe("Lin把O14、O39面朝下弃置");
    // Another seat sees the count, never the cards.
    expect(eventText(entry(publicPart, 1, own), context("en", VIEW, "p2"))).toBe("Lin discarded 2 looked-at Orders face down");
    for (const c of [en, zh]) expect(publicEventText(SAMPLES.LOOKED_ORDERS_DISCARDED, c)).not.toMatch(/bottom|牌堆底/);
  });

  it("states the Setup take and the Magistrate's Hall Crown Order in public (L130, L259; R21, R23)", () => {
    const setup: PublicGameEvent = { ...SAMPLES.ORDER_RESERVED, via: "setup", slotIndex: 0, orderId: "O22" };
    expect(publicEventText(setup, en)).toBe("Zhao took O22 from the display with their Kiln");
    expect(publicEventText(setup, zh)).toBe("Zhao选窑口时从委托榜上拿取O22");
    const crown: PublicGameEvent = { ...SAMPLES.ORDER_RESERVED, via: "magistrates_hall", slotIndex: 3, orderId: "O40" };
    expect(publicEventText(crown, en)).toBe("Zhao reserved the Crown Order O40 from the display (Magistrate's Hall)");
    expect(publicEventText(crown, zh)).toBe("Zhao承接委托榜上的御令委托O40（州衙）");
  });

  it("states Kiln Master's marker as placed at loading (R22) and the kiln fuel as a cost (R24)", () => {
    expect(publicEventText(SAMPLES.KILN_MASTER_PLACED, en)).toBe("Zhao placed the Kiln Master marker +1 on Your Celadon Bowl, Carved");
    const fuel: PublicGameEvent = { type: "RESOURCES_CHANGED", playerId: "p2", clay: 0, wood: -1, coins: 0, reason: "kiln_fuel" };
    expect(publicEventText(fuel, en)).toBe("Zhao: −1 Wood (kiln fuel)");
    expect(publicEventText(fuel, zh)).toBe("Zhao：−1柴（烧窑要烧柴）");
  });

  it("states a sale and folds its Coins into it, in any free-action window (changes 30, 36; R26)", () => {
    const sold = SAMPLES.CERAMIC_SOLD;
    expect(publicEventText(sold, en)).toBe("Zhao sold Vase, Painted for 2 Coins");
    expect(publicEventText(sold, zh)).toBe("Zhao卖出瓶 · 画花，得2铜钱");
    const coins: PublicGameEvent = { type: "RESOURCES_CHANGED", playerId: "p2", clay: 0, wood: 0, coins: 2, reason: "flawed_sale" };
    expect(publicEventText(coins, en)).toBe("Zhao: +2 Coins (sale of a Flawed ceramic)");
    expect(repeatsPreviousEntry(entry(coins, 2), entry(sold, 1))).toBe(true);
    expect(repeatsPreviousEntry(entry({ ...coins, coins: 3 }, 2), entry(sold, 1))).toBe(false);
    expect(repeatsPreviousEntry(entry({ ...coins, playerId: "p1" }, 2), entry(sold, 1))).toBe(false);
    for (const c of [en, zh]) expect(publicEventText(sold, c)).not.toMatch(/salvag|折卖/);
    // The same line before the worker action and in the Order Phase (a free action, change 36).
    for (const window of ["before_action", "order_phase"] as const) {
      expect(publicEventText({ ...sold, window }, en)).toBe("Zhao sold Vase, Painted for 2 Coins");
      expect(repeatsPreviousEntry(entry(coins, 2), entry({ ...sold, window }, 1))).toBe(true);
    }
  });

  it("states Imperial Priority as loaded, and after the firing as waiting in the Imperial Kiln (change 36, R28)", () => {
    const used = SAMPLES.IMPERIAL_PRIORITY_USED;
    for (const window of ["before_action", "after_action"] as const) {
      expect(publicEventText({ ...used, window }, en)).toMatch(/^Lin used Imperial Priority on [^;]+$/);
      expect(publicEventText({ ...used, window }, zh)).toMatch(/^Lin用御烧优先把.+装进御窑$/);
    }
    const after: PublicGameEvent = { ...used, window: "order_phase" };
    expect(publicEventText(after, en)).toMatch(/^Lin used Imperial Priority on .+ in the Order Phase; it waits in their Imperial Kiln for the next round’s firing$/);
    expect(publicEventText(after, zh)).toMatch(/^Lin在交货阶段用御烧优先把.+装进御窑，器物留在御窑里，到下一轮烧窑时才烧成$/);
    // The last round has no next firing, and may have had no firing at all (R28).
    expect(publicEventText(after, { ...en, lastRound: true })).toMatch(/^Lin used Imperial Priority on .+ in the last Order Phase; it is never fired and does not score$/);
    expect(publicEventText(after, { ...zh, lastRound: true })).toMatch(/^Lin在最后的交货阶段用御烧优先把.+装进御窑，这件器物不会烧成，也不计分$/);
    // Before or after a worker action it says neither.
    expect(publicEventText({ ...used, window: "after_action" }, { ...en, lastRound: true })).toMatch(/^Lin used Imperial Priority on [^;]+$/);
  });

  it("states the Colour Samples swap, then where its held Order went, never which Order, except to its owner", () => {
    // Colour Samples is used (TECH_USED) only by its swap (v1.6.2 L632); that line names the swap.
    const used: PublicGameEvent = { type: "TECH_USED", playerId: "p2", techId: "T10" };
    expect(publicEventText(used, en)).toBe("Zhao used Colour Samples to swap a held Order");
    // A Tech's name in running Chinese text stands in 「」, as in the reservation line after it.
    expect(publicEventText(used, zh)).toBe("Zhao使用「色样簿」换单");
    expect(publicEventText({ type: "ORDER_RESERVED", playerId: "p2", via: "colour_samples_swap", source: "looked", slotIndex: null, orderId: null }, zh)).toBe("Zhao用「色样簿」换单，承接所看的一张委托");
    expect(publicEventText(SAMPLES.HELD_ORDER_DISCARDED, en)).toBe("Zhao discarded a held Order face down");
    expect(publicEventText(SAMPLES.HELD_ORDER_DISCARDED, zh)).toBe("Zhao把一张在手委托面朝下放入主委托弃牌堆");
    expect(publicEventText({ ...SAMPLES.HELD_ORDER_DISCARDED, to: "box" }, zh)).toBe("Zhao把一张在手起始委托放回盒中");
    const own = OWN.HELD_ORDER_DISCARDED;
    const { secret: _secret, ...publicPart } = own;
    expect(eventText(entry(publicPart, 1, own), en)).toBe("Lin returned S05 to the box");
    expect(eventText(entry(publicPart, 1, own), zh)).toBe("Lin把S05放回盒中");
    expect(eventText(entry(publicPart, 1, own), context("en", VIEW, "p2"))).not.toMatch(/S05/);
    expect(eventText(entry(publicPart, 1, own), context("en", VIEW, "p2"))).toBe("Lin returned a held Starting Order to the box");
  });

  it("states a look that found no card (B1), never \"the top 0\"", () => {
    const none: PublicGameEvent = { ...SAMPLES.PRIVATE_LOOK_OPENED, count: 0 };
    expect(publicEventText(none, en)).toBe("Zhao found no Main Order to look at");
    expect(publicEventText(none, zh)).toBe("Zhao没有主委托可看");
    expect(publicEventText({ ...none, kind: "colour_samples_swap" }, en)).toBe("Zhao found no Main Order to look at");
    const inspected: PublicGameEvent = { ...none, kind: "guild_inspection", discipline: "firing" };
    expect(publicEventText(inspected, en)).toBe("Zhao found no Firing Tech to inspect");
    expect(publicEventText(inspected, zh)).toBe("Zhao没有火作技艺可看");
    // A look is history once logged: past tense, like the zero-card lines beside it.
    expect(publicEventText({ ...inspected, count: 2 }, en)).toBe("Zhao inspected the top 2 Firing Techs");
    expect(publicEventText({ ...inspected, count: 2 }, zh)).toBe("Zhao私下查看了火作技艺牌堆顶2张");
    expect(publicEventText(SAMPLES.PRIVATE_LOOK_OPENED, en)).toBe("Zhao looked at the top 3 Main Orders");
    expect(publicEventText({ ...SAMPLES.PRIVATE_LOOK_OPENED, count: 1 }, en)).toBe("Zhao looked at the top 1 Main Order");
    expect(publicEventText(SAMPLES.PRIVATE_LOOK_OPENED, zh)).toBe("Zhao私下查看了主委托牌堆顶3张");
    for (const c of [en, zh]) expect(publicEventText(SAMPLES.PRIVATE_LOOK_OPENED, c)).not.toMatch(/is looking|is inspecting|正在/);
  });

  it("names the Guild Hall Shifu's returned Techs to their owner, with an order only when there are several", () => {
    const two = OWN.TECHS_RETURNED_TO_BOTTOM;
    const { secret: _secret, ...twoPublic } = two;
    expect(eventText(entry(twoPublic, 1, two), en)).toMatch(/, in that order$/);
    expect(eventText(entry(twoPublic, 1, two), zh)).toContain("依次");
    const one: Extract<GameEvent, { type: "TECHS_RETURNED_TO_BOTTOM" }> = { ...two, count: 1, secret: { visibleTo: "p1", techIds: ["T15"] } };
    const { secret: _oneSecret, ...onePublic } = one;
    for (const c of [en, zh]) {
      const text = eventText(entry(onePublic, 1, one), c);
      expect(problems(text), text).toEqual([]);
      expect(text).not.toMatch(/in that order|依次/);
    }
    expect(eventText(entry(onePublic, 1, one), context("en", VIEW, "p2"))).not.toMatch(/T15/);
  });

  it("states both Second Firing cards, then the chosen one", () => {
    expect(publicEventText(SAMPLES.SECOND_FIRING_REVEALED, en)).toBe("Lin turned 2 extra Fire cards for Celadon Bowl, Carved: +2, −1 (Second Firing)");
    expect(publicEventText(SAMPLES.SECOND_FIRING_REVEALED, zh)).toBe("Lin为青釉碗 · 刻花额外翻开2张窑火牌：+2、−1（复烧）");
    expect(publicEventText(SAMPLES.SECOND_FIRING_CHOSEN, en)).toBe("Lin fired Celadon Bowl, Carved again with Fire card −1 (Second Firing)");
    expect(publicEventText(SAMPLES.SECOND_FIRING_CHOSEN, zh)).toBe("Lin选用窑火牌−1复烧青釉碗 · 刻花（复烧）");
  });

  it("says when Protective Saggars made a ceramic Standard", () => {
    const floored: PublicGameEvent = { ...SAMPLES.QUALITY_ASSIGNED, quality: "standard", heatDifference: 3, saggarsFloor: true };
    expect(publicEventText(floored, en)).toBe("Your Celadon Bowl, Carved: Standard (Heat Difference 3; Protective Saggars: never Flawed)");
  });

  it("gives Canal Barge as the reason for its Coins", () => {
    expect(publicEventText(SAMPLES.RESOURCES_CHANGED, en)).toBe("Zhao: +2 Coins (Canal Barge)");
    expect(publicEventText(SAMPLES.RESOURCES_CHANGED, zh)).toBe("Zhao：+2铜钱（漕船）");
  });

  it("says Canal Barge's use with its Coins, and folds the Coins line that follows it (v1.6.2 L637)", () => {
    const used: PublicGameEvent = { type: "TECH_USED", playerId: "p2", techId: "T23" };
    expect(publicEventText(used, en)).toBe("Zhao used Canal Barge: +2 Coins");
    expect(publicEventText(used, zh)).toBe("Zhao使用「漕船」：得2铜钱");
    const coins = SAMPLES.RESOURCES_CHANGED;
    expect(repeatsPreviousEntry(entry(coins, 2), entry(used, 1))).toBe(true);
    // Anything else stays: another player, another Tech, other amounts or reasons.
    expect(repeatsPreviousEntry(entry({ ...coins, playerId: "p1" }, 2), entry(used, 1))).toBe(false);
    expect(repeatsPreviousEntry(entry(coins, 2), entry({ ...used, techId: "T25" }, 1))).toBe(false);
    expect(repeatsPreviousEntry(entry({ ...coins, coins: 3 }, 2), entry(used, 1))).toBe(false);
    expect(repeatsPreviousEntry(entry({ ...coins, reason: "guan" }, 2), entry(used, 1))).toBe(false);
    expect(repeatsPreviousEntry(entry(coins, 2), undefined)).toBe(false);
    // A sale's Coins fold into the sale line the same way (R20).
    const sold = SAMPLES.CERAMIC_SOLD;
    const saleCoins: PublicGameEvent = { type: "RESOURCES_CHANGED", playerId: "p2", clay: 0, wood: 0, coins: 2, reason: "flawed_sale" };
    expect(publicEventText(sold, en)).toContain("for 2 Coins");
    expect(repeatsPreviousEntry(entry(saleCoins, 2), entry(sold, 1))).toBe(true);
    expect(repeatsPreviousEntry(entry({ ...saleCoins, coins: 3 }, 2), entry(sold, 1))).toBe(false);
    // The Imperial Grant's resources fold into the grant line, which states them.
    const grant = SAMPLES.IMPERIAL_GRANT_RECEIVED;
    const granted: PublicGameEvent = { type: "RESOURCES_CHANGED", playerId: "p2", clay: 1, wood: 1, coins: 1, reason: "imperial_grant" };
    expect(repeatsPreviousEntry(entry(granted, 2), entry(grant, 1))).toBe(true);
    expect(repeatsPreviousEntry(entry({ ...granted, wood: 0 }, 2), entry(grant, 1))).toBe(false);
    expect(repeatsPreviousEntry(entry({ ...granted, playerId: "p1" }, 2), entry(grant, 1))).toBe(false);
    // A Guild Hall payment folds into the acquisition after it, which states the cost.
    const paid: PublicGameEvent = { type: "RESOURCES_CHANGED", playerId: "p2", clay: 0, wood: 0, coins: -3, reason: "guild_hall" };
    const acquired = SAMPLES.TECH_ACQUIRED;
    // No VP for a Tech (v1.6.2 change 27).
    expect(publicEventText(acquired, en)).toBe("Zhao acquired Test Pieces: pay 3 Coins");
    expect(publicEventText(acquired, zh)).toBe("Zhao习得「火照」：付3铜钱");
    expect(repeatsNextEntry(entry(paid, 1), entry(acquired, 2))).toBe(true);
    expect(repeatsNextEntry(entry({ ...paid, coins: -2 }, 1), entry(acquired, 2))).toBe(false);
    expect(repeatsNextEntry(entry({ ...paid, playerId: "p1" }, 1), entry(acquired, 2))).toBe(false);
    expect(repeatsNextEntry(entry(paid, 1), undefined)).toBe(false);
    const log = [entry(SAMPLES.WORKER_PLACED, 1), entry(paid, 2), entry(acquired, 3), entry(used, 4), entry(coins, 5)];
    expect(log.map((_line, index) => foldedEntry(log, index))).toEqual([false, true, false, false, true]);
    // Other Techs keep the plain line.
    expect(publicEventText({ ...used, techId: "T13" }, en)).toBe("Zhao used Test Pieces");
    expect(publicEventText({ ...used, techId: "T13" }, zh)).toBe("Zhao使用「火照」");
  });
});

describe("ceramic names in a line whose subject owns the ceramic (D9)", () => {
  // Zhao's Celadon Vase, Plain in High 2 has twins: Lin's in Middle 1, and (in `own`) Zhao's own in Low 1.
  const vase = (id: string, ownerId: PlayerId, spaceId: "high_2" | "middle_1" | "low_1"): CeramicFacts => ({ id, ownerId, shape: "vase", decoration: "plain", glaze: "celadon", stage: "loaded", placement: { kiln: "shared", spaceId, stacked: false } });
  const others: CeramicLabelModelView = { ...VIEW, ceramics: { v1: vase("v1", "p2", "high_2"), v2: vase("v2", "p1", "middle_1") } };
  const own: CeramicLabelModelView = { ...VIEW, ceramics: { v1: vase("v1", "p2", "high_2"), v3: vase("v3", "p2", "low_1") } };
  const loaded: PublicGameEvent = { type: "CERAMIC_LOADED", playerId: "p2", ceramicId: "v1", glaze: "celadon", placement: { kiln: "shared", spaceId: "high_2", stacked: false }, loadedBy: "glaze_load" };
  const marker: PublicGameEvent = { type: "KILN_MASTER_PLACED", playerId: "p2", ceramicId: "v1", value: -1 };

  it("names no place when only another player's ceramic reads the same", () => {
    expect(publicEventText(loaded, context("en", others))).toBe("Zhao glazed and loaded Celadon Vase, Plain into High 2");
    expect(publicEventText(loaded, context("zh-CN", others))).not.toContain("（高温区2）");
    expect(publicEventText(marker, context("en", others))).toBe("Zhao placed the Kiln Master marker −1 on Celadon Vase, Plain");
  });

  it("names the place for two of the subject's own, except on the load line, which names where it went", () => {
    expect(publicEventText(marker, context("en", own))).toBe("Zhao placed the Kiln Master marker −1 on Celadon Vase, Plain (in High 2)");
    expect(publicEventText(loaded, context("en", own))).toBe("Zhao glazed and loaded Celadon Vase, Plain into High 2");
  });
});

describe("Kiln ability lines (D17: a toast's 4 lines carry the moves)", () => {
  const en = context("en");
  const zh = context("zh-CN");
  const used = (kilnId: "RU" | "GU" | "GE" | "DI" | "JU", playerId: PlayerId = "p2"): PublicGameEvent => ({ type: "KILN_ABILITY_USED", playerId, kilnId });
  /** The lines the log keeps, in order. */
  const kept = (events: readonly PublicGameEvent[], c: EventTextContext) => {
    const log = events.map((event, index) => entry(event, index + 1));
    return log.filter((_line, index) => !foldedEntry(log, index)).map((line) => publicEventText(line.event, c));
  };

  it("Kiln Master, Kiln Furniture and Kiln Tending: \"used ⟨Tech⟩\" folds into the line after it that names the Tech", () => {
    const tech = (techId: "T24" | "T15" | "T20" | "T21", playerId: PlayerId = "p2"): PublicGameEvent => ({ type: "TECH_USED", playerId, techId });
    const marker: PublicGameEvent = { type: "KILN_MASTER_PLACED", playerId: "p2", ceramicId: "c1", value: 1 };
    const furniture: PublicGameEvent = { type: "KILN_FURNITURE_PLACED", playerId: "p2", spaceId: "high_1", modifier: -1 };
    const tending: PublicGameEvent = { type: "RESOURCES_CHANGED", playerId: "p2", clay: 1, wood: 1, coins: 0, reason: "kiln_tending" };
    expect(kept([tech("T24"), marker], en)).toEqual([publicEventText(marker, en)]);
    expect(kept([tech("T15"), furniture], zh)).toEqual([publicEventText(furniture, zh)]);
    expect(kept([tech("T20"), tending], en)).toEqual([publicEventText(tending, en)]);
    expect(publicEventText(marker, zh)).toContain("窑工");
    expect(publicEventText(furniture, zh)).toContain("支烧窑具");
    expect(publicEventText(tending, en)).toContain("Kiln Tending");
    // Only directly before the same player's line naming that Tech.
    expect(repeatsNextEntry(entry(tech("T24"), 1), entry(furniture, 2))).toBe(false);
    expect(repeatsNextEntry(entry(tech("T24", "p1"), 1), entry(marker, 2))).toBe(false);
    expect(repeatsPreviousEntry(entry(tech("T24"), 2), entry(marker, 1))).toBe(false);
    expect(repeatsNextEntry(entry(tech("T21"), 1), entry(marker, 2))).toBe(false);
    expect(kept([tech("T24"), { ...SAMPLES.WORKER_PLACED, playerId: "p2" } as PublicGameEvent], en)).toHaveLength(2);
  });

  it("Ding: one line states the extra vessel with its cost, 1 Clay + 2 Coins (change 40, rev. 5 L488)", () => {
    const formed: PublicGameEvent = { type: "CERAMIC_FORMED", playerId: "p2", ceramicId: "c2", shape: "plate", decoration: "plain", formedBy: "form_decorate" };
    const ding: PublicGameEvent[] = [
      used("DI"),
      { type: "RESOURCES_CHANGED", playerId: "p2", clay: -1, wood: 0, coins: -2, reason: "ding_extra" },
      { ...formed, ceramicId: "c9", formedBy: "ding_extra" },
    ];
    expect(kept([formed, ...ding], en)).toEqual(["Zhao formed a vessel: Plate, Plain", "Zhao formed a vessel: Plate, Plain (Moulded Production: −1 Clay · −2 Coins)"]);
    expect(kept(ding, zh)).toEqual(["Zhao制坯：盘 · 素面（「范制成器」：−1泥 · −2铜钱）"]);
    // Another amount (the revision-4 price, 1 Coin), or another player's vessel, keeps the cost line.
    expect(kept([ding[0]!, { ...(ding[1] as Extract<PublicGameEvent, { type: "RESOURCES_CHANGED" }>), coins: -1 }, ding[2]!], en)).toHaveLength(2);
    expect(kept([ding[0]!, ding[1]!, { ...(ding[2] as Extract<PublicGameEvent, { type: "CERAMIC_FORMED" }>), playerId: "p1" }], en)).toHaveLength(2);
  });

  it("Jun: one line states the Wood, the adjustment and the Actual Heat (v1.6.2 L492)", () => {
    const jun: PublicGameEvent[] = [
      { type: "RESOURCES_CHANGED", playerId: "p1", clay: 0, wood: -1, coins: 0, reason: "jun" },
      used("JU", "p1"),
      SAMPLES.JUN_ADJUSTED,
    ];
    expect(kept(jun, en)).toEqual(["Lin paid 1 Wood to use Kiln Transformation on Celadon Bowl, Carved: +1, Actual Heat 3"]);
    expect(kept(jun, zh)).toEqual(["Lin付1柴对青釉碗 · 刻花使用「窑变天成」：+1，实际火候3"]);
    // During a Second Firing the same three lines come between the chosen card and the new Quality.
    const second: PublicGameEvent[] = [SAMPLES.SECOND_FIRING_CHOSEN, ...jun.slice(0, 2), { ...SAMPLES.JUN_ADJUSTED, during: "second_firing" }, { ...SAMPLES.QUALITY_ASSIGNED, cause: "second_firing" }];
    expect(kept(second, en)).toHaveLength(3);
  });

  it("Ge: the Quality change and the Crackle marker, without \"used Crackle Mastery\"", () => {
    const ge: PublicGameEvent[] = [used("GE", "p1"), SAMPLES.QUALITY_IMPROVED, SAMPLES.CRACKLE_APPLIED];
    const lines = kept(ge, en);
    expect(lines).toHaveLength(2);
    expect(lines.join(" | ")).not.toContain("used Crackle Mastery");
    expect(kept(ge, zh).join(" | ")).not.toContain("使用「金丝铁线」");
  });

  it("Ru and Guan: the use states what it scores; Guan's Coins fold into it (v1.6.2 L474, L478)", () => {
    expect(publicEventText(used("RU"), en)).toBe("Zhao used Quiet Perfection: +4 VP");
    expect(publicEventText(used("RU"), zh)).toBe("Zhao使用「天青无瑕」：+4分");
    const guan: PublicGameEvent[] = [used("GU"), { type: "RESOURCES_CHANGED", playerId: "p2", clay: 0, wood: 0, coins: 2, reason: "guan" }];
    expect(kept(guan, en)).toEqual(["Zhao used Imperial Patronage: +1 VP, +2 Coins"]);
    expect(kept(guan, zh)).toEqual(["Zhao使用「内府恩眷」：+1分，得2铜钱"]);
  });

  it("a \"used\" line with nothing beside it naming the ability stays", () => {
    expect(kept([used("DI")], en)).toEqual(["Zhao used Moulded Production"]);
    expect(kept([used("JU"), SAMPLES.WORK_TURN_ENDED], en)).toHaveLength(2);
    // Another player's line beside it does not fold it.
    expect(kept([used("GE", "p2"), SAMPLES.CRACKLE_APPLIED], en)).toHaveLength(2);
  });
});

describe("Order Phase lines", () => {
  // The engine ends a turn automatically both when it opens with nothing completable and after
  // completions leave nothing completable (src/game/orders/phase.ts): the line is true for both.
  it("says an automatic end without claiming the player did nothing (no more free actions, R28)", () => {
    const ended = SAMPLES.ORDER_TURN_ENDED;
    expect(publicEventText(ended, context("en"))).toBe("Zhao has no more free actions");
    expect(publicEventText(ended, context("zh-CN"))).toBe("Zhao没有可做的自由行动了");
    expect(publicEventText({ ...ended, automatic: false }, context("en"))).toBe("Zhao ended their Order turn");
  });

  it("folds an Order reward's Coins into the completion line that states them", () => {
    const completed = SAMPLES.ORDER_COMPLETED;
    const reward: PublicGameEvent = { type: "RESOURCES_CHANGED", playerId: "p2", clay: 0, wood: 0, coins: 2, reason: "order_reward" };
    expect(publicEventText(completed, context("en"))).toContain("+2 Coins");
    // Ge's Crackle VP for the delivered Crackle ceramic is stated on the completion line (L484).
    expect(publicEventText(completed, context("en"))).toBe("Zhao completed O39: +7 VP, +2 Coins; Crackle: +1 VP");
    expect(publicEventText(completed, context("zh-CN"))).toBe("Zhao完成委托O39：+7分，得2铜钱；开片器+1分");
    const plain = { ...completed, record: { ...completed.record, crackleVp: 0 } };
    expect(publicEventText(plain, context("en"))).toBe("Zhao completed O39: +7 VP, +2 Coins");
    expect(repeatsPreviousEntry(entry(reward, 2), entry(completed, 1))).toBe(true);
    // Anything else stays: another reason, another player, other amounts, no completion before.
    expect(repeatsPreviousEntry(entry({ ...reward, reason: "flawed_sale" }, 2), entry(completed, 1))).toBe(false);
    expect(repeatsPreviousEntry(entry({ ...reward, playerId: "p1" }, 2), entry(completed, 1))).toBe(false);
    expect(repeatsPreviousEntry(entry({ ...reward, coins: 3 }, 2), entry(completed, 1))).toBe(false);
    expect(repeatsPreviousEntry(entry(reward, 2), entry(SAMPLES.ORDER_TURN_STARTED, 1))).toBe(false);
    expect(repeatsPreviousEntry(entry(reward, 2), undefined)).toBe(false);
  });
});

describe("own secrets", () => {
  it("are used only for the viewer's own secret", () => {
    const own = OWN.ORDERS_DEALT;
    const { secret: _secret, ...publicPart } = own;
    const line = entry(publicPart, 1, own);
    expect(ownSecretOf(line, "p1")).not.toBeNull();
    expect(eventText(line, context("en"))).toBe("Lin was dealt S02, S05");
    // Another seat's secret (or a viewer that is not seated) falls back to the public line.
    expect(ownSecretOf(line, "p2")).toBeNull();
    const asZhao = eventText(line, context("en", VIEW, "p2"));
    // Only Starting Orders are dealt (L123); the Main Order is taken face up with the Kiln.
    expect(asZhao).toBe("Lin was dealt 2 Starting Orders");
    expect(asZhao).not.toMatch(/S02|S05/);
    expect(ownSecretOf(line, null)).toBeNull();
  });

  it("ignore a secret attached to an event of another type", () => {
    const line = entry(SAMPLES.HAND_TRIMMED, 1, OWN.ORDERS_DEALT);
    expect(ownSecretOf(line, "p1")).toBeNull();
    expect(eventText(line, context("en"))).not.toMatch(/S02|S05/);
  });
});

describe("every fixture's log", () => {
  it.each(allFixtures().map((entry) => [entry.id] as const))("%s renders in EN and ZH without secrets or IDs", (id) => {
    const snapshot = fixtureSnapshot(structuredClone(fixture(id)));
    const view = snapshot.view;
    if (view === null) throw new Error("no view");
    const model = gameModelOf(view, snapshot.seats);
    const labelView = logCeramicView(model, snapshot.log);
    const secrets = secretIds(id);
    for (const locale of LOCALES) {
      const ctx: EventTextContext = { t: translators[locale], view: labelView, viewerId: model.viewerId };
      for (const line of snapshot.log) {
        const text = eventText(line, ctx);
        expect(problems(text), `${line.event.type}: ${text}`).toEqual([]);
        for (const secret of secrets) expect(text, `secret ${secret}`).not.toMatch(new RegExp(`\\b${secret}\\b`));
      }
    }
  });

  it("describes loaded ceramics from the table even without their formation in the log", () => {
    const snapshot = fixtureSnapshot(structuredClone(fixture("m3_kiln_master_marker_3p")));
    const view = snapshot.view;
    if (view === null) throw new Error("no view");
    const model = gameModelOf(view, snapshot.seats);
    const loaded: LoadedCeramic[] = model.board.kilnSpaces.flatMap((space) => space.ceramics);
    expect(loaded.length).toBeGreaterThan(0);
    const labelView = logCeramicView(model, []);
    for (const ceramic of loaded) expect(labelView.ceramics?.[ceramic.id]?.shape).toBe(ceramic.shape);
  });
});
