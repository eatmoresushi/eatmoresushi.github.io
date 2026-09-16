import {
  BASE_HEAT_START,
  CONTRIBUTION_CARDS,
  CONTRIBUTION_CARD_DEFINITIONS,
  JUN_ACTIVATION_WOOD,
  contributionHeatAdjustment,
  contributionWoodCost,
  orderHandLimit,
} from "../game/index.ts";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  DECORATIONS,
  DECORATION_COSTS,
  DISCIPLINES,
  GAME_CONFIG,
  GLAZES,
  IMPERIAL_PROGRESS,
  KILN_DEFINITIONS,
  KILN_IDS,
  KILN_SPACE_IDS,
  LOCATION_IDS,
  ORDER_DEFINITIONS,
  SHAPE_COSTS,
  SHAPES,
  STARTING_TECHNIQUES,
  TECHNIQUE_DEFINITIONS,
  activeKilnSpaceIds,
  currentDecisionActor,
  locationCapacity,
  matchingOrderCeramicGroups,
  matchesOrder,
  preferredHeat,
} from "../game";
import type {
  Decoration,
  FinishedCeramic,
  GameAction,
  Glaze,
  KilnId,
  KilnSpaceId,
  LocationId,
  OfficeOrderMode,
  PlayerId,
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
  PublicGameState,
  PublicPlayerState,
} from "../multiplayer";
import { OrderCard } from "./GameTable";
import { term as localizedTerm, useI18n } from "./i18n";
import type { Locale } from "./i18n";
import { WorkerMeeple } from "./WorkerMeeple";
import { kilnShortPlainText } from "./TechniqueDescription";

type SendCommand = (command: AuthoritativeCommand) => Promise<boolean>;

interface ActionPanelProps {
  game: PublicGameState;
  ownPlayerId: PlayerId;
  ownPendingContribution: PendingContribution | null;
  ownPrivateDecision?: PrivateDecisionState | undefined;
  /** Optional tabletop context. The engine still validates the submitted command. */
  selectedLocation?: LocationId | null | undefined;
  /** Moves the selected physical worker to the front of contextual form choices. */
  selectedWorkerId?: WorkerId | null | undefined;
  busy: boolean;
  send: SendCommand;
}

export function ActionPanel({
  game,
  ownPlayerId,
  ownPendingContribution,
  ownPrivateDecision,
  selectedLocation,
  selectedWorkerId,
  busy,
  send,
}: ActionPanelProps) {
  const { t } = useI18n();
  const player = game.players[ownPlayerId];
  if (player === undefined) return null;

  return (
    <aside className="action-rail" aria-label={t("Action")}>
      <PhaseControls
        game={game}
        player={player}
        ownPlayerId={ownPlayerId}
        ownPendingContribution={ownPendingContribution}
        ownPrivateDecision={ownPrivateDecision}
        selectedLocation={selectedLocation}
        selectedWorkerId={selectedWorkerId}
        busy={busy}
        send={send}
      />
    </aside>
  );
}

function PhaseControls(props: Omit<ActionPanelProps, "ownPlayerId"> & {
  ownPlayerId: PlayerId;
  player: PublicPlayerState;
}) {
  const { locale, t } = useI18n();
  const { game, player, ownPlayerId, ownPendingContribution, ownPrivateDecision, busy, send } = props;
  const phase = game.phase;
  const decisionActor = currentDecisionActor(phase);
  const waiting = decisionActor !== null && decisionActor !== ownPlayerId;
  const [reviewedFiringRound, setReviewedFiringRound] = useState<number | null>(null);

  if (phase.type === "finished") return <FinalResults game={game} />;
  if (phase.type === "firing_contributions") {
    return (
      <ContributionControls
        game={game}
        player={player}
        ownPlayerId={ownPlayerId}
        pending={ownPendingContribution}
        privateDecision={ownPrivateDecision}
        busy={busy}
        send={send}
      />
    );
  }
  if (phase.type === "presentation") {
    return <PresentationControls game={game} player={player} ownPlayerId={ownPlayerId} busy={busy} send={send} />;
  }
  if (
    phase.type === "orders"
    && game.lastFiringResult !== null
    && game.lastFiringResult.round === game.round
    && reviewedFiringRound !== game.round
  ) {
    return <CompletedFiringReview
      game={game}
      ownPlayerId={ownPlayerId}
      onContinue={() => setReviewedFiringRound(game.round)}
    />;
  }

  const firingProgress = game.firingContext === null
    ? null
    : <FiringProgress game={game} ownPlayerId={ownPlayerId} />;

  if (phase.type === "firing_reveal_fire") {
    return <>{firingProgress}<FireRevealControls game={game} ownPlayerId={ownPlayerId} busy={busy} send={send} /></>;
  }
  if (waiting) return <>{firingProgress}<Waiting game={game} actorId={decisionActor} /></>;

  switch (phase.type) {
    case "setup_kiln_selection":
      return <KilnSelection game={game} busy={busy} send={send} />;
    case "setup_starting_orders": {
      return <StartingOrdersControls orderIds={ownPrivateDecision?.startingOrderIds ?? []} busy={busy} send={send} />;
    }
    case "setup_starting_tech":
      return <StartingTechControls busy={busy} send={send} />;
    case "work":
      return <WorkControls
        game={game}
        player={player}
        selectedLocation={props.selectedLocation}
        selectedWorkerId={props.selectedWorkerId}
        busy={busy}
        send={send}
      />;
    case "work_imperial_priority":
      return <ImperialPriorityControls game={game} player={player} afterAction busy={busy} send={send} />;
    case "work_office_orders":
      return <OfficeControls game={game} player={player} privateDecision={ownPrivateDecision} busy={busy} send={send} />;
    case "work_guild":
      return <GuildControls game={game} player={player} privateDecision={ownPrivateDecision} busy={busy} send={send} />;
    case "firing_before_contribution":
      if (phase.techniqueIds[phase.queue.currentIndex] === "T13") {
        return <BinaryDecision title="Test Pieces" hint="Pay 1 Wood to privately look at the top Fire card, then return it to the top of the deck." action="RESOLVE_TEST_PIECES" busy={busy} send={send} />;
      }
      return <Waiting game={game} actorId={decisionActor ?? ownPlayerId} />;
    case "firing_reposition":
      return <>{firingProgress}<KilnRepositionControls game={game} player={player} busy={busy} send={send} /></>;
    case "firing_before_quality":
    case "firing_second_before_quality":
      return <>{firingProgress}<KilnAbilityControls game={game} player={player} busy={busy} send={send} /></>;
    case "firing_after_quality":
      return <>{firingProgress}{phase.techniqueIds.includes("T11") && <SaggarsControls game={game} player={player} busy={busy} send={send} />}{phase.techniqueIds.includes("T14") && <SecondFiringControls game={game} player={player} busy={busy} send={send} />}</>;
    case "firing_workshop_seconds":
      return <>{firingProgress}<WorkshopSecondsControls game={game} player={player} busy={busy} send={send} /></>;
    case "orders":
      return <OrderControls game={game} player={player} busy={busy} send={send} />;
    case "cleanup_orders":
      return <CleanupOrderControls player={player} busy={busy} send={send} />;
  }
}

function StartingOrdersControls({ orderIds, busy, send }: { orderIds: string[]; busy: boolean; send: SendCommand }) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <ControlSection title="Choose opening Orders" hint="Privately keep exactly two of your four Starting Orders. All kept Starting Orders are revealed together.">
      <div className="choice-stack playtest-command-grid">{orderIds.map((orderId) => (
        <label className="check-row starting-order-piece" key={orderId}>
          <input type="checkbox" checked={selected.includes(orderId)} disabled={!selected.includes(orderId) && selected.length >= 2} onChange={(event) => setSelected((current) => event.target.checked ? [...current, orderId] : current.filter((id) => id !== orderId))} />
          <OrderCard orderId={orderId} />
        </label>
      ))}</div>
      <CommandButton busy={busy} disabled={selected.length !== 2} send={send} command={{ type: "SUBMIT_STARTING_ORDERS", orderIds: selected }}>Keep selected Orders</CommandButton>
    </ControlSection>
  );
}

function StartingTechControls({ busy, send }: { busy: boolean; send: SendCommand }) {
  const { locale } = useI18n();
  return (
    <ControlSection
      title="Choose a Starting Tech"
      hint={locale === "zh-CN" ? "选择1个起始技艺。起始技艺不计入最多2个进阶技艺的上限。" : "Choose one Starting Tech. It does not count toward the two-Advanced-Tech limit."}
    >
      <div className="choice-stack technique-commands">
        {STARTING_TECHNIQUES.map((technique) => (
          <CommandButton
            key={technique.id}
            busy={busy}
            send={send}
            command={{ type: "SELECT_STARTING_TECH", techniqueId: technique.id as StartingTechniqueId }}
          >
            <span className="plain-technique-summary">
              <strong>{locale === "zh-CN" ? technique.nameZh : technique.name}</strong>
              <span>{locale === "zh-CN" ? technique.abilityZh : technique.ability}</span>
            </span>
          </CommandButton>
        ))}
      </div>
    </ControlSection>
  );
}

function CommissionAdvanceControls({ busy, send }: { busy: boolean; send: SendCommand }) {
  const { locale, t } = useI18n();
  return (
    <ControlSection
      title="Reservation advance"
      hint={locale === "zh-CN" ? "每承接1张委托后，选择获得1泥、1柴或1铜钱。" : "After each reserved Order, gain 1 Clay, 1 Wood, or 1 Coin."}
    >
      <div className="button-row">
        {(["clay", "wood", "coins"] as const).map((resource) => (
          <CommandButton key={resource} busy={busy} send={send} command={{ type: "COMMISSION_GAIN_ADVANCE", resource }}>
            {locale === "zh-CN" ? `获得1${t(resource === "coins" ? "Coins" : resource === "clay" ? "Clay" : "Wood")}` : `Gain 1 ${t(resource === "coins" ? "Coins" : resource === "clay" ? "Clay" : "Wood")}`}
          </CommandButton>
        ))}
      </div>
    </ControlSection>
  );
}

function KilnSelection({ game, busy, send }: Pick<ActionPanelProps, "game" | "busy" | "send">) {
  const { locale, t } = useI18n();
  const taken = new Set(Object.values(game.players).map((player) => player.kilnId));
  return (
    <ControlSection title="Choose a kiln tradition" hint="Selection runs in reverse seating order.">
      <div className="kiln-choice-grid">
        {KILN_IDS.map((kilnId) => {
          const kiln = KILN_DEFINITIONS[kilnId];
          return (
            <button
              className="kiln-choice"
              type="button"
              disabled={busy || taken.has(kilnId)}
              onClick={() => void send({ type: "SELECT_KILN", kilnId })}
              key={kilnId}
            >
              <span><strong>{locale === "zh-CN" ? kiln.nameZh : kiln.name}</strong><b>{locale === "zh-CN" ? kiln.name : kiln.nameZh}</b></span>
              <small>{locale === "zh-CN" ? kiln.abilityNameZh : kiln.abilityName}</small>
              <p>{locale === "zh-CN" ? kiln.abilityZh : kiln.ability}</p>
              {taken.has(kilnId) && <em>{t("Taken")}</em>}
            </button>
          );
        })}
      </div>
    </ControlSection>
  );
}

function WorkControls({ game, player, selectedLocation, selectedWorkerId, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  selectedLocation?: LocationId | null | undefined;
  selectedWorkerId?: WorkerId | null | undefined;
  busy: boolean;
  send: SendCommand;
}) {
  const { locale, t, term } = useI18n();
  const availableWorkers = Object.values(player.workers).filter((worker) => worker.status === "available");
  const workers = selectedWorkerId === null || selectedWorkerId === undefined
    ? availableWorkers
    : [...availableWorkers].sort((left, right) => Number(right.id === selectedWorkerId) - Number(left.id === selectedWorkerId));
  const locationUse = (locationId: LocationId): number => game.actionBoard.placements[locationId].length;
  const locationLimit = (locationId: LocationId): number => locationCapacity(locationId, game.playerCount);
  const full = (locationId: LocationId): boolean => locationUse(locationId) >= locationLimit(locationId);
  const shifuAvailable = workers.some((worker) => worker.kind === "shifu");
  const priorityRequiresAction = game.phase.type === "work" && game.phase.imperialPriorityUsedBeforeAction === true;
  if (workers.length === 0) {
    return (
      <>
        <ControlSection title="No workers remain" hint="Pass to finish your Work Phase participation.">
          <CommandButton busy={busy} send={send} command={{ type: "PASS_WORK_PHASE" }}>Pass for this round</CommandButton>
        </ControlSection>
      </>
    );
  }
  const action = (locationId: LocationId, hint: string, content: ReactNode) => {
    const used = locationUse(locationId);
    const capacity = locationLimit(locationId);
    const capacityLabel = Number.isFinite(capacity) ? String(capacity) : "∞";
    return (
    <section
      className={`action-card ${full(locationId) && !shifuAvailable ? "is-unavailable" : ""}`}
      aria-label={term(locationId)}
      key={`${locationId}:${selectedWorkerId ?? "auto"}`}
    >
      <header className="action-card-heading"><h3>{term(locationId)}</h3><small>{used}/{capacityLabel} {t("workers")} · <span>{full(locationId) ? (shifuAvailable ? t("Shifu may overfill") : t("Full")) : t(hint)}</span></small></header>
      {full(locationId) && !shifuAvailable
        ? <ActionUnavailable message={locale === "zh-CN"
          ? `${term(locationId)}的工位已满，且你没有可用的师傅。`
          : `${term(locationId)} is full and you have no available Shifu.`} />
        : content}
    </section>
    );
  };
  const actions: Partial<Record<LocationId, ReactNode>> = {
    labour: action("labour", "Send workers to Labour", <LabourForm game={game} player={player} workers={workers} busy={busy} send={send} />),
    materials_yard: action("materials_yard", "Gain Clay and Wood", <MaterialsForm game={game} player={player} workers={workers} locationFull={full("materials_yard")} busy={busy} send={send} />),
    forming_studio: action("forming_studio", "Shape vessels", <FormCeramicsForm game={game} player={player} workers={workers} locationFull={full("forming_studio")} busy={busy} send={send} />),
    glaze_workshop: action("glaze_workshop", "Glaze and decorate", <GlazeForm game={game} player={player} workers={workers} locationFull={full("glaze_workshop")} busy={busy} send={send} />),
    kiln_yard: action("kiln_yard", "Load ceramics", <KilnYardForm game={game} player={player} workers={workers} locationFull={full("kiln_yard")} busy={busy} send={send} />),
    market_imperial_office: action("market_imperial_office", "Take Orders", <OfficeActionForms game={game} player={player} workers={workers} locationFull={full("market_imperial_office")} busy={busy} send={send} />),
    guild_academy: action("guild_academy", "Apprentice or Shifu", <GuildBeginForm game={game} player={player} workers={workers} locationFull={full("guild_academy")} busy={busy} send={send} />),
  };
  return (
    <>
      {priorityRequiresAction && <p className="turn-callout">{locale === "zh-CN"
        ? "你已在行动前使用御烧优先；现在必须放置1名工人并结算行动。"
        : "You used Imperial Priority before this action; now place one worker and resolve its action."}</p>}
      {player.imperialPriorityAvailable && <ImperialPriorityControls game={game} player={player} busy={busy} send={send} />}
      {(selectedLocation === null || selectedLocation === undefined ? LOCATION_IDS : [selectedLocation])
        .map((locationId) => actions[locationId])}
      {!priorityRequiresAction && <CommandButton busy={busy} send={send} command={{ type: "PASS_WORK_PHASE" }} danger>
        Pass for this round
      </CommandButton>}
    </>
  );
}

function ImperialPriorityControls({ game, player, afterAction = false, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  afterAction?: boolean;
  busy: boolean;
  send: SendCommand;
}) {
  const { locale } = useI18n();
  const ceramics = ownCeramics(game, player.id, "glazed");
  const [ceramicId, setCeramicId] = useState(ceramics[0]?.id ?? "");
  return (
    <ControlSection
      title="Imperial Priority"
      hint={locale === "zh-CN"
        ? `御烧优先：每局一次，在工人行动${afterAction ? "之后" : "之前"}，将1件未装窑的已施釉陶瓷装入空置御窑。`
        : `Once per game, ${afterAction ? "after" : "before"} your worker action, load one unloaded Glazed ceramic into your empty Imperial Kiln.`}
    >
      {ceramics.length > 0 && <CeramicChoice name="imperial-priority" label="Glazed ceramic" ceramics={ceramics} value={ceramicId} onChange={setCeramicId} />}
      <CommandButton busy={busy} disabled={ceramicId === ""} send={send} command={{ type: "RESOLVE_IMPERIAL_PRIORITY", ceramicId }}>{locale === "zh-CN" ? "使用御烧优先" : "Use Imperial Priority"}</CommandButton>
      {afterAction && <CommandButton busy={busy} send={send} command={{ type: "RESOLVE_IMPERIAL_PRIORITY", ceramicId: null }} secondary>{locale === "zh-CN" ? "保留标记" : "Keep the token"}</CommandButton>}
    </ControlSection>
  );
}

