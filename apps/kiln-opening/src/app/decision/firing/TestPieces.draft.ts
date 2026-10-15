/**
 * The draft model of Test Pieces (UI_V1.6.1_ARCHITECTURE §3.5). Owner: B5 (firing, Order, Cleanup and Results decisions).
 *
 * Phase A stub created by A2 (§4.3 rule 1): `stubDraft()` builds nothing and its `fromCommand`
 * returns null, so the expressibility helper reports this window as `todo` until its owner lands
 * the real model (`initial`, `reduce`, `options`, `build`, `fromCommand`, `summary`).
 */
import { stubDraft } from "../../state/draftStore.ts";
import type { StubDraft } from "../../state/draftStore.ts";

export type TestPiecesDraft = StubDraft;

export const testPiecesDraft = stubDraft();
