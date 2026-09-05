import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  KILN_DEFINITIONS,
  KILN_IDS,
  MAIN_ORDERS,
  STARTING_ORDERS,
  STARTING_TECHNIQUES,
  TECHNIQUES,
} from "../game/content.ts";
import {
  createPlaytestDraft,
  resizePlayers,
  restorePlaytestDraft,
  sharedKilnCapacity,
  submissionCandidate,
} from "../playtest/model.ts";
import { validatePlaytestSubmission } from "../playtest/schema.ts";
import { submitPlaytest } from "../playtest/client.ts";
import type { PlaytestDraft, PlaytestFeedback, YesNo } from "../playtest/types.ts";

const DRAFT_KEY = "kiln-opening:playtest-draft-v1";
const ALL_ORDERS = [...STARTING_ORDERS, ...MAIN_ORDERS];

function initialDraft(): PlaytestDraft {
  if (typeof window === "undefined") return createPlaytestDraft();
  const serialized = window.localStorage.getItem(DRAFT_KEY);
  return serialized === null ? createPlaytestDraft() : restorePlaytestDraft(serialized) ?? createPlaytestDraft();
}

function numberFromInput(value: string): number | null {
  if (value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function playerName(draft: PlaytestDraft, index: number): string {
  const name = draft.players[index]?.name.trim();
  return name === undefined || name === "" ? `Player ${index + 1}` : name;
}

function Field({ label, hint, children }: { label: string; hint?: string | undefined; children: ReactNode }) {
  return (
    <label className="playtest-field">
      <span>{label}</span>
      {children}
      {hint !== undefined && <small>{hint}</small>}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 500,
  required = false,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  required?: boolean;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        inputMode="numeric"
        value={value ?? ""}
        min={min}
        max={max}
        required={required}
        onChange={(event) => onChange(numberFromInput(event.target.value))}
      />
    </Field>
  );
}

function YesNoField({ label, value, onChange }: { label: string; value: YesNo; onChange: (value: YesNo) => void }) {
  return (
    <Field label={label}>
      <select value={value === null ? "" : value ? "yes" : "no"} onChange={(event) => {
        onChange(event.target.value === "" ? null : event.target.value === "yes");
      }}>
        <option value="">Not recorded</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </Field>
  );
}

function Section({
  number,
  title,
  description,
  optional = false,
  children,
}: {
  number: string;
  title: string;
  description: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="playtest-section" id={`section-${number}`}>
      <header className="playtest-section-heading">
        <span>{number}</span>
        <div>
          <div className="section-title-line">
            <h2>{title}</h2>
            {optional && <small>Optional detail</small>}
          </div>
          <p>{description}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

const SCORE_FIELDS = [
  ["Final VP", "finalVp", true],
  ["Order VP", "orderVp", false],
  ["Tradition VP", "traditionVp", false],
  ["Exhibition VP", "exhibitionVp", false],
  ["Coin VP", "coinVp", false],
] as const;

const FEEDBACK_PROMPTS: ReadonlyArray<[keyof PlaytestFeedback, string, string]> = [
  ["strongest", "What felt strongest?", "A strategy, component, moment, or feeling."],
  ["weakest", "What felt weakest?", "Anything flat, ineffective, or not worth pursuing."],
  ["blockedOrIdleWorkers", "Any blocked or idle workers?", "Who, when, and why?"],
  ["softLock", "Any soft-lock?", "Describe any state where progress felt impossible."],
  ["impossibleOrder", "Any Order impossible or unrealistic?", "Include the Order ID if known."],
  ["sharedKilnNegotiation", "Did the Shared Kiln create negotiation?", "What changed because of another player?"],
  ["heatHedging", "Did players hedge heat?", "Describe deliberate spreading across heat targets."],
  ["tendMeaningful", "Was Tend common but meaningful?", "How often did it feel like a real choice?"],
  ["recognitionWorthwhile", "Did Recognition feel worthwhile?", "Who pursued or ignored it, and why?"],
  ["traditionConcern", "Any Kiln Tradition concern?", "Name the Kiln and what happened."],
  ["techConcern", "Any Tech concern?", "Name the Tech and what happened."],
  ["rulesAmbiguity", "Any rules ambiguity?", "Record the exact rule or phrase if possible."],
  ["minorTuning", "Potential minor tuning", "Small adjustments worth testing next time."],
];

export function PlaytestFormPage() {
  const [draft, setDraft] = useState<PlaytestDraft>(initialDraft);
  const [issues, setIssues] = useState<string[]>([]);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const capacity = sharedKilnCapacity(draft.playerCount);

  useEffect(() => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  const labels = useMemo(
    () => draft.players.map((_, index) => playerName(draft, index)),
    [draft],
  );
  const usedOrderIds = useMemo(
    () => new Set(draft.players.flatMap((player) => player.completedOrderIds).filter((orderId) => orderId !== "")),
    [draft.players],
  );

  function updatePlayer(index: number, patch: Partial<PlaytestDraft["players"][number]>): void {
    setDraft((current) => ({
      ...current,
      players: current.players.map((player, playerIndex) => playerIndex === index ? { ...player, ...patch } : player),
    }));
  }

  function updateRound(index: number, patch: Partial<PlaytestDraft["rounds"][number]>): void {
    setDraft((current) => ({
      ...current,
      rounds: current.rounds.map((round, roundIndex) => roundIndex === index ? { ...round, ...patch } : round),
    }));
  }

  function addCompletedOrder(playerIndex: number): void {
    const player = draft.players[playerIndex];
    if (player === undefined) return;
    updatePlayer(playerIndex, { completedOrderIds: [...player.completedOrderIds, ""] });
  }

  function updateCompletedOrder(playerIndex: number, orderIndex: number, orderId: string): void {
    const player = draft.players[playerIndex];
    if (player === undefined) return;
    updatePlayer(playerIndex, {
      completedOrderIds: player.completedOrderIds.map((current, index) => index === orderIndex ? orderId : current),
    });
  }

  function removeCompletedOrder(playerIndex: number, orderIndex: number): void {
    const player = draft.players[playerIndex];
    if (player === undefined) return;
    updatePlayer(playerIndex, {
      completedOrderIds: player.completedOrderIds.filter((_, index) => index !== orderIndex),
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmissionError(null);
    const validation = validatePlaytestSubmission(submissionCandidate(draft));
    if (!validation.ok) {
      setIssues(validation.issues.map((entry) => entry.message));
      window.setTimeout(() => errorRef.current?.focus(), 0);
      return;
    }
    setIssues([]);
    setBusy(true);
    try {
      const result = await submitPlaytest(validation.value);
      if (!result.ok) {
        setSubmissionError(result.message);
        return;
      }
      window.localStorage.removeItem(DRAFT_KEY);
      setSubmittedId(result.gameId);
    } finally {
      setBusy(false);
    }
  }

  if (submittedId !== null) {
    return (
      <main className="playtest-page playtest-success">
        <div className="success-mark" aria-hidden="true">✓</div>
        <p className="eyebrow">Playtest received</p>
        <h1>Thank you for opening the kiln.</h1>
        <p>Your submission reference is <strong>{submittedId}</strong>. It was assigned by the server and stored for comparison with future games.</p>
        <div className="button-row">
          <button className="primary-button" type="button" onClick={() => {
            setDraft(createPlaytestDraft());
            setSubmittedId(null);
          }}>Record another playtest</button>
          <a className="secondary-button playtest-link-button" href={import.meta.env.BASE_URL}>Return to the game</a>
        </div>
      </main>
    );
  }

  return (
    <div className="playtest-shell">
      <header className="playtest-masthead">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <span className="brand-mark" aria-hidden="true">窑</span>
          <span><strong>Kiln Opening</strong><small>PLAYTEST RECORD · V{draft.rulesVersion}</small></span>
        </a>
        <a className="text-button" href={import.meta.env.BASE_URL}>Back to game</a>
      </header>

      <main className="playtest-page">
        <section className="playtest-hero">
          <div>
            <p className="eyebrow">Playtest record</p>
            <h1>Tell us what happened at the table.</h1>
            <p>A concise record of player setup, firing decisions, final results, and table observations.</p>
          </div>
          <aside>
            <strong>Draft saved locally</strong>
            <span>You can close this page and continue later on this device.</span>
            <span>There is no Game ID to enter; your reference number is created only after a successful submission.</span>
          </aside>
        </section>

        <nav className="playtest-nav" aria-label="Form sections">
          <a href="#section-1">1 · Game & players</a>
          <a href="#section-2">2 · Firing</a>
          <a href="#section-3">3 · End game</a>
          <a href="#section-4">4 · Reflection</a>
        </nav>

        <form className="playtest-form" onSubmit={(event) => void submit(event)}>
          {issues.length > 0 && (
            <div className="form-message form-message-error" ref={errorRef} tabIndex={-1} role="alert">
              <strong>Please complete the required fields.</strong>
              <ul>{[...new Set(issues)].slice(0, 8).map((message) => <li key={message}>{message}</li>)}</ul>
            </div>
          )}
          {submissionError !== null && (
            <div className="form-message form-message-error" role="alert"><strong>Submission not sent.</strong><p>{submissionError}</p></div>
          )}

          <Section number="1" title="Game and players" description="Record the game setup and each player's workshop.">
            <div className="field-grid field-grid-four game-basics">
              <Field label="Date played"><input type="date" value={draft.playedOn} required onChange={(event) => setDraft({ ...draft, playedOn: event.target.value })} /></Field>
              <Field label="Players">
                <select value={draft.playerCount} onChange={(event) => setDraft((current) => resizePlayers(current, Number(event.target.value) as 2 | 3 | 4))}>
                  <option value={2}>2</option><option value={3}>3</option><option value={4}>4</option>
                </select>
              </Field>
              <Field label="Rules version"><input value={`V${draft.rulesVersion}`} readOnly aria-readonly="true" /></Field>
              <Field label="First player">
                <select value={draft.firstPlayerIndex} onChange={(event) => setDraft({ ...draft, firstPlayerIndex: Number(event.target.value) })}>
                  {labels.map((label, index) => <option key={index} value={index}>{label}</option>)}
                </select>
              </Field>
            </div>

            <div className="player-form-grid player-setup-grid">
              {draft.players.map((player, index) => (
                <article className="player-form-card" key={index}>
                  <header><span>P{index + 1}</span><h3>{playerName(draft, index)}</h3></header>
                  <div className="field-grid field-grid-two">
                    <Field label="Player name" hint="Optional; a seat label is enough."><input value={player.name} maxLength={40} autoComplete="off" onChange={(event) => updatePlayer(index, { name: event.target.value })} /></Field>
                    <Field label="Kiln">
                      <select value={player.kilnId ?? ""} required onChange={(event) => updatePlayer(index, { kilnId: event.target.value as typeof player.kilnId })}>
                        <option value="" disabled>Choose…</option>
                        {KILN_IDS.map((kilnId) => <option value={kilnId} key={kilnId}>{KILN_DEFINITIONS[kilnId].name}</option>)}
                      </select>
                    </Field>
                    <Field label="Starting Tech">
                      <select value={player.startingTechniqueId ?? ""} required onChange={(event) => updatePlayer(index, { startingTechniqueId: event.target.value as typeof player.startingTechniqueId })}>
                        <option value="" disabled>Choose…</option>
                        {STARTING_TECHNIQUES.map((technique) => <option value={technique.id} key={technique.id}>{technique.name}</option>)}
                      </select>
                    </Field>
                    {["advancedTechnique1Id", "advancedTechnique2Id"].map((key, techIndex) => (
                      <Field label={`Advanced Tech ${techIndex + 1}`} key={key}>
                        <select value={player[key as "advancedTechnique1Id" | "advancedTechnique2Id"] ?? ""} onChange={(event) => updatePlayer(index, { [key]: event.target.value === "" ? null : event.target.value })}>
                          <option value="">None</option>
                          {TECHNIQUES.map((technique) => <option value={technique.id} key={technique.id}>{technique.name}</option>)}
                        </select>
                      </Field>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </Section>

          <Section number="2" title="Firing by round" description={`Record only what was observed. Shared Kiln capacity for this game is ${capacity}.`} optional>
            <div className="round-grid">
              {draft.rounds.map((round, index) => {
                const occupancy = round.sharedLoaded === null ? null : Math.round((round.sharedLoaded / capacity) * 100);
                const globalHeat = round.baseHeat === null || round.fireModifier === null ? null : round.baseHeat + round.fireModifier;
                return (
                  <details className="round-card" key={round.round} open={index === 0}>
                    <summary><span>Round {round.round}</span><small>{occupancy === null ? "Not recorded" : `${occupancy}% occupancy`}</small></summary>
                    <div className="round-content">
                      <div className="metric-grid">
                        <NumberField label="Shared Kiln loaded" value={round.sharedLoaded} min={0} max={capacity} onChange={(sharedLoaded) => updateRound(index, { sharedLoaded })} />
                        <NumberField label="Imperial Kilns loaded" value={round.imperialLoaded} min={0} max={draft.playerCount} onChange={(imperialLoaded) => updateRound(index, { imperialLoaded })} />
                        <NumberField label="Bank" value={round.bank} min={0} max={draft.playerCount} onChange={(bank) => updateRound(index, { bank })} />
                        <NumberField label="Tend" value={round.tend} min={0} max={draft.playerCount} onChange={(tend) => updateRound(index, { tend })} />
                        <NumberField label="Stoke" value={round.stoke} min={0} max={draft.playerCount} onChange={(stoke) => updateRound(index, { stoke })} />
                        <NumberField label="Base Heat" value={round.baseHeat} min={0} max={5} onChange={(baseHeat) => updateRound(index, { baseHeat })} />
                        <NumberField label="Fire modifier" value={round.fireModifier} min={-2} max={2} onChange={(fireModifier) => updateRound(index, { fireModifier })} />
                        <Field label="Global Heat"><output className="calculated-output">{globalHeat ?? "—"}</output></Field>
                      </div>
                      <h4>Glazes loaded</h4>
                      <div className="metric-grid">
                        <NumberField label="White" value={round.whiteLoaded} min={0} max={11} onChange={(whiteLoaded) => updateRound(index, { whiteLoaded })} />
                        <NumberField label="Celadon" value={round.celadonLoaded} min={0} max={11} onChange={(celadonLoaded) => updateRound(index, { celadonLoaded })} />
                        <NumberField label="Grey-Green" value={round.greyGreenLoaded} min={0} max={11} onChange={(greyGreenLoaded) => updateRound(index, { greyGreenLoaded })} />
                        <NumberField label="Moon White" value={round.moonWhiteLoaded} min={0} max={11} onChange={(moonWhiteLoaded) => updateRound(index, { moonWhiteLoaded })} />
                      </div>
                      <div className="field-grid field-grid-four">
                        <YesNoField label="Memorable heat conflict?" value={round.heatConflict} onChange={(heatConflict) => updateRound(index, { heatConflict })} />
                        <YesNoField label="Order taken before intended turn?" value={round.orderStolen} onChange={(orderStolen) => updateRound(index, { orderStolen })} />
                        <YesNoField label="Shifu reposition used?" value={round.shifuRepositionUsed} onChange={(shifuRepositionUsed) => updateRound(index, { shifuRepositionUsed })} />
                        <YesNoField label="Fuel Ledger used?" value={round.fuelLedgerUsed} onChange={(fuelLedgerUsed) => updateRound(index, { fuelLedgerUsed })} />
                      </div>
                      <Field label="Round notes"><textarea rows={2} value={round.notes} maxLength={1000} onChange={(event) => updateRound(index, { notes: event.target.value })} /></Field>
                    </div>
                  </details>
                );
              })}
            </div>
          </Section>

          <Section number="3" title="End of game" description="Record the winner and each player's completed Orders, Recognition, Kiln ability use, and score.">
            <div className="winner-field">
              <Field label="Winner">
                <select value={draft.winnerIndex} onChange={(event) => setDraft({ ...draft, winnerIndex: Number(event.target.value) })}>
                  {labels.map((label, index) => <option key={index} value={index}>{label}</option>)}
                </select>
              </Field>
            </div>
            <div className="player-form-grid endgame-grid">
              {draft.players.map((player, playerIndex) => (
                <article className="player-form-card endgame-card" key={playerIndex}>
                  <header>
                    <span>P{playerIndex + 1}</span>
                    <h3>{playerName(draft, playerIndex)}</h3>
                    {draft.winnerIndex === playerIndex && <small>Winner</small>}
                  </header>

                  <div className="order-list-heading">
                    <div><h4>Completed Orders</h4><p>{player.completedOrderIds.length} completed</p></div>
                    <button className="secondary-button compact-button" type="button" onClick={() => addCompletedOrder(playerIndex)}>Add Order</button>
                  </div>
                  <div className="completed-order-list">
                    {player.completedOrderIds.length === 0 && <p className="empty-log">No completed Orders recorded.</p>}
                    {player.completedOrderIds.map((orderId, orderIndex) => (
                      <div className="completed-order-row" key={orderIndex}>
                        <select value={orderId} aria-label={`${playerName(draft, playerIndex)} completed Order ${orderIndex + 1}`} onChange={(event) => updateCompletedOrder(playerIndex, orderIndex, event.target.value)}>
                          <option value="" disabled>Choose Order…</option>
                          {ALL_ORDERS.map((order) => (
                            <option value={order.id} key={order.id} disabled={usedOrderIds.has(order.id) && order.id !== orderId}>
                              {order.id} · {order.requirements}
                            </option>
                          ))}
                        </select>
                        <button className="text-button" type="button" onClick={() => removeCompletedOrder(playerIndex, orderIndex)}>Remove</button>
                      </div>
                    ))}
                  </div>

                  <div className="metric-grid endgame-metrics">
                    <NumberField label="Imperial Recognition" value={player.recognition} min={0} max={5} required onChange={(recognition) => updatePlayer(playerIndex, { recognition: recognition ?? 0 })} />
                    <NumberField label="Kiln ability uses" value={player.kilnAbilityUses} min={0} max={5} required onChange={(kilnAbilityUses) => updatePlayer(playerIndex, { kilnAbilityUses })} />
                  </div>
                  <div className="metric-subsection">
                    <h4>Scoring</h4>
                    <div className="metric-grid">
                      {SCORE_FIELDS.map(([label, key, required]) => (
                        <NumberField key={key} label={label} value={player[key]} min={key === "coinVp" ? 0 : -100} max={key === "coinVp" ? 5 : 500} required={required} onChange={(value) => updatePlayer(playerIndex, { [key]: value })} />
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </Section>

          <Section number="4" title="Table reflection" description="Specific observations help identify what should be tested next.">
            <div className="feedback-grid">
              {FEEDBACK_PROMPTS.map(([key, label, hint]) => (
                <Field label={label} hint={hint} key={key}>
                  <textarea rows={3} value={draft.feedback[key]} maxLength={1500} onChange={(event) => setDraft((current) => ({ ...current, feedback: { ...current.feedback, [key]: event.target.value } }))} />
                </Field>
              ))}
            </div>
          </Section>

          <section className="submit-panel">
            <div><p className="eyebrow">Ready to send</p><h2>Submit this playtest</h2><p>No account or email is requested. Results are stored privately for the game designer.</p></div>
            <button className="primary-button submit-button" type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit playtest"}</button>
          </section>
        </form>
      </main>
      <footer className="playtest-footer"><span>Kiln Opening · V{draft.rulesVersion}</span><a href="https://luyuan.me/">Luyuan He</a></footer>
    </div>
  );
}
