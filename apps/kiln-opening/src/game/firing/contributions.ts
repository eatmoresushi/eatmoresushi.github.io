/**
 * Opening the Firing Phase and the secret Contribution window (L237–263, v1.6.2 L246, L260–266,
 * L508, L634, L668–670, changes 16 and 26).
 *
 * - Skip check (L237, L670): with nothing loaded in the Shared Kiln or any Imperial Kiln, the
 *   phase is skipped and no Fire card is revealed.
 * - Participants (L261, change 16): players with at least 1 ceramic in the Shared Kiln. An
 *   Imperial Kiln ceramic is in this firing (`firingPlayerIds`, L290) but gives no say.
 * - Steps 1–2 (v1.6.2 L668–669): each participant secretly submits exactly 1 of their own
 *   Contribution cards (`PlayerState.contributionCards`) through `submitContribution`: Bank,
 *   Tend or Stoke, and for Fuel Ledger's owner also Fuel Ledger Bank (1 Wood, −2) and Fuel Ledger
 *   Stoke (1 Wood, +2) (T12, v1.6.2 L266, L634, change 26). A Fuel Ledger owner's plain Bank and
 *   Stoke cost no Wood. The card must be affordable when chosen; nothing is set aside, and the
 *   Wood is paid only on reveal (v1.6.2 L508). Sealed choices live only in `PrivateFiringState`
 *   (DESIGN §4); the public state records who submitted. On the last submission every sealed
 *   choice is revalidated, then all are revealed together and paid.
 * - With no participants (INT), Contributions are skipped and Base Heat = the Kiln Die.
 * - Step 3 (L674): Base Heat = clamp(Kiln Die + Σ, 0, 5); then `pipeline.openAfterBaseHeat`.
 *
 * Layer 4: imports layers 0–3 and, inside P5, `firing/pipeline` (DESIGN §2.4).
 */

import { preferredHeat } from "../content.ts";
import { invariant, ruleError } from "../errors.ts";
import { emit, loadedCeramics, lookup, phaseAs, player, spend, turnOrder } from "../state.ts";
import { ownsTech } from "../techs.ts";
import type {
  ActorView,
  CeramicId,
  ContributionCardId,
  ContributionSubmission,
  FiringCeramicRecord,
  GameRuleError,
  GameState,
  PlayerId,
  PlayerView,
  PrivateFiringState,
  ResolveContext,
  RevealedContribution,
  SubmitContributionCommand,
  TechId,
} from "../types.ts";
import { baseHeat, contributionHeat, contributionWood, positionFor, requireFiring } from "./heat.ts";
import { openAfterBaseHeat } from "./pipeline.ts";

const FUEL_LEDGER: TechId = "T12";

/** `${gameId}:r${round}:contributions` (DESIGN §2.3 IDs). */
function contributionWindowId(game: GameState): string {
  return `${game.gameId}:r${game.round}:contributions`;
}

// ── Opening the Firing Phase ──────────────────────────────────────────────────────────

/**
 * The opener wired to `work_phase_done` (DESIGN §2.5). Skips the phase when nothing is
 * loaded (L237), else builds the `FiringContext`, emits `FIRING_STARTED` and opens the
 * Contribution window, or — with no participant (INT) — goes straight to Base Heat.
 */
export function openFiringPhase(draft: GameState, ctx: ResolveContext): void {
  invariant(draft.firing === null, "A firing is already in progress");
  const loaded = loadedCeramics(draft);
  if (loaded.length === 0) {
    emit(ctx, { type: "FIRING_SKIPPED", round: draft.round });
    ctx.flow.continueAfter("firing_done", draft, ctx);
    return;
  }
  const die = draft.kilnDie;
  invariant(die !== null && die.round === draft.round, "The Kiln Die has not been rolled this round");
  const order = turnOrder(draft);
  const participantIds = order.filter((pid) => loaded.some((c) => c.ownerId === pid && c.placement.kiln === "shared"));
  const firingPlayerIds = order.filter((pid) => loaded.some((c) => c.ownerId === pid));
  const windowId = participantIds.length > 0 ? contributionWindowId(draft) : null;
  const ceramics: Partial<Record<CeramicId, FiringCeramicRecord>> = {};
  for (const ceramic of loaded) {
    ceramics[ceramic.id] = {
      ceramicId: ceramic.id,
      ownerId: ceramic.ownerId,
      kiln: ceramic.placement.kiln,
      spaceId: ceramic.placement.kiln === "shared" ? ceramic.placement.spaceId : null,
      glaze: ceramic.glaze,
      preferredHeat: preferredHeat(ceramic.glaze),
      positionSource: positionFor(draft, ceramic).source,
      first: null,
      second: null,
      secondFiringCards: null,
      saggarsFloor: false,
      quality: null,
      history: [],
      crackle: false,
      salvaged: false,
    };
  }
  // The previous recap is kept only until the next firing starts.
  draft.lastFiring = null;
  draft.firing = {
    round: draft.round,
    kilnDie: die.value,
    participantIds,
    firingPlayerIds,
    contributionWindowId: windowId,
    contributions: null,
    unclampedBaseHeat: null,
    baseHeat: null,
    testPieces: [],
    fireModifier: null,
    globalHeat: null,
    ceramics,
    pendingExtraFire: null,
  };
  emit(ctx, { type: "FIRING_STARTED", round: draft.round, participantIds: [...participantIds], firingPlayerIds: [...firingPlayerIds] });
  if (windowId !== null) {
    draft.phase = { type: "firing_contributions", windowId, eligiblePlayerIds: [...participantIds], submittedPlayerIds: [] };
    return;
  }
  revealAndDetermineBaseHeat(draft, null, [], {}, ctx);
}

