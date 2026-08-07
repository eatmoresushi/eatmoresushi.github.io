import {
  KILN_SPACE_IDS,
  ORDER_DEFINITIONS,
  TECHNIQUE_DEFINITIONS,
  currentDecisionActor,
  preferredHeat,
} from "../game";
import type { CeramicState, PlayerId } from "../game";
import type { OrderDefinition } from "../game/content";
import type { PublicGameState } from "../multiplayer";

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
  moon_white: "Moon white",
} as const;

export function GameTable({ game, ownPlayerId }: { game: PublicGameState; ownPlayerId: PlayerId }) {
  const decisionActor = currentDecisionActor(game.phase);
  return (
    <section className="table-region" aria-label="Game table">
      <div className="round-ribbon">
        <div><span>Round</span><strong>{game.round} / 5</strong></div>
        <div><span>Phase</span><strong data-testid="phase-name">{phaseName(game)}</strong></div>
        <div><span>Decision</span><strong data-testid="decision-player">{decisionActor === null ? "Simultaneous" : game.players[decisionActor]?.displayName}</strong></div>
        <div><span>Revision</span><strong>{game.revision}</strong></div>
      </div>

      <div className="player-strip" aria-label="Workshop standings">
        {game.playerOrder.map((playerId) => {
          const player = game.players[playerId]!;
          const isDecision = decisionActor === playerId;
          return (
            <article
              className={`player-board colour-border-${player.seatIndex} ${playerId === ownPlayerId ? "is-own" : ""} ${isDecision ? "is-active" : ""}`}
              key={playerId}
            >
              <div className="player-title">
                <div><strong>{player.displayName}</strong><small>{player.kilnId ?? "Choosing kiln"}</small></div>
                {playerId === ownPlayerId && <span className="you-tag">You</span>}
              </div>
              <dl className="resource-row">
                <div><dt>Clay</dt><dd>{player.resources.clay}</dd></div>
                <div><dt>Wood</dt><dd>{player.resources.wood}</dd></div>
                <div><dt>Coins</dt><dd>{player.resources.coins}</dd></div>
                <div><dt>Progress</dt><dd>{player.imperialProgress}</dd></div>
              </dl>
              <div className="worker-row" aria-label={`${player.displayName} workers`}>
                {Object.values(player.workers).map((worker) => (
                  <span
                    className={`worker-token worker-${worker.kind} status-${worker.status}`}
                    title={`${worker.kind}, ${worker.status}`}
                    key={worker.id}
                  >{worker.kind === "shifu" ? "师" : "徒"}</span>
                ))}
              </div>
              <div className="mini-ledger">
                <span>{player.orderHand.length} Orders</span>
                <span>{player.techniques.length} Techniques</span>
                <span>{player.score.orderVp + player.score.kilnTraditionVp} VP</span>
              </div>
            </article>
          );
        })}
      </div>

      <div className="board-grid">
        <section className="kiln-board panel" aria-labelledby="kiln-title">
          <div className="panel-heading"><div><p className="eyebrow">Shared kiln</p><h2 id="kiln-title">Eight chambers</h2></div><span>Heat zones</span></div>
          <div className="kiln-spaces">
            {KILN_SPACE_IDS.map((spaceId) => {
              const ceramic = Object.values(game.ceramics).find(
                (candidate) => candidate.stage === "loaded" && candidate.kilnSpaceId === spaceId,
              );
              const zone = spaceId.split("_")[0]!;
              return (
                <div className={`kiln-space zone-${zone}`} key={spaceId} data-space={spaceId}>
                  <small>{zone} {zone === "high" ? "+1" : zone === "low" ? "−1" : "±0"}</small>
                  {ceramic === undefined
                    ? <span className="empty-chamber">Empty</span>
                    : <CeramicToken ceramic={ceramic} owner={game.players[ceramic.ownerId]?.displayName ?? ceramic.ownerId} />}
                </div>
              );
            })}
          </div>
          {game.phase.type === "firing_contributions" && (
            <div className="submission-track" aria-label="Wood contribution status">
              {game.phase.eligiblePlayerIds.map((playerId) => (
                <span key={playerId} className={game.phase.submittedPlayerIds.includes(playerId) ? "submitted" : ""}>
                  {game.players[playerId]?.displayName}: {game.phase.submittedPlayerIds.includes(playerId) ? "locked" : "choosing"}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="orders-board panel" aria-labelledby="orders-title">
          <div className="panel-heading"><div><p className="eyebrow">Commissions</p><h2 id="orders-title">Face-up Orders</h2></div><span>{game.decks.marketRemaining + game.decks.imperialRemaining} remain</span></div>
          <h3>Market</h3>
          <div className="card-row">
            {game.displays.market.map((orderId) => <OrderCard orderId={orderId} key={orderId} />)}
          </div>
          <h3>Imperial</h3>
          <div className="card-row">
            {game.displays.imperial.map((orderId) => <OrderCard orderId={orderId} key={orderId} imperial />)}
          </div>
        </section>

        <section className="techniques-board panel" aria-labelledby="techniques-title">
          <div className="panel-heading"><div><p className="eyebrow">Guild & Academy</p><h2 id="techniques-title">Craft Techniques</h2></div></div>
          <div className="technique-columns">
            {(["forming", "glazing", "firing"] as const).map((discipline) => (
              <div key={discipline}>
                <h3>{discipline}</h3>
                {game.displays.techniques[discipline].map((techniqueId) => {
                  const definition = TECHNIQUE_DEFINITIONS[techniqueId];
                  return <article className="technique-tile" key={techniqueId}><strong>{definition?.name}</strong><span>{definition?.cost} Coins</span><p>{definition?.ability}</p></article>;
                })}
              </div>
            ))}
          </div>
        </section>

        <section className="ceramics-board panel" aria-labelledby="ceramics-title">
          <div className="panel-heading"><div><p className="eyebrow">Workshop shelves</p><h2 id="ceramics-title">Ceramics</h2></div></div>
          {game.playerOrder.map((playerId) => {
            const ceramics = Object.values(game.ceramics).filter((ceramic) => ceramic.ownerId === playerId && ceramic.stage !== "sold");
            return (
              <div className="shelf" key={playerId}>
                <strong>{game.players[playerId]?.displayName}</strong>
                <div>{ceramics.length === 0 ? <span className="muted">No ceramics yet</span> : ceramics.map((ceramic) => <CeramicToken ceramic={ceramic} owner="" key={ceramic.id} />)}</div>
              </div>
            );
          })}
        </section>
      </div>
    </section>
  );
}

export function OrderCard({ orderId, imperial = false }: { orderId: string; imperial?: boolean }) {
  const order = ORDER_DEFINITIONS[orderId];
  if (order === undefined) return null;
  return (
    <article className={`order-card ${imperial || orderId.startsWith("I") ? "order-imperial" : ""}`} data-order-id={orderId}>
      <header><strong>{orderId}</strong><span>{order.vp} VP · {order.coins} Coin{order.coins === 1 ? "" : "s"}</span></header>
      <div className="order-slots">
        {order.ceramics.map((requirement, index) => (
          <span key={index}>{requirement.shape === undefined ? "Any form" : SHAPE_LABELS[requirement.shape]} · {requirement.glaze === undefined ? "Any glaze" : GLAZE_LABELS[requirement.glaze]} · {requirement.decoration ?? "any decoration"}</span>
        ))}
      </div>
      <footer>{qualityLabel(order)}{relationLabel(order)}</footer>
    </article>
  );
}

function qualityLabel(order: OrderDefinition): string {
  return `${order.minQuality[0]!.toUpperCase()}${order.minQuality.slice(1)}+`;
}

function relationLabel(order: OrderDefinition): string {
  if (order.relations === undefined || order.relations.length === 0) return "";
  return ` · ${order.relations.map((relation) => relation.type.replaceAll("_", " ")).join(", ")}`;
}

function CeramicToken({ ceramic, owner }: { ceramic: CeramicState; owner: string }) {
  const details = ceramic.stage === "shaped" || ceramic.stage === "sold"
    ? ""
    : ` · ${GLAZE_LABELS[ceramic.glaze]} H${preferredHeat(ceramic.glaze)} · ${ceramic.decoration}`;
  const quality = ceramic.stage === "finished" || ceramic.stage === "delivered" || ceramic.stage === "presented"
    ? ` · ${ceramic.quality}`
    : "";
  return (
    <span className={`ceramic-token ceramic-${ceramic.stage}`} title={`${owner} ${ceramic.stage}`} data-ceramic-id={ceramic.id}>
      <b aria-hidden="true">{ceramic.shape === "bowl" ? "◡" : ceramic.shape === "plate" ? "◠" : ceramic.shape === "vase" ? "♙" : ceramic.shape === "censer" ? "♨" : "◉"}</b>
      <span>{owner === "" ? "" : `${owner} · `}{SHAPE_LABELS[ceramic.shape]} · {ceramic.stage}{details}{quality}</span>
    </span>
  );
}

function phaseName(game: PublicGameState): string {
  switch (game.phase.type) {
    case "setup_kiln_selection": return "Kiln selection";
    case "setup_starting_orders": return "Starting Orders";
    case "work": return "Work Phase";
    case "work_office_orders": return "Office — Orders";
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
