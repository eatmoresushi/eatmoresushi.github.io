/**
 * GameShell (UI_V1.6.1_ARCHITECTURE §4.1, §4.2, §7.3). Owner: B1 (shell, log, lobby).
 * Source: wireframe `.ko` grid "top top" / "banner banner" / "world pane" (+ "nav" on phones).
 *
 * Phase A stub created by A2 (§4.3 rule 1): it has its final export name and props. Unlike the
 * leaf stubs it lays out its slots (a plain two-column grid, stacked below 900px), because
 * `screens/GameScreen.tsx` composes the whole screen through it and the dev game must stay
 * playable. B1 replaces the layout (phone grid, sheet, short-landscape rail) and keeps the props.
 */
import type { ReactNode } from "react";
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
  return (
    <div className="shell">
      <div className="shell-skip">{skipLink}</div>
      <div className="shell-top">{top}</div>
      <div className="shell-banner">{banner}</div>
      <main className="shell-world" id="world" data-focus-fallback="">
        {world}
      </main>
      <div className="shell-pane">{pane}</div>
      <div className="shell-nav">{nav}</div>
      <div className="shell-live">{live}</div>
    </div>
  );
}
