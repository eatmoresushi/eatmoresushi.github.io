import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import {
  BASE_HEAT_START,
  GAME_CONFIG,
  IMPERIAL_PROGRESS,
  KILN_DEFINITIONS,
  KILN_SPACE_DEFINITIONS,
  KILN_SPACE_IDS,
  LOCATION_DEFINITIONS,
  ORDER_DEFINITIONS,
  STARTING_TECHNIQUE_DEFINITIONS,
  TECHNIQUE_DEFINITIONS,
  activeKilnSpaceIds,
  currentDecisionActor,
  locationCapacity,
  preferredHeat,
} from "../game";
import type {
  CeramicState,
  Decoration,
  Glaze,
  LocationId,
  OrderId,
  PlayerId,
  Quality,
  Shape,
  StartingTechniqueId,
  TechniqueDiscipline,
  TechniqueId,
  WorkerId,
  WorkerKind,
} from "../game";
import type {
  AuthoritativeCommand,
  PendingContribution,
  PrivateDecisionState,
  PublicEventRecord,
  PublicGameState,
  PublicPlayerState,
} from "../multiplayer";
import { ActionPanel } from "./ActionPanel";
import { useI18n } from "./i18n";
import type { Locale } from "./i18n";
import "./mock/tabletop-mock.css";

type SendCommand = (command: AuthoritativeCommand) => Promise<boolean>;

type Inspection =
  | { type: "player"; id: PlayerId }
  | { type: "order"; id: OrderId }
  | { type: "technique"; id: TechniqueId }
  | { type: "log" }
  | null;

const BOARD_LOCATIONS: Array<{ id: LocationId; glyph: string; position: string }> = [
  { id: "materials_yard", glyph: "泥", position: "north-west" },
  { id: "forming_studio", glyph: "陶", position: "north" },
  { id: "glaze_workshop", glyph: "釉", position: "north-east" },
  { id: "market_imperial_office", glyph: "单", position: "west" },
  { id: "guild_academy", glyph: "艺", position: "east" },
  { id: "labour", glyph: "工", position: "south-west" },
  { id: "kiln_yard", glyph: "窑", position: "south" },
];

const ACCENTS = ["cinnabar", "river", "ochre", "plum"] as const;
type Accent = (typeof ACCENTS)[number];

function text(locale: Locale, english: string, chinese: string): string {
  return locale === "zh-CN" ? chinese : english;
}

function accent(player: PublicPlayerState): Accent {
  return ACCENTS[player.seatIndex] ?? ACCENTS[0];
}

function seatLabel(player: PublicPlayerState): string {
  return `P${player.seatIndex + 1}`;
}

function playerVp(game: PublicGameState, player: PublicPlayerState): number {
  return game.finalResult?.scores[player.id]?.total
    ?? player.score.orderVp
      + player.score.kilnTraditionVp
      + player.score.imperialOverflowVp
      + (player.imperialAudienceVpAwarded ? 6 : 0);
}

function findWorker(game: PublicGameState, workerId: WorkerId): {
  player: PublicPlayerState;
  worker: PublicPlayerState["workers"][string];
} | null {
  for (const player of Object.values(game.players)) {
    const worker = player.workers[workerId];
    if (worker !== undefined) return { player, worker };
  }
  return null;
}

function locationReason(
  game: PublicGameState,
  player: PublicPlayerState,
  workerId: WorkerId | null,
  locationId: LocationId,
  locale: Locale,
): string | null {
  if (game.phase.type !== "work" || game.phase.activePlayerId !== player.id) {
    return text(locale, "Waiting for the current decision", "正在等待当前决策");
  }
  if (workerId === null) return null;
  const worker = player.workers[workerId];
  if (worker?.status !== "available") return text(locale, "Worker is not available", "该工人当前不可用");
  if (locationId === "guild_academy" && player.techniques.length >= GAME_CONFIG.techniques.maxOwned) {
    return text(locale, "Advanced Tech limit reached (2 / 2)", "已达进阶技艺上限（2 / 2）");
  }
  const capacity = locationCapacity(locationId, game.playerCount);
  const occupied = game.actionBoard.placements[locationId].length;
  if (worker.kind === "apprentice" && occupied >= capacity) {
    return text(locale, "Full — select your Shifu to overfill", "已满——可选择师傅超容量放置");
  }
  return null;
}

export interface TabletopGameExperienceProps {
  game: PublicGameState;
  ownPlayerId: PlayerId;
  ownPendingContribution: PendingContribution | null;
  ownPrivateDecision?: PrivateDecisionState | undefined;
  events: PublicEventRecord[];
  describeEvent: (record: PublicEventRecord, game: PublicGameState, locale: Locale) => string;
  busy: boolean;
  send: SendCommand;
}