// ── The secret window ─────────────────────────────────────────────────────────────────

/** An empty private state for the open Contribution window (or `windowId: null`). */
export function createPrivateFiringState(state: GameState): PrivateFiringState {
  return {
    gameId: state.gameId,
    windowId: state.phase.type === "firing_contributions" ? state.phase.windowId : null,
    submissions: {},
  };
}

/**
 * Whether the actor may submit this Contribution (v1.6.2 L668, change 26): the window is open and
 * matches, the actor participates and has not submitted, holds the card (a Fuel Ledger card only
 * with Fuel Ledger, `CONTRIBUTION_CARD_NOT_HELD`), and can pay its Wood: the printed cost, none
 * for a Fuel Ledger owner's Bank or Stoke. Tend is always affordable (L266). Sees only the actor's
 * view and their own sealed state.
 */
export function validateContribution(
  view: ActorView,
  privateState: PrivateFiringState,
  command: SubmitContributionCommand,
): GameRuleError | null {
  const game = view.game;
  const phase = game.phase;
  if (phase.type !== "firing_contributions") {
    return ruleError("WRONG_PHASE", "Contributions are chosen only while the Contribution window is open.", {
      phase: phase.type,
      actionType: command.type,
    });
  }
  if (command.windowId !== phase.windowId || privateState.windowId !== phase.windowId || privateState.gameId !== game.gameId) {
    return ruleError("PRIVATE_WINDOW_MISMATCH", "That Contribution is for a window that is not open.", {
      windowId: command.windowId,
    });
  }
  const viewerId = view.viewerId;
  if (!phase.eligiblePlayerIds.includes(viewerId)) {
    return ruleError("NOT_CONTRIBUTOR", "Only players with a ceramic in the Shared Kiln contribute.", {});
  }
  if (
    phase.submittedPlayerIds.includes(viewerId) ||
    lookup(privateState.submissions, viewerId) !== undefined ||
    view.own.pendingContribution !== null
  ) {
    return ruleError("CONTRIBUTION_ALREADY_SUBMITTED", "You have already submitted your Contribution.", {});
  }
  const p = player(game, viewerId);
  if (!p.contributionCards.includes(command.card)) {
    return ruleError("CONTRIBUTION_CARD_NOT_HELD", "You do not hold that Contribution card.", { card: command.card });
  }
  const needed = contributionWood(command, ownsTech(p, FUEL_LEDGER));
  const have = p.resources.wood;
  if (have < needed) {
    return ruleError("INVALID_CONTRIBUTION", `That Contribution needs ${needed} Wood.`, {
      card: command.card,
      needed,
      have,
    });
  }
  return null;
}

/**
 * Seals the actor's choice in `privateDraft` (never in the state), records that they
 * submitted, and — on the last eligible submission — revalidates, reveals, pays and carries
 * on into Base Heat and the steps after it. The returned private state then has
 * `windowId: null`.
 */
