import { useEffect, useState } from "react";
import type { AuthoritativeCommand, PendingContribution, PublicGameState } from "../../multiplayer";
import type { PlayerId, WorkerId, LocationId } from "../../game";
import { ActionPanel } from "../ActionPanel";
import { GameTable } from "../GameTable";
import { TabletopScene } from "./TabletopScene";
import type { TabletopSelection } from "./TabletopScene";

type SendCommand = (command: AuthoritativeCommand) => Promise<boolean>;

export function TabletopExperience({
  game,
  ownPlayerId,
  ownPendingContribution,
  busy,
  send,
}: {
  game: PublicGameState;
  ownPlayerId: PlayerId;
  ownPendingContribution: PendingContribution | null;
  busy: boolean;
  send: SendCommand;
}) {
  const viewMode = new URLSearchParams(window.location.search);
  const debugUI = viewMode.get("debugUI") === "true"
    || (import.meta.env.VITE_E2E_LOCAL_BACKEND === "1" && viewMode.get("tabletop") !== "true");
  const [selection, setSelection] = useState<TabletopSelection>({ workerId: null, locationId: null });

  useEffect(() => {
    const worker = selection.workerId === null ? undefined : game.players[ownPlayerId]?.workers[selection.workerId];
    if (game.phase.type !== "work" || game.phase.activePlayerId !== ownPlayerId || worker?.status !== "available") {
      setSelection({ workerId: null, locationId: null });
    }
  }, [game.phase, game.revision, ownPlayerId, selection.workerId]);

  async function sendFromTable(command: AuthoritativeCommand): Promise<boolean> {
    const accepted = await send(command);
    if (accepted) setSelection({ workerId: null, locationId: null });
    return accepted;
  }

  function selectWorker(workerId: WorkerId): void {
    setSelection({ workerId, locationId: null });
  }

  function selectLocation(locationId: LocationId): void {
    setSelection((current) => ({ ...current, locationId }));
    window.setTimeout(() => {
      if (window.matchMedia("(max-width: 940px)").matches) {
        document.querySelector(".visual-game-layout > .action-rail")?.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    }, 0);
  }

  if (debugUI) {
    return (
      <div className="game-layout debug-game-layout" data-testid="debug-ui">
        <GameTable game={game} ownPlayerId={ownPlayerId} />
        <ActionPanel game={game} ownPlayerId={ownPlayerId} ownPendingContribution={ownPendingContribution} busy={busy} send={send} />
      </div>
    );
  }

  return (
    <div className="visual-game-layout">
      <TabletopScene
        game={game}
        ownPlayerId={ownPlayerId}
        selection={selection}
        onSelectWorker={selectWorker}
        onSelectLocation={selectLocation}
        onClearSelection={() => setSelection({ workerId: null, locationId: null })}
      />
      <ActionPanel
        game={game}
        ownPlayerId={ownPlayerId}
        ownPendingContribution={ownPendingContribution}
        busy={busy}
        send={sendFromTable}
      />
    </div>
  );
}
