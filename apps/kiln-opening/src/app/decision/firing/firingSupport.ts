/**
 * Pure helpers shared by B5's decision windows (UI_V1.6.1_ARCHITECTURE §3.4, §3.5). Owner: B5.
 *
 * Nothing here decides a rule: legality comes from the engine (`validateAction` probes and the
 * window selectors), and the helpers only shape what those return for the forms.
 */
import { validateAction } from "../../../game/index.ts";
import type {
  AuthoritativeCommand,
  CeramicId,
  FiringStageView,
  GameAction,
  GameRuleError,
  KilnId,
  PlayerId,
  PlayerView,
  ResourceState,
  TechId,
} from "../../../game/index.ts";
import { ceramicLabel } from "../../i18n/ceramicLabel.ts";
import type { CeramicFacts } from "../../i18n/ceramicLabel.ts";
import { list } from "../../i18n/format.ts";
import type { Locale, Translator } from "../../i18n/translator.ts";
import type { EngineView, GameModel } from "../../state/model.ts";

/** "Not seated": the reason every probe gives a spectator. */
const NOT_SEATED: GameRuleError = Object.freeze({ code: "UNKNOWN_PLAYER", message: "You are not seated in this game.", details: {} }) as GameRuleError;

/**
 * The engine's verdict on a command the form could build (`validateAction`, the one legality
 * function). Used to list a choice with its reason instead of re-implementing the rule.
 */
export function probe(engine: EngineView, command: GameAction): GameRuleError | null {
  return engine.actor === null ? NOT_SEATED : validateAction(engine.actor, command);
}

/** The probe's verdict for a full command (a Contribution is never probed this way). */
export function probeCommand(engine: EngineView, command: AuthoritativeCommand): GameRuleError | null {
  return command.type === "SUBMIT_CONTRIBUTION" ? null : probe(engine, command);
}

/**
 * A ceramic as the table shows it during or after this firing: its card attributes from the
 * public state, with this firing's recorded Quality and Crackle merged in from
 * `firingStageView` (a loaded ceramic carries no Quality of its own until step 12).
 */
export function firingCeramicFacts(view: PlayerView, stage: FiringStageView | null, ceramicId: CeramicId): CeramicFacts | null {
  const base = view.game.ceramics[ceramicId];
  if (base === undefined) return null;
  const fired = stage?.ceramics.find((ceramic) => ceramic.id === ceramicId) ?? null;
  const ownQuality = "quality" in base ? base.quality : null;
  const ownCrackle = "crackle" in base ? base.crackle : false;
  return {
    ...base,
    quality: fired?.quality ?? ownQuality,
    crackle: fired?.crackle === true || ownCrackle,
  };
}

/** The viewer's ceramics of this firing (not salvaged), in ceramic sequence order. */
export function ownFiringCeramicIds(model: GameModel): CeramicId[] {
  const stage = model.firingStage;
  if (stage === null || model.viewerId === null) return [];
  return stage.ceramics.filter((ceramic) => ceramic.ownerId === model.viewerId && !ceramic.salvaged).map((ceramic) => ceramic.id);
}

/** A player's seat index (ring colour), 0 when unknown. */
export function seatOf(model: GameModel, playerId: PlayerId): number {
  return model.players.find((summary) => summary.playerId === playerId)?.seatIndex ?? 0;
}

/** A player's display name; never the player ID. */
export function nameOf(model: GameModel, playerId: PlayerId): string {
  return model.players.find((summary) => summary.playerId === playerId)?.displayName ?? "";
}

/** A cost in words: "1 Wood", "2 Coins", "1 Clay, 1 Coin"; "free" when nothing is paid. */
export function costText(cost: ResourceState, t: Translator): string {
  const parts: string[] = [];
  if (cost.clay > 0) parts.push(t("common.amount.clay", { n: cost.clay }));
  if (cost.wood > 0) parts.push(t("common.amount.wood", { n: cost.wood }));
  if (cost.coins > 0) parts.push(t("common.amount.coins", { n: cost.coins }));
  return parts.length === 0 ? t("common.free") : list(parts, t.locale);
}

/** Wood as a whole phrase ("1 Wood" / "1柴"). */
export function woodText(n: number, t: Translator): string {
  return t("common.amount.wood", { n });
}

/** Coins as a whole phrase ("2 Coins" / "2铜钱"). */
export function coinsText(n: number, t: Translator): string {
  return t("common.amount.coins", { n });
}

/** Same members, any order (Order groups are matched as sets). */
export function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const pool = [...right];
  for (const item of left) {
    const at = pool.indexOf(item);
    if (at < 0) return false;
    pool.splice(at, 1);
  }
  return true;
}

/**
 * The Techs and Kilns B5's windows are about, by stable ID (display only: which card's name and
 * rules details to show). Whether one is usable always comes from the window's selector.
 */
export const B5_TECHS = {
  colourSamples: "T10",
  protectiveSaggars: "T11",
  fuelLedger: "T12",
  testPieces: "T13",
  secondFiring: "T14",
  canalBarge: "T23",
  kilnMaster: "T24",
  tributeWare: "T25",
} as const satisfies Record<string, TechId>;

export const B5_KILNS = { ru: "RU", guan: "GU", ge: "GE", jun: "JU" } as const satisfies Record<string, KilnId>;

/** The words a ceramic line would read, for option titles and summaries. */
export function ceramicWords(
  model: GameModel,
  engine: EngineView,
  ceramicId: CeramicId,
  t: Locale | Translator,
  among?: readonly CeramicId[],
  withPlace: boolean | "auto" = "auto",
): string {
  const facts = firingCeramicFacts(engine.view, model.firingStage, ceramicId);
  if (facts === null) return ceramicLabel(ceramicId, engine.view, { locale: t });
  const amongFacts = among === undefined ? undefined : among.map((id) => firingCeramicFacts(engine.view, model.firingStage, id)).filter((item): item is CeramicFacts => item !== null);
  return ceramicLabel(facts, engine.view, { locale: t, withOwner: facts.ownerId !== model.viewerId, withPlace, ...(amongFacts === undefined ? {} : { among: amongFacts }) });
}

