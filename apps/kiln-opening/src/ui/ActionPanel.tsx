import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  DECORATIONS,
  DECORATION_COSTS,
  GAME_CONFIG,
  GLAZES,
  KILN_DEFINITIONS,
  KILN_IDS,
  KILN_SPACE_IDS,
  LOCATION_IDS,
  ORDER_DEFINITIONS,
  SHAPE_COSTS,
  SHAPES,
  TECHNIQUE_DEFINITIONS,
  currentDecisionActor,
  locationCapacity,
} from "../game";
import type {
  Decoration,
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
import { LOCATION_LABELS } from "./tabletop/assetCatalog";
import type { TabletopSelection } from "./tabletop/TabletopScene";
import { VisualOrderCard, VisualTechniqueTile, WoodCard, workshopBackground } from "./tabletop/TabletopPieces";

type SendCommand = (command: AuthoritativeCommand) => Promise<boolean>;

interface ActionPanelProps {
  game: PublicGameState;
  ownPlayerId: PlayerId;
  ownPendingContribution: PendingContribution | null;
  busy: boolean;
  send: SendCommand;
  tabletopSelection?: TabletopSelection | undefined;
  debugUI?: boolean | undefined;
}

const labels: Record<string, string> = {
  bowl: "Bowl",
  plate: "Plate",
  washer: "Washer",
  vase: "Vase",
  censer: "Censer",
  white: "White",
  celadon: "Celadon",
  grey_green: "Grey-green",
  moon_white: "Moon white",
  plain: "Plain",
  carved: "Carved",
  impressed: "Impressed",
  crackle: "Crackle",
};

export function ActionPanel({
  game,
  ownPlayerId,
  ownPendingContribution,
  busy,
  send,
  tabletopSelection,
  debugUI = false,
}: ActionPanelProps) {
  const player = game.players[ownPlayerId];
  if (player === undefined) return null;
  const decisionActor = currentDecisionActor(game.phase);

  return (
    <aside className="action-rail" aria-label="Game controls">
      <div className="action-heading">
        <p className="eyebrow">Your workshop</p>
        <h2>{tabletopSelection?.locationId !== null && tabletopSelection?.locationId !== undefined
          ? LOCATION_LABELS[tabletopSelection.locationId]
          : decisionActor === ownPlayerId || decisionActor === null ? "Choose your action" : "Watch the table"}</h2>
      </div>
      <PhaseControls
        game={game}
        player={player}
        ownPlayerId={ownPlayerId}
        ownPendingContribution={ownPendingContribution}
        busy={busy}
        send={send}
        tabletopSelection={tabletopSelection}
        debugUI={debugUI}
      />
    </aside>
  );
}

function PhaseControls(props: Omit<ActionPanelProps, "ownPlayerId"> & {
  ownPlayerId: PlayerId;
  player: PublicPlayerState;
}) {
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
          {orderId !== undefined && <div className="starting-order-piece"><VisualOrderCard orderId={orderId} /></div>}
          <div className="button-row">
            <CommandButton busy={busy} send={send} command={{ type: "KEEP_STARTING_ORDER" }}>Keep Order</CommandButton>
            <CommandButton busy={busy} send={send} command={{ type: "REDRAW_STARTING_ORDER" }} secondary>Redraw</CommandButton>
          </div>
        </ControlSection>
      );
    }
    case "work":
      return <WorkControls game={game} player={player} busy={busy} send={send} tabletopSelection={props.tabletopSelection} debugUI={props.debugUI} />;
    case "work_office_orders":
      return <OfficeControls game={game} player={player} busy={busy} send={send} />;
    case "work_office_sale":
      return <OfficeSaleControls game={game} player={player} busy={busy} send={send} />;
    case "work_guild":
      return <GuildControls game={game} player={player} busy={busy} send={send} />;
    case "firing_before_contribution":
      return <KilnSettingControls game={game} player={player} busy={busy} send={send} />;
    case "firing_after_reveal":
      return <BinaryDecision title="Fuel Ledger" hint="Pay 1 Wood and 1 Coin to add 1 to your revealed contribution." action="RESOLVE_FUEL_LEDGER" busy={busy} send={send} />;
    case "firing_before_quality":
      return <KilnAbilityControls game={game} player={player} busy={busy} send={send} />;
    case "firing_after_quality":
      return <SaggarsControls game={game} player={player} busy={busy} send={send} />;
    case "firing_after_firing":
      return <BinaryDecision title="Test Pieces" hint="Use the Technique to gain 1 Coin for your natural exact heat match." action="RESOLVE_TEST_PIECES" busy={busy} send={send} />;
    case "orders":
      return <OrderControls game={game} player={player} busy={busy} send={send} />;
  }
}

