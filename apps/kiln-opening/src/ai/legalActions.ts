import {
  DECORATIONS,
  GLAZES,
  KILN_IDS,
  ORDER_DEFINITIONS,
  SHAPES,
  SHAPE_COSTS,
  TECHNIQUE_DEFINITIONS,
  activeKilnSpaceIds,
  applyAction,
  CONTRIBUTION_CARD_IDS,
  contributionWoodCost,
  currentDecisionActor,
  JUN_ACTIVATION_WOOD,
  orderHandLimit,
  SeededRandom,
  submitWoodContribution,
} from "../game/index.ts";
import type {
  Decoration,
  GameAction,
  GameState,
  Glaze,
  KilnSpaceId,
  OrderId,
  PlayerId,
  PrivateFiringState,
  Shape,
  TechniqueId,
  WoodContribution,
} from "../game/index.ts";
import type { AuthoritativeCommand } from "../multiplayer/types.ts";
import type { AIAction } from "./types.ts";

export interface LegalActionOptions {
  exhaustive?: boolean;
  maxCandidates?: number;
}

interface GlazeOption {
  glaze: Glaze;
  decoration: Decoration;
}

const validationRng = new SeededRandom(0x1a11ce);

function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (size > items.length) return [];
  const result: T[][] = [];
  const visit = (start: number, chosen: T[]) => {
    if (chosen.length === size) {
      result.push([...chosen]);
      return;
    }
    for (let index = start; index < items.length; index += 1) {
      const item = items[index];
      if (item !== undefined) visit(index + 1, [...chosen, item]);
    }
  };
  visit(0, []);
  return result;
}

function shapeSelections(maximum: number): Shape[][] {
  const result = SHAPES.map((shape) => [shape]);
  if (maximum < 2) return result;
  for (let left = 0; left < SHAPES.length; left += 1) {
    for (let right = left; right < SHAPES.length; right += 1) {
      const first = SHAPES[left];
      const second = SHAPES[right];
      if (first !== undefined && second !== undefined) result.push([first, second]);
    }
  }
  return result;
}

function techniqueSubsets(ids: readonly TechniqueId[]): TechniqueId[][] {
  const result: TechniqueId[][] = [[]];
  for (const id of ids) {
    for (const current of [...result]) result.push([...current, id]);
  }
  return result;
}

function ownReadyTechniques(state: GameState, playerId: PlayerId, allowed: readonly TechniqueId[]): TechniqueId[] {
  const player = state.players[playerId];
  if (player === undefined) return [];
  return player.techniques
    .filter(({ id, exhausted }) => !exhausted && allowed.includes(id))
    .map(({ id }) => id);
}

function relevantGlazeOptions(state: GameState, playerId: PlayerId, exhaustive: boolean): GlazeOption[] {
  const all = GLAZES.flatMap((glaze) => DECORATIONS.map((decoration) => ({ glaze, decoration })));
  if (exhaustive) return all;
  const player = state.players[playerId];
  const keys = new Set<string>();
  const result: GlazeOption[] = [];
  const add = (glaze: Glaze, decoration: Decoration) => {
    const key = `${glaze}:${decoration}`;
    if (!keys.has(key)) {
      keys.add(key);
      result.push({ glaze, decoration });
    }
  };
  for (const glaze of GLAZES) add(glaze, "plain");
  for (const orderId of player?.orderHand ?? []) {
    for (const requirement of ORDER_DEFINITIONS[orderId]?.ceramics ?? []) {
      const glazes = requirement.glaze === undefined ? GLAZES : [requirement.glaze];
      const decorations = requirement.decoration === undefined ? ["plain" as const] : [requirement.decoration];
      for (const glaze of glazes) for (const decoration of decorations) add(glaze, decoration);
    }
  }
  for (const option of all) {
    if (result.length >= 10) break;
    add(option.glaze, option.decoration);
  }
  return result;
}

