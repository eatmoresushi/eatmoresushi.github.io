/**
 * GameScreen (UI_V1.6.1_ARCHITECTURE §4.1). Frozen after phase A; changes go through B6.
 *
 * Composition only: it renders the shell, the top bar, the banner, the world's sections, the
 * decision pane, the phone section bar and the live regions by fixed import paths. Phase B
 * agents fill those files; this one never changes in phase B.
 */
import { DecisionPane } from "../decision/DecisionPane.tsx";
import { ConnectionBanner } from "../shell/ConnectionBanner.tsx";
import { GameShell } from "../shell/GameShell.tsx";
import { LiveAnnouncer } from "../shell/LiveAnnouncer.tsx";
import { PhoneNav } from "../shell/PhoneNav.tsx";
import { SkipLink } from "../shell/SkipLink.tsx";
import { TopBar } from "../shell/TopBar.tsx";
import { WorldSections } from "../shell/WorldSections.tsx";

export function GameScreen() {
  return (
    <GameShell
      skipLink={<SkipLink />}
      top={<TopBar />}
      banner={<ConnectionBanner />}
      world={<WorldSections />}
      pane={<DecisionPane />}
      nav={<PhoneNav />}
      live={<LiveAnnouncer />}
    />
  );
}