export function TabletopGameExperience({
  game,
  ownPlayerId,
  ownPendingContribution,
  ownPrivateDecision,
  events,
  describeEvent,
  busy,
  send,
}: TabletopGameExperienceProps) {
  const { locale, term } = useI18n();
  const ownPlayer = game.players[ownPlayerId];
  const [selectedWorkerId, setSelectedWorkerId] = useState<WorkerId | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<LocationId | null>(null);
  const [inspection, setInspection] = useState<Inspection>(null);
  const [controlsOpen, setControlsOpen] = useState(game.phase.type !== "work");
  const decisionActor = currentDecisionActor(game.phase);
  const ownWorkTurn = game.phase.type === "work" && game.phase.activePlayerId === ownPlayerId;
  const selectedWorker = selectedWorkerId === null ? undefined : ownPlayer?.workers[selectedWorkerId];
  const selectedDefinition = selectedLocation === null ? null : LOCATION_DEFINITIONS[selectedLocation];

  useEffect(() => {
    if (selectedWorkerId === null) return;
    const worker = game.players[ownPlayerId]?.workers[selectedWorkerId];
    if (!ownWorkTurn || worker?.status !== "available") {
      setSelectedWorkerId(null);
      setSelectedLocation(null);
    }
  }, [game.revision, ownPlayerId, ownWorkTurn, selectedWorkerId, game.players]);

  useEffect(() => {
    if (game.phase.type !== "work") setControlsOpen(true);
  }, [game.phase.type]);

  if (ownPlayer === undefined) return null;

  function selectWorker(workerId: WorkerId): void {
    if (!ownWorkTurn || busy) return;
    setSelectedWorkerId((current) => current === workerId ? null : workerId);
    setSelectedLocation(null);
  }

  function selectLocation(locationId: LocationId): void {
    setSelectedLocation(locationId);
    setInspection(null);
    setControlsOpen(true);
  }

  async function sendFromTable(command: AuthoritativeCommand): Promise<boolean> {
    const accepted = await send(command);
    if (accepted) {
      setSelectedWorkerId(null);
      setSelectedLocation(null);
      setControlsOpen(false);
    }
    return accepted;
  }

  const activeName = decisionActor === null
    ? text(locale, "Simultaneous decisions", "同时决策")
    : game.players[decisionActor]?.displayName ?? decisionActor;
  const instruction = !ownWorkTurn
    ? text(locale, `Waiting for ${activeName}`, `等待${activeName}`)
    : selectedWorker === undefined
      ? text(locale, "Choose one of your available workers", "选择一名可用工人")
      : selectedDefinition === null
        ? text(locale, `Choose an action space for your ${term(selectedWorker.kind)}`, `为你的${term(selectedWorker.kind)}选择行动地点`)
        : locationReason(game, ownPlayer, selectedWorker.id, selectedLocation!, locale) === null
          ? text(locale, `Resolve ${selectedDefinition.name}`, `结算${selectedDefinition.nameZh}`)
          : text(locale, `Review ${selectedDefinition.name}`, `查看${selectedDefinition.nameZh}`);

  return (
    <div className="kiln-mock-root kiln-live-root" data-testid="tabletop-live-ui">
      <a className="kiln-mock-skip" href="#kiln-live-actionbar">{text(locale, "Skip to game controls", "跳到游戏控制")}</a>

      <header className="kiln-mock-topbar kiln-live-topbar">
        <div className="kiln-mock-brand" aria-label={text(locale, "Live game table", "实时游戏桌面")}>
          <span aria-hidden="true">窑</span>
          <span><strong>{text(locale, "LIVE TABLE", "实时桌面")}</strong><small>V{game.rulesVersion} · {game.gameId}</small></span>
        </div>
        <div className="kiln-mock-turn-summary" aria-label={text(locale, "Current game status", "当前游戏状态")}>
          <span><small>{text(locale, "Round", "轮次")}</small><strong>{game.round} / {GAME_CONFIG.rounds}</strong></span>
          <span><small>{text(locale, "Phase", "阶段")}</small><strong>{phaseName(game, locale)}</strong></span>
          <span className={decisionActor === ownPlayerId || decisionActor === null ? "is-current" : ""}><small>{text(locale, "Current decision", "当前决策")}</small><strong>{decisionActor === ownPlayerId ? text(locale, "Your turn", "轮到你") : activeName}</strong></span>
          <span><small>{text(locale, "Revision", "版本")}</small><strong>{game.revision} · #{game.eventSequence}</strong></span>
        </div>
        <div className="kiln-mock-header-actions">
          <span className="kiln-mock-concept-label kiln-live-state-label">{text(locale, "SERVER-AUTHORITATIVE", "服务器权威状态")}</span>
          <button className="kiln-mock-icon-button" type="button" onClick={() => { setInspection(null); setControlsOpen(true); }} aria-label={text(locale, "Open game controls", "打开游戏控制")} title={text(locale, "Game controls", "游戏控制")}>⚙</button>
          <button className="kiln-mock-icon-button" type="button" onClick={() => { setControlsOpen(false); setInspection({ type: "log" }); }} aria-label={text(locale, "Open game log", "打开游戏记录")} title={text(locale, "Game log", "游戏记录")}>☰</button>
        </div>
      </header>

      <section className="kiln-mock-player-dock" aria-label={text(locale, "Players", "玩家")}>
        {game.playerOrder.map((playerId) => {
          const player = game.players[playerId]!;
          const kiln = player.kilnId === null ? null : KILN_DEFINITIONS[player.kilnId];
          const availableWorkers = Object.values(player.workers).filter((worker) => worker.status === "available").length;
          return (
            <button
              className={`kiln-mock-player kiln-mock-accent-${accent(player)} ${playerId === ownPlayerId ? "is-you" : ""} ${playerId === decisionActor ? "is-active" : ""}`}
              type="button"
              onClick={() => { setControlsOpen(false); setInspection({ type: "player", id: playerId }); }}
              aria-label={text(locale, `Inspect ${player.displayName}'s workshop`, `查看${player.displayName}的作坊`)}
              key={playerId}
            >
              <span className="kiln-mock-avatar" aria-hidden="true">{player.displayName.slice(0, 1).toUpperCase()}</span>
              <span className="kiln-mock-player-name"><strong>{player.displayName}{playerId === ownPlayerId ? text(locale, " · You", " · 你") : ""}</strong><small>{kiln === null ? text(locale, "Choosing kiln", "正在选择窑口") : locale === "zh-CN" ? kiln.nameZh : kiln.name}</small></span>
              <span className="kiln-mock-player-score"><small>{text(locale, "VP", "分")}</small><b>{playerVp(game, player)}</b></span>
              <span className="kiln-mock-player-resources" aria-label={text(locale, "Resources", "资源")}><i>泥 {player.resources.clay}</i><i>柴 {player.resources.wood}</i><i>钱 {player.resources.coins}</i></span>
              <span className="kiln-mock-player-public"><i>{player.orderHand.length} {text(locale, "Orders", "委托")}</i><i>{player.techniques.length + (player.startingTechniqueId === null ? 0 : 1)} {text(locale, "Techs", "技艺")}</i><i>{availableWorkers} {text(locale, "workers", "工人")}</i></span>
              {player.id === game.firstPlayerId && <span className="kiln-mock-first-player" title={text(locale, "First Player", "起始玩家")}>一</span>}
            </button>
          );
        })}
      </section>

      <main className="kiln-mock-table" id="kiln-live-board">
        <MarketShelf game={game} locale={locale} onInspect={(id) => { setControlsOpen(false); setInspection({ type: "order", id }); }} />
        <div className="kiln-mock-play-area">
          <div className="kiln-mock-board-scroll">
            <section className="kiln-mock-board" aria-label={text(locale, "Shared game board", "共享游戏板")}>
              <RoundTrack game={game} locale={locale} />
              <div className="kiln-mock-action-ring">
                {BOARD_LOCATIONS.map(({ id, glyph, position }) => (
                  <ActionSpace
                    game={game}
                    ownPlayer={ownPlayer}
                    id={id}
                    glyph={glyph}
                    position={position}
                    locale={locale}
                    selectedWorkerId={selectedWorkerId}
                    selected={selectedLocation === id}
                    onChoose={() => selectLocation(id)}
                    key={id}
                  />
                ))}
                <SharedKiln game={game} locale={locale} />
                <FiringDeck game={game} locale={locale} />
              </div>
              <ImperialTrack game={game} locale={locale} />
            </section>
          </div>
          <TechniqueMarket game={game} locale={locale} onInspect={(id) => { setControlsOpen(false); setInspection({ type: "technique", id }); }} />
        </div>
        <OwnWorkshop
          game={game}
          player={ownPlayer}
          locale={locale}
          selectedWorkerId={selectedWorkerId}
          canSelectWorker={ownWorkTurn && !busy}
          onChooseWorker={selectWorker}
          onInspectOrder={(id) => { setControlsOpen(false); setInspection({ type: "order", id }); }}
          onInspectTechnique={(id) => { setControlsOpen(false); setInspection({ type: "technique", id }); }}
        />
      </main>

      <section className="kiln-mock-actionbar" id="kiln-live-actionbar" aria-label={text(locale, "Current action", "当前行动")}>
        <div className="kiln-mock-action-copy">
          <span aria-hidden="true">{selectedDefinition?.nameZh.slice(0, 1) ?? (selectedWorker === undefined ? "人" : "位")}</span>
          <div><small>{text(locale, "YOUR ACTION", "你的行动")}</small><strong>{instruction}</strong><p>{selectedLocation === null ? text(locale, "Select pieces on the table, then use the authoritative control panel to confirm.", "在桌面选择组件，然后在权威控制面板中确认。") : text(locale, "The selected space opens its existing validated action form.", "所选地点将打开现有的服务器验证行动表单。")}</p></div>
        </div>
        <div className="kiln-mock-action-buttons">
          {(selectedWorkerId !== null || selectedLocation !== null) && <button className="kiln-mock-button kiln-mock-button-ghost" type="button" onClick={() => { setSelectedWorkerId(null); setSelectedLocation(null); }}>{text(locale, "Clear", "清除")}</button>}
          <button className="kiln-mock-button kiln-mock-button-primary" type="button" onClick={() => { setInspection(null); setControlsOpen(true); }}>{selectedLocation === null ? text(locale, "Open controls", "打开控制") : text(locale, "Resolve action", "结算行动")}</button>
        </div>
      </section>

      {controlsOpen && (
        <ModalPanel title={selectedDefinition === null ? text(locale, "Game controls", "游戏控制") : locale === "zh-CN" ? selectedDefinition.nameZh : selectedDefinition.name} eyebrow={text(locale, "AUTHORITATIVE ACTION", "权威行动")} locale={locale} onClose={() => setControlsOpen(false)} className="kiln-live-controls-panel">
          <ActionPanel
            game={game}
            ownPlayerId={ownPlayerId}
            ownPendingContribution={ownPendingContribution}
            ownPrivateDecision={ownPrivateDecision}
            selectedLocation={selectedLocation}
            selectedWorkerId={selectedWorkerId}
            busy={busy}
            send={sendFromTable}
          />
        </ModalPanel>
      )}

      {inspection !== null && (
        <Inspector inspection={inspection} game={game} events={events} describeEvent={describeEvent} locale={locale} onClose={() => setInspection(null)} />
      )}
    </div>
  );
}

