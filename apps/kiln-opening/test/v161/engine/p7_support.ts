/**
 * P7 test support: a seeded random-game driver (DESIGN §8.3), replay, privacy checks and the
 * §5.4 selector–validator agreement checker. Used by `fuzz`, `determinism`,
 * `selector_agreement`, `legal_actions` and `tech_matrix`.
 *
 * The driver plays exactly as the service does: `applyAction` for actions,
 * `submitContribution` with a `PrivateFiringState` for Contributions, a game RNG for the
 * engine and a separate chooser RNG for the choices, so choices never perturb engine draws.
 */

import { createHash } from "node:crypto";
import {
  DECORATIONS,
  DISCIPLINES,
  GAME_CONFIG,
  GLAZES,
  KILNS,
  KILN_IDS,
  KILN_SPACE_IDS,
  MAIN_ORDER_IDS,
  ORDERS,
  SHAPES,
  STARTING_ORDER_IDS,
  TECHS,
  activeKilnSpaces,
  techsOfDiscipline,
} from "../../../src/game/content.ts";
import { applyAction, createGame, submitContribution, validateAction } from "../../../src/game/engine.ts";
import { validateContribution } from "../../../src/game/firing/contributions.ts";
import { parseCommand } from "../../../src/game/actionGuard.ts";
import { assertInvariants, hiddenIdsIn, publiclyVisibleIds } from "../../../src/game/invariants.ts";
import { type SampleOptions, legalActionFamilies, legalActions, legalCommands, sampleLegalAction } from "../../../src/game/legalActions.ts";
import { SeededRandom } from "../../../src/game/rng.ts";
import { computeFinalResult } from "../../../src/game/scoring.ts";
import {
  afterQualityOptions,
  colourSamplesSwapOptions,
  commissionOptions,
  completableOrders,
  contributionOptions,
  dingCopyableVesselIndexes,
  guildInspectionOptions,
  guildOptions,
  imperialPriorityOptions,
  junOptions,
  kilnMasterOption,
  kilnSelectionOptions,
  legalContributions,
  loadDestinationOptions,
  lookedOrderOptions,
  magistratesHallQuote,
  orderMatchOptions,
  placementOptions,
  quoteFormDecorate,
  quoteMaterialsYard,
  quoteGlazeLoad,
  sellFlawedOptions,
  settersMarkOptions,
  setupChoiceOptions,
  testPiecesOptions,
} from "../../../src/game/selectors.ts";
import { ceramicsOf, decisionPrompt, lookup } from "../../../src/game/state.ts";
import { actorViewOf, eventForViewer, projectEvent, projectPublicState } from "../../../src/game/view.ts";
import type {
  ActorView,
  AuthoritativeCommand,
  SelectPick,
  GameAction,
  GameEvent,
  GameRuleErrorCode,
  GameState,
  KilnId,
  KilnSpaceId,
  LoadSpec,
  OrderId,
  PlayerCount,
  PlayerId,
  PrivateFiringState,
  SubmitContributionCommand,
  TechId,
} from "../../../src/game/types.ts";
import { type CeramicSpec, type PlayerSpec, buildState } from "./support/fixtures.ts";
import { keySortedJsonRoundTrip } from "./support/firing.ts";

export { keySortedJsonRoundTrip };

export interface CommandRecord {
  actorId: PlayerId;
  command: AuthoritativeCommand;
}

/** SHA-256 of the key-sorted JSON: identical for states that differ only in key order. */
export function stateHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(keySortedJsonRoundTrip(value))).digest("hex");
}

export function players(count: PlayerCount): Array<{ id: PlayerId; displayName: string }> {
  return Array.from({ length: count }, (_, seat) => ({ id: `p${seat + 1}`, displayName: `Player ${seat + 1}` }));
}

// ── A table that drives the engine like the service ──────────────────────────────────

export class FuzzTable {
  state: GameState;
  privateState: PrivateFiringState;
  readonly rng: SeededRandom;
  readonly log: CommandRecord[] = [];
  readonly events: GameEvent[] = [];

  constructor(state: GameState, rng: SeededRandom, events: readonly GameEvent[]) {
    this.state = state;
    this.rng = rng;
    this.privateState = { gameId: state.gameId, windowId: null, submissions: {} };
    this.events.push(...events);
    this.sync();
  }

  static create(seed: number, playerCount: PlayerCount): FuzzTable {
    const rng = new SeededRandom(seed);
    const created = createGameOrThrow(`fuzz-game-${seed}`, playerCount, rng);
    return new FuzzTable(created.state, rng, created.events);
  }

  /** A table continuing `state` with an RNG at `rngState` (a `getState()` value). */
  static fromState(state: GameState, rngState: number): FuzzTable {
    return new FuzzTable(structuredClone(state), new SeededRandom(rngState), []);
  }

  private sync(): void {
    const phase = this.state.phase;
    if (phase.type === "firing_contributions" && this.privateState.windowId !== phase.windowId) {
      this.privateState = { gameId: this.state.gameId, windowId: phase.windowId, submissions: {} };
    }
  }

  /** Applies a command that must succeed; returns its events. */
  apply(actorId: PlayerId, command: AuthoritativeCommand, context = ""): GameEvent[] {
    if (command.type === "SUBMIT_CONTRIBUTION") {
      const result = submitContribution(this.state, this.privateState, actorId, command, this.rng, { checkInvariants: true });
      if (!result.ok) {
        throw new Error(`${context} ${actorId} SUBMIT_CONTRIBUTION rejected: ${result.error.code} — ${result.error.message}`);
      }
      this.state = result.state;
      this.privateState = result.privateState;
      this.log.push({ actorId, command });
      this.events.push(...result.events);
      this.sync();
      return result.events;
    }
    const result = applyAction(this.state, actorId, command, this.rng, { checkInvariants: true });
    if (!result.ok) {
      throw new Error(`${context} ${actorId} ${command.type} rejected: ${result.error.code} — ${result.error.message}`);
    }
    this.state = result.state;
    this.log.push({ actorId, command });
    this.events.push(...result.events);
    this.sync();
    return result.events;
  }

  view(actorId: PlayerId): ActorView {
    return actorViewOf(this.state, actorId, this.privateState);
  }
}

function createGameOrThrow(gameId: string, playerCount: PlayerCount, rng: SeededRandom): { state: GameState; events: GameEvent[] } {
  const created = createGame({ gameId, players: players(playerCount) }, rng, { checkInvariants: true });
  if (!created.ok) {
    throw new Error(`createGame failed: ${created.error.code}`);
  }
  return created;
}

// ── Privacy (DESIGN §4.3, §8.3) ──────────────────────────────────────────────────────

