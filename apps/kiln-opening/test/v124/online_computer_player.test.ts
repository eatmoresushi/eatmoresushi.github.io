import { describe, expect, it } from "vitest";
import { ORDER_DEFINITIONS, SeededRandom } from "../../src/game/index.ts";
import type { GameAction, GameState, PlayerId } from "../../src/game/index.ts";
import {
  ONLINE_COMPUTER_POLICY_VERSION,
  chooseOnlineComputerAction,
} from "../../src/multiplayer/computerPlayer.ts";
import type { StoredSeat } from "../../src/multiplayer/types.ts";
import { addGlazed, addLoaded, addShaped, addTechnique, mustApply, setWorkTurn, startedGame } from "./helpers.ts";

function seatFor(playerId: PlayerId): StoredSeat {
  return {
    seatId: `seat-${playerId}`, roomId: "policy", playerId, seatIndex: 0,
    displayName: "Computer", colour: "cinnabar", isHost: true, isComputer: true,
    aiPolicyVersion: ONLINE_COMPUTER_POLICY_VERSION, authUserId: null,
    aiSeed: 7, aiCreatedCommandId: "cmd",
  };
}

/**
 * The policy returns an AuthoritativeCommand, which is a GameAction plus the Contribution
 * command the firing phase submits through its own sealed path. None of these Commission
 * Market cases can produce one, so narrow it rather than widen `mustApply`.
 */
async function choose(state: GameState, playerId: PlayerId): Promise<GameAction> {
  const command = await chooseOnlineComputerAction(state, null as never, seatFor(playerId));
  if (command.type === "SUBMIT_WOOD_CONTRIBUTION") {
    throw new Error("Unexpected Contribution command outside the firing phase");
  }
  return command;
}

/**
 * Put the workshop in a turn where the Commission Market is the action it reaches.
 *
 * The policy is a fixed priority chain -- load, glaze, form, Guild, then Market -- so a
 * fresh workshop forms vessels instead. Emptying its resources closes every earlier branch.
 */
function marketTurn(state: GameState, playerId: PlayerId): void {
  state.players[playerId]!.resources = { clay: 0, wood: 0, coins: 0 };
  setWorkTurn(state, playerId);
}

/**
 * V1.2.4 lets a Commission Market reservation take the top Main Order unseen.
 *
 * The branch shipped dead: the work-phase gate only placed a worker when the display held
 * cards, while the branch itself only fired when the display was empty -- and the display
 * empties only once the deck and discard are both exhausted, which also empties the deck
 * the blind take would draw from. The two conditions could never hold at once, so across
 * 60 measured games the option was chosen zero times.
 */
describe("V1.2.4 online computer policy: Commission Market", () => {
  it("reserves the top Main Order unseen when nothing face up is deliverable", async () => {
    const { state: initial, rng } = startedGame(2, 4401);
    const state = structuredClone(initial);
    // Every face-up Order needs three ceramics; this workshop has none.
    state.marketDisplay = ["O43", "O44", "O45", "O46", "O47"];
    for (const orderId of state.marketDisplay) {
      expect(ORDER_DEFINITIONS[orderId]!.ceramics.length).toBe(3);
    }
    marketTurn(state, "P1");
    const begin = await choose(state, "P1");
    expect(begin).toEqual(expect.objectContaining({ type: "BEGIN_OFFICE_ORDERS" }));
    const opened = mustApply(state, "P1", begin, rng);
    const reserve = await choose(opened, "P1");
    expect(reserve).toEqual({ type: "OFFICE_TAKE_TOP_ORDER" });

    const before = opened.players["P1"]!.orderHand.length;
    const taken = mustApply(opened, "P1", reserve, rng);
    const hand = taken.players["P1"]!.orderHand;
    expect(hand).toHaveLength(before + 1);
    // It came off the deck, not the display.
    expect(opened.marketDisplay).not.toContain(hand[hand.length - 1]);
  });

  it("prefers the highest-VP deliverable face-up Order over whatever sits leftmost", async () => {
    const { state: initial, rng } = startedGame(2, 4402);
    const state = structuredClone(initial);
    // O01 pays 3 VP and sits leftmost; O24 pays 10 and is equally deliverable.
    state.marketDisplay = ["O01", "O24", "O43", "O44", "O45"];
    marketTurn(state, "P1");
    const opened = mustApply(state, "P1", await choose(state, "P1"), rng);
    expect(await choose(opened, "P1")).toEqual({ type: "OFFICE_TAKE_ORDER", orderId: "O24" });
  });

  it("still places a Commission Market worker when only the deck can supply an Order", async () => {
    const { state: initial, rng } = startedGame(2, 4403);
    const state = structuredClone(initial);
    // An empty display with a stocked deck is legal in V1.2.4; the policy used to refuse it.
    state.marketDisplay = [];
    expect(state.marketDeck.length).toBeGreaterThan(0);
    marketTurn(state, "P1");
    const begin = await choose(state, "P1");
    expect(begin).toEqual(expect.objectContaining({ type: "BEGIN_OFFICE_ORDERS" }));
    const opened = mustApply(state, "P1", begin, rng);
    expect(await choose(opened, "P1")).toEqual({ type: "OFFICE_TAKE_TOP_ORDER" });
  });

  it("does not reach for the deck while a deliverable Order is face up", async () => {
    const { state: initial, rng } = startedGame(2, 4404);
    const state = structuredClone(initial);
    state.marketDisplay = ["O43", "O01", "O44", "O45", "O46"];
    marketTurn(state, "P1");
    const opened = mustApply(state, "P1", await choose(state, "P1"), rng);
    expect(await choose(opened, "P1")).toEqual({ type: "OFFICE_TAKE_ORDER", orderId: "O01" });
  });
});

