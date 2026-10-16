/**
 * HeatMarkers (UI_V1.6.1_ARCHITECTURE §3.4 `heat_markers`; wireframe `decHeatMarker`). Owner: B5.
 *
 * Firing step 5: turn the viewer's face-down Heat marker to +1 or −1 or return it, and place
 * Kiln Master's marker if owned (optional). Each choice states its rule effect only, as the
 * physical marker would: no Quality previews and no Fire-deck information (D3/D4). Renders only
 * from `heatMarkersDraft.options()`.
 */
import type { CeramicId } from "../../../game/index.ts";
import { errorTextOptions, ruleErrorText } from "../../i18n/errors.ts";
import { signed } from "../../i18n/format.ts";
import { techName } from "../../i18n/content.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { RulesDetail } from "../../rules/RulesDetail.tsx";
import { B5_TECHS } from "./firingSupport.ts";
import { heatMarkersDraft, isHeatMarkerSide } from "./HeatMarkers.draft.ts";
import type { HeatMarkersAction, HeatMarkersDraft, OwnMarkerChoice } from "./HeatMarkers.draft.ts";
import { CeramicLine, Lead, Note, Section, StepQueue, stepLabel } from "./WindowParts.tsx";

export function HeatMarkers() {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const [draft, dispatch] = useDraft<HeatMarkersDraft, HeatMarkersAction>();
  const options = heatMarkersDraft.options(draft, model, engine);
  const errors = errorTextOptions(engine.view, t);
  const kilnMasterName = techName(B5_TECHS.kilnMaster, t.locale);
  const own = options.own;
  const km = options.kilnMaster;
  const ownTitle = (choice: OwnMarkerChoice) => (choice === "return" ? t("common.verb.returnHeatMarker") : t("common.verb.turnHeatMarker", { value: signed(choice) }));
  const ownDescription = (choice: OwnMarkerChoice) => (choice === "return" ? t("firing.hm.returnDesc") : t("firing.hm.turnDesc", { value: signed(choice) }));
  return (
    <div className="dw-form">
      <Lead step={stepLabel(model, t)}>{t("firing.hm.lead")}</Lead>
      <Section heading={t("firing.queue")}>
        <StepQueue model={model} />
      </Section>

      {own === null ? null : (
        <>
          <Section heading={t("firing.hm.yourMarker")}>
            <CeramicLine model={model} engine={engine} ceramicId={own.ceramicId} withPlace size={40} />
          </Section>
          <OptionGroup
            legend={t("firing.hm.turnOrReturn")}
            name="ownMarker"
            value={draft.own === null ? null : String(draft.own)}
            onChange={(value) => dispatch({ type: "own", choice: value === "return" ? "return" : isHeatMarkerSide(value) ?? "return" })}
            description={t("firing.hm.rule")}
          >
            {own.choices.map((entry) => (
              <OptionCard
                key={String(entry.choice)}
                value={String(entry.choice)}
                leading={<span className="dw-big" aria-hidden="true">{entry.choice === "return" ? signed(0) : signed(entry.choice)}</span>}
                title={ownTitle(entry.choice)}
                description={ownDescription(entry.choice)}
                disabled={entry.error !== null}
                reason={entry.error === null ? undefined : ruleErrorText(entry.error, t, errors)}
              />
            ))}
          </OptionGroup>
        </>
      )}

      {km === null ? null : (
        <Section heading={<RulesDetail subject={{ kind: "tech", id: B5_TECHS.kilnMaster }} trigger={<span className="rd-name">{t("firing.km.legend", { tech: kilnMasterName })}</span>} />}>
          {!km.ready ? (
            <Note>{t("common.status.usedThisRound")}</Note>
          ) : (
            <>
              <OptionGroup
                legend={t("firing.km.target")}
                name="kilnMasterCeramicId"
                value={draft.kmTarget}
                onChange={(value) => dispatch({ type: "kmTarget", target: value === "none" ? "none" : (value as CeramicId) })}
              >
                <OptionCard value="none" title={t("firing.km.none")} />
                {km.targets.map((target) => (
                  <OptionCard
                    key={target.ceramicId}
                    value={target.ceramicId}
                    title={<CeramicLine model={model} engine={engine} ceramicId={target.ceramicId} withPlace size={30} />}
                    disabled={!target.available}
                    reason={!target.available && target.needsReturn ? t("firing.km.afterReturn") : undefined}
                  />
                ))}
              </OptionGroup>
              <OptionGroup
                legend={t("firing.km.side")}
                name="kilnMasterValue"
                layout="pills"
                value={draft.kmValue === null ? null : String(draft.kmValue)}
                onChange={(value) => {
                  const side = isHeatMarkerSide(value);
                  if (side !== null) dispatch({ type: "kmValue", value: side });
                }}
              >
                {km.sides.map((side) => (
                  <OptionCard key={side} variant="pill" value={String(side)} title={signed(side)} />
                ))}
              </OptionGroup>
            </>
          )}
        </Section>
      )}
    </div>
  );
}
