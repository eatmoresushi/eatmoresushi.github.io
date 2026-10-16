/**
 * The draft model of Test Pieces (UI_V1.6.1_ARCHITECTURE §3.4 `test_pieces`, §3.5). Owner: B5.
 *
 * Firing step 4, in First Player order. Two sub-steps (`testPiecesOptions(view).awaiting`):
 * - `decision`: pay Wood and peek privately (`TEST_PIECES_DECIDE { peek: true }`), or decline;
 *   whether the peek is possible is the engine's verdict (`canPeek`, and `validateAction`'s
 *   reason when it is not);
 * - `bury`: the viewer's private peek (`own.firePeek`, shown only to them) goes to the bottom of
 *   the Fire deck or stays on top (`TEST_PIECES_BURY`).
 */
import { testPiecesOptions } from "../../../game/index.ts";
import type { FireModifier, GameRuleError } from "../../../game/index.ts";
import { techName } from "../../i18n/content.ts";
import { msg } from "../../i18n/translator.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import type { EngineView } from "../../state/model.ts";
import { B5_TECHS, probe, woodText } from "./firingSupport.ts";

export type TestPiecesChoice = "peek" | "decline" | "bury" | "keep";

export interface TestPiecesDraft {
  readonly choice: TestPiecesChoice | null;
}

export type TestPiecesAction = { readonly type: "choose"; readonly choice: TestPiecesChoice };

export interface TestPiecesOptions {
  awaiting: "decision" | "bury" | null;
  woodCost: number;
  /** The choices of this sub-step; an unavailable one carries the engine's reason. */
  choices: { choice: TestPiecesChoice; error: GameRuleError | null }[];
  /** The viewer's own peek (private), in the bury sub-step. */
  peekedModifier: FireModifier | null;
}

/** The selector says no but the probe found no reason: the choice still stays unavailable. */
const CANNOT_PEEK: GameRuleError = Object.freeze({ code: "INVALID_CHOICE", message: "Test Pieces cannot be used now.", details: { field: "peek" } }) as GameRuleError;

function optionsFor(engine: EngineView): TestPiecesOptions {
  const options = testPiecesOptions(engine.view);
  if (options === null) return { awaiting: null, woodCost: 0, choices: [], peekedModifier: null };
  if (options.awaiting === "decision") {
    return {
      awaiting: "decision",
      woodCost: options.woodCost,
      choices: [
        { choice: "peek", error: options.canPeek ? null : (probe(engine, { type: "TEST_PIECES_DECIDE", peek: true }) ?? CANNOT_PEEK) },
        { choice: "decline", error: null },
      ],
      peekedModifier: null,
    };
  }
  return {
    awaiting: "bury",
    woodCost: options.woodCost,
    choices: [
      { choice: "bury", error: null },
      { choice: "keep", error: null },
    ],
    peekedModifier: options.peekedModifier,
  };
}

function offered(engine: EngineView, choice: TestPiecesChoice | null): boolean {
  return choice !== null && optionsFor(engine).choices.some((entry) => entry.choice === choice && entry.error === null);
}

export const testPiecesDraft: DraftModel<TestPiecesDraft, TestPiecesAction, TestPiecesOptions> = {
  initial() {
    return { choice: null };
  },
  reduce(draft, action, _model, engine) {
    if (action.type === "revalidate") return draft.choice === null || offered(engine, draft.choice) ? draft : { choice: null };
    return offered(engine, action.choice) ? { choice: action.choice } : draft;
  },
  options(_draft, _model, engine) {
    return optionsFor(engine);
  },
  build(draft, _model, engine) {
    if (!offered(engine, draft.choice)) return null;
    switch (draft.choice) {
      case "peek":
        return { type: "TEST_PIECES_DECIDE", peek: true };
      case "decline":
        return { type: "TEST_PIECES_DECIDE", peek: false };
      case "bury":
        return { type: "TEST_PIECES_BURY", bury: true };
      case "keep":
        return { type: "TEST_PIECES_BURY", bury: false };
      default:
        return null;
    }
  },
  fromCommand(command) {
    if (command.type === "TEST_PIECES_DECIDE") return { choice: command.peek ? "peek" : "decline" };
    if (command.type === "TEST_PIECES_BURY") return { choice: command.bury ? "bury" : "keep" };
    return null;
  },
  summary(draft, _model, engine) {
    const options = optionsFor(engine);
    const tech = (t: Parameters<typeof woodText>[1]) => techName(B5_TECHS.testPieces, t.locale);
    switch (draft.choice) {
      case "peek":
        return msg("firing.tp.peek", { wood: (t) => woodText(options.woodCost, t) });
      case "decline":
        return msg("firing.tp.sumDecline", { tech });
      case "bury":
        return msg("firing.tp.sumBury");
      case "keep":
        return msg("firing.tp.sumKeep");
      default:
        return msg("firing.tp.pick");
    }
  },
};
