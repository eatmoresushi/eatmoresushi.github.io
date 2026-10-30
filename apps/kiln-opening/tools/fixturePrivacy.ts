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
 * The secret IDs of a viewer are the Order and Tech IDs in places it cannot see: other seats'
 * hands, other seats' private looks, the Main deck and its face-down discard, the Starting box
 * and the Tech decks. The full event log, replayed in order, says which of them the viewer
 * still knows the whereabouts of (`knowledge`): an ID a public event named (a face-up Order
 * reserved, the Orders rotated off the display) or one of its own secrets named (its own looks,
 * its own trimmed or discarded Orders, its own returned Techs) is known, until another seat's
 * secret names it, which means it moved where only that seat saw it go. That splits them in two:
 * - `unseen`: never shown to the viewer, so they may appear nowhere in its payloads;
 * - `rehidden`: shown once and moved unseen since, such as a face-up Order reserved in public
 *   and then given up face down for a Colour Samples swap (B3, v1.6.2 L656), or a card the
 *   viewer looked at and discarded (`LOOKED_ORDERS_DISCARDED`, owner ruling R25) that came back
 *   through a Main deck reshuffle and another seat then drew or looked at unseen. They
 *   may appear only in event records (`HISTORY_KEYS`), which are exact copies of authoritative
 *   events and show what the viewer saw when the event happened, and in the viewer's own steered
 *   commands (`source.steered` entries whose `playerId` is the viewer), which likewise record
 *   what the viewer named when it made them; never in another seat's steered command.
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
  /** A command response's public events, when the entry is a response (`CommandResponse.events`). */
  events?: readonly PublicGameEvent[];
}

/**
 * The entry keys that hold event records: `recentPublicEvents` and `events` (projections of
 * authoritative events) and `ownSecrets` (the viewer's own authoritative events). Each is
 * checked to be an exact copy, so it shows only what the viewer saw when the event happened.
 */
const HISTORY_KEYS: ReadonlySet<PathKey> = new Set(["recentPublicEvents", "ownSecrets", "events"]);

/**
 * Whether `path` is inside a historical record the viewer may see: the event records above, or
 * one of the viewer's **own** steered commands, `source.steered[i]` with `playerId === viewerId`
 * (the engine-validated commands the generator steered a seat to make at an earlier revision,
 * `tools/uiFixtures.ts`). The viewer's own command shows what the viewer named when it made it,
 * like its own secret event, so it may name a `rehidden` ID (such as the viewer's own Setup Main
 * Order, later trimmed and reshuffled away unseen). Another seat's steered command is a raw
 * command, private choices included (the Order a `DISCARD_TO_HAND_LIMIT` or a
 * `USE_COLOUR_SAMPLES_SWAP` put face down), so it is checked like a current payload: it may name
 * no `rehidden` ID. An `unseen` ID is a leak everywhere.
 */
