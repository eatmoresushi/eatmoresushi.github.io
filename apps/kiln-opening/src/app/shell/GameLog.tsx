/**
 * GameLog (UI_V1.6.1_ARCHITECTURE §4.1, §8.1, §8.3; owner decision D5). Owner: B1.
 * Source: wireframe `logbtn` / `logpanel`, `logList`.
 *
 * The game log is a dropdown at every width (D5), not a tab or section: a disclosure button
 * (`aria-expanded`, `aria-controls`) over a panel with an `<ol>`, newest first. It renders the
 * newest `LOG_PAGE` entries and a **Show earlier** button that adds the next page. Escape closes
 * it and returns focus to the button; so does a press outside it.
 *
 * Lines come from the event templates (`i18n/events.ts`): public history, plus this seat's own
 * secret version of an event (its deal, its looks, its trimmed Orders), marked "only you". A
 * secret is used only when it belongs to the viewer (`ownSecretOf`). Ceramics are described in
 * words (D9), each as it was when its line happened (`ceramicViewsAsOf`): a Crackle marker or a
 * twin that came later never changes an earlier line. A line that only repeats the line beside
 * it is folded away (`foldedEntry`): an Order reward's Coins after the completion, Canal Barge's
 * after "used Canal Barge: +2 Coins", Guan's after "used Imperial Patronage: +1 VP, +2 Coins", a
 * sale's after "sold … for 2 Coins", a Guild Hall payment before "acquired …: pay 3 Coins", Ding's
 * cost before its vessel's line (which states it), Jun's Wood, and a Ding, Jun or Ge "used
 * ⟨ability⟩" beside the line that names that ability.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useT } from "../i18n/I18nProvider.tsx";
import { eventText, foldedEntry, ownSecretOf } from "../i18n/events.ts";
import { Chip } from "../kit/Chip.tsx";
import { useGame, useLog, useUi } from "../state/hooks.ts";
import { ceramicViewsAsOf, logCeramicView } from "./logCeramics.ts";
import "./GameLog.css";

/** Entries rendered at once; "Show earlier" adds this many more. */
export const LOG_PAGE = 50;

const LOG_ICON = (
  <svg className="game-log-icon" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
    <path d="M3 2.5h8M3 5.5h8M3 8.5h8M3 11.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
  </svg>
);

export function GameLog() {
  const t = useT();
  const model = useGame();
  const { log } = useLog();
  const ui = useUi();
  const id = useId();
  const panelId = `${id}-log`;
  const titleId = `${id}-log-title`;
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [pages, setPages] = useState(1);
  const open = ui.logOpen;

  const view = logCeramicView(model, log);
  const shownCount = Math.min(log.length, pages * LOG_PAGE);
  const entries = useMemo(() => {
    if (!open) return [];
    const start = log.length - shownCount;
    const shown = log.slice(start).filter((_entry, index) => !foldedEntry(log, start + index));
    // Each line names its ceramics as they were when it happened (`ceramicViewsAsOf`).
    const views = ceramicViewsAsOf(model, log, new Set(shown.map((entry) => entry.sequence)));
    return shown
      .reverse()
      .map((entry) => ({
        sequence: entry.sequence,
        text: eventText(entry, { t, view: views.get(entry.sequence) ?? view, viewerId: model.viewerId }),
        own: ownSecretOf(entry, model.viewerId) !== null,
      }));
  }, [open, log, shownCount, t, view, model]);
  const hasEarlier = shownCount < log.length;

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) ui.setLogOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, ui]);

  const close = () => {
    ui.setLogOpen(false);
    buttonRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !open) return;
    event.stopPropagation();
    close();
  };

  const showEarlier = () => {
    const next = pages + 1;
    setPages(next);
    // The button disappears once everything is shown; keep focus inside the panel.
    if (next * LOG_PAGE >= log.length) titleRef.current?.focus();
  };

  return (
    <div ref={rootRef} className="game-log" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className="game-log-button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t("shell.log.buttonLabel")}
        onClick={() => ui.setLogOpen(!open)}
      >
        {LOG_ICON}
        <span className="game-log-button-text">{t("shell.log.button")}</span>
        <span className="game-log-caret" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>
      <div id={panelId} className="game-log-panel" role="region" aria-labelledby={titleId} hidden={!open}>
        <h3 ref={titleRef} id={titleId} className="game-log-title" tabIndex={-1}>
          {t("shell.log.title")} <span className="game-log-order">{t("shell.log.newest")}</span>
        </h3>
        {open ? (
          entries.length === 0 ? (
            <p className="game-log-empty">{t("shell.log.empty")}</p>
          ) : (
            <ol className="game-log-list" aria-labelledby={titleId}>
              {entries.map((entry) => (
                <li key={entry.sequence} className="game-log-entry" data-own={entry.own ? "" : undefined}>
                  <span className="game-log-text">{entry.text}</span>
                  {entry.own ? <Chip tone="private">{t("shell.log.private")}</Chip> : null}
                </li>
              ))}
            </ol>
          )
        ) : null}
        {open && hasEarlier ? (
          <button type="button" className="game-log-earlier" onClick={showEarlier}>
            {t("shell.log.showEarlier")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
