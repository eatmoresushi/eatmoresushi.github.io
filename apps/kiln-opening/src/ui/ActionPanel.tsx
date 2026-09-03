import {
  CONTRIBUTION_CARDS,
  CONTRIBUTION_CARD_DEFINITIONS,
  JUN_ACTIVATION_WOOD,
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
  matchesOrder,
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

type SendCommand = (command: AuthoritativeCommand) => Promise<boolean>;

interface ActionPanelProps {
  game: PublicGameState;
  ownPlayerId: PlayerId;
  ownPendingContribution: PendingContribution | null;
  ownPrivateDecision?: PrivateDecisionState | undefined;
  busy: boolean;
  send: SendCommand;
}

export function ActionPanel({
  game,
  ownPlayerId,
  ownPendingContribution,
  ownPrivateDecision,
  busy,
  send,
}: ActionPanelProps) {
  const { locale, t } = useI18n();
  const player = game.players[ownPlayerId];
  if (player === undefined) return null;
  const decisionActor = currentDecisionActor(game.phase);

  return (
    <aside className="action-rail" aria-label={t("Game controls")}>
      <div className="action-heading">
        <p className="eyebrow">{t("Authoritative controls")}</p>
        <h2>{decisionActor === ownPlayerId || decisionActor === null ? t("Choose your action") : t("Waiting for another player")}</h2>
        <small>{t("Every command is validated by the server before state changes.")}</small>
      </div>
      <PhaseControls
        game={game}
        player={player}
        ownPlayerId={ownPlayerId}
        ownPendingContribution={ownPendingContribution}
        ownPrivateDecision={ownPrivateDecision}
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
  if (waiting) return <Waiting game={game} actorId={decisionActor} />;

  switch (phase.type) {
    case "setup_kiln_selection":
      return <KilnSelection game={game} busy={busy} send={send} />;
    case "setup_starting_orders": {
      return <StartingOrdersControls orderIds={ownPrivateDecision?.startingOrderIds ?? []} busy={busy} send={send} />;
    }
    case "setup_starting_tech":
      return <StartingTechControls busy={busy} send={send} />;
    case "work":
      return <WorkControls game={game} player={player} busy={busy} send={send} />;
    case "work_office_orders":
      return <OfficeControls game={game} player={player} privateDecision={ownPrivateDecision} busy={busy} send={send} />;
    case "work_commission_advance":
      return <CommissionAdvanceControls busy={busy} send={send} />;
    case "work_guild":
      return <GuildControls game={game} player={player} privateDecision={ownPrivateDecision} busy={busy} send={send} />;
    case "firing_before_contribution":
      if (phase.techniqueIds[phase.queue.currentIndex] === "T13") {
        return <BinaryDecision title="Test Pieces" hint="Pay 1 Wood to privately look at the top Fire card, then return it to the top of the deck." action="RESOLVE_TEST_PIECES" busy={busy} send={send} />;
      }
      return <Waiting game={game} actorId={decisionActor ?? ownPlayerId} />;
    case "firing_reposition":
      return <KilnRepositionControls game={game} player={player} busy={busy} send={send} />;
    case "firing_before_quality":
      return <KilnAbilityControls game={game} player={player} busy={busy} send={send} />;
    case "firing_after_quality":
      return phase.techniqueIds[phase.queue.currentIndex] === "T14"
        ? <SecondFiringControls game={game} player={player} busy={busy} send={send} />
        : <SaggarsControls game={game} player={player} busy={busy} send={send} />;
    case "firing_workshop_seconds":
      return <WorkshopSecondsControls game={game} player={player} busy={busy} send={send} />;
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
      hint={locale === "zh-CN" ? "选择1项起始技术。起始技术不计入2项高级技术上限。" : "Choose one Starting Tech. It does not count toward the two-Advanced-Tech limit."}
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
      hint={locale === "zh-CN" ? "预留订单后，选择获得1黏土、1柴薪或1铜钱。师傅本次行动也只获得1份预付款。" : "After reserving Orders, gain 1 Clay, 1 Wood, or 1 Coin. A Shifu gains only one advance for the action."}
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

function WorkControls({ game, player, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  busy: boolean;
  send: SendCommand;
}) {
  const { t, term } = useI18n();
  const availableWorkers = Object.values(player.workers).filter((worker) => worker.status === "available");
  const workers = availableWorkers;
  const locationUse = (locationId: LocationId): number =>
    locationId === "forming_studio" || locationId === "glaze_workshop"
      ? Object.values(player.workers).filter((worker) => worker.locationId === locationId).length
      : game.actionBoard.placements[locationId].length;
  const locationLimit = (locationId: LocationId): number =>
    locationId === "forming_studio"
      ? player.workshopSpaces.pottersWheelUnlocked
      : locationId === "glaze_workshop"
        ? player.workshopSpaces.glazeDecorationUnlocked
        : locationCapacity(locationId, game.playerCount);
  const full = (locationId: LocationId): boolean => locationUse(locationId) >= locationLimit(locationId);
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
    <details className={`action-card ${full(locationId) ? "is-unavailable" : ""}`} open={locationId === "materials_yard"} key={locationId}>
      <summary><span>{term(locationId)}</span><small>{used}/{capacityLabel} {t("workers")} · <span>{full(locationId) ? t("Full") : t(hint)}</span></small></summary>
      {content}
    </details>
    );
  };
  const actions: Partial<Record<LocationId, ReactNode>> = {
    labour: action("labour", "Send workers to Labour", <LabourForm workers={workers} busy={busy} send={send} />),
    materials_yard: action("materials_yard", "Gain Clay and Wood", <MaterialsForm game={game} player={player} workers={workers} locationFull={full("materials_yard")} busy={busy} send={send} />),
    forming_studio: action("forming_studio", "Shape vessels", <FormCeramicsForm game={game} player={player} workers={workers} locationFull={full("forming_studio")} busy={busy} send={send} />),
    glaze_workshop: action("glaze_workshop", "Glaze and decorate", <GlazeForm game={game} player={player} workers={workers} locationFull={full("glaze_workshop")} busy={busy} send={send} />),
    kiln_yard: action("kiln_yard", "Load ceramics", <KilnYardForm game={game} player={player} workers={workers} locationFull={full("kiln_yard")} busy={busy} send={send} />),
    market_imperial_office: action("market_imperial_office", "Take Orders", <OfficeActionForms game={game} player={player} workers={workers} locationFull={full("market_imperial_office")} busy={busy} send={send} />),
    guild_academy: action("guild_academy", "Apprentice or Shifu", <GuildBeginForm game={game} player={player} workers={workers} locationFull={full("guild_academy")} busy={busy} send={send} />),
  };
  return (
    <>
      <p className="turn-callout"><strong>{t("Your turn.")}</strong> {t("Place one available worker, or pass permanently for this round.")}</p>
      {LOCATION_IDS.map((locationId) => actions[locationId])}
      <CommandButton busy={busy} send={send} command={{ type: "PASS_WORK_PHASE" }} danger>
        Pass for this round
      </CommandButton>
    </>
  );
}

type AvailableWorker = PublicPlayerState["workers"][string];

interface WorkerFormProps {
  workers: AvailableWorker[];
  locationFull: boolean;
  busy: boolean;
  send: SendCommand;
}

/** Labour has no worker limit, so it never shows a "location full" state. */
function LabourForm({ workers, busy, send }: {
  workers: Array<{ id: string; kind: "shifu" | "apprentice" }>;
  busy: boolean;
  send: SendCommand;
}) {
  const { locale, t } = useI18n();
  const [workerId, setWorkerId] = useState(workers[0]?.id ?? "");
  const selected = workers.find((worker) => worker.id === workerId) ?? workers[0];
  if (selected === undefined) return <p className="control-hint">{t("No available workers.")}</p>;
  const coins = selected.kind === "shifu" ? 4 : 2;
  return (
    <form
      className="control-form"
      onSubmit={(event) => { event.preventDefault(); void send({ type: "USE_LABOUR", workerId: selected.id }); }}
    >
      <label className="field">
        <span className="field-label">{t("Worker")}</span>
        <select value={selected.id} onChange={(event) => setWorkerId(event.target.value)}>
          {workers.map((worker) => (
            <option key={worker.id} value={worker.id}>{worker.id}</option>
          ))}
        </select>
      </label>
      <p className="control-hint">{locale === "zh-CN"
        ? `获得${coins}铜钱。佣工没有工人数量限制，始终可用。`
        : `Gain ${coins} Coins. Labour has no worker limit, so it is always available.`}</p>
      <button type="submit" disabled={busy}>{t("Send to Labour")}</button>
    </form>
  );
}

function MaterialsForm({ game, player, workers, locationFull, busy, send }: WorkerFormProps & { game: PublicGameState; player: PublicPlayerState }) {
  const { locale, t, term } = useI18n();
  const [workerId, setWorkerId] = useState(workers[0]?.id ?? "");
  const [clay, setClay] = useState(workers[0]?.kind === "shifu" ? 3 : 2);
  const [wood, setWood] = useState(1);
  const [buyShifuBonus, setBuyShifuBonus] = useState(false);
  const [preparedClayShape, setPreparedClayShape] = useState<Shape | "">("");
  const selectedWorker = workers.find((worker) => worker.id === workerId) ?? workers[0];
  const requiredTotal = selectedWorker?.kind === "shifu" ? 4 : 3;
  const invalidAmount = !Number.isInteger(clay) || !Number.isInteger(wood) || clay < 0 || wood < 0;
  const wrongTotal = !invalidAmount && clay + wood !== requiredTotal;
  const activeBonus = selectedWorker?.kind === "shifu" && buyShifuBonus;
  const preparedCost = preparedClayShape === "" ? 0 : SHAPE_COSTS[preparedClayShape];
  const projectedClay = player.resources.clay + Math.min(clay, game.commonSupply.clay) + (activeBonus ? Math.min(1, Math.max(0, game.commonSupply.clay - clay)) : 0);
  const error = locationFull
    ? "Materials Yard is full."
    : invalidAmount
      ? "Choose whole, non-negative resource amounts."
      : wrongTotal
      ? `${selectedWorker?.kind === "shifu" ? "Shifu" : "Apprentice"} must take exactly ${requiredTotal} total Clay and Wood.`
      : activeBonus && player.resources.coins < 1
        ? "The Shifu bonus costs 1 Coin."
      : preparedClayShape !== "" && projectedClay < preparedCost
        ? `Prepared Clay requires ${preparedCost} Clay after the Materials gain.`
      : preparedClayShape !== "" && game.vesselSupplyCounts[preparedClayShape] < 1
        ? "That Vessel supply is empty."
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
  return (
    <form className="control-form" onSubmit={submit}>
      <label>
        {t("Worker")}
        <select name="worker" value={selectedWorker?.id ?? ""} onChange={(event) => chooseWorker(event.target.value)} required>
          {workers.map((worker) => (
            <option key={worker.id} value={worker.id}>
              {term(worker.kind)} · {worker.id}
            </option>
          ))}
        </select>
      </label>
      <div className="split-fields">
        <label>{t("Clay")}<input type="number" name="clay" min={0} max={requiredTotal} step={1} value={clay} onChange={(event) => setClay(Number.isNaN(event.target.valueAsNumber) ? 0 : event.target.valueAsNumber)} required /></label>
        <label>{t("Wood")}<input type="number" name="wood" min={0} max={requiredTotal} step={1} value={wood} onChange={(event) => setWood(Number.isNaN(event.target.valueAsNumber) ? 0 : event.target.valueAsNumber)} required /></label>
      </div>
      {selectedWorker?.kind === "shifu" && <label className="check-row"><input type="checkbox" checked={buyShifuBonus} onChange={(event) => setBuyShifuBonus(event.target.checked)} />{locale === "zh-CN" ? "支付1铜钱，额外获得1黏土和1柴薪" : "Pay 1 Coin for +1 Clay and +1 Wood"}</label>}
      {player.startingTechniqueId === "ST01" && <label>{locale === "zh-CN" ? "备泥：额外成型" : "Prepared Clay: form after gathering"}<select value={preparedClayShape} onChange={(event) => setPreparedClayShape(event.target.value as Shape | "")}><option value="">{t("Do not use")}</option>{SHAPES.map((shape) => <option key={shape} value={shape}>{term(shape)} · {SHAPE_COSTS[shape]} {t("Clay")}</option>)}</select></label>}
      <small role="status" className={error === null ? "" : "control-error"}>
        {error === null
          ? locale === "zh-CN" ? `${clay}陶土 + ${wood}柴薪 = ${requiredTotal}份资源。` : `${clay} Clay + ${wood} Wood = ${requiredTotal} resources.`
          : locale === "zh-CN" ? (locationFull ? "备料场已满。" : invalidAmount ? "请选择非负整数资源数量。" : `${term(selectedWorker?.kind ?? "apprentice")}必须恰好拿取${requiredTotal}份陶土与柴薪。`) : error}
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
  const [workerId, setWorkerId] = useState(workers[0]?.id ?? "");
  const [shape1, setShape1] = useState<Shape>(SHAPES[0]!);
  const [shape2, setShape2] = useState<Shape | "">("");
  const [selectedTechniques, setSelectedTechniques] = useState<TechniqueId[]>([]);
  const [dryingGlaze, setDryingGlaze] = useState<Glaze>(GLAZES[0]!);
  const [whiteSlipIndex, setWhiteSlipIndex] = useState<"" | "0" | "1">("");
  const [whiteSlipDecoration, setWhiteSlipDecoration] = useState<Decoration>("plain");
  const [ding, setDing] = useState<Shape | "">("");
  const selectedWorker = workers.find((worker) => worker.id === workerId) ?? workers[0];
  const activeTechniqueIds = selectedTechniques.filter((techniqueId) => techniques.includes(techniqueId));
  const canUseDing = player.kilnId === "DI" && !player.kilnAbilityUsedThisRound;
  const activeDing = canUseDing ? ding : "";
  const shapes = [shape1, shape2].filter((shape): shape is Shape => shape !== "");
  const allShapes = activeDing === "" ? shapes : [...shapes, activeDing];
  const formingClayCost = (shape: Shape): number => SHAPE_COSTS[shape];
  const baseClayCost = allShapes.reduce((total, shape) => total + SHAPE_COSTS[shape], 0);
  const shifuDiscount = selectedWorker?.kind === "shifu" && shapes.length === 2 ? 1 : 0;
  const wheelDiscount = activeTechniqueIds.includes("T01") ? 1 : 0;
  const clayCost = baseClayCost - shifuDiscount - wheelDiscount;
  const whiteSlip = whiteSlipIndex === "" ? undefined : { formedIndex: Number(whiteSlipIndex), decoration: whiteSlipDecoration };
  const formingCoins = (activeTechniqueIds.includes("T04") ? DECORATION_COSTS.plain : 0) + (whiteSlip === undefined ? 0 : DECORATION_COSTS[whiteSlipDecoration]);

  function validationError(): string | null {
    if (locationFull) return "Forming Studio is full.";
    if (selectedWorker === undefined) return "Choose an available worker.";
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
    const required = new Map<Shape, number>();
    for (const shape of allShapes) required.set(shape, (required.get(shape) ?? 0) + 1);
    for (const [shape, count] of required) {
      if (game.vesselSupplyCounts[shape] < count) return locale === "zh-CN" ? `剩余${term(shape)}器物不足。` : `Not enough ${term(shape)} vessels remain.`;
    }
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
    if (activeTechniqueIds.includes("T04")) command.dryingFrames = { formedIndex: 0, glaze: dryingGlaze };
    if (whiteSlip !== undefined) command.whiteSlip = whiteSlip;
    if (activeDing !== "") command.dingExtraShape = activeDing;
    void send(command);
  }
  return (
    <form className="control-form" onSubmit={submit}>
      <WorkerChoice workers={workers} value={selectedWorker?.id ?? ""} onChange={setWorkerId} />
      <label>{t("First shape")}<select name="shape1" value={shape1} onChange={(event) => setShape1(event.target.value as Shape)}>{SHAPES.map((shape) => <option key={shape} value={shape}>{term(shape)} · {formingClayCost(shape)} {t("Clay")}</option>)}</select></label>
      <label>{t("Second shape (Shifu only)")}<select name="shape2" value={shape2} onChange={(event) => setShape2(event.target.value as Shape | "")}><option value="">{t("None")}</option>{SHAPES.map((shape) => <option key={shape} value={shape}>{term(shape)} · {formingClayCost(shape)} {t("Clay")}</option>)}</select></label>
      <TechniqueChecks techniqueIds={techniques} selected={activeTechniqueIds} onChange={setSelectedTechniques} />
      {activeTechniqueIds.includes("T04") && <EnumChoice name="drying-glaze" label="Drying Frames glaze for first formed vessel" options={GLAZES} value={dryingGlaze} onChange={(value) => setDryingGlaze(value as Glaze)} />}
      {player.startingTechniqueId === "ST02" && <><label>{locale === "zh-CN" ? "白化妆土：选择本次成型器物" : "White Slip: choose a vessel formed now"}<select value={whiteSlipIndex} onChange={(event) => setWhiteSlipIndex(event.target.value as "" | "0" | "1")}><option value="">{t("Do not use")}</option>{shapes.map((shape, index) => <option key={index} value={index}>{index + 1} · {term(shape)}</option>)}</select></label>{whiteSlipIndex !== "" && <EnumChoice name="white-slip-decoration" label="White Slip Decoration" options={DECORATIONS} value={whiteSlipDecoration} onChange={(value) => setWhiteSlipDecoration(value as Decoration)} formatOption={(option) => decorationOptionLabel(option, locale)} />}</>}
      {canUseDing && <label>{t("Ding extra matching shape")}<select name="ding" value={activeDing} onChange={(event) => setDing(event.target.value as Shape | "")}><option value="">{t("Do not use")}</option>{(["bowl", "plate", "washer"] as Shape[]).map((shape) => <option key={shape} value={shape}>{term(shape)} · {formingClayCost(shape)} {t("Clay")}</option>)}</select></label>}
      <small role="status" className={error === null ? "" : "control-error"}>{error === null ? (locale === "zh-CN" ? `费用：${clayCost}黏土、${formingCoins}铜钱。` : `Cost: ${clayCost} Clay and ${formingCoins} Coins.`) : localizeActionError(locale, error)}</small>
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
  const [workerId, setWorkerId] = useState(workers[0]?.id ?? "");
  const [ceramic1, setCeramic1] = useState(ceramics[0]?.id ?? "");
  const [glaze1, setGlaze1] = useState<Glaze>(GLAZES[0]!);
  const [decoration1, setDecoration1] = useState<Decoration>(DECORATIONS[0]!);
  const [ceramic2, setCeramic2] = useState("");
  const [glaze2, setGlaze2] = useState<Glaze>(GLAZES[0]!);
  const [decoration2, setDecoration2] = useState<Decoration>(DECORATIONS[0]!);
  const [freeFirstDecoration, setFreeFirstDecoration] = useState(false);
  const [selectedTechniques, setSelectedTechniques] = useState<TechniqueId[]>([]);
  const [reworkedShape, setReworkedShape] = useState<Shape | "">("");
  const [paletteTargetId, setPaletteTargetId] = useState("");
  const [paletteGlaze, setPaletteGlaze] = useState<Glaze>(GLAZES[0]!);
  const [rapidDryingId, setRapidDryingId] = useState("");
  const [rapidDestination, setRapidDestination] = useState<KilnSpaceId | "imperial" | "">("");
  const selectedWorker = workers.find((worker) => worker.id === workerId) ?? workers[0];
  const firstId = ceramics.some((ceramic) => ceramic.id === ceramic1) ? ceramic1 : ceramics[0]?.id ?? "";
  const secondId = ceramics.some((ceramic) => ceramic.id === ceramic2) ? ceramic2 : "";
  const firstCeramic = ceramics.find((ceramic) => ceramic.id === firstId);
  const activeTechniqueIds = selectedTechniques.filter((techniqueId) => techniques.includes(techniqueId));
  const selections = [
    ...(firstId === "" ? [] : [{ ceramicId: firstId, glaze: glaze1, decoration: decoration1, ...(activeTechniqueIds.includes("T05") && reworkedShape !== "" ? { newShape: reworkedShape } : {}) }]),
    ...(secondId === "" ? [] : [{ ceramicId: secondId, glaze: glaze2, decoration: decoration2 }]),
  ];
  const freeDecorationCeramicId = selectedWorker?.kind === "shifu" && freeFirstDecoration ? firstId : undefined;
  const occupiedShared = new Set(Object.values(game.ceramics).filter((ceramic) => ceramic.stage === "loaded" && ceramic.kilnSpaceId !== "imperial").map((ceramic) => ceramic.stage === "loaded" ? ceramic.kilnSpaceId : ""));
  const rapidDestinations: Array<KilnSpaceId | "imperial"> = activeKilnSpaceIds(game.playerCount).filter((space) => !occupiedShared.has(space));
  const imperialOccupied = Object.values(game.ceramics).some((ceramic) => ceramic.stage === "loaded" && ceramic.ownerId === player.id && ceramic.kilnSpaceId === "imperial");
  if (player.imperialKilnUnlocked && !imperialOccupied) rapidDestinations.push("imperial");
  const addedClay = firstCeramic?.stage === "shaped" && activeTechniqueIds.includes("T05") && reworkedShape !== ""
    ? Math.max(0, SHAPE_COSTS[reworkedShape] - SHAPE_COSTS[firstCeramic.shape])
    : 0;
  const totalCoins = selections.reduce((total, selection) => {
    const freeByTechnique = (selection.decoration === "carved" && activeTechniqueIds.includes("T07"))
      || (selection.decoration === "impressed" && activeTechniqueIds.includes("T08"))
      || (selection.decoration === "crackle" && activeTechniqueIds.includes("T09"));
    return total + (selection.ceramicId === freeDecorationCeramicId || freeByTechnique ? 0 : DECORATION_COSTS[selection.decoration]);
  }, 0);

  function validationError(): string | null {
    if (locationFull) return "Glaze Workshop is full.";
    if (selectedWorker === undefined) return "Choose an available worker.";
    if (selections.length === 0) return "You have no Shaped vessel to glaze.";
    if (selections.length > (selectedWorker.kind === "shifu" ? 2 : 1)) return "An Apprentice may glaze only one ceramic.";
    if (secondId !== "" && secondId === firstId) return "Choose each ceramic only once.";
    if (activeTechniqueIds.includes("T05")) {
      if (firstCeramic?.stage !== "shaped" || reworkedShape === "" || reworkedShape === firstCeramic.shape) return "Reworking Table must change the first vessel to a different Shape.";
      if (game.vesselSupplyCounts[reworkedShape] < 1) return "The reworked Vessel supply is empty.";
    }
    if (activeTechniqueIds.includes("T06") && !paletteTargets.some((ceramic) => ceramic.id === paletteTargetId)) return "Glaze Palette must choose one other Glazed ceramic.";
    for (const [techniqueId, decoration] of [["T07", "carved"], ["T08", "impressed"], ["T09", "crackle"]] as const) {
      if (activeTechniqueIds.includes(techniqueId) && !selections.some((selection) => selection.decoration === decoration)) return `${TECHNIQUE_DEFINITIONS[techniqueId]?.name ?? techniqueId} needs its matching Decoration.`;
    }
    if (rapidDryingId !== "" && (!selections.some((selection) => selection.ceramicId === rapidDryingId) || rapidDestination === "")) return "Rapid Drying must choose a ceramic glazed now and an empty kiln destination.";
    if (player.resources.wood < (rapidDryingId === "" ? 0 : 1)) return "Rapid Drying requires 1 Wood.";
    if (player.resources.coins < totalCoins || player.resources.clay < addedClay) return `Requires ${totalCoins} Coins and ${addedClay} added Clay.`;
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
  return (
    <form className="control-form" onSubmit={submit}>
      <WorkerChoice workers={workers} value={selectedWorker?.id ?? ""} onChange={setWorkerId} />
      <CeramicChoice name="ceramic1" label="First ceramic" ceramics={ceramics} value={firstId} onChange={setCeramic1} />
      <EnumChoice name="glaze1" label="First glaze" options={GLAZES} value={glaze1} onChange={(value) => setGlaze1(value as Glaze)} />
      <EnumChoice name="decoration1" label="First decoration" options={DECORATIONS} value={decoration1} onChange={(value) => setDecoration1(value as Decoration)} formatOption={(option) => decorationOptionLabel(option, locale)} />
      <CeramicChoice name="ceramic2" label="Second ceramic (Shifu only)" ceramics={ceramics} value={secondId} onChange={setCeramic2} blank="None" />
      {secondId !== "" && <><EnumChoice name="glaze2" label="Second glaze" options={GLAZES} value={glaze2} onChange={(value) => setGlaze2(value as Glaze)} /><EnumChoice name="decoration2" label="Second decoration" options={DECORATIONS} value={decoration2} onChange={(value) => setDecoration2(value as Decoration)} formatOption={(option) => decorationOptionLabel(option, locale)} /></>}
      {selectedWorker?.kind === "shifu" && <label className="check-row"><input type="checkbox" checked={freeFirstDecoration} onChange={(event) => setFreeFirstDecoration(event.target.checked)} />{locale === "zh-CN" ? "师傅：第1件陶瓷的装饰免费" : "Shifu: make the first ceramic's Decoration free"}</label>}
      <TechniqueChecks techniqueIds={techniques} selected={activeTechniqueIds} onChange={setSelectedTechniques} />
      {activeTechniqueIds.includes("T05") && <label>{locale === "zh-CN" ? "改坯台：新器形" : "Reworking Table: new Shape"}<select value={reworkedShape} onChange={(event) => setReworkedShape(event.target.value as Shape | "")}><option value="">{t("Choose a Shape")}</option>{SHAPES.filter((shape) => shape !== firstCeramic?.shape).map((shape) => <option key={shape} value={shape}>{term(shape)} · {Math.max(0, SHAPE_COSTS[shape] - SHAPE_COSTS[firstCeramic?.shape ?? shape])} {t("Clay")}</option>)}</select></label>}
      {activeTechniqueIds.includes("T06") && <><CeramicChoice name="palette-target" label="Glaze Palette target" ceramics={paletteTargets} value={paletteTargetId} onChange={setPaletteTargetId} blank="Choose a ceramic" /><EnumChoice name="palette-glaze" label="New Glaze" options={GLAZES} value={paletteGlaze} onChange={(value) => setPaletteGlaze(value as Glaze)} /></>}
      {player.startingTechniqueId === "ST03" && <><label>{locale === "zh-CN" ? "速干：立即装窑" : "Rapid Drying: load immediately"}<select value={rapidDryingId} onChange={(event) => setRapidDryingId(event.target.value)}><option value="">{t("Do not use")}</option>{selections.map((selection) => <option key={selection.ceramicId} value={selection.ceramicId}>{selection.ceramicId}</option>)}</select></label>{rapidDryingId !== "" && <EnumChoice name="rapid-destination" label="Rapid Drying destination" options={rapidDestinations} value={rapidDestination} onChange={(value) => setRapidDestination(value as KilnSpaceId | "imperial")} />}</>}
      <small role="status" className={error === null ? "" : "control-error"}>{error === null ? (locale === "zh-CN" ? `费用：${totalCoins}铜钱、${addedClay}额外黏土。` : `Cost: ${totalCoins} Coins and ${addedClay} added Clay.`) : localizeActionError(locale, error)}</small>
      <button className="primary-button" disabled={busy || error !== null}>{t("Apply glaze")}</button>
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
  const { locale, t } = useI18n();
  const ceramics = ownCeramics(game, player.id, "glazed");
  const occupiedShared = new Set(Object.values(game.ceramics).filter((ceramic) => ceramic.stage === "loaded" && ceramic.kilnSpaceId !== "imperial").map((ceramic) => ceramic.stage === "loaded" ? ceramic.kilnSpaceId : ""));
  const destinations: Array<KilnSpaceId | "imperial"> = activeKilnSpaceIds(game.playerCount).filter((space) => !occupiedShared.has(space));
  const imperialOccupied = Object.values(game.ceramics).some((ceramic) => ceramic.stage === "loaded" && ceramic.ownerId === player.id && ceramic.kilnSpaceId === "imperial");
  if (player.imperialKilnUnlocked && !imperialOccupied) destinations.push("imperial");
  const [workerId, setWorkerId] = useState(workers[0]?.id ?? "");
  const [ceramicIds, setCeramicIds] = useState(["", "", ""]);
  const [kilnSpaces, setKilnSpaces] = useState<Array<KilnSpaceId | "imperial" | "">>(["", "", ""]);
  const [usePriority, setUsePriority] = useState(false);
  const [furnitureIndex, setFurnitureIndex] = useState<"" | "0" | "1" | "2">("");
  const [tendingClay, setTendingClay] = useState(1);
  const selectedWorker = workers.find((worker) => worker.id === workerId) ?? workers[0];
  const maximumNormal = selectedWorker?.kind === "shifu" ? 2 : 1;
  const maximumLoads = maximumNormal + (usePriority ? 1 : 0);
  const loads = ceramicIds.slice(0, maximumLoads).flatMap((ceramicId, index) => {
    const kilnSpaceId = kilnSpaces[index];
    if (!ceramics.some((ceramic) => ceramic.id === ceramicId) || kilnSpaceId === undefined || kilnSpaceId === "" || !destinations.includes(kilnSpaceId)) return [];
    return [{ ceramicId, kilnSpaceId, ...(furnitureIndex === String(index) ? { useKilnFurniture: true } : {}) }];
  });
  const ownsFurniture = player.techniques.some((technique) => technique.id === "T15" && !technique.exhausted);

  function setCeramic(index: number, value: string): void {
    setCeramicIds((current) => current.map((entry, entryIndex) => entryIndex === index ? value : entry));
  }
  function setDestination(index: number, value: string): void {
    setKilnSpaces((current) => current.map((entry, entryIndex) => entryIndex === index ? value as KilnSpaceId | "imperial" | "" : entry));
  }
  function validationError(): string | null {
    if (locationFull) return "Kiln Yard is full.";
    if (selectedWorker === undefined) return "Choose an available worker.";
    if (ceramics.length === 0) return "You have no Glazed ceramic to load.";
    if (destinations.length === 0) return "No Shared or Imperial kiln destination is empty.";
    if (loads.length < 1) return "Select at least one Glazed ceramic and destination.";
    if (new Set(loads.map((load) => load.ceramicId)).size !== loads.length) return "Choose each ceramic only once.";
    if (new Set(loads.map((load) => load.kilnSpaceId)).size !== loads.length) return "Choose each kiln destination only once.";
    if (usePriority && (loads.length < 2 || loads[loads.length - 1]?.kilnSpaceId !== "imperial")) return "Imperial Priority's additional final load must enter your empty Imperial Kiln.";
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
      ...(usePriority ? { useImperialPriority: true } : {}),
      ...(player.startingTechniqueId === "ST04" ? { kilnTendingClay: tendingClay, kilnTendingWood: 2 - tendingClay } : {}),
    });
  }
  return (
    <form className="control-form" onSubmit={submit}>
      <WorkerChoice workers={workers} value={selectedWorker?.id ?? ""} onChange={setWorkerId} />
      {Array.from({ length: maximumLoads }, (_, index) => (
        <div className="split-fields" key={index}>
          <CeramicChoice name={`ceramic${index + 1}`} label={index === maximumLoads - 1 && usePriority ? "Imperial Priority ceramic" : `Ceramic ${index + 1}`} ceramics={ceramics} value={ceramicIds[index] ?? ""} onChange={(value) => setCeramic(index, value)} blank={index === 0 ? "Choose a ceramic" : "None"} />
          <EnumChoice name={`space${index + 1}`} label={index === maximumLoads - 1 && usePriority ? "Imperial Kiln" : `Kiln destination ${index + 1}`} options={index === maximumLoads - 1 && usePriority ? ["imperial"] : destinations} value={index === maximumLoads - 1 && usePriority ? "imperial" : kilnSpaces[index] ?? ""} onChange={(value) => setDestination(index, value)} />
        </div>
      ))}
      {player.imperialPriorityAvailable && <label className="check-row"><input type="checkbox" checked={usePriority} onChange={(event) => { setUsePriority(event.target.checked); if (event.target.checked) setDestination(maximumNormal, "imperial"); }} />{locale === "zh-CN" ? "使用御用优先：额外将1件陶瓷装入空置御窑（每局一次）" : "Use Imperial Priority: load 1 additional ceramic into the empty Imperial Kiln (once per game)"}</label>}
      {ownsFurniture && <label>{locale === "zh-CN" ? "窑具：将1件高位或低位器物的窑位调整视为0" : "Kiln Furniture: treat one High/Low load as zone 0"}<select value={furnitureIndex} onChange={(event) => setFurnitureIndex(event.target.value as "" | "0" | "1" | "2")}><option value="">{t("Do not use")}</option>{loads.map((load, index) => <option key={index} value={index}>{index + 1} · {load.ceramicId} · {load.kilnSpaceId}</option>)}</select></label>}
      {player.startingTechniqueId === "ST04" && <label>{locale === "zh-CN" ? "理窑：获得黏土（其余为柴薪，共2份）" : "Kiln Tending: Clay gained (the rest is Wood, 2 total)"}<input type="number" min={0} max={2} step={1} value={tendingClay} onChange={(event) => setTendingClay(Math.max(0, Math.min(2, event.target.valueAsNumber || 0)))} /></label>}
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
  const [workerId, setWorkerId] = useState(workers[0]?.id ?? "");
  const [officeAction, setOfficeAction] = useState<OfficeActionChoice>("take_one");
  const selectedWorker = workers.find((worker) => worker.id === workerId) ?? workers[0];
  const orderModes: OfficeActionChoice[] = selectedWorker?.kind === "shifu"
    ? ["take_up_to_two"]
    : ["take_one"];
  const action = orderModes.includes(officeAction) ? officeAction : orderModes[0]!;
  const orderSourceCount = game.displays.market.length;

  function validationError(): string | null {
    if (locationFull) return "Commission Market is full.";
    if (selectedWorker === undefined) return "Choose an available worker.";
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
  return (
    <form className="control-form" onSubmit={submit}>
      <p className="control-hint"><strong>{t("Apprentice:")}</strong> {locale === "zh-CN" ? "预留1张主订单：可取1张正面订单（立即补牌），或不看牌面直接取牌堆顶。然后获得1份预留预付款。" : "Reserve 1 Main Order: either a face-up Order, refilling immediately, or the top card of the deck without looking. Then gain one reservation advance."}</p>
      <p className="control-hint"><strong>{t("Shifu:")}</strong> {locale === "zh-CN" ? "预留至多2张主订单，每次预留分别结算；本次行动总共获得1份预留预付款。" : "Reserve up to 2 Main Orders, resolving each reservation separately; gain one reservation advance total."}</p>
      <WorkerChoice workers={workers} value={selectedWorker?.id ?? ""} onChange={setWorkerId} />
      <EnumChoice name="officeAction" label="Office action" options={orderModes} value={action} onChange={(value) => setOfficeAction(value as OfficeActionChoice)} formatOption={(value) => officeActionLabel(value as OfficeActionChoice, locale)} />
      <small role="status" className={error === null ? "" : "control-error"}>{error === null ? officeActionHint(action, selectedWorker?.kind, locale) : localizeActionError(locale, error)}</small>
      <button className="primary-button" disabled={busy || error !== null}>{t("Visit the Office")}</button>
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
  const [workerId, setWorkerId] = useState(workers[0]?.id ?? "");
  const worker = workers.find((candidate) => candidate.id === workerId) ?? workers[0];
  const displayed = Object.values(game.displays.techniques).flat();
  const affordable = worker === undefined ? [] : displayed.filter((techniqueId) =>
    guildTechniqueCost(techniqueId, worker.kind) <= player.resources.coins,
  );
  const error = locationFull
    ? "Guild & Academy is full."
    : worker === undefined
      ? "Choose an available worker."
      : player.techniques.length >= GAME_CONFIG.techniques.maxOwned
      ? `You already own the maximum of ${GAME_CONFIG.techniques.maxOwned} Techniques.`
      : displayed.length === 0
        ? "No face-up Technique is available."
        : affordable.length === 0
          ? "No face-up Technique is affordable."
          : null;
  return (
    <form className="control-form" onSubmit={(event) => {
      event.preventDefault();
      if (error === null && worker !== undefined) void send({ type: "BEGIN_GUILD_ACTION", workerId: worker.id });
    }}>
      <WorkerChoice workers={workers} value={worker?.id ?? ""} onChange={setWorkerId} />
      <p className="control-hint"><strong>{t("Apprentice:")}</strong> {t("pay printed cost.")} <strong>{t("Shifu:")}</strong> {t("may refresh one tile, then pays 1 Coin less (minimum 0).")}</p>
      <small role="status" className={error === null ? "" : "control-error"}>{error === null ? (locale === "zh-CN" ? `有${affordable.length}块买得起的正面技术。` : `${affordable.length} affordable face-up Technique${affordable.length === 1 ? "" : "s"}.`) : localizeActionError(locale, error)}</small>
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
  if (phase.step === "colour_samples_or_skip") {
    return (
      <ControlSection title="Use Colour Samples?" hint="Privately look at the top 3 Main Orders. Reserve 1 of them instead of a face-up Order, then put the other 2 on the bottom.">
        <div className="button-row"><CommandButton busy={busy} send={send} command={{ type: "OFFICE_USE_COLOUR_SAMPLES", deck: "market" }}>Look at the top 3</CommandButton></div>
        <CommandButton busy={busy} send={send} command={{ type: "OFFICE_SKIP_COLOUR_SAMPLES" }} secondary>Skip Colour Samples</CommandButton>
      </ControlSection>
    );
  }
  if (phase.step === "colour_samples_choose") {
    const choices = privateDecision?.colourSamplesOrderIds ?? [];
    const hint = locale === "zh-CN"
      ? "只有你能看到所查看的3张主订单。选择预留其中1张，其余2张按当前顺序置于牌堆底。"
      : "Only you can see the three looked-at Main Orders. Reserve one; the other two go to the bottom in their current order.";
    return <ControlSection title="Choose a Colour Samples Order" hint={hint}><div className="choice-stack playtest-command-grid">{choices.map((orderId) => <PieceCommandButton key={orderId} busy={busy} label={locale === "zh-CN" ? `预留已查看订单${orderId}` : `Reserve looked-at ${orderId}`} onClick={() => send({ type: "OFFICE_CHOOSE_COLOUR_SAMPLES_ORDER", orderId })}><OrderCard orderId={orderId} /></PieceCommandButton>)}</div></ControlSection>;
  }
  return (
    <ControlSection title="Choose an Order" hint={locale === "zh-CN" ? `还可拿取${phase.remainingTakes}张订单。本轮拿取订单不受手牌上限限制；整备时弃至上限。` : `${phase.remainingTakes} acquisition${phase.remainingTakes === 1 ? "" : "s"} remaining. There is no hand limit during the round; discard to your limit during Cleanup.`}>
      <h4>{t("Face-up Orders")}</h4>
      <div className="choice-stack playtest-command-grid">{display.map((orderId) => <PieceCommandButton key={orderId} busy={busy} label={locale === "zh-CN" ? `拿取正面订单${orderId}` : `Take face-up ${orderId}`} onClick={() => send({ type: "OFFICE_TAKE_ORDER", orderId })}><OrderCard orderId={orderId} /></PieceCommandButton>)}</div>
      <h4>{t("Main Order deck")}</h4>
      <CommandButton busy={busy} send={send} command={{ type: "OFFICE_TAKE_TOP_ORDER" }} secondary>{locale === "zh-CN" ? "盲抽牌堆顶主订单" : "Reserve the top Main Order unseen"}</CommandButton>
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
  const [firstUnlock, setFirstUnlock] = useState<"potters_wheel" | "glaze_decoration">("potters_wheel");
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
      {player.techniques.length === 0 && <label>{locale === "zh-CN" ? "首次获得高级技术：解锁哪一个第二工位" : "First Advanced Tech: unlock which second worker space"}<select value={firstUnlock} onChange={(event) => setFirstUnlock(event.target.value as "potters_wheel" | "glaze_decoration")}><option value="potters_wheel">{locale === "zh-CN" ? "第二个拉坯轮工位" : "Second Potter's Wheel space"}</option><option value="glaze_decoration">{locale === "zh-CN" ? "第二个施釉与装饰工位" : "Second Glaze & Decoration space"}</option></select></label>}
      <div className="choice-stack playtest-command-grid technique-commands">{ids.map((techniqueId) => {
        const technique = TECHNIQUE_DEFINITIONS[techniqueId];
        const cost = guildTechniqueCost(techniqueId, worker?.kind ?? "apprentice");
        return <PieceCommandButton key={techniqueId} busy={busy || player.resources.coins < cost} label={`${techniqueId} · ${locale === "zh-CN" ? technique?.nameZh : technique?.name ?? t("Unknown Technique")} · ${cost} ${t("Coins")}`} onClick={() => send({ type: "GUILD_BUY_TECHNIQUE", techniqueId, ...(player.techniques.length === 0 ? { unlockWorkshop: firstUnlock } : {}) })}><TechniqueSummary techniqueId={techniqueId} shownCost={cost} /></PieceCommandButton>;
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
  const { locale, t } = useI18n();
  const loaded = ownCeramics(game, player.id, "loaded");
  const occupied = new Set(Object.values(game.ceramics).filter((ceramic) => ceramic.stage === "loaded").map((ceramic) => ceramic.stage === "loaded" ? ceramic.kilnSpaceId : ""));
  const spaces = activeKilnSpaceIds(game.playerCount).filter((space) => !occupied.has(space));
  return (
    <ControlSection title="Shifu kiln reposition" hint={locale === "zh-CN" ? "基础火候确定后、翻开窑火牌前，可将你1件已装窑器物移至另一空的启用窑位。" : "After Base Heat is known and before the Fire card is revealed, move one of your loaded ceramics to another empty active kiln space."}>
      <form className="control-form" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void send({ type: "RESOLVE_KILN_YARD_REPOSITION", ceramicId: required(data, "ceramic"), toSpaceId: required(data, "space") as KilnSpaceId });
      }}>
        <CeramicSelect name="ceramic" label="Ceramic" ceramics={loaded} />
        <SelectField name="space" label="Empty destination" options={spaces} />
        <button className="primary-button" disabled={busy || loaded.length === 0 || spaces.length === 0}>{t("Move ceramic")}</button>
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
  if (!eligible) return <ControlSection title="The kiln is being fired" hint="Only players with loaded ceramics choose a Contribution card."><p>{t("You have no ceramic in this firing.")}</p></ControlSection>;
  if (submitted) {
    const sealed = pending === null || pending === undefined ? null : CONTRIBUTION_CARD_DEFINITIONS[pending.card];
    const adjustment = sealed === null ? null : sealed.heatAdjustment + (pending?.useFuelLedger === true ? (pending.card === "BANK" ? -1 : 1) : 0);
    return <ControlSection title="Contribution locked" hint="Other players cannot see your Contribution card or Fuel Ledger commitment until every contributor submits."><p className="secret-value">{t("Your sealed choice:")} <strong>{sealed === null ? t("saved") : `${pending?.useFuelLedger === true ? (locale === "zh-CN" ? "柴薪簿 · " : "Fuel Ledger · ") : ""}${locale === "zh-CN" ? sealed.nameZh : sealed.name}${adjustment === null ? "" : ` (${adjustment > 0 ? "+" : ""}${adjustment})`}`}</strong></p></ControlSection>;
  }
  const hasFuelLedger = player.techniques.some((technique) => technique.id === "T12");
  const choices = [
    ...CONTRIBUTION_CARDS.map((card) => ({ card, useFuelLedger: false, woodCost: card.woodCost, heatAdjustment: card.heatAdjustment })),
    ...(hasFuelLedger ? CONTRIBUTION_CARDS.filter((card) => card.id === "BANK" || card.id === "STOKE").map((card) => ({ card, useFuelLedger: true, woodCost: card.woodCost + 1, heatAdjustment: card.heatAdjustment + (card.id === "BANK" ? -1 : 1) })) : []),
  ];
  return (
    <ControlSection title="Choose a Contribution in secret" hint={hasFuelLedger ? "Fuel Ledger adds secret −2 and +2 options. The printed card and total 2-Wood commitment stay private until everyone reveals." : "Your printed card stays private until every eligible player has locked a choice."}>
      {privateDecision?.fireModifierPeek !== null && privateDecision?.fireModifierPeek !== undefined && <p className="secret-value">Test Pieces peek: <strong>{privateDecision.fireModifierPeek > 0 ? "+" : ""}{privateDecision.fireModifierPeek}</strong></p>}
      <div className="contribution-grid wood-card-grid">
        {choices.map(({ card, useFuelLedger, woodCost, heatAdjustment }) => {
          const affordable = woodCost <= player.resources.wood;
          return (
            <button
              className="wood-card-choice"
              type="button"
              key={`${card.id}:${useFuelLedger ? "ledger" : "normal"}`}
              disabled={busy || !affordable}
              onClick={() => void send({ type: "SUBMIT_WOOD_CONTRIBUTION", windowId, card: card.id, useFuelLedger })}
              aria-label={locale === "zh-CN" ? `${useFuelLedger ? "柴薪簿" : card.nameZh}：${woodCost}柴薪，火候${heatAdjustment >= 0 ? "+" : ""}${heatAdjustment}` : `${useFuelLedger ? `Fuel Ledger ${card.name}` : card.name}: ${woodCost} Wood, ${heatAdjustment >= 0 ? "+" : ""}${heatAdjustment} Heat`}
            >
              <strong>{useFuelLedger ? (locale === "zh-CN" ? `柴薪簿 · ${card.nameZh}` : `Fuel Ledger · ${card.name}`) : (locale === "zh-CN" ? card.nameZh : card.name)}</strong>
              <span>{woodCost} {t("Wood")}</span>
              <span>{heatAdjustment >= 0 ? "+" : ""}{heatAdjustment} {t("Heat")}</span>
            </button>
          );
        })}
      </div>
    </ControlSection>
  );
}

function CleanupOrderControls({ player, busy, send }: { player: PublicPlayerState; busy: boolean; send: SendCommand }) {
  const limit = orderHandLimit();
  const requiredCount = Math.max(0, player.orderHand.length - limit);
  return <SelectionSubmission
    title="Cleanup Order limit"
    hint={`Discard exactly ${requiredCount} Order${requiredCount === 1 ? "" : "s"} face up to finish cleanup. Your limit is ${limit}.`}
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
  const loaded = ownCeramics(game, player.id, "loaded");
  if (player.kilnId === "GE") {
    const eligible = loaded.filter(
      ({ id }) => {
        const difference = game.firingContext?.ceramicResults[id]?.finalHeatDifference;
        return difference === 1;
      },
    );
    return <CeramicDecision title="Ge · Crackle from Fire" hint="Choose one ceramic whose Heat Difference is exactly 1. At no cost, set it to exact heat and change its Decoration to Crackle." ceramics={eligible} busy={busy} send={send} make={(ceramicId) => ({ type: "RESOLVE_GE", ceramicId })} skip={{ type: "RESOLVE_GE", ceramicId: null }} />;
  }
  return (
    <ControlSection title="Jun · Kiln Transformation" hint={`Pay ${JUN_ACTIVATION_WOOD} Wood to adjust one of your ceramics' Actual Heat by +1 or −1, or pass.`}>
      <JunForm ceramics={loaded} wood={player.resources.wood} busy={busy} send={send} />
      <CommandButton busy={busy} send={send} command={{ type: "RESOLVE_JUN", ceramicId: null, delta: null }} secondary>Skip Jun ability</CommandButton>
    </ControlSection>
  );
}

function JunForm({ ceramics, wood, busy, send }: { ceramics: ReturnType<typeof ownCeramics>; wood: number; busy: boolean; send: SendCommand }) {
  const { t } = useI18n();
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void send({ type: "RESOLVE_JUN", ceramicId: required(data, "ceramic"), delta: Number(required(data, "delta")) as -1 | 1 });
  }
  return <form className="control-form" onSubmit={submit}><CeramicSelect name="ceramic" label="Ceramic" ceramics={ceramics} /><SelectField name="delta" label="Heat change" options={["-1", "1"]} /><button className="primary-button" disabled={busy || ceramics.length === 0 || wood < JUN_ACTIVATION_WOOD}>{t(`Pay ${JUN_ACTIVATION_WOOD} Wood and apply heat change`)}</button>{wood < JUN_ACTIVATION_WOOD && <small role="status">{t(`You need ${JUN_ACTIVATION_WOOD} Wood to use Jun.`)}</small>}</form>;
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
  const { t } = useI18n();
  const ceramics = ownCeramics(game, player.id, "finished");
  const availableOrders = [...new Set([...player.orderHand, ...game.displays.market])];
  return (
    <ControlSection title="Complete an Order" hint="On this opportunity, complete at most one held Order or one of the five face-up Main Orders, or pass. The Order Phase continues in reverse order until a full circuit has no completion.">
      {availableOrders.length === 0 ? <p>{t("No open Orders.")}</p> : availableOrders.map((orderId) => (
        <OrderCompletion key={orderId} orderId={orderId} ceramics={ceramics} recognition={player.imperialRecognition} busy={busy} send={send} />
      ))}
      <CommandButton busy={busy} send={send} command={{ type: "END_ORDER_TURN" }} secondary>Pass this Order opportunity</CommandButton>
    </ControlSection>
  );
}

function OrderCompletion({ orderId, ceramics, recognition, busy, send }: {
  orderId: string;
  ceramics: ReturnType<typeof ownCeramics>;
  recognition: 0 | 1 | 2 | 3 | 4 | 5;
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
  const crossesGrant = definition !== undefined && recognition < 2 && recognition + definition.crowns >= 2;
  const selectionStatus = locale === "zh-CN"
    ? selected.length === 0
      ? `请选择恰好${requiredCount}件已完成陶瓷。`
      : selected.length !== requiredCount
        ? `已选择${selected.length}件；此订单需要恰好${requiredCount}件。`
        : matches
          ? "所选陶瓷符合此订单；提交后服务器会再次验证。"
          : "所选器物不符合订单的器形、釉色、装饰、组合关系或最低品第要求。"
    : selected.length === 0
      ? `Select exactly ${requiredCount} Finished ceramic${requiredCount === 1 ? "" : "s"}.`
      : selected.length !== requiredCount
        ? `Selected ${selected.length}; this Order requires exactly ${requiredCount}.`
        : matches
          ? "Selection satisfies this Order. The server will validate again on submission."
          : "Selection does not satisfy the Order's Shape, Glaze, Decoration, relationship, or minimum Quality requirements.";
  return (
    <article className="completion-card">
      <OrderCard orderId={orderId} />
      <fieldset><legend>{t("Deliver ceramics")}</legend>{ceramics.map((ceramic) => (
        <label className="check-row" key={ceramic.id}><input type="checkbox" checked={selected.includes(ceramic.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, ceramic.id] : current.filter((id) => id !== ceramic.id))} />{ceramicLabel(ceramic, locale)}</label>
      ))}</fieldset>
      {crossesGrant && <label>{locale === "zh-CN" ? "御赐资助奖励" : "Imperial Grant reward"}<select value={grantChoice} onChange={(event) => setGrantChoice(event.target.value as "coins" | "resources")}><option value="coins">{locale === "zh-CN" ? "3铜钱" : "3 Coins"}</option><option value="resources">{locale === "zh-CN" ? "1黏土 + 1柴薪 + 1铜钱" : "1 Clay + 1 Wood + 1 Coin"}</option></select></label>}
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
  const maximum = IMPERIAL_PROGRESS.exhibition.capacityByProgress[player.imperialRecognition]!;
  const [selected, setSelected] = useState<string[]>([]);
  const [featured, setFeatured] = useState<string[]>([]);
  if (submitted) return <ControlSection title="Exhibition submitted" hint="Waiting for the other workshops." />;
  const hint = locale === "zh-CN"
    ? `陈设至多${maximum}件未交付且品第为合格品或更高的器物。若陈设至少3件，须指定恰好3件为主题藏品；三种不同器形和／或三种不同釉色各得+2分。`
    : `Exhibit up to ${maximum} finished, undelivered Standard-or-better ceramics. If you exhibit at least three, choose exactly three as the featured collection; three different Shapes and/or Glazes earn +2 VP each.`;
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
        return <label className="check-row" key={ceramicId}><input type="checkbox" checked={checked} disabled={!checked && featured.length >= 3} onChange={(event) => setFeatured((current) => event.target.checked ? [...current, ceramicId] : current.filter((id) => id !== ceramicId))} />{ceramic === undefined ? ceramicId : ceramicLabel(ceramic, locale)}</label>;
      })}</fieldset>}
      <button className="primary-button" disabled={busy || featured.length !== requiredFeatured} onClick={() => void send({ type: "SUBMIT_PRESENTATION", ceramicIds: selected, featuredCeramicIds: featured })}>{locale === "zh-CN" ? "提交终局展陈" : "Submit Exhibition"}</button>
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
          <thead><tr><th>{locale === "zh-CN" ? "作坊" : "Workshop"}</th><th>{t("Orders")}</th><th>{locale === "zh-CN" ? "御前召见" : "Imperial Audience"}</th><th>{t("End-game Exhibition")}</th><th>{locale === "zh-CN" ? "窑口／其他即时得分" : "Kiln / other immediate VP"}</th><th>{t("Coins")}</th><th>{locale === "zh-CN" ? "总分" : "Total"}</th></tr></thead>
          <tbody>{game.playerOrder.map((playerId) => {
            const score = game.finalResult?.scores[playerId];
            const winner = game.finalResult?.winnerIds.includes(playerId) ?? false;
            return <tr className={winner ? "winner" : ""} key={playerId}><th>{game.players[playerId]?.displayName}{winner && <em>{locale === "zh-CN" ? "胜者" : "Winner"}</em>}</th><td>{score?.orders ?? 0}</td><td>{score?.imperialAudience ?? 0}</td><td>{score?.presentation ?? 0}</td><td>{score?.immediateAbilities ?? 0}</td><td>{score?.leftoverCoins ?? 0}</td><td><strong>{score?.total ?? 0} {t("VP")}</strong></td></tr>;
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
    imperial_recognition: "御用认可",
    completed_crowns: "已完成订单上的皇冠总数",
    masterpieces_delivered_or_presented: "已交付或陈设的珍品数量",
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
  const { t } = useI18n();
  const [selected, setSelected] = useState<string[]>([]);
  return <ControlSection title={title} hint={hint}><fieldset><legend>{exact ? `Select exactly ${maximum}` : t("Select up to {maximum}", { maximum })}</legend>{options.map((option) => <label className="check-row" key={option.value}><input type="checkbox" checked={selected.includes(option.value)} disabled={!selected.includes(option.value) && selected.length >= maximum} onChange={(event) => setSelected((current) => event.target.checked ? [...current, option.value] : current.filter((value) => value !== option.value))} />{option.label}</label>)}</fieldset><button className="primary-button" type="button" disabled={busy || (exact && selected.length !== maximum)} onClick={() => void onSubmit(selected)}>{t(submitLabel)}</button></ControlSection>;
}

function WorkerChoice({ workers, value, onChange }: {
  workers: AvailableWorker[];
  value: string;
  onChange: (workerId: string) => void;
}) {
  const { t, term } = useI18n();
  return <label>{t("Worker")}<select name="worker" value={value} onChange={(event) => onChange(event.target.value)} required>{workers.map((worker) => <option key={worker.id} value={worker.id}>{term(worker.kind)} · {worker.id}</option>)}</select></label>;
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

function CeramicChoice({ name, label, ceramics, blank, value, onChange }: {
  name: string;
  label: string;
  ceramics: ReturnType<typeof ownCeramics>;
  blank?: string;
  value: string;
  onChange: (ceramicId: string) => void;
}) {
  const { locale, t } = useI18n();
  return <label>{t(label)}<select name={name} value={value} required={blank === undefined} onChange={(event) => onChange(event.target.value)}>{blank !== undefined && <option value="">{t(blank)}</option>}{ceramics.map((ceramic) => <option key={ceramic.id} value={ceramic.id}>{ceramicLabel(ceramic, locale)}</option>)}</select></label>;
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

function EnumChoice({ name, label, options, value, onChange, formatOption }: {
  name: string;
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  formatOption?: (option: string) => string;
}) {
  const { t, term } = useI18n();
  return <label>{t(label)}<select name={name} value={value} onChange={(event) => onChange(event.target.value)} required>{options.map((option) => <option key={option} value={option}>{formatOption?.(option) ?? term(option)}</option>)}</select></label>;
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
      case "take_one": return "拿取1张正面订单，或确认盲抽1张牌堆顶订单。";
      case "take_up_to_two": return "拿取至多2张订单；每次可分别选择正面或盲抽。";
    }
  }
  switch (action) {
    case "take_one":
      return "Take one face-up Order or commit to a blind top-deck draw.";
    case "take_up_to_two":
      return "Take up to two Orders, choosing face-up or blind separately each time.";
  }
}

function localizeActionError(locale: Locale, error: string): string {
  if (locale === "en") return error;
  const errors: Record<string, string> = {
    "Forming Studio is full.": "制坯坊已满。",
    "Glaze Workshop is full.": "施釉坊已满。",
    "Kiln Yard is full.": "装窑场已满。",
    "Commission Market is full.": "委托市场已满。",
    "Guild & Academy is full.": "行会与学堂已满。",
    "Choose an available worker.": "请选择1名可用工人。",
    "An Apprentice may form only one vessel.": "学徒只能成型1件器物。",
    "Ding's extra vessel must match a selected base Shape.": "定窑额外器物必须与所选基础器型相同。",
    "Choose a Ding vessel before substituting its Clay.": "替代定窑器物的陶土前，请先选择该器物。",
    "Large Throwing Wheel requires a Vase or Censer.": "大型拉坯轮需要成型瓶或香炉。",
    "Measuring Calipers requires two different Shapes.": "量规卡尺需要两种不同器型。",
    "Drying Frames requires a Shape matching an Order in hand.": "晾坯架需要成型与手中订单相符的器型。",
    "You have no Shaped ceramic to glaze.": "你没有可施釉的已成型陶瓷。",
    "Only the Shifu may ignore a Decoration cost.": "只有师傅可以忽略装饰费用。",
    "Choose each ceramic only once.": "每件陶瓷只能选择一次。",
    "Carving Knives requires a paid Carved Decoration.": "雕刻刀需要1次需付费的刻花装饰。",
    "Seal Stamps requires a paid Impressed Decoration.": "印模需要1次需付费的印花装饰。",
    "You have no Glazed ceramic to load.": "你没有可入窑的已施釉陶瓷。",
    "The kiln has no empty space.": "窑内没有空窑位。",
    "Select at least one Glazed ceramic to load.": "请至少选择1件已施釉陶瓷入窑。",
    "An Apprentice may load at most one ceramic.": "学徒最多可将1件陶瓷入窑。",
    "Choose each kiln space only once.": "每个窑位只能选择一次。",
    "No Order source is available.": "没有可拿取的订单来源。",
    "Complete an Imperial Order first.": "请先完成至少1张御用订单。",
    "Progress 4 must reach 5 through an Imperial Order.": "从进度4到5必须通过完成御用订单。",
    "You are already at Progress 5.": "你的御用进度已在5格。",
    "No face-up Technique is available.": "没有正面的技术可用。",
    "No face-up Technique is affordable.": "没有买得起的正面技术。",
    "Materials Yard is full.": "备料场已满。",
    "Choose whole, non-negative resource amounts.": "请选择非负整数资源数量。",
  };
  if (errors[error] !== undefined) return errors[error]!;
  if (error.startsWith("Your Order area is full")) {
    const limit = error.match(/\((\d+)\)/)?.[1] ?? "";
    return `你的订单区已满${limit === "" ? "" : `（上限${limit}张）`}。`;
  }
  if (error.includes("may glaze at most")) {
    const maximum = error.match(/at most (\d+)/)?.[1] ?? "1";
    return `所选工人／模式最多可为${maximum}件陶瓷施釉。`;
  }
  if (error.startsWith("You already own the maximum of")) {
    const maximum = error.match(/maximum of (\d+)/)?.[1] ?? String(GAME_CONFIG.techniques.maxOwned);
    return `你已拥有上限${maximum}项技术。`;
  }
  if (error.startsWith("Requires ")) return `资源不足：${error.slice(9).replaceAll("Clay", "陶土").replaceAll("Coins", "铜钱").replaceAll("Coin", "铜钱")}`;
  return error;
}

function officeActionLabel(action: OfficeActionChoice, locale: Locale): string {
  if (locale === "en") return action.replaceAll("_", " ");
  switch (action) {
    case "take_one": return "拿取1张订单";
    case "take_up_to_two": return "拿取至多2张订单";
  }
}

export function ceramicLabel(ceramic: ReturnType<typeof ownCeramics>[number], locale: Locale = "en"): string {
  const decoration = "decoration" in ceramic ? ` · ${localizedTerm(locale, ceramic.glaze)} · ${localizedTerm(locale, ceramic.decoration)}` : "";
  const quality = "quality" in ceramic ? ` · ${localizedTerm(locale, ceramic.quality)}` : "";
  const kilnSpace = ceramic.stage === "loaded" ? ` · ${localizedTerm(locale, ceramic.kilnSpaceId)}` : "";
  return `${localizedTerm(locale, ceramic.shape)}${decoration}${quality}${kilnSpace}`;
}

function ceramicOption(ceramic: ReturnType<typeof ownCeramics>[number], locale: Locale = "en") {
  return { value: ceramic.id, label: ceramicLabel(ceramic, locale) };
}

function required(data: FormData, name: string): string {
  const value = data.get(name);
  if (typeof value !== "string" || value === "") throw new Error(`Missing form field ${name}`);
  return value;
}
