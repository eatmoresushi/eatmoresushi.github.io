/**
 * MagistratesHall (UI_V1.6.1_ARCHITECTURE §3.4; wireframe `subEditor` magistrates_hall). Owner: B4.
 *
 * Nothing to choose: the price and the Imperial Recognition reached (`magistratesHallQuote`),
 * that milestone's reward with its rules details (D10), and the resulting resources.
 */
import { recognitionMilestones } from "../../../i18n/content.ts";
import { useT } from "../../../i18n/I18nProvider.tsx";
import { FormNote, ResourceDelta, useRuleErrorText } from "../pieces.tsx";
import { RulesDetail } from "../../../rules/RulesDetail.tsx";
import type { MagistratesHallAction, MagistratesHallDraft, MagistratesHallOptions } from "./MagistratesHall.draft.ts";
import type { LocationEditorProps } from "./editor.ts";
import { amountsText } from "./shared.ts";

export type MagistratesHallProps = LocationEditorProps<MagistratesHallDraft, MagistratesHallAction, MagistratesHallOptions>;

export function MagistratesHall({ options, context }: MagistratesHallProps) {
  const t = useT();
  const errorText = useRuleErrorText();
  const reachable = options.reachable;
  const milestone = reachable === null ? undefined : recognitionMilestones(t.locale).find((space) => space.space === reachable);
  return (
    <div className="b4-sub" data-location="magistrates_hall">
      <p>{t("work.mh.pay", { pay: amountsText(t, options.quote.pay) })}</p>
      {reachable === null ? null : <p>{t("work.mh.recognition", { from: options.from, to: reachable })}</p>}
      {milestone === undefined || reachable === null ? null : (
        <div className="b4-sub-block">
          <p className="b4-sub-title">{t("work.mh.reward", { to: reachable })}</p>
          <p>
            <strong>{milestone.title}</strong>
            {milestone.reward === null ? null : <span> · {milestone.reward}</span>}
          </p>
          <RulesDetail subject={{ kind: "recognition", space: reachable }} />
        </div>
      )}
      {options.quote.ok || options.quote.error === null ? null : <FormNote tone="error">{errorText(options.quote.error)}</FormNote>}
      <ResourceDelta before={context.me.resources} after={options.after} />
    </div>
  );
}