function KilnSelection({ game, busy, send }: Pick<ActionPanelProps, "game" | "busy" | "send">) {
  const taken = new Set(Object.values(game.players).map((player) => player.kilnId));
  return (
    <ControlSection title="Choose a kiln tradition" hint="Selection runs in reverse seating order.">
      <div className="kiln-choice-grid">
        {KILN_IDS.map((kilnId) => {
          const kiln = KILN_DEFINITIONS[kilnId];
          return (
            <button
              className="kiln-choice"
              style={workshopBackground(kilnId)}
              type="button"
              disabled={busy || taken.has(kilnId)}
              onClick={() => void send({ type: "SELECT_KILN", kilnId })}
              key={kilnId}
            >
              <span><b>{kiln.nameZh}</b><strong>{kiln.name}</strong></span>
              <small>{kiln.abilityName}</small>
              <p>{kiln.ability}</p>
              {taken.has(kilnId) && <em>Taken</em>}
            </button>
          );
        })}
      </div>
    </ControlSection>
  );
}

function WorkControls({ game, player, busy, send, tabletopSelection, debugUI = false }: {
  game: PublicGameState;
  player: PublicPlayerState;
  busy: boolean;
  send: SendCommand;
  tabletopSelection?: TabletopSelection | undefined;
  debugUI?: boolean | undefined;
}) {
  const availableWorkers = Object.values(player.workers).filter((worker) => worker.status === "available");
  const workers = tabletopSelection?.workerId === null || tabletopSelection?.workerId === undefined
    ? availableWorkers
    : [...availableWorkers].sort((left, right) => Number(right.id === tabletopSelection.workerId) - Number(left.id === tabletopSelection.workerId));
  const full = (locationId: LocationId): boolean =>
    game.actionBoard.placements[locationId].length >= locationCapacity(locationId, game.playerCount);
  if (workers.length === 0) {
    return (
      <ControlSection title="No workers remain" hint="Pass to finish your Work Phase participation.">
        <CommandButton busy={busy} send={send} command={{ type: "PASS_WORK_PHASE" }}>Pass for this round</CommandButton>
      </ControlSection>
    );
  }
  const action = (locationId: LocationId, hint: string, content: ReactNode) => (
    <details className={`action-card ${full(locationId) ? "is-unavailable" : ""}`} open={!debugUI || locationId === "materials_yard"} key={`${locationId}-${tabletopSelection?.workerId ?? "default"}`}>
      <summary><span>{LOCATION_LABELS[locationId]}</span><small>{full(locationId) ? "Full" : hint}</small></summary>
      {content}
    </details>
  );
  const actions: Record<LocationId, ReactNode> = {
    materials_yard: action("materials_yard", "Gain Clay and Wood", <MaterialsForm workers={workers} locationFull={full("materials_yard")} busy={busy} send={send} />),
    forming_studio: action("forming_studio", "Shape vessels", <FormCeramicsForm game={game} player={player} workers={workers} locationFull={full("forming_studio")} busy={busy} send={send} />),
    glaze_workshop: action("glaze_workshop", "Glaze and decorate", <GlazeForm game={game} player={player} workers={workers} locationFull={full("glaze_workshop")} busy={busy} send={send} />),
    kiln_yard: action("kiln_yard", "Load ceramics", <KilnYardForm game={game} player={player} workers={workers} locationFull={full("kiln_yard")} busy={busy} send={send} />),
    market_imperial_office: action("market_imperial_office", "Orders or Coins, plus an optional sale", <OfficeActionForms game={game} player={player} workers={workers} locationFull={full("market_imperial_office")} busy={busy} send={send} />),
    guild_academy: action("guild_academy", "Shifu only", <GuildBeginForm game={game} player={player} workers={workers} locationFull={full("guild_academy")} busy={busy} send={send} />),
  };
  return (
    <>
      <p className="turn-callout"><strong>Your turn.</strong> Place one available worker, or pass permanently for this round.</p>
      {debugUI
        ? LOCATION_IDS.map((locationId) => actions[locationId])
        : tabletopSelection?.workerId === null || tabletopSelection?.workerId === undefined
          ? <div className="visual-action-prompt"><span aria-hidden="true">师</span><strong>Select a worker on your workshop board</strong><small>Available board locations will glow.</small></div>
          : tabletopSelection.locationId === null
            ? <div className="visual-action-prompt"><span aria-hidden="true">位</span><strong>Now choose a glowing board location</strong><small>The action form will appear here.</small></div>
            : actions[tabletopSelection.locationId]}
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
        Worker
        <select name="worker" value={selectedWorker?.id ?? ""} onChange={(event) => chooseWorker(event.target.value)} required>
          {workers.map((worker) => (
            <option key={worker.id} value={worker.id}>
              {worker.kind === "shifu" ? "Shifu" : "Apprentice"} · {worker.id}
            </option>
          ))}
        </select>
      </label>
      <div className="split-fields">
        <label>Clay<input type="number" name="clay" min={0} max={requiredTotal} step={1} value={clay} onChange={(event) => setClay(Number.isNaN(event.target.valueAsNumber) ? 0 : event.target.valueAsNumber)} required /></label>
        <label>Wood<input type="number" name="wood" min={0} max={requiredTotal} step={1} value={wood} onChange={(event) => setWood(Number.isNaN(event.target.valueAsNumber) ? 0 : event.target.valueAsNumber)} required /></label>
      </div>
      <small role="status" className={error === null ? "" : "control-error"}>
        {error ?? `${clay} Clay + ${wood} Wood = ${requiredTotal} resources.`}
      </small>
      <button className="primary-button" disabled={busy || error !== null || selectedWorker === undefined}>Gather materials</button>
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
      if (game.vesselSupplyCounts[shape] < count) return `Not enough ${labels[shape]} vessels remain.`;
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
      <label>First shape<select name="shape1" value={shape1} onChange={(event) => setShape1(event.target.value as Shape)}>{SHAPES.map((shape) => <option key={shape} value={shape}>{labels[shape]}</option>)}</select></label>
      <label>Second shape (Shifu only)<select name="shape2" value={shape2} onChange={(event) => setShape2(event.target.value as Shape | "")}><option value="">None</option>{SHAPES.map((shape) => <option key={shape} value={shape}>{labels[shape]}</option>)}</select></label>
      <TechniqueChecks techniqueIds={techniques} selected={activeTechniqueIds} onChange={setSelectedTechniques} />
      {techniques.includes("T03") && <label>Clay Substitution target<select name="substitution" value={activeSubstitution} disabled={!usesSubstitution} onChange={(event) => setSubstitution(event.target.value as "" | "base" | "ding")}><option value="">Do not use</option><option value="base">base</option><option value="ding">ding</option></select></label>}
      {canUseDing && <label>Ding extra matching shape<select name="ding" value={activeDing} onChange={(event) => setDing(event.target.value as Shape | "")}><option value="">Do not use</option>{(["bowl", "plate", "washer"] as Shape[]).map((shape) => <option key={shape} value={shape}>{labels[shape]}</option>)}</select></label>}
      <small role="status" className={error === null ? "" : "control-error"}>{error ?? `Cost: ${clayCost} Clay${coinCost > 0 ? ` and ${coinCost} Coin` : ""}.`}</small>
      <button className="primary-button" disabled={busy || error !== null}>Form ceramics</button>
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
  const ceramics = ownCeramics(game, player.id, "shaped");
  const techniques = ownedAvailableTechniques(player, ["T05", "T06", "T07"]);
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
    if (activeTechniqueIds.includes("T07") && new Set(selections.map((selection) => selection.glaze)).size < 2) {
      return "Glaze Notebook requires two different Glazes.";
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
      <EnumChoice name="decoration1" label="First decoration" options={DECORATIONS} value={decoration1} onChange={(value) => setDecoration1(value as Decoration)} formatOption={decorationOptionLabel} />
      <CeramicChoice name="ceramic2" label="Second ceramic (Shifu normal mode only)" ceramics={ceramics} value={secondId} onChange={setCeramic2} blank="None" />
      <EnumChoice name="glaze2" label="Second glaze" options={GLAZES} value={glaze2} onChange={(value) => setGlaze2(value as Glaze)} />
      <EnumChoice name="decoration2" label="Second decoration" options={DECORATIONS} value={decoration2} onChange={(value) => setDecoration2(value as Decoration)} formatOption={decorationOptionLabel} />
      <EnumChoice name="mode" label="Shifu mode" options={["normal", "free_single"]} value={mode} onChange={(value) => setMode(value as "normal" | "free_single")} />
      <TechniqueChecks techniqueIds={techniques} selected={activeTechniqueIds} onChange={setSelectedTechniques} />
      <small role="status" className={error === null ? "" : "control-error"}>{error ?? `Decoration cost: ${totalCoins} Coins.`}</small>
      <button className="primary-button" disabled={busy || error !== null}>Apply glaze</button>
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
  const ceramics = ownCeramics(game, player.id, "glazed");
  const occupied = new Set(Object.values(game.ceramics).filter((ceramic) => ceramic.stage === "loaded").map((ceramic) => ceramic.stage === "loaded" ? ceramic.kilnSpaceId : ""));
  const spaces = KILN_SPACE_IDS.filter((space) => !occupied.has(space));
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
        <p className="control-hint">Kiln Yard gives no Wood; loading an eligible ceramic is required.</p>
      ) : (
        <>
          <CeramicChoice name="ceramic1" label="First ceramic" ceramics={ceramics} value={firstId} onChange={setCeramic1} blank="Choose a ceramic" />
          <EnumChoice name="space1" label="First kiln space" options={spaces} value={firstSpace ?? ""} onChange={(value) => setSpace1(value as KilnSpaceId)} />
          <CeramicChoice name="ceramic2" label="Second ceramic (Shifu only)" ceramics={ceramics} value={secondId} onChange={setCeramic2} blank="None" />
          <EnumChoice name="space2" label="Second kiln space" options={spaces} value={secondSpace ?? ""} onChange={(value) => setSpace2(value as KilnSpaceId)} />
        </>
      )}
      <small role="status" className={error === null ? "" : "control-error"}>{error ?? `${loads.length} ceramic${loads.length === 1 ? "" : "s"} selected; Kiln Yard gives no Wood.`}</small>
      <button className="primary-button" disabled={busy || error !== null}>Load kiln</button>
    </form>
  );
}

