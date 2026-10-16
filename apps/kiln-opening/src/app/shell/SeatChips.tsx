/**
 * SeatChips (UI_V1.6.1_ARCHITECTURE §4.1, §4.2, §8.1; owner decisions D1, D2). Owner: B1.
 * Source: wireframe `topBar` `chain`.
 *
 * The public opponent strips (D2), in work order (`model.players`, First Player then clockwise):
 * seat colour, First Player badge, name, Kiln short name, VP, hand count as card backs, and the
 * acting and computer badges. VP is the score-track value `recordedVp` (Tech VP included from
 * the purchase, amendment A1), and the final total once the game is finished.
 *
 * Each chip is a button (`aria-pressed` = its board is the one shown) that opens that player's
 * board (D1) through `useUi().showBoard`, which applies the §8.1 viewport behaviour: on phones it
 * switches to the Workshop section (collapsing an open sheet, except in short landscape); on
 * wider screens it scrolls to the board area. Its accessible name reads the whole strip:
 * "Open Lin’s board · Jun · 12 VP · 3 Orders in hand · First Player · deciding now".
 *
 * Where the row scrolls (phones, short landscape, a crowded desktop row), it keeps the acting
 * chip in view: the viewer's own when the viewer is acting, else the first acting seat, else the
 * viewer's. It runs on mount, when that chip changes and when the layout mode changes, and scrolls
 * the row only (`scrollLeft` on its scroll container), never the page.
 */
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { useT } from "../i18n/I18nProvider.tsx";
import { kilnShortName } from "../i18n/content.ts";
import { num } from "../i18n/format.ts";
import { CardBack } from "../pieces/CardBack.tsx";
import { useGame, useLayoutMode, useUi } from "../state/hooks.ts";

/** The chip the row keeps in view: the viewer when acting, else the first actor, else the viewer. */
export function seatInViewOf(actorIds: readonly string[], viewerId: string | null, finished: boolean): string | null {
  if (!finished) {
    if (viewerId !== null && actorIds.includes(viewerId)) return viewerId;
    if (actorIds.length > 0) return actorIds[0] ?? null;
  }
  return viewerId;
}

/**
 * Scrolls `row` (horizontally only) so `chip` is fully inside it, with `pad` pixels to spare.
 * Returns the new `scrollLeft`, or null when nothing moved. Exported for tests.
 */
export function revealInRow(row: HTMLElement, chip: HTMLElement, pad = 4): number | null {
  if (row.scrollWidth <= row.clientWidth) return null;
  const rowBox = row.getBoundingClientRect();
  const box = chip.getBoundingClientRect();
  let delta = 0;
  if (box.left < rowBox.left + pad) delta = box.left - rowBox.left - pad;
  else if (box.right > rowBox.right - pad) delta = Math.min(box.right - rowBox.right + pad, box.left - rowBox.left - pad);
  if (delta === 0) return null;
  row.scrollLeft += delta;
  return row.scrollLeft;
}

export function SeatChips() {
  const t = useT();
  const model = useGame();
  const ui = useUi();
  const mode = useLayoutMode();
  const listRef = useRef<HTMLOListElement>(null);
  const shown = ui.boardShown ?? model.viewerId;
  const actors = new Set(model.prompt.actorIds);
  const finalScores = model.finalResult?.scores ?? null;
  const inView = seatInViewOf(model.prompt.actorIds, model.viewerId, model.roundPhase === "final");

  useEffect(() => {
    const list = listRef.current;
    const row = list?.parentElement;
    if (list == null || row == null || inView === null) return;
    const chip = [...list.querySelectorAll<HTMLElement>(".seat-chip")].find((node) => node.dataset["playerId"] === inView);
    if (chip !== undefined) revealInRow(row, chip);
  }, [inView, mode]);

  return (
    <ol ref={listRef} className="seat-chips" aria-label={t("shell.seats.label")}>
      {model.players.map((player, index) => {
        const me = player.playerId === model.viewerId;
        const acting = actors.has(player.playerId) && model.roundPhase !== "final";
        const computer = model.computerSeatIds.has(player.playerId);
        const finalTotal = finalScores?.[player.playerId]?.total ?? null;
        const vp = finalTotal ?? player.recordedVp;
        const kiln = player.kilnId === null ? t("shell.seat.noKiln") : kilnShortName(player.kilnId, t.locale);
        const label = [
          me ? t("shell.seat.yourWorkshop") : t("shell.seat.openBoard", { name: player.displayName }),
          kiln,
          finalTotal === null ? t("common.vpN", { n: vp }) : t("shell.seat.finalTotal", { n: vp }),
          t("common.piece.ordersInHand", { n: player.orderHandCount }),
          ...(player.isFirstPlayer ? [t("shell.seat.firstPlayer")] : []),
          ...(acting ? [t("shell.seat.acting")] : []),
          ...(computer ? [t("shell.seat.computerPlayer")] : []),
        ].join(t("shell.sep"));
        const style = { "--seat": `var(--seat-${player.seatIndex})` } as CSSProperties;
        return (
          <li key={player.playerId} className="seat-chips-item">
            {index > 0 ? (
              <span className="seat-chips-sep" aria-hidden="true">
                ›
              </span>
            ) : null}
            <button
              type="button"
              className="seat-chip"
              style={style}
              data-player-id={player.playerId}
              data-me={me ? "" : undefined}
              data-acting={acting ? "" : undefined}
              aria-pressed={shown === player.playerId}
              aria-label={label}
              onClick={() => ui.showBoard(me ? null : player.playerId)}
            >
              <span className="seat-chip-swatch" aria-hidden="true" />
              {player.isFirstPlayer ? (
                <span className="seat-chip-first" aria-hidden="true">
                  {t("shell.seat.first")}
                </span>
              ) : null}
              <span className="seat-chip-name" aria-hidden="true">
                {player.displayName}
              </span>
              <span className="seat-chip-kiln" aria-hidden="true">
                {kiln}
              </span>
              <span className="seat-chip-vp num" aria-hidden="true">
                {t.rich("shell.seat.vp", { n: vp })}
                {finalTotal === null ? null : <span className="seat-chip-final">{t("shell.seat.final")}</span>}
              </span>
              <span className="seat-chip-hand" aria-hidden="true">
                <CardBack count={player.orderHandCount} maxDrawn={1} />
                <span className="num">{num(player.orderHandCount)}</span>
              </span>
              {computer ? (
                <span className="seat-chip-computer" aria-hidden="true">
                  {t("shell.seat.computer")}
                </span>
              ) : null}
              {acting ? <span className="seat-chip-acting" aria-hidden="true" /> : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
