/**
 * CanalWharf (UI_V1.6.1_ARCHITECTURE §3.4; wireframe `subEditor` canal_wharf). Owner: B4.
 *
 * Nothing to choose: the Coins gained (`placementLimits`) and the resulting resources; for the
 * Shifu effect, the top Main Order card taken into the hand, unseen (v1.6.2 L219–220), or, with
 * the Main Order deck and its discard pile both empty, that there is no card to take (B1).
 */
import { useT } from "../../../i18n/I18nProvider.tsx";
import { FormNote, ResourceDelta } from "../pieces.tsx";
import type { CanalWharfAction, CanalWharfDraft, CanalWharfOptions } from "./CanalWharf.draft.ts";
import type { LocationEditorProps } from "./editor.ts";
import { amountText } from "./shared.ts";

export type CanalWharfProps = LocationEditorProps<CanalWharfDraft, CanalWharfAction, CanalWharfOptions>;

export function CanalWharf({ options, context }: CanalWharfProps) {
  const t = useT();
  return (
    <div className="b4-sub" data-location="canal_wharf" data-draw={options.draw ?? undefined}>
      <p>{t("work.cw.gain", { amount: amountText(t, "coins", options.coins) })}</p>
      {options.draw === "card" ? <p>{t("work.cw.draw")}</p> : null}
      {options.draw === "empty" ? <FormNote>{t("work.cw.drawNone")}</FormNote> : null}
      <ResourceDelta before={context.me.resources} after={options.after} />
    </div>
  );
}
