/**
 * TechDisplay (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `techDisplay`: `board.techDisplay` per discipline with deck counts.
 *
 * The face-up Techs of each discipline (Form & Decorate, Glazing & Loading, Firing; D11 names
 * from content), with the public size of each Tech deck. An empty column says so. Every tile
 * opens its rules details (D10). A pending Guild Hall Shifu inspection (`counts.pendingLook`,
 * public) says who is looking at how many Techs, never which.
 *
 * **The Guild Hall chooser** (owner review, 2026-10-17). While the pane's draft places a worker at
 * the Guild Hall, the display is where that choice is made (`useTableSelection().techChooser`,
 * from `guildOptions` through the work draft):
 * - a prompt names the placement; it is the focus target the Place shortcut moves to
 *   (`data-tech-chooser`), and it labels the display as a group;
 * - **buy** (the Apprentice effect): every face-up Tech is a toggle button (`data-act="tech"`);
 *   one this worker cannot buy is greyed out, not selectable, with the engine's reason;
 * - **inspect** (the Shifu effect): each discipline offers its "Inspect the deck" toggle
 *   (`data-act="inspect"`); the tiles stay ordinary display tiles with their rules details, and
 *   the private inspection itself is its own window;
 * - **take** (that window, `guild_inspection`): the face-up Techs are toggles again, as in buy
 *   mode, for the Shifu's first take and for the second (v1.6.2 L207: another discipline, at its
 *   printed cost, or stop in the pane). The inspected Techs are private and only in the pane
 *   (B2), and the "is looking at" line is not shown to the looker (the pane addresses them).
 *   Once both takes are made no Tech can be taken: the window offers no chooser and the display
 *   is an ordinary display again while the looker orders the returning Techs in the pane.
 * A choice goes back to the pane's draft (`act`); on phones the decision sheet then opens with
 * the chosen placement and Confirm.
 *
 * **A taken Tech's position stays empty** until the taker's turn ends (v1.6.2 L209): a column
 * showing fewer than its face-up count draws as many empty positions as the refill will fill —
 * as many as its deck holds, counting the inspected Techs an open Guild Hall inspection will put
 * back under it first (`returning`, B2) — as dashed placeholders. It is the table's own fact (an
 * empty spot on the board); the engine refills it at the end of the turn.
 */
import { useId } from "react";
import type { CSSProperties } from "react";
import { useT } from "../i18n/I18nProvider.tsx";
import { RULE_NUMBERS, disciplineName, locationName } from "../i18n/content.ts";
import { errorTextOptions, ruleErrorText } from "../i18n/errors.ts";
import { useGame, useTableSelection, useUi } from "../state/hooks.ts";
import { TECH_CHOOSER_ATTRIBUTE } from "../state/tableSelection.ts";
import { placementWorkerName } from "./LocationCard.tsx";
import { tableCeramics } from "./tableData.ts";
import { DISCIPLINE_COLOUR, TechCard } from "./TechCard.tsx";
import "./TechDisplay.css";

/** The chooser's prompt per mode (the second take has its own). */
const PROMPT = {
  buy: "table.techs.chooseBuy",
  inspect: "table.techs.chooseInspect",
  take: "table.techs.chooseTake",
  takeSecond: "table.techs.chooseTakeSecond",
} as const;

export function TechDisplay() {
  const t = useT();
  const model = useGame();
  const selection = useTableSelection();
  const ui = useUi();
  const promptId = useId();
  const display = model.board.techDisplay;
  const pending = model.board.counts.pendingLook;
  const look = pending !== null && pending.kind === "guild_inspection" ? pending : null;
  const looker = look === null ? null : model.players.find((summary) => summary.playerId === look.playerId) ?? null;
  const chooser = selection.techChooser;
  const errorOptions = chooser === null ? null : errorTextOptions(tableCeramics(model).labelView, t);
  const prompt =
    chooser === null
      ? null
      : t(PROMPT[chooser.mode === "take" && chooser.taken > 0 ? "takeSecond" : chooser.mode], {
          location: locationName("guild_hall", t.locale),
          worker: placementWorkerName(chooser.worker, t),
        });
  // The viewer's own inspection: the pane and the prompt say it all (the line is for the other players).
  const showLook = look !== null && looker !== null && look.playerId !== model.viewerId && chooser?.mode !== "take";
  return (
    <div className={chooser === null ? "techs-block" : "techs-block techs-block--choosing"} data-chooser={chooser?.mode}>
      <div className="techs-h">
        <h3>{t("table.techs.title")}</h3>
        <span className="techs-meta">
          {t("table.techs.sub", { n: RULE_NUMBERS.techsFaceUp, guild: locationName("guild_hall", t.locale), vp: RULE_NUMBERS.techVp })}
        </span>
      </div>
      {!showLook || look === null || looker === null ? null : (
        <p className="techs-looking" data-player-id={look.playerId}>
          {t("table.techs.looking", { name: looker.displayName, n: look.count })}
        </p>
      )}
      {prompt === null ? null : (
        <p id={promptId} className="techs-choose" tabIndex={-1} {...{ [TECH_CHOOSER_ATTRIBUTE]: "" }}>
          {prompt}
        </p>
      )}
      <div className="techs" {...(prompt === null ? {} : { role: "group", "aria-labelledby": promptId })}>
        {display.map((column) => {
          const inspect = chooser?.disciplines.get(column.discipline);
          const name = disciplineName(column.discipline, t.locale);
          // The empty positions the end-of-turn refill will fill (v1.6.2 L209, B2).
          const refilling = Math.min(Math.max(0, RULE_NUMBERS.techsFaceUp - column.techIds.length), column.deckCount + column.returning);
          return (
            <div key={column.discipline} className="disc" data-discipline={column.discipline} style={{ "--dc": DISCIPLINE_COLOUR[column.discipline] } as CSSProperties}>
              <div className="disc-h">
                <h4 className="disc-name">{name}</h4>
                <span className="num">{t("table.techs.deck", { n: column.deckCount })}</span>
              </div>
              {inspect === undefined ? null : (
                <button
                  type="button"
                  className="disc-inspect"
                  data-act="inspect"
                  data-discipline={column.discipline}
                  aria-pressed={inspect.pressed}
                  aria-label={t("table.techs.inspectLabel", { discipline: name })}
                  onClick={() => {
                    selection.act({ type: "inspect", discipline: column.discipline });
                    ui.placeShortcut();
                  }}
                >
                  {t("table.techs.inspect")}
                </button>
              )}
              {column.techIds.length === 0 && refilling === 0 ? (
                <p className="disc-none">{t("table.techs.none")}</p>
              ) : (
                <ul className="disc-list">
                  {column.techIds.map((techId) => {
                    const target = chooser?.techs.get(techId);
                    return (
                      <li key={techId}>
                        {target === undefined || errorOptions === null ? (
                          <TechCard techId={techId} />
                        ) : (
                          <TechCard
                            techId={techId}
                            choice={{
                              target,
                              reason: target.legal || target.reason === null ? null : ruleErrorText(target.reason, t, errorOptions),
                              onChoose: () => {
                                selection.act({ type: "tech", techId });
                                ui.placeShortcut();
                              },
                            }}
                          />
                        )}
                      </li>
                    );
                  })}
                  {Array.from({ length: refilling }, (_, index) => (
                    <li key={`empty-${index}`} className="disc-empty" data-empty-position="">
                      {t("table.techs.emptySlot")}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
