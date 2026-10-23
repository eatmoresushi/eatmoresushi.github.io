/**
 * The ceramic view the game log and the live announcements describe ceramics with (D9).
 * Owner: B1 (shell, log, lobby).
 *
 * Every undelivered ceramic and its recorded attributes are public (AGENTS.md "Hidden
 * information"). The model's `ceramics` record (change request CR B1-1, landed by B6) describes
 * every ceramic still in the game. A sold Flawed ceramic leaves the game (its Vessel card returns
 * to the supply, rev. 4 L284, R20), so the log's older lines would lose it; the public events of
 * the log (formed, reshaped, glazed and loaded, Quality, Crackle, finished, delivered, sold) keep it
 * describable, and the model's record and the recorded firing results are laid over them.
 *
 * Nothing here decides a rule: it only remembers what the table showed, to put a ceramic into
 * words.
 */
import type { CeramicId, CeramicState, PlayerId } from "../../game/index.ts";
import type { CeramicFacts, CeramicLabelModelView } from "../i18n/ceramicLabel.ts";
import type { LogEntry } from "../session/gameSource.ts";
import type { GameModel } from "../state/model.ts";

type MutableFacts = { -readonly [K in keyof CeramicFacts]: CeramicFacts[K] };

/** Lays one public event of the log over the facts (in log order). */
function applyEvent(facts: Map<CeramicId, MutableFacts>, event: LogEntry["event"]): void {
  const update = (id: CeramicId, patch: Partial<MutableFacts>): void => {
    const current = facts.get(id);
    if (current !== undefined) Object.assign(current, patch);
  };
  {
    switch (event.type) {
      case "CERAMIC_FORMED":
        facts.set(event.ceramicId, { id: event.ceramicId, ownerId: event.playerId, shape: event.shape, decoration: event.decoration, glaze: null, stage: "shaped" });
        break;
      case "CERAMIC_RESHAPED":
        update(event.ceramicId, { shape: event.to });
        break;
      case "CERAMIC_LOADED":
        update(event.ceramicId, { glaze: event.glaze, stage: "loaded", placement: event.placement });
        break;
      case "QUALITY_ASSIGNED":
        update(event.ceramicId, { quality: event.quality });
        break;
      case "QUALITY_IMPROVED":
        update(event.ceramicId, { quality: event.to });
        break;
      case "CRACKLE_APPLIED":
        update(event.ceramicId, { crackle: true });
        break;
      case "FIRING_FINISHED":
        for (const id of event.finishedCeramicIds) update(id, { stage: "finished", placement: null });
        break;
      case "CERAMIC_SOLD":
        // Sold (R20): still describable, never a twin of a ceramic on the table.
        update(event.ceramicId, { stage: "delivered", placement: null });
        break;
      case "ORDER_COMPLETED":
        for (const id of event.record.ceramicIds) update(id, { stage: "delivered", placement: null });
        break;
      default:
        break;
    }
  }
}

/** Facts from the public events of the log, oldest first. */
function factsFromLog(log: readonly LogEntry[]): Map<CeramicId, MutableFacts> {
  const facts = new Map<CeramicId, MutableFacts>();
  for (const { event } of log) applyEvent(facts, event);
  return facts;
}

/** The Vessel-card facts of a ceramic in the model's record. */
function factsOf(id: CeramicId, ceramic: CeramicState): MutableFacts {
  const facts: MutableFacts = { id, ownerId: ceramic.ownerId, shape: ceramic.shape, decoration: ceramic.decoration, stage: ceramic.stage, placement: null };
  if ("glaze" in ceramic) facts.glaze = ceramic.glaze;
  if ("quality" in ceramic) facts.quality = ceramic.quality;
  if ("crackle" in ceramic) facts.crackle = ceramic.crackle;
  if (ceramic.stage === "loaded") facts.placement = ceramic.placement;
  return facts;
}