type OfficeActionChoice = OfficeOrderMode | "coins";

function OfficeActionForms({ game, player, workers, locationFull, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  workers: AvailableWorker[];
  locationFull: boolean;
  busy: boolean;
  send: SendCommand;
}) {
  const [workerId, setWorkerId] = useState(workers[0]?.id ?? "");
  const [officeAction, setOfficeAction] = useState<OfficeActionChoice>("coins");
  const selectedWorker = workers.find((worker) => worker.id === workerId) ?? workers[0];
  const orderModes: OfficeActionChoice[] = selectedWorker?.kind === "shifu"
    ? ["coins", "take_up_to_two", "take_one_and_gain_two_coins"]
    : ["coins", "take_one"];
  const action = orderModes.includes(officeAction) ? officeAction : orderModes[0]!;
  const handLimit = player.kilnId === "GU" ? GAME_CONFIG.orderDisplay.guanHandLimit : GAME_CONFIG.orderDisplay.baseHandLimit;
  const displayCount = game.displays.market.length + game.displays.imperial.length;

  function validationError(): string | null {
    if (locationFull) return "Market & Imperial Office is full.";
    if (selectedWorker === undefined) return "Choose an available worker.";
    if ((action === "take_one" || action === "take_one_and_gain_two_coins") && player.orderHand.length >= handLimit) {
      return `Your Order area is full (${handLimit}).`;
    }
    if ((action === "take_one" || action === "take_one_and_gain_two_coins") && displayCount === 0) {
      return "No face-up Order is available.";
    }
    return null;
  }

  const error = validationError();
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (error !== null || selectedWorker === undefined) return;
    if (action === "coins") void send({ type: "OFFICE_GAIN_COINS", workerId: selectedWorker.id });
    else void send({ type: "BEGIN_OFFICE_ORDERS", workerId: selectedWorker.id, mode: action });
  }
  return (
    <form className="control-form" onSubmit={submit}>
      <p className="control-hint"><strong>Apprentice:</strong> Choose one: take 1 face-up Market or Imperial Order; or gain 2 Coins. In addition, you may sell 1 Flawed ceramic for 1 Coin.</p>
      <p className="control-hint"><strong>Shifu:</strong> Choose one: take up to 2 face-up Orders; take 1 face-up Order and gain 2 Coins; or gain 4 Coins. In addition, you may sell up to 2 Flawed ceramics for 1 Coin each.</p>
      <WorkerChoice workers={workers} value={selectedWorker?.id ?? ""} onChange={setWorkerId} />
      <EnumChoice name="officeAction" label="Office action" options={orderModes} value={action} onChange={(value) => setOfficeAction(value as OfficeActionChoice)} />
      <small role="status" className={error === null ? "" : "control-error"}>{error ?? officeActionHint(action, selectedWorker?.kind)}</small>
      <button className="primary-button" disabled={busy || error !== null}>Visit the Office</button>
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
  const shifu = workers.find((worker) => worker.kind === "shifu");
  const displayed = Object.values(game.displays.techniques).flat();
  const affordable = shifu === undefined ? [] : displayed.filter((techniqueId) =>
    guildTechniqueCost(techniqueId) <= player.resources.coins,
  );
  const error = locationFull
    ? "Guild & Academy is full."
    : shifu === undefined
      ? "Your Shifu is not available. Apprentices cannot use Guild & Academy."
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
      if (error === null && shifu !== undefined) void send({ type: "BEGIN_GUILD_ACTION", workerId: shifu.id });
    }}>
      <strong>Shifu only</strong>
      <p className="control-hint">Before choosing, you may return 1 face-up Technique to the bottom of its discipline deck and reveal a replacement. Then pay the printed Coin cost and take 1 face-up Technique.</p>
      <small role="status" className={error === null ? "" : "control-error"}>{error ?? `${affordable.length} affordable face-up Technique${affordable.length === 1 ? "" : "s"}.`}</small>
      <button className="primary-button" disabled={busy || error !== null}>Begin Guild action</button>
    </form>
  );
}

