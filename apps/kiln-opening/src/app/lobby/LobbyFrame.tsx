/**
 * The frame of the pre-game and post-game screens (home, lobby, ended). Owner: B1.
 *
 * A header with the game's name and the always-visible language and theme controls
 * (UI_UX_SPEC "always-visible EN / 中文", §1.5), then the screen's own `<main>`. The e2e driver
 * hooks sit on the real controls (`driverHooks.ts`, CR-B1-3).
 */
import type { ReactNode } from "react";
import { useT } from "../i18n/I18nProvider.tsx";
import { LanguageToggle } from "../kit/LanguageToggle.tsx";
import { ThemeToggle } from "../kit/ThemeToggle.tsx";
import { useUi } from "../state/hooks.ts";
import "./Lobby.css";

export interface LobbyFrameProps {
  screen: "home" | "lobby" | "ended";
  /** Labels the `<main>` (the screen's `<h1>` id). */
  labelledBy: string;
  children?: ReactNode;
}

export function LobbyFrame({ screen, labelledBy, children }: LobbyFrameProps) {
  const t = useT();
  const ui = useUi();
  return (
    <div className="lobby-page" data-screen={screen}>
      <header className="lobby-header">
        <span className="lobby-brand">{t("lobby.brand")}</span>
        <div className="lobby-header-tools">
          <LanguageToggle />
          <ThemeToggle value={ui.theme} onChange={ui.setTheme} />
        </div>
      </header>
      <main className="lobby-main" aria-labelledby={labelledBy}>
        {children}
      </main>
    </div>
  );
}