function MarketShelf({ game, locale, onInspect }: { game: PublicGameState; locale: Locale; onInspect: (id: OrderId) => void }) {
  return (
    <section className="kiln-mock-market" aria-labelledby="kiln-live-market-title">
      <div className="kiln-mock-section-title"><span aria-hidden="true">单</span><div><small>{text(locale, "COMMISSION MARKET", "瓷牙行")}</small><strong id="kiln-live-market-title">{text(locale, "Face-up Main Orders", "公开主委托")}</strong></div></div>
      <div className="kiln-mock-order-deck" role="img" aria-label={text(locale, `Main Order deck, ${game.decks.marketRemaining} remaining`, `主委托牌库，剩余${game.decks.marketRemaining}张`)}><span aria-hidden="true">委</span><small>{game.decks.marketRemaining}</small></div>
      <div className="kiln-mock-order-row">{game.displays.market.map((id, index) => <OrderCard id={id} locale={locale} displayIndex={index + 1} onInspect={onInspect} key={id} />)}</div>
      <div className="kiln-mock-market-note"><small>{text(locale, "Reserve from the display · refills immediately", "从展示区承接 · 立即补牌")}</small><strong>{text(locale, `Live Round ${game.round} display`, `第${game.round}轮实时展示`)}</strong></div>
    </section>
  );
}

function OrderCard({ id, locale, displayIndex, compact = false, onInspect }: { id: OrderId; locale: Locale; displayIndex?: number; compact?: boolean; onInspect: (id: OrderId) => void }) {
  const order = ORDER_DEFINITIONS[id];
  if (order === undefined) return null;
  return (
    <button className={`kiln-mock-order-card ${order.crowns > 0 ? "is-crown" : ""} ${compact ? "is-compact" : ""}`} type="button" onClick={() => onInspect(id)} aria-label={text(locale, `Inspect Order ${id}`, `查看委托 ${id}`)}>
      {displayIndex !== undefined && <span className="kiln-mock-display-index">{displayIndex}</span>}
      <header><b>{id}</b><span>{"♛".repeat(order.crowns)}</span></header>
      <div className="kiln-mock-order-seal" aria-hidden="true">{order.ceramics.length}</div>
      <p>{locale === "zh-CN" ? order.requirementsZh : order.requirements}</p>
      <footer><span><small>{text(locale, "MIN", "最低")}</small><b>{qualityLabel(order.minQuality, locale)}</b></span><span><small>{text(locale, "VP", "分")}</small><b>{order.vp}</b></span><span><small>{text(locale, "COIN", "钱")}</small><b>{order.coins}</b></span></footer>
    </button>
  );
}

function StaticOrderCard({ id, locale }: { id: OrderId; locale: Locale }) {
  const order = ORDER_DEFINITIONS[id];
  if (order === undefined) return null;
  return (
    <article className={`kiln-mock-order-card kiln-mock-static-order ${order.crowns > 0 ? "is-crown" : ""}`}>
      <header><b>{id}</b><span>{"♛".repeat(order.crowns)}</span></header><div className="kiln-mock-order-seal" aria-hidden="true">{order.ceramics.length}</div><p>{locale === "zh-CN" ? order.requirementsZh : order.requirements}</p>
      <footer><span><small>{text(locale, "MIN", "最低")}</small><b>{qualityLabel(order.minQuality, locale)}</b></span><span><small>{text(locale, "VP", "分")}</small><b>{order.vp}</b></span><span><small>{text(locale, "COIN", "钱")}</small><b>{order.coins}</b></span></footer>
    </article>
  );
}

function RoundTrack({ game, locale }: { game: PublicGameState; locale: Locale }) {
  return (
    <section className="kiln-mock-round-track" aria-label={text(locale, `Round track, round ${game.round} of ${GAME_CONFIG.rounds}`, `轮次轨，第${game.round}轮，共${GAME_CONFIG.rounds}轮`)}>
      <strong>{text(locale, "ROUND", "轮次")}</strong>
      {Array.from({ length: GAME_CONFIG.rounds }, (_, index) => index + 1).map((round) => <span className={round === game.round ? "is-current" : round < game.round ? "is-complete" : ""} key={round}><i>{round}</i><small>{round === game.round ? phaseName(game, locale) : ""}</small></span>)}
    </section>
  );
}