type AvailableWorker = PublicPlayerState["workers"][string];

interface WorkerFormProps {
  workers: AvailableWorker[];
  locationFull: boolean;
  busy: boolean;
  send: SendCommand;
}

function ActionUnavailable({ message }: { message: string }) {
  const { locale } = useI18n();
  return <p className="kiln-action-unavailable" role="status">{localizeActionError(locale, message)}</p>;
}

/** Labour has no worker limit, so it never shows a "location full" state. */
function LabourForm({ game, player, workers, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  workers: AvailableWorker[];
  busy: boolean;
  send: SendCommand;
}) {
  const { locale, t } = useI18n();
  const supplyEmpty = game.commonSupply.coins < 1;
  const [workerId, setWorkerId] = useState(firstLegalWorkerId(workers, false, () => !supplyEmpty));
  const selected = workers.find((worker) => worker.id === workerId) ?? workers[0];
  if (selected === undefined) return <p className="control-hint">{t("No available workers.")}</p>;
  if (supplyEmpty) return <ActionUnavailable message="No Coins remain in the supply." />;
  const coins = Math.min(game.commonSupply.coins, selected.kind === "shifu" ? 4 : 2);
  return (
    <form
      className="control-form"
      onSubmit={(event) => { event.preventDefault(); void send({ type: "USE_LABOUR", workerId: selected.id }); }}
    >
      <WorkerChoice player={player} workers={workers} value={selected.id} onChange={setWorkerId} disabledReason={() => supplyEmpty ? (locale === "zh-CN" ? "供应区没有铜钱" : "No Coins remain in the supply") : null} />
      <p className="control-hint">{locale === "zh-CN"
        ? `获得${coins}铜钱。`
        : `Gain ${coins} Coin${coins === 1 ? "" : "s"}.`}</p>
      <button className="primary-button" type="submit" disabled={busy || supplyEmpty}>{t("Send to Labour")}</button>
    </form>
  );
}

function MaterialsForm({ game, player, workers, locationFull, busy, send }: WorkerFormProps & { game: PublicGameState; player: PublicPlayerState }) {
  const { locale, t, term } = useI18n();
  const materialSupplyEmpty = game.commonSupply.clay + game.commonSupply.wood < 1;
  const initialWorkerId = firstLegalWorkerId(workers, locationFull, () => !materialSupplyEmpty);
  const initialWorker = workers.find((worker) => worker.id === initialWorkerId);
  const [workerId, setWorkerId] = useState(initialWorkerId);
  const [clay, setClay] = useState(initialWorker?.kind === "shifu" ? 3 : 2);
  const [wood, setWood] = useState(1);
  const [buyShifuBonus, setBuyShifuBonus] = useState(false);
  const [preparedClayShape, setPreparedClayShape] = useState<Shape | "">("");
  const selectedWorker = workers.find((worker) => worker.id === workerId) ?? workers[0];
  const requiredTotal = selectedWorker?.kind === "shifu" ? 4 : 3;
  const invalidAmount = !Number.isInteger(clay) || !Number.isInteger(wood) || clay < 0 || wood < 0;
  const wrongTotal = !invalidAmount && clay + wood !== requiredTotal;
  const activeBonus = selectedWorker?.kind === "shifu" && buyShifuBonus;
  const preparedCost = preparedClayShape === "" ? 0 : SHAPE_COSTS[preparedClayShape] + 1;
  const projectedClay = player.resources.clay + Math.min(clay, game.commonSupply.clay) + (activeBonus ? Math.min(1, Math.max(0, game.commonSupply.clay - clay)) : 0);
  const allocationOptions: ChoiceTileOption[] = Array.from({ length: requiredTotal + 1 }, (_, clayAmount) => {
    const woodAmount = requiredTotal - clayAmount;
    const actualClay = Math.min(clayAmount, game.commonSupply.clay);
    const actualWood = Math.min(woodAmount, game.commonSupply.wood);
    const gainsNothing = actualClay + actualWood === 0;
    return {
      value: `${clayAmount}:${woodAmount}`,
      label: locale === "zh-CN" ? `${clayAmount}泥 + ${woodAmount}柴` : `${clayAmount} Clay + ${woodAmount} Wood`,
      detail: actualClay === clayAmount && actualWood === woodAmount
        ? undefined
        : locale === "zh-CN" ? `供应区实际获得${actualClay}泥 + ${actualWood}柴` : `Supply gives ${actualClay} Clay + ${actualWood} Wood`,
      disabled: gainsNothing,
      disabledReason: gainsNothing ? (locale === "zh-CN" ? "供应区没有这些资源" : "None available in the supply") : undefined,
    };
  });
  const error = locationFull && selectedWorker?.kind !== "shifu"
    ? "Materials Yard is full."
    : invalidAmount
      ? "Choose whole, non-negative resource amounts."
      : wrongTotal
      ? `${selectedWorker?.kind === "shifu" ? "Shifu" : "Apprentice"} must take exactly ${requiredTotal} total Clay and Wood.`
      : activeBonus && player.resources.coins < 1
        ? "The Shifu bonus costs 1 Coin."
      : preparedClayShape !== "" && projectedClay < preparedCost
        ? `Prepared Clay requires ${preparedCost} Clay after the Materials gain.`
      : null;

  function chooseWorker(nextWorkerId: string): void {
    const nextWorker = workers.find((worker) => worker.id === nextWorkerId);
    setWorkerId(nextWorkerId);
    setClay(nextWorker?.kind === "shifu" ? 3 : 2);
    setWood(1);
    if (nextWorker?.kind !== "shifu") setBuyShifuBonus(false);
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (error !== null || selectedWorker === undefined) return;
    void send({
      type: "GAIN_MATERIALS",
      workerId: selectedWorker.id,
      clay,
      wood,
      ...(activeBonus ? { buyShifuBonus: true } : {}),
      ...(preparedClayShape === "" ? {} : { preparedClayShape }),
    });
  }
  if (materialSupplyEmpty) return <ActionUnavailable message="No Clay or Wood remains in the supply." />;
  return (
    <form className="control-form" onSubmit={submit}>
      <WorkerChoice player={player} workers={workers} value={selectedWorker?.id ?? ""} onChange={chooseWorker} locationFull={locationFull} disabledReason={() => materialSupplyEmpty ? (locale === "zh-CN" ? "供应区没有泥或柴" : "No Clay or Wood remains in the supply") : null} />
      <ChoiceTiles name="materials-allocation" label={locale === "zh-CN" ? "选择资源组合" : "Choose resources"} options={allocationOptions} value={`${clay}:${wood}`} onChange={(value) => { const [nextClay, nextWood] = value.split(":").map(Number); setClay(nextClay ?? 0); setWood(nextWood ?? 0); }} />
      {selectedWorker?.kind === "shifu" && <button className={`kiln-action-toggle ${buyShifuBonus ? "is-selected" : ""}`} type="button" aria-pressed={buyShifuBonus} disabled={player.resources.coins < 1} onClick={() => setBuyShifuBonus((current) => !current)}><span>{locale === "zh-CN" ? "师傅额外收益" : "Shifu bonus"}</span><small>{locale === "zh-CN" ? "支付1铜钱，额外获得1泥和1柴" : "Pay 1 Coin for +1 Clay and +1 Wood"}</small>{player.resources.coins < 1 && <em>{locale === "zh-CN" ? "铜钱不足" : "Not enough Coins"}</em>}</button>}
      {player.startingTechniqueId === "ST01" && <ChoiceTiles name="prepared-clay" label={locale === "zh-CN" ? "练泥：额外成型" : "Prepared Clay: form after gathering"} value={preparedClayShape} onChange={(value) => setPreparedClayShape(value as Shape | "")} options={[
        { value: "", label: t("Do not use") },
        ...SHAPES.map((shape) => {
          const cost = SHAPE_COSTS[shape] + 1;
          const disabled = projectedClay < cost;
          return { value: shape, label: term(shape), detail: `${cost} ${t("Clay")}`, disabled, disabledReason: disabled ? (locale === "zh-CN" ? `需要${cost}泥` : `Requires ${cost} Clay`) : undefined };
        }),
      ]} />}
      <small role="status" className={error === null ? "" : "control-error"}>
        {error === null
          ? locale === "zh-CN" ? `${clay}泥 + ${wood}柴 = ${requiredTotal}份资源。` : `${clay} Clay + ${wood} Wood = ${requiredTotal} resources.`
          : localizeActionError(locale, error)}
      </small>
      <button className="primary-button" disabled={busy || error !== null || selectedWorker === undefined}>{t("Gather materials")}</button>
    </form>
  );
}

function FormCeramicsForm({ game, player, workers, locationFull, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  workers: AvailableWorker[];
  locationFull: boolean;
  busy: boolean;
  send: SendCommand;
}) {
  const { locale, t, term } = useI18n();
  const techniques = ownedAvailableTechniques(player, ["T01", "T04"]);
  const hasAffordableShape = SHAPES.some((shape) => SHAPE_COSTS[shape] <= player.resources.clay);
  const initialWorkerId = firstLegalWorkerId(workers, locationFull, () => hasAffordableShape);
  const [workerId, setWorkerId] = useState(initialWorkerId);
  const [shape1, setShape1] = useState<Shape>(SHAPES.find((shape) => SHAPE_COSTS[shape] <= player.resources.clay) ?? SHAPES[0]!);
  const [shape2, setShape2] = useState<Shape | "">("");
  const [selectedTechniques, setSelectedTechniques] = useState<TechniqueId[]>([]);
  const [dryingGlaze, setDryingGlaze] = useState<Glaze>(GLAZES[0]!);
  const [dryingDecoration, setDryingDecoration] = useState<Decoration>(DECORATIONS[0]!);
  const [whiteSlipIndex, setWhiteSlipIndex] = useState<"" | "0" | "1">("");
  const [ding, setDing] = useState<Shape | "">("");
  const selectedWorker = workers.find((worker) => worker.id === workerId) ?? workers[0];
  const activeTechniqueIds = selectedTechniques.filter((techniqueId) => techniques.includes(techniqueId));
  const canUseDing = player.kilnId === "DI" && !player.kilnAbilityUsedThisRound;
  const activeDing = canUseDing ? ding : "";
  const shapes = [shape1, shape2].filter((shape): shape is Shape => shape !== "");
  const allShapes = activeDing === "" ? shapes : [...shapes, activeDing];
  const formingClayCost = (shape: Shape): number => SHAPE_COSTS[shape];
  const baseClayCost = shapes.reduce((total, shape) => total + SHAPE_COSTS[shape], 0);
  const shifuDiscount = selectedWorker?.kind === "shifu" && shapes.length === 2 ? 1 : 0;
  const wheelDiscount = activeTechniqueIds.includes("T01") ? 1 : 0;
  const dingClayCost = activeDing === "" ? 0 : SHAPE_COSTS[activeDing];
  const clayCost = baseClayCost - shifuDiscount - wheelDiscount + dingClayCost;
  const whiteSlip = whiteSlipIndex === "" ? undefined : { formedIndex: Number(whiteSlipIndex) };
  const formingCoins = (activeTechniqueIds.includes("T04") ? DECORATION_COSTS[dryingDecoration] : 0) + (whiteSlip === undefined ? 0 : DECORATION_COSTS.plain);

  function clayCostFor(candidateShapes: Shape[], candidateDing: Shape | "" = activeDing): number {
    const base = candidateShapes.reduce((total, shape) => total + SHAPE_COSTS[shape], 0);
    const discount = (selectedWorker?.kind === "shifu" && candidateShapes.length === 2 ? 1 : 0)
      + (activeTechniqueIds.includes("T01") ? 1 : 0);
    const legalDing = candidateDing !== "" && candidateShapes.includes(candidateDing) ? SHAPE_COSTS[candidateDing] : 0;
    return base - discount + legalDing;
  }

  function chooseWorker(nextWorkerId: string): void {
    setWorkerId(nextWorkerId);
    if (workers.find((worker) => worker.id === nextWorkerId)?.kind !== "shifu") setShape2("");
  }

  function chooseFirstShape(value: string): void {
    const next = value as Shape;
    setShape1(next);
    if (ding !== "" && ![next, shape2].includes(ding)) setDing("");
  }

  function chooseSecondShape(value: string): void {
    const next = value as Shape | "";
    setShape2(next);
    if (ding !== "" && ![shape1, next].includes(ding)) setDing("");
    if (next === "" && whiteSlipIndex === "1") setWhiteSlipIndex("");
  }

  function validationError(): string | null {
    if (selectedWorker === undefined) return "Choose an available worker.";
    if (locationFull && selectedWorker.kind !== "shifu") return "Potter's Wheel is full for Apprentices.";
    if (shapes.length > (selectedWorker.kind === "shifu" ? 2 : 1)) {
      return "An Apprentice may form only one vessel.";
    }
    if (activeDing !== "" && !shapes.includes(activeDing)) return "Ding's extra vessel must match a selected base Shape.";
    if (activeTechniqueIds.includes("T01") && !allShapes.some((shape) => shape === "vase" || shape === "censer")) {
      return "Large Throwing Wheel requires a Vase or Censer.";
    }
    if (whiteSlip !== undefined && whiteSlip.formedIndex >= allShapes.length) return "White Slip must select a vessel formed by this action.";
    if (whiteSlip !== undefined && activeTechniqueIds.includes("T04") && whiteSlip.formedIndex === 0) return "White Slip and Drying Frames must select different vessels.";
    if (player.resources.clay < clayCost) {
      return `Requires ${clayCost} Clay.`;
    }
    if (player.resources.coins < formingCoins) return `Requires ${formingCoins} Coins for the immediate Decoration effects.`;
    return null;
  }

  const error = validationError();
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (error !== null || selectedWorker === undefined) return;
    const command: Extract<GameAction, { type: "FORM_CERAMICS" }> = {
      type: "FORM_CERAMICS",
      workerId: selectedWorker.id,
      shapes,
      useTechniqueIds: activeTechniqueIds,
    };
    if (activeTechniqueIds.includes("T04")) command.dryingFrames = { formedIndex: 0, glaze: dryingGlaze, decoration: dryingDecoration };
    if (whiteSlip !== undefined) command.whiteSlip = whiteSlip;
    if (activeDing !== "") command.dingExtraShape = activeDing;
    void send(command);
  }
  if (!hasAffordableShape) return <ActionUnavailable message="You do not have enough Clay to form a vessel." />;
  return (
    <form className="control-form" onSubmit={submit}>
      <WorkerChoice player={player} workers={workers} value={selectedWorker?.id ?? ""} onChange={chooseWorker} locationFull={locationFull} disabledReason={() => hasAffordableShape ? null : (locale === "zh-CN" ? "没有足够的泥形成任何器物" : "Not enough Clay to form any vessel")} />
      <ChoiceTiles name="shape1" label="First shape" value={shape1} onChange={chooseFirstShape} options={SHAPES.map((shape) => {
        const candidateShapes = [shape, ...(selectedWorker?.kind === "shifu" && shape2 !== "" ? [shape2] : [])];
        const candidateCost = clayCostFor(candidateShapes);
        const disabled = candidateCost > player.resources.clay;
        return { value: shape, label: term(shape), detail: `${formingClayCost(shape)} ${t("Clay")}`, disabled, disabledReason: disabled ? (locale === "zh-CN" ? `当前组合需要${candidateCost}泥` : `Current combination requires ${candidateCost} Clay`) : undefined };
      })} />
      {selectedWorker?.kind === "shifu" && <ChoiceTiles name="shape2" label="Second shape (Shifu only)" value={shape2} onChange={chooseSecondShape} options={[
        { value: "", label: t("None") },
        ...SHAPES.map((shape) => {
          const candidateCost = clayCostFor([shape1, shape]);
          const disabled = candidateCost > player.resources.clay;
          return { value: shape, label: term(shape), detail: `${formingClayCost(shape)} ${t("Clay")}`, disabled, disabledReason: disabled ? (locale === "zh-CN" ? `两件共需${candidateCost}泥` : `Two vessels require ${candidateCost} Clay`) : undefined };
        }),
      ]} />}
      <TechniqueChecks techniqueIds={techniques} selected={activeTechniqueIds} onChange={setSelectedTechniques} />
      {activeTechniqueIds.includes("T04") && <><EnumChoice name="drying-glaze" label="Drying Frames glaze for first formed vessel" options={GLAZES} value={dryingGlaze} onChange={(value) => setDryingGlaze(value as Glaze)} /><EnumChoice name="drying-decoration" label="Drying Frames Decoration" options={DECORATIONS} value={dryingDecoration} onChange={(value) => setDryingDecoration(value as Decoration)} formatOption={(option) => decorationOptionLabel(option, locale)} /></>}
      {player.startingTechniqueId === "ST02" && <ChoiceTiles name="white-slip" label={locale === "zh-CN" ? "白陶衣：选择本次成型器物（白釉 + 素面）" : "White Slip: choose a vessel formed now (White + Plain)"} value={whiteSlipIndex} onChange={(value) => setWhiteSlipIndex(value as "" | "0" | "1")} options={[
        { value: "", label: t("Do not use") },
        ...shapes.map((shape, index) => {
          const disabled = player.resources.coins < DECORATION_COSTS.plain || (activeTechniqueIds.includes("T04") && index === 0);
          return { value: String(index), label: `${index + 1} · ${term(shape)}`, detail: locale === "zh-CN" ? "1铜钱" : "1 Coin", disabled, disabledReason: disabled ? (player.resources.coins < 1 ? (locale === "zh-CN" ? "铜钱不足" : "Not enough Coins") : (locale === "zh-CN" ? "晾坯架已使用第1件器物" : "Drying Frames already uses the first vessel")) : undefined };
        }),
      ]} />}
      {canUseDing && <ChoiceTiles name="ding" label="Ding extra matching shape" value={activeDing} onChange={(value) => setDing(value as Shape | "")} options={[
        { value: "", label: t("Do not use") },
        ...(["bowl", "plate", "washer"] as Shape[]).map((shape) => {
          const matches = shapes.includes(shape);
          const candidateCost = clayCostFor(shapes, shape);
          const disabled = !matches || candidateCost > player.resources.clay;
          return { value: shape, label: term(shape), detail: locale === "zh-CN" ? "额外支付1泥" : "pay 1 Clay", disabled, disabledReason: !matches ? (locale === "zh-CN" ? "先形成该器形" : "Form this Shape first") : disabled ? (locale === "zh-CN" ? `共需${candidateCost}泥` : `Requires ${candidateCost} Clay total`) : undefined };
        }),
      ]} />}
      <small role="status" className={error === null ? "" : "control-error"}>{error === null ? (locale === "zh-CN" ? `费用：${clayCost}泥、${formingCoins}铜钱。` : `Cost: ${clayCost} Clay and ${formingCoins} Coins.`) : localizeActionError(locale, error)}</small>
      <button className="primary-button" disabled={busy || error !== null}>{t("Form ceramics")}</button>
    </form>
  );
}

