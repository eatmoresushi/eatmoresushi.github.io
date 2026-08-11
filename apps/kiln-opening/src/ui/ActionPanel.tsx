import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  DECORATIONS,
  DECORATION_COSTS,
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
  TechniqueId,
  WorkerId,
  WoodContribution,
} from "../game";
import type {
  AuthoritativeCommand,
  PendingContribution,
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
  busy: boolean;
  send: SendCommand;
}

export function ActionPanel({
  game,
  ownPlayerId,
  ownPendingContribution,
  busy,
  send,
}: ActionPanelProps) {
  const { t } = useI18n();
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
  const { game, player, ownPlayerId, ownPendingContribution, busy, send } = props;
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
      const orderId = phase.initialOrderIds[ownPlayerId];
      return (
        <ControlSection title="Your first commission" hint="Keep it, or redraw once from the same deck.">
          {orderId !== undefined && <div className="starting-order-piece"><OrderCard orderId={orderId} /></div>}
          <div className="button-row">
            <CommandButton busy={busy} send={send} command={{ type: "KEEP_STARTING_ORDER" }}>Keep Order</CommandButton>
            <CommandButton busy={busy} send={send} command={{ type: "REDRAW_STARTING_ORDER" }} secondary>Redraw</CommandButton>
          </div>
        </ControlSection>
      );
    }
    case "work":
      return <WorkControls game={game} player={player} busy={busy} send={send} />;
    case "work_office_orders":
      return <OfficeControls game={game} player={player} busy={busy} send={send} />;
    case "work_office_sale":
      return <OfficeSaleControls game={game} player={player} busy={busy} send={send} />;
    case "work_office_connoisseur":
      return <ConnoisseurControls game={game} player={player} busy={busy} send={send} />;
    case "work_guild":
      return <GuildControls game={game} player={player} busy={busy} send={send} />;
    case "firing_before_contribution":
      return <KilnSettingControls game={game} player={player} busy={busy} send={send} />;
    case "firing_after_reveal":
      return <BinaryDecision title="Fuel Ledger" hint="Pay 1 Wood and 1 Coin to add 1 to your revealed contribution." action="RESOLVE_FUEL_LEDGER" busy={busy} send={send} />;
    case "firing_after_fire_reveal":
      return <SaggerSelectionControls game={game} player={player} busy={busy} send={send} />;
    case "firing_before_quality":
      return <KilnAbilityControls game={game} player={player} busy={busy} send={send} />;
    case "firing_after_quality":
      return phase.techniqueIds[phase.queue.currentIndex] === "T15"
        ? <SecondFiringControls game={game} player={player} busy={busy} send={send} />
        : <SaggarsControls game={game} player={player} busy={busy} send={send} />;
    case "firing_after_firing":
      return phase.techniqueIds[phase.queue.currentIndex] === "T13"
        ? <BinaryDecision title="Kiln Records" hint="Gain 1 Clay and 1 Coin for finishing at least two Masterpieces in this firing." action="RESOLVE_KILN_RECORDS" busy={busy} send={send} />
        : <BinaryDecision title="Test Pieces" hint="Gain 1 Coin for one natural exact match, or 2 Coins for at least two." action="RESOLVE_TEST_PIECES" busy={busy} send={send} />;
    case "orders":
      return <OrderControls game={game} player={player} busy={busy} send={send} />;
  }
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
  const full = (locationId: LocationId): boolean =>
    game.actionBoard.placements[locationId].length >= locationCapacity(locationId, game.playerCount);
  if (workers.length === 0) {
    return (
      <ControlSection title="No workers remain" hint="Pass to finish your Work Phase participation.">
        <CommandButton busy={busy} send={send} command={{ type: "PASS_WORK_PHASE" }}>Pass for this round</CommandButton>
      </ControlSection>
    );
  }
  const action = (locationId: LocationId, hint: string, content: ReactNode) => {
    const used = game.actionBoard.placements[locationId].length;
    const capacity = locationCapacity(locationId, game.playerCount);
    return (
    <details className={`action-card ${full(locationId) ? "is-unavailable" : ""}`} open={locationId === "materials_yard"} key={locationId}>
      <summary><span>{term(locationId)}</span><small>{used}/{capacity} {t("workers")} · <span>{full(locationId) ? t("Full") : t(hint)}</span></small></summary>
      {content}
    </details>
    );
  };
  const actions: Record<LocationId, ReactNode> = {
    materials_yard: action("materials_yard", "Gain Clay and Wood", <MaterialsForm workers={workers} locationFull={full("materials_yard")} busy={busy} send={send} />),
    forming_studio: action("forming_studio", "Shape vessels", <FormCeramicsForm game={game} player={player} workers={workers} locationFull={full("forming_studio")} busy={busy} send={send} />),
    glaze_workshop: action("glaze_workshop", "Glaze and decorate", <GlazeForm game={game} player={player} workers={workers} locationFull={full("glaze_workshop")} busy={busy} send={send} />),
    kiln_yard: action("kiln_yard", "Load ceramics", <KilnYardForm game={game} player={player} workers={workers} locationFull={full("kiln_yard")} busy={busy} send={send} />),
    market_imperial_office: action("market_imperial_office", "Orders, Coins, or Shifu Patronage", <OfficeActionForms game={game} player={player} workers={workers} locationFull={full("market_imperial_office")} busy={busy} send={send} />),
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

function MaterialsForm({ workers, locationFull, busy, send }: WorkerFormProps) {
  const { locale, t, term } = useI18n();
  const [workerId, setWorkerId] = useState(workers[0]?.id ?? "");
  const [clay, setClay] = useState(workers[0]?.kind === "shifu" ? 3 : 2);
  const [wood, setWood] = useState(1);
  const selectedWorker = workers.find((worker) => worker.id === workerId) ?? workers[0];
  const requiredTotal = selectedWorker?.kind === "shifu" ? 4 : 3;
  const invalidAmount = !Number.isInteger(clay) || !Number.isInteger(wood) || clay < 0 || wood < 0;
  const wrongTotal = !invalidAmount && clay + wood !== requiredTotal;
  const error = locationFull
    ? "Materials Yard is full."
    : invalidAmount
      ? "Choose whole, non-negative resource amounts."
      : wrongTotal
      ? `${selectedWorker?.kind === "shifu" ? "Shifu" : "Apprentice"} must take exactly ${requiredTotal} total Clay and Wood.`
      : null;

  function chooseWorker(nextWorkerId: string): void {
    const nextWorker = workers.find((worker) => worker.id === nextWorkerId);
    setWorkerId(nextWorkerId);
    setClay(nextWorker?.kind === "shifu" ? 3 : 2);
    setWood(1);
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (error !== null || selectedWorker === undefined) return;
    void send({
      type: "GAIN_MATERIALS",
      workerId: selectedWorker.id,
      clay,
      wood,
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
      <small role="status" className={error === null ? "" : "control-error"}>
        {error === null
          ? locale === "zh-CN" ? `${clay}陶土 + ${wood}柴薪 = ${requiredTotal}份资源。` : `${clay} Clay + ${wood} Wood = ${requiredTotal} resources.`
          : locale === "zh-CN" ? (locationFull ? "原料场已满。" : invalidAmount ? "请选择非负整数资源数量。" : `${term(selectedWorker?.kind ?? "apprentice")}必须恰好拿取${requiredTotal}份陶土与柴薪。`) : error}
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
  const techniques = ownedAvailableTechniques(player, ["T01", "T02", "T03", "T04"]);
  const [workerId, setWorkerId] = useState(workers[0]?.id ?? "");
  const [shape1, setShape1] = useState<Shape>(SHAPES[0]!);
  const [shape2, setShape2] = useState<Shape | "">("");
  const [selectedTechniques, setSelectedTechniques] = useState<TechniqueId[]>([]);
  const [substitution, setSubstitution] = useState<"" | "base" | "ding">("");
  const [ding, setDing] = useState<Shape | "">("");
  const selectedWorker = workers.find((worker) => worker.id === workerId) ?? workers[0];
  const activeTechniqueIds = selectedTechniques.filter((techniqueId) => techniques.includes(techniqueId));
  const canUseDing = player.kilnId === "DI" && !player.kilnAbilityUsedThisRound;
  const activeDing = canUseDing ? ding : "";
  const shapes = [shape1, shape2].filter((shape): shape is Shape => shape !== "");
  const allShapes = activeDing === "" ? shapes : [...shapes, activeDing];
  const usesSubstitution = activeTechniqueIds.includes("T03");
  const activeSubstitution = usesSubstitution ? substitution : "";
  const clayCost = allShapes.reduce((total, shape) => total + SHAPE_COSTS[shape], 0) - (usesSubstitution ? 1 : 0);
  const coinCost = usesSubstitution ? 1 : 0;

  function validationError(): string | null {
    if (locationFull) return "Forming Studio is full.";
    if (selectedWorker === undefined) return "Choose an available worker.";
    if (shapes.length > (selectedWorker.kind === "shifu" ? 2 : 1)) {
      return "An Apprentice may form only one vessel.";
    }
    if (activeDing !== "" && !shapes.includes(activeDing)) return "Ding's extra vessel must match a selected base Shape.";
    if (usesSubstitution && activeSubstitution === "") return "Clay Substitution needs one payment target.";
    if (activeSubstitution === "ding" && activeDing === "") return "Choose a Ding vessel before substituting its Clay.";
    if (activeTechniqueIds.includes("T01") && !allShapes.some((shape) => shape === "vase" || shape === "censer")) {
      return "Large Throwing Wheel requires a Vase or Censer.";
    }
    if (activeTechniqueIds.includes("T02") && new Set(allShapes).size < 2) {
      return "Measuring Calipers requires two different Shapes.";
    }
    if (activeTechniqueIds.includes("T04") && !allShapes.some((shape) =>
      player.orderHand.some((orderId) => ORDER_DEFINITIONS[orderId]?.ceramics.some(
        (requirement) => requirement.shape === undefined || requirement.shape === shape,
      )),
    )) return "Drying Frames requires a Shape matching an Order in hand.";
    if (player.resources.clay < clayCost || player.resources.coins < coinCost) {
      return `Requires ${clayCost} Clay${coinCost > 0 ? ` and ${coinCost} Coin` : ""}.`;
    }
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
    if (activeSubstitution === "base" || activeSubstitution === "ding") command.claySubstitutionTarget = activeSubstitution;
    if (activeDing !== "") command.dingExtraShape = activeDing;
    void send(command);
  }
  return (
    <form className="control-form" onSubmit={submit}>
      <WorkerChoice workers={workers} value={selectedWorker?.id ?? ""} onChange={setWorkerId} />
      <label>{t("First shape")}<select name="shape1" value={shape1} onChange={(event) => setShape1(event.target.value as Shape)}>{SHAPES.map((shape) => <option key={shape} value={shape}>{term(shape)} · {SHAPE_COSTS[shape]} {t("Clay")}</option>)}</select></label>
      <label>{t("Second shape (Shifu only)")}<select name="shape2" value={shape2} onChange={(event) => setShape2(event.target.value as Shape | "")}><option value="">{t("None")}</option>{SHAPES.map((shape) => <option key={shape} value={shape}>{term(shape)} · {SHAPE_COSTS[shape]} {t("Clay")}</option>)}</select></label>
      <TechniqueChecks techniqueIds={techniques} selected={activeTechniqueIds} onChange={setSelectedTechniques} />
      {techniques.includes("T03") && <label>{t("Clay Substitution target")}<select name="substitution" value={activeSubstitution} disabled={!usesSubstitution} onChange={(event) => setSubstitution(event.target.value as "" | "base" | "ding")}><option value="">{t("Do not use")}</option><option value="base">{locale === "zh-CN" ? "基础成型" : "base"}</option><option value="ding">{locale === "zh-CN" ? "定窑额外器物" : "ding"}</option></select></label>}
      {canUseDing && <label>{t("Ding extra matching shape")}<select name="ding" value={activeDing} onChange={(event) => setDing(event.target.value as Shape | "")}><option value="">{t("Do not use")}</option>{(["bowl", "plate", "washer"] as Shape[]).map((shape) => <option key={shape} value={shape}>{term(shape)} · {SHAPE_COSTS[shape]} {t("Clay")}</option>)}</select></label>}
      <small role="status" className={error === null ? "" : "control-error"}>{error === null ? (locale === "zh-CN" ? `费用：${clayCost}陶土${coinCost > 0 ? `与${coinCost}铜钱` : ""}。` : `Cost: ${clayCost} Clay${coinCost > 0 ? ` and ${coinCost} Coin` : ""}.`) : localizeActionError(locale, error)}</small>
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
  const { locale, t } = useI18n();
  const ceramics = ownCeramics(game, player.id, "shaped");
  const techniques = ownedAvailableTechniques(player, ["T05", "T06"]);
  const [workerId, setWorkerId] = useState(workers[0]?.id ?? "");
  const [ceramic1, setCeramic1] = useState(ceramics[0]?.id ?? "");
  const [glaze1, setGlaze1] = useState<Glaze>(GLAZES[0]!);
  const [decoration1, setDecoration1] = useState<Decoration>(DECORATIONS[0]!);
  const [ceramic2, setCeramic2] = useState("");
  const [glaze2, setGlaze2] = useState<Glaze>(GLAZES[0]!);
  const [decoration2, setDecoration2] = useState<Decoration>(DECORATIONS[0]!);
  const [mode, setMode] = useState<"normal" | "free_single">("normal");
  const [selectedTechniques, setSelectedTechniques] = useState<TechniqueId[]>([]);
  const selectedWorker = workers.find((worker) => worker.id === workerId) ?? workers[0];
  const firstId = ceramics.some((ceramic) => ceramic.id === ceramic1) ? ceramic1 : ceramics[0]?.id ?? "";
  const secondId = ceramics.some((ceramic) => ceramic.id === ceramic2) ? ceramic2 : "";
  const activeTechniqueIds = selectedTechniques.filter((techniqueId) => techniques.includes(techniqueId));
  const selections = [
    ...(firstId === "" ? [] : [{ ceramicId: firstId, glaze: glaze1, decoration: decoration1 }]),
    ...(secondId === "" ? [] : [{ ceramicId: secondId, glaze: glaze2, decoration: decoration2 }]),
  ];
  const paidMode = mode === "normal";
  const totalCoins = paidMode
    ? selections.reduce((total, selection) => total + DECORATION_COSTS[selection.decoration], 0)
      - (activeTechniqueIds.includes("T05") ? DECORATION_COSTS.carved : 0)
      - (activeTechniqueIds.includes("T06") ? DECORATION_COSTS.impressed : 0)
    : 0;

  function validationError(): string | null {
    if (locationFull) return "Glaze Workshop is full.";
    if (selectedWorker === undefined) return "Choose an available worker.";
    if (selections.length === 0) return "You have no Shaped ceramic to glaze.";
    if (selectedWorker.kind === "apprentice" && mode !== "normal") return "Only the Shifu may ignore a Decoration cost.";
    const maximum = selectedWorker.kind === "shifu" && mode === "normal" ? 2 : 1;
    if (selections.length > maximum) return `${selectedWorker.kind === "shifu" ? "This Shifu mode" : "An Apprentice"} may glaze at most ${maximum} ceramic${maximum === 1 ? "" : "s"}.`;
    if (secondId !== "" && secondId === firstId) return "Choose each ceramic only once.";
    if (activeTechniqueIds.includes("T05") && (!paidMode || !selections.some((selection) => selection.decoration === "carved"))) {
      return "Carving Knives requires a paid Carved Decoration.";
    }
    if (activeTechniqueIds.includes("T06") && (!paidMode || !selections.some((selection) => selection.decoration === "impressed"))) {
      return "Seal Stamps requires a paid Impressed Decoration.";
    }
    if (player.resources.coins < totalCoins) return `Requires ${totalCoins} Coins for the selected Decorations.`;
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
      shifuMode: mode,
      useTechniqueIds: activeTechniqueIds,
    });
  }
  return (
    <form className="control-form" onSubmit={submit}>
      <WorkerChoice workers={workers} value={selectedWorker?.id ?? ""} onChange={setWorkerId} />
      <CeramicChoice name="ceramic1" label="First ceramic" ceramics={ceramics} value={firstId} onChange={setCeramic1} />
      <EnumChoice name="glaze1" label="First glaze" options={GLAZES} value={glaze1} onChange={(value) => setGlaze1(value as Glaze)} />
      <EnumChoice name="decoration1" label="First decoration" options={DECORATIONS} value={decoration1} onChange={(value) => setDecoration1(value as Decoration)} formatOption={(option) => decorationOptionLabel(option, locale)} />
      <CeramicChoice name="ceramic2" label="Second ceramic (Shifu normal mode only)" ceramics={ceramics} value={secondId} onChange={setCeramic2} blank="None" />
      <EnumChoice name="glaze2" label="Second glaze" options={GLAZES} value={glaze2} onChange={(value) => setGlaze2(value as Glaze)} />
      <EnumChoice name="decoration2" label="Second decoration" options={DECORATIONS} value={decoration2} onChange={(value) => setDecoration2(value as Decoration)} formatOption={(option) => decorationOptionLabel(option, locale)} />
      <EnumChoice name="mode" label="Shifu mode" options={["normal", "free_single"]} value={mode} onChange={(value) => setMode(value as "normal" | "free_single")} />
      <TechniqueChecks techniqueIds={techniques} selected={activeTechniqueIds} onChange={setSelectedTechniques} />
      <small role="status" className={error === null ? "" : "control-error"}>{error === null ? (locale === "zh-CN" ? `装饰费用：${totalCoins}铜钱。` : `Decoration cost: ${totalCoins} Coins.`) : localizeActionError(locale, error)}</small>
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
  const occupied = new Set(Object.values(game.ceramics).filter((ceramic) => ceramic.stage === "loaded").map((ceramic) => ceramic.stage === "loaded" ? ceramic.kilnSpaceId : ""));
  const spaces = activeKilnSpaceIds(game.playerCount).filter((space) => !occupied.has(space));
  const [workerId, setWorkerId] = useState(workers[0]?.id ?? "");
  const [ceramic1, setCeramic1] = useState("");
  const [space1, setSpace1] = useState<KilnSpaceId>(spaces[0] ?? KILN_SPACE_IDS[0]!);
  const [ceramic2, setCeramic2] = useState("");
  const [space2, setSpace2] = useState<KilnSpaceId>(spaces[1] ?? spaces[0] ?? KILN_SPACE_IDS[0]!);
  const selectedWorker = workers.find((worker) => worker.id === workerId) ?? workers[0];
  const firstId = ceramics.some((ceramic) => ceramic.id === ceramic1) ? ceramic1 : "";
  const secondId = ceramics.some((ceramic) => ceramic.id === ceramic2) ? ceramic2 : "";
  const firstSpace = spaces.includes(space1) ? space1 : spaces[0];
  const secondSpace = spaces.includes(space2) ? space2 : spaces[1] ?? spaces[0];
  const loads = [
    ...(firstId === "" || firstSpace === undefined ? [] : [{ ceramicId: firstId, kilnSpaceId: firstSpace }]),
    ...(secondId === "" || secondSpace === undefined ? [] : [{ ceramicId: secondId, kilnSpaceId: secondSpace }]),
  ];

  function validationError(): string | null {
    if (locationFull) return "Kiln Yard is full.";
    if (selectedWorker === undefined) return "Choose an available worker.";
    if (ceramics.length === 0) return "You have no Glazed ceramic to load.";
    if (spaces.length === 0) return "The kiln has no empty space.";
    if (loads.length === 0) return "Select at least one Glazed ceramic to load.";
    if (loads.length > (selectedWorker.kind === "shifu" ? 2 : 1)) return "An Apprentice may load at most one ceramic.";
    if (firstId !== "" && secondId === firstId) return "Choose each ceramic only once.";
    if (firstSpace !== undefined && secondId !== "" && secondSpace === firstSpace) return "Choose each kiln space only once.";
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
    });
  }
  return (
    <form className="control-form" onSubmit={submit}>
      <WorkerChoice workers={workers} value={selectedWorker?.id ?? ""} onChange={setWorkerId} />
      {spaces.length === 0 || ceramics.length === 0 ? (
        <p className="control-hint">{t("Kiln Yard gives no Wood; loading an eligible ceramic is required.")}</p>
      ) : (
        <>
          <CeramicChoice name="ceramic1" label="First ceramic" ceramics={ceramics} value={firstId} onChange={setCeramic1} blank="Choose a ceramic" />
          <EnumChoice name="space1" label="First kiln space" options={spaces} value={firstSpace ?? ""} onChange={(value) => setSpace1(value as KilnSpaceId)} />
          <CeramicChoice name="ceramic2" label="Second ceramic (Shifu only)" ceramics={ceramics} value={secondId} onChange={setCeramic2} blank="None" />
          <EnumChoice name="space2" label="Second kiln space" options={spaces} value={secondSpace ?? ""} onChange={(value) => setSpace2(value as KilnSpaceId)} />
        </>
      )}
      <small role="status" className={error === null ? "" : "control-error"}>{error === null ? (locale === "zh-CN" ? `已选择${loads.length}件陶瓷；入窑场不会获得柴薪。` : `${loads.length} ceramic${loads.length === 1 ? "" : "s"} selected; Kiln Yard gives no Wood.`) : localizeActionError(locale, error)}</small>
      <button className="primary-button" disabled={busy || error !== null}>{t("Load kiln")}</button>
    </form>
  );
}

type OfficeActionChoice = OfficeOrderMode | "coins" | "court_patronage";

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
  const [officeAction, setOfficeAction] = useState<OfficeActionChoice>("coins");
  const selectedWorker = workers.find((worker) => worker.id === workerId) ?? workers[0];
  const orderModes: OfficeActionChoice[] = selectedWorker?.kind === "shifu"
    ? ["coins", "take_up_to_two", "take_one_and_gain_two_coins", "court_patronage"]
    : ["coins", "take_one"];
  const action = orderModes.includes(officeAction) ? officeAction : orderModes[0]!;
  const handLimit = player.kilnId === "GU" ? GAME_CONFIG.orderDisplay.guanHandLimit : GAME_CONFIG.orderDisplay.baseHandLimit;
  const orderSourceCount = game.displays.market.length + game.displays.imperial.length + game.decks.marketRemaining + game.decks.imperialRemaining;

  function validationError(): string | null {
    if (locationFull) return "Market & Imperial Office is full.";
    if (selectedWorker === undefined) return "Choose an available worker.";
    if ((action === "take_one" || action === "take_one_and_gain_two_coins") && player.orderHand.length >= handLimit) {
      return `Your Order area is full (${handLimit}).`;
    }
    if ((action === "take_one" || action === "take_one_and_gain_two_coins") && orderSourceCount === 0) {
      return "No Order source is available.";
    }
    if (action === "court_patronage") {
      if (selectedWorker?.kind !== "shifu") return "Court Patronage requires your Shifu.";
      if (!player.completedOrders.some(({ orderId }) => orderId.startsWith("I"))) return "Complete an Imperial Order first.";
      if (player.resources.coins < 5) return "You need 5 Coins for Court Patronage.";
      if (player.imperialProgress === 4) return "Progress 4 must reach 5 through an Imperial Order.";
      if (player.imperialProgress === 5) return "You are already at Progress 5.";
    }
    return null;
  }

  const error = validationError();
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (error !== null || selectedWorker === undefined) return;
    if (action === "coins") void send({ type: "OFFICE_GAIN_COINS", workerId: selectedWorker.id });
    else if (action === "court_patronage") void send({ type: "USE_COURT_PATRONAGE", workerId: selectedWorker.id });
    else void send({ type: "BEGIN_OFFICE_ORDERS", workerId: selectedWorker.id, mode: action });
  }
  return (
    <form className="control-form" onSubmit={submit}>
      <p className="control-hint"><strong>{t("Apprentice:")}</strong> {t("Take 1 face-up or blind-top Order, or gain 2 Coins; then optionally sell 1 Flawed ceramic.")}</p>
      <p className="control-hint"><strong>{t("Shifu:")}</strong> {t("Take up to 2 Orders, take 1 + gain 2 Coins, gain 4 Coins, or use eligible Court Patronage. Patronage has no sale.")}</p>
      <WorkerChoice workers={workers} value={selectedWorker?.id ?? ""} onChange={setWorkerId} />
      <EnumChoice name="officeAction" label="Office action" options={orderModes} value={action} onChange={(value) => setOfficeAction(value as OfficeActionChoice)} formatOption={(value) => value === "court_patronage" ? (locale === "zh-CN" ? "朝廷赞助 · 5铜钱 · +1御用进度" : "Court Patronage · 5 Coins · +1 Progress") : officeActionLabel(value as OfficeActionChoice, locale)} />
      {selectedWorker?.kind === "shifu" && <p className="control-hint"><strong>{t("Court Patronage")}:</strong> {t("Requires 1 completed Imperial Order. Costs 5 Coins. Cannot advance from 4 to 5.")}</p>}
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
      <p className="control-hint"><strong>{t("Apprentice:")}</strong> {t("pay printed cost.")} <strong>{t("Shifu:")}</strong> {t("may refresh one tile, then pays 1 Coin less (minimum 1).")}</p>
      <small role="status" className={error === null ? "" : "control-error"}>{error === null ? (locale === "zh-CN" ? `有${affordable.length}块买得起的正面技术。` : `${affordable.length} affordable face-up Technique${affordable.length === 1 ? "" : "s"}.`) : localizeActionError(locale, error)}</small>
      <button className="primary-button" disabled={busy || error !== null}>{t("Begin Guild action")}</button>
    </form>
  );
}

