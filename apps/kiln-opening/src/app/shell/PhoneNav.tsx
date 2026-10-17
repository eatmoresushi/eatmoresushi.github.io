/**
 * PhoneNav (UI_V1.6.1_ARCHITECTURE §4.1, §8.1; owner decision D5). Owner: B1.
 * Source: wireframe `tabBar`, `badges`, `ICONS`.
 *
 * Table / Kiln / Workshop / Orders. It is **not** a tablist (one tab shows several sections):
 * a `<nav aria-label="Sections">` of plain buttons, `aria-current="page"` on the current one.
 * Shown below 900px (a bottom bar) and in short landscape (a left rail); hidden on wider screens,
 * where the jump bar does the same job.
 *
 * Badges point at where the decision is, from the model and the table selection only:
 * - work turn: Table, the locations open to the worker being placed (Place shortcuts);
 *   Workshop, the shaped vessels;
 * - a firing decision or the Setter's Mark: Kiln, "!";
 * - Orders: the Orders being looked at, the completable Orders in the Order Phase, the number to
 *   discard at Cleanup, else the Orders in hand.
 * Each badge's meaning is part of the button's accessible name, never colour alone.
 */
import type { ReactElement } from "react";
import { useT } from "../i18n/I18nProvider.tsx";
import type { MessageParam, RichMessage } from "../i18n/translator.ts";
import { msg } from "../i18n/translator.ts";
import { num } from "../i18n/format.ts";
import { useGame, useTableSelection, useUi } from "../state/hooks.ts";
import type { GameModel } from "../state/model.ts";
import type { TableSelection } from "../state/tableSelection.ts";
import { PHONE_SECTIONS } from "../state/uiStore.ts";
import type { PhoneSection } from "../state/uiStore.ts";
import { TAB_LABEL } from "./sections.ts";
import "./PhoneNav.css";

export interface NavBadge {
  /** What the badge shows. */
  shown: RichMessage | string;
  /** Its meaning, added to the button's name. */
  meaning: RichMessage;
  /** A soft badge is information; a strong one says "your decision is here". */
  soft: boolean;
}

const KILN_WINDOWS = new Set(["setters_mark", "contributions", "test_pieces", "heat_markers", "jun", "after_quality", "second_firing", "salvage"]);

/** The badges for the current window (wireframe `badges`). Pure; exported for tests. */
export function navBadges(model: GameModel, table: Pick<TableSelection, "placeTargets" | "orderTargets">): Partial<Record<PhoneSection, NavBadge>> {
  const badges: Partial<Record<PhoneSection, NavBadge>> = {};
  const window = model.window;
  const acting = model.viewerActs;
  const count = (n: number): string => num(n);
  if (acting && window.kind === "work") {
    // `placeTargets` lists every entry, legal or not (CR B2-3): count locations with a legal one.
    const open = [...table.placeTargets.values()].filter((workers) => workers.some((worker) => worker.legal)).length;
    if (open > 0) badges.table = { shown: count(open), meaning: msg("shell.nav.badge.open", { n: open }), soft: true };
    const shaped = model.me?.shapedCeramicIds.length ?? 0;
    if (shaped > 0) badges.workshop = { shown: count(shaped), meaning: msg("shell.nav.badge.shaped", { n: shaped }), soft: true };
  }
  if (acting && KILN_WINDOWS.has(window.kind)) badges.kiln = { shown: msg("shell.nav.badge.mark"), meaning: msg("shell.nav.badge.decide"), soft: false };
  const status = model.viewerId === null ? undefined : model.handLimits[model.viewerId];
  if (acting && (window.kind === "commission" || window.kind === "colour_samples" || window.kind === "colour_samples_swap") && model.look !== null) {
    const n = model.look.orderIds.length;
    badges.orders = { shown: count(n), meaning: msg("shell.nav.badge.look", { n }), soft: false };
  } else if (acting && window.kind === "orders") {
    const n = [...table.orderTargets.values()].filter((target) => target.state === "completable" || target.state === "chosen").length;
    badges.orders = { shown: count(n), meaning: msg("shell.nav.badge.completable", { n }), soft: n === 0 };
  } else if (acting && window.kind === "hand_limit" && status !== undefined) {
    badges.orders = { shown: msg("shell.nav.badge.minus", { n: status.mustDiscard }), meaning: msg("shell.nav.badge.discard", { n: status.mustDiscard }), soft: false };
  } else if (model.me !== null) {
    const n = model.hand.length;
    badges.orders = { shown: count(n), meaning: msg("shell.nav.badge.held", { n }), soft: true };
  }
  return badges;
}

const ICONS: Readonly<Record<PhoneSection, ReactElement>> = {
  table: (
    <svg className="phone-nav-icon" viewBox="0 0 22 18" aria-hidden="true" focusable="false">
      <rect x="1.5" y="1.5" width="8" height="6.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="12.5" y="1.5" width="8" height="6.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="1.5" y="10" width="8" height="6.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="12.5" y="10" width="8" height="6.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  kiln: (
    <svg className="phone-nav-icon" viewBox="0 0 22 18" aria-hidden="true" focusable="false">
      <path d="M3 16.5V9a8 7 0 0 1 16 0v7.5z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.5 16.5v-3a2.5 2.5 0 0 1 5 0v3" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  workshop: (
    <svg className="phone-nav-icon" viewBox="0 0 22 18" aria-hidden="true" focusable="false">
      <path d="M7 2h8M8 2c0 3-3 4-3 8a6 5 0 0 0 12 0c0-4-3-5-3-8" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  orders: (
    <svg className="phone-nav-icon" viewBox="0 0 22 18" aria-hidden="true" focusable="false">
      <rect x="4" y="1.5" width="11" height="15" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M15 4.5h2.5v12H7" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6.5 6h6M6.5 9h6M6.5 12h4" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
};

function text(t: ReturnType<typeof useT>, value: RichMessage | string): string {
  return typeof value === "string" ? value : t.message(value);
}

export function PhoneNav() {
  const t = useT();
  const model = useGame();
  const table = useTableSelection();
  const ui = useUi();
  const badges = navBadges(model, table);
  return (
    <nav className="phone-nav" aria-label={t("shell.nav.label")}>
      <ul className="phone-nav-list">
        {PHONE_SECTIONS.map((tab) => {
          const badge = badges[tab];
          const label = t(TAB_LABEL[tab]);
          const params: Record<"tab" | "badge", MessageParam> | null = badge === undefined ? null : { tab: label, badge: badge.meaning };
          return (
            <li key={tab}>
              <button
                type="button"
                className="phone-nav-button"
                data-tab={tab}
                aria-current={ui.section === tab ? "page" : undefined}
                aria-label={params === null ? undefined : t("shell.nav.withBadge", params)}
                onClick={() => ui.setSection(tab)}
              >
                {ICONS[tab]}
                <span className="phone-nav-label">{label}</span>
                {badge === undefined ? null : (
                  <span className="phone-nav-badge num" data-soft={badge.soft ? "" : undefined} aria-hidden="true">
                    {text(t, badge.shown)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
