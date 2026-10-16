/**
 * Salvage (UI_V1.6.1_ARCHITECTURE §3.4 `salvage`, §3.7). Owner: B5.
 *
 * Firing step 11, parallel: discard one still-Flawed ceramic from this firing for Coins (its
 * Vessel card returns to the supply), or keep it (the window's alternative). Everyone decides at
 * the same time; the draft survives other players' decisions. Renders only from
 * `salvageDraft.options()`.
 */
import type { CeramicId } from "../../../game/index.ts";
import { resourceName } from "../../i18n/content.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { coinsText } from "./firingSupport.ts";
import { salvageDraft } from "./Salvage.draft.ts";
import type { SalvageAction, SalvageDraft } from "./Salvage.draft.ts";
import { CeramicLine, Lead, stepLabel } from "./WindowParts.tsx";

export function Salvage() {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const [draft, dispatch] = useDraft<SalvageDraft, SalvageAction>();
  const options = salvageDraft.options(draft, model, engine);
  const coins = coinsText(options.coins, t);
  return (
    <div className="dw-form">
      <Lead step={stepLabel(model, t)}>{t("firing.salvage.lead", { coins })}</Lead>
      <OptionGroup
        legend={t("firing.ceramic")}
        name="ceramicId"
        value={draft.choice === null || draft.choice === "keep" ? null : draft.choice}
        onChange={(value) => dispatch({ type: "salvage", ceramicId: value as CeramicId })}
      >
        {options.ceramicIds.map((ceramicId) => (
          <OptionCard
            key={ceramicId}
            value={ceramicId}
            title={<CeramicLine model={model} engine={engine} ceramicId={ceramicId} withPlace among={options.ceramicIds} size={32} />}
            meta={t("common.gainRes", { n: options.coins, res: resourceName("coins", t.locale, options.coins) })}
          />
        ))}
      </OptionGroup>
    </div>
  );
}