function ActionSpace({ game, ownPlayer, id, glyph, position, locale, selectedWorkerId, selected, onChoose }: { game: PublicGameState; ownPlayer: PublicPlayerState; id: LocationId; glyph: string; position: string; locale: Locale; selectedWorkerId: WorkerId | null; selected: boolean; onChoose: () => void }) {
  const definition = LOCATION_DEFINITIONS[id];
  const occupants = game.actionBoard.placements[id].map((workerId) => findWorker(game, workerId)).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const worker = selectedWorkerId === null ? undefined : ownPlayer.workers[selectedWorkerId];
  const reason = locationReason(game, ownPlayer, selectedWorkerId, id, locale);
  const maximumCapacity = definition.capacity["4"];
  const activeCapacity = definition.capacity[String(game.playerCount) as "2" | "3" | "4"];
  const legal = worker?.status === "available" && reason === null;
  const effect = worker?.kind === "shifu" ? locale === "zh-CN" ? definition.shifuZh : definition.shifu : locale === "zh-CN" ? definition.apprenticeZh : definition.apprentice;
  return (
    <button className={`kiln-mock-action-space position-${position} ${legal ? "is-available" : ""} ${worker !== undefined && !legal ? "is-illegal" : ""} ${selected ? "is-selected" : ""}`} type="button" onClick={onChoose} aria-pressed={selected} data-location-id={id}>
      <header><span aria-hidden="true">{glyph}</span><div><strong>{locale === "zh-CN" ? definition.nameZh : definition.name}</strong><small>{worker === undefined ? text(locale, "Choose a worker", "选择工人") : reason ?? (worker.kind === "shifu" && activeCapacity !== null && occupants.length >= activeCapacity ? text(locale, "Shifu may overfill", "师傅可超容量") : text(locale, `${worker.kind === "shifu" ? "Shifu" : "Apprentice"} effect`, `${worker.kind === "shifu" ? "师傅" : "学徒"}效果`))}</small></div></header>
      <p>{effect}</p>
      <footer>
        <span className="kiln-mock-capacity" aria-label={activeCapacity === null ? text(locale, "Unlimited capacity", "无限容量") : text(locale, `${occupants.length} of ${activeCapacity} active spaces occupied in this ${game.playerCount}-player game`, `${game.playerCount}人游戏：已占${occupants.length}/${activeCapacity}个可用位置`)}>
          {maximumCapacity === null ? <i aria-hidden="true">∞</i> : Array.from({ length: maximumCapacity }, (_, index) => {
            const minimumPlayers = index >= 2 ? index + 1 : null;
            const locked = activeCapacity !== null && index >= activeCapacity;
            return <i aria-hidden="true" className={`${index < occupants.length && !locked ? "is-filled" : ""} ${locked ? "is-locked" : ""}`} data-min-players={minimumPlayers ?? undefined} key={index} title={minimumPlayers === null ? undefined : locked ? text(locale, `Locked — requires ${minimumPlayers} players`, `未开放——需要${minimumPlayers}名玩家`) : text(locale, `Available with ${minimumPlayers} or more players`, `${minimumPlayers}人及以上可用`)}>{minimumPlayers === null ? "" : `${minimumPlayers}P`}</i>;
          })}
        </span>
        <span className="kiln-mock-occupants">{occupants.map(({ player, worker }) => {
          const markedShifu = id === "kiln_yard" && worker.kind === "shifu" && player.kilnYardShifuCeramicId !== null;
          return markedShifu ? null : <WorkerToken player={player} kind={worker.kind} small locale={locale} key={worker.id} />;
        })}</span>
      </footer>
    </button>
  );
}

function SharedKiln({ game, locale }: { game: PublicGameState; locale: Locale }) {
  const activeSpaces = new Set(activeKilnSpaceIds(game.playerCount));
  const loaded = Object.values(game.ceramics).filter((ceramic) => ceramic.stage === "loaded" && ceramic.kilnSpaceId !== "imperial");
  const currentBase = game.firingContext?.baseHeat ?? BASE_HEAT_START;
  const currentFire = game.firingContext?.fireModifier ?? game.lastFiringResult?.fireModifier ?? null;
  return (
    <section className="kiln-mock-shared-kiln" aria-labelledby="kiln-live-kiln-title">
      <header><div><small>{text(locale, "BASE HEAT", "基础火候")}</small><strong>{currentBase}</strong></div><span aria-hidden="true">火</span><div><small>{text(locale, "LAST FIRE", "上次窑火")}</small><strong>{currentFire === null ? "—" : signed(currentFire)}</strong></div></header>
      <div className="kiln-mock-kiln-title"><small>{text(locale, "CENTRAL FIRING BOARD", "共窑板")}</small><strong id="kiln-live-kiln-title">{text(locale, "Shared Kiln", "共窑")}</strong></div>
      <div className="kiln-mock-kiln-zones">{(["high", "middle", "low"] as const).map((zone) => {
        const spaces = KILN_SPACE_IDS.filter((id) => KILN_SPACE_DEFINITIONS[id].zone === zone);
        const modifier = zone === "high" ? 1 : zone === "low" ? -1 : 0;
        return (
          <div className={`kiln-mock-kiln-zone is-${zone}`} key={zone}>
            <span><b>{locale === "zh-CN" ? zoneZh(zone) : titleCase(zone)}</b><i>{signed(modifier)}</i></span>
            <div>{spaces.map((spaceId) => {
              const ceramic = loaded.find((candidate) => candidate.stage === "loaded" && candidate.kilnSpaceId === spaceId);
              const active = activeSpaces.has(spaceId);
              const minimumPlayers = minimumPlayersForKilnSpace(spaceId);
              if (!active) return <i className="kiln-mock-empty-slot is-locked" data-min-players={minimumPlayers} aria-label={text(locale, `Locked kiln space — requires ${minimumPlayers} players`, `未开放窑位——需要${minimumPlayers}名玩家`)} key={spaceId}>{minimumPlayers}P</i>;
              return ceramic === undefined ? <i className="kiln-mock-empty-slot" aria-label={text(locale, "Empty kiln space", "空窑位")} key={spaceId} /> : <Ceramic ceramic={ceramic} game={game} locale={locale} compact inspectable kilnZone={zone} kilnZoneModifier={modifier} key={ceramic.id} />;
            })}</div>
          </div>
        );
      })}</div>
      <footer><span>{text(locale, "Fires after all players pass", "所有玩家跳过后烧成")}</span><strong>{text(locale, `${loaded.length} / ${activeSpaces.size} occupied`, `已占 ${loaded.length} / ${activeSpaces.size}`)}</strong></footer>
    </section>
  );
}

function FiringDeck({ game, locale }: { game: PublicGameState; locale: Locale }) {
  const result = game.firingContext?.globalHeat !== null && game.firingContext?.globalHeat !== undefined && game.firingContext.baseHeat !== null && game.firingContext.fireModifier !== null
    ? { baseHeat: game.firingContext.baseHeat, fireModifier: game.firingContext.fireModifier, globalHeat: game.firingContext.globalHeat }
    : game.lastFiringResult;
  return (
    <section className="kiln-mock-firing-deck" aria-label={text(locale, `Fire deck, ${game.decks.fireRemaining} remaining`, `窑火牌库，剩余${game.decks.fireRemaining}张`)}>
      <div className="kiln-mock-fire-card"><span aria-hidden="true">火</span><small>{game.decks.fireRemaining}</small></div>
      <div><small>{text(locale, "LAST FIRING", "上次烧成")}</small><strong>{result === null ? "—" : `${result.baseHeat} ${signed(result.fireModifier)} = ${result.globalHeat}`}</strong><p>{text(locale, "Global Heat", "全窑火候")}</p></div>
    </section>
  );
}

function ImperialTrack({ game, locale }: { game: PublicGameState; locale: Locale }) {
  return (
    <section className="kiln-mock-imperial-track" aria-label={text(locale, "Imperial Recognition track", "御府声望轨")}>
      <div className="kiln-mock-track-heading"><span aria-hidden="true">御</span><div><small>{text(locale, "IMPERIAL RECOGNITION", "御府声望")}</small><strong>{text(locale, "Court recognition and rewards", "宫廷认可与奖赏")}</strong></div></div>
      <ol>{IMPERIAL_PROGRESS.track.map((space) => (
        <li key={space.space}><span className="kiln-mock-track-number">{space.space}</span><div><strong>{locale === "zh-CN" ? space.titleZh : space.title}</strong><small>{locale === "zh-CN" ? space.rewardZh ?? "—" : space.reward ?? "—"}</small></div><span className="kiln-mock-track-markers">{game.playerOrder.filter((id) => game.players[id]?.imperialRecognition === space.space).map((id) => { const player = game.players[id]!; return <i className={`kiln-mock-accent-${accent(player)}`} title={player.displayName} key={id}>{player.displayName.slice(0, 1).toUpperCase()}</i>; })}</span></li>
      ))}</ol>
    </section>
  );
}

