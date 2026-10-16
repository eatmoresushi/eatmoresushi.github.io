/**
 * Composition of B5's Canal Barge form into the work window (UI_V1.6.1_ARCHITECTURE §4.3 rule 3).
 * Owner: B4. The contract itself is B6's frozen `decision/composition.tsx` (change requests
 * CR B4-2, CR B5-2); this file re-exports it for the work window's components.
 */
export { CanalBargeFormProvider, useComposedCanalBarge } from "../composition.tsx";
export type { ComposedCanalBarge } from "../composition.tsx";
