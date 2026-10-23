/**
 * `GameModel` (UI_V1.6.1_ARCHITECTURE §3.3): the one read model every table, kiln, board and
 * shell component receives. Frozen after phase A; changes go through B6.
 *
 * - Built from engine selectors only; React never recomputes a rule.
 * - **Owner decisions D3/D4 by type (K6):** `TableBoardView` is assembled field by field from
 *   `boardView(view)` through an allow-list (`Pick`), never by spreading it, so neither the
 *   Fire-deck count nor a firing context (with its heat calculations) can reach a component.
 *   All firing display goes through `firingStage` and `firingRecap` (`firingStageView`,
 *   `firingRecapView`), which carry no heat ledger.
 * - **Memoised on the identity of `snapshot.view`** (a `WeakMap`), and on the seat list for
 *   `computerSeatIds`. Every store merge creates a new view object — a same-revision reconnect
 *   that replaces `own` included — so the hand, the private look and the sealed Contribution are
 *   never stale.
 *
 * `EngineView` (the raw `PlayerView` and `ActorView`) is for `decision/**`, `state/**` and
 * `dev/**` only (§2, `useEngineView`).
 */

import {
  asActorView,
  boardView,
  decisionPrompt,
  firingRecapView,
  firingStageView,
  handLimitStatus,
  kilnLayout,
  lookedOrderOptions,
  playerSummary,
  roundPhaseOf,
  viewerActs,
} from "../../game/index.ts";
import type {
  ActorView,
  BoardView,
  CeramicId,
  CeramicState,
  DecisionPrompt,
  FinalResult,
  FiringStageView,
  GamePhaseType,
  HandLimitStatus,
  KilnLayoutView,
  LookedOrderOptions,
  OrderId,
  PlayerId,
  PlayerSummary,
  PlayerView,
  PublicCounts,
  PublicGameState,
  RoundNumber,
  RoundPhaseId,
  TechDiscipline,
} from "../../game/index.ts";
import type { PublicSeat } from "../../multiplayer/types.ts";
import { decisionWindow } from "./decisionWindow.ts";
import type { DecisionWindow } from "./decisionWindow.ts";

/** The public counts a player at the table can see (D4: never the Fire deck's size). */
export type TableCounts = Pick<PublicCounts, "orderHands" | "mainDeck" | "mainDiscard" | "techDecks" | "pendingLook">;

/**
 * One discipline of the Tech display, with `returning`: how many Techs a Guild Hall Shifu's open
 * inspection of this discipline will put back on the bottom of its deck before the display refills
 * (v1.6.2 L208–209, B2; 0 otherwise). Public: the inspected discipline and the number inspected
 * and taken are on the table; which Techs they are is not. With it a taken Tech's empty position
 * shows as refilling at the end of the turn even while the inspection holds the deck's last cards.
 */
export type TableTechColumn = BoardView["techDisplay"][number] & { returning: number };

/** `BoardView` as the table shows it: no firing context and no Fire-deck count (K6, D3, D4). */
export type TableBoardView = Pick<
  BoardView,
  "round" | "prompt" | "firstPlayerId" | "turnOrder" | "kilnDie" | "centralLocations" | "kilnSpaces" | "mainDisplay" | "fireDiscard"
> & {
  techDisplay: readonly TableTechColumn[];
  counts: TableCounts;
  /**
   * Who owes the deferred Main display refill (`game.market.refillPendingFor`): a reserved
   * face-up position stays empty until that player's turn ends (L191, L391). Change request
   * CR B2-2.
   */
  refillPendingFor: PlayerId | null;
};

export interface GameModel {
  revision: number;
  viewerId: PlayerId | null;
  round: RoundNumber;
  phaseType: GamePhaseType;
  /** The round phase (gap 17), or `final` once the game is finished. */
  roundPhase: RoundPhaseId | "final";
  prompt: DecisionPrompt;
  viewerActs: boolean;
  board: TableBoardView;
  /** `playerSummary` per `board.turnOrder` (First Player, then clockwise). */
  players: readonly PlayerSummary[];
  me: PlayerSummary | null;
  /** The viewer's own Orders in hand (private; empty for a spectator). */
  hand: readonly OrderId[];
  /** The viewer's own private look only. */
  look: LookedOrderOptions | null;
  handLimits: Readonly<Record<PlayerId, HandLimitStatus>>;
  kilnLayout: KilnLayoutView;
  /** The firing in progress (gap 7). */
  firingStage: FiringStageView | null;
  /** The last finished firing (gap 18). */
  firingRecap: FiringStageView | null;
  finalResult: FinalResult | null;
  window: DecisionWindow;
  computerSeatIds: ReadonlySet<PlayerId>;
  /**
   * Every ceramic in the view (`view.game.ceramics`): Shaped, loaded, Finished and delivered.
   * Public information (AGENTS.md "Hidden information": every undelivered ceramic and its
   * recorded attributes are public). `CeramicState` carries no heat value, so D3 holds. With it
   * `GameModel` is a `CeramicLabelModelView`, so `ceramicLabel(id, model)` describes any ceramic
   * in words (D9). Change requests CR B1-1, CR B2-1, CR B3-1.
   */
  ceramics: Readonly<Record<CeramicId, CeramicState>>;
}

