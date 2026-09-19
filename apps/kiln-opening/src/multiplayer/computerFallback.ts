import { withOwnOrderHand } from "./projection.ts";
import {
  DECORATION_COSTS,
  DISCIPLINES,
  GAME_CONFIG,
  KILN_IDS,
  TECHNIQUE_DEFINITIONS,
  activeKilnSpaceIds,
  orderHandLimit,
} from "../game/index.ts";
import type {
  FinishedCeramic,
  TechniqueId,
} from "../game/index.ts";
import type { ComputerObservation } from "./computerObservation.ts";
import type { AuthoritativeCommand } from "./types.ts";

/**
 * Conservative phase exits used only when the strategic policy proposes an illegal command.
 * The authoritative service still preflights every entry and accepts the first legal one.
 */
export function fallbackComputerCommands(
  observation: ComputerObservation,
): AuthoritativeCommand[] {
  const { ownPrivate, playerId } = observation;
  const game = withOwnOrderHand(observation.game, playerId, ownPrivate.orderHand);
  const player = game.players[playerId];
  if (player === undefined) return [];
  const phase = game.phase;

  switch (phase.type) {
    case "setup_kiln_selection": {
      const occupied = new Set(Object.values(game.players).map((entry) => entry.kilnId));
      return KILN_IDS.filter((kilnId) => !occupied.has(kilnId)).map((kilnId) => ({
        type: "SELECT_KILN" as const,
        kilnId,
      }));
    }
    case "setup_starting_orders":
      return [{ type: "SUBMIT_STARTING_ORDERS", orderIds: ownPrivate.startingOrderOffer.slice(0, 2) }];
    case "setup_starting_tech":
      return (["ST01", "ST02", "ST03", "ST04"] as const).map((techniqueId) => ({
        type: "SELECT_STARTING_TECH" as const,
        techniqueId,
      }));
    case "work": {
      const workers = Object.values(player.workers).filter((worker) => worker.status === "available");
      const forcedWorkerAction = phase.imperialPriorityUsedBeforeAction === true;
      const commands: AuthoritativeCommand[] = [];
      for (const worker of workers) {
        commands.push({ type: "USE_LABOUR", workerId: worker.id });
        {
          const amount = worker.kind === "shifu" ? 4 : 3;
          commands.push({
            type: "GAIN_MATERIALS",
            workerId: worker.id,
            clay: amount,
            wood: 0,
          });
        }
        if (player.resources.clay >= 1) {
          commands.push({ type: "FORM_CERAMICS", workerId: worker.id, shapes: ["bowl"] });
        }
        const shaped = Object.values(game.ceramics).find(
          (ceramic) => ceramic.ownerId === playerId && ceramic.stage === "shaped",
        );
        if (shaped !== undefined && (worker.kind === "shifu" || player.resources.coins >= DECORATION_COSTS.plain)) {
          commands.push({
            type: "GLAZE_CERAMICS",
            workerId: worker.id,
            selections: [{ ceramicId: shaped.id, glaze: "celadon", decoration: "plain" }],
            ...(worker.kind === "shifu" ? { freeDecorationCeramicId: shaped.id } : {}),
          });
        }
        const glazed = Object.values(game.ceramics).find(
          (ceramic) => ceramic.ownerId === playerId
            && ceramic.stage === "glazed"
            && (ceramic.loadableFromRound === undefined || game.round >= ceramic.loadableFromRound),
        );
        const openKilnSpace = activeKilnSpaceIds(game.playerCount).find((spaceId) =>
          !Object.values(game.ceramics).some((ceramic) => ceramic.stage === "loaded" && ceramic.kilnSpaceId === spaceId),
        );
        if (glazed !== undefined && openKilnSpace !== undefined) {
          commands.push({
            type: "USE_KILN_YARD",
            workerId: worker.id,
            loads: [{ ceramicId: glazed.id, kilnSpaceId: openKilnSpace }],
            ...(worker.kind === "shifu" ? { shifuCeramicId: glazed.id } : {}),
            ...(player.startingTechniqueId === "ST04" ? { kilnTendingClay: 1, kilnTendingWood: 0 } : {}),
          });
        }
        const discount = worker.kind === "shifu" ? 1 : 0;
        if (
          player.techniques.length < GAME_CONFIG.techniques.maxOwned
          && [...game.displays.techniques.forming, ...game.displays.techniques.glazing, ...game.displays.techniques.firing]
            .some((techniqueId) => Math.max(0, (TECHNIQUE_DEFINITIONS[techniqueId]?.cost ?? 99) - discount) <= player.resources.coins)
        ) {
          commands.push({ type: "BEGIN_GUILD_ACTION", workerId: worker.id });
        }
        if (game.decks.marketRemaining + game.discards.market.length + game.displays.market.length > 0) {
          commands.push({
            type: "BEGIN_OFFICE_ORDERS",
            workerId: worker.id,
            mode: worker.kind === "shifu" ? "take_up_to_two" : "take_one",
          });
        }
      }
      return commands;
    }
    case "work_office_orders":
      if (phase.step === "colour_samples_or_skip") return [{ type: "OFFICE_SKIP_COLOUR_SAMPLES" }];
      if (phase.step === "colour_samples_choose") {
        return [
          ...ownPrivate.colourSamplesChoices.map((orderId) => ({
            type: "OFFICE_CHOOSE_COLOUR_SAMPLES_ORDER" as const,
            orderId,
          })),
          ...game.displays.market.map((orderId) => ({
            type: "OFFICE_CHOOSE_COLOUR_SAMPLES_ORDER" as const,
            orderId,
          })),
        ];
      }
      if (phase.step === "gain_advance") {
        return (["clay", "wood", "coins"] as const).map((resource) => ({
          type: "COMMISSION_GAIN_ADVANCE" as const,
          resource,
        }));
      }
      return [
        ...game.displays.market.map((orderId) => ({ type: "OFFICE_TAKE_ORDER" as const, orderId })),
        ...(game.decks.marketRemaining + game.discards.market.length > 0
          ? [{ type: "OFFICE_TAKE_TOP_ORDER" as const }]
          : []),
        { type: "OFFICE_END_ORDERS" },
      ];
    case "work_guild":
      if (phase.step === "inspect") {
        return DISCIPLINES.map((discipline) => ({
          type: "GUILD_INSPECT_DISCIPLINE" as const,
          discipline,
        }));
      }
      return techniqueFallbacks(observation, phase.workerId);
    case "work_imperial_priority":
      return [{ type: "RESOLVE_IMPERIAL_PRIORITY", ceramicId: null }];
    case "firing_before_contribution":
      return [{ type: "RESOLVE_TEST_PIECES", use: false }];
    case "firing_contributions":
      return [{
        type: "SUBMIT_WOOD_CONTRIBUTION",
        windowId: phase.windowId,
        card: "TEND",
        useFuelLedger: false,
      }];
    case "firing_reposition":
      return [{ type: "RESOLVE_KILN_YARD_REPOSITION", ceramicId: null, toSpaceId: null }];
    case "firing_reveal_fire":
      return [{ type: "REVEAL_FIRE_CARD" }];
    case "firing_before_quality":
    case "firing_second_before_quality":
      return [{ type: "RESOLVE_JUN", ceramicId: null, delta: null }];
    case "firing_after_quality":
      return phase.techniqueIds.includes("T11")
        ? [{ type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: null }]
        : [{ type: "RESOLVE_SECOND_FIRING", ceramicId: null }];
    case "firing_workshop_seconds":
      return [
        ...Object.values(game.firingContext?.ceramicResults ?? {})
            .filter((result) => result.assignedQuality === "flawed" && game.ceramics[result.ceramicId]?.ownerId === playerId)
            .map((result) => ({ type: "RESOLVE_WORKSHOP_SECONDS" as const, ceramicId: result.ceramicId })),
        { type: "RESOLVE_WORKSHOP_SECONDS", ceramicId: null },
      ];
    case "orders":
      return [{ type: "END_ORDER_TURN" }];
    case "cleanup_orders":
      return [{
        type: "DISCARD_ORDERS_FOR_CLEANUP",
        orderIds: player.orderHand.slice(0, Math.max(0, player.orderHand.length - orderHandLimit())),
      }];
    case "presentation": {
      const ceramics = Object.values(game.ceramics).filter(
        (ceramic): ceramic is FinishedCeramic =>
          ceramic.ownerId === playerId && ceramic.stage === "finished" && ceramic.quality !== "flawed",
      );
      return [{
        type: "SUBMIT_PRESENTATION",
        ceramicIds: ceramics.map((ceramic) => ceramic.id),
      }];
    }
    case "finished":
      return [];
  }
}

