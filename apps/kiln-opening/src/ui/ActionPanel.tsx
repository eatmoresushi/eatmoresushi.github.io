import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  DECORATIONS,
  GLAZES,
  KILN_DEFINITIONS,
  KILN_IDS,
  KILN_SPACE_IDS,
  ORDER_DEFINITIONS,
  SHAPES,
  TECHNIQUE_DEFINITIONS,
  currentDecisionActor,
} from "../game";
import type {
  Decoration,
  GameAction,
  Glaze,
  KilnId,
  KilnSpaceId,
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

type SendCommand = (command: AuthoritativeCommand) => Promise<boolean>;

interface ActionPanelProps {
  game: PublicGameState;
  ownPlayerId: PlayerId;
  ownPendingContribution: PendingContribution | null;
  busy: boolean;
  send: SendCommand;
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
}: ActionPanelProps) {
  const player = game.players[ownPlayerId];
  if (player === undefined) return null;
  const decisionActor = currentDecisionActor(game.phase);

  return (
    <aside className="action-rail" aria-label="Game controls">
      <div className="action-heading">
        <p className="eyebrow">Your workshop</p>
        <h2>{decisionActor === ownPlayerId || decisionActor === null ? "Choose your action" : "Watch the table"}</h2>
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
          {orderId !== undefined && <OrderCard orderId={orderId} imperial={orderId.startsWith("I")} />}
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
      return <OfficeControls game={game} busy={busy} send={send} />;
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

function WorkControls({ game, player, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  busy: boolean;
  send: SendCommand;
}) {
  const workers = Object.values(player.workers).filter((worker) => worker.status === "available");
  if (workers.length === 0) {
    return (
      <ControlSection title="No workers remain" hint="Pass to finish your Work Phase participation.">
        <CommandButton busy={busy} send={send} command={{ type: "PASS_WORK_PHASE" }}>Pass for this round</CommandButton>
      </ControlSection>
    );
  }
  return (
    <>
      <p className="turn-callout"><strong>Your turn.</strong> Place one available worker, or pass permanently for this round.</p>
      <details className="action-card" open>
        <summary><span>Materials Yard</span><small>Gain Clay and Wood</small></summary>
        <MaterialsForm workers={workers} busy={busy} send={send} />
      </details>
      <details className="action-card">
        <summary><span>Forming Studio</span><small>Shape vessels</small></summary>
        <FormCeramicsForm player={player} workers={workers} busy={busy} send={send} />
      </details>
      <details className="action-card">
        <summary><span>Glaze Workshop</span><small>Glaze and decorate</small></summary>
        <GlazeForm game={game} player={player} workers={workers} busy={busy} send={send} />
      </details>
      <details className="action-card">
        <summary><span>Kiln Yard</span><small>Load ceramics</small></summary>
        <KilnYardForm game={game} player={player} workers={workers} busy={busy} send={send} />
      </details>
      <details className="action-card">
        <summary><span>Market & Imperial Office</span><small>Coins, Orders, or flawed sales</small></summary>
        <OfficeActionForms game={game} player={player} workers={workers} busy={busy} send={send} />
      </details>
      <details className="action-card">
        <summary><span>Guild & Academy</span><small>Acquire a Technique</small></summary>
        <SimpleWorkerForm
          workers={workers}
          busy={busy}
          label="Begin Guild action"
          onSubmit={(workerId) => send({ type: "BEGIN_GUILD_ACTION", workerId })}
        />
      </details>
      <CommandButton busy={busy} send={send} command={{ type: "PASS_WORK_PHASE" }} danger>
        Pass for this round
      </CommandButton>
    </>
  );
}

type AvailableWorker = PublicPlayerState["workers"][string];

function MaterialsForm({ workers, busy, send }: { workers: AvailableWorker[]; busy: boolean; send: SendCommand }) {
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void send({
      type: "GAIN_MATERIALS",
      workerId: required(data, "worker") as WorkerId,
      clay: Number(required(data, "clay")),
      wood: Number(required(data, "wood")),
    });
  }
  return (
    <form className="control-form" onSubmit={submit}>
      <WorkerSelect workers={workers} />
      <div className="split-fields">
        <NumberField name="clay" label="Clay" max={3} defaultValue={2} />
        <NumberField name="wood" label="Wood" max={3} defaultValue={1} />
      </div>
      <small>Shifu: up to 3 total. Apprentice: up to 2.</small>
      <button className="primary-button" disabled={busy}>Gather materials</button>
    </form>
  );
}

function FormCeramicsForm({ player, workers, busy, send }: {
  player: PublicPlayerState;
  workers: AvailableWorker[];
  busy: boolean;
  send: SendCommand;
}) {
  const techniques = ownedAvailableTechniques(player, ["T01", "T02", "T03", "T04"]);
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const shapes = [required(data, "shape1"), optional(data, "shape2")].filter(Boolean) as Shape[];
    const selectedTechniques = data.getAll("technique") as TechniqueId[];
    const substitution = optional(data, "substitution");
    const ding = optional(data, "ding");
    const command: Extract<GameAction, { type: "FORM_CERAMICS" }> = {
      type: "FORM_CERAMICS",
      workerId: required(data, "worker") as WorkerId,
      shapes,
      useTechniqueIds: selectedTechniques,
    };
    if (substitution === "base" || substitution === "ding") command.claySubstitutionTarget = substitution;
    if (ding !== "") command.dingExtraShape = ding as Shape;
    void send(command);
  }
  return (
    <form className="control-form" onSubmit={submit}>
      <WorkerSelect workers={workers} />
      <SelectField name="shape1" label="First shape" options={SHAPES} />
      <SelectField name="shape2" label="Second shape (Shifu only)" options={SHAPES} blank="None" />
      <TechniqueChecks techniqueIds={techniques} />
      {techniques.includes("T03") && <SelectField name="substitution" label="Clay Substitution target" options={["base", "ding"]} blank="Do not use" />}
      {player.kilnId === "DI" && !player.kilnAbilityUsedThisRound && <SelectField name="ding" label="Ding extra matching shape" options={["bowl", "plate", "washer"]} blank="Do not use" />}
      <button className="primary-button" disabled={busy}>Form ceramics</button>
    </form>
  );
}