function OfficeControls({ game, player, busy, send }: Pick<ActionPanelProps, "game" | "busy" | "send"> & {
  player: PublicPlayerState;
}) {
  if (game.phase.type !== "work_office_orders") return null;
  const phase = game.phase;
  const display = phase.lastTakenDeck === "imperial" ? game.displays.imperial : phase.lastTakenDeck === "market" ? game.displays.market : [...game.displays.market, ...game.displays.imperial];
  const handLimit = player.kilnId === "GU" ? GAME_CONFIG.orderDisplay.guanHandLimit : GAME_CONFIG.orderDisplay.baseHandLimit;
  const handFull = player.orderHand.length >= handLimit;
  if (phase.step === "colour_samples") {
    return (
      <ControlSection title="Colour Samples" hint="Optionally discard one other Order from that display.">
        <div className="choice-stack visual-command-grid">{display.map((orderId) => <PieceCommandButton key={orderId} busy={busy} label={`Discard ${orderId}`} onClick={() => send({ type: "OFFICE_USE_COLOUR_SAMPLES", orderId })}><VisualOrderCard orderId={orderId} /></PieceCommandButton>)}</div>
        <CommandButton busy={busy} send={send} command={{ type: "OFFICE_SKIP_COLOUR_SAMPLES" }} secondary>Keep the display</CommandButton>
      </ControlSection>
    );
  }
  return (
    <ControlSection title="Take an Order" hint={handFull ? `Your Order area is full (${handLimit}); continue to the optional sale.` : `${phase.remainingTakes} selection${phase.remainingTakes === 1 ? "" : "s"} remaining.`}>
      <div className="choice-stack visual-command-grid">{display.map((orderId) => <PieceCommandButton key={orderId} busy={busy || handFull} label={`Take ${orderId}`} onClick={() => send({ type: "OFFICE_TAKE_ORDER", orderId })}><VisualOrderCard orderId={orderId} /></PieceCommandButton>)}</div>
      {phase.mode === "take_up_to_two" && <CommandButton busy={busy} send={send} command={{ type: "OFFICE_END_ORDERS" }} secondary>Continue to optional sale</CommandButton>}
    </ControlSection>
  );
}

