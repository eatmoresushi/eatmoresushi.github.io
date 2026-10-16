/**
 * GameShell (UI_V1.6.1_ARCHITECTURE §4.1, §4.2, §7.3, §8.2). Owner: B1 (shell, log, lobby).
 * Source: wireframe `.ko` grid "top top" / "world pane", the phone grid
 * "top" / "world" / "pane" / "tabs" and the short-landscape rail.
 *
 * Layout only; the same markup at every width (§7.3), with the grid chosen by CSS:
 * - 900px and wider: "top top" / "banner banner" / "world pane";
 * - below 900px: "top" / "banner" / "world" / "pane" / "nav" — the pane is the bottom sheet
 *   (`kit/Sheet` inside `DecisionPane`), the nav the phone section bar;
 * - short landscape (`(orientation: landscape) and (max-height: 500px)`): a left section rail and
 *   the pane as a side column, "nav top top" / "nav banner banner" / "nav world pane".
 *
 * The app fills the viewport (`100dvh`); the world and the pane scroll inside themselves, so the
 * top bar, the sheet and the section bar stay put. The skip link comes first in the tab order,
 * the live regions take no space. Focus rescue (§8.2) is installed on the shell's root.
 */
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
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
}

export function GameShell({ skipLink, top, banner, world, pane, nav, live }: GameShellProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return undefined;
    return installFocusRescue(root);
  }, []);
  return (
    <div ref={rootRef} className="shell" data-shell="">
      <div className="shell-skip">{skipLink}</div>
      <div className="shell-top">{top}</div>
      <div className="shell-banner">{banner}</div>
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
