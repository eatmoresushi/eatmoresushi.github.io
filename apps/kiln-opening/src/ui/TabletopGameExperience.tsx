import { withOwnOrderHand } from "../multiplayer/projection";
import { useEffect, useId, useReducer, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
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
  KilnId,
  LocationId,
  OrderId,
  PlayerId,
  Quality,
  Shape,
  StartingTechniqueId,
  TechniqueDiscipline,
  TechniqueId,
  WorkerId,
} from "../game";
import type {
  AuthoritativeCommand,
  PendingContribution,
  PrivateDecisionState,
  PublicEventRecord,
  PublicGameEvent,
  PublicGameState,
  PublicPlayerState,
  PublicSeat,
} from "../multiplayer";
import { ActionPanel } from "./ActionPanel";
import {
  KilnDescription,
  TechniqueDescription,
  kilnShortPlainText,
  techniqueShortPlainText,
} from "./TechniqueDescription";
import { TechniqueClarifications, TechniqueUseNote } from "./TechniqueDetails";
import { useI18n } from "./i18n";
import type { Locale } from "./i18n";
import { TABLETOP_ARTWORK } from "./tabletopArtwork";
import { WorkerMeeple, workerLabel } from "./WorkerMeeple";
import { BoardActionIcon } from "./BoardActionIcon";
import { BoardActionEffect } from "./BoardActionEffect";
import { ImperialKilnIllustration } from "./ImperialKilnIllustration";
import { fireCardHistory } from "./fireCardHistory";
import type { FireCardHistoryEntry } from "./fireCardHistory";
import sharedKilnArtwork from "../../assets/current_v04/shared_kiln_owner_reference.png";
import { previewPosition } from "./previewPosition";
import type { PreviewPosition as CardPreviewPosition } from "./previewPosition";
import "./tabletop-game.css";

type SendCommand = (command: AuthoritativeCommand) => Promise<boolean>;

type Inspection =
  | { type: "player"; id: PlayerId }
  | { type: "order"; id: OrderId }
  | { type: "technique"; id: TechniqueId }
  | { type: "startingTechnique"; id: StartingTechniqueId }
  | { type: "log" }
  | null;

const CARD_PREVIEW_OPEN_EVENT = "kiln-card-preview-open";

export const TABLETOP_BOARD_LOCATIONS = [
  { id: "materials_yard", glyph: "泥" },
  { id: "forming_studio", glyph: "陶" },
  { id: "glaze_workshop", glyph: "釉" },
  { id: "kiln_yard", glyph: "窑" },
  { id: "market_imperial_office", glyph: "单" },
  { id: "guild_academy", glyph: "艺" },
  { id: "labour", glyph: "工" },
  { id: "court_patronage", glyph: "御" },
] as const satisfies ReadonlyArray<{ id: LocationId; glyph: string }>;

const ACCENTS = ["cinnabar", "river", "ochre", "plum"] as const;
type Accent = (typeof ACCENTS)[number];

function ArtworkLayer({ source, slot }: { source: string | undefined; slot: string }) {
  if (source === undefined) return null;
  return (
    <span
      className="kiln-tabletop-artwork"
      data-art-slot={slot}
      style={{ backgroundImage: `url(${JSON.stringify(source)})` }}
      aria-hidden="true"
    />
  );
}

function text(locale: Locale, english: string, chinese: string): string {
  return locale === "zh-CN" ? chinese : english;
}

function cardPreviewPosition(anchor: HTMLElement): CardPreviewPosition | null {
  return previewPosition(anchor.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight });
}

function useCardPreview<T extends HTMLElement>(ownerId: string) {
  const anchorRef = useRef<T>(null);
  const [position, setPosition] = useState<CardPreviewPosition | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const pointerInsideRef = useRef(false);
  const focusInsideRef = useRef(false);
  const pinnedRef = useRef(false);

  function clearOpenTimer(): void {
    if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
  }

  function clearCloseTimer(): void {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }

  function showNow(): void {
    clearOpenTimer();
    clearCloseTimer();
    if (anchorRef.current !== null) {
      window.dispatchEvent(new CustomEvent<string>(CARD_PREVIEW_OPEN_EVENT, { detail: ownerId }));
      setPosition(cardPreviewPosition(anchorRef.current));
    }
  }

  function show(): void {
    clearCloseTimer();
    if (position !== null) return;
    clearOpenTimer();
    openTimerRef.current = window.setTimeout(showNow, 130);
  }

  function hideNow(): void {
    clearOpenTimer();
    clearCloseTimer();
    pinnedRef.current = false;
    setPosition(null);
  }

  function hide(): void {
    clearOpenTimer();
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(hideNow, 110);
  }

  function pointerEnter(): void {
    pointerInsideRef.current = true;
    show();
  }

  function pointerLeave(): void {
    pointerInsideRef.current = false;
    if (!focusInsideRef.current && !pinnedRef.current) hide();
  }

  function focus(): void {
    if (anchorRef.current?.dataset["kilnSuppressCardPreviewFocus"] === "true") {
      focusInsideRef.current = false;
      hideNow();
      return;
    }
    const keyboardFocus = anchorRef.current?.matches(":focus-visible") ?? false;
    focusInsideRef.current = keyboardFocus;
    if (keyboardFocus) showNow();
    else if (!pointerInsideRef.current) hideNow();
  }

  function blur(): void {
    focusInsideRef.current = false;
    pinnedRef.current = false;
    if (!pointerInsideRef.current) hideNow();
  }

  function dismiss(): void {
    hideNow();
  }

  function open(): void {
    // A tap must stay open after the touch pointer leaves the ceramic.
    pinnedRef.current = true;
    showNow();
  }

  const visible = position !== null;
  useEffect(() => {
    if (!visible) return;
    const update = (): void => {
      if (anchorRef.current !== null) setPosition(cardPreviewPosition(anchorRef.current));
    };
    const dismissOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") hideNow();
    };
    const dismissOutside = (event: PointerEvent): void => {
      if (!(event.target instanceof Node)) return;
      if (!anchorRef.current?.contains(event.target) && !document.getElementById(ownerId)?.contains(event.target)) hideNow();
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("keydown", dismissOnEscape);
    window.addEventListener("pointerdown", dismissOutside, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("keydown", dismissOnEscape);
      window.removeEventListener("pointerdown", dismissOutside, true);
    };
  }, [visible]);

  useEffect(() => {
    const closeForOtherPreview = (event: Event): void => {
      if (event instanceof CustomEvent && event.detail !== ownerId) hideNow();
    };
    window.addEventListener(CARD_PREVIEW_OPEN_EVENT, closeForOtherPreview);
    return () => window.removeEventListener(CARD_PREVIEW_OPEN_EVENT, closeForOtherPreview);
  }, [ownerId]);

  useEffect(() => () => {
    clearOpenTimer();
    clearCloseTimer();
  }, []);

  return { anchorRef, position, pointerEnter, pointerLeave, focus, blur, dismiss, open };
}

function CardHoverPreview({ id, position, eyebrow, onPointerEnter, onPointerLeave, className = "", children }: { id: string; position: CardPreviewPosition | null; eyebrow: string; onPointerEnter: () => void; onPointerLeave: () => void; className?: string; children: ReactNode }) {
  if (position === null || typeof document === "undefined") return null;
  const portalRoot = document.querySelector(".kiln-tabletop-root") ?? document.body;
  return createPortal(
    <aside
      className={`kiln-tabletop-card-preview is-${position.placement} ${className}`}
      id={id}
      aria-hidden="true"
      data-card-preview="true"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={{ left: position.left, top: position.top, maxHeight: position.maxHeight }}
    >
      <small>{eyebrow}</small>
      <div>{children}</div>
    </aside>,
    portalRoot,
  );
}

