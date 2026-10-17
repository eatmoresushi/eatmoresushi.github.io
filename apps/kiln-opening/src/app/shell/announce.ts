/**
 * Live announcements (UI_V1.6.1_ARCHITECTURE §8.3). Owner: B1 (shell, log, lobby).
 * Source: wireframe `announcement`.
 *
 * Announcements are stored as `RichMessage`s and formatted when rendered, so a language switch
 * re-renders them (§6.1). `announcementFor` is pure; `LiveAnnouncer` coalesces its results into
 * one summary per revision gap, at least `ANNOUNCE_INTERVAL_MS` apart, "your turn" last.
 *
 * It announces:
 * - each `lastBatch` of any origin (`self`, `computers`, `remote`), summarised through the event
 *   templates (moves, reveals, Fire, each Quality, completions); a computer batch names who moved;
 * - someone else's private look ("Zhao is looking at 3 Orders");
 * - becoming an actor ("Your turn: place a worker. 3 workers left."), always last.
 *
 * `announcePolite` lets a control (the session menu's "copy room code", a `ReorderList` move)
 * speak through the same polite region, so there is only one (§8.3).
 */
import type { GameEventType, PlayerId, PublicGameEvent } from "../../game/index.ts";
import { publicEventText } from "../i18n/events.ts";
import { list } from "../i18n/format.ts";
import { msg } from "../i18n/translator.ts";
import type { RichMessage, Translator } from "../i18n/translator.ts";
import type { EventBatch, LogEntry } from "../session/gameSource.ts";
import { isActingWindow, windowDraftKey } from "../state/decisionWindow.ts";
import type { GameModel } from "../state/model.ts";
import { logCeramicView } from "./logCeramics.ts";

export const ANNOUNCE_INTERVAL_MS = 1_500;

/** At most this many event lines per announcement; the rest are counted ("and 4 more"). */
export const MAX_ANNOUNCED_LINES = 6;

export interface Announcement {
  /** Polite messages, in order; "your turn" last. */
  polite: readonly RichMessage[];
  /** An error or a ConnectionBanner alert. */
  alert: RichMessage | null;
}

/** The events worth saying aloud: moves, reveals, Fire, each Quality, completions. */
export const ANNOUNCED_EVENTS: ReadonlySet<GameEventType> = new Set<GameEventType>([
  "KILN_SELECTED",
  "ROUND_STARTED",
  "KILN_DIE_ROLLED",
  "SETTERS_MARK_PLACED",
  "WORKER_PLACED",
  "CERAMIC_FORMED",
  "CERAMIC_LOADED",
  "ORDER_RESERVED",
  "TECH_ACQUIRED",
  "IMPERIAL_PRIORITY_USED",
  "RECOGNITION_ADVANCED",
  "IMPERIAL_KILN_GAINED",
  "IMPERIAL_PRIORITY_GAINED",
  "IMPERIAL_AUDIENCE_GAINED",
  "FIRING_SKIPPED",
  "CONTRIBUTION_SUBMITTED",
  "CONTRIBUTIONS_REVEALED",
  "BASE_HEAT_DETERMINED",
  "TEST_PIECES_USED",
  "HEAT_MARKER_TURNED",
  "HEAT_MARKER_RETURNED",
  "KILN_MASTER_PLACED",
  "FIRE_REVEALED",
  "JUN_ADJUSTED",
  "QUALITY_ASSIGNED",
  "QUALITY_IMPROVED",
  "SECOND_FIRING_REVEALED",
  "SECOND_FIRING_CHOSEN",
  "CRACKLE_APPLIED",
  "CERAMIC_SALVAGED",
  "ORDER_COMPLETED",
  "HAND_TRIMMED",
  "FIRST_PLAYER_PASSED",
]);

function playerOf(event: PublicGameEvent): PlayerId | null {
  const value = (event as { playerId?: unknown }).playerId;
  return typeof value === "string" ? value : null;
}

/** "Your turn: …" for an acting window, or null. */
export function yourTurnMessage(model: GameModel): RichMessage | null {
  const window = model.window;
  if (!model.viewerActs || !isActingWindow(window)) return null;
  switch (window.kind) {
    case "work":
      return msg("shell.announce.turn.work", { n: model.me?.availableWorkerIds.length ?? 0 });
    case "hand_limit": {
      const status = model.viewerId === null ? undefined : model.handLimits[model.viewerId];
      return msg("shell.announce.turn.hand_limit", { n: status?.mustDiscard ?? 0, limit: status?.limit ?? 0 });
    }
    case "kiln_selection":
      return msg("shell.announce.turn.kiln_selection");
    case "setters_mark":
      return msg("shell.announce.turn.setters_mark");
    case "commission":
      return msg("shell.announce.turn.commission");
    case "guild_inspection":
      return msg("shell.announce.turn.guild_inspection");
    case "colour_samples":
      return msg("shell.announce.turn.colour_samples");
    case "colour_samples_swap":
      return msg("shell.announce.turn.colour_samples_swap");
    case "contributions":
      return msg("shell.announce.turn.contributions");
    case "test_pieces":
      return msg("shell.announce.turn.test_pieces");
    case "heat_markers":
      return msg("shell.announce.turn.heat_markers");
    case "jun":
      return msg("shell.announce.turn.jun");
    case "after_quality":
      return msg("shell.announce.turn.after_quality");
    case "second_firing":
      return msg("shell.announce.turn.second_firing");
    case "salvage":
      return msg("shell.announce.turn.salvage");
    case "orders":
      return msg("shell.announce.turn.orders");
  }
}

