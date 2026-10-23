/**
 * Player names for the kiln, firing stage and results (owner: B3). Never a player ID: the
 * display name, with "(you)" / "（你）" for the viewer.
 */
import type { PlayerId } from "../../game/index.ts";
import type { Translator } from "../i18n/translator.ts";
import type { GameModel } from "../state/model.ts";

export function playerLabel(model: Pick<GameModel, "players" | "viewerId">, t: Translator, playerId: PlayerId): string {
  const name = model.players.find((player) => player.playerId === playerId)?.displayName ?? t("common.anotherPlayer");
  return playerId === model.viewerId ? t("common.nameYou", { name }) : name;
}

/** The seat index of a player (ring colour `--seat-N`); 0 when unknown. */
export function seatOf(model: Pick<GameModel, "players">, playerId: PlayerId): number {
  return model.players.find((player) => player.playerId === playerId)?.seatIndex ?? 0;
}