function TechniqueMarket({ game, locale, onInspect }: { game: PublicGameState; locale: Locale; onInspect: (id: TechniqueId) => void }) {
  return (
    <aside className="kiln-mock-tech-market" aria-labelledby="kiln-live-tech-title">
      <div className="kiln-mock-section-title"><span aria-hidden="true">艺</span><div><small>{text(locale, "GUILD & ACADEMY", "陶工行")}</small><strong id="kiln-live-tech-title">{text(locale, "Face-up Techs", "公开进阶技艺")}</strong></div></div>
      {(["forming", "glazing", "firing"] as TechniqueDiscipline[]).map((discipline) => <section className={`kiln-mock-tech-discipline is-${discipline}`} key={discipline}><header><strong>{locale === "zh-CN" ? disciplineZh(discipline) : titleCase(discipline)}</strong><small>{text(locale, "deck", "牌库")} · {game.decks.techniqueRemaining[discipline]}</small></header><div>{game.displays.techniques[discipline].map((id) => <TechniqueTile id={id} locale={locale} onInspect={onInspect} key={id} />)}{game.displays.techniques[discipline].length === 0 && <span className="kiln-live-empty-tile">{text(locale, "Empty", "空")}</span>}</div></section>)}
    </aside>
  );
}

function TechniqueTile({ id, locale, compact = false, exhausted = false, onInspect }: { id: TechniqueId; locale: Locale; compact?: boolean; exhausted?: boolean; onInspect: (id: TechniqueId) => void }) {
  const technique = TECHNIQUE_DEFINITIONS[id];
  if (technique === undefined) return null;
  return (
    <button className={`kiln-mock-tech-tile is-${technique.discipline} ${compact ? "is-compact" : ""} ${exhausted ? "is-exhausted" : ""}`} type="button" onClick={() => onInspect(id)} aria-label={text(locale, `Inspect ${technique.name}`, `查看${technique.nameZh}`)}>
      <header><span>{id}</span><b>{technique.cost} ◉</b></header><strong>{locale === "zh-CN" ? technique.nameZh : technique.name}</strong>{!compact && <p>{locale === "zh-CN" ? technique.abilityZh : technique.ability}</p>}<footer>{technique.oncePerRound ? text(locale, "Once / round", "每轮一次") : text(locale, "Continuous", "持续生效")}</footer>{exhausted && <i>{text(locale, "Used", "已用")}</i>}
    </button>
  );
}

function StaticTechniqueTile({ id, locale, exhausted = false }: { id: TechniqueId; locale: Locale; exhausted?: boolean }) {
  const technique = TECHNIQUE_DEFINITIONS[id];
  if (technique === undefined) return null;
  return <article className={`kiln-mock-tech-tile kiln-mock-static-tech is-${technique.discipline} ${exhausted ? "is-exhausted" : ""}`}><header><span>{id}</span><b>{technique.cost} ◉</b></header><strong>{locale === "zh-CN" ? technique.nameZh : technique.name}</strong><p>{locale === "zh-CN" ? technique.abilityZh : technique.ability}</p><footer>{technique.oncePerRound ? text(locale, "Once / round", "每轮一次") : text(locale, "Continuous", "持续生效")}</footer>{exhausted && <i>{text(locale, "Used", "已用")}</i>}</article>;
}

function StartingTechniqueTile({ id, locale, compact = false }: { id: StartingTechniqueId; locale: Locale; compact?: boolean }) {
  const technique = STARTING_TECHNIQUE_DEFINITIONS[id];
  return <article className={`kiln-mock-starting-tech ${compact ? "is-compact" : ""}`}><header><span>{id}</span><small>{text(locale, "Starting Tech", "起始技艺")}</small></header><strong>{locale === "zh-CN" ? technique.nameZh : technique.name}</strong><p>{locale === "zh-CN" ? technique.abilityZh : technique.ability}</p><footer>{text(locale, "Workshop foundation", "作坊基础")}</footer></article>;
}

function OwnWorkshop({ game, player, locale, selectedWorkerId, canSelectWorker, onChooseWorker, onInspectOrder, onInspectTechnique }: { game: PublicGameState; player: PublicPlayerState; locale: Locale; selectedWorkerId: WorkerId | null; canSelectWorker: boolean; onChooseWorker: (id: WorkerId) => void; onInspectOrder: (id: OrderId) => void; onInspectTechnique: (id: TechniqueId) => void }) {
  const kiln = player.kilnId === null ? null : KILN_DEFINITIONS[player.kilnId];
  const availableWorkers = Object.values(player.workers).filter((worker) => worker.status === "available");
  const ceramics = Object.values(game.ceramics).filter((ceramic) => ceramic.ownerId === player.id && ceramic.stage !== "sold" && ceramic.stage !== "loaded");
  return (
    <section className="kiln-mock-workshop" aria-labelledby="kiln-live-workshop-title">
      <header>
        <div className="kiln-mock-workshop-name"><span aria-hidden="true">{kiln?.nameZh.slice(0, 1) ?? "窑"}</span><div><small>{text(locale, "YOUR WORKSHOP", "你的作坊")}</small><strong id="kiln-live-workshop-title">{kiln === null ? text(locale, "Kiln not selected", "尚未选择窑口") : locale === "zh-CN" ? kiln.nameZh : kiln.name}</strong>{kiln !== null && <p><b>{locale === "zh-CN" ? kiln.abilityNameZh : kiln.abilityName}</b> · {locale === "zh-CN" ? kiln.abilityZh : kiln.ability}</p>}</div></div>
        <div className="kiln-mock-resource-bank"><Resource glyph="泥" label={text(locale, "Clay", "泥")} value={player.resources.clay} /><Resource glyph="柴" label={text(locale, "Wood", "柴")} value={player.resources.wood} /><Resource glyph="宋" label={text(locale, "Coins", "铜钱")} value={player.resources.coins} /><Resource glyph="分" label={text(locale, "VP", "分数")} value={playerVp(game, player)} /></div>
        <ImperialStatus player={player} locale={locale} compact />
      </header>
      <div className="kiln-mock-workshop-zones">
        <section className="kiln-mock-worker-supply"><h3>{text(locale, "Available workers", "可用工人")}</h3><div>{availableWorkers.map((worker) => <button type="button" disabled={!canSelectWorker} aria-pressed={selectedWorkerId === worker.id} className={selectedWorkerId === worker.id ? "is-selected" : ""} onClick={() => onChooseWorker(worker.id)} data-worker-id={worker.id} key={worker.id}><WorkerToken player={player} kind={worker.kind} locale={locale} /><span>{locale === "zh-CN" ? worker.kind === "shifu" ? "师傅" : "学徒" : worker.kind === "shifu" ? "Shifu" : "Apprentice"}</span></button>)}{availableWorkers.length === 0 && <span className="kiln-live-empty-copy">{text(locale, "No workers remain", "没有剩余工人")}</span>}</div><small>{text(locale, `${availableWorkers.length} workers remain · Pass is permanent for the round`, `剩余${availableWorkers.length}名工人 · 本轮跳过后不可返回`)}</small></section>
        <section className="kiln-mock-ceramic-shelf"><h3>{text(locale, "Ceramics", "陶瓷")} <span>{ceramics.length}</span></h3><div>{ceramics.map((ceramic) => <Ceramic ceramic={ceramic} game={game} locale={locale} inspectable key={ceramic.id} />)}{ceramics.length === 0 && <span className="kiln-live-empty-copy">{text(locale, "No ceramics in workshop", "作坊中没有陶瓷")}</span>}</div></section>
        <section className="kiln-mock-own-orders"><h3>{text(locale, "Your Orders", "你的委托")} <span>{player.orderHand.length} / {GAME_CONFIG.orderDisplay.baseHandLimit}</span></h3><div>{player.orderHand.map((id) => <OrderCard id={id} locale={locale} compact onInspect={onInspectOrder} key={id} />)}{player.orderHand.length === 0 && <span className="kiln-live-empty-copy">{text(locale, "No held Orders", "没有持有委托")}</span>}</div></section>
        <section className="kiln-mock-own-techs"><h3>{text(locale, "Your Techs", "你的技艺")} <span>{text(locale, `${player.startingTechniqueId === null ? 0 : 1} Starting · ${player.techniques.length} / ${GAME_CONFIG.techniques.maxOwned} Advanced`, `${player.startingTechniqueId === null ? 0 : 1}起始 · ${player.techniques.length} / ${GAME_CONFIG.techniques.maxOwned}进阶`)}</span></h3><div>{player.startingTechniqueId !== null && <StartingTechniqueTile id={player.startingTechniqueId} locale={locale} compact />}{player.techniques.map((owned) => <TechniqueTile id={owned.id} locale={locale} compact exhausted={owned.exhausted} onInspect={onInspectTechnique} key={owned.id} />)}{player.startingTechniqueId === null && player.techniques.length === 0 && <span className="kiln-live-empty-copy">{text(locale, "No Tech selected", "尚未选择技艺")}</span>}</div></section>
      </div>
    </section>
  );
}

