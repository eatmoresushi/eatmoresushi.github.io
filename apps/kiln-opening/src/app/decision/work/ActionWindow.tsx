/**
 * ActionWindow (UI_V1.6.1_ARCHITECTURE §3.4, §4.3 rule 3). Owner: B4.
 *
 * The before- and after-action window of a Work turn: Imperial Priority (B4's form) and Canal
 * Barge (B5's form, composed with `{ source }`), plus End turn after the action. Before the
 * action, `WorkTurn` shows the choice of step and this component shows the chosen ability's form;
 * after the action it shows the choice too. Canal Barge's draft lives in the work draft and
 * reaches B5's form through `CanalBargeFormProvider` (`composedForms.tsx`).
 */
import { useT } from "../../i18n/I18nProvider.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { CanalBarge } from "../orders/CanalBarge.tsx";
import { CanalBargeFormProvider } from "./composedForms.tsx";
import { ImperialPriority } from "./ImperialPriority.tsx";
import { workDraft } from "./workDraft.ts";
import type { WorkAction, WorkDraft, WorkMode } from "./workDraft.ts";
import "./pieces.css";

export interface ActionWindowProps {
  source: "before_action" | "after_action";
}

const TITLES = {
  place: "work.work.mode.place",
  imperial_priority: "work.work.mode.imperialPriority",
  canal_barge: "work.work.mode.canalBarge",
  end_turn: "work.work.mode.endTurn",
} as const satisfies Record<WorkMode, string>;

export function ActionWindow({ source }: ActionWindowProps) {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const [draft, dispatch] = useDraft<WorkDraft, WorkAction>();
  const options = workDraft.options(draft, model, engine);
  const choice =
    source === "after_action" ? (
      <OptionGroup
        legend={t("work.work.step.mode")}
        name="mode"
        value={draft.mode}
        onChange={(value) => {
          const mode = options.modes.find((candidate) => candidate.mode === value)?.mode;
          if (mode !== undefined) dispatch({ type: "mode", mode });
        }}
      >
        {options.modes.map(({ mode }) => (
          <OptionCard key={mode} value={mode} title={t(TITLES[mode])} description={mode === "end_turn" ? t("work.work.mode.endTurnHint") : t("work.work.mode.after")} />
        ))}
      </OptionGroup>
    ) : null;
  return (
    <div className="b4-form" data-b4="action-window" data-source={source}>
      {choice}
      {draft.mode === "imperial_priority" ? <ImperialPriority /> : null}
      {draft.mode === "canal_barge" ? (
        <CanalBargeFormProvider
          value={{ source, draft: draft.canalBarge, options: options.canalBarge.options, dispatch: (action) => dispatch({ type: "canalBarge", action }) }}
        >
          <CanalBarge source={source} />
        </CanalBargeFormProvider>
      ) : null}
    </div>
  );
}