export interface EngineView {
  view: PlayerView;
  actor: ActorView | null;
}

/** The inspected Techs an open Guild Hall inspection will return to the bottom of a deck. */
export interface TechReturn {
  discipline: TechDiscipline;
  count: number;
}

/**
 * The open Guild Hall Shifu inspection's untaken Techs, from the public work step (the step's
 * discipline, the number inspected, the takes so far), also while Colour Samples' look sits
 * between the two takes (`resume`). Null when no inspection is open or nothing would return.
 */
export function techReturnOf(game: PublicGameState): TechReturn | null {
  if (game.phase.type !== "work_turn") return null;
  const step = game.phase.step;
  const inspection = step.kind === "guild_inspection" ? step : step.kind === "colour_samples" ? step.resume : null;
  if (inspection === null) return null;
  const count = inspection.inspectedCount - inspection.takes.filter((take) => take.kind === "inspected").length;
  return count > 0 ? { discipline: inspection.discipline, count } : null;
}

/**
 * Picks the table fields of `boardView` one by one (never a spread). `refillPendingFor` comes
 * from the public market state (`game.market.refillPendingFor`); `BoardView` has no market field.
 * `techReturn` (`techReturnOf`) adds each Tech column's `returning`.
 */
export function tableBoardView(board: BoardView, refillPendingFor: PlayerId | null = null, techReturn: TechReturn | null = null): TableBoardView {
  const counts = board.counts;
  return {
    round: board.round,
    prompt: board.prompt,
    firstPlayerId: board.firstPlayerId,
    turnOrder: board.turnOrder,
    kilnDie: board.kilnDie,
    centralLocations: board.centralLocations,
    kilnSpaces: board.kilnSpaces,
    mainDisplay: board.mainDisplay,
    techDisplay: board.techDisplay.map((column) => ({ ...column, returning: techReturn !== null && techReturn.discipline === column.discipline ? techReturn.count : 0 })),
    fireDiscard: board.fireDiscard,
    refillPendingFor,
    counts: {
      orderHands: counts.orderHands,
      mainDeck: counts.mainDeck,
      mainDiscard: counts.mainDiscard,
      techDecks: counts.techDecks,
      pendingLook: counts.pendingLook,
    },
  };
}

function computerIds(seats: readonly PublicSeat[]): ReadonlySet<PlayerId> {
  return new Set(seats.filter((seat) => seat.isComputer).map((seat) => seat.playerId));
}

/** Builds the model for one view. Pure; prefer `gameModelOf`, which memoises. */
export function buildGameModel(view: PlayerView, seats: readonly PublicSeat[]): GameModel {
  const game = view.game;
  const board = boardView(view);
  const players = board.turnOrder.map((playerId) => playerSummary(view, playerId));
  const viewerId = view.viewerId;
  const me = viewerId === null ? null : players.find((summary) => summary.playerId === viewerId) ?? null;
  const handLimits: Record<PlayerId, HandLimitStatus> = {};
  for (const summary of players) handLimits[summary.playerId] = handLimitStatus(view, summary.playerId);
  return {
    revision: game.revision,
    viewerId,
    round: game.round,
    phaseType: game.phase.type,
    roundPhase: roundPhaseOf(game.phase.type),
    prompt: decisionPrompt(game),
    viewerActs: viewerActs(view),
    board: tableBoardView(board, game.market.refillPendingFor, techReturnOf(game)),
    players,
    me,
    hand: view.own === null ? [] : [...view.own.orderHand],
    look: lookedOrderOptions(view),
    handLimits,
    kilnLayout: kilnLayout(view),
    firingStage: firingStageView(view),
    firingRecap: firingRecapView(view),
    finalResult: game.finalResult,
    window: decisionWindow(view),
    computerSeatIds: computerIds(seats),
    ceramics: game.ceramics,
  };
}

const MODELS = new WeakMap<PlayerView, { seats: readonly PublicSeat[]; model: GameModel }>();
const ENGINE_VIEWS = new WeakMap<PlayerView, EngineView>();

/** The model for a view, memoised on the view's identity (and the seat list). */
export function gameModelOf(view: PlayerView, seats: readonly PublicSeat[]): GameModel {
  const cached = MODELS.get(view);
  if (cached !== undefined && cached.seats === seats) return cached.model;
  if (cached !== undefined && sameComputers(cached.seats, seats)) {
    MODELS.set(view, { seats, model: cached.model });
    return cached.model;
  }
  const model = buildGameModel(view, seats);
  MODELS.set(view, { seats, model });
  return model;
}

function sameComputers(a: readonly PublicSeat[], b: readonly PublicSeat[]): boolean {
  const left = computerIds(a);
  const right = computerIds(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
}

/** `{ view, actor }`, memoised on the view's identity. */
export function engineViewOf(view: PlayerView): EngineView {
  let cached = ENGINE_VIEWS.get(view);
  if (cached === undefined) {
    cached = { view, actor: asActorView(view) };
    ENGINE_VIEWS.set(view, cached);
  }
  return cached;
}
