/**
 * Privacy checks for the UI fixtures (UI_V1.6.1_ARCHITECTURE.md §9.1), extracted from the
 * wireframe fixture generator (`tools/uiFixtures.ts`) so the test fixtures, the secrets oracle
 * and the local backend's `e2e_secret_ids` share one definition of "what this viewer may not
 * see".
 *
 * A fixture entry holds only what one viewer's client may hold:
 * - `playerView`: the public projection plus the viewer's own private view;
 * - `recentPublicEvents`: projected events (no `secret` payloads);
 * - `ownSecrets`: the viewer's own full events. A `secret` key is allowed **only** at
 *   `ownSecrets[i].event.secret`, and only when its `visibleTo` is the viewer; at capture time
 *   each own secret must equal the authoritative event with the same sequence.
 *
 * The secret IDs of a viewer are the Order and Tech IDs it must never see: other seats' hands,
 * other seats' private looks, the Main deck and its face-down discard, the Starting box and the
 * Tech decks — minus IDs a public event revealed (a face-up Order later reserved, the Orders
 * rotated off the display) and minus IDs the viewer was shown privately (its own looks, its own
 * trimmed or discarded Orders, its own returned Techs).
 *
 * Node-only tool code: never imported by `src/app`.
 */

import { DISCIPLINES, projectEvent } from "../src/game/index.ts";
import type { GameEvent, GameState, PlayerId, PlayerView, PrivateFiringState, PublicGameEvent } from "../src/game/index.ts";

/** One logged event as the multiplayer store records it (`PublicEventRecord` without room IDs). */
export interface FixtureEventRecord<E> {
  sequence: number;
  revision: number;
  actorId: PlayerId;
  event: E;
}

/** The privacy-relevant part of a fixture entry (scenario or moment). */
export interface PrivacyCheckedEntry {
  id: string;
  viewerId: PlayerId;
  playerView: PlayerView;
  recentPublicEvents: ReadonlyArray<FixtureEventRecord<PublicGameEvent>>;
  ownSecrets: ReadonlyArray<FixtureEventRecord<GameEvent>>;
}

export type PathKey = string | number;

/** Walks every value with its path from the root (`["ownSecrets", 0, "event", "secret"]`). */
export function walk(value: unknown, visit: (path: readonly PathKey[], value: unknown) => void, path: PathKey[] = []): void {
  visit(path, value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, [...path, index]));
  } else if (value !== null && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) walk(inner, visit, [...path, key]);
  }
}

function stringsIn(value: unknown, into: Set<string>): Set<string> {
  walk(value, (_path, v) => {
    if (typeof v === "string") into.add(v);
  });
  return into;
}

/** Every string any public event has carried: public knowledge for every seat. */
export function publiclyRevealed(events: readonly GameEvent[]): Set<string> {
  const seen = new Set<string>();
  for (const event of events) stringsIn(projectEvent(event), seen);
  return seen;
}

/** Every string in the viewer's own secret payloads: what it was shown privately. */
export function privatelyKnown(events: readonly GameEvent[], viewerId: PlayerId): Set<string> {
  const seen = new Set<string>();
  for (const event of events) {
    const secret = (event as { secret?: { visibleTo: PlayerId } }).secret;
    if (secret !== undefined && secret.visibleTo === viewerId) stringsIn(secret, seen);
  }
  return seen;
}

/**
 * The Order and Tech IDs `viewerId` must never see in this state, each with where it sits.
 * `events` is the full authoritative log of the game (or scenario) so far.
 */
export function foreignSecretIds(state: GameState, viewerId: PlayerId, events: readonly GameEvent[]): Map<string, string> {
  const forbidden = new Map<string, string>();
  const hidden = state.hidden;
  for (const pid of state.playerOrder) {
    if (pid === viewerId) continue;
    for (const id of hidden.orderHands[pid] ?? []) forbidden.set(id, `${pid}'s hand`);
  }
  for (const id of hidden.mainDeck) forbidden.set(id, "Main deck");
  for (const id of hidden.mainDiscard) forbidden.set(id, "Main discard");
  for (const id of hidden.startingBox) forbidden.set(id, "Starting box");
  for (const discipline of DISCIPLINES) {
    for (const id of hidden.techDecks[discipline]) forbidden.set(id, `${discipline} Tech deck`);
  }
  const look = hidden.pendingLook;
  if (look !== null) {
    const ids = look.kind === "guild_inspection" ? look.techIds : look.orderIds;
    for (const id of ids) {
      if (look.playerId === viewerId) forbidden.delete(id);
      else forbidden.set(id, `${look.playerId}'s private look`);
    }
  }
  for (const id of publiclyRevealed(events)) forbidden.delete(id);
  for (const id of privatelyKnown(events, viewerId)) forbidden.delete(id);
  return forbidden;
}