function OfficeControls({ game, player, busy, send }: Pick<ActionPanelProps, "game" | "busy" | "send"> & {
  player: PublicPlayerState;
}) {
  const { locale, t } = useI18n();
  if (game.phase.type !== "work_office_orders") return null;
  const phase = game.phase;
  const display = [...game.displays.market, ...game.displays.imperial];
  const handLimit = player.kilnId === "GU" ? GAME_CONFIG.orderDisplay.guanHandLimit : GAME_CONFIG.orderDisplay.baseHandLimit;
  const handFull = player.orderHand.length >= handLimit;
  if (phase.step === "colour_samples_or_skip") {
    return (
      <ControlSection title="Use Colour Samples?" hint="Before your first Order, place exactly one face-up Order from either display on the bottom of its deck and reveal its replacement.">
        <div className="choice-stack playtest-command-grid">{display.map((orderId) => <PieceCommandButton key={orderId} busy={busy} label={locale === "zh-CN" ? `使用釉色样本将${orderId}置于牌堆底` : `Bottom ${orderId} with Colour Samples`} onClick={() => send({ type: "OFFICE_USE_COLOUR_SAMPLES", orderId })}><OrderCard orderId={orderId} imperial={orderId.startsWith("I")} /></PieceCommandButton>)}</div>
        <CommandButton busy={busy} send={send} command={{ type: "OFFICE_SKIP_COLOUR_SAMPLES" }} secondary>Skip Colour Samples</CommandButton>
      </ControlSection>
    );
  }
  return (
    <ControlSection title="Choose an Order" hint={locale === "zh-CN"
      ? handFull
        ? `你的订单区已满（上限${handLimit}张）；继续进行可选出售。`
        : `还可拿取${phase.remainingTakes}张订单。拿取正面订单后立即补充；盲抽不改变展示区。`
      : handFull
        ? `Your Order area is full (${handLimit}); continue to the optional sale.`
        : `${phase.remainingTakes} acquisition${phase.remainingTakes === 1 ? "" : "s"} remaining. Face-up cards refill; blind draws leave displays unchanged.`}>
      <h4>{t("Face-up Orders")}</h4>
      <div className="choice-stack playtest-command-grid">{display.map((orderId) => <PieceCommandButton key={orderId} busy={busy || handFull} label={locale === "zh-CN" ? `拿取正面订单${orderId}` : `Take face-up ${orderId}`} onClick={() => send({ type: "OFFICE_TAKE_ORDER", orderId })}><OrderCard orderId={orderId} imperial={orderId.startsWith("I")} /></PieceCommandButton>)}</div>
      <h4>{t("Blind top-deck draw")}</h4>
      <div className="blind-deck-grid">
        <BlindOrderDeck deck="market" remaining={game.decks.marketRemaining} busy={busy || handFull} send={send} />
        <BlindOrderDeck deck="imperial" remaining={game.decks.imperialRemaining} busy={busy || handFull} send={send} />
      </div>
      {phase.mode === "take_up_to_two" && <CommandButton busy={busy} disabled={phase.colourSamplesUsed && phase.ordersTaken === 0} send={send} command={{ type: "OFFICE_END_ORDERS" }} secondary>Continue to optional sale</CommandButton>}
    </ControlSection>
  );
}

