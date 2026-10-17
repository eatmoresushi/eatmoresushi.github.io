/**
 * GuildHall (UI_V1.6.1_ARCHITECTURE §3.4; wireframe `subEditor` guild_hall). Owner: B4.
 *
 * The Guild Hall choice is made on the Tech display (owner review, 2026-10-17): the work window's
 * table adapter turns `guildOptions` into the display's targets (`techChooserOf`), and a click
 * there sets this sub-draft. The pane lists no Techs; it shows what is chosen, or asks for a
 * choice on the table, with a button that goes there (`revealTechChooser`):
 * - Apprentice effect: the face-up Tech to buy, its discipline and its price;
 * - Shifu effect: the discipline whose deck is inspected (privately; up to 2 takes from
 *   different disciplines and the bottom order follow in the `guild_inspection` window).
 */
import type { GuildTechOption, TechDiscipline } from "../../../../game/index.ts";
import { disciplineName, techName } from "../../../i18n/content.ts";
import { useT } from "../../../i18n/I18nProvider.tsx";
import type { Translator } from "../../../i18n/translator.ts";
import { Button } from "../../../kit/Button.tsx";
import { useLayoutMode, useUi } from "../../../state/hooks.ts";
import { isPhone } from "../../../state/layoutMode.ts";
import { revealTechChooser } from "../../../state/tableSelection.ts";
import { FormNote } from "../pieces.tsx";
import type { GuildHallAction, GuildHallDraft, GuildHallOptions } from "./GuildHall.draft.ts";
import type { LocationEditorProps } from "./editor.ts";
import { amountText } from "./shared.ts";

export type GuildHallProps = LocationEditorProps<GuildHallDraft, GuildHallAction, GuildHallOptions>;

/** The discipline swatch of a Tech (colour plus the discipline's name in text, never colour alone). */
export function DisciplineSwatch({ discipline }: { discipline: TechDiscipline }) {
  return <span className="b4-disc" data-discipline={discipline} aria-hidden="true" />;
}

/** "3 Coins": the printed cost, which every Guild Hall take pays (v1.6.2 L206–207). */
export function techPriceText(option: Pick<GuildTechOption, "cost">, t: Translator): string {
  return amountText(t, "coins", option.cost);
}

export function GuildHall({ draft, options }: GuildHallProps) {
  const t = useT();
  const ui = useUi();
  const layout = useLayoutMode();
  const guild = options.guild;
  const buy = options.mode === "buy";
  const chosen = buy ? guild.faceUp.find((tech) => tech.techId === draft.techId) ?? null : null;
  const discipline = buy ? null : draft.discipline;
  const nothing = buy ? chosen === null : discipline === null;
  return (
    <div className="b4-sub" data-location="guild_hall" data-mode={options.mode}>
      <p className="b4-sub-title">{buy ? t("work.gh.buy") : t("work.gh.inspect")}</p>
      {chosen !== null ? (
        <p className="b4-guild-choice" data-guild-choice={chosen.techId}>
          <DisciplineSwatch discipline={chosen.discipline} />
          <strong>{techName(chosen.techId, t.locale)}</strong>
          <span className="b4-guild-disc">{disciplineName(chosen.discipline, t.locale)}</span>
          <span className="b4-guild-price num">{techPriceText(chosen, t)}</span>
        </p>
      ) : null}
      {discipline !== null ? (
        <p className="b4-guild-choice" data-guild-choice={discipline}>
          <DisciplineSwatch discipline={discipline} />
          <strong>{t("work.gh.inspectChosen", { discipline: disciplineName(discipline, t.locale) })}</strong>
        </p>
      ) : null}
      {nothing ? <FormNote>{buy ? t("work.gh.chooseOnTable") : t("work.gh.chooseDeckOnTable")}</FormNote> : null}
      {buy ? null : <FormNote tone="private">{t("work.gh.inspectNote", { n: options.maxTechs })}</FormNote>}
      <div className="b4-row">
        <Button size="sm" data-goto="techs" onClick={() => revealTechChooser(ui, isPhone(layout))}>
          {nothing ? t("work.gh.showTechs") : t("work.gh.changeOnTable")}
        </Button>
      </div>
    </div>
  );
}
