/**
 * Hidden-information independence of the computer player (DESIGN §4.5, §9.2 P9). At every
 * decision of complete seeded games, `GameState.hidden` is re-randomised while the deciding
 * seat's own private view stays fixed: the Main and Starting Order identities in the decks,
 * the discard, the box and every other seat's hand (same counts), every Tech deck and Fire
 * deck order, another seat's private look and peek, and other seats' sealed Contributions.
 * The observation the seat receives must be byte-identical and its choice unchanged.
 */

import { describe, expect, it } from "vitest";
import { FIRING, SeededRandom, isStartingOrderId } from "../../../src/game/index.ts";
import type { ContributionCardId, FireModifier, GameState, OrderId, PlayerId, PrivateFiringState, TechDiscipline, TechId } from "../../../src/game/index.ts";
import { chooseStrategicCommand, createComputerObservation, isPlayerViewOnly } from "../../../src/multiplayer/index.ts";
import { playEngineTable } from "./computer_support.ts";

function shuffled<T>(items: readonly T[], rng: SeededRandom): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = rng.nextInt(index + 1);
    const held = result[index] as T;
    result[index] = result[swap] as T;
    result[swap] = held;
  }
  return result;
}

/** Deals `pool` (shuffled) back into containers of the given sizes. */
function redeal<T>(pool: readonly T[], sizes: readonly number[], rng: SeededRandom): T[][] {
  const cards = shuffled(pool, rng);
  let offset = 0;
  return sizes.map((size) => {
    const part = cards.slice(offset, offset + size);
    offset += size;
    return part;
  });
}

const CARDS: readonly ContributionCardId[] = ["BANK", "TEND", "STOKE", "FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"];

/**
 * A copy of `state` and `privateFiring` whose server-only secrets are re-randomised, except
 * what `viewer` may see (its hand, its own look and peek, its sealed Contribution).
 */
function rerandomiseHidden(
  state: GameState,
  privateFiring: PrivateFiringState,
  viewer: PlayerId,
  rng: SeededRandom,
): { state: GameState; privateFiring: PrivateFiringState } {
  const next = structuredClone(state);
  const hidden = next.hidden;
  const others = next.playerOrder.filter((playerId) => playerId !== viewer);
  const otherLook = hidden.pendingLook !== null && hidden.pendingLook.playerId !== viewer ? hidden.pendingLook : null;

  // Main Orders the viewer cannot identify: deck, discard, other hands, another seat's look.
  const mainContainers: OrderId[][] = [
    hidden.mainDeck,
    hidden.mainDiscard,
    ...others.map((playerId) => (hidden.orderHands[playerId] ?? []).filter((orderId) => !isStartingOrderId(orderId))),
    otherLook !== null && otherLook.kind !== "guild_inspection" ? otherLook.orderIds : [],
  ];
  const mainDealt = redeal(mainContainers.flat(), mainContainers.map((c) => c.length), rng);
  // Starting Orders the viewer cannot identify: the box and other hands.
  const startingContainers: OrderId[][] = [hidden.startingBox, ...others.map((playerId) => (hidden.orderHands[playerId] ?? []).filter(isStartingOrderId))];
  const startingDealt = redeal(startingContainers.flat(), startingContainers.map((c) => c.length), rng);

  hidden.mainDeck = mainDealt[0] ?? [];
  hidden.mainDiscard = mainDealt[1] ?? [];
  hidden.startingBox = (startingDealt[0] ?? []).filter(isStartingOrderId);
  others.forEach((playerId, index) => {
    hidden.orderHands[playerId] = shuffled([...(startingDealt[index + 1] ?? []), ...(mainDealt[index + 2] ?? [])], rng);
  });
  if (otherLook !== null && otherLook.kind !== "guild_inspection") {
    otherLook.orderIds = mainDealt[mainDealt.length - 1] ?? [];
  }

  // Tech decks (and another seat's inspection) per discipline, in a new order.
  for (const discipline of ["workshop", "glazing_loading", "firing"] as TechDiscipline[]) {
    // Another seat's inspection, also while it waits behind its Colour Samples look (v1.6.2 L207).
    const inspection = otherLook?.kind === "guild_inspection" ? otherLook : otherLook?.kind === "colour_samples" ? otherLook.inspection : null;
    const inspected = inspection !== null && inspection !== undefined && inspection.discipline === discipline ? inspection : null;
    const containers: TechId[][] = [hidden.techDecks[discipline], inspected?.techIds ?? []];
    const dealt = redeal(containers.flat(), containers.map((c) => c.length), rng);
    hidden.techDecks[discipline] = dealt[0] ?? [];
    if (inspected !== null) inspected.techIds = dealt[1] ?? [];
  }

  // Fire deck order; other seats' peeks.
  hidden.fireDeck = shuffled(hidden.fireDeck, rng);
  for (const playerId of others) {
    const peek = hidden.firePeeks[playerId];
    if (peek !== undefined) peek.modifier = FIRING.fireDeck[rng.nextInt(FIRING.fireDeck.length)] as FireModifier;
  }

  // Other seats' sealed Contributions.
  const nextPrivate = structuredClone(privateFiring);
  for (const playerId of others) {
    if (nextPrivate.submissions[playerId] !== undefined) {
      nextPrivate.submissions[playerId] = { card: CARDS[rng.nextInt(CARDS.length)] as ContributionCardId };
    }
  }
  return { state: next, privateFiring: nextPrivate };
}