export function applyContribution(
  draft: GameState,
  privateDraft: PrivateFiringState,
  actorId: PlayerId,
  command: SubmitContributionCommand,
  ctx: ResolveContext,
): void {
  const phase = phaseAs(draft, "firing_contributions");
  privateDraft.submissions[actorId] = { card: command.card };
  const submitted = new Set<PlayerId>([...phase.submittedPlayerIds, actorId]);
  phase.submittedPlayerIds = phase.eligiblePlayerIds.filter((pid) => submitted.has(pid));
  emit(ctx, { type: "CONTRIBUTION_SUBMITTED", playerId: actorId, windowId: phase.windowId });
  if (phase.submittedPlayerIds.length < phase.eligiblePlayerIds.length) {
    return;
  }
  const sealed: Array<[PlayerId, ContributionSubmission]> = phase.eligiblePlayerIds.map((pid) => {
    const submission = lookup(privateDraft.submissions, pid);
    invariant(submission !== undefined, `No sealed Contribution for ${pid}`);
    return [pid, { card: submission.card }];
  });
  privateDraft.windowId = null;
  privateDraft.submissions = {};
  revealAndDetermineBaseHeat(draft, phase.windowId, phase.eligiblePlayerIds, Object.fromEntries(sealed), ctx);
}

/**
 * Steps 2–3 (L673–674): revalidate each sealed choice against the current state (an
 * unaffordable or ill-formed sealed choice is an engine or store bug), reveal them all,
 * pay, then Base Heat = clamp(Kiln Die + Σ, 0, 5) and on to Test Pieces.
 */
function revealAndDetermineBaseHeat(
  draft: GameState,
  windowId: string | null,
  participantIds: readonly PlayerId[],
  sealed: Partial<Record<PlayerId, ContributionSubmission>>,
  ctx: ResolveContext,
): void {
  const firing = requireFiring(draft);
  const contributions: Partial<Record<PlayerId, RevealedContribution>> = {};
  const payments: Array<[PlayerId, number]> = [];
  let sum = 0;
  for (const pid of participantIds) {
    const submission = lookup(sealed, pid);
    invariant(submission !== undefined, `No sealed Contribution for ${pid}`);
    const p = player(draft, pid);
    invariant(p.contributionCards.includes(submission.card), `${pid} sealed ${submission.card}, a card they do not hold`);
    const heat = contributionHeat(submission);
    const woodPaid = contributionWood(submission, ownsTech(p, FUEL_LEDGER));
    invariant(p.resources.wood >= woodPaid, `${pid} can no longer pay the sealed Contribution`);
    contributions[pid] = { card: submission.card, heat, woodPaid };
    payments.push([pid, woodPaid]);
    sum += heat;
  }
  firing.contributions = contributions;
  emit(ctx, { type: "CONTRIBUTIONS_REVEALED", windowId, contributions: structuredClone(contributions) });
  for (const [pid, wood] of payments) {
    spend(draft, pid, { wood }, "contribution", ctx);
  }
  const base = baseHeat(firing.kilnDie, sum);
  firing.unclampedBaseHeat = firing.kilnDie + sum;
  firing.baseHeat = base;
  emit(ctx, { type: "BASE_HEAT_DETERMINED", kilnDie: firing.kilnDie, contributionSum: sum, unclamped: firing.kilnDie + sum, baseHeat: base });
  openAfterBaseHeat(draft, ctx);
}

/** Candidate order: Tend first (always affordable, v1.6.2 L266), Bank, Stoke, then Fuel Ledger
 * Bank and Fuel Ledger Stoke. */
const CANDIDATES = ["TEND", "BANK", "STOKE", "FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"] as const satisfies readonly ContributionCardId[];
/** Every card is a candidate: a new `ContributionCardId` fails this until it is listed above. */
const _everyCard: [Exclude<ContributionCardId, (typeof CANDIDATES)[number]>] extends [never] ? true : never = true;
void _everyCard;

/**
 * Every Contribution card the viewer may submit now, Tend first, then Bank, Stoke and Fuel
 * Ledger's 2 cards when held (DESIGN §2.4, §5.2). Non-empty for an eligible viewer who has not
 * submitted; `[]` otherwise (spectators, non-participants, after submitting, other phases).
 */
export function legalContributions(view: PlayerView): SubmitContributionCommand[] {
  const viewerId = view.viewerId;
  const own = view.own;
  const phase = view.game.phase;
  if (viewerId === null || own === null || phase.type !== "firing_contributions") {
    return [];
  }
  const actorView: ActorView = { ...view, viewerId, own };
  const pending = own.pendingContribution;
  const privateState: PrivateFiringState = {
    gameId: view.game.gameId,
    windowId: phase.windowId,
    submissions: pending === null ? {} : { [viewerId]: { card: pending.card } },
  };
  return CANDIDATES.map((card): SubmitContributionCommand => ({
    type: "SUBMIT_CONTRIBUTION",
    windowId: phase.windowId,
    card,
  })).filter((command) => validateContribution(actorView, privateState, command) === null);
}
