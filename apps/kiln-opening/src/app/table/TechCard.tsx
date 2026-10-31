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
 *   (`data-act="tech"`, `aria-pressed`) that chooses it for the pane's Guild Hall placement (an
 *   Apprentice's purchase) or for the Shifu's next take after inspecting, and opens no rules
 *   details. Its price is the printed cost (v1.6.2 L236–237: no discount). A Tech this worker
 *   cannot take (`legal: false`: its cost, a discipline already owned, the Tech limit — whatever
 *   the engine says) is greyed out, stays focusable with `aria-disabled`, ignores activation and
 *   shows the engine's reason (`aria-describedby`).
 *
 * Also exported, so every Tech tile reads the same (owner review, 2026-10-17):
 * - `TechOption`: the same tile as one native radio of a kit `OptionGroup` (the Shifu's Guild Hall
 *   inspection). It is named by the Tech's name and price and described by its discipline and
 *   short text; an unavailable one is greyed out like the chooser's (its timing clause still
 *   bold), stays focusable with `aria-disabled`, ignores the change and shows its reason. It opens
 *   no rules details. Its radio mark sits beside the face, so the face's title row can wrap.
 * - `TechShort`: a Tech's printed short text with its timing clause in bold (the owned Tech on a
 *   Kiln Player Board's Tech slot).
 */
import { useId } from "react";
import type { ChangeEvent, CSSProperties, ReactNode } from "react";
import type { TechDiscipline, TechId } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { disciplineName, techFacts, techText } from "../i18n/content.ts";
import { useOptionGroup } from "../kit/OptionGroup.tsx";
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
  /** Present while the Tech display is the Guild Hall chooser (buy and take modes). */
  choice?: TechChoice;
}

/** The discipline's colour token (`--d-*`). */
export const DISCIPLINE_COLOUR: Readonly<Record<TechDiscipline, string>> = {
  workshop: "var(--d-workshop)",
  glazing_loading: "var(--d-glazing)",
  firing: "var(--d-firing)",
};

/** A Tech's printed short text, its timing clause in bold (the Tech display's look). */
export function TechShort({ techId, id }: { techId: TechId; id?: string | undefined }) {
  const t = useT();
  return (
    <span id={id} className="tech-short">
      <ShortText text={techText(techId, t.locale).short} />
    </span>
  );
}

interface FaceIds {
  name?: string;
  price?: string;
  discipline?: string;
  short?: string;
}

/** The ids of a face's parts under one `useId()` base. */
function faceIds(base: string): Required<FaceIds> {
  return { name: `${base}-name`, price: `${base}-price`, discipline: `${base}-disc`, short: `${base}-short` };
}

interface TechFaceProps {
  techId: TechId;
  /** The cost line: the printed cost. */
  cost: ReactNode;
  /** Element ids, for a control that names itself from parts of the face. */
  ids?: FaceIds;
  /** Name the discipline under the title (a list that mixes disciplines). */
  discipline?: boolean;
}

/**
 * The printed face: name and cost, then (optionally) the discipline, then the short text. The
 * title row wraps: when the cost would squeeze the name below a readable width (a narrow tile, a
 * large text size), the cost moves under the name instead of breaking it mid-word.
 */
function TechFace({ techId, cost, ids = {}, discipline = false }: TechFaceProps) {
  const t = useT();
  const text = techText(techId, t.locale);
  return (
    <span className="tech-face">
      <span className="tech-t1">
        <span id={ids.name} className="tech-name">{text.name}</span>
        <span id={ids.price} className="tech-cost">{cost}</span>
      </span>
      {discipline ? (
        <span id={ids.discipline} className="tech-disc">{disciplineName(techFacts(techId).discipline, t.locale)}</span>
      ) : null}
      <TechShort techId={techId} id={ids.short} />
    </span>
  );
}

export function TechCard({ techId, choice }: TechCardProps) {
  const t = useT();
  const ids = useId();
  const facts = techFacts(techId);
  const colour = DISCIPLINE_COLOUR[facts.discipline];
  if (choice !== undefined) {
    const { target, reason } = choice;
    const price = t("common.amount.coins", { n: target.cost });
    const face = faceIds(ids);
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
          aria-labelledby={`${face.name} ${face.price}`}
          aria-describedby={reason === null ? face.short : `${reasonId} ${face.short}`}
          onClick={() => {
            if (target.legal) choice.onChoose();
          }}
        >
          <TechFace techId={techId} cost={price} ids={face} />
        </button>
        {reason === null ? null : (
          <p id={reasonId} className="tech-why">{reason}</p>
        )}
      </div>
    );
  }
  return (
    <div className="tech" data-tech-id={techId} style={{ "--dc": colour } as CSSProperties}>
      <RulesDetail subject={{ kind: "tech", id: techId }} trigger={<TechFace techId={techId} cost={t("common.amount.coins", { n: facts.cost })} />} className="tech-detail" />
    </div>
  );
}

export interface TechOptionProps {
  /** The Tech offered; also the radio's `value` (test-driver contract, §9.6). */
  techId: TechId;
  /** The price in words: the printed cost ("3 Coins"). */
  price: string;
  /** Unavailable: `aria-disabled`, still focusable, change ignored. */
  disabled?: boolean;
  /** Why it is unavailable, in words; shown and linked with `aria-describedby`. */
  reason?: string | null;
}

/**
 * One Tech as a radio of the surrounding kit `OptionGroup` (its `name`, selection and
 * `onChange`), drawn as the Tech display's tile.
 */
export function TechOption({ techId, price, disabled = false, reason = null }: TechOptionProps) {
  const group = useOptionGroup();
  const ids = useId();
  const checked = group?.isChecked(techId) ?? false;
  const colour = DISCIPLINE_COLOUR[techFacts(techId).discipline];
  const face = faceIds(ids);
  const reasonId = `${ids}-why`;
  const describedBy = [reason === null ? null : reasonId, face.discipline, face.short].filter((part) => part !== null).join(" ");
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    group?.onChange(techId, event.currentTarget.checked);
  };
  const classes = ["tech", "tech--option", checked ? "tech--chosen" : "", disabled ? "tech--unavailable" : ""].filter((part) => part !== "").join(" ");
  return (
    <div className={classes} data-tech-id={techId} style={{ "--dc": colour } as CSSProperties}>
      <label className="tech-pick">
        <input
          className="tech-radio"
          type="radio"
          name={group?.name ?? ""}
          value={techId}
          checked={checked}
          onChange={onChange}
          aria-disabled={disabled ? true : undefined}
          aria-labelledby={`${face.name} ${face.price}`}
          aria-describedby={describedBy}
        />
        {/* The radio mark sits beside the face, outside its wrapping title row. */}
        <span className="tech-mark" aria-hidden="true" />
        <TechFace techId={techId} cost={price} ids={face} discipline />
      </label>
      {reason === null ? null : (
        <p id={reasonId} className="tech-why">{reason}</p>
      )}
    </div>
  );
}