function candidateWorkActions(
  state: GameState,
  playerId: PlayerId,
  exhaustive: boolean,
): GameAction[] {
  const player = state.players[playerId];
  if (player === undefined) return [];
  const actions: GameAction[] = [{ type: "PASS_WORK_PHASE" }];
  const workers = Object.values(player.workers).filter((worker) => worker.status === "available");
  const shaped = Object.values(state.ceramics).filter(
    (ceramic) => ceramic.ownerId === playerId && ceramic.stage === "shaped",
  );
  const glazed = Object.values(state.ceramics).filter(
    (ceramic) => ceramic.ownerId === playerId && ceramic.stage === "glazed",
  );
  const occupied = new Set(
    Object.values(state.ceramics)
      .filter((ceramic) => ceramic.stage === "loaded")
      .map((ceramic) => ceramic.stage === "loaded" ? ceramic.kilnSpaceId : "middle_1"),
  );
  const freeSpaces = activeKilnSpaceIds(state.playerCount).filter((space) => !occupied.has(space));
  const glazeOptions = relevantGlazeOptions(state, playerId, exhaustive);

  for (const worker of workers) {
    const materialTotal = worker.kind === "shifu" ? 4 : 3;
    for (let clay = 0; clay <= materialTotal; clay += 1) {
      const materialAction: Extract<GameAction, { type: "GAIN_MATERIALS" }> = {
        type: "GAIN_MATERIALS",
        workerId: worker.id,
        clay,
        wood: materialTotal - clay,
      };
      actions.push(materialAction);
      if (worker.kind === "shifu") {
        const gainedClay = Math.min(clay, state.commonSupply.clay);
        const gainedWood = Math.min(materialTotal - clay, state.commonSupply.wood);
        const clayForWoodMaximum = Math.min(
          player.resources.clay + gainedClay,
          state.commonSupply.wood - gainedWood,
        );
        const woodForClayMaximum = Math.min(
          player.resources.wood + gainedWood,
          state.commonSupply.clay - gainedClay,
        );
        for (let amount = 1; amount <= clayForWoodMaximum; amount += 1) {
          actions.push({ ...materialAction, exchange: { give: "clay", amount } });
        }
        for (let amount = 1; amount <= woodForClayMaximum; amount += 1) {
          actions.push({ ...materialAction, exchange: { give: "wood", amount } });
        }
      }
    }

    const formingTechniques = ownReadyTechniques(state, playerId, ["T01", "T02", "T03", "T04"]);
    const addFormVariants = (
      base: Extract<GameAction, { type: "FORM_CERAMICS" }>,
      allFormedCount: number,
    ) => {
      const totalClay = base.shapes.reduce((sum, shape) => sum + (
        worker.kind === "shifu" && (shape === "vase" || shape === "censer")
          ? 1
          : SHAPE_COSTS[shape]
      ), 0);
      const substitutions = base.useTechniqueIds?.includes("T03")
        ? Array.from({ length: totalClay }, (_, index) => index + 1)
        : [0];
      const dryingFrames = base.useTechniqueIds?.includes("T04")
        ? Array.from({ length: allFormedCount }, (_, formedIndex) =>
            GLAZES.map((glaze) => ({ formedIndex, glaze }))).flat()
        : [undefined];
      for (const claySubstitutions of substitutions) {
        for (const dryingFrame of dryingFrames) {
          actions.push({
            ...base,
            ...(claySubstitutions === 0 ? {} : { claySubstitutions }),
            ...(dryingFrame === undefined ? {} : { dryingFrames: dryingFrame }),
          });
        }
      }
    };
    for (const shapes of shapeSelections(worker.kind === "shifu" ? 2 : 1)) {
      const subsets = techniqueSubsets(formingTechniques);
      for (const useTechniqueIds of subsets) {
        const base: Extract<GameAction, { type: "FORM_CERAMICS" }> = {
          type: "FORM_CERAMICS",
          workerId: worker.id,
          shapes,
          useTechniqueIds,
        };
        addFormVariants(base, shapes.length);
        if (player.kilnId === "DI" && !player.kilnAbilityUsedThisRound) {
          for (const shape of shapes) {
            if (shape !== "bowl" && shape !== "plate" && shape !== "washer") continue;
            const dingAction = { ...base, dingExtraShape: shape };
            addFormVariants(dingAction, shapes.length + 1);
          }
        }
      }
    }

    const glazingTechniques = ownReadyTechniques(state, playerId, ["T05", "T06"]);
    for (const ceramic of shaped) {
      for (const option of glazeOptions) {
        const applicable = glazingTechniques.filter((id) =>
          id === "T05" ? option.decoration === "carved" : option.decoration === "impressed",
        );
        for (const useTechniqueIds of techniqueSubsets(applicable)) {
          const action: Extract<GameAction, { type: "GLAZE_CERAMICS" }> = {
            type: "GLAZE_CERAMICS",
            workerId: worker.id,
            selections: [{ ceramicId: ceramic.id, ...option }],
            useTechniqueIds,
          };
          actions.push(action);
          if (worker.kind === "shifu") {
            actions.push({ ...action, freeDecorationCeramicId: ceramic.id });
          }
        }
      }
    }
    if (worker.kind === "shifu") {
      const ceramicPairs = combinations(shaped, 2);
      const pairOptions = exhaustive ? glazeOptions : glazeOptions.slice(0, 7);
      for (const [first, second] of ceramicPairs) {
        if (first === undefined || second === undefined) continue;
        for (const firstOption of pairOptions) {
          for (const secondOption of pairOptions) {
            const applicable = glazingTechniques.filter((id) =>
              id === "T05"
                ? firstOption.decoration === "carved" || secondOption.decoration === "carved"
                : firstOption.decoration === "impressed" || secondOption.decoration === "impressed",
            );
            for (const useTechniqueIds of techniqueSubsets(applicable)) {
              const action: Extract<GameAction, { type: "GLAZE_CERAMICS" }> = {
                type: "GLAZE_CERAMICS",
                workerId: worker.id,
                selections: [
                  { ceramicId: first.id, ...firstOption },
                  { ceramicId: second.id, ...secondOption },
                ],
                useTechniqueIds,
              };
              actions.push(action);
              actions.push({ ...action, freeDecorationCeramicId: first.id });
              actions.push({ ...action, freeDecorationCeramicId: second.id });
            }
          }
        }
      }
    }

    for (const ceramic of glazed) {
      for (const kilnSpaceId of freeSpaces) {
        actions.push({
          type: "USE_KILN_YARD",
          workerId: worker.id,
          loads: [{ ceramicId: ceramic.id, kilnSpaceId }],
        });
      }
    }
    if (worker.kind === "shifu") {
      const ceramicPairs = combinations(glazed.slice(0, exhaustive ? glazed.length : 7), 2);
      for (const [first, second] of ceramicPairs) {
        if (first === undefined || second === undefined) continue;
        for (const firstSpace of freeSpaces) {
          for (const secondSpace of freeSpaces) {
            if (firstSpace === secondSpace) continue;
            actions.push({
              type: "USE_KILN_YARD",
              workerId: worker.id,
              loads: [
                { ceramicId: first.id, kilnSpaceId: firstSpace },
                { ceramicId: second.id, kilnSpaceId: secondSpace },
              ],
            });
          }
        }
      }
    }

    // Labour is uncapped, so it is legal for every available worker in every round.
    actions.push({ type: "USE_LABOUR", workerId: worker.id });
    actions.push({
      type: "BEGIN_OFFICE_ORDERS",
      workerId: worker.id,
      mode: worker.kind === "shifu" ? "take_up_to_two" : "take_one",
    });
    if (worker.kind === "shifu") {
      actions.push({ type: "BEGIN_OFFICE_ORDERS", workerId: worker.id, mode: "take_one_and_gain_two_coins" });
      // Court Patronage is its own uncapped location in v1.1.5, so it is offered to every
      // available Shifu regardless of how crowded the Office is.
      actions.push({ type: "USE_COURT_PATRONAGE", workerId: worker.id });
    }
    actions.push({ type: "BEGIN_GUILD_ACTION", workerId: worker.id });
  }
  return actions;
}