/** Violations of the hidden-information boundary in the projected events of one command. */
export function eventPrivacyViolations(before: GameState, after: GameState, events: readonly GameEvent[]): string[] {
  const violations: string[] = [];
  const beforeIds = publiclyVisibleIds(before);
  const afterIds = publiclyVisibleIds(after);
  const allowed = {
    orders: new Set([...beforeIds.orders, ...afterIds.orders]),
    techs: new Set([...beforeIds.techs, ...afterIds.techs]),
  };
  for (const event of events) {
    const projected = projectEvent(event);
    if (Object.hasOwn(projected, "secret")) {
      violations.push(`${event.type} keeps its secret in the public projection`);
    }
    const leaked = hiddenIdsIn(projected, allowed);
    if (leaked.length > 0) {
      violations.push(`${event.type} names hidden IDs ${leaked.join(", ")}`);
    }
    if (event.type === "CONTRIBUTION_SUBMITTED" && Object.keys(projected).some((key) => key === "card" || key === "fuelLedger")) {
      violations.push("CONTRIBUTION_SUBMITTED carries the card");
    }
    const secret = (event as { secret?: { visibleTo: PlayerId } }).secret;
    if (secret !== undefined) {
      for (const playerId of after.playerOrder) {
        const seen = eventForViewer(event, playerId);
        if (playerId !== secret.visibleTo && Object.hasOwn(seen, "secret")) {
          violations.push(`${event.type}'s secret reaches ${playerId}`);
        }
      }
    }
  }
  // No unrevealed Contribution in the public state (DESIGN §4.2).
  const publicState = projectPublicState(after);
  if (after.phase.type === "firing_contributions" && publicState.firing?.contributions !== null) {
    violations.push("Contributions are public while the window is open");
  }
  return violations;
}

// ── Rich start states ────────────────────────────────────────────────────────────────

function shuffledWith<T>(items: readonly T[], rng: SeededRandom): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = rng.nextInt(index + 1);
    [result[index], result[swap]] = [result[swap] as T, result[index] as T];
  }
  return result;
}

/**
 * A legal Round 1 Work-turn state with every player holding a random Kiln, one Tech per
 * discipline from a seed-rotated window (each Tech owned by at most one player; consecutive
 * seeds deal every Tech), Recognition 0–3, extra resources, a hand of 2 Starting + 2 Main
 * Orders, and a few Shaped and Finished ceramics (DESIGN §8.1 `buildState`). The owners of
 * Inverted Firing, Ru, Guan and Tribute Ware also get what those need to fire: stackable
 * vessels and one loaded ceramic, a Ru-triggering Masterpiece, a completable Crown Order.
 * Deterministic in `seed`.
 */
export function richStartState(seed: number, playerCount: PlayerCount): GameState {
  const rng = new SeededRandom(seed ^ 0x5eed);
  const kilns = shuffledWith(KILN_IDS, rng);
  // Each discipline's Techs go to the seats from a window that rotates with the seed, so
  // consecutive seeds (the fuzz cases) together deal every Tech; the seats get the window's
  // Techs in a random order.
  const techsByDiscipline = DISCIPLINES.map((d) => {
    const all = techsOfDiscipline(d);
    const start = (seed * playerCount) % all.length;
    const window = Array.from({ length: playerCount }, (_, seat) => all[(start + seat) % all.length] as TechId);
    return shuffledWith(window, rng);
  });
  // Jun may follow Second Firing (R7) only on one board: when Jun is dealt, its board goes to
  // the Second Firing owner, so random play reaches that window (fuzz coverage asserts every
  // phase). The Kilns stay a permutation, and every Kiln is still dealt across the seeds.
  const secondFiringSeat = techsByDiscipline[DISCIPLINES.indexOf("firing")]?.indexOf("T14") ?? -1;
  const junSeat = kilns.slice(0, playerCount).indexOf("JU");
  if (secondFiringSeat >= 0 && junSeat >= 0 && junSeat !== secondFiringSeat) {
    [kilns[junSeat], kilns[secondFiringSeat]] = [kilns[secondFiringSeat] as KilnId, kilns[junSeat] as KilnId];
  }
  const starting = shuffledWith(STARTING_ORDER_IDS, rng);
  const main = shuffledWith(MAIN_ORDER_IDS, rng);
  const ceramics: CeramicSpec[] = [];
  const crownOrders = new Set<OrderId>();
  const specs: PlayerSpec[] = Array.from({ length: playerCount }, (_, seat) => {
    const id = `p${seat + 1}`;
    const seatTechs = techsByDiscipline.map((list) => list[seat] as TechId);
    // Inverted Firing stacks a Bowl, Plate or Brush Washer onto a space holding exactly 1 of
    // the owner's ceramics: give its owner such vessels and one ceramic already loaded (as if
    // by an earlier turn), so random play reaches a stack (fuzz coverage asserts every Tech
    // fires). One Tech per discipline per game, so at most one seat owns it.
    const inverted = seatTechs.includes("T21");
    const shapes = inverted ? TECHS.T21.params.shapes : SHAPES;
    if (inverted) {
      const spaces = activeKilnSpaces(playerCount);
      ceramics.push({ owner: id, stage: "loaded", shape: pickOf(SHAPES, rng), glaze: pickOf(GLAZES, rng), at: spaces[seat % spaces.length] as KilnSpaceId });
    }
    for (let n = 0; n < 2; n += 1) {
      ceramics.push({ owner: id, stage: "shaped", shape: pickOf(shapes, rng), decoration: pickOf(DECORATIONS, rng) });
    }
    for (let n = 0; n < 3; n += 1) {
      const drawn = pickOf(["standard", "standard", "fine", "masterpiece", "flawed"] as const, rng);
      // Protective Saggars' owner fires nothing Flawed (v1.6.2 L636): its Finished ceramics of
      // this round are Standard instead (the same draws, so the seed's other content is kept).
      const quality = drawn === "flawed" && seatTechs.includes("T11") ? "standard" : drawn;
      // Crackle comes only from the Ge Kiln (rev. 4 L463), which scores 1 VP per delivered
      // Crackle ceramic (L465); the draw is kept for every seat so the seeds stay stable.
      const crackle = quality === "fine" && rng.nextInt(3) === 0 && kilns[seat] === "GE";
      const shape = pickOf(SHAPES, rng);
      const decoration = pickOf(DECORATIONS, rng);
      const glaze = pickOf(GLAZES, rng);
      // Ru's owner holds one Ru-triggering ceramic (L460: Masterpiece, Celadon, Plain), so
      // random play reaches Ru (fuzz coverage asserts every Kiln ability fires).
      if (n === 0 && kilns[seat] === "RU") {
        ceramics.push({ owner: id, stage: "finished", shape, decoration: KILNS.RU.params.decoration, glaze: KILNS.RU.params.glaze, quality: KILNS.RU.params.quality });
        continue;
      }
      ceramics.push({ owner: id, stage: "finished", shape, decoration, glaze, quality, ...(crackle ? { crackle: true } : {}) });
    }
    const hand = [starting[seat * 2] as OrderId, starting[seat * 2 + 1] as OrderId, main[seat * 2] as OrderId, main[seat * 2 + 1] as OrderId];
    // Guan and Tribute Ware trigger on an Order showing a Crown: their owners hold two undealt
    // one-ceramic Crown Orders and a Finished ceramic that completes each, so random play
    // reaches them (fuzz coverage asserts every Tech and Kiln ability fires). Two, because
    // random play declines an optional ability (R4) about half the time and both are once per
    // round: a second completion gives the ability a second chance.
    if (kilns[seat] === "GU" || seatTechs.includes("T25")) {
      for (const handIndex of [2, 3]) {
        const crown = main.slice(playerCount * 2).find((orderId) => {
          const order = ORDERS[orderId];
          return order.crowns >= 1 && order.ceramics.length === 1 && order.relations === undefined && !crownOrders.has(orderId);
        });
        const slot = crown === undefined ? undefined : ORDERS[crown].ceramics[0];
        if (crown === undefined || slot === undefined) continue;
        crownOrders.add(crown);
        hand[handIndex] = crown;
        ceramics.push({
          owner: id,
          stage: "finished",
          shape: slot.shape ?? pickOf(slot.shapes ?? SHAPES, rng),
          decoration: slot.decoration ?? pickOf(DECORATIONS, rng),
          glaze: slot.glaze ?? pickOf(GLAZES, rng),
          quality: ORDERS[crown].minQuality === "masterpiece" ? "masterpiece" : "fine",
        });
      }
    }
    return {
      id,
      kilnId: kilns[seat] ?? null,
      techs: seatTechs,
      recognition: rng.nextInt(4) as 0 | 1 | 2 | 3,
      resources: { clay: 2 + rng.nextInt(5), wood: 2 + rng.nextInt(5), coins: 3 + rng.nextInt(6) },
      hand,
    };
  });
  const state = buildState({ gameId: `fuzz-rich-${seed}`, players: specs, ceramics, firstPlayerId: `p${1 + rng.nextInt(playerCount)}`, kilnDie: pickOf([1, 2, 3] as const, rng) });
  // Round 1 begins with the Start of Round already done; begin at the First Player's turn.
  return state;
}

