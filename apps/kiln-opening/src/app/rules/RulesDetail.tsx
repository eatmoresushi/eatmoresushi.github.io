/**
 * RulesDetail: the one rules-details panel of owner decision D10 (UI_V1.6.1_ARCHITECTURE K15).
 * Owner: B6. It replaces the four package copies (B2 `table/`, B3 `kiln/`, B4 `decision/work/`,
 * B5 `decision/orders/`), so every Tech tile, Kiln Player Board, location, Order card and
 * Imperial Recognition milestone shows the same details wherever it appears.
 *
 * The kit's `PieceDetail` disclosure: click, tap or keyboard focus on the trigger opens it;
 * Escape or an outside click closes it; the open panel lives in the kit's body-level layer, so no
 * column or table clips it. The trigger is either the visible piece itself (a Tech tile, an Order
 * card, a location heading) or, beside a form option, a small "Full rules" button or the
 * component's name (always outside the option's `<label>`, §8.1).
 *
 * Also shared: `ShortText` (a data short text with its timing clause in bold), `OrderReward`
 * (an Order's printed reward) and `LocationSummaries` (a location's one-line summaries).
 *
 * The panel shows only (owner review, 2026-10-17, narrowing D10):
 * 1. the full rule word for word (the data's `ability`, location, Order or milestone text);
 * 2. the clarifications for this component, as plain text. No card text or card facts (the card
 *    already shows them), no source labels; the clarifications themselves leave out general rules
 *    and interactions this component can never meet.
 *
 * Rules reference only: no advice, odds or previews (D3, D4). Every text comes from content
 * through `i18n/content.ts` or the `rules` catalogue; nothing here decides a rule.
 */
import { Fragment } from "react";
import type { ReactNode } from "react";
import { shortTextSegments } from "../../game/index.ts";
import type { KilnId, LocationId, OrderId, Recognition, TechId, WorkerEffect } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import {
  RECOGNITION_MAX,
  RULE_NUMBERS,
  kilnText,
  locationEffectText,
  locationName,
  locationSummaryKey,
  orderFacts,
  orderRequirements,
  overflowClarifications,
  recognitionMilestones,
  rulesClarifications,
  techText,
  workerKindName,
} from "../i18n/content.ts";
import type { ClarificationText } from "../i18n/content.ts";
import { orderQualityLine } from "../i18n/orderText.ts";
import type { Translator } from "../i18n/translator.ts";
import { PieceDetail } from "../kit/PieceDetail.tsx";
import { CrownIcon } from "../pieces/CrownIcon.tsx";
import "./RulesDetail.css";

/** The component whose rules details are shown. */
export type RulesSubject =
  | { readonly kind: "tech"; readonly id: TechId }
  | { readonly kind: "kiln"; readonly id: KilnId }
  | { readonly kind: "location"; readonly id: LocationId }
  /** One milestone; the top one also carries the clarifications of Crowns beyond it. */
  | { readonly kind: "recognition"; readonly space: Recognition }
  /** The whole Imperial Recognition track: every milestone and the reward beyond it. */
  | { readonly kind: "recognitionTrack" }
  /** Crowns beyond the top of the track (the top milestone and its overflow clarifications). */
  | { readonly kind: "recognitionOverflow" }
  | { readonly kind: "order"; readonly id: OrderId };

export interface RulesDetailProps {
  subject: RulesSubject;
  /** The visible piece (phrasing content only: it sits inside the trigger button). */
  trigger?: ReactNode;
  /**
   * Without a `trigger`: `"button"` (default) shows a small "Full rules" button named
   * "Full rules: ⟨name⟩"; `"name"` shows the component's name as the trigger.
   */
  look?: "button" | "name";
  /** Where a given trigger's accessible name comes from (default: its own words). */
  name?: "trigger" | "label";
  /** The panel title, when the caller names the component differently (a score row). */
  title?: string;
  className?: string;
  motion?: string;
  motionKey?: string;
}

