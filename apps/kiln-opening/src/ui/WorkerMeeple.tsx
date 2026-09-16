import type { WorkerKind } from "../game";
import type { PublicPlayerState } from "../multiplayer";
import type { Locale } from "./i18n";

const PLAYER_ACCENTS = ["cinnabar", "river", "ochre", "plum"] as const;

function workerLabel(player: PublicPlayerState, kind: WorkerKind, locale: Locale): string {
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
  player: PublicPlayerState;
  kind: WorkerKind;
  locale: Locale;
  small?: boolean;
}) {
  const label = workerLabel(player, kind, locale);
  const accent = PLAYER_ACCENTS[player.seatIndex] ?? PLAYER_ACCENTS[0];
  return (
    <span className={`kiln-tabletop-worker kiln-tabletop-accent-${accent} is-${kind} ${small ? "is-small" : ""}`} data-player-id={player.id} data-worker-kind={kind} aria-label={label} title={label}>
      <svg viewBox="0 0 44 54" aria-hidden="true" focusable="false">
        {kind === "shifu" ? <>
          <path className="kiln-tabletop-worker-hat" d="M15 5h14l3 5H12zM9 10h26l-2 4H11z" />
          <circle className="kiln-tabletop-worker-piece" cx="22" cy="18" r="6" />
          <path className="kiln-tabletop-worker-piece" d="M14 25q8-5 16 0l10 7-5 7-5-4 3 16H11l3-16-5 4-5-7z" />
          <path className="kiln-tabletop-worker-detail" d="M12 40h20" />
        </> : <>
          <circle className="kiln-tabletop-worker-piece" cx="22" cy="13" r="6" />
          <path className="kiln-tabletop-worker-piece" d="M16 21q6-4 12 0l4 28H12z" />
        </>}
        <text className="kiln-tabletop-worker-role" x="22" y={kind === "shifu" ? "42" : "37"}>{kind === "shifu" ? "S" : "A"}</text>
      </svg>
    </span>
  );
}
