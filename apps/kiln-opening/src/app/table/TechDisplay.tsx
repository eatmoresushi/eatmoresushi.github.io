/**
 * TechDisplay (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `techDisplay`: `board.techDisplay` per discipline with deck counts.
 *
 * The face-up Techs of each discipline (Form & Decorate, Glazing & Loading, Firing; D11 names
 * from content), with the public size of each Tech deck. An empty column says so. Every tile
 * opens its rules details (D10). A pending Guild Hall Shifu inspection (`counts.pendingLook`,
 * public) says who is looking at how many Techs, never which.
 */
import type { CSSProperties } from "react";
import { useT } from "../i18n/I18nProvider.tsx";
import { RULE_NUMBERS, disciplineName, locationName } from "../i18n/content.ts";
import { useGame } from "../state/hooks.ts";
import { DISCIPLINE_COLOUR, TechCard } from "./TechCard.tsx";
import "./TechDisplay.css";

export function TechDisplay() {
  const t = useT();
  const model = useGame();
  const display = model.board.techDisplay;
  const pending = model.board.counts.pendingLook;
  const look = pending !== null && pending.kind === "guild_inspection" ? pending : null;
  const looker = look === null ? null : model.players.find((summary) => summary.playerId === look.playerId) ?? null;
  return (
    <div className="techs-block">
      <div className="techs-h">
        <h3>{t("table.techs.title")}</h3>
        <span className="techs-meta">
          {t("table.techs.sub", { n: RULE_NUMBERS.techsFaceUp, guild: locationName("guild_hall", t.locale), vp: RULE_NUMBERS.techVp })}
        </span>
      </div>
      {look === null || looker === null ? null : (
        <p className="techs-looking" data-player-id={look.playerId}>
          {t("table.techs.looking", { name: looker.displayName, n: look.count })}
        </p>
      )}
      <div className="techs">
        {display.map((column) => (
          <div key={column.discipline} className="disc" data-discipline={column.discipline} style={{ "--dc": DISCIPLINE_COLOUR[column.discipline] } as CSSProperties}>
            <div className="disc-h">
              <h4 className="disc-name">{disciplineName(column.discipline, t.locale)}</h4>
              <span className="num">{t("table.techs.deck", { n: column.deckCount })}</span>
            </div>
            {column.techIds.length === 0 ? (
              <p className="disc-none">{t("table.techs.none")}</p>
            ) : (
              <ul className="disc-list">
                {column.techIds.map((techId) => (
                  <li key={techId}>
                    <TechCard techId={techId} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