function GlazeForm({ game, player, workers, locationFull, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  workers: AvailableWorker[];
  locationFull: boolean;
  busy: boolean;
  send: SendCommand;
}) {
  const { locale, t, term } = useI18n();
  const ceramics = ownCeramics(game, player.id, "shaped");
  const paletteTargets = ownCeramics(game, player.id, "glazed");
  const techniques = ownedAvailableTechniques(player, ["T05", "T06", "T07", "T08", "T09"]);
  const apprenticeHasFreeDecoration = techniques.some((techniqueId) => techniqueId === "T07" || techniqueId === "T08" || techniqueId === "T09");
  const canWorkerGlaze = (worker: AvailableWorker): boolean => ceramics.length > 0
    && (worker.kind === "shifu" || player.resources.coins >= Math.min(...DECORATIONS.map((decoration) => DECORATION_COSTS[decoration])) || apprenticeHasFreeDecoration);
  const [workerId, setWorkerId] = useState(firstLegalWorkerId(workers, locationFull, canWorkerGlaze));
  const [ceramic1, setCeramic1] = useState(ceramics[0]?.id ?? "");
  const [glaze1, setGlaze1] = useState<Glaze>(GLAZES[0]!);
  const [decoration1, setDecoration1] = useState<Decoration>(DECORATIONS[0]!);
  const [ceramic2, setCeramic2] = useState("");
  const [glaze2, setGlaze2] = useState<Glaze>(GLAZES[0]!);
  const [decoration2, setDecoration2] = useState<Decoration>(DECORATIONS[0]!);
  const [freeDecorationIndex, setFreeDecorationIndex] = useState<"0" | "1">("0");
  const [selectedTechniques, setSelectedTechniques] = useState<TechniqueId[]>([]);
  const [reworkedShape, setReworkedShape] = useState<Shape | "">("");
  const [paletteTargetId, setPaletteTargetId] = useState("");
  const [paletteGlaze, setPaletteGlaze] = useState<Glaze>(GLAZES[0]!);
  const [rapidDryingId, setRapidDryingId] = useState("");
  const selectedWorker = workers.find((worker) => worker.id === workerId) ?? workers[0];
  const firstId = ceramics.some((ceramic) => ceramic.id === ceramic1) ? ceramic1 : ceramics[0]?.id ?? "";
  const secondId = ceramics.some((ceramic) => ceramic.id === ceramic2) ? ceramic2 : "";
  const firstCeramic = ceramics.find((ceramic) => ceramic.id === firstId);
  const activeTechniqueIds = selectedTechniques.filter((techniqueId) => techniques.includes(techniqueId));
  const selections = [
    ...(firstId === "" ? [] : [{ ceramicId: firstId, glaze: glaze1, decoration: decoration1, ...(activeTechniqueIds.includes("T05") && reworkedShape !== "" ? { newShape: reworkedShape } : {}) }]),
    ...(secondId === "" ? [] : [{ ceramicId: secondId, glaze: glaze2, decoration: decoration2 }]),
  ];
  const freeDecorationCeramicId = selectedWorker?.kind === "shifu" ? selections[Number(freeDecorationIndex)]?.ceramicId : undefined;
  const occupiedShared = new Set(Object.values(game.ceramics).filter((ceramic) => ceramic.stage === "loaded" && ceramic.kilnSpaceId !== "imperial").map((ceramic) => ceramic.stage === "loaded" ? ceramic.kilnSpaceId : ""));
  const rapidDestinations: Array<KilnSpaceId | "imperial"> = activeKilnSpaceIds(game.playerCount).filter((space) => !occupiedShared.has(space));
  const imperialOccupied = Object.values(game.ceramics).some((ceramic) => ceramic.stage === "loaded" && ceramic.ownerId === player.id && ceramic.kilnSpaceId === "imperial");
  if (player.imperialKilnUnlocked && !imperialOccupied) rapidDestinations.push("imperial");
  const [rapidDestination, setRapidDestination] = useState<KilnSpaceId | "imperial" | "">(rapidDestinations[0] ?? "");
  function decorationCost(candidateSelections: typeof selections, shifuFreeId = freeDecorationCeramicId): number {
    const availableWaivers = new Set<Decoration>();
    if (activeTechniqueIds.includes("T07")) availableWaivers.add("carved");
    if (activeTechniqueIds.includes("T08")) availableWaivers.add("impressed");
    if (activeTechniqueIds.includes("T09")) availableWaivers.add("crackle");
    return candidateSelections.reduce((total, selection) => {
      if (selection.ceramicId === shifuFreeId) return total;
      if (availableWaivers.delete(selection.decoration)) return total;
      return total + DECORATION_COSTS[selection.decoration];
    }, 0);
  }
  const totalCoins = decorationCost(selections);

  function chooseWorker(nextWorkerId: string): void {
    setWorkerId(nextWorkerId);
    if (workers.find((worker) => worker.id === nextWorkerId)?.kind !== "shifu") {
      setCeramic2("");
      setFreeDecorationIndex("0");
    }
  }

  function decorationOptions(index: 0 | 1): ChoiceTileOption[] {
    return DECORATIONS.map((decoration) => {
      const base = index === 0
        ? selections.map((selection, selectionIndex) => selectionIndex === 0 ? { ...selection, decoration } : selection)
        : selections.map((selection, selectionIndex) => selectionIndex === 1 ? { ...selection, decoration } : selection);
      const cost = decorationCost(base);
      const disabled = cost > player.resources.coins;
      return {
        value: decoration,
        label: term(decoration),
        detail: `${DECORATION_COSTS[decoration]} ${locale === "zh-CN" ? "铜钱" : `Coin${DECORATION_COSTS[decoration] === 1 ? "" : "s"}`}`,
        disabled,
        disabledReason: disabled ? (locale === "zh-CN" ? `当前组合需要${cost}铜钱` : `Current combination requires ${cost} Coins`) : undefined,
      };
    });
  }

  function validationError(): string | null {
    if (selectedWorker === undefined) return "Choose an available worker.";
    if (locationFull && selectedWorker.kind !== "shifu") return "Glaze & Decoration is full for Apprentices.";
    if (selections.length === 0) return "You have no Shaped vessel to glaze.";
    if (selections.length > (selectedWorker.kind === "shifu" ? 2 : 1)) return "An Apprentice may glaze only one ceramic.";
    if (secondId !== "" && secondId === firstId) return "Choose each ceramic only once.";
    if (activeTechniqueIds.includes("T05")) {
      if (firstCeramic?.stage !== "shaped" || reworkedShape === "" || reworkedShape === firstCeramic.shape) return "Reworking Table must change the first vessel to a different Shape.";
    }
    if (activeTechniqueIds.includes("T06") && !paletteTargets.some((ceramic) => ceramic.id === paletteTargetId)) return "Glaze Palette must choose one other Glazed ceramic.";
    for (const [techniqueId, decoration] of [["T07", "carved"], ["T08", "impressed"], ["T09", "crackle"]] as const) {
      if (activeTechniqueIds.includes(techniqueId) && !selections.some((selection) => selection.decoration === decoration)) return `${TECHNIQUE_DEFINITIONS[techniqueId]?.name ?? techniqueId} needs its matching Decoration.`;
    }
    if (rapidDryingId !== "" && (!selections.some((selection) => selection.ceramicId === rapidDryingId) || rapidDestination === "")) return "Rapid Drying must choose a ceramic glazed now and an empty kiln destination.";
    if (player.resources.wood < (rapidDryingId === "" ? 0 : 1)) return "Rapid Drying requires 1 Wood.";
    if (player.resources.coins < totalCoins) return `Requires ${totalCoins} Coins.`;
    return null;
  }

  const error = validationError();
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (error !== null || selectedWorker === undefined) return;
    void send({
      type: "GLAZE_CERAMICS",
      workerId: selectedWorker.id,
      selections,
      ...(freeDecorationCeramicId === undefined ? {} : { freeDecorationCeramicId }),
      useTechniqueIds: activeTechniqueIds,
      ...(activeTechniqueIds.includes("T06") ? { glazePalette: { ceramicId: paletteTargetId, glaze: paletteGlaze } } : {}),
      ...(rapidDryingId !== "" && rapidDestination !== "" ? { rapidDrying: { ceramicId: rapidDryingId, kilnSpaceId: rapidDestination } } : {}),
    });
  }
  if (ceramics.length === 0) return <ActionUnavailable message="You have no Shaped vessel to glaze." />;
  if (!workers.some((worker) => (!locationFull || worker.kind === "shifu") && canWorkerGlaze(worker))) {
    return <ActionUnavailable message="You do not have enough Coins to apply a Decoration." />;
  }
  return (
    <form className="control-form control-form-glaze" onSubmit={submit}>
      <WorkerChoice player={player} workers={workers} value={selectedWorker?.id ?? ""} onChange={chooseWorker} locationFull={locationFull} disabledReason={(worker) => {
        if (ceramics.length === 0) return locale === "zh-CN" ? "没有已成型器物" : "No Shaped vessels available";
        if (!canWorkerGlaze(worker)) return locale === "zh-CN" ? "没有买得起的装饰；师傅可免费施加1个装饰" : "No affordable Decoration; a Shifu can apply one for free";
        return null;
      }} />
      <CeramicChoice name="ceramic1" label="First ceramic" ceramics={ceramics} value={firstId} onChange={setCeramic1} />
      <EnumChoice name="glaze1" label="First glaze" options={GLAZES} value={glaze1} onChange={(value) => setGlaze1(value as Glaze)} />
      <ChoiceTiles compact name="decoration1" label="First decoration" options={decorationOptions(0)} value={decoration1} onChange={(value) => setDecoration1(value as Decoration)} />
      {selectedWorker?.kind === "shifu" && <CeramicChoice name="ceramic2" label="Second ceramic (Shifu only)" ceramics={ceramics} value={secondId} onChange={(value) => { setCeramic2(value); if (value === "") setFreeDecorationIndex("0"); }} blank="None" disabledIds={firstId === "" ? [] : [firstId]} />}
      {selectedWorker?.kind === "shifu" && secondId !== "" && <><EnumChoice name="glaze2" label="Second glaze" options={GLAZES} value={glaze2} onChange={(value) => setGlaze2(value as Glaze)} /><ChoiceTiles compact name="decoration2" label="Second decoration" options={decorationOptions(1)} value={decoration2} onChange={(value) => setDecoration2(value as Decoration)} /></>}
      {selectedWorker?.kind === "shifu" && <ChoiceTiles compact name="shifu-free-decoration" label={locale === "zh-CN" ? "师傅：免费装饰" : "Shifu: free Decoration"} value={freeDecorationIndex} onChange={(value) => setFreeDecorationIndex(value as "0" | "1")} options={selections.map((selection, index) => ({ value: String(index), label: `${index + 1} · ${ceramicLabel(game.ceramics[selection.ceramicId]!, locale)}`, detail: locale === "zh-CN" ? "本件装饰费用为0" : "This Decoration costs 0" }))} />}
      <TechniqueChecks techniqueIds={techniques} selected={activeTechniqueIds} onChange={setSelectedTechniques} />
      {activeTechniqueIds.includes("T05") && <ChoiceTiles compact name="reworked-shape" label={locale === "zh-CN" ? "改坯案：新器型" : "Reworking Table: new Shape"} value={reworkedShape} onChange={(value) => setReworkedShape(value as Shape)} options={SHAPES.filter((shape) => shape !== firstCeramic?.shape).map((shape) => ({ value: shape, label: term(shape) }))} />}
      {activeTechniqueIds.includes("T06") && <><CeramicChoice name="palette-target" label="Glaze Palette target" ceramics={paletteTargets} value={paletteTargetId} onChange={setPaletteTargetId} blank="Choose a ceramic" /><EnumChoice name="palette-glaze" label="New Glaze" options={GLAZES} value={paletteGlaze} onChange={(value) => setPaletteGlaze(value as Glaze)} /></>}
      {player.startingTechniqueId === "ST03" && <><ChoiceTiles name="rapid-drying" label={locale === "zh-CN" ? "催干：立即装窑" : "Rapid Drying: load immediately"} value={rapidDryingId} onChange={setRapidDryingId} options={[
        { value: "", label: t("Do not use") },
        ...selections.map((selection, index) => {
          const source = game.ceramics[selection.ceramicId];
          const disabled = player.resources.wood < 1 || rapidDestinations.length === 0;
          return { value: selection.ceramicId, label: `${index + 1} · ${source === undefined ? t("Ceramic") : ceramicLabel(source, locale)}`, detail: `${term(selection.glaze)} · ${term(selection.decoration)} · 1 ${t("Wood")}`, disabled, disabledReason: disabled ? (player.resources.wood < 1 ? (locale === "zh-CN" ? "需要1柴" : "Requires 1 Wood") : (locale === "zh-CN" ? "没有空窑位" : "No empty kiln space")) : undefined };
        }),
      ]} />{rapidDryingId !== "" && <EnumChoice name="rapid-destination" label="Rapid Drying destination" options={rapidDestinations} value={rapidDestination} onChange={(value) => setRapidDestination(value as KilnSpaceId | "imperial")} />}</>}
      <div className="control-submit-bar">
        <small role="status" className={error === null ? "" : "control-error"}>{error === null ? (locale === "zh-CN" ? `费用：${totalCoins}铜钱。` : `Cost: ${totalCoins} Coins.`) : localizeActionError(locale, error)}</small>
        <button className="primary-button" disabled={busy || error !== null}>{t("Apply glaze")}</button>
      </div>
    </form>
  );
}

