/**
 * The five round phases (L114–132) for display, and which one an engine phase belongs to
 * (UI_V1.6.1_ARCHITECTURE.md §5 gap 17).
 *
 * `data/round_structure.json` is display text only (names and summaries). It is **not** a
 * rules-fingerprint input (`CONTENT_SOURCES` lists the seven mechanical files), so editing its
 * prose never moves the content digest. No rule reads this module: the engine's own flow
 * (`round.ts`, `engine.ts`) decides what happens; this only labels it.
 *
 * Layer 1: imports only types and the display JSON.
 */

import roundStructureJson from "../../data/round_structure.json" with { type: "json" };
import type { GamePhaseType, RoundPhaseDefinition, RoundPhaseId, RoundStructureDefinition } from "./types.ts";

/** Round phases in play order (L118). */
export const ROUND_PHASE_IDS: readonly RoundPhaseId[] = Object.freeze(["start", "work", "firing", "orders", "cleanup"] as const);

function loadRoundStructure(raw: unknown): RoundStructureDefinition {
  const file = raw as RoundStructureDefinition;
  const problems: string[] = [];
  if (file.rulesVersion !== "1.6.2") {
    problems.push(`rulesVersion is ${String(file.rulesVersion)}, not 1.6.2`);
  }
  if (!Number.isSafeInteger(file.roundCount) || file.roundCount < 1) {
    problems.push(`roundCount ${String(file.roundCount)} is not a positive integer`);
  }
  const phases = Array.isArray(file.phases) ? file.phases : [];
  const ids = phases.map((phase) => phase.id);
  if (ids.join(",") !== ROUND_PHASE_IDS.join(",")) {
    problems.push(`phases are [${ids.join(", ")}], expected [${ROUND_PHASE_IDS.join(", ")}]`);
  }
  phases.forEach((phase: RoundPhaseDefinition, index) => {
    if (phase.order !== index + 1) {
      problems.push(`phase ${phase.id} has order ${phase.order}, expected ${index + 1}`);
    }
    for (const key of ["name", "nameZh", "summary", "summaryZh"] as const) {
      if (typeof phase[key] !== "string" || phase[key].trim() === "") {
        problems.push(`phase ${phase.id} has no ${key}`);
      }
    }
  });
  if (problems.length > 0) {
    throw new Error(`Invalid data/round_structure.json:\n- ${problems.join("\n- ")}`);
  }
  return Object.freeze({
    rulesVersion: file.rulesVersion,
    roundCount: file.roundCount,
    phases: Object.freeze(phases.map((phase) => Object.freeze({ ...phase }))) as unknown as RoundPhaseDefinition[],
  });
}

/** `data/round_structure.json`, validated and frozen: names and summaries of the round phases. */
export const ROUND_STRUCTURE: RoundStructureDefinition = loadRoundStructure(roundStructureJson);

/**
 * The round phase an engine phase belongs to, or `"final"` once the game is finished.
 * Kiln selection (setup step 9, L108) is shown with the Start of Round, as the wireframe does.
 * Exhaustive over `GamePhaseType`, so a new engine phase fails `typecheck` here.
 */
export function roundPhaseOf(phaseType: GamePhaseType): RoundPhaseId | "final" {
  switch (phaseType) {
    case "setup_kiln_selection":
    case "round_start_setters_mark":
      return "start";
    case "work_turn":
      return "work";
    case "firing_contributions":
    case "firing_test_pieces":
    case "firing_heat_markers":
    case "firing_heat_adjustment":
    case "firing_after_quality":
    case "firing_second_firing_jun":
    case "firing_salvage":
      return "firing";
    case "orders":
      return "orders";
    case "cleanup_hand_limit":
      return "cleanup";
    case "finished":
      return "final";
  }
}
