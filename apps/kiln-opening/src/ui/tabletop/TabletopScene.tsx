import { useEffect, useState } from "react";
import {
  KILN_SPACE_IDS,
  LOCATION_IDS,
  currentDecisionActor,
  locationCapacity,
} from "../../game";
import type { LocationId, PlayerId, TechniqueId, WorkerId } from "../../game";
import type { PublicGameState, PublicPlayerState } from "../../multiplayer";
import { ACTION_ZONE_RECTS, IMPERIAL_TRACK_POINTS, KILN_SLOT_POINTS, normalizedStyle } from "./centralBoardLayout";
import { LOCATION_LABELS, TABLETOP_ASSETS } from "./assetCatalog";
import {
  CeramicPiece,
  FireCard,
  Meeple,
  ResourceToken,
  SEAT_COLOURS,
  VisualOrderCard,
  VisualTechniqueTile,
  WoodCard,
  workshopBackground,
} from "./TabletopPieces";

export interface TabletopSelection {
  workerId: WorkerId | null;
  locationId: LocationId | null;
}

interface TabletopSceneProps {
  game: PublicGameState;
  ownPlayerId: PlayerId;
  selection: TabletopSelection;
  onSelectWorker: (workerId: WorkerId) => void;
  onSelectLocation: (locationId: LocationId) => void;
  onClearSelection: () => void;
}

type Inspection = { type: "order"; id: string } | { type: "technique"; id: TechniqueId } | null;