function KilnYardForm({ game, player, workers, locationFull, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  workers: AvailableWorker[];
  locationFull: boolean;
  busy: boolean;
  send: SendCommand;
}) {
  const { locale, t, term } = useI18n();
  const ceramics = ownCeramics(game, player.id, "glazed");
  const occupiedShared = new Set(Object.values(game.ceramics).filter((ceramic) => ceramic.stage === "loaded" && ceramic.kilnSpaceId !== "imperial").map((ceramic) => ceramic.stage === "loaded" ? ceramic.kilnSpaceId : ""));
  const destinations: Array<KilnSpaceId | "imperial"> = activeKilnSpaceIds(game.playerCount).filter((space) => !occupiedShared.has(space));
  const imperialOccupied = Object.values(game.ceramics).some((ceramic) => ceramic.stage === "loaded" && ceramic.ownerId === player.id && ceramic.kilnSpaceId === "imperial");
  if (player.imperialKilnUnlocked && !imperialOccupied) destinations.push("imperial");
  const canLoad = ceramics.length > 0 && destinations.length > 0;
  const noLoadReason = ceramics.length === 0
    ? locale === "zh-CN" ? "没有可装窑的已施釉陶瓷" : "No Glazed ceramic is available to load"
    : destinations.length === 0
      ? locale === "zh-CN" ? "没有空窑位" : "No kiln destination is empty"
      : null;
  const [workerId, setWorkerId] = useState(firstLegalWorkerId(workers, locationFull, () => canLoad));
  const [ceramicIds, setCeramicIds] = useState(["", ""]);
  const [kilnSpaces, setKilnSpaces] = useState<Array<KilnSpaceId | "imperial" | "">>([
    destinations[0] ?? "",
    destinations[1] ?? "",
  ]);
  const [furnitureIndex, setFurnitureIndex] = useState<"" | "0" | "1">("");
  const [shifuCeramicId, setShifuCeramicId] = useState("");
  const [tendingClay, setTendingClay] = useState(1);
  const selectedWorker = workers.find((worker) => worker.id === workerId) ?? workers[0];
  const maximumNormal = selectedWorker?.kind === "shifu" ? 2 : 1;
  const maximumLoads = maximumNormal;
  const loads = ceramicIds.slice(0, maximumLoads).flatMap((ceramicId, index) => {
    const kilnSpaceId = kilnSpaces[index];
    if (!ceramics.some((ceramic) => ceramic.id === ceramicId) || kilnSpaceId === undefined || kilnSpaceId === "" || !destinations.includes(kilnSpaceId)) return [];
    return [{ ceramicId, kilnSpaceId, ...(furnitureIndex === String(index) ? { useKilnFurniture: true } : {}) }];
  });
  const existingShared = ownCeramics(game, player.id, "loaded").filter(
    (ceramic) => ceramic.stage === "loaded" && ceramic.kilnSpaceId !== "imperial",
  );
  const loadedNowShared = loads.flatMap((load) => {
    if (load.kilnSpaceId === "imperial") return [];
    const ceramic = ceramics.find((candidate) => candidate.id === load.ceramicId);
    return ceramic === undefined ? [] : [ceramic];
  });
  const shifuTargets = [...new Map(
    [...existingShared, ...loadedNowShared].map((ceramic) => [ceramic.id, ceramic]),
  ).values()];
  const selectedShifuCeramicId = shifuTargets.some((ceramic) => ceramic.id === shifuCeramicId)
    ? shifuCeramicId
    : shifuTargets[0]?.id ?? "";
  const ownsFurniture = player.techniques.some((technique) => technique.id === "T15" && !technique.exhausted);

  function setCeramic(index: number, value: string): void {
    setCeramicIds((current) => current.map((entry, entryIndex) => entryIndex === index ? value : entry));
  }
  function setDestination(index: number, value: string): void {
    setKilnSpaces((current) => current.map((entry, entryIndex) => entryIndex === index ? value as KilnSpaceId | "imperial" | "" : entry));
  }
  function chooseWorker(nextWorkerId: string): void {
    setWorkerId(nextWorkerId);
    if (workers.find((worker) => worker.id === nextWorkerId)?.kind !== "shifu") {
      setCeramicIds((current) => [current[0] ?? "", ""]);
      setKilnSpaces((current) => [current[0] ?? destinations[0] ?? "", destinations[1] ?? ""]);
      setFurnitureIndex((current) => current === "1" ? "" : current);
      setShifuCeramicId("");
    }
  }
  function validationError(): string | null {
    if (selectedWorker === undefined) return "Choose an available worker.";
    if (locationFull && selectedWorker.kind !== "shifu") return "Kiln Yard is full for Apprentices.";
    if (ceramics.length === 0) return "You have no Glazed ceramic to load.";
    if (destinations.length === 0) return "No Shared or Imperial kiln destination is empty.";
    if (loads.length < 1) return "Select at least one Glazed ceramic and destination.";
    if (new Set(loads.map((load) => load.ceramicId)).size !== loads.length) return "Choose each ceramic only once.";
    if (new Set(loads.map((load) => load.kilnSpaceId)).size !== loads.length) return "Choose each kiln destination only once.";
    if (selectedWorker.kind === "shifu" && shifuTargets.length > 0 && selectedShifuCeramicId === "") {
      return "Choose the Shared-Kiln ceramic that carries this Shifu.";
    }
    if (furnitureIndex !== "") {
      const destination = loads[Number(furnitureIndex)]?.kilnSpaceId;
      if (!ownsFurniture || destination === undefined || destination === "imperial" || (!destination.startsWith("high_") && !destination.startsWith("low_"))) return "Kiln Furniture must select one High or Low Shared Kiln load.";
    }
    return null;
  }

  const error = validationError();
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (error !== null || selectedWorker === undefined) return;
    void send({
      type: "USE_KILN_YARD",
      workerId: selectedWorker.id,
      loads,
      ...(selectedWorker.kind === "shifu" && selectedShifuCeramicId !== "" ? { shifuCeramicId: selectedShifuCeramicId } : {}),
      ...(player.startingTechniqueId === "ST04" ? { kilnTendingClay: tendingClay, kilnTendingWood: 1 - tendingClay } : {}),
    });
  }
  if (ceramics.length === 0) return <ActionUnavailable message="You have no Glazed ceramic to load." />;
  if (destinations.length === 0) return <ActionUnavailable message="No Shared or Imperial kiln destination is empty." />;
  return (
    <form className="control-form" onSubmit={submit}>
      <WorkerChoice player={player} workers={workers} value={selectedWorker?.id ?? ""} onChange={chooseWorker} locationFull={locationFull} disabledReason={() => noLoadReason} />
      {Array.from({ length: maximumLoads }, (_, index) => (
        <div className="split-fields" key={index}>
          <CeramicChoice name={`ceramic${index + 1}`} label={`Ceramic ${index + 1}`} ceramics={ceramics} value={ceramicIds[index] ?? ""} onChange={(value) => setCeramic(index, value)} blank={index === 0 ? "Choose a ceramic" : "None"} disabledIds={index === 0 || ceramicIds[0] === "" ? [] : [ceramicIds[0]!]} />
          <EnumChoice name={`space${index + 1}`} label={`Kiln destination ${index + 1}`} options={destinations} value={kilnSpaces[index] ?? ""} onChange={(value) => setDestination(index, value)} disabledOptions={index === 0 || kilnSpaces[0] === "" ? [] : [kilnSpaces[0]!]} />
        </div>
      ))}
      {ownsFurniture && <ChoiceTiles name="kiln-furniture" label={locale === "zh-CN" ? "支烧窑具：将1件高温区或低温区陶瓷的窑位修正视为0" : "Kiln Furniture: treat one High/Low load as zone 0"} value={furnitureIndex} onChange={(value) => setFurnitureIndex(value as "" | "0" | "1")} options={[
        { value: "", label: t("Do not use") },
        ...loads.map((load, index) => {
          const ceramic = game.ceramics[load.ceramicId];
          const legalSpace = load.kilnSpaceId !== "imperial" && (load.kilnSpaceId.startsWith("high_") || load.kilnSpaceId.startsWith("low_"));
          return { value: String(index), label: `${index + 1} · ${ceramic === undefined ? t("Ceramic") : ceramicLabel(ceramic, locale)}`, detail: term(load.kilnSpaceId), disabled: !legalSpace, disabledReason: !legalSpace ? (locale === "zh-CN" ? "仅可用于共窑高温区或低温区" : "High or Low Shared Kiln only") : undefined };
        }),
      ]} />}
      {selectedWorker?.kind === "shifu" && (shifuTargets.length > 0
        ? <CeramicChoice name="shifu-ceramic" label={locale === "zh-CN" ? "师傅所在的共窑陶瓷" : "Shared-Kiln ceramic carrying the Shifu"} ceramics={shifuTargets} value={selectedShifuCeramicId} onChange={setShifuCeramicId} />
        : <p className="control-hint">{locale === "zh-CN" ? "若只装入御窑且共窑中没有己方陶瓷，则不放置师傅，也不能进行调位。" : "With no ceramic of yours in the Shared Kiln after loading, this Shifu receives no reposition target."}</p>)}
      {player.startingTechniqueId === "ST04" && <ChoiceTiles compact name="kiln-tending" label={locale === "zh-CN" ? "看火：选择获得的资源" : "Kiln Tending: choose the resource"} value={String(tendingClay)} onChange={(value) => setTendingClay(Number(value))} options={[{ value: "1", label: locale === "zh-CN" ? "1泥" : "1 Clay" }, { value: "0", label: locale === "zh-CN" ? "1柴" : "1 Wood" }]} />}
      <small role="status" className={error === null ? "" : "control-error"}>{error === null ? (locale === "zh-CN" ? `已选择${loads.length}件器物。` : `${loads.length} ceramic${loads.length === 1 ? "" : "s"} selected.`) : localizeActionError(locale, error)}</small>
      <button className="primary-button" disabled={busy || error !== null}>{t("Load kiln")}</button>
    </form>
  );
}

type OfficeActionChoice = OfficeOrderMode;

function OfficeActionForms({ game, player, workers, locationFull, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  workers: AvailableWorker[];
  locationFull: boolean;
  busy: boolean;
  send: SendCommand;
}) {
  const { locale, t } = useI18n();
  const orderSourceCount = game.displays.market.length + game.decks.marketRemaining + game.discards.market.length;
  const canReserve = orderSourceCount > 0;
  const [workerId, setWorkerId] = useState(firstLegalWorkerId(workers, locationFull, () => canReserve));
  const selectedWorker = workers.find((worker) => worker.id === workerId) ?? workers[0];
  const action: OfficeActionChoice = selectedWorker?.kind === "shifu" ? "take_up_to_two" : "take_one";

  function validationError(): string | null {
    if (selectedWorker === undefined) return "Choose an available worker.";
    if (locationFull && selectedWorker.kind !== "shifu") return "Commission Market is full for Apprentices.";
    if (orderSourceCount === 0) {
      return "No Order source is available.";
    }
    return null;
  }

  const error = validationError();
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (error !== null || selectedWorker === undefined) return;
    void send({ type: "BEGIN_OFFICE_ORDERS", workerId: selectedWorker.id, mode: action });
  }
  if (!canReserve) return <ActionUnavailable message="No Order source is available." />;
  return (
    <form className="control-form" onSubmit={submit}>
      <WorkerChoice player={player} workers={workers} value={selectedWorker?.id ?? ""} onChange={setWorkerId} locationFull={locationFull} disabledReason={() => canReserve ? null : (locale === "zh-CN" ? "没有可承接的委托" : "No Order source is available")} />
      <p className="control-hint">{selectedWorker?.kind === "shifu"
        ? <><strong>{t("Shifu:")}</strong> {locale === "zh-CN" ? "承接至多2张主委托，逐张完整结算；完成第1张的展示移动与资源收益后，再选择第2张。" : "Reserve up to 2 Main Orders, resolving each fully; update the display and gain the first reward before choosing the second."}</>
        : <><strong>{t("Apprentice:")}</strong> {locale === "zh-CN" ? "承接1张主委托：移走公开委托时，其右侧委托左移并在最右侧补牌；盲抽牌库顶不会移动展示。然后获得1泥、1柴或1铜钱。" : "Reserve 1 Main Order: a face-up removal slides later Orders left and refills at the right; an unseen top-deck draw does not move the display. Then gain one reservation advance."}</>}</p>
      <small role="status" className={error === null ? "" : "control-error"}>{error === null ? officeActionHint(action, selectedWorker?.kind, locale) : localizeActionError(locale, error)}</small>
      <button className="primary-button" disabled={busy || error !== null}>{t("Visit the Commission Market")}</button>
    </form>
  );
}

function GuildBeginForm({ game, player, workers, locationFull, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  workers: AvailableWorker[];
  locationFull: boolean;
  busy: boolean;
  send: SendCommand;
}) {
  const { locale, t } = useI18n();
  const displayed = Object.values(game.displays.techniques).flat();
  const ownsMaximum = player.techniques.length >= GAME_CONFIG.techniques.maxOwned;
  const canAcquireWith = (candidate: AvailableWorker): boolean => !ownsMaximum
    && displayed.some((techniqueId) => guildTechniqueCost(techniqueId, candidate.kind) <= player.resources.coins);
  const [workerId, setWorkerId] = useState(firstLegalWorkerId(workers, locationFull, canAcquireWith));
  const worker = workers.find((candidate) => candidate.id === workerId) ?? workers[0];
  const affordable = worker === undefined ? [] : displayed.filter((techniqueId) =>
    guildTechniqueCost(techniqueId, worker.kind) <= player.resources.coins,
  );
  const error = worker === undefined
      ? "Choose an available worker."
      : locationFull && worker.kind !== "shifu"
      ? "Guild & Academy is full for Apprentices."
      : ownsMaximum
      ? `You already own the maximum of ${GAME_CONFIG.techniques.maxOwned} Techniques.`
      : displayed.length === 0
        ? "No face-up Technique is available."
        : affordable.length === 0
          ? "No face-up Technique is affordable."
          : null;
  if (ownsMaximum) return <ActionUnavailable message={locale === "zh-CN"
    ? `你已拥有最多${GAME_CONFIG.techniques.maxOwned}项进阶技艺。`
    : `You already own the maximum of ${GAME_CONFIG.techniques.maxOwned} Advanced Techs.`} />;
  if (displayed.length === 0) return <ActionUnavailable message="No face-up Advanced Tech is available." />;
  if (!workers.some((candidate) => (!locationFull || candidate.kind === "shifu") && canAcquireWith(candidate))) {
    return <ActionUnavailable message="No face-up Advanced Tech is affordable." />;
  }
  return (
    <form className="control-form" onSubmit={(event) => {
      event.preventDefault();
      if (error === null && worker !== undefined) void send({ type: "BEGIN_GUILD_ACTION", workerId: worker.id });
    }}>
      <WorkerChoice player={player} workers={workers} value={worker?.id ?? ""} onChange={setWorkerId} locationFull={locationFull} disabledReason={(candidate) => {
        if (ownsMaximum) return locale === "zh-CN" ? `已拥有最多${GAME_CONFIG.techniques.maxOwned}项进阶技艺` : `Maximum ${GAME_CONFIG.techniques.maxOwned} Advanced Techs already owned`;
        if (displayed.length === 0) return locale === "zh-CN" ? "没有公开进阶技艺" : "No face-up Advanced Tech is available";
        return canAcquireWith(candidate) ? null : (locale === "zh-CN" ? "没有买得起的公开进阶技艺" : "No face-up Advanced Tech is affordable");
      }} />
      <p className="control-hint">{worker?.kind === "shifu"
        ? <><strong>{t("Shifu:")}</strong> {locale === "zh-CN" ? "查看一个类别牌堆顶2项技艺，再从已查看或任意公开技艺中购入1项，少支付1铜钱（最低0）。" : "Inspect the top 2 Techs of one discipline, then buy an inspected or any face-up Tech for 1 Coin less (minimum 0)."}</>
        : <><strong>{t("Apprentice:")}</strong> {t("pay printed cost.")}</>}</p>
      <small role="status" className={error === null ? "" : "control-error"}>{error === null ? (locale === "zh-CN" ? `有${affordable.length}个买得起的公开进阶技艺。` : `${affordable.length} affordable face-up Technique${affordable.length === 1 ? "" : "s"}.`) : localizeActionError(locale, error)}</small>
      <button className="primary-button" disabled={busy || error !== null}>{t("Begin Guild action")}</button>
    </form>
  );
}