/** The secrets oracle entry: sorted IDs (`secrets.json`). */
export function secretIdsFor(state: GameState, viewerId: PlayerId, events: readonly GameEvent[]): string[] {
  return [...foreignSecretIds(state, viewerId, events).keys()].sort();
}

/** True for the one place a `secret` key may appear: `ownSecrets[i].event.secret`. */
function isOwnSecretPath(path: readonly PathKey[]): boolean {
  return path.length === 4 && path[0] === "ownSecrets" && typeof path[1] === "number" && path[2] === "event" && path[3] === "secret";
}

/**
 * Structural problems any reader can find without the authoritative state: `own` is the
 * viewer's; any look, peek or sealed Contribution is the viewer's; no server-only key or pile;
 * other hands only as counts; `secret` only under `ownSecrets[i].event` and visible to the
 * viewer; own secrets are full events of the viewer's own.
 */
export function entryStructureProblems(entry: PrivacyCheckedEntry): string[] {
  const problems: string[] = [];
  const viewer = entry.viewerId;
  const own = entry.playerView.own;
  if (entry.playerView.viewerId !== viewer) problems.push("playerView.viewerId differs from viewerId");
  if (own === null || own.playerId !== viewer) problems.push("own view missing or not the viewer's");
  if (own?.pendingLook && own.pendingLook.playerId !== viewer) problems.push("a pending look of another seat");
  if (own?.firePeek && own.firePeek.playerId !== viewer) problems.push("a fire peek of another seat");
  for (const [pid, count] of Object.entries(entry.playerView.game.counts.orderHands)) {
    if (typeof count !== "number") problems.push(`${pid}'s hand is not a count`);
  }
  walk(entry, (path, value) => {
    const key = path[path.length - 1];
    if (key === "hidden") problems.push(`server-only key "hidden" at ${path.join(".")}`);
    if (key === "secret") {
      const visibleTo = value !== null && typeof value === "object" ? (value as { visibleTo?: unknown }).visibleTo : undefined;
      if (!isOwnSecretPath(path)) problems.push(`"secret" outside ownSecrets[i].event at ${path.join(".")}`);
      else if (visibleTo !== viewer) problems.push(`own secret ${path.join(".")} is visible to ${String(visibleTo)}, not ${viewer}`);
    }
    if (key === "orderHand" && Array.isArray(value) && path.join(".") !== "playerView.own.orderHand") problems.push(`a second orderHand at ${path.join(".")}`);
    if (key === "submissions" || (key === "mainDeck" && Array.isArray(value)) || key === "startingBox" || key === "firePeeks") {
      problems.push(`hidden pile ${String(key)} at ${path.join(".")}`);
    }
    if (key === "techDecks" && value !== null && typeof value === "object" && Object.values(value).some(Array.isArray)) {
      problems.push(`hidden pile techDecks at ${path.join(".")}`);
    }
  });
  for (const record of entry.ownSecrets) {
    const secret = (record.event as { secret?: { visibleTo: PlayerId } }).secret;
    if (secret === undefined) problems.push(`ownSecrets #${record.sequence} has no secret payload`);
  }
  return problems;
}

/**
 * Every privacy problem of one fixture entry against the authoritative state and log
 * (`events[sequence - 1]` is the event with that sequence):
 * - the structural checks above;
 * - each own secret equals the authoritative event, which is the viewer's own;
 * - each public record equals the projection of the authoritative event;
 * - no secret ID of this viewer appears anywhere in the entry;
 * - while the Contribution window is open, no sealed card outside the viewer's own view, and
 *   no card or Fuel Ledger flag on another seat's `CONTRIBUTION_SUBMITTED`;
 * - no other seat's fire peek.
 */
