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
  ORDERS_DEALT: { type: "ORDERS_DEALT", playerId: "p2", startingCount: 2, mainCount: 1 },
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
  HEAT_MARKER_PLACED: { type: "HEAT_MARKER_PLACED", playerId: "p1", ceramicId: "c1" },
  ORDER_RESERVED: { type: "ORDER_RESERVED", playerId: "p2", via: "commission_market", source: "face_up", slotIndex: 2, orderId: "O17" },
  PRIVATE_LOOK_OPENED: { type: "PRIVATE_LOOK_OPENED", playerId: "p2", kind: "commission_market", discipline: null, count: 3 },
  LOOKED_ORDERS_TO_BOTTOM: { type: "LOOKED_ORDERS_TO_BOTTOM", playerId: "p2", count: 2 },
  HELD_ORDER_DISCARDED: { type: "HELD_ORDER_DISCARDED", playerId: "p2", cause: "colour_samples_swap", to: "main_discard" },
  TECH_ACQUIRED: { type: "TECH_ACQUIRED", playerId: "p2", techId: "T13", source: "face_up", cost: 3, vp: 1 },
  TECHS_RETURNED_TO_BOTTOM: { type: "TECHS_RETURNED_TO_BOTTOM", playerId: "p2", discipline: "firing", count: 1 },
  TECH_DISPLAY_REFILLED: { type: "TECH_DISPLAY_REFILLED", discipline: "workshop", revealedTechIds: ["T05"], display: ["T05", "T16"] },
  PERSONAL_SPACE_UNLOCKED: { type: "PERSONAL_SPACE_UNLOCKED", playerId: "p2", locationId: "form_decorate" },
  TECH_USED: { type: "TECH_USED", playerId: "p2", techId: "T13" },
  KILN_ABILITY_USED: { type: "KILN_ABILITY_USED", playerId: "p2", kilnId: "JU" },
  IMPERIAL_PRIORITY_USED: { type: "IMPERIAL_PRIORITY_USED", playerId: "p1", ceramicId: "c1" },
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
    contributions: { p1: { card: "STOKE", fuelLedger: true, heat: 2, woodPaid: 2 }, p2: { card: "BANK", fuelLedger: false, heat: -1, woodPaid: 1 } },
  },
  BASE_HEAT_DETERMINED: { type: "BASE_HEAT_DETERMINED", kilnDie: 3, contributionSum: 3, unclamped: 6, baseHeat: 5 },
  TEST_PIECES_PEEKED: { type: "TEST_PIECES_PEEKED", playerId: "p2" },
  TEST_PIECES_USED: { type: "TEST_PIECES_USED", playerId: "p2", buried: true },
  HEAT_MARKER_TURNED: { type: "HEAT_MARKER_TURNED", playerId: "p1", ceramicId: "c1", value: -1 },
  HEAT_MARKER_RETURNED: { type: "HEAT_MARKER_RETURNED", playerId: "p1", ceramicId: "c1" },
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
  CERAMIC_SALVAGED: { type: "CERAMIC_SALVAGED", playerId: "p2", ceramicId: "c2", coins: 2 },
  FIRING_FINISHED: { type: "FIRING_FINISHED", round: 2, finishedCeramicIds: ["c1", "c3"] },
  ORDER_TURN_STARTED: { type: "ORDER_TURN_STARTED", playerId: "p2" },
  ORDER_COMPLETED: {
    type: "ORDER_COMPLETED",
    playerId: "p2",
    record: { orderId: "O39", ceramicIds: ["c3"], round: 2, canalBargeCoins: 2, vp: 7, coins: 2, printedCrowns: 1, bonusCrowns: 0, crackleDeclarations: [], kilnAbility: null },
  },
  ORDER_TURN_ENDED: { type: "ORDER_TURN_ENDED", playerId: "p2", automatic: true },
  WORKERS_RETURNED: { type: "WORKERS_RETURNED", round: 2 },
  HAND_TRIMMED: { type: "HAND_TRIMMED", playerId: "p2", count: 1 },
  FIRST_PLAYER_PASSED: { type: "FIRST_PLAYER_PASSED", from: "p1", to: "p2" },
  FINAL_SCORE_CALCULATED: { type: "FINAL_SCORE_CALCULATED", result: FINAL },
};