function OfficeControls({ game, player, privateDecision, busy, send }: Pick<ActionPanelProps, "game" | "busy" | "send"> & {
  player: PublicPlayerState;
  privateDecision?: PrivateDecisionState | undefined;
}) {
  const { locale, t } = useI18n();
  if (game.phase.type !== "work_office_orders") return null;
  const phase = game.phase;
  const display = [...game.displays.market];
  if (phase.step === "gain_advance") {
    return <CommissionAdvanceControls busy={busy} send={send} />;
  }
  if (phase.step === "colour_samples_or_skip") {
    return (
      <ControlSection title="Use Colour Samples?" hint="Privately look at the top 3 Main Orders. Reserve 1 looked-at or face-up Order, then discard every looked-at Order you did not reserve. A looked-at reservation leaves the display unchanged; a face-up removal slides later Orders left and refills at the right.">
        <div className="button-row"><CommandButton busy={busy} send={send} command={{ type: "OFFICE_USE_COLOUR_SAMPLES", deck: "market" }}>Look at the top 3</CommandButton></div>
        <CommandButton busy={busy} send={send} command={{ type: "OFFICE_SKIP_COLOUR_SAMPLES" }} secondary>Skip Colour Samples</CommandButton>
      </ControlSection>
    );
  }
  if (phase.step === "colour_samples_choose") {
    const choices = privateDecision?.colourSamplesOrderIds ?? [];
    const faceUpChoices = display.filter((orderId) => !choices.includes(orderId));
    const hint = locale === "zh-CN"
      ? "只有你能看到所查看的3张主委托。承接其中1张不会移动展示；若改为承接公开委托，则其右侧委托左移并在最右侧补牌。未承接的已查看委托全部弃掉。"
      : "Only you can see the three looked-at Main Orders. Reserving one of them leaves the display unchanged; taking a face-up Order slides later cards left and refills at the right. Discard every looked-at Order not reserved.";
    return (
      <ControlSection title="Choose a Colour Samples Order" hint={hint}>
        <h4>{locale === "zh-CN" ? "私下查看的委托" : "Privately viewed Orders"}</h4>
        <div className="choice-stack playtest-command-grid">
          {choices.map((orderId) => (
            <PieceCommandButton
              key={`looked-at-${orderId}`}
              busy={busy}
              label={locale === "zh-CN" ? `承接已查看委托${orderId}` : `Reserve looked-at ${orderId}`}
              onClick={() => send({ type: "OFFICE_CHOOSE_COLOUR_SAMPLES_ORDER", orderId })}
            >
              <OrderCard orderId={orderId} />
            </PieceCommandButton>
          ))}
        </div>
        <h4>{locale === "zh-CN" ? "公开主委托" : "Face-up Orders"}</h4>
        <div className="choice-stack playtest-command-grid">
          {faceUpChoices.map((orderId) => (
            <PieceCommandButton
              key={`face-up-${orderId}`}
              busy={busy}
              label={locale === "zh-CN" ? `承接公开委托${orderId}` : `Reserve face-up ${orderId}`}
              onClick={() => send({ type: "OFFICE_CHOOSE_COLOUR_SAMPLES_ORDER", orderId })}
            >
              <OrderCard orderId={orderId} />
            </PieceCommandButton>
          ))}
        </div>
      </ControlSection>
    );
  }
  return (
    <ControlSection title="Choose an Order" hint={locale === "zh-CN" ? `还可承接${phase.remainingTakes}张委托。展示区从左到右为最旧到最新；移走公开委托后，其右侧委托左移并在最右侧补牌。` : `${phase.remainingTakes} acquisition${phase.remainingTakes === 1 ? "" : "s"} remaining. The display runs oldest to newest; a face-up removal slides later Orders left and refills at the right.`}>
      <h4>{t("Face-up Orders")}</h4>
      <div className="choice-stack playtest-command-grid">{display.map((orderId) => <PieceCommandButton key={orderId} busy={busy} label={locale === "zh-CN" ? `承接公开委托${orderId}` : `Take face-up ${orderId}`} onClick={() => send({ type: "OFFICE_TAKE_ORDER", orderId })}><OrderCard orderId={orderId} /></PieceCommandButton>)}</div>
      <h4>{t("Main Order deck")}</h4>
      <CommandButton busy={busy} disabled={game.decks.marketRemaining + game.discards.market.length === 0} send={send} command={{ type: "OFFICE_TAKE_TOP_ORDER" }} secondary>{locale === "zh-CN" ? "不看牌面承接主委托牌库顶" : "Reserve the top Main Order unseen"}</CommandButton>
      {phase.mode === "take_up_to_two" && phase.ordersTaken > 0 && <CommandButton busy={busy} send={send} command={{ type: "OFFICE_END_ORDERS" }} secondary>Finish reserving</CommandButton>}
    </ControlSection>
  );
}

const DISCIPLINE_LABELS_ZH: Record<TechniqueDiscipline, string> = { forming: "成型", glazing: "施釉", firing: "烧成" };

function GuildControls({ game, player, privateDecision, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  privateDecision?: PrivateDecisionState | undefined;
  busy: boolean;
  send: SendCommand;
}) {
  const { locale, t } = useI18n();
  if (game.phase.type !== "work_guild") return null;
  const worker = player.workers[game.phase.workerId];
  const ids = [...Object.values(game.displays.techniques).flat(), ...(privateDecision?.guildInspectedTechniqueIds ?? [])];
  if (game.phase.step === "inspect") {
    return (
      <ControlSection title="Shifu inspection" hint="Choose a discipline. You look at the top 2 Techs of its deck, then buy either one of those or any face-up Tech for 1 Coin less.">
        <div className="choice-stack playtest-command-grid">{(DISCIPLINES as readonly TechniqueDiscipline[]).map((discipline) => (
          <PieceCommandButton key={discipline} busy={busy} label={locale === "zh-CN" ? `查看${DISCIPLINE_LABELS_ZH[discipline]}牌堆顶2张` : `Inspect the top 2 ${discipline} Techs`} onClick={() => send({ type: "GUILD_INSPECT_DISCIPLINE", discipline })}>
            <span>{locale === "zh-CN" ? DISCIPLINE_LABELS_ZH[discipline] : discipline}</span>
          </PieceCommandButton>
        ))}</div>
      </ControlSection>
    );
  }
  return (
    <ControlSection title="Acquire a Technique" hint={worker?.kind === "shifu" ? "Your Shifu pays printed cost minus 1 Coin (minimum 0)." : "Your Apprentice pays the printed Coin cost."}>
      <div className="choice-stack playtest-command-grid technique-commands">{ids.map((techniqueId) => {
        const technique = TECHNIQUE_DEFINITIONS[techniqueId];
        const cost = guildTechniqueCost(techniqueId, worker?.kind ?? "apprentice");
        return <PieceCommandButton key={techniqueId} busy={busy || player.resources.coins < cost} label={`${techniqueId} · ${locale === "zh-CN" ? technique?.nameZh : technique?.name ?? t("Unknown Technique")} · ${cost} ${t("Coins")}`} onClick={() => send({ type: "GUILD_BUY_TECHNIQUE", techniqueId })}><TechniqueSummary techniqueId={techniqueId} shownCost={cost} /></PieceCommandButton>;
      })}</div>
    </ControlSection>
  );
}

function KilnRepositionControls({ game, player, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  busy: boolean;
  send: SendCommand;
}) {
  const { locale, t, term } = useI18n();
  const selected = player.kilnYardShifuCeramicId === null
    ? undefined
    : game.ceramics[player.kilnYardShifuCeramicId];
  const ceramicId = selected?.stage === "loaded" && selected.kilnSpaceId !== "imperial"
    ? selected.id
    : "";
  const occupied = new Set(Object.values(game.ceramics).filter((ceramic) => ceramic.stage === "loaded").map((ceramic) => ceramic.stage === "loaded" ? ceramic.kilnSpaceId : ""));
  const kilnZone = (space: KilnSpaceId): "high" | "middle" | "low" => space.startsWith("high_") ? "high" : space.startsWith("middle_") ? "middle" : "low";
  const selectedZone = selected?.stage === "loaded" && selected.kilnSpaceId !== "imperial" ? kilnZone(selected.kilnSpaceId) : null;
  const spaces = activeKilnSpaceIds(game.playerCount).filter((space) => {
    if (occupied.has(space) || selectedZone === null) return false;
    const candidateZone = kilnZone(space);
    return (selectedZone === "high" && candidateZone === "middle")
      || (selectedZone === "middle" && (candidateZone === "high" || candidateZone === "low"))
      || (selectedZone === "low" && candidateZone === "middle");
  });
  return (
    <ControlSection title="Shifu kiln reposition" hint={locale === "zh-CN" ? "基础火候确定后、火牌揭示前，可将师傅所在的那件共窑陶瓷移至相邻火候区中的一个空置有效窑位。" : "After Base Heat is known and before the Fire card is revealed, only the ceramic marked by this Shifu during the Kiln Yard action may move to an empty active space in a neighbouring heat zone."}>
      <form className="control-form" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void send({ type: "RESOLVE_KILN_YARD_REPOSITION", ceramicId, toSpaceId: required(data, "space") as KilnSpaceId });
      }}>
        {selected !== undefined && <p className="control-hint"><strong>{locale === "zh-CN" ? "师傅所在陶瓷" : "Shifu-marked ceramic"}:</strong> {term(selected.shape)} · {selected.id}</p>}
        <SelectField name="space" label="Empty destination" options={spaces} />
        <button className="primary-button" disabled={busy || ceramicId === "" || spaces.length === 0}>{t("Move ceramic")}</button>
      </form>
      <CommandButton busy={busy} send={send} command={{ type: "RESOLVE_KILN_YARD_REPOSITION", ceramicId: null, toSpaceId: null }} secondary>Keep kiln positions</CommandButton>
    </ControlSection>
  );
}

function ContributionControls({ game, player, ownPlayerId, pending, privateDecision, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  ownPlayerId: PlayerId;
  pending: PendingContribution | null;
  privateDecision?: PrivateDecisionState | undefined;
  busy: boolean;
  send: SendCommand;
}) {
  const { locale, t } = useI18n();
  if (game.phase.type !== "firing_contributions") return null;
  const windowId = game.phase.windowId;
  const eligible = game.phase.eligiblePlayerIds.includes(ownPlayerId);
  const submitted = game.phase.submittedPlayerIds.includes(ownPlayerId);
  if (!eligible) return <ControlSection
    title="You cannot participate in this firing"
    hint={locale === "zh-CN"
      ? "你没有陶瓷装在共窑或御窑中，因此本次烧成不选择控火牌。"
      : "You have no ceramic loaded in the Shared Kiln or your Imperial Kiln, so you do not choose a Contribution."}
  >
    <ContributionSubmissionStatus game={game} ownPlayerId={ownPlayerId} />
  </ControlSection>;
  if (submitted) {
    const sealed = pending === null || pending === undefined ? null : CONTRIBUTION_CARD_DEFINITIONS[pending.card];
    const adjustment = sealed === null ? null : sealed.heatAdjustment + (pending?.useFuelLedger === true ? (pending.card === "BANK" ? -1 : 1) : 0);
    return <ControlSection
      title="Contribution locked"
      hint={locale === "zh-CN"
        ? "所有参与者都准备好后，全部控火牌与柴簿承诺会同时揭示。"
        : "All Contribution cards and Fuel Ledger commitments reveal together after every participant is ready."}
    >
      <p className="secret-value">{t("Your sealed choice:")} <strong>{sealed === null ? t("saved") : `${pending?.useFuelLedger === true ? (locale === "zh-CN" ? "柴簿 · " : "Fuel Ledger · ") : ""}${locale === "zh-CN" ? sealed.nameZh : sealed.name}${adjustment === null ? "" : ` (${adjustment > 0 ? "+" : ""}${adjustment})`}`}</strong></p>
      <ContributionSubmissionStatus game={game} ownPlayerId={ownPlayerId} />
    </ControlSection>;
  }
  const hasFuelLedger = player.techniques.some((technique) => technique.id === "T12");
  const choices = [
    ...CONTRIBUTION_CARDS.map((card) => ({ card, useFuelLedger: false, woodCost: card.woodCost, heatAdjustment: card.heatAdjustment })),
    ...(hasFuelLedger ? CONTRIBUTION_CARDS.filter((card) => card.id === "BANK" || card.id === "STOKE").map((card) => ({ card, useFuelLedger: true, woodCost: card.woodCost + 1, heatAdjustment: card.heatAdjustment + (card.id === "BANK" ? -1 : 1) })) : []),
  ];
  return (
    <ControlSection title="Choose a Contribution in secret" hint={hasFuelLedger ? "Fuel Ledger adds secret −2 and +2 options. The printed card and total 2-Wood commitment stay private until everyone reveals." : "Your printed card stays private until every eligible player has locked a choice."}>
      {privateDecision?.fireModifierPeek !== null && privateDecision?.fireModifierPeek !== undefined && <p className="secret-value">{locale === "zh-CN" ? "火照查看结果" : "Test Pieces peek"}: <strong>{privateDecision.fireModifierPeek > 0 ? "+" : ""}{privateDecision.fireModifierPeek}</strong></p>}
      <ContributionSubmissionStatus game={game} ownPlayerId={ownPlayerId} />
      <div className="contribution-grid wood-card-grid">
        {choices.map(({ card, useFuelLedger, woodCost, heatAdjustment }) => {
          const affordable = woodCost <= player.resources.wood;
          return (
            <button
              className={`wood-card-choice ${affordable ? "" : "is-unaffordable"}`}
              type="button"
              key={`${card.id}:${useFuelLedger ? "ledger" : "normal"}`}
              disabled={busy || !affordable}
              onClick={() => void send({ type: "SUBMIT_WOOD_CONTRIBUTION", windowId, card: card.id, useFuelLedger })}
              title={!affordable ? (locale === "zh-CN" ? `需要${woodCost}柴` : `Requires ${woodCost} Wood`) : undefined}
              aria-label={locale === "zh-CN" ? `${useFuelLedger ? "柴簿" : card.nameZh}：${woodCost}柴，火候${heatAdjustment >= 0 ? "+" : ""}${heatAdjustment}` : `${useFuelLedger ? `Fuel Ledger ${card.name}` : card.name}: ${woodCost} Wood, ${heatAdjustment >= 0 ? "+" : ""}${heatAdjustment} Heat`}
            >
              <strong>{useFuelLedger ? (locale === "zh-CN" ? `柴簿 · ${card.nameZh}` : `Fuel Ledger · ${card.name}`) : (locale === "zh-CN" ? card.nameZh : card.name)}</strong>
              <span>{woodCost} {t("Wood")}</span>
              <span>{heatAdjustment >= 0 ? "+" : ""}{heatAdjustment} {t("Heat")}</span>
              {!affordable && <small>{locale === "zh-CN" ? "柴不足" : "Not enough Wood"}</small>}
            </button>
          );
        })}
      </div>
    </ControlSection>
  );
}

function ContributionSubmissionStatus({ game, ownPlayerId }: { game: PublicGameState; ownPlayerId: PlayerId }) {
  const { locale } = useI18n();
  const phase = game.phase;
  if (phase.type !== "firing_contributions") return null;
  return (
    <ol className="firing-submission-status" aria-label={locale === "zh-CN" ? "控火选择进度" : "Contribution progress"}>
      {phase.eligiblePlayerIds.map((playerId) => {
        const ready = phase.submittedPlayerIds.includes(playerId);
        const player = game.players[playerId];
        const playerAccent = PLAYER_ACCENTS[player?.seatIndex ?? 0] ?? PLAYER_ACCENTS[0];
        return <li className={ready ? "is-ready" : ""} key={playerId}>
          <i className={`kiln-tabletop-accent-${playerAccent}`} aria-hidden="true">{player?.displayName.slice(0, 1).toUpperCase()}</i>
          <span>{player?.displayName ?? (locale === "zh-CN" ? "玩家" : "Player")}{playerId === ownPlayerId ? (locale === "zh-CN" ? " · 你" : " · You") : ""}</span>
          <b>{ready ? (locale === "zh-CN" ? "已准备" : "Ready") : (locale === "zh-CN" ? "选择中" : "Choosing")}</b>
        </li>;
      })}
    </ol>
  );
}

function effectiveContributionAdjustment(
  cardId: keyof typeof CONTRIBUTION_CARD_DEFINITIONS,
  upgraded: boolean,
): number {
  return contributionHeatAdjustment(cardId) + (upgraded ? (cardId === "BANK" ? -1 : 1) : 0);
}