/**
 * V1.2.4's Shifu Guild action -- inspect the top 2 Techs of a discipline, then take any
 * face-up tile at 1 Coin less -- needs a Shifu to reach the Guild, and Apprentices cannot
 * inspect. The policy spent the Shifu on production first, so across 312 measured Guild
 * actions the inspect fired twice.
 *
 * The correction is deliberately narrow. Sending the Shifu whenever a Tech was merely
 * wanted made the inspect universal but cost a Shifu production action every round, and
 * measured 2.4 VP per seat worse over 60 games. It now diverts only when the discount buys
 * a tile no Apprentice here could afford, which is strength-neutral.
 */
describe("V1.2.4 online computer policy: Guild & Academy", () => {
  it("sends the Shifu when only the Shifu discount can afford a tile", async () => {
    const { state: initial } = startedGame(2, 4501);
    const state = structuredClone(initial);
    state.techniqueDisplay = { forming: ["T01"], glazing: ["T06"], firing: ["T11"] };
    // Every tile costs 2: a Shifu pays 1, an Apprentice cannot pay at all.
    state.players["P1"]!.resources = { clay: 4, wood: 4, coins: 1 };
    setWorkTurn(state, "P1");
    const action = await choose(state, "P1");
    expect(action).toEqual(expect.objectContaining({ type: "BEGIN_GUILD_ACTION" }));
    const worker = state.players["P1"]!.workers[(action as { workerId: string }).workerId];
    expect(worker?.kind).toBe("shifu");
  });

  it("leaves the Shifu on production when an Apprentice could buy the tile anyway", async () => {
    const { state: initial } = startedGame(2, 4502);
    const state = structuredClone(initial);
    state.techniqueDisplay = { forming: ["T01"], glazing: ["T06"], firing: ["T11"] };
    // 2 Coins: the Apprentice affords the same tile, so the discount buys nothing extra.
    state.players["P1"]!.resources = { clay: 4, wood: 4, coins: 2 };
    setWorkTurn(state, "P1");
    const action = await choose(state, "P1");
    expect(action.type).not.toBe("BEGIN_GUILD_ACTION");
    expect(action).toEqual(expect.objectContaining({ type: "FORM_CERAMICS" }));
  });

  it("still reaches the Guild with an Apprentice once the Shifu is placed", async () => {
    const { state: initial } = startedGame(2, 4503);
    const state = structuredClone(initial);
    state.techniqueDisplay = { forming: ["T01"], glazing: ["T06"], firing: ["T11"] };
    state.players["P1"]!.resources = { clay: 0, wood: 0, coins: 2 };
    const shifu = Object.values(state.players["P1"]!.workers).find(({ kind }) => kind === "shifu")!;
    shifu.status = "placed";
    shifu.locationId = "labour";
    setWorkTurn(state, "P1");
    const action = await choose(state, "P1");
    expect(action).toEqual(expect.objectContaining({ type: "BEGIN_GUILD_ACTION" }));
    const worker = state.players["P1"]!.workers[(action as { workerId: string }).workerId];
    expect(worker?.kind).toBe("apprentice");
  });
});

