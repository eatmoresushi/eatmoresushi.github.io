/**
 * Public barrel of the V1.6.1 engine. Consumers (multiplayer service, computer player, UI)
 * import from here; engine modules import each other directly.
 *
 * Exported: the contract types, content, the rules fingerprint, rule-error text, the
 * dispatcher, `parseCommand`, randomness, the hidden-information boundary (views,
 * projection, events), `decisionPrompt` and the selectors (via `selectors.ts`), and the
 * legal-action API. Engine-internal helpers
 * (`state.ts`, `placement.ts`, `techs.ts`, `kilns.ts`, phase modules) are not exported.
 */

export type * from "./types.ts";
export * from "./content.ts";
export * from "./rulesFingerprint.ts";
export * from "./ruleErrorText.ts";
export { applyAction, createGame, submitContribution, validateAction } from "./engine.ts";
export { COMMAND_TYPES, parseCommand } from "./actionGuard.ts";
export { SeededRandom, rollDie, shuffle } from "./rng.ts";
export { InvariantError, NotImplementedError, isGameRuleError } from "./errors.ts";
export {
  actorViewOf,
  eventForViewer,
  projectEvent,
  projectPrivateView,
  projectPublicState,
  publicCounts,
  viewOf,
} from "./view.ts";
export * from "./selectors.ts";
export * from "./legalActions.ts";
