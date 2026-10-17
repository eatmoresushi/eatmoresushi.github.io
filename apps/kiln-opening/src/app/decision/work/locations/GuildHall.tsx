/**
 * GuildHall (UI_V1.6.1_ARCHITECTURE §3.4; wireframe `subEditor` guild_hall). Owner: B4.
 *
 * Apprentice effect: buy one face-up Tech (price, legality and reason from `guildOptions`).
 * Shifu effect: choose a discipline to inspect, and see the face-up Techs it could take instead
 * at their discounted prices. Every Tech opens its rules details (D10).
 */
import type { GuildTechOption, TechDiscipline, TechId } from "../../../../game/index.ts";
import { disciplineName, techName } from "../../../i18n/content.ts";
import { useT } from "../../../i18n/I18nProvider.tsx";
import type { Translator } from "../../../i18n/translator.ts";
import { OptionCard } from "../../../kit/OptionCard.tsx";
import { OptionGroup } from "../../../kit/OptionGroup.tsx";
import { FormNote, useRuleErrorText } from "../pieces.tsx";
import { RulesDetail } from "../../../rules/RulesDetail.tsx";
import type { GuildHallAction, GuildHallDraft, GuildHallOptions } from "./GuildHall.draft.ts";
import type { LocationEditorProps } from "./editor.ts";
import { amountText } from "./shared.ts";

export type GuildHallProps = LocationEditorProps<GuildHallDraft, GuildHallAction, GuildHallOptions>;

/** The discipline swatch of a Tech (colour plus the discipline's name in text, never colour alone). */
export function DisciplineSwatch({ discipline }: { discipline: TechDiscipline }) {
  return <span className="b4-disc" data-discipline={discipline} aria-hidden="true" />;
}

/** "3 Coins", or "3 Coins → 2 Coins" after the Shifu's discount. */
export function techPriceText(option: Pick<GuildTechOption, "printedCost" | "price">, t: Translator): string {
  const price = amountText(t, "coins", option.price);
  return option.price === option.printedCost ? price : t("work.gh.printedAndPrice", { printed: amountText(t, "coins", option.printedCost), price });
}

/** A Tech's reason in the current language, with its discipline and Coins for the template. */
export function techReasonDetails(option: GuildTechOption): { code: NonNullable<GuildTechOption["reason"]>; details: Record<string, string | number> } | null {
  if (option.reason === null) return null;
  return { code: option.reason, details: { techId: option.techId, discipline: option.discipline, resource: "coins" } };
}

export function GuildHall({ draft, options, dispatch }: GuildHallProps) {
  const t = useT();
  const errorText = useRuleErrorText();
  const guild = options.guild;
  const techOf = (value: string): TechId | undefined => guild.faceUp.find((tech) => tech.techId === value)?.techId;
  const reasonOf = (tech: GuildTechOption): string | undefined => {
    const reason = techReasonDetails(tech);
    return reason === null ? undefined : errorText(reason);
  };
  if (options.mode === "buy") {
    return (
      <div className="b4-sub" data-location="guild_hall">
        <OptionGroup
          legend={t("work.gh.buy")}
          name="techId"
          value={draft.techId}
          onChange={(value) => {
            const techId = techOf(value);
            if (techId !== undefined) dispatch({ type: "tech", techId });
          }}
        >
          {guild.faceUp.map((tech) => (
            <OptionCard
              key={tech.techId}
              value={tech.techId}
              title={techName(tech.techId, t.locale)}
              leading={<DisciplineSwatch discipline={tech.discipline} />}
              meta={techPriceText(tech, t)}
              description={disciplineName(tech.discipline, t.locale)}
              disabled={!tech.legal}
              reason={reasonOf(tech)}
            >
              <RulesDetail subject={{ kind: "tech", id: tech.techId }} />
            </OptionCard>
          ))}
        </OptionGroup>
      </div>
    );
  }
  return (
    <div className="b4-sub" data-location="guild_hall">
      <OptionGroup
        legend={t("work.gh.inspect")}
        name="discipline"
        value={draft.discipline}
        onChange={(value) => {
          const discipline = guild.inspect.find((entry) => entry.discipline === value)?.discipline;
          if (discipline !== undefined) dispatch({ type: "discipline", discipline });
        }}
      >
        {guild.inspect.map((entry) => (
          <OptionCard
            key={entry.discipline}
            value={entry.discipline}
            title={disciplineName(entry.discipline, t.locale)}
            leading={<DisciplineSwatch discipline={entry.discipline} />}
            meta={t("work.gh.deckN", { n: entry.deckCount })}
          />
        ))}
      </OptionGroup>
      {guild.faceUp.length === 0 ? null : (
        <div className="b4-sub-block">
          <FormNote>{t("work.gh.faceUpLater")}</FormNote>
          <ul className="b4-techs">
            {guild.faceUp.map((tech) => (
              <li key={tech.techId} className="b4-tech" data-legal={tech.legal ? "true" : "false"}>
                <span className="b4-row">
                  <DisciplineSwatch discipline={tech.discipline} />
                  <strong>{techName(tech.techId, t.locale)}</strong>
                  <span className="num">{techPriceText(tech, t)}</span>
                </span>
                {tech.legal ? null : <span className="b4-tech-reason">{reasonOf(tech)}</span>}
                <RulesDetail subject={{ kind: "tech", id: tech.techId }} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
