import { TECHNIQUES } from "../game/index.ts";
import type { PlayerObservation, PlayerPlan, PlannedCeramicAssignment } from "./types.ts";
import { longHorizonTechniqueValue } from "./lookaheadPolicy.ts";

export interface TechniqueCompetencyResult {
  techniqueId: string;
  positiveValue: number;
  declineValue: number;
  positivePassed: boolean;
  declinePassed: boolean;
}

function assignments(): PlannedCeramicAssignment[] {
  return [
    ["vase", "celadon", "carved"],
    ["censer", "white", "impressed"],
    ["bowl", "grey_green", "carved"],
    ["plate", "moon_white", "impressed"],
    ["washer", "celadon", "plain"],
    ["vase", "white", "plain"],
  ].map(([shape, glaze, decoration], requirementIndex) => ({
    requirementIndex,
    shape: shape as PlannedCeramicAssignment["shape"],
    glaze: glaze as PlannedCeramicAssignment["glaze"],
    decoration: decoration as PlannedCeramicAssignment["decoration"],
    minQuality: "fine",
    ceramicId: null,
    currentStage: "missing",
    stageDebt: 4,
    qualityProbability: 0.75,
  }));
}

function positivePlan(base: PlayerPlan): PlayerPlan {
  const richAssignments = assignments();
  return {
    ...structuredClone(base),
    primaryOrderId: "M01",
    secondaryOrderIds: [],
    orderFeasibilities: [{
      orderId: "M01",
      probability: 0.75,
      feasible: true,
      assignments: richAssignments,
      missingSpecifications: richAssignments,
      actionDebt: 12,
      resourceDebt: { clay: 6, wood: 2, coins: 0 },
      earliestCompletionRound: 4,
      relationConflicts: 0,
      reasons: ["pipeline_work", "resource_shortage"],
    }],
    resourceDemand: { clay: 8, wood: 5, coins: 2, claySafety: 6, woodSafety: 0, coinSafety: 0 },
    pipeline: { shaped: 2, glazed: 2, loaded: 2, finished: 0 },
    remainingRounds: 5,
  };
}

function declinePlan(base: PlayerPlan): PlayerPlan {
  return {
    ...structuredClone(base),
    primaryOrderId: null,
    secondaryOrderIds: [],
    orderFeasibilities: [],
    resourceDemand: { clay: 0, wood: 0, coins: 0, claySafety: 0, woodSafety: 0, coinSafety: 0 },
    pipeline: { shaped: 0, glazed: 0, loaded: 0, finished: 0 },
    remainingRounds: 1,
  };
}

export function auditTechniqueCompetencies(
  sourceObservation: PlayerObservation,
  sourcePlan: PlayerPlan,
): TechniqueCompetencyResult[] {
  const positiveObservation = structuredClone(sourceObservation);
  positiveObservation.game.round = 1;
  const positivePlayer = positiveObservation.game.players[positiveObservation.playerId]!;
  positivePlayer.resources = { clay: 0, wood: 10, coins: 10 };
  positivePlayer.orderHand = [];
  positiveObservation.game.ceramics[`${positiveObservation.playerId}:competency:masterpiece`] = {
    id: `${positiveObservation.playerId}:competency:masterpiece`,
    vesselInstanceId: "competency-vessel",
    ownerId: positiveObservation.playerId,
    shape: "bowl",
    stage: "finished",
    glaze: "celadon",
    decoration: "plain",
    quality: "masterpiece",
    firedInRound: 1,
  };
  const negativeObservation = structuredClone(sourceObservation);
  negativeObservation.game.round = 5;
  const negativePlayer = negativeObservation.game.players[negativeObservation.playerId]!;
  negativePlayer.resources = { clay: 5, wood: 0, coins: 0 };
  negativePlayer.orderHand = ["M01", "M02", "M03"];
  negativeObservation.game.ceramics = Object.fromEntries(Object.entries(negativeObservation.game.ceramics)
    .filter(([, ceramic]) => ceramic.ownerId !== negativeObservation.playerId));
  const rich = positivePlan(sourcePlan);
  const empty = declinePlan(sourcePlan);
  return TECHNIQUES.map(({ id }) => {
    const positiveValue = longHorizonTechniqueValue(positiveObservation, rich, id, "shifu");
    const declineValue = longHorizonTechniqueValue(negativeObservation, empty, id, "shifu");
    return {
      techniqueId: id,
      positiveValue,
      declineValue,
      positivePassed: positiveValue > 0,
      declinePassed: declineValue < 0,
    };
  });
}