/**
 * The policy bought the first affordable tile in Forming, Glazing, Firing display order.
 * Forming tiles cost 2 and are always affordable, so across 312 measured Guild actions it
 * bought a Firing tile zero times -- including Second Firing, which measurement puts at
 * +2.17 per game, the most valuable tile it can actually resolve.
 */
describe("V1.2.4 online computer policy: which Tech it buys", () => {
  const buy = async (state: GameState) => {
    const action = await choose(state, "P1");
    expect(action).toEqual(expect.objectContaining({ type: "BEGIN_GUILD_ACTION" }));
    const opened = mustApply(state, "P1", action, new SeededRandom(1));
    const inspectOrBuy = await choose(opened, "P1");
    if (inspectOrBuy.type !== "GUILD_INSPECT_DISCIPLINE") return inspectOrBuy;
    const inspected = mustApply(opened, "P1", inspectOrBuy, new SeededRandom(1));
    return choose(inspected, "P1");
  };

  it("takes the Firing tile over an equally affordable Forming tile", async () => {
    const { state: initial } = startedGame(2, 4601);
    const state = structuredClone(initial);
    // T05 and T06 cost 2 and still resolve for nobody; T14 costs 3 and is measured worth.
    state.techniqueDisplay = { forming: ["T05"], glazing: ["T06"], firing: ["T14"] };
    state.techniqueDecks = { forming: [], glazing: [], firing: [] };
    state.players["P1"]!.resources = { clay: 0, wood: 0, coins: 5 };
    setWorkTurn(state, "P1");
    expect(await buy(state)).toEqual(expect.objectContaining({
      type: "GUILD_BUY_TECHNIQUE", techniqueId: "T14",
    }));
  });

  it("orders the tiles it can resolve by measured worth", async () => {
    const { state: initial } = startedGame(2, 4602);
    const state = structuredClone(initial);
    // All resolve; Drying Frames (+8.67) is far the strongest tile measured.
    state.techniqueDisplay = { forming: ["T02", "T04"], glazing: ["T10"], firing: ["T11", "T14"] };
    state.techniqueDecks = { forming: [], glazing: [], firing: [] };
    state.players["P1"]!.resources = { clay: 0, wood: 0, coins: 5 };
    setWorkTurn(state, "P1");
    expect(await buy(state)).toEqual(expect.objectContaining({ techniqueId: "T04" }));
  });

  it("falls back to the cheapest tile when none of them resolves for this policy", async () => {
    const { state: initial } = startedGame(2, 4603);
    const state = structuredClone(initial);
    // None of these can fire: the policy only ever applies Plain and passes no activation
    // field. Owning any tile still unlocks a workshop space, so it buys the cheapest.
    state.techniqueDisplay = { forming: ["T03"], glazing: ["T06"], firing: ["T12"] };
    // Empty decks so an inspection cannot add tiles and the display is the whole pool.
    state.techniqueDecks = { forming: [], glazing: [], firing: [] };
    state.players["P1"]!.resources = { clay: 0, wood: 0, coins: 5 };
    setWorkTurn(state, "P1");
    const action = await buy(state);
    expect(action).toEqual(expect.objectContaining({ type: "GUILD_BUY_TECHNIQUE" }));
    // T03 and T06 cost 2; T12 costs 3, so cost breaks the all-zero tie.
    expect(["T03", "T06"]).toContain((action as { techniqueId: string }).techniqueId);
  });

  it("buys a valuable inspected tile over a worthless face-up one", async () => {
    const { state: initial } = startedGame(2, 4604);
    const state = structuredClone(initial);
    state.techniqueDisplay = { forming: ["T03"], glazing: ["T06"], firing: ["T12"] };
    state.techniqueDecks = { forming: [], glazing: [], firing: ["T11", "T14"] };
    // 1 Coin: only the Shifu discount reaches a 2-cost tile, so the Shifu takes the Guild.
    state.players["P1"]!.resources = { clay: 4, wood: 4, coins: 1 };
    setWorkTurn(state, "P1");
    const begin = await choose(state, "P1");
    const opened = mustApply(state, "P1", begin, new SeededRandom(1));
    const inspect = await choose(opened, "P1");
    expect(inspect).toEqual({ type: "GUILD_INSPECT_DISCIPLINE", discipline: "firing" });
    const inspected = mustApply(opened, "P1", inspect, new SeededRandom(1));
    // T11 costs 2 and resolves; the face-up tiles do not resolve at all.
    expect(await choose(inspected, "P1")).toEqual(expect.objectContaining({ techniqueId: "T11" }));
  });
});

