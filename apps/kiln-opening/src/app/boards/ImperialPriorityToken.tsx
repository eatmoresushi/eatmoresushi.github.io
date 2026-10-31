/**
 * ImperialPriorityToken (owner UI decision D21; Recognition 3, rev. 5 L314). Owner: B2.
 *
 * The Imperial Priority token on the Kiln Player Board of the player who holds it (a physical
 * piece: public, and gone once spent). While its owner may spend it now
 * (`useTableSelection().imperialPriority`, from `freeActionOptions`: only in their own free-action
 * windows, with an empty Imperial Kiln and a Shaped vessel) it carries **Use**, which opens the same
 * form as the turn line's chip (on phones the sheet opens, D14); it never sends a command by itself
 * (K4). `data-act="imperial-priority"`, drawn with the Sell button's look. It is not a toggle: once
 * chosen its words say so.
 */
import type { PlayerId } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { useGame, useTableSelection } from "../state/hooks.ts";
import { summaryOf } from "../table/tableData.ts";
import "../table/SellButton.css";

export interface ImperialPriorityTokenProps {
  /** Whose board. */
  playerId: PlayerId;
}

export function ImperialPriorityToken({ playerId }: ImperialPriorityTokenProps) {
  const t = useT();
  const model = useGame();
  const selection = useTableSelection();
  const summary = summaryOf(model, playerId);
  if (summary === null || summary.imperial.priority !== "held") return null;
  const target = playerId === model.viewerId ? selection.imperialPriority : null;
  const shown = target?.pressed === true ? t("boards.priority.chosen") : t("boards.priority.use");
  return (
    <div className="prow" data-imperial-priority="">
      <span className="prow-lab">{t("boards.priority.token")}</span>
      {target === null ? (
        <span className="prow-note">{t("boards.priority.held")}</span>
      ) : (
        <button
          type="button"
          className="sell-pick"
          data-act="imperial-priority"
          data-chosen={target.pressed ? "" : undefined}
          aria-label={t("boards.priority.useLabel", { action: shown, token: t("boards.priority.token") })}
          onClick={() => selection.act({ type: "imperial_priority" })}
        >
          {shown}
        </button>
      )}
    </div>
  );
}