function isHistoryPath(path: readonly PathKey[], entry: PrivacyCheckedEntry): boolean {
  if (HISTORY_KEYS.has(path[0] ?? "")) return true;
  if (path[0] !== "source" || path[1] !== "steered" || typeof path[2] !== "number") return false;
  const steered = (entry as { source?: { steered?: ReadonlyArray<{ playerId?: unknown } | undefined> } }).source?.steered;
  return steered?.[path[2]]?.playerId === entry.viewerId;
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

/**
 * What `viewerId` knows after `events`, replayed in order:
 * - `everKnown`: every string a public event or one of its own secrets has shown it;
 * - `known`: those whose whereabouts it still knows. Another seat's secret payload (a deal, a
 *   looked or unseen draw, a look, looked cards discarded, a discarded or trimmed Order) names
 *   IDs that moved where only that seat saw them go, so the viewer forgets where they are,
 *   until a public event or its own secret shows them again.
 */
export function knowledge(events: readonly GameEvent[], viewerId: PlayerId): { known: Set<string>; everKnown: Set<string> } {
  const known = new Set<string>();
  const everKnown = new Set<string>();
  const learn = (ids: ReadonlySet<string>): void => {
    for (const id of ids) {
      known.add(id);
      everKnown.add(id);
    }
  };
  for (const event of events) {
    const secret = (event as { secret?: { visibleTo: PlayerId } }).secret;
    if (secret !== undefined) {
      const ids = stringsIn(secret, new Set());
      if (secret.visibleTo === viewerId) learn(ids);
      else for (const id of ids) known.delete(id);
    }
    learn(stringsIn(projectEvent(event), new Set()));
  }
  return { known, everKnown };
}

/** The Order and Tech IDs in places `viewerId` cannot see in this state, each with where it is. */
function hiddenPlaces(state: GameState, viewerId: PlayerId): Map<string, string> {
  const places = new Map<string, string>();
  const hidden = state.hidden;
  for (const pid of state.playerOrder) {
    if (pid === viewerId) continue;
    for (const id of hidden.orderHands[pid] ?? []) places.set(id, `${pid}'s hand`);
  }
  for (const id of hidden.mainDeck) places.set(id, "Main deck");
  for (const id of hidden.mainDiscard) places.set(id, "Main discard");
  for (const id of hidden.startingBox) places.set(id, "Starting box");
  for (const discipline of DISCIPLINES) {
    for (const id of hidden.techDecks[discipline]) places.set(id, `${discipline} Tech deck`);
  }
  const look = hidden.pendingLook;
  if (look !== null) {
    // A Guild inspection that waits behind Colour Samples stays private too (v1.6.2 L237).
    const ids = look.kind === "guild_inspection" ? look.techIds : [...look.orderIds, ...(look.kind === "colour_samples" ? (look.inspection?.techIds ?? []) : [])];
    for (const id of ids) {
      if (look.playerId === viewerId) places.delete(id);
      else places.set(id, `${look.playerId}'s private look`);
    }
  }
  return places;
}

/** The secret IDs of one viewer, split by where they may appear (see the header). */
export interface ForeignSecrets {
  /** Never shown to the viewer: they may appear nowhere in its payloads. */
  unseen: Map<string, string>;
  /** Shown once, moved unseen since: they may appear only in event records (`HISTORY_KEYS`). */
  rehidden: Map<string, string>;
}

/**
 * The Order and Tech IDs `viewerId` must not see in this state, each with where it sits.
 * `events` is the full authoritative log of the game (or scenario) so far.
 */
export function foreignSecrets(state: GameState, viewerId: PlayerId, events: readonly GameEvent[]): ForeignSecrets {
  const { known, everKnown } = knowledge(events, viewerId);
  const unseen = new Map<string, string>();
  const rehidden = new Map<string, string>();
  for (const [id, where] of hiddenPlaces(state, viewerId)) {
    if (known.has(id)) continue;
    if (everKnown.has(id)) rehidden.set(id, `${where}, moved there unseen by ${viewerId}`);
    else unseen.set(id, where);
  }
  return { unseen, rehidden };
}

/** Every secret ID of `foreignSecrets`, unseen and rehidden alike. */
export function foreignSecretIds(state: GameState, viewerId: PlayerId, events: readonly GameEvent[]): Map<string, string> {
  const { unseen, rehidden } = foreignSecrets(state, viewerId, events);
  return new Map([...unseen, ...rehidden]);
}

/**
 * The secrets oracle entry (`secrets.json`, the local backend's `e2e_secret_ids`): the sorted
 * `unseen` IDs, which may appear nowhere. A page or a fixture file also shows past events, so
 * the `rehidden` IDs, which an old event may legitimately name, are checked only against the
 * authoritative state (`entryPrivacyProblems`).
 */
export function secretIdsFor(state: GameState, viewerId: PlayerId, events: readonly GameEvent[]): string[] {
  return [...foreignSecrets(state, viewerId, events).unseen.keys()].sort();
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
 * - each public record, and each of a response's `events`, equals the projection of an
 *   authoritative event;
 * - no `unseen` secret ID of this viewer appears anywhere in the entry, and no `rehidden` one
 *   outside its event records;
 * - while the Contribution window is open, no sealed card outside the viewer's own view, and
 *   no card (a Fuel Ledger card included) and no Fuel Ledger flag on another seat's
 *   `CONTRIBUTION_SUBMITTED`;
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
  if (entry.events !== undefined) {
    const projected = new Set(events.map((event) => JSON.stringify(projectEvent(event))));
    entry.events.forEach((event, index) => {
      if (!projected.has(JSON.stringify(event))) problems.push(`events[${index}] is not the projection of an authoritative event`);
    });
  }
  const { unseen, rehidden } = foreignSecrets(state, viewer, events);
  walk(entry, (path, value) => {
    if (typeof value !== "string") return;
    if (unseen.has(value)) problems.push(`${value} from ${unseen.get(value)} at ${path.join(".")}`);
    else if (rehidden.has(value) && !isHistoryPath(path, entry)) problems.push(`${value} from ${rehidden.get(value)} at ${path.join(".")}`);
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