function WorkerToken({ player, kind, small = false, locale }: { player: PublicPlayerState; kind: WorkerKind; small?: boolean; locale: Locale }) {
  const label = text(locale, `${player.displayName}'s ${kind === "shifu" ? "Shifu" : "Apprentice"}`, `${player.displayName}的${kind === "shifu" ? "师傅" : "学徒"}`);
  return (
    <span className={`kiln-mock-worker kiln-mock-accent-${accent(player)} is-${kind} ${small ? "is-small" : ""}`} data-player-id={seatLabel(player)} data-worker-kind={kind} aria-label={label} title={label}>
      <svg viewBox="0 0 44 54" aria-hidden="true" focusable="false">{kind === "shifu" ? <><path className="kiln-mock-worker-hat" d="M15 5h14l3 5H12zM9 10h26l-2 4H11z" /><circle className="kiln-mock-worker-piece" cx="22" cy="18" r="6" /><path className="kiln-mock-worker-piece" d="M14 25q8-5 16 0l10 7-5 7-5-4 3 16H11l3-16-5 4-5-7z" /><path className="kiln-mock-worker-detail" d="M12 40h20" /></> : <><circle className="kiln-mock-worker-piece" cx="22" cy="13" r="6" /><path className="kiln-mock-worker-piece" d="M16 21q6-4 12 0l4 28H12z" /></>}<text className="kiln-mock-worker-role" x="22" y={kind === "shifu" ? "42" : "37"}>{kind === "shifu" ? "S" : "A"}</text></svg><b aria-hidden="true">{seatLabel(player)}</b>
    </span>
  );
}

function Resource({ glyph, label, value }: { glyph: string; label: string; value: number }) {
  return <span className="kiln-mock-resource"><i aria-hidden="true">{glyph}</i><b>{value}</b><small>{label}</small></span>;
}

function Ceramic({ ceramic, game, locale, compact = false, inspectable = false, kilnZone, kilnZoneModifier }: { ceramic: CeramicState; game: PublicGameState; locale: Locale; compact?: boolean; inspectable?: boolean; kilnZone?: "high" | "middle" | "low"; kilnZoneModifier?: number }) {
  const player = game.players[ceramic.ownerId];
  if (player === undefined) return null;
  const glaze = "glaze" in ceramic ? ceramic.glaze : null;
  const decoration = "decoration" in ceramic ? ceramic.decoration : null;
  const quality = "quality" in ceramic ? ceramic.quality : null;
  const heat = glaze === null ? null : preferredHeat(glaze);
  const marked = player.kilnYardShifuCeramicId === ceramic.id;
  const furniture = ceramic.stage === "loaded" && ceramic.kilnFurnitureUsed === true;
  const shape = shapeLabel(ceramic.shape, locale);
  const zone = kilnZone === undefined ? null : text(locale, `${titleCase(kilnZone)} zone`, zoneZh(kilnZone));
  const tooltipId = `kiln-live-ceramic-${ceramic.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const className = `kiln-mock-ceramic glaze-${glaze ?? "raw"} decoration-${decoration ?? "none"} shape-${ceramic.shape} kiln-mock-accent-${accent(player)} ${compact ? "is-compact" : ""} ${inspectable ? "is-inspectable" : ""}`;
  const visual = <><svg viewBox="0 0 80 72" aria-hidden="true"><CeramicShape shape={ceramic.shape} /><CeramicDecoration decoration={decoration} /></svg>{quality !== null && <b className={`kiln-mock-quality-badge is-${quality}`} title={qualityLabel(quality, locale)}>{qualityLabel(quality, locale)}</b>}{marked && <em className="kiln-mock-shifu-marker" title={text(locale, "Kiln Yard Shifu committed to this ceramic", "窑坊师傅已标记此陶瓷")}>{text(locale, "S", "师")}</em>}{furniture && <em className="kiln-live-furniture-marker" title={text(locale, "Kiln Furniture attached", "已附窑具")}>{text(locale, "Furniture", "窑具")}</em>}{inspectable && <span className="kiln-mock-ceramic-tooltip" id={tooltipId} role="tooltip"><span className="kiln-mock-ceramic-tooltip-owner"><i aria-hidden="true">{seatLabel(player)}</i><span><small>{text(locale, "BELONGS TO", "所属玩家")}</small><strong>{player.displayName}</strong></span></span><span className="kiln-mock-ceramic-tooltip-title"><strong>{shape}</strong><small>{ceramic.id} · {stageLabel(ceramic.stage, locale)}{zone === null ? "" : ` · ${zone} ${signed(kilnZoneModifier ?? 0)}`}</small></span><span className="kiln-mock-ceramic-tooltip-facts"><span><small>{text(locale, "Glaze", "釉色")}</small><strong>{glaze === null ? text(locale, "Not yet glazed", "尚未施釉") : glazeLabel(glaze, locale)}</strong></span><span><small>{text(locale, "Decoration", "装饰")}</small><strong>{decoration === null ? text(locale, "Not yet decorated", "尚未装饰") : decorationLabel(decoration, locale)}</strong></span><span><small>{text(locale, "Preferred Heat", "适烧火候")}</small><strong>{heat ?? "—"}</strong></span></span>{quality !== null && <span className="kiln-mock-ceramic-tooltip-note is-quality">{text(locale, "Quality", "品质")} · {qualityLabel(quality, locale)}</span>}{marked && <span className="kiln-mock-ceramic-tooltip-note">{text(locale, "Shifu reposition marker attached", "已附师傅调位标记")}</span>}{furniture && <span className="kiln-mock-ceramic-tooltip-note">{text(locale, "Kiln Furniture used", "已使用窑具")}</span>}</span>}</>;
  return inspectable ? <button className={className} type="button" data-decoration={decoration ?? undefined} data-glaze={glaze ?? undefined} data-shape={ceramic.shape} aria-label={text(locale, `Inspect ${player.displayName}'s ${shape}`, `查看${player.displayName}的${shape}`)} aria-describedby={tooltipId}>{visual}</button> : <span className={className} data-decoration={decoration ?? undefined} data-glaze={glaze ?? undefined} data-shape={ceramic.shape} aria-label={`${player.displayName} · ${shape}`}>{visual}</span>;
}

