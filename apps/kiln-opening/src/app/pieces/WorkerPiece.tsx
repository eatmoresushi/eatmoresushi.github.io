/**
 * WorkerPiece (pieces, §7.4; wireframe `wk`, V1.4 `WorkerMeeple`).
 *
 * - `variant="full"`: the wooden silhouette (`assets/current_v04/workers`) masked by the seat
 *   colour.
 * - `variant="dense"`: the lettered token for queue rows and small chips (S/A, 师/徒), Shifu
 *   with a rounded-top shape.
 *
 * Colour is the seat token `--seat-<seatIndex>`, never `PublicSeat.colour` (whose names would
 * read as Glaze tints). The accessible name is in words ("Lin's Shifu", "Your Apprentice"):
 * never a worker ID (D9).
 */
import type { CSSProperties } from "react";
import type { WorkerKind } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { workerKindName } from "../i18n/content.ts";
import { cssUrl, useArt } from "./art.ts";
import "./WorkerPiece.css";

export interface WorkerPieceProps {
  kind: WorkerKind;
  /** Owner's seat index (0–3). */
  seat: number;
  variant?: "full" | "dense";
  /** Owner's display name; `own` makes it "Your …". Omit both for a neutral "Shifu". */
  ownerName?: string;
  own?: boolean;
  /** Accessible name override. */
  label?: string;
  /** Hide from assistive technology (a labelled control already names it). */
  decorative?: boolean;
  /** Already placed or unavailable. */
  dim?: boolean;
  /** An Apprentice resolving as a Shifu (Senior Apprentice). */
  senior?: boolean;
  /** Edge length in CSS px. */
  size?: number;
  /** Phase 5 FLIP key (`data-motion-key`, §8.4): a stable ID such as the worker ID. An attribute only, never text (D9). */
  motionKey?: string;
  className?: string;
}

export function WorkerPiece({
  kind,
  seat,
  variant = "dense",
  ownerName,
  own = false,
  label,
  decorative = false,
  dim = false,
  senior = false,
  size,
  motionKey,
  className,
}: WorkerPieceProps) {
  const t = useT();
  const art = useArt();
  const worker = workerKindName(kind, t.locale);
  let name = label;
  if (name === undefined) {
    name = own ? t("common.worker.yours", { worker }) : ownerName === undefined ? worker : t("common.worker.owned", { owner: ownerName, worker });
    if (senior) name = t("common.worker.seniorApprentice", { worker: name });
  }
  const style = {
    "--pc": `var(--seat-${seat})`,
    ...(size === undefined ? {} : { "--wk-size": `${size}px` }),
    ...(variant === "full" ? { "--worker-art": cssUrl(art.worker(kind)) } : {}),
  } as CSSProperties;
  const classes = ["wk", `wk--${kind}`, `wk--${variant}`, dim ? "wk--dim" : "", senior ? "wk--senior" : "", className ?? ""]
    .filter((part) => part !== "")
    .join(" ");
  const a11y = decorative ? { "aria-hidden": true as const } : { role: "img" as const, "aria-label": name };
  return (
    <span className={classes} style={style} data-motion="worker" data-motion-key={motionKey} data-worker-kind={kind} {...a11y}>
      {variant === "dense"
        ? <span aria-hidden="true">{kind === "shifu" ? t("common.workerLetter.shifu") : t("common.workerLetter.apprentice")}</span>
        : <span className="wk-art" aria-hidden="true" />}
    </span>
  );
}