function signedHeat(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function heatEquationTerm(value: number): string {
  return value >= 0 ? `+ ${value}` : `− ${Math.abs(value)}`;
}

const PLAYER_ACCENTS = ["cinnabar", "river", "ochre", "plum"] as const;

function actualHeatEquation(result: {
  zoneModifier: number;
  naturalActualHeat: number;
  finalActualHeat: number;
}, globalHeat: number): string {
  const zoneTerm = result.zoneModifier >= 0
    ? `+ ${result.zoneModifier}`
    : `− ${Math.abs(result.zoneModifier)}`;
  const natural = `${globalHeat} ${zoneTerm} = ${result.naturalActualHeat}`;
  return result.finalActualHeat === result.naturalActualHeat
    ? natural
    : `${natural} → ${result.finalActualHeat}`;
}

function FiringProgress({ game, ownPlayerId }: { game: PublicGameState; ownPlayerId: PlayerId }) {
  const { locale } = useI18n();
  const context = game.firingContext;
  if (context === null) return null;
  const contributions = context.contributors.map((playerId) => {
    const cardId = context.contributions[playerId];
    if (cardId === undefined) return null;
    const upgraded = context.fuelLedgerUpgradedBy.includes(playerId);
    return {
      playerId,
      cardId,
      card: CONTRIBUTION_CARD_DEFINITIONS[cardId],
      upgraded,
      adjustment: effectiveContributionAdjustment(cardId, upgraded),
      wood: contributionWoodCost(cardId) + (upgraded ? 1 : 0),
    };
  }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const rawBaseHeat = BASE_HEAT_START + contributions.reduce((sum, entry) => sum + entry.adjustment, 0);
  const ownLoaded = Object.values(game.ceramics).filter(
    (ceramic) => ceramic.ownerId === ownPlayerId && ceramic.stage === "loaded",
  );
  const ownResults = Object.values(context.ceramicResults).filter(
    (result) => game.ceramics[result.ceramicId]?.ownerId === ownPlayerId,
  );
  const fireRevealed = context.fireModifier !== null && context.globalHeat !== null;
  const qualitiesAssigned = ownResults.length > 0 && ownResults.every((result) => result.assignedQuality !== null);
  return (
    <section className="firing-progress-panel" aria-label={locale === "zh-CN" ? "烧成进度" : "Firing progress"}>
      <header>
        <div><small>{locale === "zh-CN" ? "烧成进度" : "FIRING PROGRESS"}</small><h3>{locale === "zh-CN" ? "共窑正在烧成" : "The kiln is firing"}</h3></div>
        <ol aria-label={locale === "zh-CN" ? "烧成步骤" : "Firing steps"}>
          <li className="is-complete">1<span>{locale === "zh-CN" ? "控火" : "Contribute"}</span></li>
          <li className={fireRevealed ? "is-complete" : "is-current"}>2<span>{locale === "zh-CN" ? "揭示" : "Reveal"}</span></li>
          <li className={fireRevealed ? "is-complete" : ""}>3<span>{locale === "zh-CN" ? "火候" : "Heat"}</span></li>
          <li className={qualitiesAssigned ? "is-complete" : fireRevealed ? "is-current" : ""}>4<span>{locale === "zh-CN" ? "品质" : "Quality"}</span></li>
        </ol>
      </header>
      <div className="firing-contribution-reveal">
        {contributions.map((entry) => <article className={`kiln-tabletop-accent-${PLAYER_ACCENTS[game.players[entry.playerId]?.seatIndex ?? 0] ?? PLAYER_ACCENTS[0]}`} key={entry.playerId}>
          <small>{game.players[entry.playerId]?.displayName ?? (locale === "zh-CN" ? "玩家" : "Player")}</small>
          <strong>{entry.upgraded ? (locale === "zh-CN" ? `柴簿 · ${entry.card.nameZh}` : `Fuel Ledger · ${entry.card.name}`) : (locale === "zh-CN" ? entry.card.nameZh : entry.card.name)}</strong>
          <span>{signedHeat(entry.adjustment)} {locale === "zh-CN" ? "火候" : "Heat"} · {entry.wood} {locale === "zh-CN" ? "柴" : "Wood"}</span>
        </article>)}
      </div>
      <div className="firing-heat-calculation">
        <article>
          <small>{locale === "zh-CN" ? "基础火候" : "BASE HEAT"}</small>
          <strong>{BASE_HEAT_START} {contributions.map((entry) => heatEquationTerm(entry.adjustment)).join(" ")} = {context.baseHeat ?? "—"}</strong>
          {context.baseHeat !== null && rawBaseHeat !== context.baseHeat && <span>{locale === "zh-CN" ? `由${rawBaseHeat}限制为0–5` : `Clamped from ${rawBaseHeat} to 0–5`}</span>}
        </article>
        <i aria-hidden="true">+</i>
        <article className={fireRevealed ? "is-revealed" : "is-facedown"}>
          <small>{locale === "zh-CN" ? "窑火牌" : "FIRE CARD"}</small>
          <strong>{context.fireModifier === null ? "火" : signedHeat(context.fireModifier)}</strong>
          <span>{fireRevealed ? (locale === "zh-CN" ? "已揭示" : "Revealed") : (locale === "zh-CN" ? "等待揭示" : "Waiting to reveal")}</span>
        </article>
        <i aria-hidden="true">=</i>
        <article>
          <small>{locale === "zh-CN" ? "全窑火候" : "GLOBAL HEAT"}</small>
          <strong>{context.globalHeat ?? "—"}</strong>
          <span>{locale === "zh-CN" ? "基础火候 + 窑火牌" : "Base Heat + Fire card"}</span>
        </article>
      </div>
      <section className="firing-own-results">
        <h4>{locale === "zh-CN" ? "你的陶瓷" : "Your ceramics"}</h4>
        {ownResults.length > 0 ? ownResults.map((result) => {
          const ceramic = game.ceramics[result.ceramicId];
          const glaze = ceramic !== undefined && "glaze" in ceramic ? ceramic.glaze : null;
          return <article key={result.ceramicId}>
            <span>{ceramic === undefined ? (locale === "zh-CN" ? "陶瓷" : "Ceramic") : ceramicLabel(ceramic, locale)}</span>
            <small>{locale === "zh-CN" ? "实际火候" : "Actual Heat"}: <b>{actualHeatEquation(result, context.globalHeat ?? 0)}</b>{result.finalActualHeat !== result.naturalActualHeat ? (locale === "zh-CN" ? "（能力调整后）" : " (after ability adjustment)") : ""} · {locale === "zh-CN" ? "适烧" : "Preferred"} {glaze === null ? "—" : preferredHeat(glaze)}</small>
            <strong className={`firing-quality is-${result.assignedQuality ?? "pending"}`}>{result.assignedQuality === null ? (locale === "zh-CN" ? "品质待定" : "Quality pending") : localizedTerm(locale, result.assignedQuality)}</strong>
          </article>;
        }) : ownLoaded.length > 0 ? ownLoaded.map((ceramic) => <article key={ceramic.id}>
          <span>{ceramicLabel(ceramic, locale)}</span>
          <small>{locale === "zh-CN" ? "揭示窑火牌后计算实际火候与品质。" : "Actual Heat and Quality appear after the Fire card is revealed."}</small>
          <strong className="firing-quality is-pending">{locale === "zh-CN" ? "等待窑火" : "Awaiting Fire"}</strong>
        </article>) : <p>{locale === "zh-CN" ? "你没有陶瓷参与本次烧成。" : "You have no ceramic in this firing."}</p>}
      </section>
    </section>
  );
}

function FireRevealControls({ game, ownPlayerId, busy, send }: {
  game: PublicGameState;
  ownPlayerId: PlayerId;
  busy: boolean;
  send: SendCommand;
}) {
  const { locale } = useI18n();
  if (game.phase.type !== "firing_reveal_fire") return null;
  const firstPlayer = game.players[game.phase.actorId];
  const ownReveal = game.phase.actorId === ownPlayerId;
  return <ControlSection
    title="Reveal the Fire card"
    hint={ownReveal
      ? (locale === "zh-CN" ? "所有控火牌已经揭示，基础火候已经确定。由本轮起始玩家揭示窑火牌。" : "All Contributions are revealed and Base Heat is set. As First Player, reveal the Fire card.")
      : (locale === "zh-CN" ? `等待${firstPlayer?.displayName ?? "起始玩家"}揭示窑火牌。` : `Waiting for ${firstPlayer?.displayName ?? "the First Player"} to reveal the Fire card.`)}
  >
    {ownReveal
      ? <button className="primary-button reveal-fire-button" type="button" disabled={busy} onClick={() => void send({ type: "REVEAL_FIRE_CARD" })}>{locale === "zh-CN" ? "揭示窑火牌" : "Reveal Fire card"}</button>
      : <div className="waiting-fire-card" aria-hidden="true"><span>火</span><i /></div>}
  </ControlSection>;
}

function CompletedFiringReview({ game, ownPlayerId, onContinue }: {
  game: PublicGameState;
  ownPlayerId: PlayerId;
  onContinue: () => void;
}) {
  const { locale } = useI18n();
  const summary = game.lastFiringResult;
  if (summary === null) return null;
  const contributions = Object.entries(summary.contributions ?? {}).map(([playerId, cardId]) => {
    const adjustment = summary.effectiveHeatAdjustments?.[playerId] ?? contributionHeatAdjustment(cardId);
    const upgraded = Math.abs(adjustment) === 2;
    return {
      playerId,
      cardId,
      adjustment,
      upgraded,
      wood: contributionWoodCost(cardId) + (upgraded ? 1 : 0),
      card: CONTRIBUTION_CARD_DEFINITIONS[cardId],
    };
  });
  const storedResults = Object.values(summary.ceramicResults ?? {}).filter(
    (result) => game.ceramics[result.ceramicId]?.ownerId === ownPlayerId,
  );
  const fallbackCeramics = Object.values(game.ceramics).filter(
    (ceramic) => ceramic.ownerId === ownPlayerId && "firedInRound" in ceramic && ceramic.firedInRound === summary.round,
  );
  return <section className="firing-progress-panel firing-complete-review" aria-label={locale === "zh-CN" ? "烧成结果" : "Firing results"}>
    <header><div><small>{locale === "zh-CN" ? "烧成完成" : "FIRING COMPLETE"}</small><h3>{locale === "zh-CN" ? `第${summary.round}轮烧成结果` : `Round ${summary.round} firing results`}</h3></div><span className="firing-complete-mark">✓</span></header>
    {contributions.length > 0 && <div className="firing-contribution-reveal">{contributions.map((entry) => <article className={`kiln-tabletop-accent-${PLAYER_ACCENTS[game.players[entry.playerId]?.seatIndex ?? 0] ?? PLAYER_ACCENTS[0]}`} key={entry.playerId}>
      <small>{game.players[entry.playerId]?.displayName ?? (locale === "zh-CN" ? "玩家" : "Player")}</small>
      <strong>{entry.upgraded ? (locale === "zh-CN" ? `柴簿 · ${entry.card.nameZh}` : `Fuel Ledger · ${entry.card.name}`) : (locale === "zh-CN" ? entry.card.nameZh : entry.card.name)}</strong>
      <span>{signedHeat(entry.adjustment)} {locale === "zh-CN" ? "火候" : "Heat"} · {entry.wood} {locale === "zh-CN" ? "柴" : "Wood"}</span>
    </article>)}</div>}
    <div className="firing-final-formula">
      <span><small>{locale === "zh-CN" ? "基础火候" : "Base Heat"}</small><strong>{BASE_HEAT_START} {contributions.map((entry) => heatEquationTerm(entry.adjustment)).join(" ")} = {summary.baseHeat}</strong></span>
      <i>+</i><span><small>{locale === "zh-CN" ? "窑火牌" : "Fire card"}</small><strong>{signedHeat(summary.fireModifier)}</strong></span>
      <i>=</i><span><small>{locale === "zh-CN" ? "全窑火候" : "Global Heat"}</small><strong>{summary.globalHeat}</strong></span>
    </div>
    <section className="firing-own-results">
      <h4>{locale === "zh-CN" ? "你的烧成结果" : "Your firing results"}</h4>
      {storedResults.length > 0 ? storedResults.map((result) => {
        const ceramic = game.ceramics[result.ceramicId];
        const glaze = ceramic !== undefined && "glaze" in ceramic ? ceramic.glaze : null;
        return <article key={result.ceramicId}>
          <span>{ceramic === undefined ? (locale === "zh-CN" ? "陶瓷" : "Ceramic") : firingResultCeramicLabel(ceramic, locale)}</span>
          <small>{locale === "zh-CN" ? "实际火候" : "Actual Heat"}: <b>{actualHeatEquation(result, summary.globalHeat)}</b>{result.finalActualHeat !== result.naturalActualHeat ? (locale === "zh-CN" ? "（能力调整后）" : " (after ability adjustment)") : ""} · {locale === "zh-CN" ? "适烧" : "Preferred"} {glaze === null ? "—" : preferredHeat(glaze)}</small>
          <strong className={`firing-quality is-${result.assignedQuality ?? "pending"}`}>{result.assignedQuality === null ? (locale === "zh-CN" ? "品质待定" : "Quality pending") : localizedTerm(locale, result.assignedQuality)}</strong>
        </article>;
      }) : fallbackCeramics.length > 0 ? fallbackCeramics.map((ceramic) => <article key={ceramic.id}>
        <span>{firingResultCeramicLabel(ceramic, locale)}</span>
        <strong className={`firing-quality is-${"quality" in ceramic ? ceramic.quality : "pending"}`}>{"quality" in ceramic ? localizedTerm(locale, ceramic.quality) : (locale === "zh-CN" ? "品质待定" : "Quality pending")}</strong>
      </article>) : <p>{locale === "zh-CN" ? "你没有陶瓷参与本次烧成。" : "You had no ceramic in this firing."}</p>}
    </section>
    <button className="primary-button" type="button" onClick={onContinue}>{locale === "zh-CN" ? "继续委托阶段" : "Continue to Order Phase"}</button>
  </section>;
}

function CleanupOrderControls({ player, busy, send }: { player: PublicPlayerState; busy: boolean; send: SendCommand }) {
  const { locale } = useI18n();
  const limit = orderHandLimit();
  const requiredCount = Math.max(0, player.orderHand.length - limit);
  return <SelectionSubmission
    title="Cleanup Order limit"
    hint={locale === "zh-CN" ? `正面朝上弃置恰好${requiredCount}张委托以完成整理；你的手牌上限为${limit}张。` : `Discard exactly ${requiredCount} Order${requiredCount === 1 ? "" : "s"} face up to finish cleanup. Your limit is ${limit}.`}
    options={player.orderHand.map((orderId) => ({ value: orderId, label: orderId }))}
    maximum={requiredCount}
    exact
    busy={busy}
    submitLabel="Discard selected Orders"
    onSubmit={(orderIds) => send({ type: "DISCARD_ORDERS_FOR_CLEANUP", orderIds })}
  />;
}

function KilnAbilityControls({ game, player, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  busy: boolean;
  send: SendCommand;
}) {
  const { locale } = useI18n();
  const loaded = ownCeramics(game, player.id, "loaded").filter(
    (ceramic) => game.phase.type !== "firing_second_before_quality" || ceramic.id === game.phase.ceramicId,
  );
  if (player.kilnId === "GE") {
    const eligible = loaded.filter(
      ({ id }) => {
        const difference = game.firingContext?.ceramicResults[id]?.finalHeatDifference;
        return difference === 1;
      },
    );
    return <CeramicDecision title="Ge · Crackle from Fire" hint={kilnShortPlainText("GE", locale)} ceramics={eligible} busy={busy} send={send} make={(ceramicId) => ({ type: "RESOLVE_GE", ceramicId })} skip={{ type: "RESOLVE_GE", ceramicId: null }} />;
  }
  return (
    <ControlSection title="Jun · Kiln Transformation" hint={locale === "zh-CN" ? `支付${JUN_ACTIVATION_WOOD}柴，将你1件陶瓷的实际火候调整+1或−1，也可以跳过。` : `Pay ${JUN_ACTIVATION_WOOD} Wood to adjust one of your ceramics' Actual Heat by +1 or −1, or pass.`}>
      <JunForm ceramics={loaded} wood={player.resources.wood} busy={busy} send={send} />
      <CommandButton busy={busy} send={send} command={{ type: "RESOLVE_JUN", ceramicId: null, delta: null }} secondary>Skip Jun ability</CommandButton>
    </ControlSection>
  );
}

function JunForm({ ceramics, wood, busy, send }: { ceramics: ReturnType<typeof ownCeramics>; wood: number; busy: boolean; send: SendCommand }) {
  const { locale } = useI18n();
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void send({ type: "RESOLVE_JUN", ceramicId: required(data, "ceramic"), delta: Number(required(data, "delta")) as -1 | 1 });
  }
  return <form className="control-form" onSubmit={submit}><CeramicSelect name="ceramic" label="Ceramic" ceramics={ceramics} /><SelectField name="delta" label="Heat change" options={["-1", "1"]} /><button className="primary-button" disabled={busy || ceramics.length === 0 || wood < JUN_ACTIVATION_WOOD}>{locale === "zh-CN" ? `支付${JUN_ACTIVATION_WOOD}柴并调整火候` : `Pay ${JUN_ACTIVATION_WOOD} Wood and apply heat change`}</button>{wood < JUN_ACTIVATION_WOOD && <small role="status">{locale === "zh-CN" ? `使用钧窑能力需要${JUN_ACTIVATION_WOOD}柴。` : `You need ${JUN_ACTIVATION_WOOD} Wood to use Jun.`}</small>}</form>;
}

function SaggarsControls({ game, player, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  busy: boolean;
  send: SendCommand;
}) {
  const eligible = ownCeramics(game, player.id, "loaded").filter((ceramic) => {
    const quality = game.firingContext?.ceramicResults[ceramic.id]?.assignedQuality;
    return quality === "flawed" || quality === "standard";
  });
  return <CeramicDecision title="Protective Saggars" hint="Pay 1 Wood to improve one result by one step: Flawed to Standard or Standard to Fine." ceramics={eligible} busy={busy} send={send} make={(ceramicId) => ({ type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId })} skip={{ type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: null }} />;
}

function SecondFiringControls({ game, player, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  busy: boolean;
  send: SendCommand;
}) {
  const eligible = ownCeramics(game, player.id, "loaded").filter(
    (ceramic) => {
      const quality = game.firingContext?.ceramicResults[ceramic.id]?.assignedQuality;
      return quality === "flawed" || quality === "standard";
    },
  );
  return <CeramicDecision title="Second Firing" hint="Choose one Flawed or Standard ceramic. Reveal one extra Fire card and recalculate only that ceramic with the same Base Heat and position; the new Quality replaces the first." ceramics={eligible} busy={busy} send={send} make={(ceramicId) => ({ type: "RESOLVE_SECOND_FIRING", ceramicId })} skip={{ type: "RESOLVE_SECOND_FIRING", ceramicId: null }} />;
}

function WorkshopSecondsControls({ game, player, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  busy: boolean;
  send: SendCommand;
}) {
  const flawed = ownCeramics(game, player.id, "loaded").filter(
    (ceramic) => game.firingContext?.ceramicResults[ceramic.id]?.assignedQuality === "flawed",
  );
  return <CeramicDecision title="Flawed salvage" hint="After all after-Quality abilities, you may discard 1 ceramic still Flawed from this firing to gain 2 Coins, or keep it." ceramics={flawed} busy={busy} send={send} make={(ceramicId) => ({ type: "RESOLVE_WORKSHOP_SECONDS", ceramicId })} skip={{ type: "RESOLVE_WORKSHOP_SECONDS", ceramicId: null }} />;
}

function OrderControls({ game, player, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  busy: boolean;
  send: SendCommand;
}) {
  const { locale } = useI18n();
  const ceramics = ownCeramics(game, player.id, "finished").filter(
    (ceramic): ceramic is FinishedCeramic => ceramic.stage === "finished",
  );
  const completableOrders = [...new Set([...player.orderHand, ...game.displays.market])].flatMap((orderId) => {
    const definition = ORDER_DEFINITIONS[orderId];
    if (definition === undefined) return [];
    const matchingGroups = matchingOrderCeramicGroups(definition, ceramics);
    if (matchingGroups.length === 0) return [];
    const matchingCeramicIds = new Set(matchingGroups.flatMap((group) => group.map((ceramic) => ceramic.id)));
    return [{
      orderId,
      ceramics: ceramics.filter((ceramic) => matchingCeramicIds.has(ceramic.id)),
    }];
  });
  return (
    <ControlSection title="Complete an Order" hint="On this opportunity, complete at most one held Order or one of the five face-up Main Orders, or pass. The Order Phase continues in reverse order until a full circuit has no completion.">
      {completableOrders.length === 0 ? <p>{locale === "zh-CN" ? "你目前没有能够完成的委托。" : "You cannot complete any available Orders with your Finished ceramics."}</p> : completableOrders.map(({ orderId, ceramics: matchingCeramics }) => (
        <OrderCompletion key={orderId} orderId={orderId} ceramics={matchingCeramics} recognition={player.imperialRecognition} busy={busy} send={send} />
      ))}
      <CommandButton busy={busy} send={send} command={{ type: "END_ORDER_TURN" }} secondary>Pass this Order opportunity</CommandButton>
    </ControlSection>
  );
}

function OrderCompletion({ orderId, ceramics, recognition, busy, send }: {
  orderId: string;
  ceramics: readonly FinishedCeramic[];
  recognition: 0 | 1 | 2 | 3 | 4;
  busy: boolean;
  send: SendCommand;
}) {
  const { locale, t } = useI18n();
  const definition = ORDER_DEFINITIONS[orderId];
  const [selected, setSelected] = useState<string[]>([]);
  const [grantChoice, setGrantChoice] = useState<"coins" | "resources">("coins");
  const selectedCeramics = selected
    .map((ceramicId) => ceramics.find((ceramic) => ceramic.id === ceramicId))
    .filter((ceramic): ceramic is FinishedCeramic => ceramic?.stage === "finished");
  const matches = definition !== undefined && matchesOrder(definition, selectedCeramics);
  const requiredCount = definition?.ceramics.length ?? 0;
  const crossesGrant = definition !== undefined && recognition < 1 && recognition + definition.crowns >= 1;
  const selectionStatus = locale === "zh-CN"
    ? selected.length === 0
      ? `请选择恰好${requiredCount}件已完成陶瓷。`
      : selected.length !== requiredCount
        ? `已选择${selected.length}件；此委托需要恰好${requiredCount}件。`
        : matches
          ? "所选陶瓷符合此委托，可以完成。"
          : "所选器物不符合委托的器型、釉、装饰、组合关系或最低品质要求。"
    : selected.length === 0
      ? `Select exactly ${requiredCount} Finished ceramic${requiredCount === 1 ? "" : "s"}.`
      : selected.length !== requiredCount
        ? `Selected ${selected.length}; this Order requires exactly ${requiredCount}.`
        : matches
          ? "Selection satisfies this Order and is ready to complete."
          : "Selection does not satisfy the Order's Shape, Glaze, Decoration, relationship, or minimum Quality requirements.";
  return (
    <article className="completion-card">
      <OrderCard orderId={orderId} />
      <fieldset><legend>{t("Deliver ceramics")}</legend>{ceramics.map((ceramic) => (
        <label className="check-row" key={ceramic.id}><input type="checkbox" checked={selected.includes(ceramic.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, ceramic.id] : current.filter((id) => id !== ceramic.id))} />{ceramicLabel(ceramic, locale)}</label>
      ))}</fieldset>
      {crossesGrant && <label>{locale === "zh-CN" ? "御赐收益" : "Imperial Grant reward"}<select value={grantChoice} onChange={(event) => setGrantChoice(event.target.value as "coins" | "resources")}><option value="coins">{locale === "zh-CN" ? "3铜钱" : "3 Coins"}</option><option value="resources">{locale === "zh-CN" ? "1泥 + 1柴 + 1铜钱" : "1 Clay + 1 Wood + 1 Coin"}</option></select></label>}
      <p className={matches ? "selection-valid" : "control-hint"} role="status">{selectionStatus}</p>
      <button
        className="primary-button"
        type="button"
        disabled={busy || !matches}
        onClick={() => {
          void send({ type: "COMPLETE_ORDER", orderId, ceramicIds: selected, ...(crossesGrant ? { imperialGrantChoice: grantChoice } : {}) });
        }}
      >{locale === "zh-CN" ? `完成${orderId}` : `Complete ${orderId}`}</button>
    </article>
  );
}

