/**
 * TechCard (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `techCard`: one Tech tile with its rules details (D10).
 *
 * The face-up tile as printed: name, cost and short text (timing clause in bold), coloured by
 * discipline. Missing Tech illustrations render as this text-only tile (§1.4).
 *
 * - **On display** the whole tile is the trigger of its rules details: the full ability and the
 *   Tech's clarifications.
 * - **As the Guild Hall chooser** (`choice`, owner review 2026-10-17) the tile is a toggle button
 *   (`data-act="tech"`, `aria-pressed`) that chooses it for the pane's Guild Hall placement, and
 *   opens no rules details. A Tech this worker cannot buy (`legal: false`: its cost, a discipline
 *   already owned, the Tech limit — whatever the engine says) is greyed out, stays focusable with
 *   `aria-disabled`, ignores activation and shows the engine's reason (`aria-describedby`).
 */
import { useId } from "react";
import type { CSSProperties } from "react";
import type { TechDiscipline, TechId } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { techFacts, techText } from "../i18n/content.ts";
import { RulesDetail, ShortText } from "../rules/RulesDetail.tsx";
import type { TechTarget } from "../state/tableSelection.ts";
import "./TechCard.css";

/** The tile as a Guild Hall choice: its target and the reason in words when it is not legal. */
export interface TechChoice {
  target: TechTarget;
  /** The engine's reason in the current language, or null when legal. */
  reason: string | null;
  onChoose: () => void;
}

export interface TechCardProps {
  /** The Tech shown. */
  techId: TechId;
  /** Present while the Tech display is the Guild Hall chooser (buy mode). */
  choice?: TechChoice;
}

/** The discipline's colour token (`--d-*`). */
export const DISCIPLINE_COLOUR: Readonly<Record<TechDiscipline, string>> = {
  workshop: "var(--d-workshop)",
  glazing_loading: "var(--d-glazing)",
  firing: "var(--d-firing)",
};

export function TechCard({ techId, choice }: TechCardProps) {
  const t = useT();
  const ids = useId();
  const text = techText(techId, t.locale);
  const facts = techFacts(techId);
  const colour = DISCIPLINE_COLOUR[facts.discipline];
  if (choice !== undefined) {
    const { target, reason } = choice;
    const cost = t("common.amount.coins", { n: target.price });
    const price = target.price === target.printedCost ? cost : t("table.techs.price", { printed: t("common.amount.coins", { n: target.printedCost }), price: cost });
    const nameId = `${ids}-name`;
    const priceId = `${ids}-price`;
    const shortId = `${ids}-short`;
    const reasonId = `${ids}-why`;
    const classes = ["tech", "tech--choice", target.pressed ? "tech--chosen" : "", target.legal ? "" : "tech--unavailable"].filter((part) => part !== "").join(" ");
    return (
      <div className={classes} data-tech-id={techId} style={{ "--dc": colour } as CSSProperties}>
        <button
          type="button"
          className="tech-pick"
          data-act="tech"
          data-tech-id={techId}
          aria-pressed={target.pressed}
          aria-disabled={target.legal ? undefined : true}
          aria-labelledby={`${nameId} ${priceId}`}
          aria-describedby={reason === null ? shortId : `${reasonId} ${shortId}`}
          onClick={() => {
            if (target.legal) choice.onChoose();
          }}
        >
          <span className="tech-face">
            <span className="tech-t1">
              <span id={nameId} className="tech-name">{text.name}</span>
              <span id={priceId} className="tech-cost">{price}</span>
            </span>
            <span id={shortId} className="tech-short"><ShortText text={text.short} /></span>
          </span>
        </button>
        {reason === null ? null : (
          <p id={reasonId} className="tech-why">{reason}</p>
        )}
      </div>
    );
  }
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
    <div className="tech" data-tech-id={techId} style={{ "--dc": colour } as CSSProperties}>
      <RulesDetail subject={{ kind: "tech", id: techId }} trigger={face} className="tech-detail" />
    </div>
  );
}