function BlindOrderDeck({ deck, remaining, busy, send }: {
  deck: "market" | "imperial";
  remaining: number;
  busy: boolean;
  send: SendCommand;
}) {
  const { locale, t } = useI18n();
  const name = deck === "market" ? t("Market") : t("Imperial");
  return (
    <button
      className={`blind-order-deck is-${deck}`}
      type="button"
      disabled={busy || remaining === 0}
      onClick={() => void send({ type: "OFFICE_DRAW_BLIND_ORDER", deck })}
      aria-label={locale === "zh-CN" ? `盲抽${name}订单牌堆顶；剩余${remaining}张` : `Blind draw the top ${name} Order; ${remaining} cards remain`}
    >
      <span aria-hidden="true">{deck === "market" ? "市" : "廷"}</span>
      <strong>{locale === "zh-CN" ? `盲抽${name}` : `Blind draw ${name}`}</strong>
      <small>{locale === "zh-CN" ? `剩余${remaining}张 · 牌堆顶隐藏` : `${remaining} remaining · top card hidden`}</small>
    </button>
  );
}

function OfficeSaleControls({ game, player, busy, send }: Pick<ActionPanelProps, "game" | "busy" | "send"> & {
  player: PublicPlayerState;
}) {
  const { locale, t } = useI18n();
  if (game.phase.type !== "work_office_sale") return null;
  const worker = player.workers[game.phase.workerId];
  const flawed = ownCeramics(game, player.id, "finished").filter(
    (ceramic) => ceramic.stage === "finished" && ceramic.quality === "flawed",
  );
  const [selectedCeramics, setSelectedCeramics] = useState<string[]>([]);
  const validSelectedCeramics = selectedCeramics.filter((ceramicId) =>
    flawed.some((ceramic) => ceramic.id === ceramicId),
  );
  const workerLimit = worker?.kind === "shifu" ? 2 : 1;
  const selectionLimit = Math.min(workerLimit, game.commonSupply.coins);
  const selectedLabels = validSelectedCeramics.map((ceramicId) => {
        const ceramic = flawed.find((candidate) => candidate.id === ceramicId);
        return ceramic === undefined ? t("Ceramic") : ceramicLabel(ceramic, locale);
      }).join(locale === "zh-CN" ? "、" : ", ");
  const saleSummary = validSelectedCeramics.length === 0
    ? locale === "zh-CN" ? "不出售任何陶瓷并继续。" : "Continue without selling any ceramic."
    : locale === "zh-CN"
      ? `出售${selectedLabels}：+${validSelectedCeramics.length}铜钱。`
      : `Sell ${selectedLabels}: +${validSelectedCeramics.length} Coin${validSelectedCeramics.length === 1 ? "" : "s"}.`;
  return (
    <form className="control-form" onSubmit={(event) => {
      event.preventDefault();
      void send({ type: "OFFICE_RESOLVE_FLAWED_SALE", ceramicIds: validSelectedCeramics });
    }}>
      <h3>{t("Sell Flawed Ceramics")}</h3>
      <p className="control-hint">{locale === "zh-CN" ? `可选次要效果。${worker?.kind === "shifu" ? "最多选择2件" : "最多选择1件"}；每件获得1铜钱。` : `Optional secondary effect. ${worker?.kind === "shifu" ? "Select up to 2" : "Select up to 1"}; gain 1 Coin per selected ceramic.`}</p>
      {flawed.length > 0 ? <fieldset><legend>{t("Eligible Finished Flawed ceramics")}</legend>{flawed.map((ceramic) => {
        const checked = validSelectedCeramics.includes(ceramic.id);
        const atLimit = validSelectedCeramics.length >= selectionLimit;
        return <label className="check-row" key={ceramic.id}><input type="checkbox" name="ceramic" value={ceramic.id} checked={checked} disabled={!checked && atLimit} onChange={(event) => setSelectedCeramics((current) => event.target.checked ? [...current, ceramic.id] : current.filter((id) => id !== ceramic.id))} />{ceramicLabel(ceramic, locale)}</label>;
      })}</fieldset> : <p className="control-hint">{t("You have no eligible Finished Flawed ceramics.")}</p>}
      {game.commonSupply.coins < workerLimit && <p className="control-hint">{locale === "zh-CN" ? `公共供应目前只能支付${game.commonSupply.coins}次出售。` : `The common supply can currently pay for ${game.commonSupply.coins} sale${game.commonSupply.coins === 1 ? "" : "s"}.`}</p>}
      <small role="status">{saleSummary}</small>
      <button className="primary-button" disabled={busy}>{validSelectedCeramics.length === 0 ? (locale === "zh-CN" ? "不出售并继续" : "Continue without selling") : (locale === "zh-CN" ? "确认出售并结束" : "Confirm sale and finish")}</button>
    </form>
  );
}

