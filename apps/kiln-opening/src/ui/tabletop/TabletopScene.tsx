import { useEffect, useState } from "react";
import {
  KILN_SPACE_IDS,
  LOCATION_IDS,
  activeKilnSpaceIds,
  currentDecisionActor,
  locationCapacity,
} from "../../game";
import type { LocationId, PlayerId, TechniqueId, WorkerId } from "../../game";
import type { PublicGameState, PublicPlayerState } from "../../multiplayer";
import { useI18n } from "../i18n";
import type { Locale } from "../i18n";
import { ACTION_ZONE_RECTS, IMPERIAL_TRACK_POINTS, KILN_SLOT_POINTS, normalizedStyle } from "./centralBoardLayout";
import { TABLETOP_ASSETS } from "./assetCatalog";
import {
  CeramicPiece,
  FireCard,
  Meeple,
  ResourceToken,
  SEAT_COLOURS,
  VisualOrderCard,
  VisualTechniqueTile,
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
  const { locale, term } = useI18n();
  const ownPlayer = game.players[ownPlayerId];

  useEffect(() => {
    if (inspection === null) return;
    const close = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setInspection(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [inspection]);

  if (ownPlayer === undefined) return null;
  const decisionActor = currentDecisionActor(game.phase);
  const isOwnWorkTurn = game.phase.type === "work" && game.phase.activePlayerId === ownPlayerId;
  const selectedWorker = selection.workerId === null ? undefined : ownPlayer.workers[selection.workerId];
  const opponents = game.playerOrder.filter((playerId) => playerId !== ownPlayerId);
  const contributionPhase = game.phase.type === "firing_contributions" ? game.phase : null;

  return (
    <section className="tabletop-scene" aria-label={locale === "zh-CN" ? "开窑游戏桌面" : "Kiln Opening tabletop"} data-testid="tabletop-scene">
      <TableStatus game={game} decisionActor={decisionActor} />

      <div className="tabletop-quick-tray" aria-label={locale === "zh-CN" ? "你的可用工人" : "Your available workers"}>
        <span><strong>{locale === "zh-CN" ? "你的工人" : "Your workers"}</strong><small>{isOwnWorkTurn ? (locale === "zh-CN" ? "先选择1名工人，再选择发光的地点" : "Select one, then choose a glowing location") : (locale === "zh-CN" ? "等待你的回合" : "Waiting for your turn")}</small></span>
        <div>
          {Object.values(ownPlayer.workers).filter((worker) => worker.status === "available").map((worker) => (
            <button
              type="button"
              className="quick-meeple-button"
              onClick={() => selection.workerId === worker.id ? onClearSelection() : onSelectWorker(worker.id)}
              disabled={!isOwnWorkTurn}
              aria-pressed={selection.workerId === worker.id}
              aria-label={locale === "zh-CN" ? `从快捷区选择${term(worker.kind)} ${worker.id}` : `Select ${term(worker.kind)} ${worker.id} from quick tray`}
              data-worker-id={worker.id}
              key={worker.id}
            >
              <Meeple kind={worker.kind} seatIndex={ownPlayer.seatIndex} status={worker.status} selected={selection.workerId === worker.id} label={`${term(worker.kind)}，${term("available")}`} />
            </button>
          ))}
        </div>
        <span className="quick-resource-strip"><ResourceToken kind="clay" amount={ownPlayer.resources.clay} /><ResourceToken kind="wood" amount={ownPlayer.resources.wood} /><ResourceToken kind="coins" amount={ownPlayer.resources.coins} /></span>
      </div>

      <div className="opponent-dock" aria-label={locale === "zh-CN" ? "对手作坊" : "Opponent workshops"}>
        {opponents.map((playerId) => (
          <OpponentWorkshop game={game} player={game.players[playerId]!} key={playerId} onInspectOrder={(id) => setInspection({ type: "order", id })} />
        ))}
      </div>

      <section className="tabletop-order-display" aria-label={locale === "zh-CN" ? "公开委托展示区" : "Face-up Order display"}>
        <CardDeck label={locale === "zh-CN" ? "主委托" : "Main Orders"} remaining={game.decks.marketRemaining} className="market-deck" />
        <div className="tabletop-card-fan market-display">
          {game.displays.market.map((orderId) => <VisualOrderCard orderId={orderId} onInspect={(id) => setInspection({ type: "order", id })} key={orderId} />)}
        </div>
      </section>

      <div className="tabletop-main-stage">
        <section className="central-board-shell" aria-label={locale === "zh-CN" ? "中央行动板、共窑与御府声望轨" : "Central Action Board, Shared Kiln, and Imperial Recognition"}>
          <img className="central-board-art" src={TABLETOP_ASSETS.centralTable} alt={locale === "zh-CN" ? "开窑中央行动板、共窑与御府声望轨插图" : "Illustrated Kiln Opening central action board, shared kiln, and Imperial Recognition track"} />
          {LOCATION_IDS.map((locationId) => {
            const rect = ACTION_ZONE_RECTS[locationId];
            const placements = game.actionBoard.placements[locationId];
            const capacity = locationCapacity(locationId, game.playerCount);
            const isFull = placements.length >= capacity;
            const capacityLabel = Number.isFinite(capacity) ? String(capacity) : "∞";
            const structurallyValid = isOwnWorkTurn
              && selectedWorker?.status === "available"
              && (!isFull || selectedWorker.kind === "shifu");
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
                  aria-label={locale === "zh-CN"
                    ? `${term(locationId)}，已有${placements.length}名工人，容量${capacityLabel}${isFull ? "，已满；师傅仍可放置" : ""}`
                    : `${term(locationId)}, ${placements.length} of ${capacityLabel} worker spaces occupied${isFull ? ", full; Shifu may still be placed" : ""}`}
                />
                <span className="hotspot-live-label" aria-hidden="true">
                  <b>{term(locationId)}</b>
                  <small>{placements.length} / {capacityLabel}</small>
                </span>
                {locationId === "guild_academy" && <span className="hotspot-rule-update" aria-hidden="true">{locale === "zh-CN" ? "学徒：按牌面费用取得公开技艺 · 师傅：查看牌堆顶2个，再减1铜钱" : "Apprentice: face-up at cost · Shifu: inspect top 2, then −1 Coin"}</span>}
                {locationId === "market_imperial_office" && <span className="hotspot-rule-update" aria-hidden="true">{locale === "zh-CN" ? "公开或不看牌库顶委托 · 每次承接后获得资源" : "Face-up or unseen top-deck Orders · gain after each reservation"}</span>}
                <span className="hotspot-meeples" aria-label={locale === "zh-CN" ? `${term(locationId)}的工人` : `Workers at ${term(locationId)}`}>
                  {placements.map((workerId) => {
                    const located = findWorker(game, workerId);
                    if (located === null) return null;
                    const shifuIsOnCeramic = locationId === "kiln_yard"
                      && located.worker.kind === "shifu"
                      && located.player.kilnYardShifuCeramicId !== null;
                    if (shifuIsOnCeramic) return null;
                    return (
                      <Meeple
                        key={workerId}
                        kind={located.worker.kind}
                        seatIndex={located.player.seatIndex}
                        status="placed"
                        label={locale === "zh-CN" ? `${located.player.displayName}的${term(located.worker.kind)}，位于${term(locationId)}` : `${located.player.displayName}'s ${term(located.worker.kind)} at ${term(locationId)}`}
                      />
                    );
                  })}
                  {showPreview && (
                    <Meeple
                      kind={selectedWorker.kind}
                      seatIndex={ownPlayer.seatIndex}
                      preview
                      label={locale === "zh-CN" ? `预览将${term(selectedWorker.kind)}放在${term(locationId)}；确认行动后提交` : `Pending ${term(selectedWorker.kind)} placement at ${term(locationId)}; confirm the action to submit it`}
                    />
                  )}
                </span>
              </div>
            );
          })}

          {KILN_SPACE_IDS.map((spaceId) => {
            const point = KILN_SLOT_POINTS[spaceId];
            const ceramic = Object.values(game.ceramics).find((candidate) => candidate.stage === "loaded" && candidate.kilnSpaceId === spaceId);
            const active = activeKilnSpaceIds(game.playerCount).includes(spaceId);
            const owner = ceramic === undefined ? undefined : game.players[ceramic.ownerId];
            const shifuMarked = ceramic !== undefined && owner?.kilnYardShifuCeramicId === ceramic.id;
            return (
              <span
                className={`visual-kiln-slot ${active ? ceramic === undefined ? "is-empty" : "is-occupied" : "is-covered"} ${shifuMarked ? "is-shifu-marked" : ""}`}
                style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                data-kiln-space={spaceId}
                aria-label={!active
                  ? locale === "zh-CN" ? `${term(spaceId)}在${game.playerCount}人游戏中被遮盖` : `${term(spaceId)} covered for ${game.playerCount} players`
                  : ceramic === undefined
                    ? locale === "zh-CN" ? `${term(spaceId)}为空` : `${term(spaceId)} empty`
                    : locale === "zh-CN" ? `${term(spaceId)}已有${term(ceramic.shape)}器物${shifuMarked ? "，师傅位于此陶瓷" : ""}` : `${term(spaceId)} occupied by ${term(ceramic.shape)} ceramic${shifuMarked ? ", marked by its Shifu" : ""}`}
                key={spaceId}
              >
                {!active ? <b aria-hidden="true">{locale === "zh-CN" ? "遮盖" : "Covered"}</b> : ceramic !== undefined && <CeramicPiece ceramic={ceramic} compact />}
                {shifuMarked && owner !== undefined && <span className="kiln-shifu-marker"><Meeple kind="shifu" seatIndex={owner.seatIndex} status="placed" label={locale === "zh-CN" ? `${owner.displayName}的师傅位于此陶瓷` : `${owner.displayName}'s Shifu is on this ceramic`} /></span>}
              </span>
            );
          })}

          {IMPERIAL_TRACK_POINTS.map((point, space) => (
            <span className="visual-progress-space" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} data-progress-space={space} key={space}>
              {game.playerOrder.filter((playerId) => game.players[playerId]?.imperialRecognition === space).map((playerId, index) => {
                const player = game.players[playerId]!;
                return (
                  <i
                    className="visual-progress-marker"
                    style={{ "--marker-colour": SEAT_COLOURS[player.seatIndex], "--marker-index": index } as React.CSSProperties}
                    title={`${player.displayName} · ${locale === "zh-CN" ? "御府声望" : "Imperial Recognition"} ${space}`}
                    aria-label={locale === "zh-CN" ? `${player.displayName}位于御府声望${space}` : `${player.displayName} at Imperial Recognition ${space}`}
                    key={playerId}
                  >{player.displayName.slice(0, 1).toUpperCase()}</i>
                );
              })}
            </span>
          ))}

          {contributionPhase !== null && (
            <div className="sealed-contributions" aria-label={locale === "zh-CN" ? "控火牌状态" : "Contribution-card status"}>
              {contributionPhase.eligiblePlayerIds.map((playerId) => (
                <span key={playerId}>
                  <span className="visual-wood-card is-face-down"><span className="sr-only">{locale === "zh-CN" ? "背面朝上的控火牌" : "Face-down Contribution card"}</span></span>
                  <small>{game.players[playerId]?.displayName}<br />{contributionPhase.submittedPlayerIds.includes(playerId) ? term("locked") : (locale === "zh-CN" ? "选择中" : "Choosing")}</small>
                </span>
              ))}
            </div>
          )}

          {game.lastFiringResult !== null && (
            <div className="tabletop-firing-result" data-testid="last-firing-result" role="status">
              <FireCard modifier={game.lastFiringResult.fireModifier} />
              <span>
                <small>{locale === "zh-CN" ? `第${game.lastFiringResult.round}轮烧成` : `Round ${game.lastFiringResult.round} firing`}</small>
                <strong>{locale === "zh-CN" ? `最终火候 ${game.lastFiringResult.globalHeat}` : `Final heat ${game.lastFiringResult.globalHeat}`}</strong>
                <b>{game.lastFiringResult.baseHeat} {signed(game.lastFiringResult.fireModifier)} = {game.lastFiringResult.globalHeat}</b>
              </span>
            </div>
          )}
        </section>

        <section className="tabletop-technique-display" aria-label={locale === "zh-CN" ? "公开进阶技艺" : "Face-up Advanced Techs"}>
          <header><span>艺</span><div><strong>{locale === "zh-CN" ? "进阶技艺" : "Advanced Techs"}</strong><small>{locale === "zh-CN" ? "陶工行展示区" : "Guild & Academy display"}</small></div></header>
          {(["forming", "glazing", "firing"] as const).map((discipline) => (
            <div className="technique-discipline" key={discipline}>
              <small>{term(discipline)}</small>
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
          ? isOwnWorkTurn ? (locale === "zh-CN" ? "在你的作坊中选择1名可用工人。" : "Select an available worker in your workshop.") : (locale === "zh-CN" ? "等待当前决策。" : "Waiting for the current decision.")
          : selection.locationId === null
            ? locale === "zh-CN" ? `已选择${term(selectedWorker?.kind ?? "worker")}。请选择发光的行动地点。` : `Selected ${term(selectedWorker?.kind ?? "worker")}. Choose a glowing board location.`
            : locale === "zh-CN" ? `正在预览将${term(selectedWorker?.kind ?? "worker")}放在${term(selection.locationId)}。确认对应行动后完成放置。` : `Previewing ${term(selectedWorker?.kind ?? "worker")} at ${term(selection.locationId)}. Confirm the contextual action to place it.`}
      </p>

      {inspection !== null && (
        <div className="piece-inspection-backdrop" role="presentation" onMouseDown={() => setInspection(null)}>
          <div className="piece-inspection" role="dialog" aria-modal="true" aria-label={locale === "zh-CN" ? `查看${inspection.type === "order" ? "委托" : "技艺"} ${inspection.id}` : `Inspect ${inspection.type} ${inspection.id}`} onMouseDown={(event) => event.stopPropagation()}>
            {inspection.type === "order"
              ? <VisualOrderCard orderId={inspection.id} />
              : <VisualTechniqueTile techniqueId={inspection.id} />}
            <button className="secondary-button" type="button" autoFocus onClick={() => setInspection(null)}>{locale === "zh-CN" ? "关闭" : "Close"}</button>
          </div>
        </div>
      )}
    </section>
  );
}

function TableStatus({ game, decisionActor }: { game: PublicGameState; decisionActor: PlayerId | null }) {
  const { locale, term } = useI18n();
  return (
    <div className="tabletop-status-ribbon">
      <span><small>{locale === "zh-CN" ? "轮次" : "Round"}</small><strong>{game.round} / 5</strong></span>
      <span><small>{locale === "zh-CN" ? "阶段" : "Phase"}</small><strong data-testid="phase-name">{phaseName(game, locale)}</strong></span>
      <span><small>{locale === "zh-CN" ? "决策" : "Decision"}</small><strong data-testid="decision-player">{decisionActor === null ? (locale === "zh-CN" ? "同时决策" : "Simultaneous") : game.players[decisionActor]?.displayName}</strong></span>
      <span><small>{locale === "zh-CN" ? "公共供应" : "Supply"}</small><strong>{game.commonSupply.clay} {term("clay")} · {game.commonSupply.wood} {term("wood")} · {game.commonSupply.coins} {term("coins")}</strong></span>
    </div>
  );
}

function OpponentWorkshop({ game, player, onInspectOrder }: { game: PublicGameState; player: PublicPlayerState; onInspectOrder: (id: string) => void }) {
  const { locale } = useI18n();
  const ceramics = Object.values(game.ceramics).filter((ceramic) => ceramic.ownerId === player.id && ceramic.stage !== "sold");
  return (
    <article className={`opponent-workshop seat-${player.seatIndex}`} style={workshopBackground(player.kilnId)}>
      <header><strong>{player.displayName}</strong><small>{player.kilnId ?? (locale === "zh-CN" ? "选择窑口中" : "Choosing kiln")} · {locale === "zh-CN" ? "御府声望" : "Recognition"} {player.imperialRecognition}</small></header>
      <div className="opponent-resources"><ResourceToken kind="clay" amount={player.resources.clay} /><ResourceToken kind="wood" amount={player.resources.wood} /><ResourceToken kind="coins" amount={player.resources.coins} /></div>
      <div className="opponent-pieces">
        <span>{locale === "zh-CN" ? `${Object.values(player.workers).filter((worker) => worker.status === "available").length}名工人可用` : `${Object.values(player.workers).filter((worker) => worker.status === "available").length} workers ready`}</span>
        <span>{locale === "zh-CN" ? `${ceramics.length}件陶瓷` : `${ceramics.length} ceramics`}</span>
        <span>{locale === "zh-CN" ? `${player.techniques.length}个进阶技艺` : `${player.techniques.length} Advanced Techs`}</span>
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
  const { locale, term } = useI18n();
  const ceramics = Object.values(game.ceramics).filter((ceramic) => ceramic.ownerId === player.id && ceramic.stage !== "sold");
  return (
    <section className={`player-workshop-table ${own ? "is-own" : ""}`} style={workshopBackground(player.kilnId)} aria-label={locale === "zh-CN" ? `${player.displayName}的作坊` : `${player.displayName}'s workshop`}>
      <div className="workshop-art-wash" aria-hidden="true" />
      <header className="workshop-titlebar">
        <div><span>{player.kilnId ?? "窑"}</span><strong>{player.displayName}</strong><small>{player.kilnId === null ? (locale === "zh-CN" ? "选择窑口传承" : "Select a kiln tradition") : (locale === "zh-CN" ? `${player.kilnId}作坊` : `${player.kilnId} workshop`)} · {locale === "zh-CN" ? "御府声望" : "Imperial Recognition"} {player.imperialRecognition}</small></div>
        <div className="workshop-resources"><ResourceToken kind="clay" amount={player.resources.clay} /><ResourceToken kind="wood" amount={player.resources.wood} /><ResourceToken kind="coins" amount={player.resources.coins} /></div>
      </header>

      <div className="workshop-zones">
        <section className="workshop-worker-supply" aria-label={locale === "zh-CN" ? "可用工人" : "Available workers"}>
          <h3>{locale === "zh-CN" ? "工人" : "Workers"}</h3>
          <div>
            {Object.values(player.workers).map((worker) => {
              const canSelect = isOwnWorkTurn && worker.status === "available";
              return canSelect ? (
                <button
                  className="meeple-button"
                  type="button"
                  onClick={() => selectedWorkerId === worker.id ? onClearSelection() : onSelectWorker(worker.id)}
                  aria-pressed={selectedWorkerId === worker.id}
                  aria-label={locale === "zh-CN" ? `选择${term(worker.kind)} ${worker.id}` : `Select ${term(worker.kind)} ${worker.id}`}
                  data-worker-id={worker.id}
                  key={worker.id}
                >
                  <Meeple kind={worker.kind} seatIndex={player.seatIndex} status={worker.status} selected={selectedWorkerId === worker.id} label={`${term(worker.kind)}，${term("available")}`} />
                </button>
              ) : (
                <span className="meeple-button" data-worker-id={worker.id} key={worker.id}>
                  <Meeple kind={worker.kind} seatIndex={player.seatIndex} status={worker.status} label={`${term(worker.kind)}，${term(worker.status)}`} />
                </span>
              );
            })}
          </div>
        </section>

        <section className="workshop-ceramic-shelf" aria-label={locale === "zh-CN" ? "作坊陶瓷" : "Workshop ceramics"}>
          <h3>{locale === "zh-CN" ? "陶瓷" : "Ceramics"}</h3>
          <div>{ceramics.length === 0 ? <p>{locale === "zh-CN" ? "尚无陶瓷" : "No ceramics yet"}</p> : ceramics.map((ceramic) => <CeramicPiece ceramic={ceramic} key={ceramic.id} />)}</div>
        </section>

        <section className="workshop-active-orders" aria-label={locale === "zh-CN" ? "未完成委托" : "Active Orders"}>
          <h3>{locale === "zh-CN" ? "未完成委托" : "Active Orders"} · {player.orderHand.length}</h3>
          <div>{player.orderHand.length === 0 ? <p>{locale === "zh-CN" ? "没有未完成委托" : "No open Orders"}</p> : player.orderHand.map((orderId) => <VisualOrderCard orderId={orderId} compact onInspect={onInspectOrder} key={orderId} />)}</div>
        </section>

        <section className="workshop-owned-techniques" aria-label={locale === "zh-CN" ? "已拥有进阶技艺" : "Owned Advanced Techs"}>
          <h3>{locale === "zh-CN" ? "进阶技艺" : "Advanced Techs"} · {player.techniques.length}</h3>
          <div>{player.techniques.length === 0 ? <p>{locale === "zh-CN" ? "尚无进阶技艺" : "No Advanced Techs yet"}</p> : player.techniques.map((technique) => <VisualTechniqueTile techniqueId={technique.id} exhausted={technique.exhausted} onInspect={onInspectTechnique} key={technique.id} />)}</div>
        </section>
      </div>
    </section>
  );
}

function CardDeck({ label, remaining, className }: { label: string; remaining: number; className: string }) {
  const { locale } = useI18n();
  return <span className={`tabletop-card-deck ${className}`} aria-label={locale === "zh-CN" ? `${label}牌库，剩余${remaining}张` : `${label} deck, ${remaining} cards remaining`}><b>{label}</b><small>{locale === "zh-CN" ? `剩余${remaining}` : `${remaining} remain`}</small></span>;
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

function phaseName(game: PublicGameState, locale: Locale): string {
  const local = (english: string, chinese: string): string => locale === "zh-CN" ? chinese : english;
  switch (game.phase.type) {
    case "setup_kiln_selection": return local("Kiln selection", "选择窑口");
    case "setup_starting_orders": return local("Starting Orders", "起始委托");
    case "setup_starting_tech": return local("Starting Tech", "起始技艺");
    case "work": return local("Work Phase", "作业阶段");
    case "work_imperial_priority": return local("Imperial Priority", "御烧优先");
    case "work_office_orders": return local("Commission Market — Orders", "瓷牙行 — 委托");
    case "work_guild": return local("Guild & Academy", "陶工行");
    case "firing_before_contribution": return local("Pre-firing Techniques", "烧成前技艺");
    case "firing_contributions": return local("Secret Contributions", "秘密控火");
    case "firing_reposition": return local("Shifu kiln reposition", "窑坊师傅调位");
    case "firing_before_quality": return local("Kiln ability", "窑口能力");
    case "firing_second_before_quality": return local("Second Firing", "复烧");
    case "firing_after_quality": return local("After-Quality abilities", "品质判定后能力");
    case "firing_workshop_seconds": return local("Flawed salvage", "瑕品处理");
    case "orders": return local("Order Phase", "委托阶段");
    case "cleanup_orders": return local("Cleanup Orders", "整理委托");
    case "presentation": return local("End-game Exhibition", "终局陈列");
    case "finished": return local("Final results", "最终计分");
  }
}