function candidateOrderActions(state: GameState, playerId: PlayerId): GameAction[] {
  const player = state.players[playerId];
  if (player === undefined) return [];
  const finished = Object.values(state.ceramics).filter(
    (ceramic) => ceramic.ownerId === playerId && ceramic.stage === "finished",
  );
  const actions: GameAction[] = [{ type: "END_ORDER_TURN" }];
  for (const orderId of player.orderHand) {
    const count = ORDER_DEFINITIONS[orderId]?.ceramics.length ?? 0;
    for (const selected of combinations(finished, count)) {
      const ceramicIds = selected.map(({ id }) => id);
      actions.push({ type: "COMPLETE_ORDER", orderId, ceramicIds, useGuanWaiver: false });
      actions.push({ type: "COMPLETE_ORDER", orderId, ceramicIds, useGuanWaiver: true });
    }
  }
  return actions;
}

function candidatePresentationActions(state: GameState, playerId: PlayerId): GameAction[] {
  const eligible = Object.values(state.ceramics).filter(
    (ceramic) =>
      ceramic.ownerId === playerId && ceramic.stage === "finished" && ceramic.quality !== "flawed",
  );
  return [0, 1, 2, 3].flatMap((size) =>
    combinations(eligible, size).map((selected) => ({
      type: "SUBMIT_PRESENTATION" as const,
      ceramicIds: selected.map(({ id }) => id),
    })),
  );
}

