import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GAME_CONFIG, KILN_IDS } from "../game/index.ts";
import type { KilnId, PlayerCount, PlayerId } from "../game/index.ts";
import { createProductionV3Profile } from "./productionProfile.ts";
import { runSelfPlayGame } from "./selfplay.ts";
import { AI_POLICY_VERSION } from "./types.ts";

const outputDirectory = resolve("playtests/v1.0.4/smoke");
const counts = [2, 3, 4] as const satisfies readonly PlayerCount[];

function assignments(playerCount: PlayerCount): Record<PlayerId, KilnId> {
  return Object.fromEntries(Array.from({ length: playerCount }, (_, index) => [
    `P${index + 1}`,
    KILN_IDS[index]!,
  ]));
}

const results = [];
for (const playerCount of counts) {
  // The online V003 profile remains honestly tagged as trained under V1.0.2.
  // It is interpreted by the current V1.0.4 engine for this compatibility smoke.
  const profile = createProductionV3Profile(playerCount);
  const result = await runSelfPlayGame({
    gameId: `v104-smoke-${playerCount}p`,
    gameSequence: 1,
    playerCount,
    gameSeed: 104_000 + playerCount,
    aiSeed: 204_000 + playerCount,
    assignedTraditions: assignments(playerCount),
    datasetSplit: "holdout",
    profile,
    policyVersion: AI_POLICY_VERSION,
    explorationRate: 0,
    learningPhaseOverride: "mature",
  });
  const publicEvents = result.events.map(({ eventJson }) => JSON.parse(eventJson) as { type?: string });
  results.push({
    playerCount,
    rulesVersion: result.state.rulesVersion,
    trainedRulesVersion: profile.rulesVersion,
    currentRulesVersion: profile.currentRulesVersion,
    aiPolicyVersion: AI_POLICY_VERSION,
    completed: result.state.phase.type === "finished" && result.state.finalResult !== null,
    decisions: result.decisions.length,
    illegalActionAttempts: result.illegalActionAttempts,
    orderRotations: publicEvents.filter(({ type }) => type === "ORDER_DISPLAYS_ROTATED").length,
    imperialStipends: publicEvents.filter(({ type }) => type === "IMPERIAL_STIPEND_RECEIVED").length,
    exhibitionUse: Object.fromEntries(result.state.playerOrder.map((playerId) => [
      playerId,
      {
        capacity: [1, 1, 2, 2, 3, 3][result.state.players[playerId]!.imperialProgress],
        exhibited: result.state.players[playerId]!.presentationCeramicIds.length,
        vp: result.state.finalResult?.scores[playerId]?.presentation ?? 0,
      },
    ])),
    scores: result.state.finalResult?.scores,
  });
}

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  resolve(outputDirectory, "compatibility_summary.json"),
  `${JSON.stringify({
    rulesVersion: "1.0.4",
    trainedRulesVersion: "1.0.2",
    aiPolicyVersion: AI_POLICY_VERSION,
    fireDeck: GAME_CONFIG.fireDeck,
    purpose: "bounded compatibility smoke only; not a balance or training dataset",
    results,
  }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
