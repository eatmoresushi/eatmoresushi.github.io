/**
 * ImperialPriority (UI_V1.6.1_ARCHITECTURE §3.4, §5 gap 16). Owner: B4.
 *
 * Spend the Imperial Priority token: a Shaped vessel, Reworking Table's Shape change (P1), its
 * Glaze and the public −1/0/+1 Imperial modifier, from `imperialPriorityOptions(view).ceramics`.
 * The Recognition milestone and Reworking Table open their rules details (D10). Composed by
 * `ActionWindow` before and after the worker action.
 */
import type { CSSProperties } from "react";
import { IMPERIAL_PRIORITY_RECOGNITION, glazeName, shapeName, techName } from "../../i18n/content.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { CeramicArt } from "../../pieces/CeramicArt.tsx";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { imperialPriorityDraft } from "./ImperialPriority.draft.ts";
import { signedModifier, vesselLabel } from "./locations/shared.ts";
import { FormNote } from "./pieces.tsx";
import { RulesDetail } from "../../rules/RulesDetail.tsx";
import type { WorkAction, WorkDraft } from "./workDraft.ts";

const KEEP_SHAPE = "keep";

export function ImperialPriority() {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const [work, dispatchWork] = useDraft<WorkDraft, WorkAction>();
  const draft = work.imperialPriority;
  const options = imperialPriorityDraft.options(draft, model, engine);
  const dispatch = (action: Parameters<typeof imperialPriorityDraft.reduce>[1]) => {
    if (action.type !== "revalidate") dispatchWork({ type: "imperialPriority", action });
  };
  const chosen = draft.ceramicId === null ? null : engine.view.game.ceramics[draft.ceramicId] ?? null;
  return (
    <div className="b4-sub" data-b4="imperial-priority">
      <div className="b4-row">
        <FormNote>{t("work.ip.note")}</FormNote>
        <RulesDetail subject={{ kind: "recognition", space: IMPERIAL_PRIORITY_RECOGNITION }} />
      </div>
      <OptionGroup legend={t("work.ip.vessel")} name="ceramicId" layout="pills" value={draft.ceramicId} onChange={(value) => dispatch({ type: "vessel", ceramicId: value })}>
        {options.vessels.map((vessel) => (
          <OptionCard
            key={vessel.ceramicId}
            variant="pill"
            value={vessel.ceramicId}
            title={vesselLabel(engine.view, vessel.ceramicId, t)}
            leading={vessel.ceramic === null ? undefined : <CeramicArt shape={vessel.ceramic.shape} decoration={vessel.ceramic.decoration} glaze={draft.ceramicId === vessel.ceramicId ? draft.glaze : null} size={22} />}
          />
        ))}
      </OptionGroup>
      {chosen === null || options.reworkShapes.length === 0 ? null : (
        <div className="b4-sub-block">
          <OptionGroup
            legend={t("work.ip.rework", { tech: techName(options.reworkTechId, t.locale) })}
            name="reworkShape"
            layout="pills"
            value={draft.rework ?? KEEP_SHAPE}
            onChange={(value) => dispatch({ type: "rework", shape: options.reworkShapes.find((shape) => shape === value) ?? null })}
          >
            <OptionCard variant="pill" value={KEEP_SHAPE} title={t("work.gl.keepShape", { shape: shapeName(chosen.shape, t.locale) })} />
            {options.reworkShapes.map((shape) => (
              <OptionCard key={shape} variant="pill" value={shape} title={shapeName(shape, t.locale)} />
            ))}
          </OptionGroup>
          <RulesDetail subject={{ kind: "tech", id: options.reworkTechId }} />
        </div>
      )}
      {chosen === null ? null : (
        <OptionGroup
          legend={t("work.ip.glaze")}
          name="glaze"
          layout="pills"
          value={draft.glaze}
          onChange={(value) => {
            const glaze = options.glazes.find((candidate) => candidate === value);
            if (glaze !== undefined) dispatch({ type: "glaze", glaze });
          }}
        >
          {options.glazes.map((glaze) => (
            <OptionCard
              key={glaze}
              variant="pill"
              value={glaze}
              title={glazeName(glaze, t.locale)}
              leading={<span className="b4-swatch" style={{ "--g": `var(--glz-${glaze})` } as CSSProperties} aria-hidden="true" />}
            />
          ))}
        </OptionGroup>
      )}
      {chosen === null ? null : (
        <OptionGroup
          legend={t("work.ip.modifier")}
          name="imperialModifier"
          layout="pills"
          value={draft.modifier === null ? null : String(draft.modifier)}
          onChange={(value) => {
            const modifier = options.modifiers.find((candidate) => String(candidate) === value);
            if (modifier !== undefined) dispatch({ type: "modifier", modifier });
          }}
        >
          {options.modifiers.map((modifier) => (
            <OptionCard key={modifier} variant="pill" value={String(modifier)} title={signedModifier(modifier)} />
          ))}
        </OptionGroup>
      )}
    </div>
  );
}
