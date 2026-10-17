/**
 * IdleFiringRecap (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B3 (kiln, firing stage, results, playtest).
 * The strip at the top of the Kiln section between firings: this round's Kiln Die and the open
 * Fire discard (D4). The path and name stay as phase A fixed them (`shell/WorldSections.tsx`).
 *
 * Owner review 2026-10-17: the "Last firing" recap is gone (its equation, Qualities, "No firing
 * yet" and the skipped-round note). The strip shows only what lies on the table now:
 * - this round's Kiln Die: the die piece with its number, or "not rolled yet" before the roll.
 *   One sentence for assistive technology ("Kiln Die this round: 2"); the visible label and the
 *   die are the same words, so they are hidden from it;
 * - a "Fire discard" button (a disclosure: `aria-expanded`, `aria-controls`) that shows, right
 *   below, every discarded Fire card's value in discard order (oldest first), or "none yet".
 *   Escape closes it and puts focus back on the button. The panel stays in the markup while
 *   closed (`hidden`), so static markup carries the discard as `PieceDetail` panels do.
 *
 * D4: the discard is public at any time; nothing else about the Fire deck is shown: no count of
 * cards left, no odds, and the button carries no count. During the Firing Phase the firing stage
 * takes this section's place and shows the discard in its heat equation (`firing/HeatEquation`).
 */
import { useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useT } from "../i18n/I18nProvider.tsx";
import { FireDiscard } from "../firing/FireDiscard.tsx";
import { Button } from "../kit/Button.tsx";
import { KilnDie } from "../pieces/KilnDie.tsx";
import { useGame } from "../state/hooks.ts";
import "./IdleFiringRecap.css";

export function IdleFiringRecap() {
  const t = useT();
  const model = useGame();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const die = model.board.kilnDie?.value ?? null;
  const discard = model.board.fireDiscard;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !open) return;
    event.stopPropagation();
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div className="kstrip" onKeyDown={onKeyDown}>
      <div className="kstrip-bar">
        <p className="kstrip-die">
          <span className="kstrip-die-label" aria-hidden="true">{t("kiln.strip.die")}</span>
          <span className="kstrip-die-piece" aria-hidden="true">
            <KilnDie value={die} />
          </span>
          {die === null ? <span className="kstrip-die-none" aria-hidden="true">{t("kiln.strip.dieNotRolled")}</span> : null}
          <span className="sr-only">{die === null ? t("kiln.strip.dieNotRolledLabel") : t("kiln.strip.dieValue", { n: die })}</span>
        </p>
        <Button
          ref={buttonRef}
          size="sm"
          className="kstrip-discard"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          {t("kiln.strip.discardButton")}
          <span className="kstrip-caret" aria-hidden="true">{open ? "▴" : "▾"}</span>
        </Button>
      </div>
      <div id={panelId} className="kstrip-panel" hidden={!open}>
        {discard.length === 0 ? null : <span className="kstrip-order" aria-hidden="true">{t("kiln.strip.discardOrder")}</span>}
        <FireDiscard discard={discard} showLabel={false} />
      </div>
    </div>
  );
}