function OfficeSaleControls({ game, player, busy, send }: Pick<ActionPanelProps, "game" | "busy" | "send"> & {
  player: PublicPlayerState;
}) {
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
  const saleSummary = validSelectedCeramics.length === 0
    ? "Continue without selling any ceramic."
    : `Sell ${validSelectedCeramics.map((ceramicId) => {
        const ceramic = flawed.find((candidate) => candidate.id === ceramicId);
        return ceramic === undefined ? ceramicId : ceramicLabel(ceramic);
      }).join(", ")}: +${validSelectedCeramics.length} Coin${validSelectedCeramics.length === 1 ? "" : "s"}.`;
  return (
    <form className="control-form" onSubmit={(event) => {
      event.preventDefault();
      void send({ type: "OFFICE_RESOLVE_FLAWED_SALE", ceramicIds: validSelectedCeramics });
    }}>
      <h3>Sell Flawed Ceramics</h3>
      <p className="control-hint">Optional secondary effect. {worker?.kind === "shifu" ? "Select up to 2" : "Select up to 1"}; gain 1 Coin per selected ceramic.</p>
      {flawed.length > 0 ? <fieldset><legend>Eligible Finished Flawed ceramics</legend>{flawed.map((ceramic) => {
        const checked = validSelectedCeramics.includes(ceramic.id);
        const atLimit = validSelectedCeramics.length >= selectionLimit;
        return <label className="check-row" key={ceramic.id}><input type="checkbox" name="ceramic" value={ceramic.id} checked={checked} disabled={!checked && atLimit} onChange={(event) => setSelectedCeramics((current) => event.target.checked ? [...current, ceramic.id] : current.filter((id) => id !== ceramic.id))} />{ceramicLabel(ceramic)}</label>;
      })}</fieldset> : <p className="control-hint">You have no eligible Finished Flawed ceramics.</p>}
      {game.commonSupply.coins < workerLimit && <p className="control-hint">The common supply can currently pay for {game.commonSupply.coins} sale{game.commonSupply.coins === 1 ? "" : "s"}.</p>}
      <small role="status">{saleSummary}</small>
      <button className="primary-button" disabled={busy}>{validSelectedCeramics.length === 0 ? "Continue without selling" : "Confirm sale and finish"}</button>
    </form>
  );
}