function ConnoisseurControls({ game, player, busy, send }: Pick<ActionPanelProps, "game" | "busy" | "send"> & {
  player: PublicPlayerState;
}) {
  const { locale, t } = useI18n();
  const masterpieces = ownCeramics(game, player.id, "finished").filter(
    (ceramic) => ceramic.stage === "finished" && ceramic.quality === "masterpiece",
  );
  return (
    <CeramicDecision
      title="Connoisseur Network"
      hint="After this normal Office action, sell exactly one undelivered Masterpiece for 5 Coins and return its Vessel, or skip."
      ceramics={masterpieces}
      busy={busy}
      send={send}
      make={(ceramicId) => ({ type: "OFFICE_RESOLVE_CONNOISSEUR_NETWORK", ceramicId })}
      skip={{ type: "OFFICE_RESOLVE_CONNOISSEUR_NETWORK", ceramicId: null }}
    />
  );
}

function GuildControls({ game, player, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  busy: boolean;
  send: SendCommand;
}) {
  const { locale, t } = useI18n();
  if (game.phase.type !== "work_guild") return null;
  const worker = player.workers[game.phase.workerId];
  const ids = Object.values(game.displays.techniques).flat();
  if (game.phase.step === "refresh_or_skip") {
    return (
      <ControlSection title="Shifu refresh" hint="Return one face-up Technique to the bottom of its deck, or keep the display.">
        <div className="choice-stack playtest-command-grid technique-commands">{ids.map((techniqueId) => { const technique = TECHNIQUE_DEFINITIONS[techniqueId]; return <PieceCommandButton key={techniqueId} busy={busy} label={locale === "zh-CN" ? `替换${techniqueId} · ${technique?.nameZh ?? t("Unknown Technique")}` : `Replace ${techniqueId} · ${technique?.name ?? "Unknown Technique"}`} onClick={() => send({ type: "GUILD_REFRESH_TECHNIQUE", techniqueId })}><TechniqueSummary techniqueId={techniqueId} /></PieceCommandButton>; })}</div>
        <CommandButton busy={busy} send={send} command={{ type: "GUILD_SKIP_REFRESH" }} secondary>Keep the display</CommandButton>
      </ControlSection>
    );
  }
  return (
    <ControlSection title="Acquire a Technique" hint={worker?.kind === "shifu" ? "Your Shifu pays printed cost minus 1 Coin (minimum 1)." : "Your Apprentice pays the printed Coin cost."}>
      <div className="choice-stack playtest-command-grid technique-commands">{ids.map((techniqueId) => {
        const technique = TECHNIQUE_DEFINITIONS[techniqueId];
        const cost = guildTechniqueCost(techniqueId, worker?.kind ?? "apprentice");
        return <PieceCommandButton key={techniqueId} busy={busy || player.resources.coins < cost} label={`${techniqueId} · ${locale === "zh-CN" ? technique?.nameZh : technique?.name ?? t("Unknown Technique")} · ${cost} ${t("Coins")}`} onClick={() => send({ type: "GUILD_BUY_TECHNIQUE", techniqueId })}><TechniqueSummary techniqueId={techniqueId} shownCost={cost} /></PieceCommandButton>;
      })}</div>
    </ControlSection>
  );
}

