/**
 * TestPieces (UI_V1.6.1_ARCHITECTURE §3.4 `test_pieces`). Owner: B5.
 *
 * The end of firing step 1 (after Base Heat, before the Fire card). The decision (pay Wood and peek privately, or decline), then — after a peek —
 * the bury decision with the viewer's private card ("only you"). Others see only whether the
 * card was buried, never the card (the public Test Pieces record). Renders only from
 * `testPiecesDraft.options()`.
 */
import { techText } from "../../i18n/content.ts";
import { errorTextOptions, ruleErrorText } from "../../i18n/errors.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { Chip } from "../../kit/Chip.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { FireCard } from "../../pieces/FireCard.tsx";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { RulesDetail } from "../../rules/RulesDetail.tsx";
import { B5_TECHS, woodText } from "./firingSupport.ts";
import { testPiecesDraft } from "./TestPieces.draft.ts";
import type { TestPiecesAction, TestPiecesChoice, TestPiecesDraft } from "./TestPieces.draft.ts";
import { Lead, stepLabel, Note, Section, ShortText, StepQueue } from "./WindowParts.tsx";

export function TestPieces() {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const [draft, dispatch] = useDraft<TestPiecesDraft, TestPiecesAction>();
  const options = testPiecesDraft.options(draft, model, engine);
  const tech = techText(B5_TECHS.testPieces, t.locale);
  const errors = errorTextOptions(engine.view, t);
  const title = (choice: TestPiecesChoice): string => {
    switch (choice) {
      case "peek":
        return t("firing.tp.peek", { wood: woodText(options.woodCost, t) });
      case "decline":
        return t("common.verb.decline");
      case "bury":
        return t("firing.tp.bury");
      case "keep":
        return t("firing.tp.keep");
    }
  };
  return (
    <div className="dw-form">
      <Lead step={stepLabel(model, t, false)}>
        <ShortText text={tech.short} />
      </Lead>
      <Section heading={t("firing.queue")}>
        <StepQueue model={model} />
      </Section>

      {options.awaiting === "bury" && options.peekedModifier !== null ? (
        <Section heading={t("firing.tp.youSaw")} aside={<Chip tone="private">{t("common.status.onlyYou")}</Chip>}>
          <span className="dw-row">
            <FireCard value={options.peekedModifier} size="lg" />
          </span>
        </Section>
      ) : null}

      <OptionGroup
        legend={options.awaiting === "bury" ? t("firing.tp.youSaw") : <RulesDetail subject={{ kind: "tech", id: B5_TECHS.testPieces }} look="name" />}
        hideLegend={options.awaiting === "bury"}
        name={options.awaiting === "bury" ? "bury" : "peek"}
        value={draft.choice}
        onChange={(value) => dispatch({ type: "choose", choice: value as TestPiecesChoice })}
      >
        {options.choices.map((entry) => (
          <OptionCard
            key={entry.choice}
            value={entry.choice}
            title={title(entry.choice)}
            description={entry.choice === "peek" ? t("firing.tp.peekNote") : undefined}
            disabled={entry.error !== null}
            reason={entry.error === null ? undefined : ruleErrorText(entry.error, t, errors)}
          />
        ))}
      </OptionGroup>

      {options.awaiting === "bury" ? <Note tone="private">{t("firing.tp.othersSee")}</Note> : null}
    </div>
  );
}
