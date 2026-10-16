/**
 * RulesDetail: the one rules-details panel of owner decision D10 (UI_V1.6.1_ARCHITECTURE K15).
 * Owner: B6. It replaces the four package copies (B2 `table/`, B3 `kiln/`, B4 `decision/work/`,
 * B5 `decision/orders/`), so every Tech tile, Kiln Player Board, location, Order card and
 * Imperial Recognition milestone shows the same details wherever it appears.
 *
 * The kit's `PieceDetail` disclosure: click, tap or keyboard focus on the trigger opens it;
 * Escape or an outside click closes it; the open panel lives in the kit's body-level layer, so no
 * column or table clips it. The trigger is either the visible piece itself (a Tech tile, an Order
 * card, a location heading) or, beside a form option, a small "Rules" button or the component's
 * name (always outside the option's `<label>`, §8.1).
 *
 * Also shared: `ShortText` (a data short text with its timing clause in bold), `OrderReward`
 * (an Order's printed reward) and `LocationSummaries` (a location's one-line summaries).
 *
 * The panel shows, in order:
 * 1. the short component text, its timing clause and secondary labels in bold
 *    (`shortTextSegments`), or a location's one-line summaries;
 * 2. card facts (discipline, cost, once per round, the space a Tech adds, the VP it scores when
 *    gained; who owns it and whether it is used this round; capacity; reward);
 * 3. the full rule word for word (the data's `ability`, location, Order or milestone text);
 * 4. the clarifications that apply to this component only, each with its source label.
 *
 * Rules reference only: no advice, odds or previews (D3, D4). Every text comes from content
 * through `i18n/content.ts` or the `rules` catalogue; nothing here decides a rule.
 */
import { Fragment } from "react";
import type { ReactNode } from "react";
import { clarificationSourceKind, shortTextSegments } from "../../game/index.ts";
import type { ClarificationSourceKind, KilnId, LocationId, OrderId, PlayerId, PlayerSummary, Recognition, TechId, WorkerEffect } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import {
  RECOGNITION_MAX,
  RULE_NUMBERS,
  disciplineName,
  kilnFacts,
  kilnText,
  locationEffectText,
  locationFacts,
  locationName,
  locationSummaryKey,
  orderFacts,
  orderRequirements,
  overflowClarifications,
  recognitionMilestones,
  rulesClarifications,
  techFacts,
  techText,
  workerKindName,
} from "../i18n/content.ts";
import type { ClarificationText } from "../i18n/content.ts";
import { list, num } from "../i18n/format.ts";
import { orderQualityLine } from "../i18n/orderText.ts";
import type { Translator } from "../i18n/translator.ts";
import { PieceDetail } from "../kit/PieceDetail.tsx";
import { CrownIcon } from "../pieces/CrownIcon.tsx";
import { useGame } from "../state/hooks.ts";
import type { GameModel } from "../state/model.ts";
import { rulebookSection } from "./rulebookSections.ts";
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

/** One card fact: a label and its value. */
export interface RulesFact {
  readonly label: string;
  readonly value: ReactNode;
}

export interface RulesDetailProps {
  subject: RulesSubject;
  /** The visible piece (phrasing content only: it sits inside the trigger button). */
  trigger?: ReactNode;
  /**
   * Without a `trigger`: `"button"` (default) shows a small "Rules" button named "Rules: ⟨name⟩";
   * `"name"` shows the component's name as the trigger.
   */
  look?: "button" | "name";
  /** Where a given trigger's accessible name comes from (default: its own words). */
  name?: "trigger" | "label";
  /**
   * A Tech or Kiln: whose card this is, adding its owner and whether it is used this round.
   * Omitted: the viewer, when they own it. `null`: nobody.
   */
  ownerId?: PlayerId | null;
  /** The panel title, when the caller names the component differently (a score row). */
  title?: string;
  /** Facts about this component right now ("You pay 2 Coins"). */
  extraFacts?: readonly RulesFact[];
  className?: string;
  motion?: string;
  motionKey?: string;
}