/** Lays the model's record and the recorded firing results over the log's facts. */
function overlayModel(facts: Map<CeramicId, MutableFacts>, model: GameModel): void {
  for (const [key, ceramic] of Object.entries(model.ceramics)) {
    const id = key as CeramicId;
    facts.set(id, { ...facts.get(id), ...factsOf(id, ceramic) });
  }
  for (const stage of [model.firingRecap, model.firingStage]) {
    for (const ceramic of stage?.ceramics ?? []) {
      const known = facts.get(ceramic.id);
      if (known === undefined || known.stage !== "loaded") continue;
      if (ceramic.quality !== null) known.quality = ceramic.quality;
      if (ceramic.crackle) known.crackle = true;
    }
  }
}

const CACHE = new WeakMap<GameModel, { log: readonly LogEntry[]; view: CeramicLabelModelView }>();

/** The `CeramicLabelView` for log lines and announcements, memoised on the model and the log. */
export function logCeramicView(model: GameModel, log: readonly LogEntry[]): CeramicLabelModelView {
  const cached = CACHE.get(model);
  if (cached !== undefined && cached.log === log) return cached.view;
  const players: readonly { playerId: PlayerId; displayName: string }[] = model.players;
  const facts = factsFromLog(log);
  overlayModel(facts, model);
  const ceramics: Readonly<Record<CeramicId, CeramicFacts>> = Object.fromEntries(facts);
  const view: CeramicLabelModelView = { viewerId: model.viewerId, players, ceramics };
  CACHE.set(model, { log, view });
  return view;
}

/**
 * The game log's views: for each entry in `sequences`, the `CeramicLabelView` as of that entry
 * (as `ceramicViewAsOf` gives it), built in one pass over the log. A line then names a ceramic as
 * the table showed it when the line happened, never with what a later move gave it (a Crackle
 * marker, a Glaze, the place a later twin calls for).
 */
export function ceramicViewsAsOf(model: GameModel, log: readonly LogEntry[], sequences: ReadonlySet<number>): ReadonlyMap<number, CeramicLabelModelView> {
  const views = new Map<number, CeramicLabelModelView>();
  if (sequences.size === 0) return views;
  const formed = new Set<CeramicId>();
  for (const { event } of log) if (event.type === "CERAMIC_FORMED") formed.add(event.ceramicId);
  const before: Record<CeramicId, CeramicFacts> = {};
  for (const [key, ceramic] of Object.entries(model.ceramics)) {
    const id = key as CeramicId;
    if (!formed.has(id)) before[id] = factsOf(id, ceramic);
  }
  const players: readonly { playerId: PlayerId; displayName: string }[] = model.players;
  const facts = new Map<CeramicId, MutableFacts>();
  for (const entry of log) {
    applyEvent(facts, entry.event);
    if (!sequences.has(entry.sequence)) continue;
    const ceramics: Record<CeramicId, CeramicFacts> = { ...before };
    for (const [id, known] of facts) ceramics[id] = { ...known };
    views.set(entry.sequence, { viewerId: model.viewerId, players, ceramics });
  }
  return views;
}

/**
 * The `CeramicLabelView` as of one moment of the log, for a turn toast (which may show some turns
 * after its turn): the log's facts up to `upTo`, so a later move (a delivery, a twin formed
 * later) never changes how the turn's lines read. A ceramic formed before the log's first entry
 * (a log still waiting for its history) has no facts there: the model's record describes it.
 */
export function ceramicViewAsOf(model: GameModel, log: readonly LogEntry[], upTo: number): CeramicLabelModelView {
  const facts = factsFromLog(log.filter((entry) => entry.sequence <= upTo));
  const formed = new Set<CeramicId>();
  for (const { event } of log) if (event.type === "CERAMIC_FORMED") formed.add(event.ceramicId);
  for (const [key, ceramic] of Object.entries(model.ceramics)) {
    const id = key as CeramicId;
    if (!formed.has(id)) facts.set(id, factsOf(id, ceramic));
  }
  const players: readonly { playerId: PlayerId; displayName: string }[] = model.players;
  return { viewerId: model.viewerId, players, ceramics: Object.fromEntries(facts) };
}