function PresentationControls({ game, player, ownPlayerId, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  ownPlayerId: PlayerId;
  busy: boolean;
  send: SendCommand;
}) {
  const { locale } = useI18n();
  if (game.phase.type !== "presentation") return null;
  const submitted = game.phase.submittedPlayerIds.includes(ownPlayerId);
  const ceramics = ownCeramics(game, ownPlayerId, "finished").filter((ceramic) => ceramic.stage === "finished" && ceramic.quality !== "flawed");
  const maximum = IMPERIAL_PROGRESS.exhibition.capacity;
  const [selected, setSelected] = useState<string[]>([]);
  const [featured, setFeatured] = useState<string[]>([]);
  if (submitted) return <ControlSection title="Exhibition submitted" hint="Waiting for the other workshops." />;
  const hint = locale === "zh-CN"
    ? `陈设至多${maximum}件未交付且品质为良品或更高的陶瓷。若陈设至少3件，须指定恰好3件为主题藏品；三种不同器型和／或三种不同釉各得+3 VP。`
    : `Exhibit up to ${maximum} finished, undelivered Standard-or-better ceramics. If you exhibit at least three, choose exactly three as the featured collection; three different Shapes and/or Glazes earn +3 VP each.`;
  const requiredFeatured = selected.length >= 3 ? 3 : 0;
  return (
    <ControlSection title="End-game Exhibition" hint={hint}>
      <fieldset><legend>{locale === "zh-CN" ? "陈设器物（至多5件）" : "Exhibited ceramics (up to 5)"}</legend>{ceramics.map((ceramic) => {
        const checked = selected.includes(ceramic.id);
        return <label className="check-row" key={ceramic.id}><input type="checkbox" checked={checked} disabled={!checked && selected.length >= maximum} onChange={(event) => {
          setSelected((current) => event.target.checked ? [...current, ceramic.id] : current.filter((id) => id !== ceramic.id));
          if (!event.target.checked) setFeatured((current) => current.filter((id) => id !== ceramic.id));
        }} />{ceramicLabel(ceramic, locale)}</label>;
      })}</fieldset>
      {selected.length >= 3 && <fieldset><legend>{locale === "zh-CN" ? "主题藏品（恰好3件）" : "Featured collection (exactly 3)"}</legend>{selected.map((ceramicId) => {
        const ceramic = ceramics.find(({ id }) => id === ceramicId);
        const checked = featured.includes(ceramicId);
        return <label className="check-row" key={ceramicId}><input type="checkbox" checked={checked} disabled={!checked && featured.length >= 3} onChange={(event) => setFeatured((current) => event.target.checked ? [...current, ceramicId] : current.filter((id) => id !== ceramicId))} />{ceramic === undefined ? (locale === "zh-CN" ? "陶瓷" : "Ceramic") : ceramicLabel(ceramic, locale)}</label>;
      })}</fieldset>}
      <button className="primary-button" disabled={busy || featured.length !== requiredFeatured} onClick={() => void send({ type: "SUBMIT_PRESENTATION", ceramicIds: selected, featuredCeramicIds: featured })}>{locale === "zh-CN" ? "提交终局陈列" : "Submit Exhibition"}</button>
    </ControlSection>
  );
}

function FinalResults({ game }: { game: PublicGameState }) {
  const { locale, t } = useI18n();
  if (game.finalResult === null) return null;
  return (
    <ControlSection title="Final results" hint={locale === "zh-CN" ? `判定依据：${finalResolutionLabel(game.finalResult.resolvedBy, locale)}。` : `Resolved by ${finalResolutionLabel(game.finalResult.resolvedBy, locale)}.`}>
      <div className="score-table-scroll">
        <table className="score-table" aria-label={locale === "zh-CN" ? "最终分数明细" : "Final score breakdown"}>
          <thead><tr><th>{locale === "zh-CN" ? "作坊" : "Workshop"}</th><th>{t("Orders")}</th><th>{locale === "zh-CN" ? "御前召见" : "Imperial Audience"}</th><th>{t("End-game Exhibition")}</th><th>{locale === "zh-CN" ? "进阶技艺" : "Advanced Techs"}</th><th>{locale === "zh-CN" ? "窑口／皇冠溢出" : "Kiln / Crown overflow"}</th><th>{t("Coins")}</th><th>{locale === "zh-CN" ? "总分" : "Total"}</th></tr></thead>
          <tbody>{game.playerOrder.map((playerId) => {
            const score = game.finalResult?.scores[playerId];
            const winner = game.finalResult?.winnerIds.includes(playerId) ?? false;
            return <tr className={winner ? "winner" : ""} key={playerId}><th>{game.players[playerId]?.displayName}{winner && <em>{locale === "zh-CN" ? "胜者" : "Winner"}</em>}</th><td>{score?.orders ?? 0}</td><td>{score?.imperialAudience ?? 0}</td><td>{score?.presentation ?? 0}</td><td>{score?.advancedTechniques ?? 0}</td><td>{score?.immediateAbilities ?? 0}</td><td>{score?.leftoverCoins ?? 0}</td><td><strong>{score?.total ?? 0} {t("VP")}</strong></td></tr>;
          })}</tbody>
        </table>
      </div>
    </ControlSection>
  );
}

function finalResolutionLabel(
  resolvedBy: NonNullable<PublicGameState["finalResult"]>["resolvedBy"],
  locale: Locale,
): string {
  const labels = locale === "zh-CN" ? {
    total_vp: "总分",
    imperial_recognition: "御府声望",
    completed_crowns: "已完成委托上的👑总数",
    masterpieces_delivered_or_presented: "已交付或陈设的臻品数量",
    shared_victory: "共享胜利",
  } : {
    total_vp: "total VP",
    imperial_recognition: "Imperial Recognition",
    completed_crowns: "Crowns on completed Orders",
    masterpieces_delivered_or_presented: "Masterpieces delivered or exhibited",
    shared_victory: "shared victory",
  };
  return labels[resolvedBy];
}

function BinaryDecision({ title, hint, action, busy, send }: {
  title: string;
  hint: string;
  action: "RESOLVE_TEST_PIECES";
  busy: boolean;
  send: SendCommand;
}) {
  return <ControlSection title={title} hint={hint}><div className="button-row"><CommandButton busy={busy} send={send} command={{ type: action, use: true }}>Use ability</CommandButton><CommandButton busy={busy} send={send} command={{ type: action, use: false }} secondary>Skip</CommandButton></div></ControlSection>;
}

function CeramicDecision({ title, hint, ceramics, busy, send, make, skip }: {
  title: string;
  hint: string;
  ceramics: ReturnType<typeof ownCeramics>;
  busy: boolean;
  send: SendCommand;
  make: (ceramicId: string) => GameAction;
  skip: GameAction;
}) {
  const { locale } = useI18n();
  return <ControlSection title={title} hint={hint}><div className="choice-stack">{ceramics.map((ceramic) => <CommandButton key={ceramic.id} busy={busy} send={send} command={make(ceramic.id)}>{ceramicLabel(ceramic, locale)}</CommandButton>)}</div><CommandButton busy={busy} send={send} command={skip} secondary>Skip</CommandButton></ControlSection>;
}

function SelectionSubmission({ title, hint, options, maximum, exact = false, busy, submitLabel, onSubmit }: {
  title: string;
  hint: string;
  options: Array<{ value: string; label: string }>;
  maximum: number;
  exact?: boolean;
  busy: boolean;
  submitLabel: string;
  onSubmit: (values: string[]) => Promise<boolean>;
}) {
  const { locale, t } = useI18n();
  const [selected, setSelected] = useState<string[]>([]);
  return <ControlSection title={title} hint={hint}><fieldset><legend>{exact ? (locale === "zh-CN" ? `恰好选择${maximum}项` : `Select exactly ${maximum}`) : t("Select up to {maximum}", { maximum })}</legend>{options.map((option) => <label className="check-row" key={option.value}><input type="checkbox" checked={selected.includes(option.value)} disabled={!selected.includes(option.value) && selected.length >= maximum} onChange={(event) => setSelected((current) => event.target.checked ? [...current, option.value] : current.filter((value) => value !== option.value))} />{option.label}</label>)}</fieldset><button className="primary-button" type="button" disabled={busy || (exact && selected.length !== maximum)} onClick={() => void onSubmit(selected)}>{t(submitLabel)}</button></ControlSection>;
}

function firstLegalWorkerId(
  workers: AvailableWorker[],
  locationFull: boolean,
  workerEnabled: (worker: AvailableWorker) => boolean = () => true,
): string {
  return workers.find((worker) => (!locationFull || worker.kind === "shifu") && workerEnabled(worker))?.id
    ?? workers.find((worker) => !locationFull || worker.kind === "shifu")?.id
    ?? workers[0]?.id
    ?? "";
}

function WorkerChoice({ player, workers, value, onChange, locationFull = false, disabledReason }: {
  player: PublicPlayerState;
  workers: AvailableWorker[];
  value: string;
  onChange: (workerId: string) => void;
  locationFull?: boolean;
  disabledReason?: ((worker: AvailableWorker) => string | null) | undefined;
}) {
  const { locale, t, term } = useI18n();
  let apprenticeIndex = 0;
  return <fieldset className="kiln-action-choice-group kiln-worker-choice"><legend>{t("Worker")}</legend><div className="kiln-action-choice-grid">{workers.map((worker) => {
    const index = worker.kind === "apprentice" ? ++apprenticeIndex : 0;
    const label = `${term(worker.kind)}${index > 0 ? ` ${index}` : ""}`;
    const capacityReason = locationFull && worker.kind === "apprentice"
      ? locale === "zh-CN" ? "普通工位已满；只有师傅仍可放置。" : "Printed spaces are full; only the Shifu may overfill."
      : null;
    const unavailableReason = capacityReason ?? disabledReason?.(worker) ?? null;
    const unavailable = unavailableReason !== null;
    return <button
      className={`kiln-worker-choice-button ${value === worker.id ? "is-selected" : ""}`}
      type="button"
      aria-pressed={value === worker.id}
      aria-label={unavailable ? `${label}. ${unavailableReason}` : label}
      title={unavailableReason ?? label}
      data-worker-choice={worker.id}
      disabled={unavailable}
      onClick={() => onChange(worker.id)}
      key={worker.id}
    ><WorkerMeeple player={player} kind={worker.kind} locale={locale} /><span className="kiln-worker-choice-copy"><span className="kiln-worker-choice-name">{label}</span><small className="kiln-worker-choice-kind">{worker.kind === "shifu" ? (locale === "zh-CN" ? "师傅行动" : "Shifu action") : (locale === "zh-CN" ? "学徒行动" : "Apprentice action")}</small>{unavailable && <em className="kiln-action-choice-reason">{unavailableReason}</em>}</span></button>;
  })}</div></fieldset>;
}

