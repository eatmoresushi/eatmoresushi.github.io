import { useEffect, useState } from "react";
import actionLocationsJson from "../../data/action_locations.json" with { type: "json" };
import {
  GAME_CONFIG,
  IMPERIAL_PROGRESS,
  KILN_DEFINITIONS,
  KILN_SPACE_DEFINITIONS,
  KILN_SPACE_IDS,
  LOCATION_IDS,
  ORDER_DEFINITIONS,
  TECHNIQUE_DEFINITIONS,
  activeKilnSpaceIds,
  currentDecisionActor,
  locationCapacity,
  preferredHeat,
} from "../game";
import type { CeramicState, FiringContext, LocationId, PlayerId } from "../game";
import type { OrderDefinition } from "../game/content";
import type { PublicGameState, PublicPlayerState } from "../multiplayer";

const SHAPE_LABELS = {
  bowl: "Bowl",
  plate: "Plate",
  washer: "Washer",
  vase: "Vase",
  censer: "Censer",
} as const;

const GLAZE_LABELS = {
  white: "White",
  celadon: "Celadon",
  grey_green: "Grey-green",
  moon_white: "Moon White",
} as const;

const LOCATION_COPY = Object.fromEntries(
  actionLocationsJson.locations.map((location) => [location.id, location]),
) as Record<LocationId, (typeof actionLocationsJson.locations)[number]>;

export function GameTable({ game, ownPlayerId }: { game: PublicGameState; ownPlayerId: PlayerId }) {
  const decisionActor = currentDecisionActor(game.phase);
  const [lastObservedFiring, setLastObservedFiring] = useState<FiringContext | null>(null);

  useEffect(() => {
    if (game.firingContext?.baseHeat !== null && game.firingContext?.baseHeat !== undefined) {
      setLastObservedFiring(game.firingContext);
    }
  }, [game.firingContext]);

  return (
    <section className="table-region" aria-label="Game table">
      <GameStatus game={game} decisionActor={decisionActor} />

      <section className="playtest-panel" aria-labelledby="players-title">
        <div className="playtest-panel-heading">
          <div><p className="eyebrow">Complete public state</p><h2 id="players-title">Player Workshops</h2></div>
          <span>{game.playerCount} players</span>
        </div>
        <div className="player-strip">
          {game.playerOrder.map((playerId) => (
            <PlayerPanel
              key={playerId}
              game={game}
              player={game.players[playerId]!}
              own={playerId === ownPlayerId}
              deciding={playerId === decisionActor}
            />
          ))}
        </div>
      </section>

      <WorkerPlacementTable game={game} />
      <KilnTable game={game} />
      <FiringInspector game={game} context={game.firingContext ?? lastObservedFiring} live={game.firingContext !== null} />
      <OrderDisplays game={game} ownPlayerId={ownPlayerId} />
      <TechniqueDisplays game={game} />
      <ImperialProgressTable game={game} />
    </section>
  );
}

function GameStatus({ game, decisionActor }: { game: PublicGameState; decisionActor: PlayerId | null }) {
  const active = decisionActor === null ? "Simultaneous decisions" : game.players[decisionActor]?.displayName ?? decisionActor;
  return (
    <section className="playtest-status" aria-label="Game status">
      <StatusCell label="Game ID" value={game.gameId} />
      <StatusCell label="Rules" value={`V${game.rulesVersion}`} />
      <StatusCell label="Round" value={`${game.round} / ${GAME_CONFIG.rounds}`} />
      <StatusCell label="Phase" value={phaseName(game)} testId="phase-name" />
      <StatusCell label="First Player" value={game.players[game.firstPlayerId]?.displayName ?? game.firstPlayerId} />
      <StatusCell label="Active / Decision" value={active} testId="decision-player" />
      <StatusCell label="Turn status" value={phaseStatus(game)} />
      <StatusCell label="Revision" value={`${game.revision} · event ${game.eventSequence}`} />
    </section>
  );
}