function candidatePhaseActions(
  state: GameState,
  playerId: PlayerId,
  options: LegalActionOptions,
): AuthoritativeCommand[] {
  const phase = state.phase;
  const player = state.players[playerId];
  switch (phase.type) {
    case "setup_kiln_selection":
      return KILN_IDS.map((kilnId) => ({ type: "SELECT_KILN", kilnId }));
    case "setup_starting_orders":
      return combinations(phase.offeredOrderIds[playerId] ?? [], 2).map((orderIds) => ({
        type: "SUBMIT_STARTING_ORDERS" as const,
        orderIds,
      }));
    case "work":
      return candidateWorkActions(state, playerId, options.exhaustive === true);
    case "work_office_orders":
      if (phase.step === "colour_samples_or_skip") {
        return [
          { type: "OFFICE_SKIP_COLOUR_SAMPLES" },
          { type: "OFFICE_USE_COLOUR_SAMPLES", deck: "market" },
          { type: "OFFICE_USE_COLOUR_SAMPLES", deck: "imperial" },
        ];
      }
      if (phase.step === "colour_samples_choose") {
        return (phase.colourSamplesChoices ?? []).map((orderId) => ({ type: "OFFICE_CHOOSE_COLOUR_SAMPLES_ORDER" as const, orderId }));
      }
      return [
        { type: "OFFICE_END_ORDERS" },
        ...[...state.marketDisplay, ...state.imperialDisplay].map((orderId) => ({
          type: "OFFICE_TAKE_ORDER" as const,
          orderId,
        })),
        { type: "OFFICE_DRAW_BLIND_ORDER", deck: "market" },
        { type: "OFFICE_DRAW_BLIND_ORDER", deck: "imperial" },
      ];
    case "work_office_sale": {
      const maximum = player?.workers[phase.workerId]?.kind === "shifu" ? 2 : 1;
      const flawed = Object.values(state.ceramics).filter(
        (ceramic) => ceramic.ownerId === playerId && ceramic.stage === "finished" && ceramic.quality === "flawed",
      );
      return Array.from({ length: maximum + 1 }, (_, size) => combinations(flawed, size))
        .flat()
        .map((selected) => ({
          type: "OFFICE_RESOLVE_FLAWED_SALE" as const,
          ceramicIds: selected.map(({ id }) => id),
        }));
    }
    case "work_office_connoisseur": {
      const eligible = Object.values(state.ceramics).filter(
        (ceramic) => ceramic.ownerId === playerId && ceramic.stage === "finished" && ceramic.quality !== "flawed",
      );
      return [
        { type: "OFFICE_RESOLVE_CONNOISSEUR_NETWORK", ceramicId: null },
        ...eligible.map(({ id }) => ({ type: "OFFICE_RESOLVE_CONNOISSEUR_NETWORK" as const, ceramicId: id })),
      ];
    }
    case "work_guild": {
      const ids = Object.values(state.techniqueDisplay).flat();
      if (phase.step === "refresh_or_skip") {
        return [
          { type: "GUILD_SKIP_REFRESH" },
          ...ids.map((techniqueId) => ({ type: "GUILD_REFRESH_TECHNIQUE" as const, techniqueId })),
        ];
      }
      return ids.map((techniqueId) => ({ type: "GUILD_BUY_TECHNIQUE", techniqueId }));
    }
    case "firing_before_contribution": {
      if (phase.techniqueIds[phase.queue.currentIndex] === "T12") {
        return [{ type: "RESOLVE_TEST_PIECES", use: false }, { type: "RESOLVE_TEST_PIECES", use: true }];
      }
      if (phase.techniqueIds[phase.queue.currentIndex] === "T03") {
        // Clay Substitution grants exactly three resources split any way between the two.
        return [
          { type: "RESOLVE_FIRING_CLAY_SUBSTITUTION", clay: 0, wood: 0, use: false },
          ...[0, 1, 2, 3].map((wood) => ({
            type: "RESOLVE_FIRING_CLAY_SUBSTITUTION" as const,
            clay: 3 - wood,
            wood,
            use: true,
          })),
        ];
      }
      const loaded = Object.values(state.ceramics).filter(
        (ceramic) => ceramic.ownerId === playerId && ceramic.stage === "loaded",
      );
      const occupied = new Set(
        Object.values(state.ceramics)
          .filter((ceramic) => ceramic.stage === "loaded")
          .map((ceramic) => ceramic.stage === "loaded" ? ceramic.kilnSpaceId : "middle_1"),
      );
      const free = activeKilnSpaceIds(state.playerCount).filter((space) => !occupied.has(space));
      return [
        { type: "RESOLVE_KILN_SETTING", ceramicId: null, toSpaceId: null },
        ...loaded.flatMap((ceramic) => free.map((toSpaceId) => ({
          type: "RESOLVE_KILN_SETTING" as const,
          ceramicId: ceramic.id,
          toSpaceId,
        }))),
      ];
    }
    case "firing_contributions": {
      if (!phase.eligiblePlayerIds.includes(playerId) || phase.submittedPlayerIds.includes(playerId)) return [];
      // V1.1.1: the bid is a plain 0-3. Fuel Ledger is no longer committed here; it is
      // offered reactively in the firing_after_reveal window when Base Heat would be 0 or 1.
      const availableWood = player?.resources.wood ?? 0;
      // Tend costs nothing, so at least one card is always legal and the window can close.
      return CONTRIBUTION_CARD_IDS
        .filter((card) => contributionWoodCost(card) <= availableWood)
        .map((card) => ({
          type: "SUBMIT_WOOD_CONTRIBUTION" as const,
          windowId: phase.windowId,
          card,
        }));
    }
    case "firing_after_reveal":
      return [{ type: "RESOLVE_FUEL_LEDGER", use: false }, { type: "RESOLVE_FUEL_LEDGER", use: true }];
    case "firing_reposition": {
      const loaded = Object.values(state.ceramics).filter((ceramic) => ceramic.ownerId === playerId && ceramic.stage === "loaded");
      const occupied = new Set(Object.values(state.ceramics).filter((ceramic) => ceramic.stage === "loaded").map((ceramic) => ceramic.stage === "loaded" ? ceramic.kilnSpaceId : "middle_1"));
      const free = activeKilnSpaceIds(state.playerCount).filter((space) => !occupied.has(space));
      return [
        { type: "RESOLVE_KILN_YARD_REPOSITION", ceramicId: null, toSpaceId: null },
        ...loaded.flatMap((ceramic) => free.map((toSpaceId) => ({ type: "RESOLVE_KILN_YARD_REPOSITION" as const, ceramicId: ceramic.id, toSpaceId }))),
      ];
    }
    case "firing_after_fire_reveal": {
      const loaded = Object.values(state.ceramics).filter(
        (ceramic) => ceramic.ownerId === playerId && ceramic.stage === "loaded",
      );
      return [
        { type: "RESOLVE_SAGGER_SELECTION", ceramicId: null },
        ...loaded.map(({ id }) => ({ type: "RESOLVE_SAGGER_SELECTION" as const, ceramicId: id })),
      ];
    }
    case "firing_before_quality": {
      const loaded = Object.values(state.ceramics).filter(
        (ceramic) => ceramic.ownerId === playerId && ceramic.stage === "loaded",
      );
      if (player?.kilnId === "JU") {
        // Jun pays Wood, not Coins. This previously read `resources.coins` against a cost
        // from the retired jun-ab-001 Coin experiment, so the enumerated set disagreed with
        // the engine in both directions.
        return [
          { type: "RESOLVE_JUN", ceramicId: null, delta: null },
          ...(player.resources.wood < JUN_ACTIVATION_WOOD ? [] : loaded.flatMap(({ id }) => ([-1, 1] as const).map((delta) => ({
            type: "RESOLVE_JUN" as const,
            ceramicId: id,
            delta,
          })))),
        ];
      }
      // Ge acts at a Heat Difference of 1 or 2. This filter must match the engine's
      // eligibility exactly: offering fewer targets silently removes the rule from play.
      const geEligible = loaded.filter(({ id }) => {
        const difference = state.firingContext?.ceramicResults[id]?.finalHeatDifference;
        return difference === 1 || difference === 2;
      });
      return [
        { type: "RESOLVE_GE", ceramicId: null },
        ...geEligible.map(({ id }) => ({ type: "RESOLVE_GE" as const, ceramicId: id })),
      ];
    }
    case "firing_after_quality": {
      const techniqueId = phase.techniqueIds[phase.queue.currentIndex];
      const loaded = Object.values(state.ceramics).filter(
        (ceramic) => ceramic.ownerId === playerId && ceramic.stage === "loaded",
      );
      if (techniqueId === "T10") {
        return [
          { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: null },
          ...loaded.map(({ id }) => ({ type: "RESOLVE_PROTECTIVE_SAGGARS" as const, ceramicId: id })),
        ];
      }
      return [
        { type: "RESOLVE_SECOND_FIRING", ceramicId: null },
        ...loaded.map(({ id }) => ({ type: "RESOLVE_SECOND_FIRING" as const, ceramicId: id })),
      ];
    }
    case "firing_after_firing": {
      const techniqueId = phase.techniqueIds[phase.queue.currentIndex];
      return techniqueId === "T12"
        ? [{ type: "RESOLVE_TEST_PIECES", use: false }, { type: "RESOLVE_TEST_PIECES", use: true }]
        : [{ type: "RESOLVE_KILN_RECORDS", use: false }, { type: "RESOLVE_KILN_RECORDS", use: true }];
    }
    case "orders":
      return candidateOrderActions(state, playerId);
    case "cleanup_orders": {
      // Read the limit from the rules, never re-derive it here: this line previously
      // hard-coded Guan's +1 and silently disagreed with the engine the moment it changed.
      const count = player === undefined ? 0 : Math.max(0, player.orderHand.length - orderHandLimit());
      return combinations(player?.orderHand ?? [], count).map((orderIds) => ({ type: "DISCARD_ORDERS_FOR_CLEANUP" as const, orderIds }));
    }
    case "presentation":
      return candidatePresentationActions(state, playerId);
    case "finished":
      return [];
  }
}