function pickOf<T>(items: readonly T[], rng: SeededRandom): T {
  return items[rng.nextInt(items.length)] as T;
}

// ── The random game (DESIGN §8.3) ────────────────────────────────────────────────────

export interface FuzzOptions {
  /**
   * `new` (default): `createGame` and Kiln selection, as a real table. `rich`: a Round 1
   * state from `buildState` with random Kilns, a legal Tech in every discipline (from a
   * seed-rotated window, so consecutive seeds deal every Tech), Recognition 0–3, extra
   * resources, hands and some Shaped, Loaded and Finished ceramics, so deep
   * paths (every Tech, Imperial Kiln and Priority, Ru/Guan, Tribute Ware) run under every
   * check.
   */
  start?: "new" | "rich";
  seed: number;
  chooserSeed: number;
  playerCount: PlayerCount;
  /** Every Nth command: canonical `legalCommands` all validate (default 10; 0 = never). */
  legalityEvery?: number;
  /** Every Nth command: the §5.4 agreement property (default 10; 0 = never). */
  agreementEvery?: number;
  /** Every Nth command: apply every canonical command to a copy of the table and check the
   * live invariants after each (default 0 = never; slow, for bug hunting). */
  applyCanonicalEvery?: number;
  /** Chance per command of a key-sorted (`jsonb`) round trip first (default 0.1). */
  roundTripRate?: number;
  maxCommands?: number;
  /** Family weights for `sampleLegalAction` (default: DESIGN §5.3's uniform choice). */
  weights?: SampleOptions["weights"];
}

/**
 * A "directed" profile: prefer progress (completing Orders, loading, forming, Recognition) so
 * games reach deep states — Recognition 3–4, Imperial Priority, Ru/Guan, Tribute Ware —
 * that uniform sampling rarely visits.
 */
export const DIRECTED_WEIGHTS: NonNullable<SampleOptions["weights"]> = {
  COMPLETE_ORDER: 60,
  USE_COLOUR_SAMPLES_SWAP: 10,
  USE_IMPERIAL_PRIORITY: 40,
  PLACE_GLAZE_LOAD: 14,
  PLACE_FORM_DECORATE: 12,
  PLACE_MAGISTRATES_HALL: 8,
  PLACE_COMMISSION_MARKET: 6,
  PLACE_GUILD_HALL: 6,
  PLACE_MATERIALS_YARD: 6,
  END_ORDER_TURN: 1,
  END_TURN: 2,
  PLACE_CANAL_WHARF: 1,
};

export interface FuzzResult {
  table: FuzzTable;
  /** The state and RNG state the command log starts from (for `replayFrom`). */
  initial: GameState;
  initialRngState: number;
  commands: number;
  families: Map<string, number>;
  /** TECH_USED counts plus usage of the Techs without a per-round use (T10, T12, T19). */
  techUses: Map<TechId, number>;
  kilnUses: Map<string, number>;
  /** Decisions per phase type, and per Work step as `work_turn:<step kind>`. */
  phases: Map<string, number>;
  /** Commands with each optional load choice: `inverted_firing`, `kiln_furniture`, `rework`,
   * `kiln_master` (T24 at loading, R22), `pair`, `imperial`, and `crown_order` (the Magistrate's
   * Hall Shifu's optional Crown Order, R21). */
  loadFeatures: Map<string, number>;
}

function label(options: FuzzOptions): string {
  return `[seed ${options.seed}, chooserSeed ${options.chooserSeed}, ${options.playerCount}p]`;
}

function pickIndex(length: number, rng: SeededRandom): number {
  return length <= 1 ? 0 : rng.nextInt(length);
}