const EFFECTS: readonly WorkerEffect[] = ["apprentice", "shifu"];

// ── Short text and source labels ──────────────────────────────────────────────────────────

/** A data short text with its timing clause and secondary labels in bold. */
export function ShortText({ text }: { text: string }) {
  return (
    <>
      {shortTextSegments(text).map((segment, index) => (segment.emphasis ? <strong key={index}>{segment.text}</strong> : <Fragment key={index}>{segment.text}</Fragment>))}
    </>
  );
}

/**
 * The tag as printed after its kind label. A rulebook line (`L140`, `ED L652`) is a line of the
 * Markdown source that no player can look up, so it prints as the name of the rulebook section it
 * sits in (`rules/rulebookSections.ts`): "“Materials Yard”" / "「泥柴场」". Other tags print as
 * themselves ("R4", "A1", "D7"), an interpretation as its name ("INT Decorator's Kit" →
 * "Decorator's Kit").
 */
function tagText(tag: string, kind: ClarificationSourceKind, t: Translator): string {
  if (kind === "rulebook" || kind === "editorial") {
    const match = /L(\d+)$/.exec(tag);
    if (match === null) return tag;
    const section = rulebookSection(Number(match[1]));
    const name = section === null ? t("rules.source.titlePage") : t.locale === "en" ? section.en : section.zh;
    return t("rules.source.section", { name });
  }
  if (kind === "interpretation") return tag.replace(/^INT /, "");
  return tag;
}

function kindOf(tag: string): ClarificationSourceKind {
  try {
    return clarificationSourceKind(tag);
  } catch {
    // Content is validated at load (`validateContentFiles`); an unknown tag still reads as rulebook text.
    return "rulebook";
  }
}

function groupLabel(kind: ClarificationSourceKind, tags: readonly string[], t: Translator): string {
  const joined = list(tags, t.locale);
  switch (kind) {
    case "rulebook":
      return t("rules.source.rulebook", { tags: joined });
    case "amendment":
      return t("rules.source.amendment", { tags: joined });
    case "ruling":
      return t("rules.source.ruling", { tags: joined });
    case "editorial":
      return t("rules.source.editorial", { tags: joined });
    case "provisional":
      return t("rules.source.provisional", { tags: joined });
    case "wording":
      return t("rules.source.wording", { tags: joined });
    case "interpretation":
      // The interpretation's name is the English heading in the audit; Chinese shows the kind only.
      return t.locale === "en" ? t("rules.source.interpretationNamed", { name: joined }) : t("rules.source.interpretation");
  }
}

/**
 * A clarification's source label, per the clarifications doc's "Source tags" table. Consecutive
 * tags of one kind are grouped, and two lines of one section name it once: "L376 · L212 · D7" →
 * "Rulebook “Advanced Tech Rules”, “Workshop Development” · Wording D7" /
 * "规则书「技艺规则」、「作坊发展」 · 措辞D7". No line number reaches the player.
 */
export function clarificationSourceLabel(tags: readonly string[], t: Translator): string {
  const groups: Array<{ kind: ClarificationSourceKind; tags: string[] }> = [];
  for (const tag of tags) {
    const kind = kindOf(tag);
    const text = tagText(tag, kind, t);
    const last = groups[groups.length - 1];
    if (last !== undefined && last.kind === kind) {
      if (!last.tags.includes(text)) last.tags.push(text);
    } else groups.push({ kind, tags: [text] });
  }
  return groups.map((group) => groupLabel(group.kind, group.tags, t)).join(" · ");
}

// ── Content per subject ───────────────────────────────────────────────────────────────────

interface RulesBody {
  name: string;
  short: ReactNode | null;
  facts: RulesFact[];
  rules: ReactNode[];
  clarifications: ClarificationText[];
}