function KilnSettingControls({ game, player, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  busy: boolean;
  send: SendCommand;
}) {
  const { t } = useI18n();
  const loaded = ownCeramics(game, player.id, "loaded");
  const occupied = new Set(Object.values(game.ceramics).filter((ceramic) => ceramic.stage === "loaded").map((ceramic) => ceramic.stage === "loaded" ? ceramic.kilnSpaceId : ""));
  const spaces = activeKilnSpaceIds(game.playerCount).filter((space) => !occupied.has(space));
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void send({ type: "RESOLVE_KILN_SETTING", ceramicId: required(data, "ceramic"), toSpaceId: required(data, "space") as KilnSpaceId });
  }
  return (
    <ControlSection title="Kiln Setting" hint="Move one loaded ceramic before everyone chooses Wood.">
      <form className="control-form" onSubmit={submit}>
        <CeramicSelect name="ceramic" label="Ceramic" ceramics={loaded} />
        <SelectField name="space" label="Empty destination" options={spaces} />
        <button className="primary-button" disabled={busy || loaded.length === 0 || spaces.length === 0}>{t("Move ceramic")}</button>
      </form>
      <CommandButton busy={busy} send={send} command={{ type: "RESOLVE_KILN_SETTING", ceramicId: null, toSpaceId: null }} secondary>Skip Kiln Setting</CommandButton>
    </ControlSection>
  );
}