interface ChoiceTileOption {
  value: string;
  label: string;
  detail?: string | undefined;
  disabled?: boolean | undefined;
  disabledReason?: string | undefined;
  visual?: ReactNode | undefined;
}

function ChoiceTiles({ name, label, options, value, onChange, compact = false }: {
  name: string;
  label: string;
  options: readonly ChoiceTileOption[];
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  return <fieldset className={`kiln-action-choice-group ${compact ? "is-compact" : ""}`} data-choice-group={name}><legend>{t(label)}</legend><div className="kiln-action-choice-grid">{options.map((option) => <button
    className={`kiln-action-choice ${value === option.value ? "is-selected" : ""}`}
    type="button"
    aria-pressed={value === option.value}
    data-choice-value={option.value}
    disabled={option.disabled === true}
    title={option.disabledReason}
    onClick={() => onChange(option.value)}
    key={option.value}
  >{option.visual}<span className="kiln-action-choice-copy"><span className="kiln-action-choice-label">{option.label}</span>{option.detail !== undefined && <small className="kiln-action-choice-detail">{option.detail}</small>}{option.disabled === true && option.disabledReason !== undefined && <em className="kiln-action-choice-reason">{option.disabledReason}</em>}</span></button>)}</div></fieldset>;
}

function CeramicSelect({ name, label, ceramics, blank }: {
  name: string;
  label: string;
  ceramics: ReturnType<typeof ownCeramics>;
  blank?: string;
}) {
  const { locale, t } = useI18n();
  return <label>{t(label)}<select name={name} required={blank === undefined}>{blank !== undefined && <option value="">{t(blank)}</option>}{ceramics.map((ceramic) => <option key={ceramic.id} value={ceramic.id}>{ceramicLabel(ceramic, locale)}</option>)}</select></label>;
}

function CeramicChoice({ name, label, ceramics, blank, value, onChange, disabledIds = [] }: {
  name: string;
  label: string;
  ceramics: ReturnType<typeof ownCeramics>;
  blank?: string;
  value: string;
  onChange: (ceramicId: string) => void;
  disabledIds?: readonly string[];
}) {
  const { locale, t } = useI18n();
  return <ChoiceTiles name={name} label={label} value={value} onChange={onChange} options={[
    ...(blank === undefined ? [] : [{ value: "", label: t(blank) }]),
    ...ceramics.map((ceramic) => ({
      value: ceramic.id,
      label: ceramicLabel(ceramic, locale),
      disabled: disabledIds.includes(ceramic.id),
      disabledReason: disabledIds.includes(ceramic.id) ? (locale === "zh-CN" ? "已在本次行动中选择" : "Already selected for this action") : undefined,
    })),
  ]} />;
}

function SelectField({ name, label, options, blank }: {
  name: string;
  label: string;
  options: readonly (string | number)[];
  blank?: string;
}) {
  const { t, term } = useI18n();
  return <label>{t(label)}<select name={name} required={blank === undefined}>{blank !== undefined && <option value="">{t(blank)}</option>}{options.map((option) => <option key={option} value={option}>{term(String(option))}</option>)}</select></label>;
}

function decorationOptionLabel(option: string, locale: Locale = "en"): string {
  const decoration = option as Decoration;
  const cost = DECORATION_COSTS[decoration];
  return `${localizedTerm(locale, option)} · ${cost} ${locale === "zh-CN" ? "铜钱" : `Coin${cost === 1 ? "" : "s"}`}`;
}

function EnumChoice({ name, label, options, value, onChange, formatOption, disabledOptions = [] }: {
  name: string;
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  formatOption?: (option: string) => string;
  disabledOptions?: readonly string[];
}) {
  const { locale, term } = useI18n();
  return <ChoiceTiles compact name={name} label={label} value={value} onChange={onChange} options={options.map((option) => ({ value: option, label: formatOption?.(option) ?? term(option), disabled: disabledOptions.includes(option), disabledReason: disabledOptions.includes(option) ? (locale === "zh-CN" ? "已在本次行动中选择" : "Already selected for this action") : undefined }))} />;
}

function TechniqueChecks({ techniqueIds, selected, onChange }: {
  techniqueIds: TechniqueId[];
  selected: TechniqueId[];
  onChange: (techniqueIds: TechniqueId[]) => void;
}) {
  const { locale, t } = useI18n();
  if (techniqueIds.length === 0) return null;
  return <fieldset><legend>{t("Use Techniques")}</legend>{techniqueIds.map((techniqueId) => { const technique = TECHNIQUE_DEFINITIONS[techniqueId]; return <label className="check-row" key={techniqueId}><input type="checkbox" name="technique" value={techniqueId} checked={selected.includes(techniqueId)} onChange={(event) => onChange(event.target.checked ? [...selected, techniqueId] : selected.filter((id) => id !== techniqueId))} />{techniqueId} · {locale === "zh-CN" ? technique?.nameZh : technique?.name ?? t("Unknown Technique")}</label>; })}</fieldset>;
}

function PieceCommandButton({ busy, label, onClick, children }: {
  busy: boolean;
  label: string;
  onClick: () => Promise<boolean>;
  children: ReactNode;
}) {
  return (
    <button className="playtest-piece-command" type="button" disabled={busy} onClick={() => void onClick()} aria-label={label} title={label}>
      {children}
      <span className="command-label">{label}</span>
    </button>
  );
}

function TechniqueSummary({ techniqueId, shownCost }: { techniqueId: TechniqueId; shownCost?: number }) {
  const { locale, t, term } = useI18n();
  const technique = TECHNIQUE_DEFINITIONS[techniqueId];
  if (technique === undefined) return <span>{techniqueId}</span>;
  return (
    <span className="plain-technique-summary">
      <strong>{technique.id} · {locale === "zh-CN" ? technique.nameZh : technique.name}</strong>
      <small>{term(technique.discipline)} · {shownCost ?? technique.cost} {t("Coins")}</small>
      <span>{locale === "zh-CN" ? technique.abilityZh : technique.ability}</span>
    </span>
  );
}

function CommandButton({ busy, disabled = false, send, command, secondary = false, danger = false, children }: {
  busy: boolean;
  disabled?: boolean;
  send: SendCommand;
  command: AuthoritativeCommand;
  secondary?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return <button className={secondary ? "secondary-button" : danger ? "danger-button" : "primary-button"} type="button" disabled={busy || disabled} onClick={() => void send(command)}>{typeof children === "string" ? t(children) : children}</button>;
}

function ControlSection({ title, hint, children }: { title: string; hint: string; children?: ReactNode }) {
  const { t } = useI18n();
  return <section className="control-section"><h3>{t(title)}</h3><p className="control-hint">{t(hint)}</p>{children}</section>;
}

function Waiting({ game, actorId }: { game: PublicGameState; actorId: PlayerId }) {
  const { t } = useI18n();
  return <ControlSection title="Another workshop is deciding" hint="The table updates automatically."><div className="waiting-pot" aria-hidden="true">窑</div><p>{t("Waiting for")} <strong>{game.players[actorId]?.displayName}</strong>…</p></ControlSection>;
}

function ownCeramics(game: PublicGameState, playerId: PlayerId, stage: string) {
  return Object.values(game.ceramics).filter((ceramic) => ceramic.ownerId === playerId && ceramic.stage === stage);
}

function ownedAvailableTechniques(player: PublicPlayerState, allowed: TechniqueId[]): TechniqueId[] {
  return player.techniques.filter((technique) => !technique.exhausted && allowed.includes(technique.id)).map((technique) => technique.id);
}

function guildTechniqueCost(techniqueId: TechniqueId, workerKind: AvailableWorker["kind"]): number {
  const printedCost = TECHNIQUE_DEFINITIONS[techniqueId]?.cost ?? Number.POSITIVE_INFINITY;
  return workerKind === "shifu" ? Math.max(0, printedCost - 1) : printedCost;
}

function officeActionHint(action: OfficeActionChoice, workerKind: AvailableWorker["kind"] | undefined, locale: Locale = "en"): string {
  if (locale === "zh-CN") {
    switch (action) {
      case "take_one": return "承接1张公开委托（其右侧委托左移并在最右侧补牌），或不看牌面承接牌库顶1张委托（展示不动）。";
      case "take_up_to_two": return "逐张承接至多2张委托；完整结算第1张后，再从更新后的公开展示或牌库顶选择第2张。";
    }
  }
  switch (action) {
    case "take_one":
      return "Take one face-up Order (slide later cards left and refill right) or commit to a blind top-deck draw (display unchanged).";
    case "take_up_to_two":
      return "Take up to two Orders one at a time. Fully resolve the first, then choose the second from the updated display or blind top deck.";
  }
}

function localizeActionError(locale: Locale, error: string): string {
  if (locale === "en") return error;
  const errors: Record<string, string> = {
    "No Coins remain in the supply.": "供应区没有剩余铜钱。",
    "No Clay or Wood remains in the supply.": "供应区没有剩余的泥或柴。",
    "You do not have enough Clay to form a vessel.": "你没有足够的泥形成器物。",
    "You do not have enough Coins to apply a Decoration.": "你没有足够的铜钱施加装饰。",
    "No face-up Advanced Tech is available.": "没有可购入的公开进阶技艺。",
    "No face-up Advanced Tech is affordable.": "你没有足够的铜钱购入任何公开进阶技艺。",
    "Forming Studio is full.": "陶车坊已满。",
    "Potter's Wheel is full.": "陶车坊已满。",
    "Potter's Wheel is full for Apprentices.": "陶车坊的印刷工位已满；师傅仍可放置。",
    "Glaze Workshop is full.": "釉饰坊已满。",
    "Glaze & Decoration is full.": "釉饰坊已满。",
    "Glaze & Decoration is full for Apprentices.": "釉饰坊的印刷工位已满；师傅仍可放置。",
    "Kiln Yard is full.": "窑坊已满。",
    "Kiln Yard is full for Apprentices.": "窑坊已满。",
    "Commission Market is full.": "瓷牙行已满。",
    "Commission Market is full for Apprentices.": "瓷牙行的印刷工位已满；师傅仍可放置。",
    "Guild & Academy is full.": "陶工行已满。",
    "Guild & Academy is full for Apprentices.": "陶工行的印刷工位已满；只有师傅可以超容量放置。",
    "Choose an available worker.": "请选择1名可用工人。",
    "An Apprentice may form only one vessel.": "学徒只能成型1件器物。",
    "Ding's extra vessel must match a selected base Shape.": "定窑额外器物必须与所选基础器型相同。",
    "Choose a Ding vessel before substituting its Clay.": "请先选择定窑要额外成型的器物。",
    "Large Throwing Wheel requires a Vase or Censer.": "大陶车需要本次成型至少1个瓶或香炉。",
    "Measuring Calipers requires two different Shapes.": "量形规需要另有1件不同器型的已成型或已施釉器物。",
    "Drying Frames requires a Shape matching an Order in hand.": "晾坯架需要本次陶车坊行动成型的器物。",
    "You have no Shaped ceramic to glaze.": "你没有可施釉的已成型陶瓷。",
    "You have no Shaped vessel to glaze.": "你没有可施釉的已成型器物。",
    "White Slip must select a vessel formed by this action.": "白陶衣必须选择本次行动成型的1件器物。",
    "White Slip and Drying Frames must select different vessels.": "白陶衣和晾坯架必须选择不同器物。",
    "Reworking Table must change the first vessel to a different Shape.": "改坯案必须将第一件器物改为不同器型。",
    "Glaze Palette must choose one other Glazed ceramic.": "釉色板必须选择作坊中另一件未装窑的已施釉陶瓷。",
    "Only the Shifu may ignore a Decoration cost.": "只有师傅可以忽略装饰费用。",
    "Choose each ceramic only once.": "每件陶瓷只能选择一次。",
    "Carving Knives requires a paid Carved Decoration.": "刻花刀需要1次需付费的刻花装饰。",
    "Seal Stamps requires a paid Impressed Decoration.": "印花范需要1次需付费的印花装饰。",
    "You have no Glazed ceramic to load.": "你没有可入窑的已施釉陶瓷。",
    "The kiln has no empty space.": "窑内没有空窑位。",
    "No Shared or Imperial kiln destination is empty.": "共窑和御窑都没有可用空窑位。",
    "Select at least one Glazed ceramic to load.": "请至少选择1件已施釉陶瓷入窑。",
    "Select at least one Glazed ceramic and destination.": "请至少选择1件已施釉陶瓷及其窑位。",
    "An Apprentice may load at most one ceramic.": "学徒最多可将1件陶瓷入窑。",
    "Choose each kiln space only once.": "每个窑位只能选择一次。",
    "Choose each kiln destination only once.": "每个窑位只能选择一次。",
    "Kiln Furniture must select one High or Low Shared Kiln load.": "支烧窑具必须用于本次装入共窑高温区或低温区的1件陶瓷。",
    "Rapid Drying must choose a ceramic glazed now and an empty kiln destination.": "催干必须选择本次刚施釉的1件陶瓷及1个空置窑位。",
    "Rapid Drying requires 1 Wood.": "催干需要支付1柴。",
    "No Order source is available.": "没有可承接的委托来源。",
    "No face-up Technique is available.": "没有公开进阶技艺可用。",
    "No face-up Technique is affordable.": "没有买得起的公开进阶技艺。",
    "Materials Yard is full.": "泥柴场已满。",
    "Choose whole, non-negative resource amounts.": "请选择非负整数资源数量。",
    "The Shifu bonus costs 1 Coin.": "师傅的额外收益需要支付1铜钱。",
  };
  if (errors[error] !== undefined) return errors[error]!;
  if (error.startsWith("Your Order area is full")) {
    const limit = error.match(/\((\d+)\)/)?.[1] ?? "";
    return `你的委托区已满${limit === "" ? "" : `（上限${limit}张）`}。`;
  }
  if (error.includes("may glaze at most")) {
    const maximum = error.match(/at most (\d+)/)?.[1] ?? "1";
    return `所选工人／模式最多可为${maximum}件陶瓷施釉。`;
  }
  if (error.startsWith("You already own the maximum of")) {
    const maximum = error.match(/maximum of (\d+)/)?.[1] ?? String(GAME_CONFIG.techniques.maxOwned);
    return `你已拥有上限${maximum}个进阶技艺。`;
  }
  if (/^(Shifu|Apprentice) must take exactly \d+ total Clay and Wood\.$/.test(error)) {
    const worker = error.startsWith("Shifu") ? "师傅" : "学徒";
    const total = error.match(/exactly (\d+)/)?.[1] ?? "";
    return `${worker}必须恰好拿取共${total}份泥和／或柴。`;
  }
  if (error.startsWith("Prepared Clay requires ")) {
    const clay = error.match(/requires (\d+) Clay/)?.[1] ?? "";
    return `练泥结算时需要${clay}泥。`;
  }
  if (error.endsWith(" needs its matching Decoration.")) {
    return "所选技艺需要本次行动施加对应装饰。";
  }
  if (error.startsWith("Requires ")) return `资源不足：${error.slice(9).replaceAll("Clay", "泥").replaceAll("Wood", "柴").replaceAll("Coins", "铜钱").replaceAll("Coin", "铜钱")}`;
  return error;
}

export function ceramicLabel(ceramic: ReturnType<typeof ownCeramics>[number], locale: Locale = "en"): string {
  const decoration = "decoration" in ceramic ? ` · ${localizedTerm(locale, ceramic.glaze)} · ${localizedTerm(locale, ceramic.decoration)}` : "";
  const quality = "quality" in ceramic ? ` · ${localizedTerm(locale, ceramic.quality)}` : "";
  const kilnSpace = ceramic.stage === "loaded" ? ` · ${localizedTerm(locale, ceramic.kilnSpaceId)}` : "";
  return `${localizedTerm(locale, ceramic.shape)}${decoration}${quality}${kilnSpace}`;
}

function firingResultCeramicLabel(ceramic: ReturnType<typeof ownCeramics>[number], locale: Locale): string {
  const glazeAndDecoration = "decoration" in ceramic
    ? ` · ${localizedTerm(locale, ceramic.glaze)} · ${localizedTerm(locale, ceramic.decoration)}`
    : "";
  return `${localizedTerm(locale, ceramic.shape)}${glazeAndDecoration}`;
}

function ceramicOption(ceramic: ReturnType<typeof ownCeramics>[number], locale: Locale = "en") {
  return { value: ceramic.id, label: ceramicLabel(ceramic, locale) };
}

function required(data: FormData, name: string): string {
  const value = data.get(name);
  if (typeof value !== "string" || value === "") throw new Error(`Missing form field ${name}`);
  return value;
}
