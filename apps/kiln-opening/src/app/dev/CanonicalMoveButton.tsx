/**
 * The canonical-move button (UI_V1.6.1_ARCHITECTURE §10.2 A2 acceptance). Dev only: rendered by
 * `DecisionPane` when dev tools are on (the dev server and `build:e2e` bundles, never a
 * production build). Removed in phase C1.
 *
 * It submits `legalCommands(view, { mode: "canonical", limit: 1 })[0]` through the real
 * `useDecision().submit`, so one human can finish a full game against computers through the
 * real store, client and local backend before the phase B forms exist. The server validates it
 * like any other command. `legalCommands` may be called only in `src/app/dev/**` (§2).
 *
 * Its text is English developer text, never game text; hooks: `data-dev="canonical-move"`,
 * `data-command-type`.
 */
import { useMemo } from "react";
import { legalCommands } from "../../game/index.ts";
import { useDecision, useEngineView, useGame } from "../state/hooks.ts";
import "./CanonicalMoveButton.css";

export function CanonicalMoveButton() {
  const { view } = useEngineView();
  const model = useGame();
  const decision = useDecision();
  const command = useMemo(() => legalCommands(view, { mode: "canonical", limit: 1 })[0] ?? null, [view]);
  const disabled = command === null || decision.sending;
  return (
    <div className="dev-canonical" lang="en" translate="no">
      <button
        type="button"
        className="dev-canonical-button"
        data-dev="canonical-move"
        data-command-type={command?.type ?? ""}
        aria-disabled={disabled ? true : undefined}
        aria-busy={decision.sending ? true : undefined}
        onClick={() => {
          if (disabled || command === null) return;
          void decision.submit(command);
        }}
      >
        Dev: play the canonical move
      </button>
      <span className="dev-canonical-meta">
        rev {model.revision} · {command?.type ?? "no legal command"}
      </span>
    </div>
  );
}