/** Plays one seeded random game to `finished`, checking every §8.3 property on the way. */
export function playFuzzGame(options: FuzzOptions): FuzzResult {
  const where = label(options);
  const chooser = new SeededRandom(options.chooserSeed);
  const table =
    options.start === "rich"
      ? FuzzTable.fromState(richStartState(options.seed, options.playerCount), options.seed)
      : FuzzTable.create(options.seed, options.playerCount);
  const initial = structuredClone(table.state);
  const initialRngState = table.rng.getState();
  try {
    assertInvariants(initial, { live: true });
  } catch (error) {
    throw new Error(`${where} start state: ${error instanceof Error ? error.message : String(error)}`);
  }
  const legalityEvery = options.legalityEvery ?? 10;
  const agreementEvery = options.agreementEvery ?? 10;
  const roundTripPercent = Math.round((options.roundTripRate ?? 0.1) * 100);
  const maxCommands = options.maxCommands ?? 2000;
  const families = new Map<string, number>();
  const techUses = new Map<TechId, number>();
  const kilnUses = new Map<string, number>();
  const phases = new Map<string, number>();
  const loadFeatures = new Map<string, number>();
  const count = <K>(map: Map<K, number>, key: K) => map.set(key, (map.get(key) ?? 0) + 1);

  const createdViolations = eventPrivacyViolations(table.state, table.state, table.events);
  if (createdViolations.length > 0) {
    throw new Error(`${where} setup events: ${createdViolations.join("; ")}`);
  }
  let commands = 0;
  while (table.state.phase.type !== "finished") {
    if (commands >= maxCommands) {
      throw new Error(`${where} did not finish within ${maxCommands} commands (phase ${table.state.phase.type})`);
    }
    // Storage round trip (DESIGN §7): a random 10% of commands start from a key-sorted state.
    if (chooser.nextInt(100) < roundTripPercent) {
      table.state = keySortedJsonRoundTrip(table.state);
      table.privateState = keySortedJsonRoundTrip(table.privateState);
    }
    const prompt = decisionPrompt(table.state);
    const actorId = prompt.actorIds[pickIndex(prompt.actorIds.length, chooser)];
    if (actorId === undefined) {
      throw new Error(`${where} ${table.state.phase.type} has no actor`);
    }
    const view = table.view(actorId);
    const context = `${where} command ${commands} (${table.state.phase.type})`;
    let command: AuthoritativeCommand;
    if (table.state.phase.type === "firing_contributions") {
      const options = legalCommands(view, { mode: "canonical" }) as SubmitContributionCommand[];
      const chosen = options[pickIndex(options.length, chooser)];
      if (chosen === undefined) {
        throw new Error(`${context}: no legal Contribution for ${actorId}`);
      }
      const error = validateContribution(view, table.privateState, chosen);
      if (error !== null) {
        throw new Error(`${context}: legalContributions offered an invalid Contribution: ${error.code}`);
      }
      command = chosen;
    } else {
      const sampled = sampleLegalAction(view, chooser, options.weights === undefined ? {} : { weights: options.weights });
      const error = validateAction(view, sampled);
      if (error !== null) {
        throw new Error(`${context}: sampled ${sampled.type} does not validate: ${error.code} ${error.message}`);
      }
      const familiesNow = legalActionFamilies(view);
      if (!familiesNow.includes(sampled.type)) {
        throw new Error(`${context}: sampled ${sampled.type} is not in legalActionFamilies ${familiesNow.join(",")}`);
      }
      const parsed = parseCommand(JSON.parse(JSON.stringify(sampled)));
      if (JSON.stringify(keySortedJsonRoundTrip(parsed)) !== JSON.stringify(keySortedJsonRoundTrip(sampled))) {
        throw new Error(`${context}: parseCommand changed ${sampled.type}: ${JSON.stringify(parsed)}`);
      }
      command = sampled;
    }
    if (legalityEvery > 0 && commands % legalityEvery === 0) {
      const all = legalCommands(view, { mode: "canonical" });
      if (all.length === 0) {
        throw new Error(`${context}: no canonical command for ${actorId} (§3.6)`);
      }
      for (const candidate of all) {
        const error =
          candidate.type === "SUBMIT_CONTRIBUTION" ? validateContribution(view, table.privateState, candidate) : validateAction(view, candidate);
        if (error !== null) {
          throw new Error(`${context}: canonical ${candidate.type} does not validate: ${error.code}`);
        }
      }
    }
    const applyEvery = options.applyCanonicalEvery ?? 0;
    if (applyEvery > 0 && commands % applyEvery === 0) {
      for (const candidate of legalCommands(view, { mode: "canonical" })) {
        const copy = FuzzTable.fromState(table.state, table.rng.getState());
        copy.privateState = structuredClone(table.privateState);
        try {
          copy.apply(actorId, candidate, context);
          assertInvariants(copy.state, { live: true });
        } catch (error) {
          throw new Error(`${context}: canonical ${JSON.stringify(candidate)} fails to resolve: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    if (agreementEvery > 0 && commands % agreementEvery === 0) {
      const violations = selectorAgreementViolations(table.state, table.privateState, actorId);
      if (violations.length > 0) {
        throw new Error(`${context}: selector agreement: ${violations.join("; ")}`);
      }
    }
    count(families, command.type);
    const phaseNow = table.state.phase;
    count(phases, phaseNow.type);
    if (phaseNow.type === "work_turn") {
      count(phases, `work_turn:${phaseNow.step.kind}`);
    }
    if (command.type === "PLACE_GLAZE_LOAD" || command.type === "USE_IMPERIAL_PRIORITY") {
      const loads = command.type === "PLACE_GLAZE_LOAD" ? command.loads : [];
      const features = {
        inverted_firing: loads.some((l) => l.destination.kiln === "shared" && l.destination.invertedFiring === true),
        kiln_furniture: loads.some((l) => l.destination.kiln === "shared" && l.destination.kilnFurniture !== undefined),
        rework: loads.some((l) => l.reworkShape !== undefined) || (command.type === "USE_IMPERIAL_PRIORITY" && command.reworkShape !== undefined),
        kiln_master: loads.some((l) => l.kilnMaster !== undefined) || (command.type === "USE_IMPERIAL_PRIORITY" && command.kilnMaster !== undefined),
        pair: loads.length === 2,
        imperial: loads.some((l) => l.destination.kiln === "imperial"),
      };
      for (const [feature, present] of Object.entries(features)) {
        if (present) {
          count(loadFeatures, feature);
        }
      }
    }
    if (command.type === "PLACE_MAGISTRATES_HALL" && command.crownOrder !== undefined) {
      count(loadFeatures, "crown_order");
    }
    const before = table.state;
    const events = table.apply(actorId, command, context);
    commands += 1;
    try {
      assertInvariants(table.state, { live: true });
    } catch (error) {
      throw new Error(`${context} after ${command.type}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const privacy = eventPrivacyViolations(before, table.state, events);
    if (privacy.length > 0) {
      throw new Error(`${context} after ${command.type}: ${privacy.join("; ")}`);
    }
    for (const event of events) {
      if (event.type === "TECH_USED") {
        count(techUses, event.techId);
      } else if (event.type === "KILN_ABILITY_USED") {
        count(kilnUses, event.kilnId);
      } else if (event.type === "PRIVATE_LOOK_OPENED" && event.kind === "colour_samples") {
        count(techUses, "T10");
      } else if (event.type === "CONTRIBUTIONS_REVEALED") {
        // Fuel Ledger used: one of its own 2 Contribution cards was played (change 26).
        for (const revealed of Object.values(event.contributions)) {
          if (revealed?.card === "FUEL_LEDGER_BANK" || revealed?.card === "FUEL_LEDGER_STOKE") {
            count(techUses, "T12");
          }
        }
      }
    }
  }
  const final = table.state;
  if (final.finalResult === null) {
    throw new Error(`${where} finished without a final result`);
  }
  for (const playerId of final.playerOrder) {
    if ((lookup(final.finalResult.scores, playerId)?.connoisseur ?? 0) > 0) {
      count(techUses, "T19");
    }
  }
  return { table, initial, initialRngState, commands, families, techUses, kilnUses, phases, loadFeatures };
}

/** End-of-game checks (DESIGN §8.3 "At the end"); returns violations. */
export function finalScoreViolations(state: GameState): string[] {
  const violations: string[] = [];
  const recorded = state.finalResult;
  if (recorded === null) {
    return ["no final result"];
  }
  if (stateHash(computeFinalResult(state)) !== stateHash(recorded)) {
    violations.push("computeFinalResult(state) differs from state.finalResult");
  }
  if (stateHash(computeFinalResult(projectPublicState(state))) !== stateHash(recorded)) {
    violations.push("the final score does not recompute from public data");
  }
  for (const playerId of state.playerOrder) {
    const score = lookup(recorded.scores, playerId);
    if (score === undefined) {
      violations.push(`no score for ${playerId}`);
      continue;
    }
    const sum =
      score.orders + score.kilnAbilities + score.recognitionOverflow + score.imperialAudience + score.exhibition.total + score.connoisseur + score.coins;
    if (sum !== score.total) {
      violations.push(`${playerId}'s total ${score.total} is not the sum of its parts ${sum}`);
    }
    // v1.6.2 change 27: no Tech VP, neither in the ledger nor at game end.
    if (Object.hasOwn(score, "techs") || Object.hasOwn(lookup(state.players, playerId)?.score ?? {}, "techs")) {
      violations.push(`${playerId}'s score carries a Tech VP line`);
    }
    const exhibition = score.exhibition;
    if (exhibition.qualityVp + exhibition.shapesBonus + exhibition.glazesBonus !== exhibition.total) {
      violations.push(`${playerId}'s Exhibition total is not the sum of its parts`);
    }
  }
  return violations;
}

/** Replays a command log from a start state and RNG state; `roundTrip` passes the state
 * through the key-sorted (`jsonb`) round trip before every command. Returns the per-revision
 * state hashes, RNG states and event hashes. */
export function replayFrom(
  initial: GameState,
  rngState: number,
  log: readonly CommandRecord[],
  roundTrip: boolean,
): { state: GameState; hashes: string[]; rngStates: number[]; events: string[] } {
  const table = FuzzTable.fromState(initial, rngState);
  const hashes = [stateHash(table.state)];
  const rngStates = [table.rng.getState()];
  const events = [stateHash(table.events)];
  for (const [index, record] of log.entries()) {
    if (roundTrip) {
      table.state = keySortedJsonRoundTrip(table.state);
      table.privateState = keySortedJsonRoundTrip(table.privateState);
    }
    const produced = table.apply(record.actorId, record.command, `replay command ${index}`);
    hashes.push(stateHash(table.state));
    rngStates.push(table.rng.getState());
    events.push(stateHash(produced));
  }
  return { state: table.state, hashes, rngStates, events };
}

// ── Selector–validator agreement (DESIGN §5.4) ───────────────────────────────────────

/** Codes that only say "not now / not this worker / not here"; a selector may still list the
 * option while the placement itself is blocked. */
const PLACEMENT_LEVEL: ReadonlySet<GameRuleErrorCode> = new Set<GameRuleErrorCode>([
  "WRONG_PHASE",
  "NOT_YOUR_DECISION",
  "WORKER_ACTION_ALREADY_TAKEN",
  "WORKER_UNAVAILABLE",
  "LOCATION_FULL",
  "PERSONAL_SPACE_LOCKED",
  "PERSONAL_SPACE_USED",
  "NO_MAIN_ACTION_POSSIBLE",
]);

function codeOf(view: ActorView, action: GameAction): GameRuleErrorCode | null {
  return validateAction(view, action)?.code ?? null;
}

/**
 * Every place where a §5.4 selector disagrees with the validators for `actorId` in this state:
 * a listed option or `legal` flag the validator rejects, or an option the validator accepts
 * that the selector omits. Empty when they agree.
 */
export function selectorAgreementViolations(state: GameState, privateState: PrivateFiringState | null, actorId: PlayerId): string[] {
  const out: string[] = [];
  const view = actorViewOf(state, actorId, privateState);
  const game = view.game;
  const phase = game.phase;
  const acts = decisionPrompt(game).actorIds.includes(actorId);
  const expect = (condition: boolean, message: string) => {
    if (!condition) {
      out.push(message);
    }
  };

  // Placement options: legal ⇔ some canonical command for that worker exists.
  const canonical = legalActions(view, { mode: "canonical", perFamilyLimit: 3 });
  for (const option of placementOptions(view)) {
    for (const worker of option.workers) {
      const witness = canonical.some(
        (action) =>
          action.type.startsWith("PLACE_") &&
          "workerId" in action &&
          action.workerId === worker.workerId &&
          LOCATION_FOR[action.type] === option.locationId &&
          ((action as { seniorApprentice?: boolean }).seniorApprentice === true) === worker.seniorApprentice,
      );
      expect(witness === worker.legal, `placementOptions ${option.locationId}/${worker.workerId}${worker.seniorApprentice ? "+senior" : ""} legal=${worker.legal} but witness=${witness}`);
      if (!worker.legal) {
        expect(worker.reason !== null, `placementOptions ${option.locationId}/${worker.workerId} is illegal without a reason`);
      }
    }
    expect(option.legal === option.workers.some((w) => w.legal), `placementOptions ${option.locationId}.legal disagrees with its workers`);
  }

  // Setup (step 9, rev. 4 L122, R23) and Start of Round.
  if (phase.type === "setup_kiln_selection" && acts) {
    const setup = setupChoiceOptions(view);
    expect(setup !== null, "setupChoiceOptions is null for the player choosing");
    const firstSlot = setup?.faceUpSlots[0];
    const firstOrder = firstSlot === undefined ? null : game.market.display[firstSlot];
    for (const option of kilnSelectionOptions(view)) {
      const ok =
        firstSlot !== undefined &&
        firstOrder !== null &&
        firstOrder !== undefined &&
        codeOf(view, { type: "SELECT_KILN", kilnId: option.kilnId, mainOrder: { slotIndex: firstSlot, orderId: firstOrder } }) === null;
      expect(ok === option.available, `kilnSelectionOptions ${option.kilnId} available=${option.available} but validator ok=${ok}`);
    }
    const kilnId = kilnSelectionOptions(view).find((option) => option.available)?.kilnId;
    game.market.display.forEach((orderId, slotIndex) => {
      if (orderId === null || kilnId === undefined) return;
      const ok = codeOf(view, { type: "SELECT_KILN", kilnId, mainOrder: { slotIndex, orderId } }) === null;
      expect(ok === (setup?.faceUpSlots.includes(slotIndex) ?? false), `setupChoiceOptions slot ${slotIndex} listed=${setup?.faceUpSlots.includes(slotIndex)} ok=${ok}`);
    });
  }
  if (phase.type === "round_start_setters_mark") {
    const listed = settersMarkOptions(view);
    for (const spaceId of KILN_SPACE_IDS) {
      const ok = codeOf(view, { type: "PLACE_SETTERS_MARK", spaceId }) === null;
      expect(ok === listed.includes(spaceId), `settersMarkOptions ${spaceId} listed=${listed.includes(spaceId)} but validator ok=${ok}`);
    }
  }

  // Work Phase.
  if (phase.type === "work_turn" && phase.activePlayerId === actorId) {
    const step = phase.step;
    const options = placementOptions(view);
    const legalWorker = (locationId: string, effect: string, senior = false) =>
      options.find((o) => o.locationId === locationId)?.workers.find((w) => w.legal && w.effect === effect && w.seniorApprentice === senior);
    if (step.kind === "before_action") {
      // Commission Market at placement, per worker: `reservable` is the main-action test.
      for (const worker of options.find((o) => o.locationId === "commission_market")?.workers ?? []) {
        const listed = commissionOptions(view, worker.effect);
        const senior = worker.seniorApprentice ? { seniorApprentice: true as const } : {};
        const code = codeOf(view, { type: "PLACE_COMMISSION_MARKET", workerId: worker.workerId, ...senior });
        if (code === null) {
          expect(listed.reservable, `commissionOptions(${worker.effect}) is not reservable but the placement validates`);
        } else if (code === "NO_MAIN_ACTION_POSSIBLE") {
          expect(!listed.reservable, `commissionOptions(${worker.effect}) is reservable but the validator says ${code}`);
        }
        const showing = game.market.display.flatMap((orderId, slotIndex) => (orderId === null ? [] : [slotIndex]));
        expect(JSON.stringify(listed.faceUpSlots) === JSON.stringify(showing), `commissionOptions face-up slots ${JSON.stringify(listed.faceUpSlots)}`);
        expect(listed.lookCount >= 0 && listed.lookCount <= listed.n, `commissionOptions lookCount ${listed.lookCount} outside the Select`);
      }
      // Guild Hall at placement.
      const apprentice = legalWorker("guild_hall", "apprentice");
      if (apprentice !== undefined) {
        for (const option of guildOptions(view, "apprentice").faceUp) {
          const ok = codeOf(view, { type: "PLACE_GUILD_HALL", workerId: apprentice.workerId, choice: { kind: "buy_face_up", techId: option.techId } }) === null;
          expect(ok === option.legal, `guildOptions ${option.techId} legal=${option.legal} but ok=${ok}`);
        }
      }
      const shifuGuild = legalWorker("guild_hall", "shifu");
      if (shifuGuild !== undefined) {
        for (const option of guildOptions(view, "shifu").inspect) {
          const ok = codeOf(view, { type: "PLACE_GUILD_HALL", workerId: shifuGuild.workerId, choice: { kind: "inspect", discipline: option.discipline } }) === null;
          expect(ok, `guildOptions inspect ${option.discipline} is rejected`);
        }
      }
      // Magistrate's Hall quotes, and the Shifu's optional Crown Order (rev. 4 L241, R21).
      for (const worker of options.find((o) => o.locationId === "magistrates_hall")?.workers ?? []) {
        const quote = magistratesHallQuote(view, worker.effect);
        const error = validateAction(view, { type: "PLACE_MAGISTRATES_HALL", workerId: worker.workerId });
        if (error === null) {
          expect(quote.ok, `magistratesHallQuote(${worker.effect}) is not ok but the placement validates`);
          game.market.display.forEach((orderId, slotIndex) => {
            if (orderId === null) return;
            const ok = codeOf(view, { type: "PLACE_MAGISTRATES_HALL", workerId: worker.workerId, crownOrder: { slotIndex, orderId } }) === null;
            expect(ok === quote.crownOrderSlots.includes(slotIndex), `magistratesHallQuote(${worker.effect}).crownOrderSlots ${slotIndex} listed=${quote.crownOrderSlots.includes(slotIndex)} ok=${ok}`);
          });
        } else if (!PLACEMENT_LEVEL.has(error.code)) {
          expect(!quote.ok && quote.error?.code === error.code, `magistratesHallQuote(${worker.effect}) ${quote.error?.code ?? "ok"} vs validator ${error.code}`);
        }
      }
      // Quotes agree with validation for every enumerated Materials Yard / Form & Decorate command.
      for (const action of canonical) {
        if (action.type === "PLACE_MATERIALS_YARD") {
          expect(quoteMaterialsYard(view, action).ok, `quoteMaterialsYard rejects a legal command ${JSON.stringify(action)}`);
        }
        if (action.type === "PLACE_FORM_DECORATE") {
          expect(quoteFormDecorate(view, action).ok, `quoteFormDecorate rejects a legal command ${JSON.stringify(action)}`);
          for (const index of dingCopyableVesselIndexes(view, action)) {
            const error = validateAction(view, { ...action, dingExtra: { copyOfVesselIndex: index, decoration: "plain" } });
            expect(error === null || error.code === "INSUFFICIENT_RESOURCES", `dingCopyableVesselIndexes lists ${index}, validator says ${error?.code}`);
          }
        }
      }
      // Glaze & Load: destinations (a Shared one only with the action's 1 Wood, R24), Kiln
      // Master's marker (R22) and the fuel quote.
      const loader = legalWorker("glaze_load", "shifu") ?? legalWorker("glaze_load", "apprentice");
      if (loader !== undefined) {
        for (const vessel of ceramicsOf(game, actorId, "shaped")) {
          const listed = loadDestinationOptions(view, actorId, vessel.id, []);
          const keys = new Set(listed.map((o) => JSON.stringify(o.destination)));
          for (const destination of allDestinations()) {
            const action: GameAction = { type: "PLACE_GLAZE_LOAD", workerId: loader.workerId, loads: [{ ceramicId: vessel.id, glaze: "celadon", destination }] };
            const ok = codeOf(view, action) === null;
            expect(ok === keys.has(JSON.stringify(destination)), `loadDestinationOptions(${vessel.id}) ${JSON.stringify(destination)} listed=${keys.has(JSON.stringify(destination))} ok=${ok}`);
          }
          const firstDestination = listed[0]?.destination;
          if (firstDestination !== undefined) {
            const kilnMaster = kilnMasterOption(view, actorId);
            for (const value of [1, -1] as const) {
              const loads = [{ ceramicId: vessel.id, glaze: "white" as const, destination: firstDestination, kilnMaster: value }];
              const ok = codeOf(view, { type: "PLACE_GLAZE_LOAD", workerId: loader.workerId, loads }) === null;
              expect(ok === (kilnMaster?.ready ?? false), `kilnMasterOption ready=${kilnMaster?.ready ?? "none"} but a load with ${value} ok=${ok}`);
            }
            const plain = { type: "PLACE_GLAZE_LOAD" as const, workerId: loader.workerId, loads: [{ ceramicId: vessel.id, glaze: "white" as const, destination: firstDestination }] };
            const quote = quoteGlazeLoad(view, plain);
            expect(quote.ok, `quoteGlazeLoad rejects a listed destination: ${quote.error?.code ?? ""}`);
            expect(quote.pay.wood === (firstDestination.kiln === "shared" ? 1 : 0), `quoteGlazeLoad charges ${quote.pay.wood} Wood for a ${firstDestination.kiln} load`);
          }
        }
      }
    }
    const looked = lookedOrderOptions(view);
    if (step.kind === "commission_market" || step.kind === "colour_samples" || step.kind === "colour_samples_swap") {
      // Every Select (v1.6.2 L64): every display position and looked card; a single pick
      // validates iff it is listed.
      expect(looked?.kind === step.kind, "lookedOrderOptions is not the open Select during its step");
      expect(looked?.maxReservations === step.select.maxReservations && looked.n === step.select.n, "lookedOrderOptions disagrees with the step's Select");
      const picks: SelectPick[] = [];
      game.market.display.forEach((orderId, slotIndex) => {
        if (orderId === null) {
          return;
        }
        const pick: SelectPick = { kind: "face_up", slotIndex, orderId };
        const ok = codeOf(view, { type: "SELECT_CHOOSE", reservations: [pick] }) === null;
        expect(ok === (looked?.faceUpSlots ?? []).includes(slotIndex), `lookedOrderOptions slot ${slotIndex} disagrees (ok=${ok})`);
        if (ok) picks.push(pick);
      });
      for (const orderId of looked?.orderIds ?? []) {
        const pick: SelectPick = { kind: "looked", orderId };
        const ok = codeOf(view, { type: "SELECT_CHOOSE", reservations: [pick] }) === null;
        expect(ok, `lookedOrderOptions lists ${orderId} but it is rejected`);
        picks.push(pick);
      }
      expect(picks.length > 0, `the ${step.kind} Select offers no reservation`);
      const [first, second] = picks;
      if (first !== undefined && second !== undefined) {
        const pair = codeOf(view, { type: "SELECT_CHOOSE", reservations: [first, second] });
        expect(pair === (step.select.maxReservations === 2 ? null : "RESERVATION_LIMIT"), `a pair of listed picks gave ${String(pair)}`);
      }
    }
    if (step.kind === "guild_inspection") {
      const inspection = guildInspectionOptions(view);
      expect(inspection !== null, "guildInspectionOptions is null during the inspection");
      if (inspection !== null) {
        const inspected = inspection.inspected.map((o) => o.techId);
        for (const option of inspection.inspected) {
          const code = codeOf(view, { type: "GUILD_TAKE", take: { kind: "inspected", techId: option.techId } });
          expect((code === null) === option.legal && (code === null || code === option.reason), `guildInspectionOptions inspected ${option.techId} legal=${option.legal} (${String(option.reason)}) code=${String(code)}`);
        }
        for (const option of inspection.faceUp) {
          const code = codeOf(view, { type: "GUILD_TAKE", take: { kind: "face_up", techId: option.techId } });
          expect((code === null) === option.legal && (code === null || code === option.reason), `guildInspectionOptions faceUp ${option.techId} legal=${option.legal} (${String(option.reason)}) code=${String(code)}`);
        }
        // GUILD_FINISH: legal with every untaken inspected Tech exactly once, after at least 1 take (v1.6.2 L207, L142, B2).
        expect(inspection.bottomOrderLength === inspected.length, "guildInspectionOptions bottom-order length disagrees");
        const finish = codeOf(view, { type: "GUILD_FINISH", bottomOrder: [...inspected].reverse() });
        expect(finish === (inspection.canFinish ? null : "TECH_TAKE_REQUIRED"), `GUILD_FINISH gave ${String(finish)} with canFinish=${inspection.canFinish}`);
        expect(inspection.canFinish === inspection.takes.length > 0, "guildInspectionOptions canFinish disagrees with its takes");
        // Placement legality (v1.6.2 L212) guarantees a first take; the step never waits with nothing to decide.
        expect(inspection.canFinish || [...inspection.inspected, ...inspection.faceUp].some((o) => o.legal), "the Guild inspection offers no first take");
      }
    }
  }

  // The Colour Samples swap and Imperial Priority, in every phase and for every viewer: each
  // option's verdict must be the validator's, and the options must cover what the enumerator
  // offers (v1.6.2 L625).
  const swap = colourSamplesSwapOptions(view);
  for (const discard of swap.discards) {
    const ok = codeOf(view, { type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: discard.orderId }) === null;
    expect(ok === discard.legal, `colourSamplesSwapOptions ${discard.orderId} legal=${discard.legal} ok=${ok} (${phase.type})`);
  }
  if (!swap.usable) {
    for (const orderId of view.own.orderHand) {
      expect(codeOf(view, { type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: orderId }) !== null, `the swap with ${orderId} validates while colourSamplesSwapOptions is not usable`);
    }
  }
  const swaps = canonical.filter((a) => a.type === "USE_COLOUR_SAMPLES_SWAP").map((a) => (a as { discardOrderId: string }).discardOrderId);
  const listedSwaps = swap.discards.filter((d) => d.legal).map((d) => d.orderId);
  expect(swaps.every((orderId) => listedSwaps.includes(orderId as never)), `colourSamplesSwapOptions omits ${swaps.join(",")}`);
  const priority = imperialPriorityOptions(view);
  const anyPriority = ceramicsOf(game, actorId, "shaped").some(
    (c) => codeOf(view, { type: "USE_IMPERIAL_PRIORITY", ceramicId: c.id, glaze: "white", imperialModifier: 0 }) === null,
  );
  expect(priority.usable === anyPriority, `imperialPriorityOptions.usable=${priority.usable} but ok=${anyPriority} (${phase.type})`);
  for (const ceramicId of priority.ceramicIds) {
    expect(codeOf(view, { type: "USE_IMPERIAL_PRIORITY", ceramicId, glaze: "moon_white", imperialModifier: 1 }) === null, `imperialPriorityOptions lists ${ceramicId} but it is rejected`);
    const ok = codeOf(view, { type: "USE_IMPERIAL_PRIORITY", ceramicId, glaze: "moon_white", imperialModifier: 1, kilnMaster: -1 }) === null;
    expect(ok === priority.kilnMaster, `imperialPriorityOptions.kilnMaster=${priority.kilnMaster} but Kiln Master on ${ceramicId} ok=${ok}`);
  }

  // Orders.
  if (phase.type === "orders" && acts) {
    const listed = completableOrders(view);
    for (const option of listed) {
      for (const match of orderMatchOptions(view, option.orderId, 6)) {
        const ok = codeOf(view, { type: "COMPLETE_ORDER", orderId: match.orderId, ceramicIds: match.ceramicIds, crackleDeclarations: match.crackleDeclarations }) === null;
        expect(ok, `orderMatchOptions ${match.orderId} [${match.ceramicIds.join(",")}] is rejected`);
      }
    }
    for (const orderId of view.own.orderHand) {
      const order = lookup(ORDERS, orderId);
      const anyMatch = order !== undefined && orderMatchOptions(view, orderId, 1).length > 0;
      expect(anyMatch === listed.some((o) => o.orderId === orderId), `completableOrders and orderMatchOptions disagree on ${orderId}`);
    }
  }

  // Firing.
  if (phase.type === "firing_contributions") {
    const options = contributionOptions(view);
    const legal = legalContributions(view);
    for (const option of options) {
      const ok = privateState !== null && validateContribution(view, privateState, option.command) === null;
      expect(ok === option.affordable, `contributionOptions ${option.command.card} affordable=${option.affordable} ok=${ok}`);
    }
    expect(legal.every((c) => options.some((o) => o.command.card === c.card)), "contributionOptions omits a legal Contribution");
    // One option per card the viewer holds (v1.6.2 change 26), and only those.
    const held = phase.eligiblePlayerIds.includes(actorId) ? (game.players[actorId]?.contributionCards ?? []) : [];
    expect(options.length === held.length && options.every((o) => held.includes(o.command.card)), "contributionOptions are not exactly the viewer's cards");
  }
  if (phase.type === "firing_test_pieces" && acts) {
    const options = testPiecesOptions(view);
    if (options !== null && options.awaiting === "decision") {
      const ok = codeOf(view, { type: "TEST_PIECES_DECIDE", peek: true }) === null;
      expect(ok === options.canPeek, `testPiecesOptions.canPeek=${options.canPeek} ok=${ok}`);
    }
  }
  if (phase.type === "firing_heat_adjustment" && acts) {
    const options = junOptions(view);
    const firingIds = Object.keys(game.firing?.ceramics ?? {}).filter((id) => lookup(game.ceramics, id)?.ownerId === actorId);
    for (const ceramicId of firingIds) {
      const ok = codeOf(view, { type: "RESOLVE_JUN", adjustment: { ceramicId, delta: -1 } }) === null;
      expect(ok === (options?.ceramicIds.includes(ceramicId) ?? false), `junOptions ${ceramicId} ok=${ok}`);
    }
  }
  if (phase.type === "firing_after_quality" && acts) {
    const options = afterQualityOptions(view);
    const firingIds = Object.keys(game.firing?.ceramics ?? {}).filter((id) => lookup(game.ceramics, id)?.ownerId === actorId);
    const types = { protective_saggars: "USE_PROTECTIVE_SAGGARS", second_firing: "USE_SECOND_FIRING", ge_crackle: "USE_GE_CRACKLE" } as const;
    for (const [ability, type] of Object.entries(types) as Array<[keyof typeof types, (typeof types)[keyof typeof types]]>) {
      const listed = options.find((o) => o.ability === ability)?.ceramicIds ?? [];
      for (const ceramicId of firingIds) {
        const ok = codeOf(view, { type, ceramicId }) === null;
        expect(ok === listed.includes(ceramicId), `afterQualityOptions ${ability} ${ceramicId} listed=${listed.includes(ceramicId)} ok=${ok}`);
      }
    }
  }
  // R20: the sale of a Flawed ceramic, in every phase, for every ceramic of the viewer (and
  // one of another player's, which is never listed nor accepted).
  {
    const listed = sellFlawedOptions(view)?.ceramicIds ?? [];
    const candidates = Object.values(game.ceramics)
      .filter((c) => c.ownerId === actorId)
      .map((c) => c.id);
    const other = Object.values(game.ceramics).find((c) => c.ownerId !== actorId && c.stage === "finished" && c.quality === "flawed");
    if (other !== undefined) candidates.push(other.id);
    for (const ceramicId of candidates) {
      const ok = codeOf(view, { type: "SELL_FLAWED", ceramicId }) === null;
      expect(ok === listed.includes(ceramicId), `sellFlawedOptions ${ceramicId} listed=${listed.includes(ceramicId)} ok=${ok} in ${phase.type}`);
    }
  }
  return out;
}

const LOCATION_FOR: Partial<Record<string, string>> = {
  PLACE_MATERIALS_YARD: "materials_yard",
  PLACE_FORM_DECORATE: "form_decorate",
  PLACE_GLAZE_LOAD: "glaze_load",
  PLACE_COMMISSION_MARKET: "commission_market",
  PLACE_GUILD_HALL: "guild_hall",
  PLACE_CANAL_WHARF: "canal_wharf",
  PLACE_MAGISTRATES_HALL: "magistrates_hall",
};

/** Every well-formed load destination (the candidate list `loadDestinationOptions` filters). */
function allDestinations(): Array<LoadSpec["destination"]> {
  const destinations: Array<LoadSpec["destination"]> = [];
  for (const spaceId of KILN_SPACE_IDS) {
    destinations.push({ kiln: "shared", spaceId });
    destinations.push({ kiln: "shared", spaceId, invertedFiring: true });
    for (const kilnFurniture of [-1, 0, 1] as const) {
      destinations.push({ kiln: "shared", spaceId, kilnFurniture });
    }
  }
  for (const imperialModifier of [-1, 0, 1] as const) {
    destinations.push({ kiln: "imperial", imperialModifier });
  }
  return destinations;
}