const EFFECTS: readonly WorkerEffect[] = ["apprentice", "shifu"];

// ── Shared pieces ─────────────────────────────────────────────────────────────────────────

/** A data short text with its timing clause and secondary labels in bold. */
export function ShortText({ text }: { text: string }) {
  return (
    <>
      {shortTextSegments(text).map((segment, index) => (segment.emphasis ? <strong key={index}>{segment.text}</strong> : <Fragment key={index}>{segment.text}</Fragment>))}
    </>
  );
}

/** "4 VP · 3 Coins · 1 Crown". */
export function orderRewardText(orderId: OrderId, t: Translator): string {
  const facts = orderFacts(orderId);
  const parts = [t("common.vpN", { n: facts.vp }), t("common.amount.coins", { n: facts.coins })];
  if (facts.crowns > 0) parts.push(t("common.piece.crowns", { n: facts.crowns }));
  return parts.join(" · ");
}

/**
 * An Order's printed reward beside a form option or on a card: VP, Coins and Crowns (glossary
 * §1.3, §5.1 order). One component for every package (it replaced B4's and B5's copies).
 */
export function OrderReward({ orderId }: { orderId: OrderId }) {
  const t = useT();
  const facts = orderFacts(orderId);
  return (
    <span className="order-reward">
      <span className="num">{t("common.vpN", { n: facts.vp })}</span>
      <span className="num">{t("common.amount.coins", { n: facts.coins })}</span>
      {facts.crowns > 0 ? <CrownIcon count={facts.crowns} /> : null}
    </span>
  );
}

/** "Order O33" / "委托O33". */
export function orderName(orderId: OrderId, t: Translator): string {
  return t("rules.order.name", { id: orderId });
}

function milestoneName(space: Recognition, t: Translator): string {
  const milestone = recognitionMilestones(t.locale).find((entry) => entry.space === space);
  return t("rules.milestone.name", { n: space, title: milestone?.title ?? "" });
}

/** "Apprentice: Gain 3 Clay/Wood" lines (rulebook Appendix E / glossary §4 short column). */
export function LocationSummaries({ locationId }: { locationId: LocationId }) {
  const t = useT();
  return (
    <>
      {EFFECTS.map((effect) => (
        <span key={effect} className="rd-line">
          {t.rich("rules.location.effect", { worker: workerKindName(effect, t.locale), text: t(locationSummaryKey(locationId, effect)) })}
        </span>
      ))}
    </>
  );
}

// ── Content per subject ───────────────────────────────────────────────────────────────────

interface RulesBody {
  name: string;
  rules: ReactNode[];
  clarifications: ClarificationText[];
}

function bodyOf(subject: RulesSubject, t: Translator): RulesBody {
  const locale = t.locale;
  switch (subject.kind) {
    case "tech": {
      const text = techText(subject.id, locale);
      return { name: text.name, rules: [text.ability], clarifications: rulesClarifications(subject, locale) };
    }
    case "kiln": {
      const text = kilnText(subject.id, locale);
      return {
        name: t("rules.kiln.name", { kiln: text.name, ability: text.abilityName }),
        rules: [text.ability],
        clarifications: rulesClarifications(subject, locale),
      };
    }
    case "location":
      return {
        name: locationName(subject.id, locale),
        rules: EFFECTS.map((effect) => t.rich("rules.location.effect", { worker: workerKindName(effect, locale), text: locationEffectText(subject.id, effect, locale) })),
        clarifications: rulesClarifications(subject, locale),
      };
    case "recognition": {
      const milestone = recognitionMilestones(locale).find((entry) => entry.space === subject.space);
      return {
        name: milestoneName(subject.space, t),
        rules: milestone === undefined || milestone.reward === null ? [] : [milestone.reward],
        clarifications: rulesClarifications(subject, locale),
      };
    }
    case "recognitionTrack": {
      const milestones = recognitionMilestones(locale);
      return {
        name: t("rules.track.name"),
        rules: [
          ...milestones.flatMap((milestone) => (milestone.reward === null ? [] : [t.rich("rules.track.milestone", { n: milestone.space, title: milestone.title, reward: milestone.reward })])),
          t("rules.track.overflow", { vp: RULE_NUMBERS.overflowVpPerCrown }),
        ],
        clarifications: overflowClarifications(locale),
      };
    }
    case "recognitionOverflow": {
      const top = recognitionMilestones(locale).find((entry) => entry.space === RECOGNITION_MAX);
      return {
        name: milestoneName(RECOGNITION_MAX, t),
        rules: [...(top === undefined || top.reward === null ? [] : [top.reward]), t("rules.track.overflow", { vp: RULE_NUMBERS.overflowVpPerCrown })],
        clarifications: overflowClarifications(locale),
      };
    }
    case "order":
      return {
        name: orderName(subject.id, t),
        rules: [orderRequirements(subject.id, locale), orderQualityLine(subject.id, t)],
        clarifications: rulesClarifications(subject, locale),
      };
  }
}

