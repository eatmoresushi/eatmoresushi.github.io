/**
 * TechSlots (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `techSlots`.
 *
 * The three Tech slots of a Kiln Player Board, one per discipline (D11 names): the owned Tech as
 * printed — its name, its state this round (Ready / Used this round for a once-per-round Tech,
 * else Ongoing) and its short text with the timing clause in bold, like the Tech display
 * (`TechShort`) — or an empty slot. The tile is not a control: it opens no rules details (owner
 * review, 2026-10-17); the card text is on it.
 */
import type { CSSProperties } from "react";
import type { PlayerId } from "../../game/index.ts";
import { DISCIPLINES } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { disciplineName, techName } from "../i18n/content.ts";
import { Chip } from "../kit/Chip.tsx";
import { useGame } from "../state/hooks.ts";
import { DISCIPLINE_COLOUR, TechShort } from "../table/TechCard.tsx";
import { summaryOf } from "../table/tableData.ts";
import "./TechSlots.css";

export interface TechSlotsProps {
  /** Whose Techs. */
  playerId: PlayerId;
}

export function TechSlots({ playerId }: TechSlotsProps) {
  const t = useT();
  const model = useGame();
  const summary = summaryOf(model, playerId);
  if (summary === null) return null;
  return (
    <ul className="tslots" aria-label={t("boards.techSlots.title")}>
      {DISCIPLINES.map((discipline) => {
        const owned = summary.techs.find((tech) => tech.discipline === discipline) ?? null;
        const style = { "--dc": DISCIPLINE_COLOUR[discipline] } as CSSProperties;
        const disc = disciplineName(discipline, t.locale);
        if (owned === null) {
          return (
            <li key={discipline} className="tslot tslot--empty" style={style} data-discipline={discipline}>
              <span className="tslot-disc" aria-hidden="true">{disc}</span>
              <span aria-hidden="true">{t("boards.techSlots.empty")}</span>
              <span className="sr-only">{t("boards.techSlots.emptyLabel", { discipline: disc })}</span>
            </li>
          );
        }
        const state = owned.oncePerRound ? (owned.ready ? t("common.status.ready") : t("common.status.usedThisRound")) : t("common.status.ongoing");
        return (
          <li key={discipline} className="tslot" style={style} data-discipline={discipline} data-tech-id={owned.techId}>
            <span className="tslot-disc">{disc}</span>
            <span className="tslot-t1">
              <strong className="tslot-name">{techName(owned.techId, t.locale)}</strong>
              <Chip tone={!owned.oncePerRound ? "neutral" : owned.ready ? "ok" : "used"}>{state}</Chip>
            </span>
            <TechShort techId={owned.techId} />
          </li>
        );
      })}
    </ul>
  );
}