function ContributionControls({ game, player, ownPlayerId, pending, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  ownPlayerId: PlayerId;
  pending: PendingContribution | null;
  busy: boolean;
  send: SendCommand;
}) {
  const { locale, t } = useI18n();
  if (game.phase.type !== "firing_contributions") return null;
  const eligible = game.phase.eligiblePlayerIds.includes(ownPlayerId);
  const submitted = game.phase.submittedPlayerIds.includes(ownPlayerId);
  if (!eligible) return <ControlSection title="The kiln is being fired" hint="Only players with loaded ceramics contribute Wood."><p>{t("You have no ceramic in this firing.")}</p></ControlSection>;
  if (submitted) return <ControlSection title="Contribution locked" hint="Other players cannot see your amount until every contributor submits."><p className="secret-value">{t("Your sealed choice:")} <strong>{pending?.amount ?? t("saved")} {t("Wood")}</strong></p></ControlSection>;
  return (
    <ControlSection title="Choose Wood in secret" hint="Your contribution stays private until every eligible player has locked a choice.">
      <div className="contribution-grid wood-card-grid">
        {([0, 1, 2, 3] as WoodContribution[]).map((amount) => (
          <button
            className="wood-card-choice"
            type="button"
            key={amount}
            disabled={busy || amount > player.resources.wood}
            onClick={() => void send({ type: "SUBMIT_WOOD_CONTRIBUTION", windowId: game.phase.type === "firing_contributions" ? game.phase.windowId : "", amount })}
            aria-label={locale === "zh-CN" ? `贡献${amount}柴薪` : `Contribute ${amount} Wood`}
          ><strong>{amount}</strong><span>{t("Wood")}</span></button>
        ))}
      </div>
    </ControlSection>
  );
}

function KilnAbilityControls({ game, player, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  busy: boolean;
  send: SendCommand;
}) {
  const loaded = ownCeramics(game, player.id, "loaded");
  const eligibleForGe = loaded.filter((ceramic) => game.firingContext?.ceramicResults[ceramic.id]?.naturalHeatDifference === 1);
  if (player.kilnId === "GE") {
    return <CeramicDecision title="Ge · Crackle from Fire" hint="Turn one difference-1 ceramic into a Crackle Masterpiece. The Crackle conversion is free and does not refund its original Decoration." ceramics={eligibleForGe} busy={busy} send={send} make={(ceramicId) => ({ type: "RESOLVE_GE", ceramicId })} skip={{ type: "RESOLVE_GE", ceramicId: null }} />;
  }
  return (
    <ControlSection title="Jun · Kiln Transformation" hint="Pay 2 Coins to adjust one of your ceramics by +1 or −1, or pass.">
      <JunForm ceramics={loaded} coins={player.resources.coins} busy={busy} send={send} />
      <CommandButton busy={busy} send={send} command={{ type: "RESOLVE_JUN", ceramicId: null, delta: null }} secondary>Skip Jun ability</CommandButton>
    </ControlSection>
  );
}

