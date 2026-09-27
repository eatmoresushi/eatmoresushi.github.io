import type { CSSProperties } from "react";
import apprenticeArtwork from "../../assets/current_v04/workers/apprentice-wood-v1.webp";
import shifuArtwork from "../../assets/current_v04/workers/shifu-wood-v1.webp";
import type { WorkerKind } from "../game";
import type { PublicPlayerState } from "../multiplayer";
import type { Locale } from "./i18n";
import "./worker-meeples.css";

const PLAYER_ACCENTS = ["cinnabar", "river", "ochre", "plum"] as const;

export function workerLabel(player: PublicPlayerState, kind: WorkerKind, locale: Locale): string {
  if (locale === "zh-CN") return `${player.displayName}的${kind === "shifu" ? "师傅" : "学徒"}`;
  return `${player.displayName}'s ${kind === "shifu" ? "Shifu" : "Apprentice"}`;
}

/** The single shared worker-piece rendering used on the board and in action choices. */
export function WorkerMeeple({
  player,
  kind,
  locale,
  small = false,
}: {
  player?: PublicPlayerState;
  kind: WorkerKind;
  locale: Locale;
  small?: boolean;
}) {
  const label = player === undefined
    ? locale === "zh-CN" ? kind === "shifu" ? "师傅" : "学徒" : kind === "shifu" ? "Shifu" : "Apprentice"
    : workerLabel(player, kind, locale);
  const accent = player === undefined ? "neutral" : PLAYER_ACCENTS[player.seatIndex] ?? PLAYER_ACCENTS[0];
  const artwork = kind === "shifu" ? shifuArtwork : apprenticeArtwork;
  return (
    <span className={`kiln-tabletop-worker kiln-worker-art kiln-tabletop-accent-${accent} is-${kind} ${small ? "is-small" : ""}`} data-player-id={player?.id} data-worker-kind={kind} role="img" aria-label={label} title={label}>
      <span className="kiln-worker-art-surface" style={{ "--worker-artwork": `url("${artwork}")` } as CSSProperties} aria-hidden="true">
        <img src={artwork} alt="" draggable={false} width="256" height="256" />
      </span>
    </span>
  );
}