function CeramicShape({ shape }: { shape: Shape }) {
  if (shape === "bowl") return <path d="M8 22h64c-3 26-14 38-32 38S11 48 8 22zM18 64h44" />;
  if (shape === "plate") return <path d="M7 35c10 22 56 22 66 0M13 35h54M25 55h30" />;
  if (shape === "washer") return <path d="M12 28h56l-7 30H19zM27 62h26M25 25c0-10 30-10 30 0" />;
  if (shape === "vase") return <path d="M29 8h22l-3 13c15 9 19 34 5 42H27c-14-8-10-33 5-42zM29 9h22" />;
  return <path d="M18 27h44l-5 29H23zM29 17h22l5 10H24zM19 59l-5 7M61 59l5 7M36 12c-3-5 2-7 0-11M46 12c-3-5 2-7 0-11" />;
}

function CeramicDecoration({ decoration }: { decoration: Decoration | null }) {
  if (decoration === "carved") return <g className="kiln-mock-decoration-pattern is-carved"><path d="M31 33q9 6 18 0M29 40q11 7 22 0M31 47q9 6 18 0" /></g>;
  if (decoration === "impressed") return <g className="kiln-mock-decoration-pattern is-impressed"><circle cx="34" cy="36" r="2.2" /><circle cx="43" cy="36" r="2.2" /><circle cx="38.5" cy="44" r="2.2" /><circle cx="47.5" cy="44" r="2.2" /></g>;
  if (decoration === "crackle") return <g className="kiln-mock-decoration-pattern is-crackle"><path d="M40 29l-3 8 4 5-5 9M37 37l-7-4-4 3M41 42l7-6 6 2M39 46l7 5" /></g>;
  return null;
}

function Inspector({ inspection, game, events, describeEvent, locale, onClose }: { inspection: Exclude<Inspection, null>; game: PublicGameState; events: PublicEventRecord[]; describeEvent: TabletopGameExperienceProps["describeEvent"]; locale: Locale; onClose: () => void }) {
  const player = inspection.type === "player" ? game.players[inspection.id] : undefined;
  const order = inspection.type === "order" ? ORDER_DEFINITIONS[inspection.id] : undefined;
  const technique = inspection.type === "technique" ? TECHNIQUE_DEFINITIONS[inspection.id] : undefined;
  const title = player !== undefined ? text(locale, `${player.displayName}'s workshop`, `${player.displayName}的作坊`) : order !== undefined ? text(locale, `Order ${order.id}`, `委托 ${order.id}`) : technique !== undefined ? locale === "zh-CN" ? technique.nameZh : technique.name : text(locale, "Game log", "游戏记录");
  return (
    <ModalPanel title={title} eyebrow={text(locale, "TABLE INSPECTOR", "桌面查看")} locale={locale} onClose={onClose}>
      {player !== undefined && <PlayerInspection player={player} game={game} locale={locale} />}
      {order !== undefined && <OrderInspection id={order.id} locale={locale} />}
      {technique !== undefined && <TechniqueInspection id={technique.id} locale={locale} />}
      {inspection.type === "log" && <LogInspection game={game} events={events} describeEvent={describeEvent} locale={locale} />}
    </ModalPanel>
  );
}

function ModalPanel({ title, eyebrow, locale, onClose, className = "", children }: { title: string; eyebrow: string; locale: Locale; onClose: () => void; className?: string; children: ReactNode }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => { returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; closeButtonRef.current?.focus(); return () => returnFocusRef.current?.focus(); }, []);
  function keyDown(event: ReactKeyboardEvent<HTMLElement>): void {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"));
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return <div className="kiln-mock-inspector-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className={`kiln-mock-inspector ${className}`} role="dialog" aria-modal="true" aria-label={title} onKeyDown={keyDown}><header><div><small>{eyebrow}</small><strong>{title}</strong></div><button ref={closeButtonRef} type="button" onClick={onClose} aria-label={text(locale, "Close panel", "关闭面板")}>×</button></header>{children}</aside></div>;
}

