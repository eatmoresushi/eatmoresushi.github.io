/**
 * The ceramic view the game log and the live announcements describe ceramics with (D9).
 * Owner: B1 (shell, log, lobby).
 *
 * Every undelivered ceramic and its recorded attributes are public (AGENTS.md "Hidden
 * information"). The model's `ceramics` record (change request CR B1-1, landed by B6) describes
 * every ceramic still in the game. A salvaged ceramic leaves the game (its Vessel card returns to
 * the supply, L280), so the log's older lines would lose it; the public events of the log
 * (formed, reshaped, glazed and loaded, Quality, Crackle, finished, delivered, salvaged) keep it
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

/** Facts from the public events of the log, oldest first. */
function factsFromLog(log: readonly LogEntry[]): Map<CeramicId, MutableFacts> {
  const facts = new Map<CeramicId, MutableFacts>();
  const update = (id: CeramicId, patch: Partial<MutableFacts>): void => {
    const current = facts.get(id);
    if (current !== undefined) Object.assign(current, patch);
  };
  for (const { event } of log) {
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
      case "CERAMIC_SALVAGED":
        // Discarded: still describable, never a twin of a ceramic on the table.
        update(event.ceramicId, { stage: "delivered", placement: null });
        break;
      case "ORDER_COMPLETED":
        for (const id of event.record.ceramicIds) update(id, { stage: "delivered", placement: null });
        break;
      default:
        break;
    }
  }
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