function GlazeForm({ game, player, workers, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  workers: AvailableWorker[];
  busy: boolean;
  send: SendCommand;
}) {
  const ceramics = ownCeramics(game, player.id, "shaped");
  const techniques = ownedAvailableTechniques(player, ["T05", "T06", "T07"]);
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const ids = [required(data, "ceramic1"), optional(data, "ceramic2")].filter(Boolean);
    const selections = ids.map((ceramicId, index) => ({
      ceramicId,
      glaze: required(data, `glaze${index + 1}`) as Glaze,
      decoration: required(data, `decoration${index + 1}`) as Decoration,
    }));
    void send({
      type: "GLAZE_CERAMICS",
      workerId: required(data, "worker") as WorkerId,
      selections,
      shifuMode: required(data, "mode") as "normal" | "free_single",
      useTechniqueIds: data.getAll("technique") as TechniqueId[],
    });
  }
  return (
    <form className="control-form" onSubmit={submit}>
      <WorkerSelect workers={workers} />
      <CeramicSelect name="ceramic1" label="First ceramic" ceramics={ceramics} />
      <SelectField name="glaze1" label="First glaze" options={GLAZES} />
      <SelectField name="decoration1" label="First decoration" options={DECORATIONS} />
      <CeramicSelect name="ceramic2" label="Second ceramic (Shifu only)" ceramics={ceramics} blank="None" />
      <SelectField name="glaze2" label="Second glaze" options={GLAZES} />
      <SelectField name="decoration2" label="Second decoration" options={DECORATIONS} />
      <SelectField name="mode" label="Shifu mode" options={["normal", "free_single"]} />
      <TechniqueChecks techniqueIds={techniques} />
      <button className="primary-button" disabled={busy || ceramics.length === 0}>Apply glaze</button>
    </form>
  );
}