export function entryPrivacyProblems(
  state: GameState,
  privateState: PrivateFiringState | null,
  entry: PrivacyCheckedEntry,
  events: readonly GameEvent[],
): string[] {
  const problems = entryStructureProblems(entry);
  const viewer = entry.viewerId;
  const own = entry.playerView.own;
  for (const record of entry.ownSecrets) {
    const authoritative = events[record.sequence - 1];
    const secret = (authoritative as { secret?: { visibleTo: PlayerId } } | undefined)?.secret;
    if (authoritative === undefined || secret === undefined || secret.visibleTo !== viewer) {
      problems.push(`ownSecrets #${record.sequence} is not one of ${viewer}'s own secret events`);
    } else if (JSON.stringify(authoritative) !== JSON.stringify(record.event)) {
      problems.push(`ownSecrets #${record.sequence} differs from the authoritative event`);
    }
  }
  for (const record of entry.recentPublicEvents) {
    const authoritative = events[record.sequence - 1];
    if (authoritative === undefined || JSON.stringify(projectEvent(authoritative)) !== JSON.stringify(record.event)) {
      problems.push(`recentPublicEvents #${record.sequence} is not the projection of the authoritative event`);
    }
  }
  const forbidden = foreignSecretIds(state, viewer, events);
  walk(entry, (path, value) => {
    if (typeof value === "string" && forbidden.has(value)) problems.push(`${value} from ${forbidden.get(value)} at ${path.join(".")}`);
  });
  if (state.phase.type === "firing_contributions") {
    let sealed = 0;
    walk(entry, (path, value) => {
      if (path[path.length - 1] === "pendingContribution" && value !== null && value !== undefined) sealed += 1;
    });
    if (sealed > (own?.pendingContribution ? 1 : 0)) problems.push("a sealed Contribution outside the viewer's own view");
    for (const [pid, submission] of Object.entries(privateState?.submissions ?? {})) {
      if (pid === viewer || submission === undefined) continue;
      const leaked = entry.recentPublicEvents.some((record) => {
        const event = record.event as unknown as Record<string, unknown>;
        return event["type"] === "CONTRIBUTION_SUBMITTED" && event["playerId"] === pid && ("card" in event || "fuelLedger" in event);
      });
      if (leaked) problems.push(`unrevealed Contribution of ${pid} while the window is open`);
    }
  }
  for (const [pid, peek] of Object.entries(state.hidden.firePeeks)) {
    if (pid !== viewer && peek !== undefined && JSON.stringify(entry).includes(`"firePeek":{"playerId":"${pid}"`)) {
      problems.push(`fire peek of ${pid}`);
    }
  }
  return [...new Set(problems)];
}

/** Throws with every problem of `entryPrivacyProblems`. */
export function assertNoForeignSecrets(
  state: GameState,
  privateState: PrivateFiringState | null,
  entry: PrivacyCheckedEntry,
  events: readonly GameEvent[],
): void {
  const problems = entryPrivacyProblems(state, privateState, entry, events);
  if (problems.length > 0) {
    throw new Error(`Privacy check failed for ${entry.id} (viewer ${entry.viewerId}):\n- ${problems.join("\n- ")}`);
  }
}

/**
 * File-level check without the authoritative state: the structural checks for every entry,
 * and — when the secrets oracle is given — that no entry contains one of its secret IDs.
 */
export function verifyFixtureEntries(
  entries: readonly PrivacyCheckedEntry[],
  secrets?: Readonly<Record<string, readonly string[]>>,
): string[] {
  const problems: string[] = [];
  for (const entry of entries) {
    for (const problem of entryStructureProblems(entry)) problems.push(`${entry.id}: ${problem}`);
    const ids = secrets?.[entry.id];
    if (secrets !== undefined && ids === undefined) problems.push(`${entry.id}: no secrets oracle entry`);
    if (ids !== undefined) {
      const forbidden = new Set(ids);
      walk(entry, (path, value) => {
        if (typeof value === "string" && forbidden.has(value)) problems.push(`${entry.id}: secret ${value} at ${path.join(".")}`);
      });
    }
  }
  return problems;
}