function techniqueFallbacks(
  observation: ComputerObservation,
  workerId: string,
): AuthoritativeCommand[] {
  const { ownPrivate, playerId } = observation;
  const game = withOwnOrderHand(observation.game, playerId, ownPrivate.orderHand);
  const player = game.players[playerId];
  const worker = player?.workers[workerId];
  if (player === undefined || worker === undefined) return [];
  const discount = worker.kind === "shifu" ? 1 : 0;
  const candidates: TechniqueId[] = [
    ...ownPrivate.inspectedTechniqueIds,
    ...game.displays.techniques.forming,
    ...game.displays.techniques.glazing,
    ...game.displays.techniques.firing,
  ];
  return [...new Set(candidates)]
    .filter((techniqueId) => {
      const cost = TECHNIQUE_DEFINITIONS[techniqueId]?.cost;
      return cost !== undefined && Math.max(0, cost - discount) <= player.resources.coins;
    })
    .map((techniqueId) => ({ type: "GUILD_BUY_TECHNIQUE" as const, techniqueId }));
}

export interface ComputerCandidateFailure {
  command: AuthoritativeCommand;
  code: string;
  message: string;
}

export interface ComputerCandidateSelection {
  command: AuthoritativeCommand;
  usedFallback: boolean;
  rejected: ComputerCandidateFailure[];
}

/** Selects the first command accepted by the caller's authoritative preflight. */
export function selectFirstLegalComputerCommand(
  strategic: AuthoritativeCommand,
  fallbacks: readonly AuthoritativeCommand[],
  isLegal: (command: AuthoritativeCommand) => { ok: true } | { ok: false; code: string; message: string },
): ComputerCandidateSelection | null {
  const candidates = [strategic, ...fallbacks].filter((candidate, index, all) =>
    all.findIndex((other) => JSON.stringify(other) === JSON.stringify(candidate)) === index,
  );
  const rejected: ComputerCandidateFailure[] = [];
  for (const command of candidates) {
    const result = isLegal(command);
    if (result.ok) return { command, usedFallback: rejected.length > 0, rejected };
    rejected.push({ command, code: result.code, message: result.message });
  }
  return null;
}
