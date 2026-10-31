/**
 * SellFlawed (change 30; a free action since owner revision 5, change 36, rev. 5 L172, L302): the
 * choice of a Flawed ceramic to sell, as one group of a window's form in the viewer's free-action
 * windows (the work turn's before- and after-action steps, the Order Phase turn; never during the
 * firing or at Cleanup, owner ruling R26). Owner: B6. The group is marked "Free action".
 *
 * Each sellable ceramic (`sellFlawedOptions`, through the window's draft) is a radio card with the
 * Coins it brings; the window's draft holds the choice and builds `SELL_FLAWED`. The same choice
 * is made from the Sell buttons on the table. Renders only what it is given.
 */
import type { CeramicId, SellFlawedOptions } from "../../../game/index.ts";
import { resourceName } from "../../i18n/content.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import type { EngineView, GameModel } from "../../state/model.ts";
import { CeramicLine } from "../firing/WindowParts.tsx";

export interface SellFlawedProps {
  model: GameModel;
  engine: EngineView;
  options: SellFlawedOptions;
  /** The ceramic chosen to sell, or null. */
  value: CeramicId | null;
  onChange: (ceramicId: CeramicId) => void;
  /** The radio group's name (one per window). */
  name?: string;
  /** Hide the legend when the window's own heading already says "Sell a Flawed ceramic". */
  hideLegend?: boolean;
}

export function SellFlawed({ model, engine, options, value, onChange, name = "sellCeramicId", hideLegend = false }: SellFlawedProps) {
  const t = useT();
  const coins = t("common.amount.coins", { n: options.coins });
  return (
    <OptionGroup
      legend={t("common.sale.title")}
      hideLegend={hideLegend}
      aside={t("common.freeAction")}
      description={t("common.sale.lead", { coins })}
      name={name}
      value={value}
      onChange={(next) => {
        const ceramicId = options.ceramicIds.find((candidate) => candidate === next);
        if (ceramicId !== undefined) onChange(ceramicId);
      }}
    >
      {options.ceramicIds.map((ceramicId) => (
        <OptionCard
          key={ceramicId}
          value={ceramicId}
          title={<CeramicLine model={model} engine={engine} ceramicId={ceramicId} among={options.ceramicIds} size={32} />}
          meta={t("common.gainRes", { n: options.coins, res: resourceName("coins", t.locale, options.coins) })}
        />
      ))}
    </OptionGroup>
  );
}