/** The viewer's own secret versions (visible to p1). */
const OWN: { readonly [T in (typeof OWN_SECRET_TYPES)[number]]: Extract<GameEvent, { type: T }> } = {
  ORDERS_DEALT: { type: "ORDERS_DEALT", playerId: "p1", startingCount: 2, mainCount: 1, secret: { visibleTo: "p1", startingOrderIds: ["S02", "S05"], mainOrderIds: ["O41"] } },
  ORDER_RESERVED: { type: "ORDER_RESERVED", playerId: "p1", via: "commission_market", source: "looked", slotIndex: null, orderId: null, secret: { visibleTo: "p1", orderId: "O20" } },
  PRIVATE_LOOK_OPENED: { type: "PRIVATE_LOOK_OPENED", playerId: "p1", kind: "guild_inspection", discipline: "glazing_loading", count: 2, secret: { visibleTo: "p1", orderIds: [], techIds: ["T15", "T22"] } },
  LOOKED_ORDERS_TO_BOTTOM: { type: "LOOKED_ORDERS_TO_BOTTOM", playerId: "p1", count: 2, secret: { visibleTo: "p1", orderIds: ["O14", "O39"] } },
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
  it("has one template per engine event type (66)", () => {
    expect(Object.keys(EVENT_TEXT).sort()).toEqual([...TYPES].sort());
    expect(TYPES).toHaveLength(66);
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
      const text = publicEventText({ type: "HEAT_MARKER_PLACED", playerId: "p2", ceramicId: "c99" }, context(locale, empty));
      expect(text).not.toMatch(/c99/);
      expect(problems(text)).toEqual([]);
    }
  });

  it("never names a Contribution card before the reveal, and states the reveal in full", () => {
    expect(publicEventText(SAMPLES.CONTRIBUTION_SUBMITTED, context("en"))).toBe("Zhao chose a Contribution in secret");
    expect(publicEventText(SAMPLES.CONTRIBUTIONS_REVEALED, context("en"))).toBe("Contributions revealed: Lin Stoke the Fire +2 (Fuel Ledger), Zhao Bank the Fire −1");
    expect(publicEventText(SAMPLES.CONTRIBUTIONS_REVEALED, context("zh-CN"))).toBe("控火亮牌：Lin添柴+2（柴簿）、Zhao压火−1");
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

  it("states the Canal Wharf Shifu's unseen card, named only to its owner", () => {
    const drawn: PublicGameEvent = { type: "ORDER_RESERVED", playerId: "p2", via: "canal_wharf", source: "deck_top", slotIndex: null, orderId: null };
    expect(publicEventText(drawn, en)).toBe("Zhao took the top Main Order into their hand, unseen");
    expect(publicEventText(drawn, zh)).toBe("Zhao不看牌面拿取主委托牌堆顶一张，收入手中");
    const own: GameEvent = { type: "ORDER_RESERVED", playerId: "p1", via: "canal_wharf", source: "deck_top", slotIndex: null, orderId: null, secret: { visibleTo: "p1", orderId: "O07" } };
    const { secret: _secret, ...publicPart } = own as GameEvent & { secret?: unknown };
    expect(eventText(entry(publicPart as PublicGameEvent, 1, own), en)).toBe("Lin took O07 from the top of the Main Order deck");
  });

  it("puts looked cards on the bottom of the Main Order deck: a count for others, the cards for the looker", () => {
    expect(publicEventText(SAMPLES.LOOKED_ORDERS_TO_BOTTOM, en)).toBe("Zhao put 2 looked-at Orders face down on the bottom of the Main Order deck");
    expect(publicEventText(SAMPLES.LOOKED_ORDERS_TO_BOTTOM, zh)).toBe("Zhao把所看的2张委托面朝下放到主委托牌堆底");
    const own = OWN.LOOKED_ORDERS_TO_BOTTOM;
    const { secret: _secret, ...publicPart } = own;
    expect(eventText(entry(publicPart, 1, own), en)).toBe("Lin put O14, O39 face down on the bottom of the Main Order deck");
  });

  it("states the Colour Samples swap, then where its held Order went, never which Order, except to its owner", () => {
    // Colour Samples is used (TECH_USED) only by its swap (v1.6.2 L617); that line names the swap.
    const used: PublicGameEvent = { type: "TECH_USED", playerId: "p2", techId: "T10" };
    expect(publicEventText(used, en)).toBe("Zhao used Colour Samples to swap a held Order");
    expect(publicEventText(used, zh)).toBe("Zhao使用色样簿换单");
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
    expect(publicEventText({ ...inspected, count: 2 }, en)).toBe("Zhao is inspecting the top 2 Firing Techs");
    expect(publicEventText(SAMPLES.PRIVATE_LOOK_OPENED, en)).toBe("Zhao is looking at the top 3 Main Orders");
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

  it("says Canal Barge's use with its Coins, and folds the Coins line that follows it (v1.6.2 L622)", () => {
    const used: PublicGameEvent = { type: "TECH_USED", playerId: "p2", techId: "T23" };
    expect(publicEventText(used, en)).toBe("Zhao used Canal Barge: +2 Coins");
    expect(publicEventText(used, zh)).toBe("Zhao使用漕船：得2铜钱");
    const coins = SAMPLES.RESOURCES_CHANGED;
    expect(repeatsPreviousEntry(entry(coins, 2), entry(used, 1))).toBe(true);
    // Anything else stays: another player, another Tech, other amounts or reasons.
    expect(repeatsPreviousEntry(entry({ ...coins, playerId: "p1" }, 2), entry(used, 1))).toBe(false);
    expect(repeatsPreviousEntry(entry(coins, 2), entry({ ...used, techId: "T25" }, 1))).toBe(false);
    expect(repeatsPreviousEntry(entry({ ...coins, coins: 3 }, 2), entry(used, 1))).toBe(false);
    expect(repeatsPreviousEntry(entry({ ...coins, reason: "guan" }, 2), entry(used, 1))).toBe(false);
    expect(repeatsPreviousEntry(entry(coins, 2), undefined)).toBe(false);
    // A salvage's Coins fold into the salvage line the same way.
    const salvaged = SAMPLES.CERAMIC_SALVAGED;
    const salvageCoins: PublicGameEvent = { type: "RESOURCES_CHANGED", playerId: "p2", clay: 0, wood: 0, coins: 2, reason: "salvage" };
    expect(publicEventText(salvaged, en)).toContain("for 2 Coins");
    expect(repeatsPreviousEntry(entry(salvageCoins, 2), entry(salvaged, 1))).toBe(true);
    expect(repeatsPreviousEntry(entry({ ...salvageCoins, coins: 3 }, 2), entry(salvaged, 1))).toBe(false);
    // The Imperial Grant's resources fold into the grant line, which states them.
    const grant = SAMPLES.IMPERIAL_GRANT_RECEIVED;
    const granted: PublicGameEvent = { type: "RESOURCES_CHANGED", playerId: "p2", clay: 1, wood: 1, coins: 1, reason: "imperial_grant" };
    expect(repeatsPreviousEntry(entry(granted, 2), entry(grant, 1))).toBe(true);
    expect(repeatsPreviousEntry(entry({ ...granted, wood: 0 }, 2), entry(grant, 1))).toBe(false);
    expect(repeatsPreviousEntry(entry({ ...granted, playerId: "p1" }, 2), entry(grant, 1))).toBe(false);
    // A Guild Hall payment folds into the acquisition after it, which states the cost.
    const paid: PublicGameEvent = { type: "RESOURCES_CHANGED", playerId: "p2", clay: 0, wood: 0, coins: -3, reason: "guild_hall" };
    const acquired = SAMPLES.TECH_ACQUIRED;
    expect(publicEventText(acquired, en)).toBe("Zhao acquired Test Pieces: pay 3 Coins, +1 VP");
    expect(repeatsNextEntry(entry(paid, 1), entry(acquired, 2))).toBe(true);
    expect(repeatsNextEntry(entry({ ...paid, coins: -2 }, 1), entry(acquired, 2))).toBe(false);
    expect(repeatsNextEntry(entry({ ...paid, playerId: "p1" }, 1), entry(acquired, 2))).toBe(false);
    expect(repeatsNextEntry(entry(paid, 1), undefined)).toBe(false);
    const log = [entry(SAMPLES.WORKER_PLACED, 1), entry(paid, 2), entry(acquired, 3), entry(used, 4), entry(coins, 5)];
    expect(log.map((_line, index) => foldedEntry(log, index))).toEqual([false, true, false, false, true]);
    // Other Techs keep the plain line.
    expect(publicEventText({ ...used, techId: "T13" }, en)).toBe("Zhao used Test Pieces");
  });
});

describe("Order Phase lines", () => {
  // The engine ends a turn automatically both when it opens with nothing completable and after
  // completions leave nothing completable (src/game/orders/phase.ts): the line is true for both.
  it("says an automatic end without claiming the player completed nothing", () => {
    const ended = SAMPLES.ORDER_TURN_ENDED;
    expect(publicEventText(ended, context("en"))).toBe("Zhao has no more Orders to complete");
    expect(publicEventText(ended, context("zh-CN"))).toBe("Zhao再没有可以完成的委托");
    expect(publicEventText({ ...ended, automatic: false }, context("en"))).toBe("Zhao ended their Order turn");
  });

  it("folds an Order reward's Coins into the completion line that states them", () => {
    const completed = SAMPLES.ORDER_COMPLETED;
    const reward: PublicGameEvent = { type: "RESOURCES_CHANGED", playerId: "p2", clay: 0, wood: 0, coins: 2, reason: "order_reward" };
    expect(publicEventText(completed, context("en"))).toContain("+2 Coins");
    expect(repeatsPreviousEntry(entry(reward, 2), entry(completed, 1))).toBe(true);
    // Anything else stays: another reason, another player, other amounts, no completion before.
    expect(repeatsPreviousEntry(entry({ ...reward, reason: "salvage" }, 2), entry(completed, 1))).toBe(false);
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
    expect(eventText(line, context("en"))).toBe("Lin was dealt S02, S05, O41");
    // Another seat's secret (or a viewer that is not seated) falls back to the public line.
    expect(ownSecretOf(line, "p2")).toBeNull();
    const asZhao = eventText(line, context("en", VIEW, "p2"));
    expect(asZhao).toBe("Lin was dealt Orders: 2 Starting, 1 Main");
    expect(asZhao).not.toMatch(/S02|S05|O41/);
    expect(ownSecretOf(line, null)).toBeNull();
  });

  it("ignore a secret attached to an event of another type", () => {
    const line = entry(SAMPLES.HAND_TRIMMED, 1, OWN.ORDERS_DEALT);
    expect(ownSecretOf(line, "p1")).toBeNull();
    expect(eventText(line, context("en"))).not.toMatch(/S02|S05|O41/);
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
    const snapshot = fixtureSnapshot(structuredClone(fixture("m3_heat_marker_step_3p")));
    const view = snapshot.view;
    if (view === null) throw new Error("no view");
    const model = gameModelOf(view, snapshot.seats);
    const loaded: LoadedCeramic[] = model.board.kilnSpaces.flatMap((space) => space.ceramics);
    expect(loaded.length).toBeGreaterThan(0);
    const labelView = logCeramicView(model, []);
    for (const ceramic of loaded) expect(labelView.ceramics?.[ceramic.id]?.shape).toBe(ceramic.shape);
  });
});