function GuildControls({ game, player, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  busy: boolean;
  send: SendCommand;
}) {
  if (game.phase.type !== "work_guild") return null;
  const ids = Object.values(game.displays.techniques).flat();
  if (game.phase.step === "refresh_or_skip") {
    return (
      <ControlSection title="Shifu refresh" hint="Return one face-up Technique to the bottom of its deck, or keep the display.">
        <div className="choice-stack visual-command-grid technique-commands">{ids.map((techniqueId) => <PieceCommandButton key={techniqueId} busy={busy} label={`Replace ${techniqueId} · ${TECHNIQUE_DEFINITIONS[techniqueId]?.name ?? "Unknown Technique"}`} onClick={() => send({ type: "GUILD_REFRESH_TECHNIQUE", techniqueId })}><VisualTechniqueTile techniqueId={techniqueId} /></PieceCommandButton>)}</div>
        <CommandButton busy={busy} send={send} command={{ type: "GUILD_SKIP_REFRESH" }} secondary>Keep the display</CommandButton>
      </ControlSection>
    );
  }
  return (
    <ControlSection title="Acquire a Technique" hint="Pay the selected Technique's printed Coin cost.">
      <div className="choice-stack visual-command-grid technique-commands">{ids.map((techniqueId) => {
        const technique = TECHNIQUE_DEFINITIONS[techniqueId];
        const cost = guildTechniqueCost(techniqueId);
        return <PieceCommandButton key={techniqueId} busy={busy || player.resources.coins < cost} label={`${techniqueId} · ${technique?.name ?? "Unknown Technique"} · ${cost} Coins`} onClick={() => send({ type: "GUILD_BUY_TECHNIQUE", techniqueId })}><VisualTechniqueTile techniqueId={techniqueId} /></PieceCommandButton>;
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
  const loaded = ownCeramics(game, player.id, "loaded");
  const occupied = new Set(Object.values(game.ceramics).filter((ceramic) => ceramic.stage === "loaded").map((ceramic) => ceramic.stage === "loaded" ? ceramic.kilnSpaceId : ""));
  const spaces = KILN_SPACE_IDS.filter((space) => !occupied.has(space));
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
        <button className="primary-button" disabled={busy || loaded.length === 0 || spaces.length === 0}>Move ceramic</button>
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
  if (game.phase.type !== "firing_contributions") return null;
  const eligible = game.phase.eligiblePlayerIds.includes(ownPlayerId);
  const submitted = game.phase.submittedPlayerIds.includes(ownPlayerId);
  if (!eligible) return <ControlSection title="The kiln is being fired" hint="Only players with loaded ceramics contribute Wood."><p>You have no ceramic in this firing.</p></ControlSection>;
  if (submitted) return <ControlSection title="Contribution locked" hint="Other players cannot see your amount until every contributor submits."><p className="secret-value">Your sealed choice: <strong>{pending?.amount ?? "saved"} Wood</strong></p></ControlSection>;
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
            aria-label={`Contribute ${amount} Wood`}
          ><WoodCard amount={amount} /><strong>{amount} Wood</strong></button>
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
    <ControlSection title="Jun · Kiln Transformation" hint="Adjust one of your ceramics by +1 or −1, or pass.">
      <JunForm ceramics={loaded} busy={busy} send={send} />
      <CommandButton busy={busy} send={send} command={{ type: "RESOLVE_JUN", ceramicId: null, delta: null }} secondary>Skip Jun ability</CommandButton>
    </ControlSection>
  );
}

function JunForm({ ceramics, busy, send }: { ceramics: ReturnType<typeof ownCeramics>; busy: boolean; send: SendCommand }) {
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void send({ type: "RESOLVE_JUN", ceramicId: required(data, "ceramic"), delta: Number(required(data, "delta")) as -1 | 1 });
  }
  return <form className="control-form" onSubmit={submit}><CeramicSelect name="ceramic" label="Ceramic" ceramics={ceramics} /><SelectField name="delta" label="Heat change" options={["-1", "1"]} /><button className="primary-button" disabled={busy || ceramics.length === 0}>Apply heat change</button></form>;
}

function SaggarsControls({ game, player, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  busy: boolean;
  send: SendCommand;
}) {
  const flawed = ownCeramics(game, player.id, "loaded").filter((ceramic) => game.firingContext?.ceramicResults[ceramic.id]?.assignedQuality === "flawed");
  return <CeramicDecision title="Protective Saggars" hint="Pay 1 Coin to improve one Flawed result to Standard." ceramics={flawed} busy={busy} send={send} make={(ceramicId) => ({ type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId })} skip={{ type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: null }} />;
}

function OrderControls({ game, player, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  busy: boolean;
  send: SendCommand;
}) {
  const ceramics = ownCeramics(game, player.id, "finished");
  return (
    <ControlSection title="Complete Orders" hint="You may complete any number of Orders, one at a time, then end your turn.">
      {player.orderHand.length === 0 ? <p>No open Orders.</p> : player.orderHand.map((orderId) => (
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
  const definition = ORDER_DEFINITIONS[orderId];
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <article className="completion-card">
      <OrderCard orderId={orderId} imperial={orderId.startsWith("I")} />
      <fieldset><legend>Deliver ceramics</legend>{ceramics.map((ceramic) => (
        <label className="check-row" key={ceramic.id}><input type="checkbox" checked={selected.includes(ceramic.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, ceramic.id] : current.filter((id) => id !== ceramic.id))} />{ceramicLabel(ceramic)}</label>
      ))}</fieldset>
      <label className={`check-row ${guan && orderId.startsWith("I") ? "" : "is-hidden"}`}><input type="checkbox" name={`guan-${orderId}`} id={`guan-${orderId}`} /> Use Guan Decoration waiver</label>
      <button
        className="primary-button"
        type="button"
        disabled={busy || definition === undefined || selected.length !== definition.ceramics.length}
        onClick={() => {
          const waiver = (document.getElementById(`guan-${orderId}`) as HTMLInputElement | null)?.checked ?? false;
          void send({ type: "COMPLETE_ORDER", orderId, ceramicIds: selected, useGuanWaiver: waiver });
        }}
      >Complete {orderId}</button>
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
  if (game.phase.type !== "presentation") return null;
  const eligible = game.phase.eligiblePlayerIds.includes(ownPlayerId);
  const submitted = game.phase.submittedPlayerIds.includes(ownPlayerId);
  const ceramics = ownCeramics(game, ownPlayerId, "finished").filter((ceramic) => ceramic.stage === "finished" && ceramic.quality !== "flawed");
  if (!eligible) return <ControlSection title="Imperial Presentation" hint="Only workshops at Progress spaces 4–5 may present."><p>You are observing the eligible workshops.</p></ControlSection>;
  if (submitted) return <ControlSection title="Presentation submitted" hint="Waiting for the other eligible workshops." />;
  return <SelectionSubmission title="Imperial Presentation" hint="Present 0–3 finished, undelivered Standard-or-better ceramics. Exactly three different Shapes and/or Glazes earn +2 VP each; presenting nothing has no penalty." options={ceramics.map(ceramicOption)} maximum={3} busy={busy} submitLabel="Submit Presentation" onSubmit={(ceramicIds) => send({ type: "SUBMIT_PRESENTATION", ceramicIds })} />;
}

function FinalResults({ game }: { game: PublicGameState }) {
  if (game.finalResult === null) return null;
  return (
    <ControlSection title="Final results" hint={`Resolved by ${game.finalResult.resolvedBy.replaceAll("_", " ")}.`}>
      <div className="score-table-scroll">
        <table className="score-table" aria-label="Final score breakdown">
          <thead><tr><th>Workshop</th><th>Orders</th><th>Imperial Progress</th><th>Imperial Seal</th><th>Presentation</th><th>Kiln / effects</th><th>Coins</th><th>Total</th></tr></thead>
          <tbody>{game.playerOrder.map((playerId) => {
            const score = game.finalResult?.scores[playerId];
            const winner = game.finalResult?.winnerIds.includes(playerId) ?? false;
            return <tr className={winner ? "winner" : ""} key={playerId}><th>{game.players[playerId]?.displayName}{winner && <em>Winner</em>}</th><td>{score?.orders ?? 0}</td><td>{score?.imperialProgress ?? 0}</td><td>{score?.imperialSeal ?? 0}</td><td>{score?.presentation ?? 0}</td><td>{score?.immediateAbilities ?? 0}</td><td>{score?.leftoverCoins ?? 0}</td><td><strong>{score?.total ?? 0} VP</strong></td></tr>;
          })}</tbody>
        </table>
      </div>
    </ControlSection>
  );
}

function BinaryDecision({ title, hint, action, busy, send }: {
  title: string;
  hint: string;
  action: "RESOLVE_FUEL_LEDGER" | "RESOLVE_TEST_PIECES";
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
  return <ControlSection title={title} hint={hint}><div className="choice-stack">{ceramics.map((ceramic) => <CommandButton key={ceramic.id} busy={busy} send={send} command={make(ceramic.id)}>{ceramicLabel(ceramic)}</CommandButton>)}</div><CommandButton busy={busy} send={send} command={skip} secondary>Skip</CommandButton></ControlSection>;
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
  const [selected, setSelected] = useState<string[]>([]);
  return <ControlSection title={title} hint={hint}><fieldset><legend>Select up to {maximum}</legend>{options.map((option) => <label className="check-row" key={option.value}><input type="checkbox" checked={selected.includes(option.value)} disabled={!selected.includes(option.value) && selected.length >= maximum} onChange={(event) => setSelected((current) => event.target.checked ? [...current, option.value] : current.filter((value) => value !== option.value))} />{option.label}</label>)}</fieldset><button className="primary-button" type="button" disabled={busy} onClick={() => void onSubmit(selected)}>{submitLabel}</button></ControlSection>;
}

function WorkerChoice({ workers, value, onChange }: {
  workers: AvailableWorker[];
  value: string;
  onChange: (workerId: string) => void;
}) {
  return <label>Worker<select name="worker" value={value} onChange={(event) => onChange(event.target.value)} required>{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.kind === "shifu" ? "Shifu" : "Apprentice"} · {worker.id}</option>)}</select></label>;
}

function CeramicSelect({ name, label, ceramics, blank }: {
  name: string;
  label: string;
  ceramics: ReturnType<typeof ownCeramics>;
  blank?: string;
}) {
  return <label>{label}<select name={name} required={blank === undefined}>{blank !== undefined && <option value="">{blank}</option>}{ceramics.map((ceramic) => <option key={ceramic.id} value={ceramic.id}>{ceramicLabel(ceramic)}</option>)}</select></label>;
}

function CeramicChoice({ name, label, ceramics, blank, value, onChange }: {
  name: string;
  label: string;
  ceramics: ReturnType<typeof ownCeramics>;
  blank?: string;
  value: string;
  onChange: (ceramicId: string) => void;
}) {
  return <label>{label}<select name={name} value={value} required={blank === undefined} onChange={(event) => onChange(event.target.value)}>{blank !== undefined && <option value="">{blank}</option>}{ceramics.map((ceramic) => <option key={ceramic.id} value={ceramic.id}>{ceramicLabel(ceramic)}</option>)}</select></label>;
}

function SelectField({ name, label, options, blank }: {
  name: string;
  label: string;
  options: readonly (string | number)[];
  blank?: string;
}) {
  return <label>{label}<select name={name} required={blank === undefined}>{blank !== undefined && <option value="">{blank}</option>}{options.map((option) => <option key={option} value={option}>{labels[String(option)] ?? String(option).replaceAll("_", " ")}</option>)}</select></label>;
}

function decorationOptionLabel(option: string): string {
  const decoration = option as Decoration;
  const cost = DECORATION_COSTS[decoration];
  return `${labels[option] ?? option} · ${cost} Coin${cost === 1 ? "" : "s"}`;
}

function EnumChoice({ name, label, options, value, onChange, formatOption }: {
  name: string;
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  formatOption?: (option: string) => string;
}) {
  return <label>{label}<select name={name} value={value} onChange={(event) => onChange(event.target.value)} required>{options.map((option) => <option key={option} value={option}>{formatOption?.(option) ?? labels[option] ?? option.replaceAll("_", " ")}</option>)}</select></label>;
}

function TechniqueChecks({ techniqueIds, selected, onChange }: {
  techniqueIds: TechniqueId[];
  selected: TechniqueId[];
  onChange: (techniqueIds: TechniqueId[]) => void;
}) {
  if (techniqueIds.length === 0) return null;
  return <fieldset><legend>Use Techniques</legend>{techniqueIds.map((techniqueId) => <label className="check-row" key={techniqueId}><input type="checkbox" name="technique" value={techniqueId} checked={selected.includes(techniqueId)} onChange={(event) => onChange(event.target.checked ? [...selected, techniqueId] : selected.filter((id) => id !== techniqueId))} />{techniqueId} · {TECHNIQUE_DEFINITIONS[techniqueId]?.name ?? "Unknown Technique"}</label>)}</fieldset>;
}

function PieceCommandButton({ busy, label, onClick, children }: {
  busy: boolean;
  label: string;
  onClick: () => Promise<boolean>;
  children: ReactNode;
}) {
  return (
    <button className="primary-button visual-piece-command" type="button" disabled={busy} onClick={() => void onClick()} aria-label={label} title={label}>
      {children}
      <strong>{label}</strong>
    </button>
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
  return <button className={secondary ? "secondary-button" : danger ? "danger-button" : "primary-button"} type="button" disabled={busy || disabled} onClick={() => void send(command)}>{children}</button>;
}

function ControlSection({ title, hint, children }: { title: string; hint: string; children?: ReactNode }) {
  return <section className="control-section"><h3>{title}</h3><p className="control-hint">{hint}</p>{children}</section>;
}

function Waiting({ game, actorId }: { game: PublicGameState; actorId: PlayerId }) {
  return <ControlSection title="Another workshop is deciding" hint="The table updates automatically."><div className="waiting-pot" aria-hidden="true">窑</div><p>Waiting for <strong>{game.players[actorId]?.displayName}</strong>…</p></ControlSection>;
}

function ownCeramics(game: PublicGameState, playerId: PlayerId, stage: string) {
  return Object.values(game.ceramics).filter((ceramic) => ceramic.ownerId === playerId && ceramic.stage === stage);
}

function ownedAvailableTechniques(player: PublicPlayerState, allowed: TechniqueId[]): TechniqueId[] {
  return player.techniques.filter((technique) => !technique.exhausted && allowed.includes(technique.id)).map((technique) => technique.id);
}

function guildTechniqueCost(techniqueId: TechniqueId): number {
  const printedCost = TECHNIQUE_DEFINITIONS[techniqueId]?.cost ?? Number.POSITIVE_INFINITY;
  return printedCost;
}

function officeActionHint(action: OfficeActionChoice, workerKind: AvailableWorker["kind"] | undefined): string {
  switch (action) {
    case "coins":
      return `Gain ${workerKind === "shifu" ? 4 : 2} Coins.`;
    case "take_one":
      return "Take one face-up Order.";
    case "take_up_to_two":
      return "Take up to two face-up Orders.";
    case "take_one_and_gain_two_coins":
      return "Take one face-up Order, then gain 2 Coins.";
  }
}

function ceramicLabel(ceramic: ReturnType<typeof ownCeramics>[number]): string {
  const decoration = "decoration" in ceramic ? ` · ${labels[ceramic.glaze]} · ${labels[ceramic.decoration]}` : "";
  const quality = "quality" in ceramic ? ` · ${ceramic.quality}` : "";
  return `${ceramic.id.split(":").at(-1)} · ${labels[ceramic.shape]}${decoration}${quality}`;
}

function ceramicOption(ceramic: ReturnType<typeof ownCeramics>[number]) {
  return { value: ceramic.id, label: ceramicLabel(ceramic) };
}

function required(data: FormData, name: string): string {
  const value = data.get(name);
  if (typeof value !== "string" || value === "") throw new Error(`Missing form field ${name}`);
  return value;
}