/** The game-over sentence, once. */
function finalMessage(model: GameModel): RichMessage | null {
  const result = model.finalResult;
  if (result === null) return null;
  const names = (t: Translator) => list(result.winnerIds.map((id) => model.players.find((p) => p.playerId === id)?.displayName ?? ""), t.locale);
  const first = result.winnerIds[0];
  const vp = first === undefined ? 0 : result.scores[first]?.total ?? 0;
  if (result.resolvedBy === "shared_victory") return msg("shell.announce.final.shared", { names, vp });
  return msg("shell.announce.final.winner", { names, vp });
}

/** Someone else's private look, when it newly opens (`counts.pendingLook` is public). */
function lookMessage(model: GameModel, previous: GameModel | null): RichMessage | null {
  const look = model.board.counts.pendingLook;
  if (look === null || look.playerId === model.viewerId) return null;
  const before = previous?.board.counts.pendingLook ?? null;
  if (before !== null && before.playerId === look.playerId && before.kind === look.kind) return null;
  const name = model.players.find((player) => player.playerId === look.playerId)?.displayName ?? "";
  if (look.kind === "guild_inspection") return msg("shell.announce.lookingTechs", { name, n: look.count });
  return msg("shell.announce.looking", { name, n: look.count });
}

/** One batch as lines, through the event templates (the most recent lines when there are many). */
function batchMessage(model: GameModel, batch: EventBatch, log: readonly LogEntry[]): RichMessage | null {
  const events = batch.events.filter((event) => ANNOUNCED_EVENTS.has(event.type));
  if (events.length === 0) return null;
  const view = logCeramicView(model, log);
  const shown = events.slice(-MAX_ANNOUNCED_LINES);
  const hidden = events.length - shown.length;
  const lines = (t: Translator): string => {
    const context = { t, view, viewerId: model.viewerId };
    const text = shown.map((event) => publicEventText(event, context));
    if (hidden > 0) text.unshift(t("shell.announce.more", { n: hidden }));
    return text.join(t("shell.sentenceSep"));
  };
  if (batch.origin !== "computers") return msg("shell.announce.lines", { lines });
  const movers = [...new Set(batch.events.map(playerOf).filter((id): id is PlayerId => id !== null && model.computerSeatIds.has(id)))];
  if (movers.length === 0) return msg("shell.announce.lines", { lines });
  const names = (t: Translator) => list(movers.map((id) => model.players.find((p) => p.playerId === id)?.displayName ?? ""), t.locale);
  return msg("shell.announce.computers", { names, lines });
}

/**
 * What to announce after a revision, or null for nothing. `batch` is the new batch to summarise
 * (null when there is none, or it was announced already); `previous` the model last announced;
 * `log` names ceramics in words (D9).
 */
export function announcementFor(
  model: GameModel,
  batch: EventBatch | null,
  previous: GameModel | null,
  log: readonly LogEntry[] = [],
): Announcement | null {
  const polite: RichMessage[] = [];
  const finalNow = model.finalResult !== null && previous?.finalResult == null;
  if (batch !== null) {
    const summary = batchMessage(model, batch, log);
    if (summary !== null) polite.push(summary);
  }
  const look = lookMessage(model, previous);
  if (look !== null) polite.push(look);
  if (finalNow) {
    const final = finalMessage(model);
    if (final !== null) polite.push(final);
  }
  const turnChanged =
    previous === null || !previous.viewerActs || windowDraftKey(previous.window) !== windowDraftKey(model.window);
  if (turnChanged) {
    const turn = yourTurnMessage(model);
    if (turn !== null) polite.push(turn);
  }
  return polite.length === 0 ? null : { polite, alert: null };
}

// ── The one polite region's side channel ──────────────────────────────────────────────────

/**
 * A side-channel message: a stored message (re-rendered on a language switch), or text a control
 * already formatted in the current language (kit `ReorderList`'s "moved to position 2").
 */
export type PoliteMessage = RichMessage | string;

type Listener = (message: PoliteMessage) => void;
const LISTENERS = new Set<Listener>();

/**
 * Says a message through the one polite region (§8.3), e.g. "Room code copied". A control with
 * its own announcement hook passes it here instead of adding a live region of its own:
 * `<ReorderList announce={announcePolite} … />`.
 */
export function announcePolite(message: PoliteMessage): void {
  for (const listener of [...LISTENERS]) listener(message);
}

/** `LiveAnnouncer` subscribes here. */
export function onPoliteAnnouncement(listener: Listener): () => void {
  LISTENERS.add(listener);
  return () => {
    LISTENERS.delete(listener);
  };
}