/**
 * Ten of the fifteen Advanced Techs could never fire, because the policy never sent the
 * field that switches them on: it glazed every ceramic Plain and passed no
 * `useTechniqueIds`, `dryingFrames`, `glazePalette`, `reworkingTable` or
 * `useKilnFurniture` anywhere. These cases pin the ones worth activating.
 */
describe("V1.2.4 online computer policy: Tech activation", () => {
  const glazeTurn = (state: GameState) => {
    state.players["P1"]!.resources = { clay: 0, wood: 0, coins: 5 };
    addShaped(state, "P1", "bowl");
    setWorkTurn(state, "P1");
  };

  it("applies a free Carved Decoration instead of paying for Plain", async () => {
    const { state: initial } = startedGame(2, 4701);
    const state = structuredClone(initial);
    addTechnique(state, "P1", "T07");
    glazeTurn(state);
    const action = await choose(state, "P1");
    expect(action).toEqual(expect.objectContaining({ type: "GLAZE_CERAMICS" }));
    const glaze = action as { selections: Array<{ decoration: string }>; useTechniqueIds?: string[] };
    expect(glaze.selections[0]!.decoration).toBe("carved");
    expect(glaze.useTechniqueIds).toContain("T07");
  });

  it("glazes a vessel it just formed with Drying Frames", async () => {
    const { state: initial } = startedGame(2, 4702);
    const state = structuredClone(initial);
    addTechnique(state, "P1", "T04");
    state.players["P1"]!.resources = { clay: 4, wood: 0, coins: 3 };
    setWorkTurn(state, "P1");
    const action = await choose(state, "P1");
    expect(action).toEqual(expect.objectContaining({ type: "FORM_CERAMICS" }));
    const form = action as { useTechniqueIds?: string[]; dryingFrames?: { formedIndex: number } };
    expect(form.useTechniqueIds).toContain("T04");
    expect(form.dryingFrames?.formedIndex).toBe(0);
  });

  it("aims the Contribution at the Fire card Test Pieces already paid to see", async () => {
    const { state: initial, rng } = startedGame(2, 4703);
    const state = structuredClone(initial);
    // One Celadon ceramic (Preferred Heat 2) in a Middle space, so zone is 0.
    addLoaded(state, "P1", "bowl", "celadon", "plain", "middle_1");
    state.players["P1"]!.resources = { clay: 0, wood: 4, coins: 0 };
    state.phase = {
      type: "firing_contributions",
      windowId: `${state.gameId}:w`, eligiblePlayerIds: ["P1"], submittedPlayerIds: [],
    };
    state.firingContext = null;

    const contribution = (s: GameState) =>
      chooseOnlineComputerAction(s, null as never, seatFor("P1"));

    // Blind, Base Heat 2 already lands the ceramic exactly: Tend.
    expect(await contribution(state)).toEqual(expect.objectContaining({ card: "TEND" }));

    // Knowing Fire is -1, Base Heat must rise to 3 to keep Actual Heat at 2: Stoke.
    const peeked = structuredClone(state);
    peeked.privateFirePeeks = { P1: -1 };
    expect(await contribution(peeked)).toEqual(expect.objectContaining({ card: "STOKE" }));
    expect(rng).toBeDefined();
  });

  it("leaves Kiln Furniture alone, which measured worse than not owning it", async () => {
    const { state: initial } = startedGame(2, 4704);
    const state = structuredClone(initial);
    addTechnique(state, "P1", "T15");
    addGlazed(state, "P1", "bowl", "celadon", "plain");
    state.players["P1"]!.resources = { clay: 0, wood: 0, coins: 0 };
    setWorkTurn(state, "P1");
    const action = await choose(state, "P1");
    expect(action).toEqual(expect.objectContaining({ type: "USE_KILN_YARD" }));
    const loads = (action as { loads: Array<{ useKilnFurniture?: boolean }> }).loads;
    expect(loads.every((load) => load.useKilnFurniture !== true)).toBe(true);
  });
});