function isContribution(action: AIAction): action is Extract<AIAction, { type: "SUBMIT_WOOD_CONTRIBUTION" }> {
  return action.type === "SUBMIT_WOOD_CONTRIBUTION";
}

function validates(
  state: GameState,
  playerId: PlayerId,
  privateFiringState: PrivateFiringState,
  action: AIAction,
): boolean {
  if (isContribution(action)) {
    return submitWoodContribution(
      state,
      privateFiringState,
      playerId,
      action.card,
      validationRng,
    ).ok;
  }
  return applyAction(state, playerId, action, validationRng).ok;
}

export function getLegalAIActions(
  state: GameState,
  playerId: PlayerId,
  privateFiringState: PrivateFiringState,
  options: LegalActionOptions = {},
): AIAction[] {
  const expected = currentDecisionActor(state.phase);
  if (state.phase.type === "presentation") {
    if (!state.phase.eligiblePlayerIds.includes(playerId) || state.phase.submittedPlayerIds.includes(playerId)) return [];
  } else if (state.phase.type !== "firing_contributions" && expected !== playerId) return [];
  const candidates = candidatePhaseActions(state, playerId, options);
  const unique = [...new Map(candidates.map((action) => [JSON.stringify(action), action])).values()];
  const maximum = options.maxCandidates ?? (options.exhaustive === true ? Number.POSITIVE_INFINITY : 5_000);
  return unique
    .filter((action) => validates(state, playerId, privateFiringState, action))
    .slice(0, maximum);
}

