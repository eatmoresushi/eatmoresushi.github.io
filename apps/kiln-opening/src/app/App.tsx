/**
 * The app root (UI_V1.6.1_ARCHITECTURE §4.1, §4.2). Frozen after phase A; changes go through B6.
 *
 * It wires the providers (i18n; the game source, session actions, window registry, draft store,
 * UI store and layout source) and switches screens by session state:
 * - no room → `HomeScreen` (create, join, resume a saved seat);
 * - a room in the lobby → `LobbyScreen`;
 * - a session the host ended → `EndedScreen`;
 * - a game (playing or finished) → `GameScreen`.
 *
 * On mount it resumes the saved seat of the last room once (§3.9).
 */
import { useEffect, useState } from "react";
import { WINDOWS } from "./decision/windows.ts";
import { I18nProvider } from "./i18n/I18nProvider.tsx";
import type { Locale } from "./i18n/translator.ts";
import { EndedScreen } from "./lobby/EndedScreen.tsx";
import { HomeScreen } from "./lobby/HomeScreen.tsx";
import { LobbyScreen } from "./lobby/LobbyScreen.tsx";
import { GameScreen } from "./screens/GameScreen.tsx";
import type { GameSnapshot } from "./session/gameSource.ts";
import type { SessionStore } from "./session/sessionStore.ts";
import { GameProvider, useSnapshot } from "./state/hooks.ts";
import { browserLayoutSource } from "./state/layoutMode.ts";
import type { LayoutSource } from "./state/layoutMode.ts";
import { createBrowserUiStore } from "./state/uiStore.ts";
import type { UiStore } from "./state/uiStore.ts";

export type AppScreen = "home" | "lobby" | "ended" | "game" | "loading";

/** Which screen a snapshot shows. Pure; exported for tests. */
export function screenOf(snapshot: GameSnapshot): AppScreen {
  const room = snapshot.room;
  if (room === null) return "home";
  if (room.status === "abandoned" || room.endedAt !== null) return "ended";
  if (room.status === "lobby") return "lobby";
  return snapshot.view === null ? "loading" : "game";
}

function Screens() {
  const snapshot = useSnapshot();
  switch (screenOf(snapshot)) {
    case "home":
      return <HomeScreen />;
    case "lobby":
      return <LobbyScreen />;
    case "ended":
      return <EndedScreen />;
    case "game":
      return <GameScreen />;
    case "loading":
      return <div className="app-loading" aria-busy="true" />;
  }
}

const RESTORED = new WeakSet<SessionStore>();

export interface AppProps {
  store: SessionStore;
  layout?: LayoutSource;
  ui?: UiStore;
  /** Fixed locale (tests); default: stored, then detected. */
  locale?: Locale;
  devTools?: boolean;
}

export function App({ store, layout, ui, locale, devTools }: AppProps) {
  const [ownLayout] = useState(() => layout ?? browserLayoutSource());
  const [ownUi] = useState(() => ui ?? createBrowserUiStore(ownLayout));
  useEffect(() => {
    if (RESTORED.has(store)) return;
    RESTORED.add(store);
    void store.restore();
  }, [store]);
  return (
    <I18nProvider {...(locale === undefined ? {} : { defaultLocale: locale })}>
      <GameProvider
        source={store}
        session={store}
        registry={WINDOWS}
        layout={layout ?? ownLayout}
        ui={ui ?? ownUi}
        {...(devTools === undefined ? {} : { devTools })}
      >
        <Screens />
      </GameProvider>
    </I18nProvider>
  );
}