function KilnYardForm({ game, player, workers, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  workers: AvailableWorker[];
  busy: boolean;
  send: SendCommand;
}) {
  const ceramics = ownCeramics(game, player.id, "glazed");
  const occupied = new Set(Object.values(game.ceramics).filter((ceramic) => ceramic.stage === "loaded").map((ceramic) => ceramic.stage === "loaded" ? ceramic.kilnSpaceId : ""));
  const spaces = KILN_SPACE_IDS.filter((space) => !occupied.has(space));
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const first = optional(data, "ceramic1");
    const second = optional(data, "ceramic2");
    const loads = [];
    if (first !== "") loads.push({ ceramicId: first, kilnSpaceId: required(data, "space1") as KilnSpaceId });
    if (second !== "") loads.push({ ceramicId: second, kilnSpaceId: required(data, "space2") as KilnSpaceId });
    void send({
      type: "USE_KILN_YARD",
      workerId: required(data, "worker") as WorkerId,
      gainWood: data.has("gainWood"),
      loads,
    });
  }
  return (
    <form className="control-form" onSubmit={submit}>
      <WorkerSelect workers={workers} />
      <label className="check-row"><input type="checkbox" name="gainWood" defaultChecked /> Gain 1 Wood</label>
      {spaces.length === 0 ? (
        <>
          <input type="hidden" name="ceramic1" value="" />
          <input type="hidden" name="ceramic2" value="" />
          <p className="control-hint">The kiln is full; this worker may still gain Wood.</p>
        </>
      ) : (
        <>
          <CeramicSelect name="ceramic1" label="First ceramic" ceramics={ceramics} blank="Load none" />
          <SelectField name="space1" label="First kiln space" options={spaces} />
          <CeramicSelect name="ceramic2" label="Second ceramic (Shifu only)" ceramics={ceramics} blank="None" />
          <SelectField name="space2" label="Second kiln space" options={spaces} />
        </>
      )}
      <button className="primary-button" disabled={busy}>Load kiln</button>
    </form>
  );
}

function OfficeActionForms({ game, player, workers, busy, send }: {
  game: PublicGameState;
  player: PublicPlayerState;
  workers: AvailableWorker[];
  busy: boolean;
  send: SendCommand;
}) {
  const flawed = ownCeramics(game, player.id, "finished").filter((ceramic) => ceramic.stage === "finished" && ceramic.quality === "flawed");
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const workerId = required(data, "worker") as WorkerId;
    const action = required(data, "officeAction");
    if (action === "coins") void send({ type: "OFFICE_GAIN_COINS", workerId });
    else if (action === "sell") void send({ type: "OFFICE_SELL_FLAWED", workerId, ceramicIds: data.getAll("ceramic") as string[] });
    else void send({ type: "BEGIN_OFFICE_ORDERS", workerId, mode: action as OfficeOrderMode });
  }
  return (
    <form className="control-form" onSubmit={submit}>
      <WorkerSelect workers={workers} />
      <SelectField
        name="officeAction"
        label="Office action"
        options={["coins", "take_one", "take_up_to_two", "take_one_and_gain_two_coins", "sell"]}
      />
      {flawed.length > 0 && <CheckboxList name="ceramic" legend="Flawed ceramics to sell" options={flawed.map(ceramicOption)} />}
      <button className="primary-button" disabled={busy}>Visit the Office</button>
    </form>
  );
}

