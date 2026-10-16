/**
 * WorkersRow (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `workersRow`.
 *
 * A player's four workers, Shifu first: available ones in full colour, placed ones dimmed and
 * named with where they stand ("Lin's Shifu at Materials Yard"). No worker ID reaches the markup
 * (D9); the placed locations come from the public occupants of every location.
 */
import type { PlayerId } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { locationName, workerKindName } from "../i18n/content.ts";
import { WorkerPiece } from "../pieces/WorkerPiece.tsx";
import { useGame } from "../state/hooks.ts";
import { boardWorkers, summaryOf } from "../table/tableData.ts";
import "./WorkersRow.css";

export interface WorkersRowProps {
  /** Whose workers. */
  playerId: PlayerId;
}

export function WorkersRow({ playerId }: WorkersRowProps) {
  const t = useT();
  const model = useGame();
  const summary = summaryOf(model, playerId);
  if (summary === null) return null;
  const own = playerId === model.viewerId;
  return (
    <ul className="wkrow" aria-label={t("boards.board.workers")}>
      {boardWorkers(model, summary).map((worker, index) => {
        const base = own ? t("common.worker.yours", { worker: workerKindName(worker.kind, t.locale) }) : t("common.worker.owned", { owner: summary.displayName, worker: workerKindName(worker.kind, t.locale) });
        const named = worker.senior ? t("common.worker.seniorApprentice", { worker: base }) : base;
        const label = worker.placedAt === null ? named : t("boards.workers.at", { worker: named, location: locationName(worker.placedAt, t.locale) });
        return (
          <li key={index}>
            <WorkerPiece kind={worker.kind} seat={summary.seatIndex} dim={worker.placedAt !== null} senior={worker.senior} label={label} />
          </li>
        );
      })}
    </ul>
  );
}
