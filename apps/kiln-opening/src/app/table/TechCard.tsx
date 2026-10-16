/**
 * TechCard (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `techCard`: one Tech tile with its rules details (D10).
 *
 * The face-up tile as printed: name, cost and short text (timing clause in bold), coloured by
 * discipline. The whole tile is the trigger of its rules details: full ability, the Tech's
 * clarifications and its facts (discipline, cost, once per round, the space it adds, 1 VP when
 * gained under amendment A1). Missing Tech illustrations render as this text-only tile (§1.4).
 */
import type { CSSProperties } from "react";
import type { TechDiscipline, TechId } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { techText } from "../i18n/content.ts";
import { techFacts } from "../i18n/content.ts";
import { RulesDetail, ShortText } from "../rules/RulesDetail.tsx";
import "./TechCard.css";

export interface TechCardProps {
  /** The Tech shown. */
  techId: TechId;
}

/** The discipline's colour token (`--d-*`). */
export const DISCIPLINE_COLOUR: Readonly<Record<TechDiscipline, string>> = {
  workshop: "var(--d-workshop)",
  glazing_loading: "var(--d-glazing)",
  firing: "var(--d-firing)",
};

export function TechCard({ techId }: TechCardProps) {
  const t = useT();
  const text = techText(techId, t.locale);
  const facts = techFacts(techId);
  const face = (
    <span className="tech-face">
      <span className="tech-t1">
        <span className="tech-name">{text.name}</span>
        <span className="tech-cost">{t("common.amount.coins", { n: facts.cost })}</span>
      </span>
      <span className="tech-short"><ShortText text={text.short} /></span>
    </span>
  );
  return (
    <div className="tech" data-tech-id={techId} style={{ "--dc": DISCIPLINE_COLOUR[facts.discipline] } as CSSProperties}>
      <RulesDetail subject={{ kind: "tech", id: techId }} trigger={face} className="tech-detail" />
    </div>
  );
}
