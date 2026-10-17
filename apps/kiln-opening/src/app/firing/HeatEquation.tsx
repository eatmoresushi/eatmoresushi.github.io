/**
 * HeatEquation (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B3 (kiln, firing stage, results, playtest).
 * Source: wireframe `equation`: Kiln Die + Contributions = Base Heat; Base Heat + Fire = Global Heat; the R7 extra Fire card.
 *
 * Owner decision D3: the equation shows exactly what the table shows, as it becomes known:
 * - the Kiln Die (public every round);
 * - the Contributions: who has chosen while they are secret, then each revealed card, its
 *   modifier and the Wood paid (Fuel Ledger's extra Wood included); none when nobody has a
 *   ceramic in the Shared Kiln;
 * - Base Heat (0–5) once revealed, the Fire card once turned, Global Heat;
 * - while the R7 window is open, Second Firing's extra Fire card with its ceramic;
 * - the open Fire discard (D4).
 * No Actual Heat, previews, ladders or odds. Values not yet known read "?" with words for
 * assistive technology. One line in a wide stage; two lines in a narrow one (Base Heat repeated,
 * decoratively, at the start of the second line).
 */
import type { ReactNode } from "react";
import type { FiringStageView } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { KILN_TECHS } from "../i18n/catalog/kiln.ts";
import { RULE_NUMBERS, contributionCardName, techName } from "../i18n/content.ts";
import { num, signed } from "../i18n/format.ts";
import { kilnCeramicLabel } from "../kiln/KilnCeramic.tsx";
import { RulesDetail } from "../rules/RulesDetail.tsx";
import { playerLabel, seatOf } from "../kiln/names.ts";
import { useTableCeramics } from "../kiln/tableCeramics.ts";
import { FireCard } from "../pieces/FireCard.tsx";
import { KilnDie } from "../pieces/KilnDie.tsx";
import { useGame } from "../state/hooks.ts";
import { FireDiscard } from "./FireDiscard.tsx";
import { seatVar } from "../kiln/cssVars.ts";
import "./HeatEquation.css";

export interface HeatEquationProps {
  /** The firing shown. */
  stage: FiringStageView;
}

function Term({ label, className, hidden = false, children }: { label: string; className?: string; hidden?: boolean; children: ReactNode }) {
  return (
    <div className={["eq-term", className ?? ""].filter((part) => part !== "").join(" ")} aria-hidden={hidden ? true : undefined}>
      <span className="eq-lab">{label}</span>
      {children}
    </div>
  );
}

function Op({ children }: { children: string }) {
  return (
    <span className="eq-op" aria-hidden="true">
      {children}
    </span>
  );
}

/** A heat value, or "?" with words while it is not known yet. */
export function HeatValue({ value }: { value: number | null }) {
  const t = useT();
  if (value === null) {
    return (
      <b className="eq-val eq-val--unknown">
        <span aria-hidden="true">{t("kiln.eq.unknown")}</span>
        <span className="sr-only">{t("kiln.eq.unknownLabel")}</span>
      </b>
    );
  }
  return <b className="eq-val num">{num(value)}</b>;
}

function Contributions({ stage }: { stage: FiringStageView }) {
  const t = useT();
  const model = useGame();
  if (stage.contributions.length === 0) return <p className="eq-none">{t("kiln.eq.noContributions")}</p>;
  const submitted = new Set(stage.submittedPlayerIds);
  return (
    <ul className="eq-contribs">
      {stage.contributions.map((entry) => {
        const name = playerLabel(model, t, entry.playerId);
        const style = seatVar(seatOf(model, entry.playerId));
        const revealed = entry.revealed;
        if (revealed === null) {
          const chosen = submitted.has(entry.playerId);
          return (
            <li key={entry.playerId} className={chosen ? "eq-cc" : "eq-cc eq-cc--wait"} style={style}>
              {chosen ? t.rich("kiln.eq.submitted", { name }) : t.rich("kiln.eq.choosing", { name })}
            </li>
          );
        }
        const card = contributionCardName(revealed.card, t.locale);
        const heat = signed(revealed.heat);
        return (
          <li key={entry.playerId} className="eq-cc" style={style} data-contribution={revealed.card}>
            {revealed.woodPaid > 0
              ? t.rich("kiln.eq.contributionWood", { name, card, heat, wood: t("common.amount.wood", { n: revealed.woodPaid }) })
              : t.rich("kiln.eq.contribution", { name, card, heat })}
          </li>
        );
      })}
    </ul>
  );
}

export function HeatEquation({ stage }: HeatEquationProps) {
  const t = useT();
  const ceramics = useTableCeramics();
  const anyHidden = stage.contributions.some((entry) => entry.revealed === null);
  const contributionsLabel = stage.contributions.length === 0
    ? t("kiln.eq.contributionsNone")
    : anyHidden
      ? t("kiln.eq.contributionsHidden")
      : t("kiln.eq.contributions");
  const baseLabel = t("kiln.eq.baseHeat", { min: RULE_NUMBERS.baseHeatMin, max: RULE_NUMBERS.baseHeatMax });
  const extra = stage.extraFire;
  const secondFiring = techName(KILN_TECHS.secondFiring, t.locale);
  return (
    <div className="eq" role="group" aria-label={t("kiln.eq.label")}>
      <div className="eq-row">
        <div className="eq-line eq-line--base">
          <Term label={t("kiln.eq.kilnDie")}>
            <KilnDie value={stage.kilnDie} size="lg" />
          </Term>
          <Op>{t("kiln.eq.plus")}</Op>
          <Term label={contributionsLabel} className="eq-term--contrib">
            <Contributions stage={stage} />
          </Term>
          <Op>{t("kiln.eq.equals")}</Op>
          <Term label={baseLabel} className="eq-term--key">
            <HeatValue value={stage.baseHeat} />
          </Term>
        </div>
        <div className="eq-line eq-line--global">
          <Term label={t("kiln.eq.baseHeatShort")} className="eq-term--key eq-term--repeat" hidden>
            <HeatValue value={stage.baseHeat} />
          </Term>
          <Op>{t("kiln.eq.plus")}</Op>
          <Term label={t("kiln.eq.fire")}>
            <FireCard value={stage.fireModifier} size="lg" motionKey="fire:round" />
          </Term>
          <Op>{t("kiln.eq.equals")}</Op>
          <Term label={t("kiln.eq.globalHeat")} className="eq-term--key eq-term--global">
            <HeatValue value={stage.globalHeat} />
          </Term>
        </div>
        <div className="eq-discard">
          <FireDiscard discard={stage.fireDiscard} />
        </div>
      </div>
      {extra === null ? null : (
        <div className="eq-extra" data-extra-fire="">
          <RulesDetail
            subject={{ kind: "tech", id: KILN_TECHS.secondFiring }}
            trigger={<span className="eq-extra-text">{t("kiln.eq.extraFire", { tech: secondFiring, ceramic: kilnCeramicLabel(ceramics, extra.ceramicId, extra.playerId, t) })}</span>}
          />
          <FireCard value={extra.modifier} size="lg" motionKey="fire:second" />
        </div>
      )}
    </div>
  );
}