export function getAllLegalAIActions(
  state: GameState,
  playerId: PlayerId,
  privateFiringState: PrivateFiringState,
): AIAction[] {
  return getLegalAIActions(state, playerId, privateFiringState, { exhaustive: true });
}

export function actionTechniqueId(action: AIAction): TechniqueId | null {
  if (action.type === "GUILD_BUY_TECHNIQUE" || action.type === "GUILD_REFRESH_TECHNIQUE") {
    return action.techniqueId;
  }
  if (
    action.type === "FORM_CERAMICS" ||
    action.type === "GLAZE_CERAMICS"
  ) {
    return action.useTechniqueIds?.[0] ?? null;
  }
  const direct: Partial<Record<AIAction["type"], TechniqueId>> = {
    RESOLVE_KILN_SETTING: "T09",
    RESOLVE_PROTECTIVE_SAGGARS: "T10",
    RESOLVE_FUEL_LEDGER: "T11",
    RESOLVE_TEST_PIECES: "T12",
    RESOLVE_KILN_RECORDS: "T13",
    OFFICE_RESOLVE_CONNOISSEUR_NETWORK: "T14",
    RESOLVE_SECOND_FIRING: "T15",
    RESOLVE_SAGGER_SELECTION: "T16",
  };
  return direct[action.type] ?? null;
}

export function actionOrderId(action: AIAction): OrderId | null {
  return action.type === "OFFICE_TAKE_ORDER" || action.type === "COMPLETE_ORDER" ? action.orderId : null;
}

export function legalActionDiagnostics(actions: AIAction[]): Record<string, number> {
  return actions.reduce<Record<string, number>>((counts, action) => {
    counts[action.type] = (counts[action.type] ?? 0) + 1;
    return counts;
  }, {});
}

export function techniqueName(techniqueId: TechniqueId): string {
  return TECHNIQUE_DEFINITIONS[techniqueId]?.name ?? techniqueId;
}
