/**
 * QueueRow (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B3 (kiln, firing stage, results, playtest).
 * Source: wireframe `queueRow`, `submitRow`: who acts in a queued step, who has submitted a Contribution.
 *
 * - Step 1 (secret Contributions): each participant and whether they have chosen, never what
 *   (`stage.submittedPlayerIds`; §3.7). With no participant, a line says nobody contributes.
 * - A queued step (4, 5, 8, 10): the queue in First Player order, with who is deciding now.
 * - Any other step with actors (Salvage, the Second Firing choice): who is deciding.
 */
import type { FiringStageView, PlayerId } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { playerLabel, seatOf } from "../kiln/names.ts";
import { useGame } from "../state/hooks.ts";
import { seatVar } from "../kiln/cssVars.ts";
import "./QueueRow.css";

export interface QueueRowProps {
  /** The firing shown. */
  stage: FiringStageView;
}

type Mark = "now" | "done" | "next" | "chosen" | "choosing";

const GLYPH: Readonly<Record<Mark, string>> = { now: "●", done: "✓", next: "", chosen: "✓", choosing: "⋯" };

export function QueueRow({ stage }: QueueRowProps) {
  const t = useT();
  const model = useGame();
  const words = (playerId: PlayerId, mark: Mark): string => {
    const name = playerLabel(model, t, playerId);
    switch (mark) {
      case "now":
        return t("kiln.queue.now", { name });
      case "done":
        return t("kiln.queue.done", { name });
      case "next":
        return t("kiln.queue.next", { name });
      case "chosen":
        return t("kiln.submitted.yes", { name });
      case "choosing":
        return t("kiln.submitted.no", { name });
    }
  };
  const row = (label: string, entries: ReadonlyArray<{ playerId: PlayerId; mark: Mark }>) => (
    <div className="queue">
      <span className="queue-label">{label}</span>
      <ol className="queue-list">
        {entries.map(({ playerId, mark }) => (
          <li key={playerId} className={`queue-item queue-item--${mark}`} style={seatVar(seatOf(model, playerId))}>
            <i className="queue-swatch" aria-hidden="true" />
            <span aria-hidden="true">{playerLabel(model, t, playerId)}</span>
            {GLYPH[mark] === "" ? null : <span className="queue-glyph" aria-hidden="true">{GLYPH[mark]}</span>}
            <span className="sr-only">{words(playerId, mark)}</span>
          </li>
        ))}
      </ol>
    </div>
  );

  if (stage.step === 1) {
    if (stage.contributions.length === 0) return <p className="queue queue-note">{t("kiln.submitted.noneEligible")}</p>;
    const submitted = new Set(stage.submittedPlayerIds);
    return row(
      t("kiln.submitted.label"),
      stage.contributions.map(({ playerId }) => ({ playerId, mark: submitted.has(playerId) ? "chosen" : "choosing" })),
    );
  }
  if (stage.queue !== null) {
    const { actorIds, index } = stage.queue;
    return row(
      t("kiln.queue.label"),
      actorIds.map((playerId, position) => ({ playerId, mark: position === index ? "now" : position < index ? "done" : "next" })),
    );
  }
  const actors = model.prompt.actorIds;
  if (actors.length === 0) return null;
  return row(t("kiln.queue.deciding"), actors.map((playerId) => ({ playerId, mark: "now" as const })));
}