function readyText(ready: boolean, t: Translator): string {
  return ready ? t("common.status.ready") : t("common.status.usedThisRound");
}

/** The owner of a Tech or Kiln card: the named player, or the viewer when they own it. */
function ownerOf(model: GameModel, ownerId: PlayerId | null | undefined, owns: (summary: PlayerSummary) => boolean): PlayerSummary | null {
  if (ownerId === null) return null;
  const candidate = ownerId === undefined ? model.me : model.players.find((summary) => summary.playerId === ownerId) ?? null;
  return candidate !== null && owns(candidate) ? candidate : null;
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

function bodyOf(subject: RulesSubject, model: GameModel, ownerId: PlayerId | null | undefined, t: Translator): RulesBody {
  const locale = t.locale;
  const live = model.finalResult === null;
  switch (subject.kind) {
    case "tech": {
      const text = techText(subject.id, locale);
      const facts = techFacts(subject.id);
      const rows: RulesFact[] = [
        { label: t("rules.fact.discipline"), value: disciplineName(facts.discipline, locale) },
        { label: t("rules.fact.cost"), value: t("common.amount.coins", { n: facts.cost }) },
      ];
      if (facts.oncePerRound) rows.push({ label: t("rules.fact.use"), value: t("rules.fact.oncePerRound") });
      if (facts.adds !== null) rows.push({ label: t("rules.fact.adds"), value: t("rules.fact.addsSpace", { location: locationName(facts.adds, locale) }) });
      rows.push({ label: t("rules.fact.vp"), value: t("rules.fact.vpWhenGained", { n: RULE_NUMBERS.techVp }) });
      const owner = ownerOf(model, ownerId, (summary) => summary.techs.some((tech) => tech.techId === subject.id));
      if (owner !== null) {
        rows.push({ label: t("rules.fact.owner"), value: owner.displayName });
        const status = owner.techs.find((tech) => tech.techId === subject.id);
        if (status !== undefined && status.oncePerRound && live) rows.push({ label: t("rules.fact.thisRound"), value: readyText(status.ready, t) });
      }
      return { name: text.name, short: <ShortText text={text.short} />, facts: rows, rules: [text.ability], clarifications: rulesClarifications(subject, locale) };
    }
    case "kiln": {
      const text = kilnText(subject.id, locale);
      const oncePerRound = kilnFacts(subject.id).oncePerRound;
      const rows: RulesFact[] = [{ label: t("rules.fact.ability"), value: text.abilityName }];
      if (oncePerRound) rows.push({ label: t("rules.fact.use"), value: t("rules.fact.oncePerRound") });
      const owner = ownerOf(model, ownerId, (summary) => summary.kilnId === subject.id);
      if (owner !== null) {
        rows.push({ label: t("rules.fact.owner"), value: owner.displayName });
        if (oncePerRound && live) rows.push({ label: t("rules.fact.thisRound"), value: readyText(owner.kilnAbilityReady, t) });
      }
      return {
        name: t("rules.kiln.name", { kiln: text.name, ability: text.abilityName }),
        short: <ShortText text={text.short} />,
        facts: rows,
        rules: [text.ability],
        clarifications: rulesClarifications(subject, locale),
      };
    }
    case "location": {
      const players = model.players.length;
      const facts = locationFacts(subject.id, players);
      const rows: RulesFact[] = [{ label: t("rules.fact.location"), value: facts.scope === "central" ? t("rules.fact.central") : t("rules.fact.personal") }];
      if (facts.scope === "central") {
        rows.push({ label: t("rules.fact.capacity", { players }), value: facts.capacity === null ? t("rules.fact.noLimit") : t("rules.fact.spaces", { n: facts.capacity }) });
      } else {
        rows.push({ label: t("rules.fact.use"), value: t("rules.fact.eachSpace") });
      }
      const usable = facts.usableAtRecognition;
      if (usable !== null && usable.length > 0) {
        rows.push({ label: t("rules.fact.recognition"), value: t("rules.fact.recognitionOnly", { from: Math.min(...usable), to: Math.max(...usable) }) });
      }
      return {
        name: locationName(subject.id, locale),
        short: <LocationSummaries locationId={subject.id} />,
        facts: rows,
        rules: EFFECTS.map((effect) => t.rich("rules.location.effect", { worker: workerKindName(effect, locale), text: locationEffectText(subject.id, effect, locale) })),
        clarifications: rulesClarifications(subject, locale),
      };
    }
    case "recognition": {
      const milestone = recognitionMilestones(locale).find((entry) => entry.space === subject.space);
      const here = model.players.filter((summary) => summary.recognition === subject.space).map((summary) => summary.displayName);
      return {
        name: milestoneName(subject.space, t),
        short: null,
        facts: [
          { label: t("rules.fact.recognition"), value: num(subject.space) },
          { label: t("rules.fact.here"), value: here.length === 0 ? t("rules.fact.nobody") : list(here, locale) },
        ],
        rules: milestone === undefined || milestone.reward === null ? [] : [milestone.reward],
        clarifications: rulesClarifications(subject, locale),
      };
    }
    case "recognitionTrack": {
      const milestones = recognitionMilestones(locale);
      const first = milestones[0]?.space ?? 0;
      return {
        name: t("rules.track.name"),
        short: null,
        facts: [{ label: t("rules.fact.track"), value: t("rules.fact.trackRange", { from: first, to: RECOGNITION_MAX }) }],
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
        short: null,
        facts: [{ label: t("rules.fact.recognition"), value: num(RECOGNITION_MAX) }],
        rules: [...(top === undefined || top.reward === null ? [] : [top.reward]), t("rules.track.overflow", { vp: RULE_NUMBERS.overflowVpPerCrown })],
        clarifications: overflowClarifications(locale),
      };
    }
    case "order": {
      const facts = orderFacts(subject.id);
      return {
        name: orderName(subject.id, t),
        short: null,
        facts: [
          { label: t("rules.fact.kind"), value: t(`rules.order.kind.${facts.kind}`) },
          { label: t("rules.fact.reward"), value: orderRewardText(subject.id, t) },
        ],
        rules: [orderRequirements(subject.id, locale), orderQualityLine(subject.id, t)],
        clarifications: rulesClarifications(subject, locale),
      };
    }
  }
}

// ── The panel ─────────────────────────────────────────────────────────────────────────────

/** The panel body: short text, card facts, full rule, clarifications with their sources. */
function Body({ body, kind }: { body: RulesBody; kind: RulesSubject["kind"] }) {
  const t = useT();
  return (
    <div className="rd" data-rules-detail="" data-rules={kind}>
      {body.short === null ? null : (
        <div className="rd-sec rd-sec--short">
          <p className="rd-h">{t("rules.cardText")}</p>
          <p className="rd-short">{body.short}</p>
        </div>
      )}
      {body.facts.length === 0 ? null : (
        <div className="rd-sec">
          <p className="rd-h">{t("rules.facts")}</p>
          <dl className="rd-facts">
            {body.facts.map((fact, index) => (
              <div key={`${fact.label}-${index}`} className="rd-fact">
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
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
                <span className="rd-src">{t("rules.source", { source: clarificationSourceLabel(item.tags, t) })}</span>
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

export function RulesDetail({ subject, trigger, look = "button", name, ownerId, title, extraFacts = [], className, motion, motionKey }: RulesDetailProps) {
  const t = useT();
  const model = useGame();
  const body = bodyOf(subject, model, ownerId, t);
  const facts = extraFacts.length === 0 ? body : { ...body, facts: [...body.facts, ...extraFacts] };
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
      <Body body={facts} kind={subject.kind} />
    </PieceDetail>
  );
}
