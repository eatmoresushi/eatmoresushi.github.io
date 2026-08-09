import type { AuthoritativeCommand, PendingContribution, PublicEventRecord, PublicGameEvent, PublicGameState } from "../multiplayer";
import type { PlayerId } from "../game";
import { KILN_DEFINITIONS, ORDER_DEFINITIONS, TECHNIQUE_DEFINITIONS } from "../game";
import { ActionPanel } from "./ActionPanel";
import { GameTable } from "./GameTable";

type SendCommand = (command: AuthoritativeCommand) => Promise<boolean>;

export function PlaytestExperience({
  game,
  ownPlayerId,
  ownPendingContribution,
  events,
  busy,
  send,
}: {
  game: PublicGameState;
  ownPlayerId: PlayerId;
  ownPendingContribution: PendingContribution | null;
  events: PublicEventRecord[];
  busy: boolean;
  send: SendCommand;
}) {
  return (
    <div className="playtest-shell" data-testid="playtest-ui">
      <div className="playtest-dashboard">
        <GameTable game={game} ownPlayerId={ownPlayerId} />
      </div>
      <ActionPanel
        game={game}
        ownPlayerId={ownPlayerId}
        ownPendingContribution={ownPendingContribution}
        busy={busy}
        send={send}
      />
      <GameLog game={game} events={events} />
      <DebugPanel game={game} />
    </div>
  );
}

