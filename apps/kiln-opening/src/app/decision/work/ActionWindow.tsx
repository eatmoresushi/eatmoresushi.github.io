/**
 * ActionWindow (UI_V1.6.1_ARCHITECTURE §3.4, §4.3 rule 3). Owner: B4.
 *
 * The before- and after-action window of a Work turn: Imperial Priority and the Colour Samples
 * swap (v1.6.2 L622), plus End turn after the action. Before the action, `WorkTurn` shows the
 * choice of step and this component shows the chosen ability's form; after the action it shows
 * the choice too. Both abilities' drafts live in the work draft.
 */
import { RULE_NUMBERS } from "../../i18n/content.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { ColourSamplesSwap } from "./ColourSamplesSwap.tsx";
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
  colour_samples_swap: "work.work.mode.colourSamplesSwap",
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
          <OptionCard
            key={mode}
            value={mode}
            title={t(TITLES[mode])}
            description={
              mode === "end_turn"
                ? t("work.work.mode.endTurnHint")
                : mode === "colour_samples_swap"
                  ? t("work.work.mode.swapHint", { n: RULE_NUMBERS.swapSelect })
                  : t("work.work.mode.after")
            }
          />
        ))}
      </OptionGroup>
    ) : null;
  return (
    <div className="b4-form" data-b4="action-window" data-source={source}>
      {choice}
      {draft.mode === "imperial_priority" ? <ImperialPriority /> : null}
      {draft.mode === "colour_samples_swap" ? <ColourSamplesSwap brief={source === "after_action" || options.stepChoices.length > 0} /> : null}
    </div>
  );
}