export function TabletopScene({
  game,
  ownPlayerId,
  selection,
  onSelectWorker,
  onSelectLocation,
  onClearSelection,
}: TabletopSceneProps) {
  const [inspection, setInspection] = useState<Inspection>(null);
  const ownPlayer = game.players[ownPlayerId];
  if (ownPlayer === undefined) return null;
  const decisionActor = currentDecisionActor(game.phase);
  const isOwnWorkTurn = game.phase.type === "work" && game.phase.activePlayerId === ownPlayerId;
  const selectedWorker = selection.workerId === null ? undefined : ownPlayer.workers[selection.workerId];
  const opponents = game.playerOrder.filter((playerId) => playerId !== ownPlayerId);
  const contributionPhase = game.phase.type === "firing_contributions" ? game.phase : null;

  useEffect(() => {
    if (inspection === null) return;
    const close = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setInspection(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [inspection]);

  return (
    <section className="tabletop-scene" aria-label="Kiln Opening tabletop" data-testid="tabletop-scene">
      <TableStatus game={game} decisionActor={decisionActor} />

      <div className="tabletop-quick-tray" aria-label="Your available workers">
        <span><strong>Your workers</strong><small>{isOwnWorkTurn ? "Select one, then choose a glowing location" : "Waiting for your turn"}</small></span>
        <div>
          {Object.values(ownPlayer.workers).filter((worker) => worker.status === "available").map((worker) => (
            <button
              type="button"
              className="quick-meeple-button"
              onClick={() => selection.workerId === worker.id ? onClearSelection() : onSelectWorker(worker.id)}
              disabled={!isOwnWorkTurn}
              aria-pressed={selection.workerId === worker.id}
              aria-label={`Select ${worker.kind} ${worker.id} from quick tray`}
              data-worker-id={worker.id}
              key={worker.id}
            >
              <Meeple kind={worker.kind} seatIndex={ownPlayer.seatIndex} status={worker.status} selected={selection.workerId === worker.id} label={`${worker.kind}, available`} />
            </button>
          ))}
        </div>
        <span className="quick-resource-strip"><ResourceToken kind="clay" amount={ownPlayer.resources.clay} /><ResourceToken kind="wood" amount={ownPlayer.resources.wood} /><ResourceToken kind="coins" amount={ownPlayer.resources.coins} /></span>
      </div>

      <div className="opponent-dock" aria-label="Opponent workshops">
        {opponents.map((playerId) => (
          <OpponentWorkshop game={game} player={game.players[playerId]!} key={playerId} onInspectOrder={(id) => setInspection({ type: "order", id })} />
        ))}
      </div>

      <section className="tabletop-order-display" aria-label="Face-up Order displays">
        <CardDeck label="Market" remaining={game.decks.marketRemaining} className="market-deck" />
        <div className="tabletop-card-fan market-display">
          {game.displays.market.map((orderId) => <VisualOrderCard orderId={orderId} onInspect={(id) => setInspection({ type: "order", id })} key={orderId} />)}
        </div>
        <CardDeck label="Imperial" remaining={game.decks.imperialRemaining} className="imperial-deck" />
        <div className="tabletop-card-fan imperial-display">
          {game.displays.imperial.map((orderId) => <VisualOrderCard orderId={orderId} onInspect={(id) => setInspection({ type: "order", id })} key={orderId} />)}
        </div>
      </section>

      <div className="tabletop-main-stage">
        <section className="central-board-shell" aria-label="Central Action Board, Shared Kiln, and Imperial Progress">
          <img className="central-board-art" src={TABLETOP_ASSETS.centralTable} alt="Illustrated Kiln Opening central action board, shared kiln, and Imperial Progress track" />
          {LOCATION_IDS.map((locationId) => {
            const rect = ACTION_ZONE_RECTS[locationId];
            const placements = game.actionBoard.placements[locationId];
            const capacity = locationCapacity(locationId, game.playerCount);
            const isFull = placements.length >= capacity;
            const structurallyValid = isOwnWorkTurn
              && selectedWorker?.status === "available"
              && !isFull
              && (locationId !== "guild_academy" || selectedWorker.kind === "shifu");
            const isSelected = selection.locationId === locationId;
            const showPreview = isSelected && selectedWorker?.status === "available";
            return (
              <div
                className={`action-hotspot ${structurallyValid ? "is-valid" : ""} ${isSelected ? "is-selected" : ""} ${isFull ? "is-full" : ""}`}
                style={normalizedStyle(rect)}
                data-location-id={locationId}
                key={locationId}
              >
                <button
                  className="hotspot-target"
                  type="button"
                  disabled={!structurallyValid}
                  onClick={() => onSelectLocation(locationId)}
                  aria-label={`${LOCATION_LABELS[locationId]}, ${placements.length} of ${capacity} worker spaces occupied${isFull ? ", full" : ""}`}
                />
                <span className="hotspot-live-label" aria-hidden="true">
                  <b>{LOCATION_LABELS[locationId]}</b>
                  <small>{placements.length} / {capacity}</small>
                </span>
                <span className="hotspot-meeples" aria-label={`Workers at ${LOCATION_LABELS[locationId]}`}>
                  {placements.map((workerId) => {
                    const located = findWorker(game, workerId);
                    if (located === null) return null;
                    return (
                      <Meeple
                        key={workerId}
                        kind={located.worker.kind}
                        seatIndex={located.player.seatIndex}
                        status="placed"
                        label={`${located.player.displayName}'s ${located.worker.kind} at ${LOCATION_LABELS[locationId]}`}
                      />
                    );
                  })}
                  {showPreview && (
                    <Meeple
                      kind={selectedWorker.kind}
                      seatIndex={ownPlayer.seatIndex}
                      preview
                      label={`Pending ${selectedWorker.kind} placement at ${LOCATION_LABELS[locationId]}; confirm the action to submit it`}
                    />
                  )}
                </span>
              </div>
            );
          })}

          {KILN_SPACE_IDS.map((spaceId) => {
            const point = KILN_SLOT_POINTS[spaceId];
            const ceramic = Object.values(game.ceramics).find((candidate) => candidate.stage === "loaded" && candidate.kilnSpaceId === spaceId);
            return (
              <span
                className={`visual-kiln-slot ${ceramic === undefined ? "is-empty" : "is-occupied"}`}
                style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                data-kiln-space={spaceId}
                aria-label={ceramic === undefined ? `${spaceId.replaceAll("_", " ")} empty` : `${spaceId.replaceAll("_", " ")} occupied by ${ceramic.id}`}
                key={spaceId}
              >
                {ceramic !== undefined && <CeramicPiece ceramic={ceramic} compact />}
              </span>
            );
          })}

          {IMPERIAL_TRACK_POINTS.map((point, space) => (
            <span className="visual-progress-space" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} data-progress-space={space} key={space}>
              {game.playerOrder.filter((playerId) => game.players[playerId]?.imperialProgress === space).map((playerId, index) => {
                const player = game.players[playerId]!;
                return (
                  <i
                    className="visual-progress-marker"
                    style={{ "--marker-colour": SEAT_COLOURS[player.seatIndex], "--marker-index": index } as React.CSSProperties}
                    title={`${player.displayName} · Imperial Progress ${space}`}
                    aria-label={`${player.displayName} at Imperial Progress space ${space}`}
                    key={playerId}
                  >{player.displayName.slice(0, 1).toUpperCase()}</i>
                );
              })}
              {space === 5 && game.imperialSealOwnerId !== null && (
                <b className="visual-imperial-seal" title={`Imperial Seal: ${game.players[game.imperialSealOwnerId]?.displayName ?? game.imperialSealOwnerId}`}>玺</b>
              )}
            </span>
          ))}

          {contributionPhase !== null && (
            <div className="sealed-contributions" aria-label="Wood Contribution status">
              {contributionPhase.eligiblePlayerIds.map((playerId) => (
                <span key={playerId}>
                  <WoodCard amount={0} faceDown />
                  <small>{game.players[playerId]?.displayName}<br />{contributionPhase.submittedPlayerIds.includes(playerId) ? "Locked" : "Choosing"}</small>
                </span>
              ))}
            </div>
          )}

          {game.lastFiringResult !== null && (
            <div className="tabletop-firing-result" data-testid="last-firing-result" role="status">
              <FireCard modifier={game.lastFiringResult.fireModifier} />
              <span>
                <small>Round {game.lastFiringResult.round} firing</small>
                <strong>Final heat {game.lastFiringResult.globalHeat}</strong>
                <b>{game.lastFiringResult.baseHeat} {signed(game.lastFiringResult.fireModifier)} = {game.lastFiringResult.globalHeat}</b>
              </span>
            </div>
          )}
        </section>

        <section className="tabletop-technique-display" aria-label="Face-up Craft Techniques">
          <header><span>工艺</span><div><strong>Craft Techniques</strong><small>Guild & Academy display</small></div></header>
          {(["forming", "glazing", "firing"] as const).map((discipline) => (
            <div className="technique-discipline" key={discipline}>
              <small>{discipline}</small>
              <div>{game.displays.techniques[discipline].map((techniqueId) => (
                <VisualTechniqueTile techniqueId={techniqueId} onInspect={(id) => setInspection({ type: "technique", id })} key={techniqueId} />
              ))}</div>
            </div>
          ))}
        </section>
      </div>

      <PlayerWorkshop
        game={game}
        player={ownPlayer}
        own
        isOwnWorkTurn={isOwnWorkTurn}
        selectedWorkerId={selection.workerId}
        onSelectWorker={onSelectWorker}
        onClearSelection={onClearSelection}
        onInspectOrder={(id) => setInspection({ type: "order", id })}
        onInspectTechnique={(id) => setInspection({ type: "technique", id })}
      />

      <p className="tabletop-live-instruction" aria-live="polite">
        {selection.workerId === null
          ? isOwnWorkTurn ? "Select an available worker in your workshop." : "Waiting for the current decision."
          : selection.locationId === null
            ? `Selected ${selectedWorker?.kind ?? "worker"}. Choose a glowing board location.`
            : `Previewing ${selectedWorker?.kind ?? "worker"} at ${LOCATION_LABELS[selection.locationId]}. Confirm the contextual action to place it.`}
      </p>

      {inspection !== null && (
        <div className="piece-inspection-backdrop" role="presentation" onMouseDown={() => setInspection(null)}>
          <div className="piece-inspection" role="dialog" aria-modal="true" aria-label={`Inspect ${inspection.type} ${inspection.id}`} onMouseDown={(event) => event.stopPropagation()}>
            {inspection.type === "order"
              ? <VisualOrderCard orderId={inspection.id} />
              : <VisualTechniqueTile techniqueId={inspection.id} />}
            <button className="secondary-button" type="button" autoFocus onClick={() => setInspection(null)}>Close</button>
          </div>
        </div>
      )}
    </section>
  );
}

function TableStatus({ game, decisionActor }: { game: PublicGameState; decisionActor: PlayerId | null }) {
  return (
    <div className="tabletop-status-ribbon">
      <span><small>Round</small><strong>{game.round} / 5</strong></span>
      <span><small>Phase</small><strong data-testid="phase-name">{phaseName(game)}</strong></span>
      <span><small>Decision</small><strong data-testid="decision-player">{decisionActor === null ? "Simultaneous" : game.players[decisionActor]?.displayName}</strong></span>
      <span><small>Supply</small><strong>{game.commonSupply.clay} clay · {game.commonSupply.wood} wood · {game.commonSupply.coins} coins</strong></span>
    </div>
  );
}

function OpponentWorkshop({ game, player, onInspectOrder }: { game: PublicGameState; player: PublicPlayerState; onInspectOrder: (id: string) => void }) {
  const ceramics = Object.values(game.ceramics).filter((ceramic) => ceramic.ownerId === player.id && ceramic.stage !== "sold");
  return (
    <article className={`opponent-workshop seat-${player.seatIndex}`} style={workshopBackground(player.kilnId)}>
      <header><strong>{player.displayName}</strong><small>{player.kilnId ?? "Choosing kiln"} · Progress {player.imperialProgress}</small></header>
      <div className="opponent-resources"><ResourceToken kind="clay" amount={player.resources.clay} /><ResourceToken kind="wood" amount={player.resources.wood} /><ResourceToken kind="coins" amount={player.resources.coins} /></div>
      <div className="opponent-pieces">
        <span>{Object.values(player.workers).filter((worker) => worker.status === "available").length} workers ready</span>
        <span>{ceramics.length} ceramics</span>
        <span>{player.techniques.length} techniques</span>
      </div>
      <div className="opponent-orders">{player.orderHand.map((orderId) => <VisualOrderCard orderId={orderId} compact onInspect={onInspectOrder} key={orderId} />)}</div>
    </article>
  );
}

function PlayerWorkshop({
  game,
  player,
  own,
  isOwnWorkTurn,
  selectedWorkerId,
  onSelectWorker,
  onClearSelection,
  onInspectOrder,
  onInspectTechnique,
}: {
  game: PublicGameState;
  player: PublicPlayerState;
  own: boolean;
  isOwnWorkTurn: boolean;
  selectedWorkerId: WorkerId | null;
  onSelectWorker: (workerId: WorkerId) => void;
  onClearSelection: () => void;
  onInspectOrder: (id: string) => void;
  onInspectTechnique: (id: TechniqueId) => void;
}) {
  const ceramics = Object.values(game.ceramics).filter((ceramic) => ceramic.ownerId === player.id && ceramic.stage !== "sold");
  return (
    <section className={`player-workshop-table ${own ? "is-own" : ""}`} style={workshopBackground(player.kilnId)} aria-label={`${player.displayName}'s workshop`}>
      <div className="workshop-art-wash" aria-hidden="true" />
      <header className="workshop-titlebar">
        <div><span>{player.kilnId ?? "窑"}</span><strong>{player.displayName}</strong><small>{player.kilnId === null ? "Select a kiln tradition" : `${player.kilnId} workshop`} · Imperial Progress {player.imperialProgress}</small></div>
        <div className="workshop-resources"><ResourceToken kind="clay" amount={player.resources.clay} /><ResourceToken kind="wood" amount={player.resources.wood} /><ResourceToken kind="coins" amount={player.resources.coins} /></div>
      </header>

      <div className="workshop-zones">
        <section className="workshop-worker-supply" aria-label="Available workers">
          <h3>Workers</h3>
          <div>
            {Object.values(player.workers).map((worker) => {
              const canSelect = isOwnWorkTurn && worker.status === "available";
              return canSelect ? (
                <button
                  className="meeple-button"
                  type="button"
                  onClick={() => selectedWorkerId === worker.id ? onClearSelection() : onSelectWorker(worker.id)}
                  aria-pressed={selectedWorkerId === worker.id}
                  aria-label={`Select ${worker.kind} ${worker.id}`}
                  data-worker-id={worker.id}
                  key={worker.id}
                >
                  <Meeple kind={worker.kind} seatIndex={player.seatIndex} status={worker.status} selected={selectedWorkerId === worker.id} label={`${worker.kind}, available`} />
                </button>
              ) : (
                <span className="meeple-button" data-worker-id={worker.id} key={worker.id}>
                  <Meeple kind={worker.kind} seatIndex={player.seatIndex} status={worker.status} label={`${worker.kind}, ${worker.status}`} />
                </span>
              );
            })}
          </div>
          {player.pendingApprenticeUnlocks > 0 && <small>+{player.pendingApprenticeUnlocks} Apprentice unlocks at Cleanup</small>}
        </section>

        <section className="workshop-ceramic-shelf" aria-label="Workshop ceramics">
          <h3>Ceramics</h3>
          <div>{ceramics.length === 0 ? <p>No ceramics yet</p> : ceramics.map((ceramic) => <CeramicPiece ceramic={ceramic} key={ceramic.id} />)}</div>
        </section>

        <section className="workshop-active-orders" aria-label="Active Orders">
          <h3>Active Orders · {player.orderHand.length}</h3>
          <div>{player.orderHand.length === 0 ? <p>No open commissions</p> : player.orderHand.map((orderId) => <VisualOrderCard orderId={orderId} compact onInspect={onInspectOrder} key={orderId} />)}</div>
        </section>

        <section className="workshop-owned-techniques" aria-label="Owned Craft Techniques">
          <h3>Techniques · {player.techniques.length}</h3>
          <div>{player.techniques.length === 0 ? <p>No Techniques yet</p> : player.techniques.map((technique) => <VisualTechniqueTile techniqueId={technique.id} exhausted={technique.exhausted} onInspect={onInspectTechnique} key={technique.id} />)}</div>
        </section>
      </div>
    </section>
  );
}

function CardDeck({ label, remaining, className }: { label: string; remaining: number; className: string }) {
  return <span className={`tabletop-card-deck ${className}`} aria-label={`${label} deck, ${remaining} cards remaining`}><b>{label}</b><small>{remaining} remain</small></span>;
}

function findWorker(game: PublicGameState, workerId: WorkerId): { player: PublicPlayerState; worker: PublicPlayerState["workers"][string] } | null {
  for (const player of Object.values(game.players)) {
    const worker = player.workers[workerId];
    if (worker !== undefined) return { player, worker };
  }
  return null;
}

function signed(value: number): string {
  if (value > 0) return `+ ${value}`;
  if (value < 0) return `− ${Math.abs(value)}`;
  return "+ 0";
}

function phaseName(game: PublicGameState): string {
  switch (game.phase.type) {
    case "setup_kiln_selection": return "Kiln selection";
    case "setup_starting_orders": return "Starting Orders";
    case "work": return "Work Phase";
    case "work_office_orders": return "Office — Orders";
    case "work_office_sale": return "Office — Sale";
    case "work_guild": return "Guild & Academy";
    case "firing_before_contribution": return "Kiln Setting";
    case "firing_contributions": return "Secret Wood";
    case "firing_after_reveal": return "Fuel Ledger";
    case "firing_before_quality": return "Kiln ability";
    case "firing_after_quality": return "Protective Saggars";
    case "firing_after_firing": return "Test Pieces";
    case "orders": return "Order Phase";
    case "presentation": return "Imperial Presentation";
    case "finished": return "Final results";
  }
}
