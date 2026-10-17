/**
 * GameShell (UI_V1.6.1_ARCHITECTURE §4.1, §4.2, §7.3, §8.2). Owner: B1 (shell, log, lobby).
 * Source: wireframe `.ko` grid "top top" / "world pane", the phone grid
 * "top" / "world" / "pane" / "tabs" and the short-landscape rail.
 *
 * Layout only; the same markup at every width (§7.3), with the grid chosen by CSS:
 * - 900px and wider: "top top" / "banner banner" / "jump pane" / "world pane";
 * - below 900px: "top" / "banner" / "world" / "pane" / "nav" — the pane is the bottom sheet
 *   (`kit/Sheet` inside `DecisionPane`), the nav the phone section bar; no jump bar;
 * - short landscape (`(orientation: landscape) and (max-height: 500px)`): a left section rail and
 *   the pane as a side column, "nav top top" / "nav banner banner" / "nav world pane"; no jump bar.
 *
 * The app fills the viewport (`100dvh`); the world and the pane scroll inside themselves, so the
 * top bar, the jump bar, the sheet and the section bar stay put. The skip link comes first in the
 * tab order, the live regions take no space. Focus rescue (§8.2) is installed on the shell's root.
 *
 * The jump bar (`JumpNav`: the section buttons and, on desktop and tablet, the seat chips) is a
 * row of its own right above the world, not part of the world's scroll area, so nothing of the
 * world ever lies under it. GameScreen (frozen after phase A) passes no `jump`, so the shell
 * supplies it.
 *
 * The other players' turn toast (`TurnToasts`, one turn at a time; owner review 2026-10-17, item
 * 3) is drawn over nothing: never over the top bar (the Log button, the phone seat chips), the
 * jump bar (the seat chips), the pane (and its Confirm bar) or the phone section bar, whose cells
 * are their own, nor over the table: its holder (`.shell-toasts`) sits at the top of the world's
 * cell, and while a toast shows the world gives up a band of its cell as tall as the holder
 * (`--turn-toast-band`) and scrolls by as much, so the table keeps its place on screen and no part
 * of it lies under the toast. The toast is at the band's right end on desktop and tablet (under
 * the jump bar), across it on phones and in short landscape (under the top bar). The shell renders
 * it once, so its queue survives a change of layout, and in the markup it comes after the top
 * bar, the banner, the openers' bar and the jump bar and before the world, as it is drawn, so the
 * Tab order follows what is seen. GameScreen passes no `toasts`, so the shell supplies them.
 *
 * **Hidden pane** (owner review, 2026-10-17; `state/pane.ts`): while the open window hides the
 * decision pane (the work turn before a placement is chosen), the shell carries
 * `data-pane="hidden"` and the grid drops the pane's cell: on desktop and tablet the world takes
 * the pane's column, on phones there is no bottom sheet, in short landscape no side column. A slim
 * `bar` row then sits above the world (`decision/PaneOpeners`): the turn cue ("Your turn: place a
 * worker · 3 left") and the openers of the abilities that may come first, if any; the row is
 * empty, and so takes no room, while the pane shows. In the markup it comes before the world,
 * where it is drawn. GameScreen passes no `paneBar`, so the shell supplies it.
 */
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { PaneOpeners } from "../decision/PaneOpeners.tsx";
import { usePane } from "../state/pane.ts";
import { JumpNav } from "./JumpNav.tsx";
import { TurnToasts } from "./TurnToasts.tsx";
import { installFocusRescue } from "./focusRescue.ts";
import "./GameShell.css";

export interface GameShellProps {
  /** "Skip to your decision" (`SkipLink`). */
  skipLink: ReactNode;
  /** The top bar (`<header>`). */
  top: ReactNode;
  /** The ConnectionBanner; takes no space when empty. */
  banner: ReactNode;
  /** The world's sections; GameShell wraps them in `<main>`. */
  world: ReactNode;
  /** The decision pane (`<aside>`). */
  pane: ReactNode;
  /** The phone section bar (`<nav>`). */
  nav: ReactNode;
  /** The live regions. */
  live: ReactNode;
  /** The other players' turn toast (top right; across the top on phones); default `<TurnToasts />`. */
  toasts?: ReactNode;
  /** The hidden pane's bar above the world (turn cue and openers); default `<PaneOpeners />`. */
  paneBar?: ReactNode;
  /** The jump bar above the world (desktop and tablet); default `<JumpNav />`. */
  jump?: ReactNode;
}

export function GameShell({ skipLink, top, banner, world, pane, nav, live, toasts = <TurnToasts />, paneBar = <PaneOpeners />, jump = <JumpNav /> }: GameShellProps) {
  const { hidden } = usePane();
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return undefined;
    return installFocusRescue(root);
  }, []);
  return (
    <div ref={rootRef} className="shell" data-shell="" data-pane={hidden ? "hidden" : undefined}>
      <div className="shell-skip">{skipLink}</div>
      <div className="shell-top">{top}</div>
      <div className="shell-banner">{banner}</div>
      <div className="shell-bar">{hidden ? paneBar : null}</div>
      <div className="shell-jump">{jump}</div>
      <div className="shell-toasts">{toasts}</div>
      <main className="shell-world" id="world" data-focus-fallback="">
        {world}
      </main>
      <div className="shell-pane" id="decision">
        {pane}
      </div>
      <div className="shell-nav">{nav}</div>
      <div className="shell-live">{live}</div>
    </div>
  );
}