// ── The panel ─────────────────────────────────────────────────────────────────────────────

/** The panel body: the full rule, then the clarifications as plain text. */
function Body({ body, kind }: { body: RulesBody; kind: RulesSubject["kind"] }) {
  const t = useT();
  return (
    <div className="rd" data-rules-detail="" data-rules={kind}>
      {body.rules.length === 0 ? null : (
        <div className="rd-sec">
          <p className="rd-h">{t("rules.fullRule")}</p>
          {body.rules.map((paragraph, index) => (
            <p key={index} className="rd-rule">{paragraph}</p>
          ))}
        </div>
      )}
      {body.clarifications.length === 0 ? null : (
        <div className="rd-sec">
          <p className="rd-h">{t("rules.clarifications")}</p>
          <ul className="rd-clar">
            {body.clarifications.map((item, index) => (
              <li key={index}>
                <span className="rd-clar-text">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The name a subject's trigger and panel use, in the current language. */
export function rulesSubjectName(subject: RulesSubject, t: Translator): string {
  switch (subject.kind) {
    case "tech":
      return techText(subject.id, t.locale).name;
    case "kiln": {
      const text = kilnText(subject.id, t.locale);
      return t("rules.kiln.name", { kiln: text.name, ability: text.abilityName });
    }
    case "location":
      return locationName(subject.id, t.locale);
    case "recognition":
      return milestoneName(subject.space, t);
    case "recognitionTrack":
      return t("rules.track.name");
    case "recognitionOverflow":
      return milestoneName(RECOGNITION_MAX, t);
    case "order":
      return orderName(subject.id, t);
  }
}

export function RulesDetail({ subject, trigger, look = "button", name, title, className, motion, motionKey }: RulesDetailProps) {
  const t = useT();
  const body = bodyOf(subject, t);
  const heading = title ?? body.name;
  let shown: ReactNode = trigger;
  let nameFrom: "trigger" | "label" = name ?? "trigger";
  let variant = "rd-piece";
  if (trigger === undefined && look === "button") {
    shown = (
      <span className="rd-button">
        <span className="rd-button-icon" aria-hidden="true">i</span>
        <span aria-hidden="true">{t("rules.button")}</span>
      </span>
    );
    nameFrom = "label";
    variant = "rd-piece rd-piece--button";
  } else if (trigger === undefined) {
    shown = <span className="rd-name">{heading}</span>;
    variant = "rd-piece rd-piece--name";
  }
  return (
    <PieceDetail
      label={t("rules.label", { name: heading })}
      title={heading}
      trigger={shown}
      name={nameFrom}
      hover={false}
      size="wide"
      className={[variant, className ?? ""].filter((part) => part !== "").join(" ")}
      {...(motion === undefined ? {} : { motion })}
      {...(motionKey === undefined ? {} : { motionKey })}
    >
      <Body body={body} kind={subject.kind} />
    </PieceDetail>
  );
}
