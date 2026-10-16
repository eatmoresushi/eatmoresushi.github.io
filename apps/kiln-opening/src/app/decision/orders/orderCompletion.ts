/**
 * The shared model of completing one held Order (UI_V1.6.1_ARCHITECTURE §3.4, §3.5; wireframe
 * `decOrders`). Owner: B5. Used by the Order Phase (`orderDraft`, `COMPLETE_ORDER`) and by
 * Canal Barge (`canalBargeDraft`, `USE_CANAL_BARGE`), which complete an Order for every effect
 * (R6).
 *
 * The draft is: an Order, one ceramic group, the Crackle declaration mode, and the optional
 * Ru/Guan and Tribute Ware decline flags (R4). Nothing here re-implements an Order rule:
 * - which held Orders are completable: `completableOrders` / `canalBargeOptions`;
 * - the ceramic groups: `orderMatchOptions` (the validator's matcher);
 * - Crackle verdicts: `crackleDeclarationChecks`, with an explicit "auto" mode in which the
 *   command omits `crackleDeclarations` and the engine searches (L469, L484, §9.4);
 * - the selection's verdict and the triggered optional abilities: `orderSelectionCheck`.
 */
import { crackleDeclarationChecks, orderMatchOptions } from "../../../game/index.ts";
import type {
  AuthoritativeCommand,
  CeramicId,
  CrackleDeclaration,
  CrackleDeclarationChecks,
  Decoration,
  OrderId,
  OrderMatchOption,
  OrderSelectionCheck,
} from "../../../game/index.ts";
import type { EngineView } from "../../state/model.ts";
import { sameMembers } from "../firing/firingSupport.ts";

export type CompletionCommandType = "COMPLETE_ORDER" | "USE_CANAL_BARGE";

export interface CompletionDraft {
  readonly orderId: OrderId | null;
  /** The chosen group, in the matcher's order; null until chosen. */
  readonly ceramicIds: readonly CeramicId[] | null;
  /** "auto": the command omits declarations and the engine searches; else used exactly as given. */
  readonly declarations: "auto" | readonly CrackleDeclaration[];
  readonly declineKilnAbility: boolean;
  readonly declineTributeWare: boolean;
}

export type CompletionAction =
  | { readonly type: "order"; readonly orderId: OrderId }
  | { readonly type: "group"; readonly key: string }
  | { readonly type: "declarationMode"; readonly mode: "auto" | "explicit" }
  | { readonly type: "declare"; readonly ceramicId: CeramicId; readonly decoration: Decoration | null }
  | { readonly type: "decline"; readonly ability: "kiln" | "tributeWare"; readonly decline: boolean };

export interface CompletionGroup {
  /** The group's radio value: its ceramic IDs joined with "+". */
  key: string;
  ceramicIds: CeramicId[];
}

export interface CompletionOptions {
  /** Every held Order, in hand order, with whether it can be completed now. */
  orders: { orderId: OrderId; completable: boolean }[];
  /** The chosen Order's ceramic groups (empty before an Order is chosen). */
  groups: CompletionGroup[];
  /** Crackle verdicts for the chosen group, when it holds a Crackle ceramic. */
  crackle: CrackleDeclarationChecks | null;
  /** The engine's verdict on the current selection (with the explicit declarations, or auto). */
  check: OrderSelectionCheck | null;
  /** The match the selection would record (its rewards and triggered optional abilities). */
  match: OrderMatchOption | null;
}

export const EMPTY_COMPLETION: CompletionDraft = Object.freeze({
  orderId: null,
  ceramicIds: null,
  declarations: "auto",
  declineKilnAbility: false,
  declineTributeWare: false,
});

/** The radio value of a ceramic group. */
export function groupKey(ceramicIds: readonly CeramicId[]): string {
  return ceramicIds.join("+");
}

/** Which held Orders a form may complete now (`completableOrders` or `canalBargeOptions`). */
export type CompletableSource = (engine: EngineView) => readonly OrderMatchOption[];

function heldOrders(engine: EngineView): readonly OrderId[] {
  return engine.view.own?.orderHand ?? [];
}

export function completionOptions(draft: CompletionDraft, engine: EngineView, completable: CompletableSource): CompletionOptions {
  const ready = new Set(completable(engine).map((option) => option.orderId));
  const orders = heldOrders(engine).map((orderId) => ({ orderId, completable: ready.has(orderId) }));
  const orderId = draft.orderId !== null && ready.has(draft.orderId) ? draft.orderId : null;
  if (orderId === null) return { orders, groups: [], crackle: null, check: null, match: null };
  const groups = orderMatchOptions(engine.view, orderId).map((match) => ({ key: groupKey(match.ceramicIds), ceramicIds: match.ceramicIds }));
  const ceramicIds = draft.ceramicIds !== null && groups.some((group) => sameMembers(group.ceramicIds, draft.ceramicIds!)) ? draft.ceramicIds : null;
  if (ceramicIds === null) return { orders, groups, crackle: null, check: null, match: null };
  const explicit = draft.declarations === "auto" ? [] : draft.declarations;
  const checks = crackleDeclarationChecks(engine.view, orderId, ceramicIds, explicit);
  const crackle = checks.ceramics.length === 0 ? null : checks;
  const check = draft.declarations === "auto" || crackle === null ? checks.auto : checks.declared;
  return { orders, groups, crackle, check, match: check.ok ? check.match : null };
}

