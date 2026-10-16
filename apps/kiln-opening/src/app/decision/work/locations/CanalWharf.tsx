/**
 * CanalWharf (UI_V1.6.1_ARCHITECTURE §3.4; wireframe `subEditor` canal_wharf). Owner: B4.
 *
 * Nothing to choose: the Coins gained (`placementLimits`) and the resulting resources.
 */
import { useT } from "../../../i18n/I18nProvider.tsx";
import { ResourceDelta } from "../pieces.tsx";
import type { CanalWharfAction, CanalWharfDraft, CanalWharfOptions } from "./CanalWharf.draft.ts";
import type { LocationEditorProps } from "./editor.ts";
import { amountText } from "./shared.ts";

export type CanalWharfProps = LocationEditorProps<CanalWharfDraft, CanalWharfAction, CanalWharfOptions>;

export function CanalWharf({ options, context }: CanalWharfProps) {
  const t = useT();
  return (
    <div className="b4-sub" data-location="canal_wharf">
      <p>{t("work.cw.gain", { amount: amountText(t, "coins", options.coins) })}</p>
      <ResourceDelta before={context.me.resources} after={options.after} />
    </div>
  );
}
