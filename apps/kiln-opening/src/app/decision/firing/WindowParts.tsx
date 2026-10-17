/**
 * Small presentational parts shared by B5's decision windows (UI_V1.6.1_ARCHITECTURE §4.2;
 * wireframe `promptBlock`, `.dstep`, `queueRow`, `submitRow`, `cchip`). Owner: B5.
 *
 * They render only what they are given (names, IDs resolved to words, engine verdicts); none
 * decides a rule. Ceramics are described in words (owner decision D9), never by ID.
 */
import type { CSSProperties, ReactNode } from "react";
import type { CeramicId, PlayerId } from "../../../game/index.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { ceramicLabel } from "../../i18n/ceramicLabel.ts";
import type { CeramicFacts } from "../../i18n/ceramicLabel.ts";
import type { Translator } from "../../i18n/translator.ts";
import { CeramicChip } from "../../pieces/CeramicChip.tsx";
import type { EngineView, GameModel } from "../../state/model.ts";
import { firingCeramicFacts, nameOf, seatOf } from "./firingSupport.ts";
import "./WindowParts.css";

/** The window's lead: a step label and one or two sentences (wireframe `promptBlock`). */
export function Lead({ step, children }: { step?: ReactNode; children?: ReactNode }) {
  return (
    <div className="dw-lead">
      {step === undefined ? null : <p className="dw-lead-step">{step}</p>}
      {children === undefined || children === null ? null : <p className="dw-lead-text">{children}</p>}
    </div>
  );
}

/** One titled block of a form (wireframe `.dstep`), for content that is not an option group. */
export function Section({ heading, aside, children, className }: { heading: ReactNode; aside?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section className={["dw-sec", className ?? ""].filter((part) => part !== "").join(" ")}>
      <h3 className="dw-sec-heading">
        <span>{heading}</span>
        {aside === undefined ? null : <span className="dw-sec-aside">{aside}</span>}
      </h3>
      {children}
    </section>
  );
}

/** A short note under a group (rule reminders, who sees what). */
export function Note({ children, tone = "muted" }: { children?: ReactNode; tone?: "muted" | "private" }) {
  return <p className={`dw-note dw-note--${tone}`}>{children}</p>;
}

/**
 * Card text with its timing clause and secondary labels in bold (`shortTextSegments`: the text
 * up to the first ":" / "：", and "Ongoing:", "Orders:", 持续：, 完成委托时：). The shared rules
 * component (B6), re-exported for B5's windows.
 */
export { ShortText } from "../../rules/RulesDetail.tsx";

export type QueueStatus = "now" | "done" | "next";

/** A queue of players with their state (wireframe `queueRow` / `submitRow`): names, never IDs. */
export function PlayerQueue({ model, entries, label }: { model: GameModel; entries: readonly { playerId: PlayerId; status: QueueStatus; statusText: string }[]; label: string }) {
  const t = useT();
  return (
    <ol className="dw-queue" aria-label={label}>
      {entries.map((entry) => {
        const name = nameOf(model, entry.playerId);
        const style = { "--pc": `var(--seat-${seatOf(model, entry.playerId)})` } as CSSProperties;
        return (
          <li key={entry.playerId} className={`dw-queue-item dw-queue-item--${entry.status}`} style={style} data-player-id={entry.playerId}>
            <span className="dw-queue-swatch" aria-hidden="true" />
            <span>{t("firing.queueEntry", { name: entry.playerId === model.viewerId ? t("common.nameYou", { name }) : name, status: entry.statusText })}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** The step's queue (`firingStageView.queue`, First Player order), as the table shows it. */
export function StepQueue({ model }: { model: GameModel }) {
  const t = useT();
  const queue = model.firingStage?.queue ?? null;
  if (queue === null) return null;
  const entries = queue.actorIds.map((playerId, index) => {
    const status: QueueStatus = index === queue.index ? "now" : index < queue.index ? "done" : "next";
    const statusText = status === "now" ? t("firing.queueNow") : status === "done" ? t("firing.queueDone") : t("firing.queueNext");
    return { playerId, status, statusText };
  });
  return <PlayerQueue model={model} entries={entries} label={t("firing.queue")} />;
}

export interface CeramicLineProps {
  model: GameModel;
  engine: EngineView;
  ceramicId: CeramicId;
  /** Always name the place ("in High 2"); default only when two would read the same. */
  withPlace?: boolean | "auto";
  /** Ceramics shown alongside, for telling two apart (default: every undelivered ceramic). */
  among?: readonly CeramicId[];
  size?: number;
  highlighted?: boolean;
  /** Extra words after the name (a status, a reason). */
  extra?: ReactNode;
}

/** A ceramic as a chip plus its description in words (wireframe `prow` with `cchip`). */
export function CeramicLine({ model, engine, ceramicId, withPlace = "auto", among, size = 34, highlighted = false, extra }: CeramicLineProps) {
  const t = useT();
  const facts = firingCeramicFacts(engine.view, model.firingStage, ceramicId);
  if (facts === null) return null;
  const amongFacts = among === undefined ? undefined : among.map((id) => firingCeramicFacts(engine.view, model.firingStage, id)).filter((item): item is CeramicFacts => item !== null);
  const label = ceramicLabel(facts, engine.view, { locale: t, withOwner: facts.ownerId !== model.viewerId, withPlace, ...(amongFacts === undefined ? {} : { among: amongFacts }) });
  const base = engine.view.game.ceramics[ceramicId];
  const marker = base !== undefined && base.stage === "loaded" ? base.heatMarker : null;
  return (
    <span className="dw-ceramic" data-ceramic-id={ceramicId}>
      <CeramicChip ceramic={facts} seat={seatOf(model, facts.ownerId)} label={label} marker={marker} size={size} highlighted={highlighted} showQuality motionKey={null} />
      <span className="dw-ceramic-text">
        {/* The chip already names the ceramic for assistive technology; the extra words are read. */}
        <span className="dw-ceramic-name" aria-hidden="true">{label}</span>
        {extra === undefined ? null : <span className="dw-ceramic-extra">{extra}</span>}
      </span>
    </span>
  );
}

/** "Firing step 5, in First Player order" from `firingStageView` (null outside a firing). */
export function stepLabel(model: GameModel, t: Translator): string | undefined {
  const stage = model.firingStage;
  if (stage === null) return undefined;
  return stage.firstPlayerOrder.includes(stage.step) ? t("firing.stepAndOrder", { n: stage.step }) : t("firing.step", { n: stage.step });
}