/** Drops whatever the options no longer offer (§3.5 `revalidate`); idempotent. */
export function settleCompletion(draft: CompletionDraft, engine: EngineView, completable: CompletableSource): CompletionDraft {
  const options = completionOptions(draft, engine, completable);
  if (draft.orderId === null || !options.orders.some((order) => order.orderId === draft.orderId && order.completable)) {
    return draft.orderId === null && draft.ceramicIds === null && draft.declarations === "auto" && !draft.declineKilnAbility && !draft.declineTributeWare ? draft : EMPTY_COMPLETION;
  }
  const ceramicIds = draft.ceramicIds !== null && options.groups.some((group) => sameMembers(group.ceramicIds, draft.ceramicIds!)) ? draft.ceramicIds : null;
  let declarations = draft.declarations;
  if (ceramicIds === null || options.crackle === null) declarations = "auto";
  else if (declarations !== "auto") {
    const offered = new Map(options.crackle.ceramics.map((entry) => [entry.ceramicId, entry.options.map((option) => option.decoration)] as const));
    const seen = new Set<CeramicId>();
    const kept = declarations.filter((entry) => {
      const ok = (offered.get(entry.ceramicId) ?? []).includes(entry.decoration) && !seen.has(entry.ceramicId);
      seen.add(entry.ceramicId);
      return ok;
    });
    declarations = kept.length === declarations.length ? declarations : kept;
  }
  const settled = { ...draft, ceramicIds, declarations };
  const triggers = ceramicIds === null ? null : completionOptions(settled, engine, completable).match?.triggers ?? null;
  const declineKilnAbility = draft.declineKilnAbility && triggers !== null && (triggers.ru || triggers.guan);
  const declineTributeWare = draft.declineTributeWare && triggers !== null && triggers.tributeWare;
  if (ceramicIds === draft.ceramicIds && declarations === draft.declarations && declineKilnAbility === draft.declineKilnAbility && declineTributeWare === draft.declineTributeWare) {
    return draft;
  }
  return { orderId: draft.orderId, ceramicIds, declarations, declineKilnAbility, declineTributeWare };
}

export function reduceCompletion(draft: CompletionDraft, action: CompletionAction, engine: EngineView, completable: CompletableSource): CompletionDraft {
  switch (action.type) {
    case "order": {
      const options = completionOptions({ ...EMPTY_COMPLETION, orderId: action.orderId }, engine, completable);
      if (!options.orders.some((order) => order.orderId === action.orderId && order.completable)) return draft;
      if (draft.orderId === action.orderId) return draft;
      // §3.5: the only group is the choice.
      const only = options.groups.length === 1 ? options.groups[0]!.ceramicIds : null;
      return { ...EMPTY_COMPLETION, orderId: action.orderId, ceramicIds: only };
    }
    case "group": {
      const options = completionOptions(draft, engine, completable);
      const group = options.groups.find((candidate) => candidate.key === action.key);
      if (group === undefined) return draft;
      return settleCompletion({ ...draft, ceramicIds: group.ceramicIds, declarations: "auto" }, engine, completable);
    }
    case "declarationMode": {
      if (draft.ceramicIds === null) return draft;
      const next = action.mode === "auto" ? "auto" : draft.declarations === "auto" ? [] : draft.declarations;
      return settleCompletion({ ...draft, declarations: next }, engine, completable);
    }
    case "declare": {
      if (draft.ceramicIds === null) return draft;
      const current = draft.declarations === "auto" ? [] : draft.declarations;
      const others = current.filter((entry) => entry.ceramicId !== action.ceramicId);
      const position = current.findIndex((entry) => entry.ceramicId === action.ceramicId);
      let next: CrackleDeclaration[];
      if (action.decoration === null) next = others;
      else if (position < 0) next = [...others, { ceramicId: action.ceramicId, decoration: action.decoration }];
      else next = current.map((entry) => (entry.ceramicId === action.ceramicId ? { ceramicId: action.ceramicId, decoration: action.decoration! } : entry));
      return settleCompletion({ ...draft, declarations: next }, engine, completable);
    }
    case "decline":
      return settleCompletion(
        action.ability === "kiln" ? { ...draft, declineKilnAbility: action.decline } : { ...draft, declineTributeWare: action.decline },
        engine,
        completable,
      );
  }
}

/** The command, or null while no Order and group are chosen. */
export function buildCompletion(type: CompletionCommandType, draft: CompletionDraft, engine: EngineView, completable: CompletableSource): AuthoritativeCommand | null {
  const settled = settleCompletion(draft, engine, completable);
  if (settled.orderId === null || settled.ceramicIds === null) return null;
  return {
    type,
    orderId: settled.orderId,
    ceramicIds: [...settled.ceramicIds],
    ...(settled.declarations === "auto" ? {} : { crackleDeclarations: settled.declarations.map((entry) => ({ ...entry })) }),
    ...(settled.declineKilnAbility ? { declineKilnAbility: true } : {}),
    ...(settled.declineTributeWare ? { declineTributeWare: true } : {}),
  };
}

/** The draft that builds this command (§9.4), or null for another command type. */
export function completionFromCommand(type: CompletionCommandType, command: AuthoritativeCommand): CompletionDraft | null {
  if (command.type !== "COMPLETE_ORDER" && command.type !== "USE_CANAL_BARGE") return null;
  if (command.type !== type) return null;
  return {
    orderId: command.orderId,
    ceramicIds: [...command.ceramicIds],
    declarations: command.crackleDeclarations === undefined ? "auto" : command.crackleDeclarations.map((entry) => ({ ...entry })),
    declineKilnAbility: command.declineKilnAbility === true,
    declineTributeWare: command.declineTributeWare === true,
  };
}

/** The decoration a draft declares for one Crackle ceramic (null: undeclared, its printed one). */
export function declaredDecoration(draft: CompletionDraft, ceramicId: CeramicId): Decoration | null {
  if (draft.declarations === "auto") return null;
  return draft.declarations.find((entry) => entry.ceramicId === ceramicId)?.decoration ?? null;
}