function SaggerSelectionControls({ game, player, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  busy: boolean;
  send: SendCommand;
}) {
  const loaded = ownCeramics(game, player.id, "loaded");
  return (
    <CeramicDecision
      title="Sagger Selection"
      hint="After the Fire card reveal, pay 2 Coins so one loaded ceramic treats only that Fire modifier as 0."
      ceramics={loaded}
      busy={busy}
      send={send}
      make={(ceramicId) => ({ type: "RESOLVE_SAGGER_SELECTION", ceramicId })}
      skip={{ type: "RESOLVE_SAGGER_SELECTION", ceramicId: null }}
    />
  );
}

function JunForm({ ceramics, coins, busy, send }: { ceramics: ReturnType<typeof ownCeramics>; coins: number; busy: boolean; send: SendCommand }) {
  const { t } = useI18n();
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void send({ type: "RESOLVE_JUN", ceramicId: required(data, "ceramic"), delta: Number(required(data, "delta")) as -1 | 1 });
  }
  return <form className="control-form" onSubmit={submit}><CeramicSelect name="ceramic" label="Ceramic" ceramics={ceramics} /><SelectField name="delta" label="Heat change" options={["-1", "1"]} /><button className="primary-button" disabled={busy || ceramics.length === 0 || coins < 2}>{t("Pay 2 Coins and apply heat change")}</button>{coins < 2 && <small role="status">{t("You need 2 Coins to use Jun.")}</small>}</form>;
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
  return <CeramicDecision title="Protective Saggars" hint="Pay 1 Coin to improve one result by one step: Flawed to Standard or Standard to Fine." ceramics={eligible} busy={busy} send={send} make={(ceramicId) => ({ type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId })} skip={{ type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: null }} />;
}

function SecondFiringControls({ game, player, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  busy: boolean;
  send: SendCommand;
}) {
  const standard = ownCeramics(game, player.id, "loaded").filter(
    (ceramic) => game.firingContext?.ceramicResults[ceramic.id]?.assignedQuality === "standard",
  );
  return <CeramicDecision title="Second Firing" hint="Return one Standard ceramic from this firing to your Glazed area, preserving its Shape, Glaze and Decoration." ceramics={standard} busy={busy} send={send} make={(ceramicId) => ({ type: "RESOLVE_SECOND_FIRING", ceramicId })} skip={{ type: "RESOLVE_SECOND_FIRING", ceramicId: null }} />;
}

function OrderControls({ game, player, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  busy: boolean;
  send: SendCommand;
}) {
  const { t } = useI18n();
  const ceramics = ownCeramics(game, player.id, "finished");
  return (
    <ControlSection title="Complete Orders" hint="You may complete any number of Orders, one at a time, then end your turn.">
      {player.orderHand.length === 0 ? <p>{t("No open Orders.")}</p> : player.orderHand.map((orderId) => (
        <OrderCompletion key={orderId} orderId={orderId} ceramics={ceramics} guan={player.kilnId === "GU" && !player.kilnAbilityUsedThisRound} busy={busy} send={send} />
      ))}
      <CommandButton busy={busy} send={send} command={{ type: "END_ORDER_TURN" }} secondary>End Order turn</CommandButton>
    </ControlSection>
  );
}