function StatusCell({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return <div><span>{label}</span><strong data-testid={testId}>{value}</strong></div>;
}

function PlayerPanel({
  game,
  player,
  own,
  deciding,
}: {
  game: PublicGameState;
  player: PublicPlayerState;
  own: boolean;
  deciding: boolean;
}) {
  const kiln = player.kilnId === null ? null : KILN_DEFINITIONS[player.kilnId];
  const ceramics = Object.values(game.ceramics).filter(
    (ceramic) => ceramic.ownerId === player.id && ceramic.stage !== "sold",
  );
  const immediateVp = player.score.orderVp + player.score.kilnTraditionVp;
  const workers = Object.values(player.workers);
  const availableWorkers = workers.filter((worker) => worker.status === "available");
  const lockedWorkers = workers.filter((worker) => worker.status === "locked");

  return (
    <article className={`player-board ${own ? "is-own" : ""} ${deciding ? "is-active" : ""}`} data-player-id={player.id}>
      <header className="plain-player-header">
        <div>
          <h3>{player.displayName} {own && <span className="you-tag">You</span>}</h3>
          <small>{player.id} · Seat {player.seatIndex + 1}{player.passedWorkPhase ? " · Passed" : ""}</small>
        </div>
        {deciding && <strong className="decision-badge">Deciding</strong>}
      </header>

      <dl className="resource-row">
        <div><dt>VP</dt><dd>{immediateVp}</dd></div>
        <div><dt>Coins</dt><dd>{player.resources.coins}</dd></div>
        <div><dt>Clay</dt><dd>{player.resources.clay}</dd></div>
        <div><dt>Wood</dt><dd>{player.resources.wood}</dd></div>
        <div><dt>Progress</dt><dd>{player.imperialProgress} / 5</dd></div>
      </dl>

      <section className="plain-subsection">
        <h4>Kiln tradition</h4>
        {kiln === null ? <p>Not selected yet.</p> : (
          <p><strong>{kiln.id} · {kiln.name}</strong> — {kiln.abilityName}: {kiln.ability} <em>{player.kilnAbilityUsedThisRound ? "Used this round" : "Ready"}</em></p>
        )}
      </section>

      <section className="plain-subsection">
        <h4>Workers</h4>
        <table className="compact-table">
          <thead><tr><th>ID</th><th>Kind</th><th>Status</th><th>Location</th></tr></thead>
          <tbody>{workers.map((worker) => (
            <tr key={worker.id}>
              <td>{worker.id}</td><td>{title(worker.kind)}</td><td>{title(worker.status)}</td><td>{worker.locationId === null ? "—" : LOCATION_COPY[worker.locationId].name}</td>
            </tr>
          ))}</tbody>
        </table>
        <p className="plain-note">
          {availableWorkers.length} available workers · {lockedWorkers.length} locked. Breakdown: {availableWorkers.filter((worker) => worker.kind === "shifu").length} Shifu and {availableWorkers.filter((worker) => worker.kind === "apprentice").length} Apprentices available
          {player.pendingApprenticeUnlocks > 0 ? ` · ${player.pendingApprenticeUnlocks} unlocks during Cleanup` : ""}
        </p>
      </section>

      <section className="plain-subsection">
        <h4>Owned Techniques ({player.techniques.length}/2)</h4>
        {player.techniques.length === 0 ? <p>None.</p> : (
          <ul className="plain-technique-list">{player.techniques.map((owned) => {
            const technique = TECHNIQUE_DEFINITIONS[owned.id];
            return <li key={owned.id}><strong>{owned.id} · {technique?.name}</strong><span className={owned.exhausted ? "state-exhausted" : "state-ready"}>{owned.exhausted ? "Exhausted" : "Ready"}</span><p>{technique?.ability}</p></li>;
          })}</ul>
        )}
      </section>

      <section className="plain-subsection workshop-ceramics">
        <h4>Workshop ceramics</h4>
        {(["shaped", "glazed", "loaded", "finished", "delivered", "presented"] as const).map((stage) => {
          const matches = ceramics.filter((ceramic) => ceramic.stage === stage);
          return (
            <div className="ceramic-stage" key={stage}>
              <strong>{title(stage)} ({matches.length})</strong>
              {matches.length === 0 ? <span>—</span> : <ul>{matches.map((ceramic) => <li key={ceramic.id}>{ceramicDescription(ceramic)}</li>)}</ul>}
            </div>
          );
        })}
      </section>
    </article>
  );
}

function WorkerPlacementTable({ game }: { game: PublicGameState }) {
  return (
    <section className="playtest-panel" aria-labelledby="worker-placement-title">
      <div className="playtest-panel-heading">
        <div><p className="eyebrow">Round administration</p><h2 id="worker-placement-title">Worker Placement</h2></div>
        <span>Current occupancy and action text</span>
      </div>
      <div className="table-scroll">
        <table className="state-table worker-placement-table">
          <thead><tr><th>Location</th><th>Workers</th><th>Capacity</th><th>Placed workers</th><th>Apprentice</th><th>Shifu</th></tr></thead>
          <tbody>{LOCATION_IDS.map((locationId) => {
            const definition = LOCATION_COPY[locationId];
            const placements = game.actionBoard.placements[locationId];
            return (
              <tr key={locationId} data-location-id={locationId}>
                <th>{definition.name}</th>
                <td>{placements.length}</td>
                <td>{locationCapacity(locationId, game.playerCount)}</td>
                <td>{placements.length === 0 ? "—" : placements.map((workerId) => placedWorkerLabel(game, workerId)).join("; ")}</td>
                <td>{definition.apprentice}</td>
                <td>{definition.shifu}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </section>
  );
}

function KilnTable({ game }: { game: PublicGameState }) {
  const active = new Set(activeKilnSpaceIds(game.playerCount));
  const contributionPhase = game.phase.type === "firing_contributions" ? game.phase : null;
  return (
    <section className="playtest-panel kiln-board" aria-labelledby="kiln-title">
      <div className="playtest-panel-heading">
        <div><p className="eyebrow">Shared kiln</p><h2 id="kiln-title">Kiln Spaces</h2></div>
        <span>{active.size} / {KILN_SPACE_IDS.length} active</span>
      </div>
      <div className="table-scroll">
        <table className="state-table kiln-table">
          <thead><tr><th>Slot</th><th>Zone</th><th>Modifier</th><th>Active?</th><th>Ceramic</th><th>Owner</th></tr></thead>
          <tbody>{KILN_SPACE_IDS.map((spaceId) => {
            const definition = KILN_SPACE_DEFINITIONS[spaceId];
            const ceramic = Object.values(game.ceramics).find(
              (candidate) => candidate.stage === "loaded" && candidate.kilnSpaceId === spaceId,
            );
            const enabled = active.has(spaceId);
            return (
              <tr className={enabled ? "" : "inactive-row"} key={spaceId} data-space={spaceId}>
                <th>{spaceId}</th><td>{title(definition.zone)}</td><td>{signed(definition.modifier)}</td><td>{enabled ? "Yes" : "No — covered"}</td><td>{ceramic === undefined ? "Empty" : ceramicDescription(ceramic)}</td><td>{ceramic === undefined ? "—" : game.players[ceramic.ownerId]?.displayName ?? ceramic.ownerId}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      {contributionPhase !== null && (
        <div className="submission-track" aria-label="Wood contribution status">
          {contributionPhase.eligiblePlayerIds.map((playerId) => (
            <span key={playerId} className={contributionPhase.submittedPlayerIds.includes(playerId) ? "submitted" : ""}>
              {game.players[playerId]?.displayName}: {contributionPhase.submittedPlayerIds.includes(playerId) ? "submitted (value hidden)" : "choosing"}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function FiringInspector({ game, context, live }: { game: PublicGameState; context: FiringContext | null; live: boolean }) {
  const summary = game.lastFiringResult;
  return (
    <section className="playtest-panel firing-inspector" aria-labelledby="firing-inspector-title" data-testid="firing-inspector">
      <div className="playtest-panel-heading">
        <div><p className="eyebrow">Calculation audit</p><h2 id="firing-inspector-title">Firing Inspector</h2></div>
        <span>{context === null ? "No firing observed" : live ? "Current firing" : `Latest observed · Round ${context.round}`}</span>
      </div>
      {context === null ? (
        <p className="muted">Firing calculations will appear here after Wood Contributions are revealed.</p>
      ) : (
        <>
          <dl className="firing-totals">
            <div><dt>Contributors</dt><dd>{context.contributors.length}</dd></div>
            <div><dt>Contributions</dt><dd>{Object.entries(context.contributions).map(([id, amount]) => `${game.players[id]?.displayName ?? id}=${amount}`).join(" · ") || "Not revealed"}</dd></div>
            <div><dt>Total Wood</dt><dd>{Object.values(context.contributions).reduce((sum, amount) => sum + amount, 0)}</dd></div>
            <div><dt>Base Heat</dt><dd>{context.baseHeat ?? "—"}</dd></div>
            <div><dt>Fire modifier</dt><dd>{context.fireModifier === null ? "—" : signed(context.fireModifier)}</dd></div>
            <div><dt>Global Heat</dt><dd>{context.globalHeat ?? "—"}</dd></div>
          </dl>
          <div className="table-scroll">
            <table className="state-table firing-table">
              <thead><tr><th>Ceramic</th><th>Owner</th><th>Preferred</th><th>Base</th><th>Fire used</th><th>Zone</th><th>Ability changes</th><th>Actual</th><th>Difference</th><th>Quality</th></tr></thead>
              <tbody>{Object.values(context.ceramicResults).map((result) => {
                const ceramic = game.ceramics[result.ceramicId];
                const glaze = ceramic !== undefined && ceramic.stage !== "shaped" && ceramic.stage !== "sold" ? ceramic.glaze : null;
                const fireUsed = result.ignoredFireModifier ? 0 : context.fireModifier;
                const changes = [
                  result.ignoredFireModifier ? "Sagger Selection: Fire treated as 0" : null,
                  result.finalActualHeat !== result.naturalActualHeat ? `Actual Heat ${result.naturalActualHeat} → ${result.finalActualHeat}` : null,
                  result.forcedQuality !== null ? `Forced ${title(result.forcedQuality)}` : null,
                ].filter((value): value is string => value !== null);
                return (
                  <tr key={result.ceramicId}>
                    <th>{result.ceramicId}{ceramic === undefined ? "" : ` · ${SHAPE_LABELS[ceramic.shape]}`}</th>
                    <td>{ceramic === undefined ? "—" : game.players[ceramic.ownerId]?.displayName ?? ceramic.ownerId}</td>
                    <td>{glaze === null ? "—" : `${preferredHeat(glaze)} (${GLAZE_LABELS[glaze]})`}</td>
                    <td>{context.baseHeat ?? "—"}</td><td>{fireUsed === null ? "—" : signed(fireUsed)}</td><td>{signed(result.zoneModifier)}</td><td>{changes.join("; ") || "None"}</td><td>{result.finalActualHeat}</td><td>{result.finalHeatDifference}</td><td>{result.assignedQuality === null ? "Pending" : title(result.assignedQuality)}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </>
      )}
      {summary !== null && <GlobalHeatSummary round={summary.round} base={summary.baseHeat} fire={summary.fireModifier} global={summary.globalHeat} />}
    </section>
  );
}

function GlobalHeatSummary({ round, base, fire, global }: { round: number; base: number; fire: number; global: number }) {
  return <p className="global-heat-summary" data-testid="last-firing-result"><strong>Round {round} Fire card: {signed(fire)}</strong><span>Final Global Heat: {base} {signed(fire)} = {global} · Base + Fire</span></p>;
}

function OrderDisplays({ game, ownPlayerId }: { game: PublicGameState; ownPlayerId: PlayerId }) {
  return (
    <section className="playtest-panel orders-board" aria-labelledby="orders-title">
      <div className="playtest-panel-heading">
        <div><p className="eyebrow">Public commissions</p><h2 id="orders-title">Orders</h2></div>
        <span>Market {game.decks.marketRemaining} · Imperial {game.decks.imperialRemaining} remaining</span>
      </div>
      <div className="order-display-columns">
        <div><h3>Market display (4)</h3><div className="card-row">{game.displays.market.map((orderId) => <OrderCard orderId={orderId} key={orderId} />)}</div></div>
        <div><h3>Imperial display (3)</h3><div className="card-row">{game.displays.imperial.map((orderId) => <OrderCard orderId={orderId} key={orderId} imperial />)}</div></div>
      </div>
      <section className="workshop-orders" aria-label="Workshop Orders">
        <h3>Uncompleted Order hands — public information</h3>
        <div className="workshop-order-grid">{game.playerOrder.map((playerId) => {
          const player = game.players[playerId]!;
          return (
            <article className="workshop-order-hand" key={playerId}>
              <h4>{player.displayName}{playerId === ownPlayerId ? " (You)" : ""} · {player.orderHand.length} open / {player.completedOrders.length} completed</h4>
              {player.orderHand.length === 0 ? <p className="muted">No open Orders.</p> : <div className="card-row">{player.orderHand.map((orderId) => <OrderCard orderId={orderId} imperial={orderId.startsWith("I")} key={orderId} />)}</div>}
            </article>
          );
        })}</div>
      </section>
    </section>
  );
}

function TechniqueDisplays({ game }: { game: PublicGameState }) {
  return (
    <section className="playtest-panel techniques-board" aria-labelledby="techniques-title">
      <div className="playtest-panel-heading"><div><p className="eyebrow">Guild & Academy</p><h2 id="techniques-title">Face-up Techniques</h2></div><span>2 per discipline</span></div>
      <div className="technique-columns">{(["forming", "glazing", "firing"] as const).map((discipline) => (
        <div key={discipline}>
          <h3>{title(discipline)} · deck {game.decks.techniqueRemaining[discipline]}</h3>
          {game.displays.techniques[discipline].map((techniqueId) => {
            const technique = TECHNIQUE_DEFINITIONS[techniqueId];
            return <article className="technique-tile" data-technique-id={techniqueId} key={techniqueId}><strong>{techniqueId} · {technique?.name}</strong><span>{technique?.cost} Coins · {technique?.oncePerRound ? "Once per round" : "Continuous"}</span><p>{technique?.ability}</p></article>;
          })}
        </div>
      ))}</div>
    </section>
  );
}

function ImperialProgressTable({ game }: { game: PublicGameState }) {
  const sealOwner = game.imperialSealOwnerId === null ? "Unclaimed" : game.players[game.imperialSealOwnerId]?.displayName ?? game.imperialSealOwnerId;
  return (
    <section className="playtest-panel imperial-progress" aria-labelledby="imperial-progress-title" data-testid="imperial-progress-track">
      <div className="playtest-panel-heading"><div><p className="eyebrow">Track state</p><h2 id="imperial-progress-title">Imperial Progress</h2></div><span data-testid="imperial-seal-owner">Imperial Seal · {sealOwner}</span></div>
      <div className="table-scroll imperial-progress-scroll">
        <table className="state-table imperial-progress-spaces">
          <thead><tr><th>Space</th><th>Name</th><th>End-game VP</th><th>Milestone</th><th>Players</th></tr></thead>
          <tbody>{IMPERIAL_PROGRESS.track.map((space) => {
            const occupants = game.playerOrder.filter((playerId) => game.players[playerId]?.imperialProgress === space.space);
            return <tr data-progress-space={space.space} key={space.space}><th>{space.space}</th><td>{space.title}</td><td>{space.endGameVp}</td><td>{progressReward(space.space)}</td><td className="progress-markers">{occupants.length === 0 ? "—" : occupants.map((playerId) => <span className="progress-marker" key={playerId}>{game.players[playerId]?.displayName}</span>)}</td></tr>;
          })}</tbody>
        </table>
      </div>
      <p className="progress-legend">Single-ceramic Imperial Orders advance 1 space; multi-ceramic Imperial Orders advance 2. Apprentices crossed at spaces 2 and 4 unlock during Cleanup.</p>
    </section>
  );
}

export function OrderCard({ orderId, imperial = false }: { orderId: string; imperial?: boolean }) {
  const order = ORDER_DEFINITIONS[orderId];
  if (order === undefined) return null;
  return (
    <article className={`order-card ${imperial || orderId.startsWith("I") ? "order-imperial" : ""}`} data-order-id={orderId}>
      <header><strong>{orderId}</strong><span>{order.vp} VP{order.coins > 0 ? ` · ${order.coins} Coins` : ""}</span></header>
      {order.imperialProgressReward !== undefined && <strong className="order-progress-reward">+{order.imperialProgressReward} Imperial Progress</strong>}
      <ol className="order-slots">{order.ceramics.map((requirement, index) => (
        <li key={index}>{requirement.shapes?.map((shape) => SHAPE_LABELS[shape]).join(" or ") ?? (requirement.shape === undefined ? "Any Shape" : SHAPE_LABELS[requirement.shape])} · {requirement.glaze === undefined ? "Any Glaze" : GLAZE_LABELS[requirement.glaze]} · {requirement.decoration === undefined ? "Any Decoration" : title(requirement.decoration)}</li>
      ))}</ol>
      <footer>Minimum Quality: {qualityLabel(order)}{relationLabel(order)}</footer>
    </article>
  );
}

function qualityLabel(order: OrderDefinition): string {
  return order.minQuality === "masterpiece" ? "Masterpiece" : `${title(order.minQuality)}+`;
}

function relationLabel(order: OrderDefinition): string {
  if (order.relations === undefined || order.relations.length === 0) return "";
  return ` · ${order.relations.map((relation) => {
    switch (relation.type) {
      case "same_glaze": return "same Glaze";
      case "different_glaze": return "different Glazes";
      case "all_different_glaze": return "all different Glazes";
      case "different_shape": return "different Shapes";
      case "all_different_shape": return "all different Shapes";
      case "same_decoration": return "same Decoration";
      case "at_least_n_quality": return `at least ${relation.count} ${title(relation.quality)}`;
      case "at_least_n_distinct_glazes": return `at least ${relation.count} distinct Glazes`;
      case "glaze_categories": return "required Glaze categories in separate ceramics";
    }
  }).join("; ")}`;
}

function ceramicDescription(ceramic: CeramicState): string {
  const parts = [ceramic.id, SHAPE_LABELS[ceramic.shape], title(ceramic.stage)];
  if (ceramic.stage !== "shaped" && ceramic.stage !== "sold") {
    parts.push(GLAZE_LABELS[ceramic.glaze], title(ceramic.decoration));
  }
  if (ceramic.stage === "finished" || ceramic.stage === "delivered" || ceramic.stage === "presented") {
    parts.push(`Quality: ${title(ceramic.quality)}`);
  }
  if (ceramic.stage === "loaded") parts.push(`Slot: ${ceramic.kilnSpaceId}`);
  return parts.join(" · ");
}

function placedWorkerLabel(game: PublicGameState, workerId: string): string {
  for (const playerId of game.playerOrder) {
    const worker = game.players[playerId]?.workers[workerId];
    if (worker !== undefined) return `${game.players[playerId]?.displayName} · ${title(worker.kind)} · ${worker.id}`;
  }
  return workerId;
}

function progressReward(space: number): string {
  if (space === 2) return "Apprentice unlock during Cleanup";
  if (space === 4) return "Apprentice unlock; Presentation eligible";
  if (space === 5) return "Presentation eligible; first arrival claims Imperial Seal";
  return "—";
}

function phaseName(game: PublicGameState): string {
  switch (game.phase.type) {
    case "setup_kiln_selection": return "Kiln selection";
    case "setup_starting_orders": return "Starting Orders";
    case "work": return "Work Phase";
    case "work_office_orders": return "Office — Orders";
    case "work_office_sale": return "Office — Optional Flawed sale";
    case "work_office_connoisseur": return "Office — Connoisseur Network";
    case "work_guild": return "Guild & Academy";
    case "firing_before_contribution": return "Kiln Setting";
    case "firing_contributions": return "Secret Wood";
    case "firing_after_reveal": return "Fuel Ledger";
    case "firing_after_fire_reveal": return "Sagger Selection";
    case "firing_before_quality": return "Kiln ability";
    case "firing_after_quality": return game.phase.techniqueIds[game.phase.queue.currentIndex] === "T15" ? "Second Firing" : "Protective Saggars";
    case "firing_after_firing": return game.phase.techniqueIds[game.phase.queue.currentIndex] === "T13" ? "Kiln Records" : "Test Pieces";
    case "orders": return "Order Phase";
    case "presentation": return "Imperial Presentation";
    case "finished": return "Final results";
  }
}

function phaseStatus(game: PublicGameState): string {
  switch (game.phase.type) {
    case "work": return `${game.players[game.phase.activePlayerId]?.displayName ?? game.phase.activePlayerId} must place a worker or pass`;
    case "firing_contributions": return `${game.phase.submittedPlayerIds.length}/${game.phase.eligiblePlayerIds.length} contributions submitted`;
    case "presentation": return `${game.phase.submittedPlayerIds.length}/${game.phase.eligiblePlayerIds.length} presentations submitted`;
    case "orders": return `${game.players[game.phase.activePlayerId]?.displayName ?? game.phase.activePlayerId} may complete Orders`;
    case "finished": return "Final scoring complete";
    default: {
      const actor = currentDecisionActor(game.phase);
      return actor === null ? "Waiting for simultaneous decisions" : `${game.players[actor]?.displayName ?? actor} must resolve this step`;
    }
  }
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function title(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
