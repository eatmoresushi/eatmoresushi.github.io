import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { AI_POLICY_VERSION, AI_SIMULATION_VERSION } from "./types.ts";

const REPOSITORY_ROOT = "/Users/luyuan/Documents/eatmoresushi.github.io";
const PROJECT_RELATIVE_PATH = "apps/kiln-opening";

export interface SourceIdentity {
  repositoryPath: string;
  projectPath: string;
  executionPath: string;
  repositoryHead: string;
  repositoryDirty: boolean;
  repositoryStatus: string;
  trackedDiffSha256: string;
  relevantUntrackedSourceSha256: string;
  sourceFiles: Record<string, string>;
  aggregateSourceSha256: string;
  nodeVersion: string;
  npmVersion: string;
  rulesVersion: "1.0.4";
  policyVersion: typeof AI_POLICY_VERSION;
  simulationVersion: typeof AI_SIMULATION_VERSION;
}

export interface StudySourceManifest {
  sourceIdentity: SourceIdentity;
  sourceIdentitySha256: string;
  invocation: {
    command: string;
    arguments: string[];
  };
  seedScheduleSha256: string;
  frozenProfileSha256: string;
  preHoldoutFreezeSha256: string;
  verification: Array<{ command: string; status: "passed-before-study" }>;
  startedAt: string;
  completedAt: string;
  totalRuntimeMs: number;
  validGames: number;
  invalidAttempts: number;
  replacements: Array<{ gameId: string; seed: number; error: string }>;
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function command(commandName: string, args: string[], cwd: string): string {
  try {
    return execFileSync(commandName, args, { cwd, encoding: "utf8" }).trim();
  } catch {
    return "unavailable";
  }
}

async function recursivelyList(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? recursivelyList(path) : [path];
  }));
  return nested.flat().sort();
}

async function sourceFileList(projectPath: string): Promise<string[]> {
  const direct = [
    "AGENTS.md",
    "package.json",
    "tsconfig.json",
    "tsconfig.edge.json",
    "docs/GAME_RULES.md",
    "docs/IMPLEMENTATION_DECISIONS.md",
    "docs/AI_ARCHITECTURE.md",
    "docs/AI_PLAYER_NEXT_STEPS.md",
    "docs/PLAYTEST_TELEMETRY.md",
    "src/multiplayer/projection.ts",
    "src/multiplayer/types.ts",
  ];
  const folders = ["src/ai", "src/game", "data", "test"];
  const folderFiles = (await Promise.all(folders.map(async (folder) => {
    try {
      return await recursivelyList(join(projectPath, folder));
    } catch {
      return [];
    }
  }))).flat();
  const existing: string[] = [];
  for (const path of [...direct.map((path) => join(projectPath, path)), ...folderFiles]) {
    try {
      if ((await stat(path)).isFile()) existing.push(path);
    } catch {
      // An optional source (for example a test before it is added) is omitted.
    }
  }
  return [...new Set(existing)].sort();
}

export async function createSourceIdentity(executionPath = process.cwd()): Promise<SourceIdentity> {
  const projectPath = resolve(REPOSITORY_ROOT, PROJECT_RELATIVE_PATH);
  const sourcePath = resolve(executionPath);
  const relevantPaths = [
    `${PROJECT_RELATIVE_PATH}/AGENTS.md`,
    `${PROJECT_RELATIVE_PATH}/package.json`,
    `${PROJECT_RELATIVE_PATH}/tsconfig.json`,
    `${PROJECT_RELATIVE_PATH}/tsconfig.edge.json`,
    `${PROJECT_RELATIVE_PATH}/docs`,
    `${PROJECT_RELATIVE_PATH}/data`,
    `${PROJECT_RELATIVE_PATH}/src/ai`,
    `${PROJECT_RELATIVE_PATH}/src/game`,
    `${PROJECT_RELATIVE_PATH}/src/multiplayer/projection.ts`,
    `${PROJECT_RELATIVE_PATH}/src/multiplayer/types.ts`,
    `${PROJECT_RELATIVE_PATH}/test`,
  ];
  const status = command("git", ["status", "--short", "--", ...relevantPaths], REPOSITORY_ROOT);
  const trackedDiff = command("git", ["diff", "--binary", "HEAD", "--", ...relevantPaths], REPOSITORY_ROOT);
  const untracked = command("git", ["ls-files", "--others", "--exclude-standard", "--", PROJECT_RELATIVE_PATH], REPOSITORY_ROOT)
    .split("\n").filter((path) => path.length > 0 && relevantPaths.some((relevant) => path === relevant || path.startsWith(`${relevant}/`))).sort();
  const untrackedParts: string[] = [];
  for (const path of untracked) {
    const absolute = resolve(REPOSITORY_ROOT, path);
    try {
      untrackedParts.push(`${path}:${sha256(await readFile(absolute))}`);
    } catch {
      untrackedParts.push(`${path}:unreadable`);
    }
  }
  const files = await sourceFileList(sourcePath);
  const sourceFiles: Record<string, string> = {};
  for (const path of files) sourceFiles[relative(sourcePath, path)] = sha256(await readFile(path));
  const aggregateSourceSha256 = sha256(Object.entries(sourceFiles).map(([path, digest]) => `${path}:${digest}`).join("\n"));
  return {
    repositoryPath: REPOSITORY_ROOT,
    projectPath,
    executionPath: sourcePath,
    repositoryHead: command("git", ["rev-parse", "HEAD"], REPOSITORY_ROOT),
    repositoryDirty: status.length > 0 && status !== "unavailable",
    repositoryStatus: status,
    trackedDiffSha256: sha256(trackedDiff),
    relevantUntrackedSourceSha256: sha256(untrackedParts.join("\n")),
    sourceFiles,
    aggregateSourceSha256,
    nodeVersion: process.version,
    npmVersion: command("npm", ["--version"], sourcePath),
    rulesVersion: "1.0.4",
    policyVersion: AI_POLICY_VERSION,
    simulationVersion: AI_SIMULATION_VERSION,
  };
}

export function sourceIdentityHash(identity: SourceIdentity): string {
  return sha256(JSON.stringify(identity));
}
