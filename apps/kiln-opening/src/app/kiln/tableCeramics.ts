/**
 * The ceramics the kiln, firing stage and results show, as `CeramicFacts` (owner decision D9:
 * described in words, never by ID). Owner: B3.
 *
 * Every ceramic is described from the model's public `ceramics` record (change request CR B3-1,
 * landed by B6), so pending chips, the recap's finished ceramics and the exhibited ceramics all
 * get their picture. The Quality and Crackle recorded in the current firing
 * (`firingStage.ceramics`) are merged in, as the chip shows them. This reads public state only
 * and decides no rule.
 */
import type { CeramicId, FiringStageCeramic, FiringStageView, PlayerId } from "../../game/index.ts";
import type { CeramicFacts, CeramicLabelModelView } from "../i18n/ceramicLabel.ts";
import { useGame } from "../state/hooks.ts";
import type { GameModel } from "../state/model.ts";

export interface TableCeramics {
  /** The ceramic's attributes, or null when the model holds none for it. */
  facts(id: CeramicId): CeramicFacts | null;
  /** Every ceramic with attributes that is not delivered (the `among` set for `ceramicLabel`). */
  readonly all: readonly CeramicFacts[];
  /** The label view for `ceramicLabel` and `CeramicChip`. */
  readonly view: CeramicLabelModelView;
  /** The seat index of a player (ring colour `--seat-N`). */
  seat(playerId: PlayerId): number;
  /** A player's display name (empty when unknown; never the player ID). */
  displayName(playerId: PlayerId): string;
}

function withRecord(facts: CeramicFacts, record: FiringStageCeramic | undefined): CeramicFacts {
  if (record === undefined || (record.quality === null && !record.crackle)) return facts;
  return { ...facts, quality: record.quality ?? facts.quality ?? null, crackle: record.crackle || facts.crackle === true };
}

/** Builds the lookup for one model. Pure; prefer `tableCeramicsOf`, which memoises. */
export function buildTableCeramics(model: GameModel): TableCeramics {
  const byId = new Map<CeramicId, CeramicFacts>();
  for (const [id, facts] of Object.entries(model.ceramics)) byId.set(id as CeramicId, { ...facts, id: id as CeramicId });
  const stage: FiringStageView | null = model.firingStage;
  if (stage !== null) {
    for (const record of stage.ceramics) {
      const facts = byId.get(record.id);
      if (facts !== undefined) byId.set(record.id, withRecord(facts, record));
    }
  }
  const all = [...byId.values()].filter((facts) => facts.stage !== "delivered");
  const seats = new Map(model.players.map((player) => [player.playerId, player.seatIndex] as const));
  const names = new Map(model.players.map((player) => [player.playerId, player.displayName] as const));
  return {
    facts: (id) => byId.get(id) ?? null,
    all,
    view: { viewerId: model.viewerId, players: model.players, ceramics: Object.fromEntries(byId) },
    seat: (playerId) => seats.get(playerId) ?? 0,
    displayName: (playerId) => names.get(playerId) ?? "",
  };
}

const CACHE = new WeakMap<GameModel, TableCeramics>();

/** The lookup for a model, memoised on the model's identity (itself memoised per view). */
export function tableCeramicsOf(model: GameModel): TableCeramics {
  let cached = CACHE.get(model);
  if (cached === undefined) {
    cached = buildTableCeramics(model);
    CACHE.set(model, cached);
  }
  return cached;
}

export function useTableCeramics(): TableCeramics {
  return tableCeramicsOf(useGame());
}