function accent(player: PublicPlayerState): Accent {
  return ACCENTS[player.seatIndex] ?? ACCENTS[0];
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

export function tabletopLocationReason(
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
  seats?: PublicSeat[] | undefined;
  computerRecap?: ComputerTurnRecap | null | undefined;
  describeEvent: (record: PublicEventRecord, game: PublicGameState, locale: Locale) => string;
  describeComputerEvent?: (event: PublicGameEvent, game: PublicGameState, locale: Locale) => string;
  busy: boolean;
  send: SendCommand;
}

export interface ComputerTurnRecap {
  id: string;
  revision: number;
  actionCount: number;
  actorIds: PlayerId[];
  /** Public events returned by the authoritative computer-turn request. */
  events: PublicGameEvent[];
}

export interface ActionControlsVisibility {
  open: boolean;
  mounted: boolean;
}

export type ActionControlsVisibilityEvent =
  | { type: "OPEN" }
  | { type: "CLOSE" }
  | { type: "DISCARD" };

/**
 * Closing an action only hides it so form-local draft choices survive a table
 * inspection. A completed action discards the mounted form and its stale draft.
 */
export function actionControlsVisibilityReducer(
  state: ActionControlsVisibility,
  event: ActionControlsVisibilityEvent,
): ActionControlsVisibility {
  if (event.type === "OPEN") return state.open && state.mounted ? state : { open: true, mounted: true };
  if (event.type === "CLOSE") return state.open ? { open: false, mounted: state.mounted } : state;
  return state.open || state.mounted ? { open: false, mounted: false } : state;
}

/**
 * Remount drafts when the authoritative decision changes outside this tab. Other
 * players' simultaneous submissions deliberately do not change the local key.
 */
export function actionDraftDecisionKey(
  game: PublicGameState,
  ownPlayerId: PlayerId,
  selectedLocation: LocationId | null,
  selectedWorkerId: WorkerId | null,
): string {
  const phase = game.phase;
  const decision = phase.type === "firing_contributions"
    ? `${phase.type}:${phase.windowId}:submitted-${phase.submittedPlayerIds.includes(ownPlayerId)}`
    : phase.type === "presentation"
      ? `${phase.type}:${game.round}:submitted-${phase.submittedPlayerIds.includes(ownPlayerId)}`
      : `${phase.type}:revision-${game.revision}`;
  return [game.gameId, ownPlayerId, game.round, decision, selectedLocation ?? "all", selectedWorkerId ?? "auto"].join("|");
}

/** Keep a multi-step worker action in one uninterrupted modal flow. */
export function keepActionControlsOpenAfterCommand(
  game: PublicGameState,
  ownPlayerId: PlayerId,
  command: AuthoritativeCommand,
): boolean {
  if (command.type === "BEGIN_OFFICE_ORDERS" || command.type === "BEGIN_GUILD_ACTION") return true;
  if (game.phase.type === "work_guild" && game.phase.actorId === ownPlayerId) {
    return command.type === "GUILD_INSPECT_DISCIPLINE";
  }
  if (game.phase.type !== "work_office_orders" || game.phase.actorId !== ownPlayerId) return false;
  if (command.type === "OFFICE_END_ORDERS") return false;
  if (command.type === "COMMISSION_GAIN_ADVANCE" && game.phase.remainingTakes === 0) return false;
  return true;
}

/** Work actions are opened from the physical board, never from the old all-actions list. */
export function hasActionControlsContext(
  game: PublicGameState,
  selectedLocation: LocationId | null,
): boolean {
  return game.phase.type !== "work" || selectedLocation !== null;
}

/** Keep the physical location name visible while its server-driven sub-step resolves. */
export function actionLocationForPhase(game: PublicGameState): LocationId | null {
  if (game.phase.type === "work_guild") return "guild_academy";
  if (game.phase.type === "work_office_orders") return "market_imperial_office";
  return null;
}

export function TabletopGameExperience({
  game,
  ownPlayerId,
  ownPendingContribution,
  ownPrivateDecision,
  events,
  seats = [],
  computerRecap = null,
  describeEvent,
  describeComputerEvent,
  busy,
  send,
}: TabletopGameExperienceProps) {
  game = withOwnOrderHand(game, ownPlayerId, ownPrivateDecision?.orderHand);
  const { locale } = useI18n();
  const ownPlayer = game.players[ownPlayerId];
  const [selectedWorkerId, setSelectedWorkerId] = useState<WorkerId | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<LocationId | null>(null);
  const [inspection, setInspection] = useState<Inspection>(null);
  const controlsInitiallyOpen = game.phase.type !== "work";
  const [controlsVisibility, updateControlsVisibility] = useReducer(actionControlsVisibilityReducer, {
    open: controlsInitiallyOpen,
    mounted: controlsInitiallyOpen,
  });
  const controlsOpen = controlsVisibility.open;
  const decisionActor = currentDecisionActor(game.phase);
  const ownWorkTurn = game.phase.type === "work" && game.phase.activePlayerId === ownPlayerId;
  const ownOrderTurn = game.phase.type === "orders" && game.phase.activePlayerId === ownPlayerId;
  const ownCommissionTurn = game.phase.type === "work_office_orders" && game.phase.actorId === ownPlayerId;
  const contextualLocation = selectedLocation ?? actionLocationForPhase(game);
  const selectedDefinition = contextualLocation === null ? null : LOCATION_DEFINITIONS[contextualLocation];

  useEffect(() => {
    if (selectedWorkerId === null) return;
    const worker = game.players[ownPlayerId]?.workers[selectedWorkerId];
    if (!ownWorkTurn || worker?.status !== "available") {
      setSelectedWorkerId(null);
      setSelectedLocation(null);
    }
  }, [game.revision, ownPlayerId, ownWorkTurn, selectedWorkerId, game.players]);

  useEffect(() => {
    if (game.phase.type !== "work") updateControlsVisibility({ type: "OPEN" });
  }, [game.phase.type]);

  // An Order completion/refill or a Commission sub-step can return a new
  // decision without changing phase type. Reopen only on a new server revision;
  // manually closing the panel during the same decision remains respected.
  useEffect(() => {
    if (ownOrderTurn || ownCommissionTurn) updateControlsVisibility({ type: "OPEN" });
  }, [game.revision, ownCommissionTurn, ownOrderTurn]);

  if (ownPlayer === undefined) return null;

  function selectWorker(workerId: WorkerId): void {
    if (!ownWorkTurn || busy) return;
    setSelectedWorkerId((current) => current === workerId ? null : workerId);
    setSelectedLocation(null);
  }

  function selectLocation(locationId: LocationId): void {
    setSelectedLocation(locationId);
    setInspection(null);
    updateControlsVisibility({ type: "OPEN" });
  }

  function inspect(target: Exclude<Inspection, null>): void {
    updateControlsVisibility({ type: "CLOSE" });
    setInspection(target);
  }

  async function sendFromTable(command: AuthoritativeCommand): Promise<boolean> {
    const keepControlsOpen = keepActionControlsOpenAfterCommand(game, ownPlayerId, command);
    const accepted = await send(command);
    if (accepted) {
      setSelectedWorkerId(null);
      setSelectedLocation(null);
      updateControlsVisibility({ type: keepControlsOpen ? "OPEN" : "DISCARD" });
    }
    return accepted;
  }

  const activeName = decisionActor === null
    ? text(locale, "Simultaneous decisions", "同时决策")
    : game.players[decisionActor]?.displayName ?? decisionActor;
  const actionControlsHaveContext = hasActionControlsContext(game, selectedLocation);
  const showContextAction = actionControlsHaveContext;

  return (
    <div className="kiln-tabletop-root kiln-live-root" data-testid="tabletop-live-ui">
      <header className="kiln-tabletop-topbar kiln-live-topbar">
        <div className="kiln-tabletop-brand" aria-label={text(locale, "Game table", "游戏桌面")}>
          <span aria-hidden="true">窑</span>
          <span><strong>{text(locale, "GAME TABLE", "游戏桌面")}</strong><small>V{game.rulesVersion}</small></span>
        </div>
        <div className="kiln-tabletop-turn-summary" aria-label={text(locale, "Current game status", "当前游戏状态")}>
          <span><small>{text(locale, "Round", "轮次")}</small><strong>{game.round} / {GAME_CONFIG.rounds}</strong></span>
          <span><small>{text(locale, "Phase", "阶段")}</small><strong>{phaseName(game, locale)}</strong></span>
          <span className={decisionActor === ownPlayerId || decisionActor === null ? "is-current" : ""}><small>{text(locale, "Current decision", "当前决策")}</small><strong>{decisionActor === ownPlayerId ? text(locale, "Your turn", "轮到你") : activeName}</strong></span>
        </div>
        <div className="kiln-tabletop-header-actions">
          {showContextAction && !controlsOpen && <button className="kiln-tabletop-action-link" type="button" onClick={() => { setInspection(null); updateControlsVisibility({ type: "OPEN" }); }}>{text(locale, "Action", "行动")}</button>}
          <button className="kiln-tabletop-icon-button" type="button" onClick={() => inspect({ type: "log" })} aria-label={text(locale, "Open game log", "打开游戏记录")} title={text(locale, "Game log", "游戏记录")}>☰</button>
        </div>
      </header>

      <section className="kiln-tabletop-player-dock" aria-label={text(locale, "Players", "玩家")}>
        {game.playerOrder.map((playerId) => <PlayerDockCard
          game={game}
          player={game.players[playerId]!}
          seat={seats.find((candidate) => candidate.playerId === playerId)}
          ownPlayerId={ownPlayerId}
          decisionActor={decisionActor}
          locale={locale}
          onInspect={() => inspect({ type: "player", id: playerId })}
          key={playerId}
        />)}
      </section>

      {computerRecap !== null && describeComputerEvent !== undefined && (
        <ComputerRecapPanel
          recap={computerRecap}
          game={game}
          locale={locale}
          describeEvent={describeComputerEvent}
          onOpenLog={() => inspect({ type: "log" })}
        />
      )}

      <main className="kiln-tabletop-table" id="kiln-live-board">
        <MarketShelf game={game} locale={locale} onInspect={(id) => inspect({ type: "order", id })} />
        <div className="kiln-tabletop-play-area">
          <div className="kiln-tabletop-board-scroll">
            <section className="kiln-tabletop-board kiln-tabletop-art-surface" aria-label={text(locale, "Shared game board", "共享游戏板")}>
              <ArtworkLayer source={TABLETOP_ARTWORK.sharedBoard} slot="shared-board" />
              <div className="kiln-tabletop-board-caption"><span>{text(locale, "THE WORKSHOP DISTRICT", "陶坊街市")}</span><span>{text(locale, "Earth · Glaze · Fire", "泥 · 釉 · 火")}</span></div>
              <div className="kiln-tabletop-board-header"><RoundTrack game={game} locale={locale} /><FiringDeck game={game} events={events} locale={locale} /></div>
              <div className="kiln-tabletop-board-body">
                <div className="kiln-tabletop-actions-grid">
                  {TABLETOP_BOARD_LOCATIONS.map(({ id, glyph }) => (
                    <ActionSpace
                      game={game}
                      ownPlayer={ownPlayer}
                      id={id}
                      glyph={glyph}
                      locale={locale}
                      selectedWorkerId={selectedWorkerId}
                      selected={selectedLocation === id}
                      onChoose={() => selectLocation(id)}
                      key={id}
                    />
                  ))}
                  <SharedKiln game={game} locale={locale} />
                </div>
                <TurnOrderTrack game={game} locale={locale} currentActorId={decisionActor} />
              </div>
              <ImperialTrack game={game} locale={locale} />
            </section>
          </div>
          <TechniqueMarket game={game} locale={locale} onInspect={(id) => inspect({ type: "technique", id })} />
        </div>
        <div className={`kiln-tabletop-workshop-area ${Object.values(game.players).filter(hasImperialKiln).length === 1 ? "has-one-imperial" : ""}`}>
          <OwnWorkshop
            game={game}
            player={ownPlayer}
            locale={locale}
            selectedWorkerId={selectedWorkerId}
            canSelectWorker={ownWorkTurn && !busy}
            onChooseWorker={selectWorker}
            onPass={undefined}
            onInspectOrder={(id) => inspect({ type: "order", id })}
            onInspectTechnique={(id) => inspect({ type: "technique", id })}
            onInspectStartingTechnique={(id) => inspect({ type: "startingTechnique", id })}
          />
          <ImperialKilnGallery game={game} locale={locale} />
        </div>
      </main>

      {controlsVisibility.mounted && actionControlsHaveContext && (
        <ModalPanel open={controlsOpen} title={selectedDefinition === null ? phaseName(game, locale) : locale === "zh-CN" ? selectedDefinition.nameZh : selectedDefinition.name} eyebrow={text(locale, "ACTION", "行动")} locale={locale} onClose={() => updateControlsVisibility({ type: "CLOSE" })} className="kiln-live-controls-panel">
          <ActionPanel
            key={actionDraftDecisionKey(game, ownPlayerId, selectedLocation, selectedWorkerId)}
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

function PlayerDockCard({ game, player, seat, ownPlayerId, decisionActor, locale, onInspect }: {
  game: PublicGameState;
  player: PublicPlayerState;
  seat: PublicSeat | undefined;
  ownPlayerId: PlayerId;
  decisionActor: PlayerId | null;
  locale: Locale;
  onInspect: () => void;
}) {
  const kiln = player.kilnId === null ? null : KILN_DEFINITIONS[player.kilnId];
  const previewId = `kiln-tradition-preview-${player.id}`;
  const descriptionId = `${previewId}-description`;
  const preview = useCardPreview<HTMLButtonElement>(previewId);
  const availableWorkers = Object.values(player.workers).filter((worker) => worker.status === "available").length;

  return (
    <>
      <button
        ref={preview.anchorRef}
        className={`kiln-tabletop-player kiln-tabletop-accent-${accent(player)} ${player.id === ownPlayerId ? "is-you" : ""} ${player.id === decisionActor ? "is-active" : ""}`}
        type="button"
        onClick={() => { preview.dismiss(); onInspect(); }}
        onPointerEnter={(event) => { if (kiln !== null && event.pointerType !== "touch") preview.pointerEnter(); }}
        onPointerLeave={preview.pointerLeave}
        onFocus={kiln === null ? undefined : preview.focus}
        onBlur={preview.blur}
        onKeyDown={(event) => { if (event.key === "Escape") preview.dismiss(); }}
        aria-label={text(locale, `Inspect ${player.displayName}'s workshop`, `查看${player.displayName}的作坊`)}
        aria-describedby={kiln === null ? undefined : descriptionId}
        aria-haspopup="dialog"
        data-hover-preview={kiln === null ? undefined : "kiln-tradition"}
        data-preview-id={kiln === null ? undefined : previewId}
        data-kiln-id={player.kilnId ?? undefined}
        data-turn-label={text(locale, "TURN", "行动中")}
      >
        <span className="kiln-tabletop-avatar" aria-hidden="true">{player.displayName.slice(0, 1).toUpperCase()}</span>
        <span className="kiln-tabletop-player-name"><strong>{player.displayName}{player.id === ownPlayerId ? text(locale, " · You", " · 你") : ""}{seat?.isComputer === true && <span className="kiln-tabletop-ai-badge" title={text(locale, "Computer player", "电脑玩家")} aria-label={text(locale, "Computer player", "电脑玩家")}>AI</span>}</strong><small>{kiln === null ? text(locale, "Choosing kiln", "正在选择窑口") : locale === "zh-CN" ? kiln.nameZh : kiln.name}</small></span>
        <span className="kiln-tabletop-player-score"><small>{text(locale, "VP", "分")}</small><b>{playerVp(game, player)}</b></span>
        <span className="kiln-tabletop-player-resources" aria-label={text(locale, "Resources", "资源")}><i>{text(locale, "Clay", "泥")} {player.resources.clay}</i><i>{text(locale, "Wood", "柴")} {player.resources.wood}</i><i>{text(locale, "Coins", "钱")} {player.resources.coins}</i></span>
        <span className="kiln-tabletop-player-public"><i>{player.orderHandCount} {text(locale, "Orders", "委托")}</i><i>{player.techniques.length + (player.startingTechniqueId === null ? 0 : 1)} {text(locale, "Techs", "技艺")}</i><i>{availableWorkers} {text(locale, "workers", "工人")}</i></span>
        {player.id === game.firstPlayerId && <span className="kiln-tabletop-first-player" title={text(locale, "First Player", "起始玩家")}>1</span>}
      </button>
      {kiln !== null && <span className="sr-only" id={descriptionId}>{kilnShortPlainText(kiln.id, locale)}</span>}
      {kiln !== null && <CardHoverPreview id={previewId} position={preview.position} eyebrow={text(locale, "KILN PREVIEW · CLICK FOR DETAILS", "窑口预览 · 点击查看详情")} onPointerEnter={preview.pointerEnter} onPointerLeave={preview.pointerLeave}>
        <StaticKilnCard id={kiln.id} locale={locale} layer="preview" />
      </CardHoverPreview>}
    </>
  );
}

function StaticKilnCard({ id, locale, layer }: { id: KilnId; locale: Locale; layer: "preview" | "full" }) {
  const kiln = KILN_DEFINITIONS[id];
  return (
    <article className="kiln-tabletop-kiln-card kiln-tabletop-art-surface" data-kiln-id={id} data-description-layer={layer}>
      <header><span>{id}</span><small>{text(locale, "Kiln Tradition", "窑口传承")}</small></header>
      <strong>{locale === "zh-CN" ? kiln.nameZh : kiln.name}</strong>
      <b>{locale === "zh-CN" ? kiln.abilityNameZh : kiln.abilityName}</b>
      <p><KilnDescription id={id} locale={locale} layer={layer} /></p>
    </article>
  );
}

const COMPUTER_RECAP_MAX_EVENTS = 9;
const COMPUTER_RECAP_AUTO_DISMISS_MS = 2_000;
const COMPUTER_RECAP_REVEAL_INTERVAL_MS = 250;
const COMPUTER_RECAP_SUPPLEMENTAL_EVENTS = new Set<PublicGameEvent["type"]>([
  "RESOURCES_CHANGED",
  "QUALITY_ASSIGNED",
]);

/**
 * Keep the transient recap readable while preserving the complete history in the
 * game log. Outcome events explain the visible board change better than their
 * accompanying resource/quality bookkeeping; bookkeeping is retained as a fallback.
 */
export function computerRecapHighlights(events: PublicGameEvent[]): PublicGameEvent[] {
  const primary = events.filter((event) => !COMPUTER_RECAP_SUPPLEMENTAL_EVENTS.has(event.type));
  const candidates = primary.length > 0 ? primary : events;
  if (candidates.length <= COMPUTER_RECAP_MAX_EVENTS) return candidates;
  const openingCount = Math.ceil(COMPUTER_RECAP_MAX_EVENTS / 2);
  return [
    ...candidates.slice(0, openingCount),
    ...candidates.slice(-(COMPUTER_RECAP_MAX_EVENTS - openingCount)),
  ];
}

function ComputerRecapPanel({
  recap,
  game,
  locale,
  describeEvent,
  onOpenLog,
}: {
  recap: ComputerTurnRecap;
  game: PublicGameState;
  locale: Locale;
  describeEvent: NonNullable<TabletopGameExperienceProps["describeComputerEvent"]>;
  onOpenLog: () => void;
}) {
  const highlights = computerRecapHighlights(recap.events);
  const [visibleCount, setVisibleCount] = useState(1);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const reducedMotion = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    setDismissed(false);
    setVisibleCount(reducedMotion ? highlights.length : Math.min(1, highlights.length));
  }, [recap.id, highlights.length]);

  useEffect(() => {
    if (dismissed || visibleCount >= highlights.length) return;
    const timer = window.setTimeout(
      () => setVisibleCount((current) => Math.min(current + 1, highlights.length)),
      COMPUTER_RECAP_REVEAL_INTERVAL_MS,
    );
    return () => window.clearTimeout(timer);
  }, [dismissed, highlights.length, visibleCount]);

  useEffect(() => {
    if (dismissed) return;
    const timer = window.setTimeout(() => setDismissed(true), COMPUTER_RECAP_AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [dismissed, recap.id]);

  if (dismissed) return null;
  const actorNames = [...new Set(recap.actorIds)]
    .map((actorId) => game.players[actorId]?.displayName ?? actorId);
  const visibleEvents = highlights.slice(Math.max(0, visibleCount - 3), visibleCount);
  const hiddenEventCount = Math.max(0, recap.events.length - highlights.length);
  const actionCount = text(
    locale,
    `${recap.actionCount} action${recap.actionCount === 1 ? "" : "s"}`,
    `${recap.actionCount}个行动`,
  );

  return (
    <aside className="kiln-tabletop-computer-recap" role="status" aria-live="polite" aria-atomic="false" data-testid="computer-turn-recap">
      <header>
        <span className="kiln-tabletop-computer-recap-mark" aria-hidden="true">AI</span>
        <span>
          <small>{text(locale, "COMPUTER TURN RECAP", "电脑回合回顾")}</small>
          <strong>{actorNames.join(", ") || text(locale, "Computer player", "电脑玩家")}</strong>
          <em>{actionCount}</em>
        </span>
        <button type="button" onClick={() => setDismissed(true)} aria-label={text(locale, "Dismiss computer turn recap", "关闭电脑回合回顾")} title={text(locale, "Dismiss", "关闭")}>×</button>
      </header>
      {highlights.length > 0 ? (
        <>
          <ol>
            {visibleEvents.map((event, index) => (
              <li key={`${recap.id}:${visibleCount - visibleEvents.length + index}:${event.type}`}>
                <i aria-hidden="true" />
                <span>{describeEvent(event, game, locale)}</span>
              </li>
            ))}
          </ol>
          <div className="kiln-tabletop-computer-recap-progress" aria-label={text(locale, `Showing update ${visibleCount} of ${highlights.length}`, `正在显示第${visibleCount}/${highlights.length}条动态`)}>
            <i style={{ width: `${highlights.length === 0 ? 100 : (visibleCount / highlights.length) * 100}%` }} />
          </div>
        </>
      ) : <p>{text(locale, "The table is up to date.", "桌面已更新。")}</p>}
      <footer>
        <small>{hiddenEventCount > 0 ? text(locale, `${hiddenEventCount} more update${hiddenEventCount === 1 ? "" : "s"} in the log`, `记录中另有${hiddenEventCount}条动态`) : text(locale, "Full turn history is available in the log.", "完整回合记录可在日志中查看。")}</small>
        <button type="button" onClick={() => { setDismissed(true); onOpenLog(); }}>{text(locale, "View full log", "查看完整记录")}</button>
      </footer>
    </aside>
  );
}

function MarketShelf({ game, locale, onInspect }: { game: PublicGameState; locale: Locale; onInspect: (id: OrderId) => void }) {
  return (
    <section className="kiln-tabletop-market" aria-labelledby="kiln-live-market-title">
      <div className="kiln-tabletop-section-title"><span aria-hidden="true">单</span><div><small>{text(locale, "COMMISSION MARKET", "瓷牙行")}</small><strong id="kiln-live-market-title">{text(locale, "Face-up Main Orders", "公开主委托")}</strong></div></div>
      <div className="kiln-tabletop-order-deck" role="img" aria-label={text(locale, `Main Order deck, ${game.decks.marketRemaining} remaining`, `主委托牌库，剩余${game.decks.marketRemaining}张`)}><span aria-hidden="true">委</span><small>{game.decks.marketRemaining}</small></div>
      <div className="kiln-tabletop-order-row">{game.displays.market.map((id, index) => <OrderCard id={id} locale={locale} displayIndex={index + 1} onInspect={onInspect} key={id} />)}</div>
      <div className="kiln-tabletop-market-note"><small>{text(locale, "Oldest → newest · remove, slide left, refill right", "最旧 → 最新 · 移走、左移、右端补牌")}</small><strong>{text(locale, `Live Round ${game.round} display`, `第${game.round}轮实时展示`)}</strong></div>
    </section>
  );
}

function additionalOrderQuality(id: OrderId, locale: Locale) {
  return (ORDER_DEFINITIONS[id]?.relations ?? []).flatMap((relation) => {
    if (relation.type !== "at_least_n_quality") return [];
    const quality = qualityLabel(relation.quality, locale);
    const englishQuality = `${quality}${relation.count === 1 ? "" : "s"}`;
    return [{
      key: `${relation.quality}:${relation.count}`,
      compact: text(locale, `≥${relation.count} ${englishQuality}`, `≥${relation.count}件${quality}`),
      full: text(locale, `At least ${relation.count} ${englishQuality}`, `至少${relation.count}件${quality}`),
    }];
  });
}

function OrderQualityRequirements({ id, locale }: { id: OrderId; locale: Locale }) {
  const requirements = additionalOrderQuality(id, locale);
  if (requirements.length === 0) return null;
  return <div className="kiln-tabletop-order-quality-requirements">{requirements.map((requirement) => <span key={requirement.key} aria-label={requirement.full}>{requirement.compact}</span>)}</div>;
}

export function OrderCard({ id, locale, displayIndex, owned = false, onInspect }: { id: OrderId; locale: Locale; displayIndex?: number; owned?: boolean; onInspect: (id: OrderId) => void }) {
  const order = ORDER_DEFINITIONS[id];
  const previewId = `kiln-order-preview-${id}-${owned ? "owned" : "market"}`;
  const descriptionId = `${previewId}-description`;
  const preview = useCardPreview<HTMLButtonElement>(previewId);
  if (order === undefined) return null;
  const additionalQuality = additionalOrderQuality(id, locale);
  const qualityDescription = additionalQuality.map((requirement) => `${requirement.full}${text(locale, ". ", "。")}`).join("");
  const description = text(locale, `Order ${id}. ${order.requirements}. ${order.ceramics.length} ceramics. Minimum Quality: ${qualityLabel(order.minQuality, locale)}. ${qualityDescription}Reward: ${order.vp} VP, ${order.coins} Coins${order.crowns > 0 ? `, ${order.crowns} Crown${order.crowns === 1 ? "" : "s"}` : ""}.`, `委托 ${id}。${order.requirementsZh}。${order.ceramics.length}件陶瓷。最低品质：${qualityLabel(order.minQuality, locale)}。${qualityDescription}奖励：${order.vp}分、${order.coins}铜钱${order.crowns > 0 ? `、${order.crowns}皇冠` : ""}。`);
  return (
    <>
      <button
        ref={preview.anchorRef}
        className={`kiln-tabletop-order-card kiln-tabletop-art-surface ${order.crowns > 0 ? "is-crown" : ""} ${owned ? "is-owned" : ""} ${additionalQuality.length > 0 ? "has-quality-requirement" : ""}`}
        type="button"
        onClick={() => { preview.dismiss(); onInspect(id); }}
        onPointerEnter={(event) => { if (event.pointerType !== "touch") preview.pointerEnter(); }}
        onPointerLeave={preview.pointerLeave}
        onFocus={preview.focus}
        onBlur={preview.blur}
        onKeyDown={(event) => { if (event.key === "Escape") preview.dismiss(); }}
        aria-label={text(locale, `Inspect Order ${id}`, `查看委托 ${id}`)}
        aria-describedby={descriptionId}
        aria-haspopup="dialog"
        data-hover-preview="order"
        data-preview-id={previewId}
        data-order-id={id}
      >
        <ArtworkLayer source={TABLETOP_ARTWORK.orders[id]} slot={`order:${id}`} />
        {displayIndex !== undefined && <span className="kiln-tabletop-display-index">{displayIndex}</span>}
        <header><b>{id}</b><span className="kiln-tabletop-order-crowns" aria-hidden="true">{"♛".repeat(order.crowns)}</span></header>
        <div className="kiln-tabletop-order-seal" aria-hidden="true">{order.ceramics.length}</div>
        <p>{locale === "zh-CN" ? order.requirementsZh : order.requirements}</p>
        <OrderQualityRequirements id={id} locale={locale} />
        <footer><span><small>{text(locale, "MIN", "最低")}</small><b>{qualityLabel(order.minQuality, locale)}</b></span><span><small>{text(locale, "VP", "分")}</small><b>{order.vp}</b></span><span><small>{text(locale, "COIN", "钱")}</small><b>{order.coins}</b></span></footer>
      </button>
      <span className="sr-only" id={descriptionId}>{description}</span>
      <CardHoverPreview id={previewId} position={preview.position} eyebrow={text(locale, "ORDER PREVIEW · CLICK FOR DETAILS", "委托预览 · 点击查看详情")} onPointerEnter={preview.pointerEnter} onPointerLeave={preview.pointerLeave}>
        <StaticOrderCard id={id} locale={locale} />
      </CardHoverPreview>
    </>
  );
}

export function StaticOrderCard({ id, locale }: { id: OrderId; locale: Locale }) {
  const order = ORDER_DEFINITIONS[id];
  if (order === undefined) return null;
  return (
    <article className={`kiln-tabletop-order-card kiln-tabletop-static-order kiln-tabletop-art-surface ${order.crowns > 0 ? "is-crown" : ""} ${additionalOrderQuality(id, locale).length > 0 ? "has-quality-requirement" : ""}`} data-order-id={id}>
      <ArtworkLayer source={TABLETOP_ARTWORK.orders[id]} slot={`order:${id}`} />
      <header><b>{id}</b><span className="kiln-tabletop-order-crowns" aria-hidden="true">{"♛".repeat(order.crowns)}</span></header><div className="kiln-tabletop-order-seal" aria-hidden="true">{order.ceramics.length}</div><p>{locale === "zh-CN" ? order.requirementsZh : order.requirements}</p>
      <OrderQualityRequirements id={id} locale={locale} />
      <footer><span><small>{text(locale, "MIN", "最低")}</small><b>{qualityLabel(order.minQuality, locale)}</b></span><span><small>{text(locale, "VP", "分")}</small><b>{order.vp}</b></span><span><small>{text(locale, "COIN", "钱")}</small><b>{order.coins}</b></span></footer>
    </article>
  );
}

function RoundTrack({ game, locale }: { game: PublicGameState; locale: Locale }) {
  return (
    <section className="kiln-tabletop-round-track" aria-label={text(locale, `Round track, round ${game.round} of ${GAME_CONFIG.rounds}`, `轮次轨，第${game.round}轮，共${GAME_CONFIG.rounds}轮`)}>
      <strong>{text(locale, "ROUND", "轮次")}</strong>
      {Array.from({ length: GAME_CONFIG.rounds }, (_, index) => index + 1).map((round) => <span className={round === game.round ? "is-current" : round < game.round ? "is-complete" : ""} key={round}><i>{round}</i><small>{round === game.round ? phaseName(game, locale) : ""}</small></span>)}
    </section>
  );
}

/**
 * The physical turn-order track uses one sequence in two directions: Work begins
 * with the First Player and proceeds clockwise (top to bottom here), while the
 * Order Phase uses the exact reverse seating order (bottom to top here).
 */
function TurnOrderTrack({ game, locale, currentActorId }: { game: PublicGameState; locale: Locale; currentActorId: PlayerId | null }) {
  const firstPlayerIndex = game.playerOrder.indexOf(game.firstPlayerId);
  const workOrder = firstPlayerIndex < 0
    ? game.playerOrder
    : [...game.playerOrder.slice(firstPlayerIndex), ...game.playerOrder.slice(0, firstPlayerIndex)];
  const activeDirection = game.phase.type === "orders"
    ? "order"
    : game.phase.type === "work" || game.phase.type.startsWith("work_")
      ? "work"
      : "none";

  return (
    <aside
      className={`kiln-tabletop-turn-order is-${activeDirection}-direction`}
      aria-label={text(locale, "Turn order", "行动顺序")}
      data-testid="turn-order-track"
    >
      <header><strong>{text(locale, "TURN ORDER", "行动顺序")}</strong></header>
      <div className="kiln-tabletop-turn-direction is-order">
        <b aria-hidden="true">↑</b>
        <span><strong>{text(locale, "ORDER PHASE", "交付阶段")}</strong><small>{text(locale, "Bottom to top", "由下至上")}</small></span>
      </div>
      <ol style={{ gridTemplateRows: `repeat(${workOrder.length}, minmax(42px, 1fr))` }}>
        {workOrder.map((playerId) => {
          const player = game.players[playerId];
          if (player === undefined) return null;
          const current = playerId === currentActorId;
          return (
            <li
              className={`kiln-tabletop-accent-${accent(player)} ${current ? "is-current" : ""}`}
              data-player-id={playerId}
              aria-current={current ? "step" : undefined}
              aria-label={text(
                locale,
                `${player.displayName}${playerId === game.firstPlayerId ? ", First Player" : ""}${current ? ", current decision" : ""}`,
                `${player.displayName}${playerId === game.firstPlayerId ? "，起始玩家" : ""}${current ? "，当前决策" : ""}`,
              )}
              title={player.displayName}
              key={playerId}
            >
              <i aria-hidden="true" />
              {playerId === game.firstPlayerId && <b aria-hidden="true">1</b>}
            </li>
          );
        })}
      </ol>
      <div className="kiln-tabletop-turn-direction is-work">
        <b aria-hidden="true">↓</b>
        <span><strong>{text(locale, "WORK PHASE", "工作阶段")}</strong><small>{text(locale, "Top to bottom", "由上至下")}</small></span>
      </div>
    </aside>
  );
}

export function ActionSpace({ game, ownPlayer, id, glyph, locale, selectedWorkerId, selected, onChoose }: { game: PublicGameState; ownPlayer: PublicPlayerState; id: LocationId; glyph: string; locale: Locale; selectedWorkerId: WorkerId | null; selected: boolean; onChoose: () => void }) {
  const definition = LOCATION_DEFINITIONS[id];
  const occupants = game.actionBoard.placements[id].map((workerId) => findWorker(game, workerId)).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const worker = selectedWorkerId === null ? undefined : ownPlayer.workers[selectedWorkerId];
  const reason = tabletopLocationReason(game, ownPlayer, selectedWorkerId, id, locale);
  const maximumCapacity = definition.capacity["4"];
  const activeCapacity = definition.capacity[String(game.playerCount) as "2" | "3" | "4"];
  const legal = worker?.status === "available" && reason === null;
  const status = worker === undefined ? null : reason ?? (worker.kind === "shifu" && activeCapacity !== null && occupants.length >= activeCapacity ? text(locale, "Shifu may overfill", "师傅可超容量") : null);
  return (
    <button className={`kiln-tabletop-action-space kiln-tabletop-art-surface ${legal ? "is-available" : ""} ${worker !== undefined && !legal ? "is-illegal" : ""} ${selected ? "is-selected" : ""}`} type="button" onClick={onChoose} aria-pressed={selected} data-location-id={id}>
      <ArtworkLayer source={TABLETOP_ARTWORK.actionSpaces[id]} slot={`action-space:${id}`} />
      <header><span className="kiln-tabletop-action-emblem" aria-hidden="true"><BoardActionIcon locationId={id} /></span><div><strong>{locale === "zh-CN" ? definition.nameZh : definition.name}</strong>{status !== null && <small>{status}</small>}</div><i className="kiln-tabletop-action-seal" aria-hidden="true">{glyph}</i></header>
      <div className="kiln-tabletop-action-effects">{(["apprentice", "shifu"] as const).map((kind) => {
        const fullEffect = kind === "shifu" ? locale === "zh-CN" ? definition.shifuZh : definition.shifu : locale === "zh-CN" ? definition.apprenticeZh : definition.apprentice;
        return <div className={`kiln-tabletop-action-effect ${worker?.kind === kind ? "is-current-worker" : ""}`} data-effect-worker={kind} title={fullEffect} key={kind}>
          <WorkerMeeple kind={kind} small locale={locale} />
          <BoardActionEffect id={id} kind={kind} locale={locale} />
        </div>;
      })}</div>
      <footer>
        <div className="kiln-tabletop-worker-spaces"><small>{text(locale, "WORKER SPACES", "工人位置")}</small>
        <span className="kiln-tabletop-capacity">
          <span className="sr-only">{activeCapacity === null ? text(locale, "Unlimited capacity", "无限容量") : text(locale, `${occupants.length} of ${activeCapacity} active spaces occupied in this ${game.playerCount}-player game`, `${game.playerCount}人游戏：已占${occupants.length}/${activeCapacity}个可用位置`)}</span>
          {maximumCapacity === null ? <i aria-hidden="true">∞</i> : Array.from({ length: maximumCapacity }, (_, index) => {
            const minimumPlayers = index >= 2 ? index + 1 : null;
            const locked = activeCapacity !== null && index >= activeCapacity;
            const occupant = !locked ? occupants[index] : undefined;
            return <i className={`${occupant !== undefined ? "is-filled" : ""} ${locked ? "is-locked" : ""}`} data-min-players={minimumPlayers ?? undefined} key={index} title={minimumPlayers === null ? undefined : locked ? text(locale, `Locked — requires ${minimumPlayers} players`, `未开放——需要${minimumPlayers}名玩家`) : text(locale, `Available with ${minimumPlayers} or more players`, `${minimumPlayers}人及以上可用`)}>{occupant !== undefined ? <WorkerMeeple player={occupant.player} kind={occupant.worker.kind} small locale={locale} /> : <span aria-hidden="true">{minimumPlayers === null ? "" : `${minimumPlayers}P`}</span>}</i>;
          })}
        </span>
        </div>
        <span className="kiln-tabletop-occupants">{occupants.slice(activeCapacity ?? 0).map(({ player, worker }) => {
          const firing = game.firingContext ?? game.lastFiringResult;
          const shifuSetAside = firing?.round === game.round && firing.kilnYardShifuAdjustments.some((entry) => entry.playerId === player.id);
          const shifuOffBoard = id === "kiln_yard" && worker.kind === "shifu" && (player.kilnYardShifuCeramicId !== null || shifuSetAside);
          return shifuOffBoard ? null : <WorkerMeeple player={player} kind={worker.kind} small locale={locale} key={worker.id} />;
        })}</span>
      </footer>
    </button>
  );
}

function SharedKiln({ game, locale }: { game: PublicGameState; locale: Locale }) {
  const activeSpaces = new Set(activeKilnSpaceIds(game.playerCount));
  const loaded = Object.values(game.ceramics).filter((ceramic) => ceramic.stage === "loaded" && ceramic.kilnSpaceId !== "imperial");
  const firingInProgress = game.firingContext !== null;
  const currentBase = firingInProgress ? game.firingContext?.baseHeat ?? "—" : BASE_HEAT_START;
  const currentFire = firingInProgress ? game.firingContext?.fireModifier ?? null : game.lastFiringResult?.fireModifier ?? null;
  return (
    <section className={`kiln-tabletop-shared-kiln ${firingInProgress ? "is-firing" : ""}`} aria-labelledby="kiln-live-kiln-title">
      <header><div><small>{text(locale, "BASE HEAT", "基础火候")}</small><strong>{currentBase}</strong></div><div><small>{firingInProgress ? text(locale, "FIRE CARD", "窑火牌") : text(locale, "LAST FIRE", "上次窑火")}</small><strong>{currentFire === null ? "—" : signed(currentFire)}</strong></div></header>
      <div className="kiln-tabletop-kiln-art">
        <img className="kiln-tabletop-kiln-art-image" src={sharedKilnArtwork} alt="" width="2482" height="3508" draggable={false} decoding="async" />
        <strong className={locale === "zh-CN" ? "kiln-tabletop-kiln-art-title" : "sr-only"} id="kiln-live-kiln-title">{text(locale, "Shared Kiln", "共窑")}</strong>
        <div className="kiln-tabletop-kiln-zones">{(["low", "middle", "high"] as const).map((zone) => {
          const spaces = KILN_SPACE_IDS.filter((id) => KILN_SPACE_DEFINITIONS[id].zone === zone);
          const modifier = zone === "high" ? 1 : zone === "low" ? -1 : 0;
          return (
            <div className={`kiln-tabletop-kiln-zone is-${zone}`} key={zone}>
              <span className={locale === "zh-CN" ? "kiln-tabletop-kiln-art-zone-label" : "sr-only"}><b>{locale === "zh-CN" ? zoneZh(zone) : titleCase(zone)}</b><i>{signed(modifier)}</i></span>
              <div>{spaces.map((spaceId) => {
                const ceramic = loaded.find((candidate) => candidate.stage === "loaded" && candidate.kilnSpaceId === spaceId);
                const active = activeSpaces.has(spaceId);
                const minimumPlayers = minimumPlayersForKilnSpace(spaceId);
                return <div className="kiln-tabletop-kiln-art-slot" data-kiln-space-id={spaceId} key={spaceId}>{!active
                  ? <i className="kiln-tabletop-empty-slot is-locked" data-min-players={minimumPlayers} aria-label={text(locale, `Locked kiln space — requires ${minimumPlayers} players`, `未开放窑位——需要${minimumPlayers}名玩家`)}>{minimumPlayers}P</i>
                  : ceramic === undefined
                    ? <i className="kiln-tabletop-empty-slot" aria-label={text(locale, "Empty kiln space", "空窑位")} />
                    : <Ceramic ceramic={ceramic} game={game} locale={locale} compact inspectable kilnZone={zone} kilnZoneModifier={modifier} />}</div>;
              })}</div>
            </div>
          );
        })}</div>
      </div>
      <footer><span>{text(locale, "Fires after every worker is placed", "全部工人放置后烧成")}</span><strong>{text(locale, `${loaded.length} / ${activeSpaces.size} occupied`, `已占 ${loaded.length} / ${activeSpaces.size}`)}</strong></footer>
    </section>
  );
}

function FiringDeck({ game, events, locale }: { game: PublicGameState; events: PublicEventRecord[]; locale: Locale }) {
  const previewId = `kiln-fire-history-${useId()}`;
  const descriptionId = `${previewId}-description`;
  const preview = useCardPreview<HTMLButtonElement>(previewId);
  const history = fireCardHistory(game, events);
  const topDiscard = game.discards.fire.at(-1);
  const title = text(locale, "Fire deck discard", "窑火弃牌堆");
  return <>
    <button
      ref={preview.anchorRef}
      type="button"
      className="kiln-tabletop-firing-deck"
      data-testid="fire-discard"
      data-hover-preview="fire-history"
      aria-label={title}
      aria-describedby={descriptionId}
      aria-expanded={preview.position !== null}
      aria-controls={previewId}
      onPointerEnter={(event) => { if (event.pointerType !== "touch") preview.pointerEnter(); }}
      onPointerLeave={preview.pointerLeave}
      onFocus={preview.focus}
      onBlur={preview.blur}
      onClick={preview.open}
      onKeyDown={(event) => { if (event.key === "Escape") preview.dismiss(); }}
    >
      <div className="kiln-tabletop-fire-card"><span aria-hidden="true">火</span><small>{game.discards.fire.length}</small></div>
      <div><small>{title}</small><strong>{topDiscard === undefined ? "—" : signed(topDiscard)}</strong><p>{text(locale, `${game.discards.fire.length} discarded · view history`, `${game.discards.fire.length}张弃牌 · 查看记录`)}</p></div>
    </button>
    <div className="sr-only" id={descriptionId}><FireHistoryList history={history} game={game} locale={locale} /></div>
    <CardHoverPreview id={previewId} position={preview.position} eyebrow={title} className="kiln-tabletop-fire-history-preview" onPointerEnter={preview.pointerEnter} onPointerLeave={preview.pointerLeave}>
      <FireHistoryList history={history} game={game} locale={locale} />
    </CardHoverPreview>
  </>;
}

function FireHistoryList({ history, game, locale }: { history: FireCardHistoryEntry[]; game: PublicGameState; locale: Locale }) {
  if (history.length === 0) return <p className="kiln-tabletop-fire-history-empty">{text(locale, "No Fire cards revealed yet.", "尚未揭示窑火牌。")}</p>;
  return <ol className="kiln-tabletop-fire-history">{history.map((entry, index) => <li className={entry.kind === "second" ? "is-second-firing" : ""} key={`${entry.round}-${entry.kind}-${index}`}>
    <span>{text(locale, `Round ${entry.round}: `, `第${entry.round}轮：`)}<strong className={entry.modifier > 0 ? "is-hot" : entry.modifier < 0 ? "is-cool" : ""}>{signed(entry.modifier)}</strong></span>
    {entry.kind === "second" && <small>{text(locale, "Second Firing", "复烧")}{entry.playerId === undefined ? "" : ` · ${game.players[entry.playerId]?.displayName ?? entry.playerId}`}</small>}
  </li>)}</ol>;
}

function ImperialTrack({ game, locale }: { game: PublicGameState; locale: Locale }) {
  const unclaimedPriority = game.playerOrder.map((id) => game.players[id]!).filter((player) => player.imperialRecognition < 3);
  return (
    <section className="kiln-tabletop-imperial-track" aria-label={text(locale, "Imperial Recognition track", "御府声望轨")}>
      <div className="kiln-tabletop-track-heading"><span aria-hidden="true">御</span><div><small>{text(locale, "IMPERIAL RECOGNITION", "御府声望")}</small><strong>{text(locale, "Court recognition and rewards", "宫廷认可与奖赏")}</strong></div></div>
      <ol>{IMPERIAL_PROGRESS.track.map((space) => (
        <li data-recognition-space={space.space} key={space.space}>
          <span className="kiln-tabletop-track-number">{space.space}</span>
          <div><strong>{locale === "zh-CN" ? space.titleZh : space.title}</strong><small>{space.space === 3 ? text(locale, "Take your Imperial Priority token.", "获得御烧优先标记。") : locale === "zh-CN" ? space.rewardZh ?? "—" : space.reward ?? "—"}</small></div>
          {space.space === 3 && unclaimedPriority.length > 0 && <div className="kiln-tabletop-priority-supply" data-testid="imperial-priority-supply" aria-label={text(locale, "Unclaimed Imperial Priority markers", "待领取的御烧优先标记")}>
            {unclaimedPriority.map((player) => <ImperialPriorityToken player={player} locale={locale} location="track" key={player.id} />)}
          </div>}
          <span className="kiln-tabletop-track-markers">{game.playerOrder.filter((id) => game.players[id]?.imperialRecognition === space.space).map((id) => { const player = game.players[id]!; return <i className={`kiln-tabletop-accent-${accent(player)}`} title={player.displayName} key={id}>{player.displayName.slice(0, 1).toUpperCase()}</i>; })}</span>
        </li>
      ))}</ol>
    </section>
  );
}

function TechniqueMarket({ game, locale, onInspect }: { game: PublicGameState; locale: Locale; onInspect: (id: TechniqueId) => void }) {
  return (
    <aside className="kiln-tabletop-tech-market" aria-labelledby="kiln-live-tech-title">
      <div className="kiln-tabletop-section-title"><span aria-hidden="true">艺</span><div><small>{text(locale, "GUILD & ACADEMY", "陶工行")}</small><strong id="kiln-live-tech-title">{text(locale, "Face-up Techs", "公开进阶技艺")}</strong></div></div>
      {(["forming", "glazing", "firing"] as TechniqueDiscipline[]).map((discipline) => <section className={`kiln-tabletop-tech-discipline is-${discipline}`} key={discipline}><header><strong>{locale === "zh-CN" ? disciplineZh(discipline) : titleCase(discipline)}</strong><small>{text(locale, "deck", "牌库")} · {game.decks.techniqueRemaining[discipline]}</small></header><div>{game.displays.techniques[discipline].map((id) => <TechniqueTile id={id} locale={locale} onInspect={onInspect} key={id} />)}{game.displays.techniques[discipline].length === 0 && <span className="kiln-live-empty-tile">{text(locale, "Empty", "空")}</span>}</div></section>)}
    </aside>
  );
}

function TechniqueTile({ id, locale, owned = false, exhausted = false, onInspect }: { id: TechniqueId; locale: Locale; owned?: boolean; exhausted?: boolean; onInspect: (id: TechniqueId) => void }) {
  const technique = TECHNIQUE_DEFINITIONS[id];
  const previewId = `kiln-technique-preview-${id}-${owned ? "owned" : "market"}`;
  const descriptionId = `${previewId}-description`;
  const preview = useCardPreview<HTMLButtonElement>(previewId);
  if (technique === undefined) return null;
  const description = techniqueShortPlainText(id, locale);
  return (
    <>
      <button
        ref={preview.anchorRef}
        className={`kiln-tabletop-tech-tile kiln-tabletop-art-surface is-${technique.discipline} ${owned ? "is-owned" : ""} ${exhausted ? "is-exhausted" : ""}`}
        type="button"
        onClick={() => { preview.dismiss(); onInspect(id); }}
        onPointerEnter={(event) => { if (event.pointerType !== "touch") preview.pointerEnter(); }}
        onPointerLeave={preview.pointerLeave}
        onFocus={preview.focus}
        onBlur={preview.blur}
        onKeyDown={(event) => { if (event.key === "Escape") preview.dismiss(); }}
        aria-label={text(locale, `Inspect ${technique.name}`, `查看${technique.nameZh}`)}
        aria-describedby={descriptionId}
        aria-haspopup="dialog"
        data-hover-preview="advanced-technique"
        data-preview-id={previewId}
        data-technique-id={id}
      >
        <ArtworkLayer source={TABLETOP_ARTWORK.techniques[id]} slot={`technique:${id}`} />
        <header><span>{id}</span><TechniqueCoinCost cost={technique.cost} locale={locale} /></header><strong>{locale === "zh-CN" ? technique.nameZh : technique.name}</strong><p><TechniqueDescription id={id} locale={locale} layer="preview" /></p><footer><span>{technique.oncePerRound ? text(locale, "Once per round", "每轮一次") : text(locale, "Continuous", "持续生效")}</span><TechniqueEndGameVp locale={locale} /></footer>{exhausted && <i>{text(locale, "Used", "已用")}</i>}
      </button>
      <span className="sr-only" id={descriptionId}>{description}</span>
      <CardHoverPreview id={previewId} position={preview.position} eyebrow={text(locale, "ADVANCED TECH PREVIEW · CLICK FOR DETAILS", "进阶技艺预览 · 点击查看详情")} onPointerEnter={preview.pointerEnter} onPointerLeave={preview.pointerLeave}>
        <StaticTechniqueTile id={id} locale={locale} exhausted={exhausted} layer="preview" />
      </CardHoverPreview>
    </>
  );
}

function StaticTechniqueTile({ id, locale, exhausted = false, layer = "full" }: { id: TechniqueId; locale: Locale; exhausted?: boolean; layer?: "preview" | "full" }) {
  const technique = TECHNIQUE_DEFINITIONS[id];
  if (technique === undefined) return null;
  return <article className={`kiln-tabletop-tech-tile kiln-tabletop-static-tech kiln-tabletop-art-surface is-${technique.discipline} ${exhausted ? "is-exhausted" : ""}`} data-technique-id={id} data-description-layer={layer}><ArtworkLayer source={TABLETOP_ARTWORK.techniques[id]} slot={`technique:${id}`} /><header><span>{id}</span><TechniqueCoinCost cost={technique.cost} locale={locale} /></header><strong>{locale === "zh-CN" ? technique.nameZh : technique.name}</strong><p><TechniqueDescription id={id} locale={locale} layer={layer} /></p><footer><span>{technique.oncePerRound ? text(locale, "Once per round", "每轮一次") : text(locale, "Continuous", "持续生效")}</span><TechniqueEndGameVp locale={locale} /></footer>{exhausted && <i>{text(locale, "Used", "已用")}</i>}</article>;
}

function TechniqueCoinCost({ cost, locale }: { cost: number; locale: Locale }) {
  return <b className="kiln-tabletop-tech-cost" aria-label={text(locale, `${cost} Coins`, `${cost}铜钱`)}><span>{cost}</span><i className="kiln-tabletop-cash-coin" aria-hidden="true" /></b>;
}

function TechniqueEndGameVp({ locale }: { locale: Locale }) {
  return <b className="kiln-tabletop-tech-endgame-vp" title={text(locale, "Scores 1 VP at game end", "终局计分时获得1分")} aria-label={text(locale, "Scores 1 VP at game end", "终局计分时获得1分")}>1VP</b>;
}

function StartingTechniqueTile({ id, locale, owned = false, onInspect, layer = onInspect === undefined ? "full" : "preview" }: { id: StartingTechniqueId; locale: Locale; owned?: boolean; onInspect?: (id: StartingTechniqueId) => void; layer?: "preview" | "full" }) {
  const technique = STARTING_TECHNIQUE_DEFINITIONS[id];
  const previewId = `kiln-starting-technique-preview-${id}`;
  const descriptionId = `${previewId}-description`;
  const preview = useCardPreview<HTMLButtonElement>(previewId);
  const className = `kiln-tabletop-starting-tech kiln-tabletop-art-surface ${owned ? "is-owned" : ""}`;
  const contents = <><ArtworkLayer source={TABLETOP_ARTWORK.techniques[id]} slot={`starting-technique:${id}`} /><header><span>{id}</span><small>{text(locale, "Starting Tech", "起始技艺")}</small></header><strong>{locale === "zh-CN" ? technique.nameZh : technique.name}</strong><p><TechniqueDescription id={id} locale={locale} layer={layer} /></p></>;
  if (onInspect === undefined) return <article className={className} data-starting-technique-id={id} data-description-layer={layer}>{contents}</article>;
  return (
    <>
      <button
        ref={preview.anchorRef}
        className={className}
        type="button"
        onClick={() => { preview.dismiss(); onInspect(id); }}
        onPointerEnter={(event) => { if (event.pointerType !== "touch") preview.pointerEnter(); }}
        onPointerLeave={preview.pointerLeave}
        onFocus={preview.focus}
        onBlur={preview.blur}
        onKeyDown={(event) => { if (event.key === "Escape") preview.dismiss(); }}
        aria-label={text(locale, `Inspect ${technique.name}`, `查看${technique.nameZh}`)}
        aria-describedby={descriptionId}
        aria-haspopup="dialog"
        data-hover-preview="starting-technique"
        data-preview-id={previewId}
        data-starting-technique-id={id}
      >{contents}</button>
      <span className="sr-only" id={descriptionId}>{techniqueShortPlainText(id, locale)}</span>
      <CardHoverPreview id={previewId} position={preview.position} eyebrow={text(locale, "STARTING TECH PREVIEW · CLICK FOR DETAILS", "起始技艺预览 · 点击查看详情")} onPointerEnter={preview.pointerEnter} onPointerLeave={preview.pointerLeave}>
        <StartingTechniqueTile id={id} locale={locale} layer="preview" />
      </CardHoverPreview>
    </>
  );
}

function OwnWorkshop({
  game,
  player,
  locale,
  selectedWorkerId,
  canSelectWorker,
  onChooseWorker,
  onPass,
  onInspectOrder,
  onInspectTechnique,
  onInspectStartingTechnique,
}: {
  game: PublicGameState;
  player: PublicPlayerState;
  locale: Locale;
  selectedWorkerId: WorkerId | null;
  canSelectWorker: boolean;
  onChooseWorker: (id: WorkerId) => void;
  onPass?: (() => Promise<boolean>) | undefined;
  onInspectOrder: (id: OrderId) => void;
  onInspectTechnique: (id: TechniqueId) => void;
  onInspectStartingTechnique: (id: StartingTechniqueId) => void;
}) {
  const kiln = player.kilnId === null ? null : KILN_DEFINITIONS[player.kilnId];
  const availableWorkers = Object.values(player.workers).filter((worker) => worker.status === "available");
  const ceramics = currentCeramicsForPlayer(game, player.id).filter((ceramic) => ceramic.stage !== "loaded");
  return (
    <section className="kiln-tabletop-workshop" aria-labelledby="kiln-live-workshop-title">
      <header>
        <div className="kiln-tabletop-workshop-name"><span aria-hidden="true">{kiln?.nameZh.slice(0, 1) ?? "窑"}</span><div><small>{text(locale, "YOUR WORKSHOP", "你的作坊")}</small><strong id="kiln-live-workshop-title">{kiln === null ? text(locale, "Kiln not selected", "尚未选择窑口") : locale === "zh-CN" ? kiln.nameZh : kiln.name}</strong>{kiln !== null && <p><b>{locale === "zh-CN" ? kiln.abilityNameZh : kiln.abilityName}</b> · <KilnDescription id={kiln.id} locale={locale} layer="preview" /></p>}</div></div>
        <div className="kiln-tabletop-resource-bank"><Resource glyph="泥" label={text(locale, "Clay", "泥")} value={player.resources.clay} /><Resource glyph="柴" label={text(locale, "Wood", "柴")} value={player.resources.wood} /><Resource glyph="宋" label={text(locale, "Coins", "铜钱")} value={player.resources.coins} /><Resource glyph="分" label={text(locale, "VP", "分数")} value={playerVp(game, player)} /></div>
      </header>
      <div className="kiln-tabletop-workshop-zones">
        <section className="kiln-tabletop-worker-supply">
          <header>
            <h3>{text(locale, "Available workers", "可用工人")}</h3>
            {onPass !== undefined && <button className="kiln-tabletop-pass-button" type="button" disabled={!canSelectWorker} onClick={() => void onPass()}>{text(locale, "Pass round", "本轮跳过")}</button>}
          </header>
          <div>{availableWorkers.map((worker) => <button type="button" disabled={!canSelectWorker} aria-label={workerLabel(player, worker.kind, locale)} aria-pressed={selectedWorkerId === worker.id} className={selectedWorkerId === worker.id ? "is-selected" : ""} onClick={() => onChooseWorker(worker.id)} data-worker-id={worker.id} key={worker.id}><WorkerMeeple player={player} kind={worker.kind} locale={locale} /></button>)}{availableWorkers.length === 0 && <span className="kiln-live-empty-copy">{text(locale, "No workers remain", "没有剩余工人")}</span>}</div>
          <ImperialPriorityReserve player={player} locale={locale} location="workshop" />
        </section>
        <section className="kiln-tabletop-ceramic-shelf"><h3>{text(locale, "Ceramics", "陶瓷")} <span>{ceramics.length}</span></h3><div>{ceramics.map((ceramic) => <Ceramic ceramic={ceramic} game={game} locale={locale} inspectable key={ceramic.id} />)}{ceramics.length === 0 && <span className="kiln-live-empty-copy">{text(locale, "No ceramics in workshop", "作坊中没有陶瓷")}</span>}</div></section>
        <section className="kiln-tabletop-own-orders"><h3>{text(locale, "Your Orders", "你的委托")} <span>{player.orderHandCount} / {GAME_CONFIG.orderDisplay.baseHandLimit}</span></h3><div>{player.orderHand.map((id) => <OrderCard id={id} locale={locale} owned onInspect={onInspectOrder} key={id} />)}{player.orderHand.length === 0 && <span className="kiln-live-empty-copy">{text(locale, "No held Orders", "没有持有委托")}</span>}</div></section>
        <section className="kiln-tabletop-own-techs"><h3>{text(locale, "Your Techs", "你的技艺")} <span>{text(locale, `${player.startingTechniqueId === null ? 0 : 1} Starting · ${player.techniques.length} / ${GAME_CONFIG.techniques.maxOwned} Advanced`, `${player.startingTechniqueId === null ? 0 : 1}起始 · ${player.techniques.length} / ${GAME_CONFIG.techniques.maxOwned}进阶`)}</span></h3><div>{player.startingTechniqueId !== null && <StartingTechniqueTile id={player.startingTechniqueId} locale={locale} owned onInspect={onInspectStartingTechnique} />}{player.techniques.map((technique) => <TechniqueTile id={technique.id} locale={locale} owned exhausted={technique.exhausted} onInspect={onInspectTechnique} key={technique.id} />)}{player.startingTechniqueId === null && player.techniques.length === 0 && <span className="kiln-live-empty-copy">{text(locale, "No Tech selected", "尚未选择技艺")}</span>}</div></section>
      </div>
    </section>
  );
}

function Resource({ glyph, label, value }: { glyph: string; label: string; value: number }) {
  return <span className="kiln-tabletop-resource"><i aria-hidden="true">{glyph}</i><b>{value}</b><small>{label}</small></span>;
}

function Ceramic({ ceramic, game, locale, compact = false, inspectable = false, kilnZone, kilnZoneModifier }: { ceramic: CeramicState; game: PublicGameState; locale: Locale; compact?: boolean; inspectable?: boolean; kilnZone?: "high" | "middle" | "low"; kilnZoneModifier?: number }) {
  // A ceramic may appear on the board and in an inspector at the same time.
  const previewId = `kiln-ceramic-preview-${useId()}`;
  const descriptionId = `${previewId}-description`;
  const preview = useCardPreview<HTMLButtonElement>(previewId);
  const player = game.players[ceramic.ownerId];
  if (player === undefined) return null;
  const glaze = "glaze" in ceramic ? ceramic.glaze : null;
  const decoration = "decoration" in ceramic ? ceramic.decoration : null;
  const quality = "quality" in ceramic ? ceramic.quality : null;
  const heat = glaze === null ? null : preferredHeat(glaze);
  const marked = player.kilnYardShifuCeramicId === ceramic.id;
  const shifuHeat = ceramic.stage === "loaded" ? ceramic.shifuHeatAdjustment ?? null : null;
  const furniture = ceramic.stage === "loaded" && ceramic.kilnFurnitureUsed === true;
  const shape = shapeLabel(ceramic.shape, locale);
  const imperial = ceramic.stage === "loaded" && ceramic.kilnSpaceId === "imperial";
  const zone = kilnZone === undefined ? null : text(locale, `${titleCase(kilnZone)} zone`, zoneZh(kilnZone));
  const kilnLocation = imperial ? text(locale, "Imperial Kiln +0", "御窑 +0") : zone === null ? null : `${zone} ${signed(furniture ? 0 : kilnZoneModifier ?? 0)}${furniture ? text(locale, " (Kiln Furniture)", "（支烧窑具）") : ""}`;
  const className = `kiln-tabletop-ceramic glaze-${glaze ?? "raw"} decoration-${decoration ?? "none"} shape-${ceramic.shape} kiln-tabletop-accent-${accent(player)} ${compact ? "is-compact" : ""} ${inspectable ? "is-inspectable" : ""}`;
  const visual = <>
    <svg viewBox="0 0 80 72" aria-hidden="true"><CeramicShape shape={ceramic.shape} /><CeramicDecoration decoration={decoration} /></svg>
    {quality !== null && <b className={`kiln-tabletop-quality-badge is-${quality}`} title={qualityLabel(quality, locale)}>{qualityLabel(quality, locale)}</b>}
    {marked && shifuHeat === null && <em className="kiln-tabletop-shifu-marker" title={text(locale, "Kiln Yard Shifu committed to this ceramic", "窑坊师傅已标记此陶瓷")}>{text(locale, "S", "师")}</em>}
    {shifuHeat !== null && <em className={`kiln-tabletop-shifu-heat-marker is-${shifuHeat === 1 ? "warmer" : "cooler"}`} title={text(locale, `Shifu Heat marker: ${signed(shifuHeat)} Actual Heat for this firing`, `师傅火候标记：本次烧成实际火候${signed(shifuHeat)}`)}>{signed(shifuHeat)}</em>}
    {furniture && <em className="kiln-live-furniture-marker" title={text(locale, "Kiln Furniture attached", "已附窑具")}>{text(locale, "Furniture", "窑具")}</em>}
  </>;
  const details = <>
    <span className="kiln-tabletop-ceramic-tooltip-owner"><i aria-hidden="true" /><span><small>{text(locale, "BELONGS TO", "所属玩家")}</small><strong>{player.displayName}</strong></span></span>
    <span className="kiln-tabletop-ceramic-tooltip-title"><strong>{shape}</strong><small>{stageLabel(ceramic.stage, locale)}{kilnLocation === null ? "" : ` · ${kilnLocation}`}</small></span>
    <span className="kiln-tabletop-ceramic-tooltip-facts">
      <span><small>{text(locale, "Glaze", "釉色")}</small><strong>{glaze === null ? text(locale, "Not yet glazed", "尚未施釉") : glazeLabel(glaze, locale)}</strong></span>
      <span><small>{text(locale, "Decoration", "纹饰")}</small><strong>{decoration === null ? text(locale, "Not yet decorated", "尚未纹饰") : decorationLabel(decoration, locale)}</strong></span>
      <span><small>{text(locale, "Preferred Heat", "适烧火候")}</small><strong>{heat ?? "—"}</strong></span>
    </span>
    {quality !== null && <span className="kiln-tabletop-ceramic-tooltip-note is-quality">{text(locale, "Quality", "品质")} · {qualityLabel(quality, locale)}</span>}
    {marked && shifuHeat === null && <span className="kiln-tabletop-ceramic-tooltip-note">{text(locale, "Shifu committed: may choose +1 or −1 Heat before Fire", "师傅已放置：揭示火牌前可选择+1或−1火候")}</span>}
    {shifuHeat !== null && <span className="kiln-tabletop-ceramic-tooltip-note">{text(locale, `Shifu Heat marker: ${signed(shifuHeat)} Actual Heat, in addition to its zone modifier. Fixed for this firing.`, `师傅火候标记：实际火候${signed(shifuHeat)}，与窑位修正叠加。本次烧成中数值固定。`)}</span>}
    {furniture && <span className="kiln-tabletop-ceramic-tooltip-note">{text(locale, "Kiln Furniture used", "已使用窑具")}</span>}
  </>;
  if (!inspectable) return <span className={className} data-decoration={decoration ?? undefined} data-glaze={glaze ?? undefined} data-shape={ceramic.shape} aria-label={`${player.displayName} · ${shape}`}>{visual}</span>;
  return <>
    <button
      ref={preview.anchorRef}
      className={className}
      type="button"
      data-decoration={decoration ?? undefined}
      data-glaze={glaze ?? undefined}
      data-shape={ceramic.shape}
      data-hover-preview="ceramic"
      data-preview-id={previewId}
      aria-label={text(locale, `Inspect ${player.displayName}'s ${shape}`, `查看${player.displayName}的${shape}`)}
      aria-describedby={descriptionId}
      onPointerEnter={(event) => { if (event.pointerType !== "touch") preview.pointerEnter(); }}
      onPointerLeave={preview.pointerLeave}
      onFocus={preview.focus}
      onBlur={preview.blur}
      onClick={preview.open}
      onKeyDown={(event) => {
        if (event.key === "Escape" && preview.position !== null) {
          event.preventDefault();
          event.stopPropagation();
          preview.dismiss();
        }
      }}
    >{visual}</button>
    <span className="sr-only" id={descriptionId}>{details}</span>
    <CardHoverPreview
      id={previewId}
      position={preview.position}
      className={`kiln-tabletop-ceramic-preview kiln-tabletop-accent-${accent(player)}`}
      eyebrow={text(locale, "CERAMIC DETAILS", "陶瓷详情")}
      onPointerEnter={preview.pointerEnter}
      onPointerLeave={preview.pointerLeave}
    ><div className="kiln-tabletop-ceramic-tooltip">{details}</div></CardHoverPreview>
  </>;
}

function CeramicShape({ shape }: { shape: Shape }) {
  if (shape === "bowl") return <path d="M8 22h64c-3 26-14 38-32 38S11 48 8 22zM18 64h44" />;
  if (shape === "plate") return <path d="M7 35c10 22 56 22 66 0M13 35h54M25 55h30" />;
  if (shape === "washer") return <path d="M12 28h56l-7 30H19zM27 62h26M25 25c0-10 30-10 30 0" />;
  if (shape === "vase") return <path d="M29 8h22l-3 13c15 9 19 34 5 42H27c-14-8-10-33 5-42zM29 9h22" />;
  return <path d="M18 27h44l-5 29H23zM29 17h22l5 10H24zM19 59l-5 7M61 59l5 7M36 12c-3-5 2-7 0-11M46 12c-3-5 2-7 0-11" />;
}

function CeramicDecoration({ decoration }: { decoration: Decoration | null }) {
  if (decoration === "carved") return <g className="kiln-tabletop-decoration-pattern is-carved"><path d="M31 33q9 6 18 0M29 40q11 7 22 0M31 47q9 6 18 0" /></g>;
  if (decoration === "impressed") return <g className="kiln-tabletop-decoration-pattern is-impressed"><circle cx="34" cy="36" r="2.2" /><circle cx="43" cy="36" r="2.2" /><circle cx="38.5" cy="44" r="2.2" /><circle cx="47.5" cy="44" r="2.2" /></g>;
  if (decoration === "crackle") return <g className="kiln-tabletop-decoration-pattern is-crackle"><path d="M40 29l-3 8 4 5-5 9M37 37l-7-4-4 3M41 42l7-6 6 2M39 46l7 5" /></g>;
  return null;
}

function Inspector({ inspection, game, events, describeEvent, locale, onClose }: { inspection: Exclude<Inspection, null>; game: PublicGameState; events: PublicEventRecord[]; describeEvent: TabletopGameExperienceProps["describeEvent"]; locale: Locale; onClose: () => void }) {
  const player = inspection.type === "player" ? game.players[inspection.id] : undefined;
  const order = inspection.type === "order" ? ORDER_DEFINITIONS[inspection.id] : undefined;
  const technique = inspection.type === "technique" ? TECHNIQUE_DEFINITIONS[inspection.id] : undefined;
  const startingTechnique = inspection.type === "startingTechnique" ? STARTING_TECHNIQUE_DEFINITIONS[inspection.id] : undefined;
  const title = player !== undefined ? text(locale, `${player.displayName}'s workshop`, `${player.displayName}的作坊`) : order !== undefined ? text(locale, `Order ${order.id}`, `委托 ${order.id}`) : technique !== undefined ? locale === "zh-CN" ? technique.nameZh : technique.name : startingTechnique !== undefined ? locale === "zh-CN" ? startingTechnique.nameZh : startingTechnique.name : text(locale, "Game log", "游戏记录");
  return (
    <ModalPanel title={title} eyebrow={text(locale, "TABLE INSPECTOR", "桌面查看")} locale={locale} onClose={onClose}>
      {player !== undefined && <PlayerInspection player={player} game={game} locale={locale} />}
      {order !== undefined && <OrderInspection id={order.id} locale={locale} />}
      {technique !== undefined && <TechniqueInspection id={technique.id} locale={locale} />}
      {startingTechnique !== undefined && <StartingTechniqueInspection id={startingTechnique.id} locale={locale} />}
      {inspection.type === "log" && <LogInspection game={game} events={events} describeEvent={describeEvent} locale={locale} />}
    </ModalPanel>
  );
}

function ModalPanel({ title, eyebrow, locale, onClose, open = true, className = "", children }: { title: string; eyebrow: string; locale: Locale; onClose: () => void; open?: boolean; className?: string; children: ReactNode }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    return () => {
      const returnTarget = returnFocusRef.current;
      if (returnTarget === null) return;
      // Focus restoration should not reopen a card preview behind the closing dialog.
      returnTarget.dataset["kilnSuppressCardPreviewFocus"] = "true";
      returnTarget.focus();
      delete returnTarget.dataset["kilnSuppressCardPreviewFocus"];
    };
  }, [open]);
  function keyDown(event: ReactKeyboardEvent<HTMLElement>): void {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"));
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return <div className="kiln-tabletop-inspector-backdrop" hidden={!open} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className={`kiln-tabletop-inspector ${className}`} role="dialog" aria-modal="true" aria-label={title} onKeyDown={keyDown}><header><div><small>{eyebrow}</small><strong>{title}</strong></div><button ref={closeButtonRef} type="button" onClick={onClose} aria-label={text(locale, "Close panel", "关闭面板")}>×</button></header>{children}</aside></div>;
}

function PlayerInspection({ player, game, locale }: { player: PublicPlayerState; game: PublicGameState; locale: Locale }) {
  const kiln = player.kilnId === null ? null : KILN_DEFINITIONS[player.kilnId];
  const ceramics = currentCeramicsForPlayer(game, player.id);
  return <div className="kiln-tabletop-inspector-content"><section className={`kiln-tabletop-inspector-player kiln-tabletop-accent-${accent(player)}`}><span>{player.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{kiln === null ? text(locale, "Kiln not selected", "尚未选择窑口") : locale === "zh-CN" ? kiln.nameZh : kiln.name}</strong><small>{kiln === null ? text(locale, "Choosing kiln", "正在选择窑口") : locale === "zh-CN" ? kiln.abilityNameZh : kiln.abilityName}</small></div><b>{playerVp(game, player)} {text(locale, "VP", "分")}</b></section>{kiln !== null && <p className="kiln-tabletop-ability-copy"><KilnDescription id={kiln.id} locale={locale} layer="full" /></p>}<section className="kiln-tabletop-inspector-resources"><Resource glyph="泥" label={text(locale, "Clay", "泥")} value={player.resources.clay} /><Resource glyph="柴" label={text(locale, "Wood", "柴")} value={player.resources.wood} /><Resource glyph="宋" label={text(locale, "Coins", "铜钱")} value={player.resources.coins} /><Resource glyph="御" label={text(locale, "Recognition", "御府声望")} value={player.imperialRecognition} /></section><ImperialPriorityReserve player={player} locale={locale} location="inspection" /><section className="kiln-tabletop-inspector-section"><h3>{text(locale, "Held Orders", "持有委托")} <span>{player.orderHandCount} / {GAME_CONFIG.orderDisplay.baseHandLimit}</span></h3><div className="kiln-tabletop-inspector-orders">{player.orderHand.map((id) => <StaticOrderCard id={id} locale={locale} key={id} />)}{player.orderHand.length === 0 && <p>{player.orderHandCount > 0 ? text(locale, "Orders in hand are private.", "持有委托为秘密信息。") : text(locale, "No held Orders.", "没有持有委托。")}</p>}</div></section><section className="kiln-tabletop-inspector-section"><h3>{text(locale, "Techs", "技艺")} <span>{player.techniques.length} / {GAME_CONFIG.techniques.maxOwned} {text(locale, "Advanced", "进阶")}</span></h3><div className="kiln-tabletop-inspector-techs">{player.startingTechniqueId !== null && <StartingTechniqueTile id={player.startingTechniqueId} locale={locale} />}{player.techniques.map((owned) => <StaticTechniqueTile id={owned.id} locale={locale} exhausted={owned.exhausted} key={owned.id} />)}</div></section><section className="kiln-tabletop-inspector-section"><h3>{text(locale, "Current ceramics", "当前陶瓷")} <span>{ceramics.length}</span></h3><div className="kiln-live-inspector-ceramics">{ceramics.map((ceramic) => <Ceramic ceramic={ceramic} game={game} locale={locale} inspectable key={ceramic.id} />)}</div></section>{player.completedOrders.length > 0 && <details className="kiln-live-completed-orders"><summary>{text(locale, "Completed Orders", "已完成委托")} · {player.completedOrders.length}</summary><ul>{player.completedOrders.map((completed) => <li key={`${completed.orderId}-${completed.completedInRound}`}>{completed.orderId} · {completed.vpAwarded} {text(locale, "VP", "分")}</li>)}</ul></details>}</div>;
}

/** Delivered and sold pieces are historical records, not ceramics still held by a player. */
export function currentCeramicsForPlayer(
  game: Pick<PublicGameState, "ceramics">,
  playerId: PlayerId,
): CeramicState[] {
  return Object.values(game.ceramics).filter(
    (ceramic) => ceramic.ownerId === playerId && ceramic.stage !== "delivered" && ceramic.stage !== "sold",
  );
}

export function OrderInspection({ id, locale }: { id: OrderId; locale: Locale }) {
  const order = ORDER_DEFINITIONS[id];
  if (order === undefined) return null;
  return <div className="kiln-tabletop-inspector-content kiln-tabletop-detail-view"><StaticOrderCard id={id} locale={locale} /><dl><div><dt>{text(locale, "Ceramics", "陶瓷")}</dt><dd>{order.ceramics.length}</dd></div><div><dt>{text(locale, "Minimum Quality", "最低品质")}</dt><dd>{qualityLabel(order.minQuality, locale)}</dd></div>{additionalOrderQuality(id, locale).map((requirement) => <div key={requirement.key}><dt>{text(locale, "Also required", "额外要求")}</dt><dd>{requirement.full}</dd></div>)}<div><dt>{text(locale, "Reward", "奖励")}</dt><dd>{order.vp} {text(locale, "VP", "分")} · {order.coins} {text(locale, "Coins", "铜钱")} {order.crowns > 0 ? `· ${order.crowns} ♛` : ""}</dd></div></dl><p>{text(locale, "Shape, Glaze and Decoration requirements are independent unless the Order explicitly pairs them.", "除非委托明确将属性配对，器型、釉色与纹饰要求均独立匹配。")}</p></div>;
}

function TechniqueInspection({ id, locale }: { id: TechniqueId; locale: Locale }) {
  const technique = TECHNIQUE_DEFINITIONS[id];
  if (technique === undefined) return null;
  return <div className="kiln-tabletop-inspector-content kiln-tabletop-detail-view"><StaticTechniqueTile id={id} locale={locale} /><TechniqueUseNote id={id} locale={locale} /><dl><div><dt>{text(locale, "Discipline", "类别")}</dt><dd>{locale === "zh-CN" ? disciplineZh(technique.discipline) : titleCase(technique.discipline)}</dd></div><div><dt>{text(locale, "Printed cost", "牌面费用")}</dt><dd>{technique.cost} {text(locale, "Coins", "铜钱")}</dd></div><div><dt>{text(locale, "Timing", "时机")}</dt><dd>{technique.oncePerRound ? text(locale, "Once per round", "每轮一次") : text(locale, "Continuous", "持续生效")}</dd></div></dl><TechniqueClarifications id={id} locale={locale} /></div>;
}

function StartingTechniqueInspection({ id, locale }: { id: StartingTechniqueId; locale: Locale }) {
  return <div className="kiln-tabletop-inspector-content kiln-tabletop-detail-view"><StartingTechniqueTile id={id} locale={locale} /><TechniqueUseNote id={id} locale={locale} /><dl><div><dt>{text(locale, "Type", "类型")}</dt><dd>{text(locale, "Starting Tech", "起始技艺")}</dd></div></dl><TechniqueClarifications id={id} locale={locale} /></div>;
}

function LogInspection({ game, events, describeEvent, locale }: { game: PublicGameState; events: PublicEventRecord[]; describeEvent: TabletopGameExperienceProps["describeEvent"]; locale: Locale }) {
  return <ol className="kiln-tabletop-log kiln-live-log">{[...events].reverse().map((record) => <li key={record.sequence}><p>{describeEvent(record, game, locale)}</p></li>)}{events.length === 0 && <li><p>{text(locale, "No game events yet.", "尚无游戏记录。")}</p></li>}</ol>;
}

function ImperialKilnGallery({ game, locale }: { game: PublicGameState; locale: Locale }) {
  const owners = game.playerOrder.map((id) => game.players[id]!).filter(hasImperialKiln);
  if (owners.length === 0) return null;
  return <section className="kiln-tabletop-imperial-gallery" data-testid="imperial-kiln-gallery" aria-label={text(locale, "Imperial kilns", "御窑")}>
    <header><span aria-hidden="true">御</span><div><h2>{text(locale, "Imperial kilns", "御窑")}</h2><p>{text(locale, "Personal spaces · fire with the Shared Kiln", "专属窑位 · 与共窑一同烧成")}</p></div></header>
    <div style={{ "--imperial-kiln-count": owners.length } as CSSProperties}>{owners.map((player) => <ImperialKilnTile game={game} player={player} locale={locale} key={player.id} />)}</div>
  </section>;
}

function ImperialKilnTile({ game, player, locale }: { game: PublicGameState; player: PublicPlayerState; locale: Locale }) {
  const titleId = `imperial-kiln-title-${useId()}`;
  const ceramic = Object.values(game.ceramics).find((candidate) => candidate.ownerId === player.id && candidate.stage === "loaded" && candidate.kilnSpaceId === "imperial");
  return <article className={`kiln-tabletop-imperial-kiln kiln-tabletop-accent-${accent(player)} ${ceramic === undefined ? "is-empty" : "is-loaded"}`} data-testid="imperial-kiln-tile" data-player-id={player.id} aria-labelledby={titleId}>
    <header><span className="kiln-tabletop-imperial-owner"><i aria-hidden="true" />{player.displayName}</span><span className="kiln-tabletop-imperial-grant">{text(locale, "Imperial Gift", "御赐")}</span></header>
    <div className="kiln-tabletop-imperial-title"><h3 id={titleId}>{text(locale, "Imperial Kiln", "御窑")}</h3><span aria-label={text(locale, "Kiln modifier +0", "窑位修正 +0")}>+0</span></div>
    <div className="kiln-tabletop-imperial-chamber">
      <ImperialKilnIllustration />
      <div className="kiln-tabletop-imperial-slot" data-testid="imperial-kiln-slot">{ceramic === undefined
        ? <span className="kiln-tabletop-imperial-empty" role="img" aria-label={text(locale, "Empty Imperial Kiln space", "空御窑位")}><span aria-hidden="true">1</span></span>
        : <Ceramic ceramic={ceramic} game={game} locale={locale} compact inspectable />}</div>
    </div>
    <footer><span>{ceramic === undefined ? text(locale, "Empty", "空置") : text(locale, "Loaded", "已装窑")}</span><span>{ceramic === undefined ? "0 / 1" : "1 / 1"}</span></footer>
  </article>;
}

function hasImperialKiln(player: PublicPlayerState): boolean {
  return player.imperialRecognition >= 2 && player.imperialKilnUnlocked;
}

function ImperialPriorityToken({ player, locale, location }: { player: PublicPlayerState; locale: Locale; location: "track" | "workshop" | "inspection" }) {
  const previewId = `kiln-priority-preview-${useId()}`;
  const descriptionId = `${previewId}-description`;
  const preview = useCardPreview<HTMLButtonElement>(previewId);
  const label = text(locale, `${player.displayName}'s Imperial Priority`, `${player.displayName}的御烧优先`);
  const description = text(locale, "Once per game, before or after your worker action, spend it to load 1 Glazed ceramic into your empty Imperial Kiln.", "每局一次，在你的工人行动之前或之后，花费它将1件已施釉陶瓷装入你的空置御窑。");
  return <><button
    ref={preview.anchorRef}
    type="button"
    className={`kiln-tabletop-priority-token kiln-tabletop-accent-${accent(player)} is-${location}`}
    data-testid="imperial-priority-token"
    data-player-id={player.id}
    data-token-location={location}
    data-hover-preview="imperial-priority"
    aria-label={label}
    aria-describedby={descriptionId}
    aria-expanded={preview.position !== null}
    aria-controls={previewId}
    onPointerEnter={(event) => { if (event.pointerType !== "touch") preview.pointerEnter(); }}
    onPointerLeave={preview.pointerLeave}
    onFocus={preview.focus}
    onBlur={preview.blur}
    onClick={preview.open}
    onKeyDown={(event) => { if (event.key === "Escape") preview.dismiss(); }}
  >
    <svg viewBox="0 0 40 48" aria-hidden="true" focusable="false">
      <path className="kiln-tabletop-priority-edge" d="M9 2h22l7 7v30l-7 7H9l-7-7V9Z" />
      <path className="kiln-tabletop-priority-inlay" d="M10 6h20l4 5v26l-4 5H10l-4-5V11Z" />
      <path className="kiln-tabletop-priority-ornament" d="M13 11h14M13 37h14" />
      <text x="20" y="30" textAnchor="middle">令</text>
    </svg>
  </button>
    <span className="sr-only" id={descriptionId}>{description}</span>
    <CardHoverPreview id={previewId} position={preview.position} eyebrow={text(locale, "Imperial Priority", "御烧优先")} className="kiln-tabletop-priority-preview" onPointerEnter={preview.pointerEnter} onPointerLeave={preview.pointerLeave}>
      <div className={`kiln-tabletop-priority-tooltip kiln-tabletop-accent-${accent(player)}`}>
        <strong><i aria-hidden="true" />{player.displayName}</strong>
        <p>{description}</p>
      </div>
    </CardHoverPreview>
  </>;
}

function ImperialPriorityReserve({ player, locale, location }: { player: PublicPlayerState; locale: Locale; location: "workshop" | "inspection" }) {
  if (player.imperialRecognition < 3 || !player.imperialPriorityAvailable) return null;
  return <section className="kiln-tabletop-priority-reserve" aria-label={text(locale, "Imperial Priority", "御烧优先")}>
    <ImperialPriorityToken player={player} locale={locale} location={location} />
    <span><strong>{text(locale, "Imperial Priority", "御烧优先")}</strong><small>{text(locale, "Once per game", "每局一次")}</small></span>
  </section>;
}

function phaseName(game: PublicGameState, locale: Locale): string {
  const type = game.phase.type;
  if (type === "setup_kiln_selection") return text(locale, "Kiln selection", "选择窑口");
  if (type === "setup_starting_orders") return text(locale, "Starting Orders", "起始委托");
  if (type === "setup_starting_tech") return text(locale, "Starting Tech", "起始技艺");
  if (type.startsWith("work")) return type === "work" ? text(locale, "Work", "作业") : text(locale, "Work resolution", "作业结算");
  if (type === "firing_before_contribution") return text(locale, "Pre-firing Techniques", "烧成前技艺");
  if (type === "firing_contributions") return text(locale, "Secret Contributions", "秘密控火");
  if (type === "firing_shifu_adjustment") return text(locale, "Kiln Yard Shifu adjustment", "窑坊师傅调火");
  if (type === "firing_reveal_fire") return text(locale, "Reveal Fire", "揭示窑火");
  if (type === "firing_before_quality") return text(locale, "Kiln ability", "窑口能力");
  if (type === "firing_second_before_quality") return text(locale, "Second Firing", "复烧");
  if (type === "firing_after_quality") return text(locale, "After-Quality abilities", "品质判定后能力");
  if (type === "firing_workshop_seconds") return text(locale, "Flawed salvage", "瑕品处理");
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