function PlayerInspection({ player, game, locale }: { player: PublicPlayerState; game: PublicGameState; locale: Locale }) {
  const kiln = player.kilnId === null ? null : KILN_DEFINITIONS[player.kilnId];
  const ceramics = Object.values(game.ceramics).filter((ceramic) => ceramic.ownerId === player.id && ceramic.stage !== "sold");
  return <div className="kiln-mock-inspector-content"><section className={`kiln-mock-inspector-player kiln-mock-accent-${accent(player)}`}><span>{player.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{kiln === null ? text(locale, "Kiln not selected", "尚未选择窑口") : locale === "zh-CN" ? kiln.nameZh : kiln.name}</strong><small>{kiln === null ? seatLabel(player) : locale === "zh-CN" ? kiln.abilityNameZh : kiln.abilityName}</small></div><b>{playerVp(game, player)} {text(locale, "VP", "分")}</b></section>{kiln !== null && <p className="kiln-mock-ability-copy">{locale === "zh-CN" ? kiln.abilityZh : kiln.ability}</p>}<section className="kiln-mock-inspector-resources"><Resource glyph="泥" label={text(locale, "Clay", "泥")} value={player.resources.clay} /><Resource glyph="柴" label={text(locale, "Wood", "柴")} value={player.resources.wood} /><Resource glyph="宋" label={text(locale, "Coins", "铜钱")} value={player.resources.coins} /><Resource glyph="御" label={text(locale, "Recognition", "御府声望")} value={player.imperialRecognition} /></section><ImperialStatus player={player} locale={locale} /><section className="kiln-mock-inspector-section"><h3>{text(locale, "Held Orders", "持有委托")} <span>{player.orderHand.length} / {GAME_CONFIG.orderDisplay.baseHandLimit}</span></h3><div className="kiln-mock-inspector-orders">{player.orderHand.map((id) => <StaticOrderCard id={id} locale={locale} key={id} />)}{player.orderHand.length === 0 && <p>{text(locale, "No held Orders.", "没有持有委托。")}</p>}</div></section><section className="kiln-mock-inspector-section"><h3>{text(locale, "Techs", "技艺")} <span>{player.techniques.length} / {GAME_CONFIG.techniques.maxOwned} {text(locale, "Advanced", "进阶")}</span></h3><div className="kiln-mock-inspector-techs">{player.startingTechniqueId !== null && <StartingTechniqueTile id={player.startingTechniqueId} locale={locale} />}{player.techniques.map((owned) => <StaticTechniqueTile id={owned.id} locale={locale} exhausted={owned.exhausted} key={owned.id} />)}</div></section><section className="kiln-mock-inspector-section"><h3>{text(locale, "Current ceramics", "当前陶瓷")} <span>{ceramics.length}</span></h3><div className="kiln-live-inspector-ceramics">{ceramics.map((ceramic) => <Ceramic ceramic={ceramic} game={game} locale={locale} inspectable key={ceramic.id} />)}</div></section>{player.completedOrders.length > 0 && <details className="kiln-live-completed-orders"><summary>{text(locale, "Completed Orders", "已完成委托")} · {player.completedOrders.length}</summary><ul>{player.completedOrders.map((completed) => <li key={`${completed.orderId}-${completed.completedInRound}`}>{completed.orderId} · {completed.vpAwarded} {text(locale, "VP", "分")}</li>)}</ul></details>}</div>;
}

function OrderInspection({ id, locale }: { id: OrderId; locale: Locale }) {
  const order = ORDER_DEFINITIONS[id];
  if (order === undefined) return null;
  return <div className="kiln-mock-inspector-content kiln-mock-detail-view"><StaticOrderCard id={id} locale={locale} /><dl><div><dt>{text(locale, "Ceramics", "陶瓷")}</dt><dd>{order.ceramics.length}</dd></div><div><dt>{text(locale, "Minimum Quality", "最低品质")}</dt><dd>{qualityLabel(order.minQuality, locale)}</dd></div><div><dt>{text(locale, "Reward", "奖励")}</dt><dd>{order.vp} {text(locale, "VP", "分")} · {order.coins} {text(locale, "Coins", "铜钱")} {order.crowns > 0 ? `· ${order.crowns} ♛` : ""}</dd></div></dl><p>{text(locale, "Each ceramic must independently match the attributes printed for its requirement.", "每件陶瓷都必须分别符合其对应条件中列出的全部属性。")}</p></div>;
}

function TechniqueInspection({ id, locale }: { id: TechniqueId; locale: Locale }) {
  const technique = TECHNIQUE_DEFINITIONS[id];
  if (technique === undefined) return null;
  return <div className="kiln-mock-inspector-content kiln-mock-detail-view"><StaticTechniqueTile id={id} locale={locale} /><dl><div><dt>{text(locale, "Discipline", "类别")}</dt><dd>{locale === "zh-CN" ? disciplineZh(technique.discipline) : titleCase(technique.discipline)}</dd></div><div><dt>{text(locale, "Printed cost", "牌面费用")}</dt><dd>{technique.cost} {text(locale, "Coins", "铜钱")}</dd></div><div><dt>{text(locale, "Timing", "时机")}</dt><dd>{technique.oncePerRound ? text(locale, "Once per round", "每轮一次") : text(locale, "Continuous", "持续生效")}</dd></div></dl></div>;
}

function LogInspection({ game, events, describeEvent, locale }: { game: PublicGameState; events: PublicEventRecord[]; describeEvent: TabletopGameExperienceProps["describeEvent"]; locale: Locale }) {
  return <ol className="kiln-mock-log kiln-live-log">{[...events].reverse().map((record) => <li key={record.sequence}><span>#{record.sequence}</span><p>{describeEvent(record, game, locale)}</p><small>r{record.revision}</small></li>)}{events.length === 0 && <li><p>{text(locale, "No public events recorded yet.", "尚未记录公开事件。")}</p></li>}</ol>;
}

function ImperialStatus({ player, locale, compact = false }: { player: PublicPlayerState; locale: Locale; compact?: boolean }) {
  const priorityStatus = player.imperialPriorityAvailable ? text(locale, "Available", "可用") : player.imperialRecognition >= 3 ? text(locale, "Spent", "已使用") : text(locale, "Locked", "未解锁");
  return <section className={`kiln-mock-imperial-status ${compact ? "is-compact" : ""}`} aria-label={text(locale, "Imperial rewards", "御府奖赏")}><span><i aria-hidden="true">御</i><span><strong>{text(locale, "Imperial Kiln", "御窑")}</strong><small>{player.imperialKilnUnlocked ? text(locale, "Unlocked", "已解锁") : text(locale, "Locked", "未解锁")}</small></span></span><span><i aria-hidden="true">令</i><span><strong>{text(locale, "Imperial Priority", "御烧优先")}</strong><small>{priorityStatus}</small></span></span></section>;
}

function phaseName(game: PublicGameState, locale: Locale): string {
  const type = game.phase.type;
  if (type === "setup_kiln_selection") return text(locale, "Kiln selection", "选择窑口");
  if (type === "setup_starting_orders") return text(locale, "Starting Orders", "起始委托");
  if (type === "setup_starting_tech") return text(locale, "Starting Tech", "起始技艺");
  if (type.startsWith("work")) return type === "work" ? text(locale, "Work", "作业") : text(locale, "Work resolution", "作业结算");
  if (type === "orders" || type === "cleanup_orders") return text(locale, "Orders", "委托");
  if (type === "presentation") return text(locale, "End-game Exhibition", "终局陈列");
  if (type === "finished") return text(locale, "Finished", "游戏结束");
  return text(locale, "Firing", "烧成");
}

function minimumPlayersForKilnSpace(id: (typeof KILN_SPACE_IDS)[number]): 2 | 3 | 4 {
  if (id === "middle_2") return 3;
  if (id === "high_3") return 4;
  return 2;
}

function signed(value: number): string { return value > 0 ? `+${value}` : String(value); }
function titleCase(value: string): string { return value.slice(0, 1).toUpperCase() + value.slice(1).replaceAll("_", " "); }
function disciplineZh(value: TechniqueDiscipline): string { return value === "forming" ? "成型" : value === "glazing" ? "施釉" : "烧成"; }
function zoneZh(value: "high" | "middle" | "low"): string { return value === "high" ? "高温区" : value === "middle" ? "中温区" : "低温区"; }
function qualityLabel(value: Quality, locale: Locale): string { return locale === "zh-CN" ? value === "flawed" ? "瑕品" : value === "standard" ? "良品" : value === "fine" ? "上品" : "臻品" : titleCase(value); }
function shapeLabel(value: Shape, locale: Locale): string { return locale === "zh-CN" ? value === "bowl" ? "碗" : value === "plate" ? "盘" : value === "washer" ? "笔洗" : value === "vase" ? "瓶" : "香炉" : value === "washer" ? "Brush Washer" : titleCase(value); }
function glazeLabel(value: Glaze, locale: Locale): string { return locale === "zh-CN" ? value === "white" ? "白釉" : value === "celadon" ? "青釉" : value === "grey_green" ? "灰青釉" : "月白釉" : value === "grey_green" ? "Grey-Green" : value === "moon_white" ? "Moon White" : titleCase(value); }
function decorationLabel(value: Decoration, locale: Locale): string { return locale === "zh-CN" ? value === "plain" ? "素面" : value === "carved" ? "刻花" : value === "impressed" ? "印花" : "开片" : titleCase(value); }
function stageLabel(value: CeramicState["stage"], locale: Locale): string { const english = titleCase(value); if (locale !== "zh-CN") return english; return value === "shaped" ? "已成型" : value === "glazed" ? "已施釉" : value === "loaded" ? "已装窑" : value === "finished" ? "已烧成" : value === "delivered" ? "已交付" : value === "presented" ? "已陈列" : "已出售"; }