function GameLog({ game, events }: { game: PublicGameState; events: PublicEventRecord[] }) {
  return (
    <section className="playtest-panel playtest-log" aria-labelledby="game-log-title">
      <div className="playtest-panel-heading">
        <div>
          <p className="eyebrow">Public event history</p>
          <h2 id="game-log-title">Game Log</h2>
        </div>
        <span>{events.length} events</span>
      </div>
      {events.length === 0 ? (
        <p className="muted">No game events have been recorded yet.</p>
      ) : (
        <ol className="event-log" aria-live="polite">
          {events.map((record) => (
            <li key={record.sequence}>
              <span>#{record.sequence}</span>
              <p>{eventDescription(record.event, game)}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function DebugPanel({ game }: { game: PublicGameState }) {
  return (
    <section className="playtest-panel debug-panel" aria-labelledby="debug-panel-title">
      <div className="playtest-panel-heading">
        <div>
          <p className="eyebrow">Read-only</p>
          <h2 id="debug-panel-title">Playtest Debug</h2>
        </div>
        <span>Public state only</span>
      </div>
      <dl className="debug-counts">
        <div><dt>Revision</dt><dd>{game.revision}</dd></div>
        <div><dt>Event sequence</dt><dd>{game.eventSequence}</dd></div>
        <div><dt>Market deck / discard</dt><dd>{game.decks.marketRemaining} / {game.discards.market.length}</dd></div>
        <div><dt>Imperial deck / discard</dt><dd>{game.decks.imperialRemaining} / {game.discards.imperial.length}</dd></div>
        <div><dt>Fire deck / discard</dt><dd>{game.decks.fireRemaining} / {game.discards.fire.length}</dd></div>
        <div><dt>Technique decks</dt><dd>F {game.decks.techniqueRemaining.forming} · G {game.decks.techniqueRemaining.glazing} · K {game.decks.techniqueRemaining.firing}</dd></div>
        <div><dt>Common supply</dt><dd>{game.commonSupply.clay} Clay · {game.commonSupply.wood} Wood · {game.commonSupply.coins} Coins</dd></div>
        <div><dt>Vessel supply</dt><dd>{Object.entries(game.vesselSupplyCounts).map(([shape, count]) => `${shape} ${count}`).join(" · ")}</dd></div>
      </dl>
      <details className="raw-state">
        <summary>Show raw public game state</summary>
        <pre>{JSON.stringify(game, null, 2)}</pre>
      </details>
    </section>
  );
}

function eventDescription(event: PublicGameEvent, game: PublicGameState): string {
  const player = (playerId: PlayerId): string => game.players[playerId]?.displayName ?? playerId;
  switch (event.type) {
    case "KILN_SELECTED":
      return `${player(event.playerId)} selected ${KILN_DEFINITIONS[event.kilnId].name}.`;
    case "STARTING_ORDER_KEPT":
      return `${player(event.playerId)} kept starting Order ${event.orderId}.`;
    case "STARTING_ORDER_REDRAWN":
      return `${player(event.playerId)} redrew ${event.discardedOrderId} and received ${event.drawnOrderId}.`;
    case "WORKER_PLACED":
      return `${player(event.playerId)} placed ${workerName(event.workerId)} at ${locationName(event.locationId)}.`;
    case "PLAYER_PASSED":
      return `${player(event.playerId)} passed for the rest of the Work Phase.`;
    case "RESOURCES_CHANGED":
      return `${player(event.playerId)} resources changed: ${resourceChanges(event)}.`;
    case "CERAMIC_SHAPED":
      return `${player(event.playerId)} shaped ${event.ceramicId} as a ${label(event.shape)}.`;
    case "CERAMIC_GLAZED":
      return `${player(event.playerId)} glazed ${event.ceramicId}: ${label(event.glaze)}, ${label(event.decoration)}.`;
    case "CERAMIC_LOADED":
      return `${player(event.playerId)} loaded ${event.ceramicId} into ${label(event.kilnSpaceId)}.`;
    case "CERAMIC_SOLD":
      return `${player(event.playerId)} sold ${event.ceramicId}.`;
    case "CERAMIC_RETURNED_TO_GLAZED":
      return `${player(event.playerId)} used Second Firing; ${event.ceramicId} returned to Glazed and lost its Standard Quality.`;
    case "ORDER_TAKEN":
      return `${player(event.playerId)} ${event.acquisition === "blind_top" ? "blind-drew" : "took"} ${event.orderId} from the ${event.deck} Orders.`;
    case "COLOUR_SAMPLES_USED":
      return `${player(event.playerId)} used Colour Samples: ${event.bottomedOrderId} went to the bottom and ${event.revealedOrderId ?? "no replacement"} was revealed.`;
    case "TECHNIQUE_REFRESHED":
      return `${player(event.playerId)} refreshed ${event.techniqueId} · ${TECHNIQUE_DEFINITIONS[event.techniqueId]?.name ?? "Unknown Technique"}.`;
    case "TECHNIQUE_ACQUIRED":
      return `${player(event.playerId)} bought ${event.techniqueId} · ${TECHNIQUE_DEFINITIONS[event.techniqueId]?.name ?? "Unknown Technique"} for ${event.cost} Coins.`;
    case "TECHNIQUE_USED":
      return `${player(event.playerId)} used ${event.techniqueId} · ${TECHNIQUE_DEFINITIONS[event.techniqueId]?.name ?? "Unknown Technique"}.`;
    case "KILN_ABILITY_USED":
      return `${player(event.playerId)} used ${KILN_DEFINITIONS[event.kilnId].name}: ${KILN_DEFINITIONS[event.kilnId].abilityName}.`;
    case "WORK_PHASE_ENDED":
      return "All players finished the Work Phase. Firing began.";
    case "WOOD_SUBMITTED":
      return `${player(event.playerId)} submitted a secret Wood Contribution.`;
    case "WOOD_REVEALED":
      return `Wood Contributions revealed: ${Object.entries(event.contributions).map(([id, value]) => `${player(id)}=${value}`).join(", ")}.`;
    case "FIRE_REVEALED":
      return `Fire card ${signed(event.modifier)} revealed. Base Heat ${event.baseHeat}; Global Heat ${event.globalHeat}.`;
    case "QUALITY_ASSIGNED":
      return `${event.ceramicId} was assigned ${label(event.quality)} Quality.`;
    case "ORDER_COMPLETED": {
      const definition = ORDER_DEFINITIONS[event.orderId];
      const reward = definition === undefined ? "" : ` +${definition.vp} VP${definition.coins > 0 ? ` and +${definition.coins} Coins` : ""}`;
      return `${player(event.playerId)} completed ${event.orderId} with ${event.ceramicIds.join(", ")}.${reward}`;
    }
    case "IMPERIAL_PROGRESS_ADVANCED":
      return `${player(event.playerId)} advanced Imperial Progress ${event.from} → ${event.to} (reward +${event.reward}).`;
    case "COURT_PATRONAGE_USED":
      return `${player(event.playerId)} used Court Patronage, paid ${event.cost} Coins, and advanced ${event.from} → ${event.to}.`;
    case "IMPERIAL_SEAL_CLAIMED":
      return `${player(event.playerId)} claimed the Imperial Seal.`;
    case "APPRENTICE_UNLOCKED":
      return `${player(event.playerId)} unlocked Apprentice ${event.workerId}.`;
    case "ROUND_STARTED":
      return `Round ${event.round} started. ${player(event.firstPlayerId)} is First Player.`;
    case "PRESENTATION_SUBMITTED":
      return `${player(event.playerId)} submitted ${event.ceramicIds.length} ceramic${event.ceramicIds.length === 1 ? "" : "s"} for Imperial Presentation.`;
    case "FINAL_SCORE_CALCULATED":
      return `Final scoring completed. Winner${event.result.winnerIds.length === 1 ? "" : "s"}: ${event.result.winnerIds.map(player).join(", ")}.`;
  }
}

function workerName(workerId: string): string {
  return workerId.toLowerCase().includes("shifu") ? "Shifu" : `worker ${workerId}`;
}

function locationName(locationId: string): string {
  const names: Record<string, string> = {
    materials_yard: "Materials Yard",
    forming_studio: "Forming Studio",
    glaze_workshop: "Glaze Workshop",
    kiln_yard: "Kiln Yard",
    market_imperial_office: "Market & Imperial Office",
    guild_academy: "Guild & Academy",
  };
  return names[locationId] ?? label(locationId);
}

function resourceChanges(event: Extract<PublicGameEvent, { type: "RESOURCES_CHANGED" }>): string {
  return [
    [event.clay, "Clay"],
    [event.wood, "Wood"],
    [event.coins, "Coins"],
  ].filter(([value]) => value !== 0)
    .map(([value, resource]) => `${signed(Number(value))} ${resource}`)
    .join(", ") || "no net change";
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