function OfficeControls({ game, busy, send }: Pick<ActionPanelProps, "game" | "busy" | "send">) {
  if (game.phase.type !== "work_office_orders") return null;
  const phase = game.phase;
  const display = phase.lastTakenDeck === "imperial" ? game.displays.imperial : phase.lastTakenDeck === "market" ? game.displays.market : [...game.displays.market, ...game.displays.imperial];
  if (phase.step === "colour_samples") {
    return (
      <ControlSection title="Colour Samples" hint="Optionally discard one other Order from that display.">
        <div className="choice-stack">{display.map((orderId) => <CommandButton key={orderId} busy={busy} send={send} command={{ type: "OFFICE_USE_COLOUR_SAMPLES", orderId }}>{`Discard ${orderId}`}</CommandButton>)}</div>
        <CommandButton busy={busy} send={send} command={{ type: "OFFICE_SKIP_COLOUR_SAMPLES" }} secondary>Keep the display</CommandButton>
      </ControlSection>
    );
  }
  return (
    <ControlSection title="Take an Order" hint={`${phase.remainingTakes} selection${phase.remainingTakes === 1 ? "" : "s"} remaining.`}>
      <div className="choice-stack">{display.map((orderId) => <CommandButton key={orderId} busy={busy} send={send} command={{ type: "OFFICE_TAKE_ORDER", orderId }}>{`Take ${orderId}`}</CommandButton>)}</div>
      {phase.mode === "take_up_to_two" && <CommandButton busy={busy} send={send} command={{ type: "OFFICE_END_ORDERS" }} secondary>End Office action</CommandButton>}
    </ControlSection>
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
        <div className="choice-stack">{ids.map((techniqueId) => <CommandButton key={techniqueId} busy={busy} send={send} command={{ type: "GUILD_REFRESH_TECHNIQUE", techniqueId }}>{`Refresh ${techniqueId}`}</CommandButton>)}</div>
        <CommandButton busy={busy} send={send} command={{ type: "GUILD_SKIP_REFRESH" }} secondary>Keep the display</CommandButton>
      </ControlSection>
    );
  }
  const worker = player.workers[game.phase.workerId];
  return (
    <ControlSection title="Acquire a Technique" hint={worker?.kind === "shifu" ? "Your Shifu pays 1 Coin less, to a minimum of 1." : "Pay the printed Coin cost."}>
      <div className="choice-stack">{ids.map((techniqueId) => {
        const technique = TECHNIQUE_DEFINITIONS[techniqueId];
        return <CommandButton key={techniqueId} busy={busy} send={send} command={{ type: "GUILD_BUY_TECHNIQUE", techniqueId }}>{`${techniqueId} · ${technique.name} · ${technique.cost} Coins`}</CommandButton>;
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
      <div className="contribution-grid">
        {([0, 1, 2, 3] as WoodContribution[]).map((amount) => (
          <CommandButton
            key={amount}
            busy={busy || amount > player.resources.wood}
            send={send}
            command={{ type: "SUBMIT_WOOD_CONTRIBUTION", windowId: game.phase.type === "firing_contributions" ? game.phase.windowId : "", amount }}
          >{amount} Wood</CommandButton>
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
    return <CeramicDecision title="Ge · Crackle from Fire" hint="Turn one difference-1 ceramic into a Crackle Masterpiece." ceramics={eligibleForGe} busy={busy} send={send} make={(ceramicId) => ({ type: "RESOLVE_GE", ceramicId })} skip={{ type: "RESOLVE_GE", ceramicId: null }} />;
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
      {player.orderHand.length === 0 ? <p>No Orders in hand.</p> : player.orderHand.map((orderId) => (
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
  if (!eligible) return <ControlSection title="Imperial Presentation" hint="Only workshops at Progress spaces 3–5 present."><p>You are observing the eligible workshops.</p></ControlSection>;
  if (submitted) return <ControlSection title="Presentation submitted" hint="Waiting for the other eligible workshops." />;
  return <SelectionSubmission title="Imperial Presentation" hint="Present up to three Standard-or-better ceramics. Diversity can earn bonuses." options={ceramics.map(ceramicOption)} maximum={3} busy={busy} submitLabel="Submit Presentation" onSubmit={(ceramicIds) => send({ type: "SUBMIT_PRESENTATION", ceramicIds })} />;
}

function FinalResults({ game }: { game: PublicGameState }) {
  if (game.finalResult === null) return null;
  return (
    <ControlSection title="Final results" hint={`Resolved by ${game.finalResult.resolvedBy.replaceAll("_", " ")}.`}>
      <div className="score-table" role="table" aria-label="Final scores">
        {game.playerOrder.map((playerId) => {
          const score = game.finalResult?.scores[playerId];
          return <div role="row" className={game.finalResult?.winnerIds.includes(playerId) ? "winner" : ""} key={playerId}><strong role="cell">{game.players[playerId]?.displayName}</strong><span role="cell">{score?.total} VP</span>{game.finalResult?.winnerIds.includes(playerId) && <em>Winner</em>}</div>;
        })}
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

function SimpleWorkerForm({ workers, busy, label, onSubmit }: {
  workers: AvailableWorker[];
  busy: boolean;
  label: string;
  onSubmit: (workerId: WorkerId) => Promise<boolean>;
}) {
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void onSubmit(required(new FormData(event.currentTarget), "worker") as WorkerId);
  }
  return <form className="control-form" onSubmit={submit}><WorkerSelect workers={workers} /><button className="primary-button" disabled={busy}>{label}</button></form>;
}

function WorkerSelect({ workers }: { workers: AvailableWorker[] }) {
  return <label>Worker<select name="worker" required>{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.kind === "shifu" ? "Shifu" : "Apprentice"} · {worker.id}</option>)}</select></label>;
}

function CeramicSelect({ name, label, ceramics, blank }: {
  name: string;
  label: string;
  ceramics: ReturnType<typeof ownCeramics>;
  blank?: string;
}) {
  return <label>{label}<select name={name} required={blank === undefined}>{blank !== undefined && <option value="">{blank}</option>}{ceramics.map((ceramic) => <option key={ceramic.id} value={ceramic.id}>{ceramicLabel(ceramic)}</option>)}</select></label>;
}

function SelectField({ name, label, options, blank }: {
  name: string;
  label: string;
  options: readonly (string | number)[];
  blank?: string;
}) {
  return <label>{label}<select name={name} required={blank === undefined}>{blank !== undefined && <option value="">{blank}</option>}{options.map((option) => <option key={option} value={option}>{labels[String(option)] ?? String(option).replaceAll("_", " ")}</option>)}</select></label>;
}

function NumberField({ name, label, max, defaultValue }: { name: string; label: string; max: number; defaultValue: number }) {
  return <label>{label}<input type="number" name={name} min={0} max={max} step={1} defaultValue={defaultValue} required /></label>;
}

function TechniqueChecks({ techniqueIds }: { techniqueIds: TechniqueId[] }) {
  if (techniqueIds.length === 0) return null;
  return <fieldset><legend>Use Techniques</legend>{techniqueIds.map((techniqueId) => <label className="check-row" key={techniqueId}><input type="checkbox" name="technique" value={techniqueId} />{techniqueId} · {TECHNIQUE_DEFINITIONS[techniqueId].name}</label>)}</fieldset>;
}

function CheckboxList({ name, legend, options }: { name: string; legend: string; options: Array<{ value: string; label: string }> }) {
  return <fieldset><legend>{legend}</legend>{options.map((option) => <label className="check-row" key={option.value}><input type="checkbox" name={name} value={option.value} />{option.label}</label>)}</fieldset>;
}

function CommandButton({ busy, send, command, secondary = false, danger = false, children }: {
  busy: boolean;
  send: SendCommand;
  command: AuthoritativeCommand;
  secondary?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return <button className={secondary ? "secondary-button" : danger ? "danger-button" : "primary-button"} type="button" disabled={busy} onClick={() => void send(command)}>{children}</button>;
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

function optional(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}
