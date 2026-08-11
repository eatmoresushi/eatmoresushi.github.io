import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { KILN_IDS } from "../game/index.ts";
import type { KilnId, PlayerCount, PlayerId } from "../game/index.ts";
import { runSelfPlayGame } from "./selfplay.ts";
import { createInitialStrategyProfile } from "./strategy.ts";
import { AI_POLICY_VERSION } from "./types.ts";

const outputDirectory = resolve("playtests/v1.0.2/smoke");
const counts = [2, 3, 4] as const satisfies readonly PlayerCount[];

function assignments(playerCount: PlayerCount): Record<PlayerId, KilnId> {
  return Object.fromEntries(Array.from({ length: playerCount }, (_, index) => [
    `P${index + 1}`,
    KILN_IDS[index]!,
  ]));
}

const results = [];
for (const playerCount of counts) {
  const profile = createInitialStrategyProfile(playerCount);
  const result = await runSelfPlayGame({
    gameId: `v102-smoke-${playerCount}p`,
    gameSequence: 1,
    playerCount,
    gameSeed: 102_000 + playerCount,
    aiSeed: 202_000 + playerCount,
    assignedTraditions: assignments(playerCount),
    datasetSplit: "holdout",
    profile,
    policyVersion: AI_POLICY_VERSION,
    explorationRate: 0,
    learningPhaseOverride: "mature",
  });
  results.push({
    playerCount,
    rulesVersion: result.state.rulesVersion,
    aiPolicyVersion: AI_POLICY_VERSION,
    profileRulesVersion: profile.rulesVersion,
    completed: result.state.phase.type === "finished" && result.state.finalResult !== null,
    decisions: result.decisions.length,
    illegalActionAttempts: result.illegalActionAttempts,
    scores: result.state.finalResult?.scores,
  });
}

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  resolve(outputDirectory, "compatibility_summary.json"),
  `${JSON.stringify({
    rulesVersion: "1.0.2",
    aiPolicyVersion: AI_POLICY_VERSION,
    purpose: "compatibility smoke test only; not a balance or training dataset",
    results,
  }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