function OrderCompletion({ orderId, ceramics, guan, busy, send }: {
  orderId: string;
  ceramics: ReturnType<typeof ownCeramics>;
  guan: boolean;
  busy: boolean;
  send: SendCommand;
}) {
  const { locale, t } = useI18n();
  const definition = ORDER_DEFINITIONS[orderId];
  const [selected, setSelected] = useState<string[]>([]);
  const [useWaiver, setUseWaiver] = useState(false);
  const selectedCeramics = selected
    .map((ceramicId) => ceramics.find((ceramic) => ceramic.id === ceramicId))
    .filter((ceramic): ceramic is FinishedCeramic => ceramic?.stage === "finished");
  const matches = definition !== undefined && matchesOrder(definition, selectedCeramics, useWaiver);
  const requiredCount = definition?.ceramics.length ?? 0;
  const selectionStatus = locale === "zh-CN"
    ? selected.length === 0
      ? `请选择恰好${requiredCount}件已完成陶瓷。`
      : selected.length !== requiredCount
        ? `已选择${selected.length}件；此订单需要恰好${requiredCount}件。`
        : matches
          ? "所选陶瓷符合此订单；提交后服务器会再次验证。"
          : "所选陶瓷不符合订单的器型、釉色、装饰、组合关系或最低品质要求。"
    : selected.length === 0
      ? `Select exactly ${requiredCount} Finished ceramic${requiredCount === 1 ? "" : "s"}.`
      : selected.length !== requiredCount
        ? `Selected ${selected.length}; this Order requires exactly ${requiredCount}.`
        : matches
          ? "Selection satisfies this Order. The server will validate again on submission."
          : "Selection does not satisfy the Order's Shape, Glaze, Decoration, relationship, or minimum Quality requirements.";
  return (
    <article className="completion-card">
      <OrderCard orderId={orderId} imperial={orderId.startsWith("I")} />
      <fieldset><legend>{t("Deliver ceramics")}</legend>{ceramics.map((ceramic) => (
        <label className="check-row" key={ceramic.id}><input type="checkbox" checked={selected.includes(ceramic.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, ceramic.id] : current.filter((id) => id !== ceramic.id))} />{ceramicLabel(ceramic, locale)}</label>
      ))}</fieldset>
      <label className={`check-row ${guan && orderId.startsWith("I") ? "" : "is-hidden"}`}><input type="checkbox" name={`guan-${orderId}`} checked={useWaiver} onChange={(event) => setUseWaiver(event.target.checked)} /> {t("Use Guan Decoration waiver")}</label>
      <p className={matches ? "selection-valid" : "control-hint"} role="status">{selectionStatus}</p>
      <button
        className="primary-button"
        type="button"
        disabled={busy || !matches}
        onClick={() => {
          void send({ type: "COMPLETE_ORDER", orderId, ceramicIds: selected, useGuanWaiver: useWaiver });
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
  const maximum = IMPERIAL_PROGRESS.exhibition.capacityByProgress[player.imperialProgress]!;
  if (submitted) return <ControlSection title="Exhibition submitted" hint="Waiting for the other workshops." />;
  const hint = locale === "zh-CN"
    ? player.imperialProgress >= 4
      ? `展出0–${maximum}件已完成、未交付且品质为标准品或更高的陶瓷。恰好3件器型各不相同和／或釉色各不相同，各获得+2分；不展出没有惩罚。`
      : `展出0–${maximum}件已完成、未交付且品质为标准品或更高的陶瓷。多样性奖励要求最终御用进度达到4–5。`
    : player.imperialProgress >= 4
      ? `Exhibit 0–${maximum} finished, undelivered Standard-or-better ceramics. Exactly three different Shapes and/or Glazes earn +2 VP each; exhibiting nothing has no penalty.`
      : `Exhibit 0–${maximum} finished, undelivered Standard-or-better ceramic${maximum === 1 ? "" : "s"}. Diversity bonuses require final Imperial Progress 4–5.`;
  return <SelectionSubmission title="End-game Exhibition" hint={hint} options={ceramics.map((ceramic) => ceramicOption(ceramic, locale))} maximum={maximum} busy={busy} submitLabel="Submit Exhibition" onSubmit={(ceramicIds) => send({ type: "SUBMIT_PRESENTATION", ceramicIds })} />;
}

function FinalResults({ game }: { game: PublicGameState }) {
  const { locale, t } = useI18n();
  if (game.finalResult === null) return null;
  return (
    <ControlSection title="Final results" hint={locale === "zh-CN" ? `判定依据：${finalResolutionLabel(game.finalResult.resolvedBy, locale)}。` : `Resolved by ${finalResolutionLabel(game.finalResult.resolvedBy, locale)}.`}>
      <div className="score-table-scroll">
        <table className="score-table" aria-label={locale === "zh-CN" ? "最终分数明细" : "Final score breakdown"}>
          <thead><tr><th>{locale === "zh-CN" ? "作坊" : "Workshop"}</th><th>{t("Orders")}</th><th>{t("Imperial Progress")}</th><th>{t("Imperial Seal")}</th><th>{t("End-game Exhibition")}</th><th>{locale === "zh-CN" ? "窑口／效果" : "Kiln / effects"}</th><th>{t("Coins")}</th><th>{locale === "zh-CN" ? "总分" : "Total"}</th></tr></thead>
          <tbody>{game.playerOrder.map((playerId) => {
            const score = game.finalResult?.scores[playerId];
            const winner = game.finalResult?.winnerIds.includes(playerId) ?? false;
            return <tr className={winner ? "winner" : ""} key={playerId}><th>{game.players[playerId]?.displayName}{winner && <em>{locale === "zh-CN" ? "胜者" : "Winner"}</em>}</th><td>{score?.orders ?? 0}</td><td>{score?.imperialProgress ?? 0}</td><td>{score?.imperialSeal ?? 0}</td><td>{score?.presentation ?? 0}</td><td>{score?.immediateAbilities ?? 0}</td><td>{score?.leftoverCoins ?? 0}</td><td><strong>{score?.total ?? 0} {t("VP")}</strong></td></tr>;
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
    imperial_progress: "御用进度",
    completed_imperial_orders: "已完成御用订单数量",
    masterpieces_delivered_or_presented: "已交付或展陈的杰作数量",
    shared_victory: "共享胜利",
  } : {
    total_vp: "total VP",
    imperial_progress: "Imperial Progress",
    completed_imperial_orders: "completed Imperial Orders",
    masterpieces_delivered_or_presented: "Masterpieces delivered or exhibited",
    shared_victory: "shared victory",
  };
  return labels[resolvedBy];
}

function BinaryDecision({ title, hint, action, busy, send }: {
  title: string;
  hint: string;
  action: "RESOLVE_FUEL_LEDGER" | "RESOLVE_TEST_PIECES" | "RESOLVE_KILN_RECORDS";
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

function SelectionSubmission({ title, hint, options, maximum, busy, submitLabel, onSubmit }: {
  title: string;
  hint: string;
  options: Array<{ value: string; label: string }>;
  maximum: number;
  busy: boolean;
  submitLabel: string;
  onSubmit: (values: string[]) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string[]>([]);
  return <ControlSection title={title} hint={hint}><fieldset><legend>{t("Select up to {maximum}", { maximum })}</legend>{options.map((option) => <label className="check-row" key={option.value}><input type="checkbox" checked={selected.includes(option.value)} disabled={!selected.includes(option.value) && selected.length >= maximum} onChange={(event) => setSelected((current) => event.target.checked ? [...current, option.value] : current.filter((value) => value !== option.value))} />{option.label}</label>)}</fieldset><button className="primary-button" type="button" disabled={busy} onClick={() => void onSubmit(selected)}>{t(submitLabel)}</button></ControlSection>;
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
  return workerKind === "shifu" ? Math.max(1, printedCost - 1) : printedCost;
}

function officeActionHint(action: OfficeActionChoice, workerKind: AvailableWorker["kind"] | undefined, locale: Locale = "en"): string {
  if (locale === "zh-CN") {
    switch (action) {
      case "coins": return `获得${workerKind === "shifu" ? 4 : 2}铜钱。`;
      case "take_one": return "拿取1张正面订单，或确认盲抽1张牌堆顶订单。";
      case "take_up_to_two": return "拿取至多2张订单；每次可分别选择正面或盲抽。";
      case "take_one_and_gain_two_coins": return "拿取1张正面或盲抽订单，然后获得2铜钱。";
      case "court_patronage": return "支付5铜钱，使御用进度前进1格；不能使用釉色样本或出售瑕疵品。";
    }
  }
  switch (action) {
    case "coins":
      return `Gain ${workerKind === "shifu" ? 4 : 2} Coins.`;
    case "take_one":
      return "Take one face-up Order or commit to a blind top-deck draw.";
    case "take_up_to_two":
      return "Take up to two Orders, choosing face-up or blind separately each time.";
    case "take_one_and_gain_two_coins":
      return "Take one face-up or blind Order, then gain 2 Coins.";
    case "court_patronage":
      return "Pay 5 Coins to advance Imperial Progress by 1; no Colour Samples or Flawed sale.";
  }
}

function localizeActionError(locale: Locale, error: string): string {
  if (locale === "en") return error;
  const errors: Record<string, string> = {
    "Forming Studio is full.": "成型作坊已满。",
    "Glaze Workshop is full.": "施釉作坊已满。",
    "Kiln Yard is full.": "入窑场已满。",
    "Market & Imperial Office is full.": "市场与内府署已满。",
    "Guild & Academy is full.": "行会与书院已满。",
    "Choose an available worker.": "请选择1名可用工人。",
    "An Apprentice may form only one vessel.": "学徒只能成型1件器物。",
    "Ding's extra vessel must match a selected base Shape.": "定窑额外器物必须与所选基础器型相同。",
    "Clay Substitution needs one payment target.": "代土工法需要选择1个费用目标。",
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
    "Court Patronage requires your Shifu.": "朝廷赞助必须由师傅执行。",
    "Complete an Imperial Order first.": "请先完成至少1张御用订单。",
    "You need 5 Coins for Court Patronage.": "朝廷赞助需要5铜钱。",
    "Progress 4 must reach 5 through an Imperial Order.": "从进度4到5必须通过完成御用订单。",
    "You are already at Progress 5.": "你的御用进度已在5格。",
    "No face-up Technique is available.": "没有正面的技术可用。",
    "No face-up Technique is affordable.": "没有买得起的正面技术。",
    "Materials Yard is full.": "原料场已满。",
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
    case "coins": return "获得铜钱";
    case "take_one": return "拿取1张订单";
    case "take_up_to_two": return "拿取至多2张订单";
    case "take_one_and_gain_two_coins": return "拿取1张订单并获得2铜钱";
    case "court_patronage": return "朝廷赞助";
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