describe("computer hidden-information independence", () => {
  it.each([
    [2, 6_201],
    [3, 6_301],
    [4, 6_401],
  ] as const)("never changes a choice when hidden state is re-randomised (%i players, seed %i)", (players, seed) => {
    const rng = new SeededRandom(seed);
    let checked = 0;
    const phases = new Set<string>();
    const result = playEngineTable({
      seed,
      playerCount: players,
      chooserFor: (playerId, seatIndex) => (view) =>
        chooseStrategicCommand(view, { playerId, displayName: playerId, aiSeed: seed + seatIndex, aiPolicyVersion: null }),
      observe: (state, playerId, view, privateFiring) => {
        const seat = { playerId, displayName: playerId, aiSeed: seed + state.playerOrder.indexOf(playerId), aiPolicyVersion: null };
        const original = chooseStrategicCommand(view, seat);
        for (let variant = 0; variant < 2; variant += 1) {
          const perturbed = rerandomiseHidden(state, privateFiring, playerId, rng);
          const other = createComputerObservation(perturbed.state, playerId, perturbed.privateFiring);
          expect(isPlayerViewOnly(other)).toBe(true);
          expect(JSON.stringify(other)).toBe(JSON.stringify(view));
          expect(chooseStrategicCommand(other, seat)).toEqual(original);
        }
        checked += 1;
        phases.add(state.phase.type);
      },
    });
    expect(result.state.phase.type).toBe("finished");
    expect(checked).toBeGreaterThan(50);
    for (const phase of ["setup_kiln_selection", "work_turn", "firing_contributions", "orders"]) expect(phases).toContain(phase);
  }, 120_000);

  it("actually re-randomises what the seat cannot see", () => {
    const captured: { state?: GameState; privateFiring?: PrivateFiringState } = {};
    playEngineTable({
      seed: 6_501,
      playerCount: 3,
      chooserFor: (playerId) => (view) => chooseStrategicCommand(view, { playerId, displayName: playerId, aiSeed: 1, aiPolicyVersion: null }),
      observe: (current, _playerId, _view, currentPrivate) => {
        if (captured.state === undefined && current.phase.type === "work_turn" && current.round === 2) {
          captured.state = current;
          captured.privateFiring = currentPrivate;
        }
      },
    });
    const original = captured.state;
    if (original === undefined || captured.privateFiring === undefined) throw new Error("No Round 2 Work turn observed");
    const perturbed = rerandomiseHidden(original, captured.privateFiring, "p1", new SeededRandom(9));
    expect(perturbed.state.hidden.mainDeck).not.toEqual(original.hidden.mainDeck);
    expect(perturbed.state.hidden.orderHands["p1"]).toEqual(original.hidden.orderHands["p1"]);
    expect(perturbed.state.hidden.mainDeck).toHaveLength(original.hidden.mainDeck.length);
    for (const playerId of ["p2", "p3"]) {
      expect(perturbed.state.hidden.orderHands[playerId]).not.toBeUndefined();
      expect(perturbed.state.hidden.orderHands[playerId]).toHaveLength(original.hidden.orderHands[playerId]?.length ?? 0);
    }
  });
});
