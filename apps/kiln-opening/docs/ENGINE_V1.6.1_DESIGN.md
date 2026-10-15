# Kiln Opening V1.6.1: rules-engine design and build plan

Branch `kiln-opening-next-version`. This document and [`src/game/types.ts`](../src/game/types.ts) together form the contract that implementation agents build against in parallel.

- **Rules authority:** [V1.6.1 Player Rulebook](./KILN_OPENING_v1.6.1_EN_SOURCE.md) is the only rules source. [The audit](./RULEBOOK_AUDIT_V1.6.1.md) records owner rulings R1–R13 and B1–B3, editorial corrections, interpretations (INT) and digital decisions (DIG).
- **Notation:** `L123` is a line of the V1.6.1 source. `R4`, `B2` are rulings. `INT:` and `DIG:` are audit entries.
- **Versions:** rules `1.6.1`, state schema `6`, `RULES_BEHAVIOUR_REVISION` `29`.

V1.6.1 replaces the V1.4 engine wholesale. Nothing here changes a rule or a balance value. Where the text cannot decide a case, §11 lists it as an open question, together with the default the engine adopts until the owner answers.

**Revision 2 (2026-10-14)** addresses the rules review and the consumer review of revision 1. §12 records the disposition of every finding.

---

## 1. Principles

1. **One source per fact.**
   - Rules come from the rulebook and the audit.
   - Content values come from `data/*.json` through `content.ts`.
   - State shapes come from `types.ts`.
   - Each state fact is stored once. Everything else is derived with a selector (see the `PlayerState` JSDoc).
2. **The engine is pure.** It has no I/O and does not use `Date` or `Math.random`. All randomness goes through `RandomSource`.
3. **Validate on the view, resolve on the state.**
   - Every action validator receives an `ActorView`: the public projection plus the actor's own private data. It never receives `GameState`.
   - Legality therefore can never depend on hidden information.
   - The UI, the computer player and the server all run the same validators.
   - Resolvers mutate a cloned `GameState` and may draw cards.
4. **Make a command atomic when everything it decides is known at decision time.** Split it into a multi-step window only where hidden information is revealed mid-action, or where other players act in between (§3.5).
5. **Keep secrets structurally separate** (§4):
   - `GameState.hidden` holds the server-only state;
   - `PrivateFiringState` holds unrevealed Contributions;
   - each event's `secret` field holds that event's private payload.

   The public projection removes all three by construction, not field by field.
6. **Every window has a legal exit** (§3.6). An empty window is never opened. Automatic steps resolve inside the command that reaches them.
7. **Timing windows mirror Appendix D** one-to-one (§3.3).
8. **`types.ts` is under change control.**
   - The engine lead (package P0) owns it.
   - Any other package that needs a change asks the lead. It does not edit the file locally.
   - Adding an optional field or a new error code is cheap. Renaming is not.

---

## 2. Module layout and APIs (a)

### 2.1 Files and owners

Each package owns its files. **No two packages edit the same file in the same phase** (§9.2 assigns every file, test files included). P0 first creates **stub modules** for every file below, with the exact exported signatures from §2.3–2.4. Every package can then compile and import from day one.

- Stub bodies throw `new NotImplementedError("<module>.<export>")`, a subclass of `InvariantError`.
- **Exception:** `invariants.ts` ships `assertInvariants` as a **no-op** until P7 fills it in, so the dispatcher's invariant check (§2.5 step 7) never blocks Phase 2 tests.
- Module-to-module hand-overs that cross packages go through `ctx.flow` (§2.2), so a test can halt there instead of reaching a stub (§8.1).

```
src/game/
  types.ts                  P0  contract (frozen; change control)
  index.ts                  P0  public barrel
  engine.ts                 P0  createGame / validateAction / applyAction / submitContribution; handler table; flow wiring
  actionGuard.ts            P0  parseCommand(unknown) → AuthoritativeCommand | GameRuleError (untrusted JSON shape check)
  state.ts                  P0  shared state helpers (§2.3)
  rng.ts                    P0  SeededRandom, shuffle, rollDie
  errors.ts                 P0  ruleError, fail, InvariantError, invariant
  view.ts                   P0  projection and views: the hidden-information boundary (§4)
  placement.ts              P0  worker availability, capacity, personal spaces, worker effect
  techs.ts                  P0  owned-Tech helpers, hand limit, acquisition limits, unlocking
  kilns.ts                  P0  Kiln Tradition helpers
  content.ts                P1  JSON loader, validation, derived constants
  rulesFingerprint.ts       P1  content digest + RULES_BEHAVIOUR_REVISION = 29
  ruleErrorText.ts          P1  RULE_ERROR_TEXT: EN/ZH template and documented `details` keys per GameRuleErrorCode
  setup.ts                  P2  initial state, SELECT_KILN
  round.ts                  P2  Start of Round, Setter's Mark window, Cleanup
  market.ts                 P2  Main Order deck/display/discard; Tech decks/displays
  kilnLoading.ts            P3  R5 destinations, loading, Reworking Table, Setter's Mark return, Kiln Furniture, Inverted Firing
  work/materialsYard.ts     P3  incl. Senior Apprentice (MY), Prepared Clay
  work/formDecorate.ts      P3  incl. Shifu discount, Large Throwing Wheel, Decorator's Kit, Ding
  work/glazeLoad.ts         P3  incl. Heat-marker placement, Kiln Tending
  work/centralSimple.ts     P3  Canal Wharf, Magistrate's Hall
  work/turn.ts              P4  Work Phase, turns, before/after window, END_TURN, deferred refill
  work/commissionMarket.ts  P4  incl. Senior Apprentice (CM), Shifu top-3
  work/guildHall.ts         P4  incl. Shifu inspection, Colour Samples when acquired
  work/windowAbilities.ts   P4  Canal Barge, Imperial Priority
  firing/heat.ts            P5  pure Base/Global/Actual Heat and Quality math, previews
  firing/fireDeck.ts        P5  draw, peek, bury, discard, reshuffle-when-empty
  firing/contributions.ts   P5  open the Firing Phase, Contribution window, submit and reveal
  firing/pipeline.ts        P5  Test Pieces, Heat markers, Fire reveal, Actual Heat, Jun, Quality
  firing/afterQuality.ts    P5  Saggars, Second Firing (+R7 Jun), Ge, salvage, finish
  orders/matching.ts        P6  pure Order matcher incl. Crackle wildcards
  orders/completion.ts      P6  complete one Order (Order Phase and Canal Barge), Ru/Guan/Tribute Ware
  orders/phase.ts           P6  Order Phase single pass
  recognition.ts            P6  Crowns, Recognition steps, milestones, overflow VP
  scoring.ts                P6  final scoring, tie-breakers, score preview
  selectors.ts              P7  UI view models and quotes (re-exports P3/P5 option functions, §5.4)
  legalActions.ts           P7  enumerator, sampler, legalCommands
  invariants.ts             P7  assertInvariants (tests, dev, fuzz); P0's stub is a no-op
```

### 2.2 Import rules

Imports may only point down the layers. A module never imports from its own layer, except where the "may import" column of §2.4 names a module.

| Layer | Modules |
| --- | --- |
| 0 | `types.ts` (imports nothing; others use `import type`) |
| 1 | `content.ts`, `rng.ts`, `errors.ts` |
| 2 | `state.ts`, `view.ts`, `placement.ts`, `techs.ts`, `kilns.ts`, `firing/heat.ts`, `orders/matching.ts`, `actionGuard.ts` |
| 3 | `market.ts`, `recognition.ts`, `kilnLoading.ts`, `firing/fireDeck.ts`, `orders/completion.ts` |
| 4 | `setup.ts`, `round.ts`, `work/*`, `firing/contributions.ts`, `firing/pipeline.ts`, `firing/afterQuality.ts`, `orders/phase.ts`, `scoring.ts` |
| 5 | `selectors.ts`, `legalActions.ts`, `invariants.ts` |
| 6 | `engine.ts`, `index.ts` |

**Hand-over never uses an import.** `ctx.flow` (`FlowController` in `types.ts`) carries the two hand-overs that cross packages:

- A module that closes a phase calls `ctx.flow.continueAfter(milestone, draft, ctx)`. `engine.ts` wires each milestone to the next phase's opener (§2.5). This keeps the round cycle (round → work → firing → orders → round) free of import cycles.
- A `work/*` resolver whose worker action has fully resolved calls `ctx.flow.workerActionDone(draft, playerId, ctx)`. `engine.ts` wires it to `work/turn.completeWorkerAction`. P3's location modules therefore never import P4's `work/turn.ts`.

Tests may replace the controller through `EngineOptions.flow` (§2.5, §8.1).

### 2.3 Shared helper API (P0)

Every package uses these helpers instead of writing its own. All mutate only the `draft` they are given. Validators receive views and must not mutate them.

```ts
// errors.ts
export function ruleError(code: GameRuleErrorCode, message: string, details?: GameRuleError["details"]): GameRuleError;
export function fail(error: GameRuleError): { ok: false; error: GameRuleError };
export class InvariantError extends Error {}               // engine bug, never a rule outcome
export class NotImplementedError extends InvariantError {}   // thrown only by P0's stubs
export function invariant(condition: unknown, message: string): asserts condition;
export function firstError(...checks: Array<() => GameRuleError | null>): GameRuleError | null;

// rng.ts
export class SeededRandom implements RandomSource { constructor(seed: number) }   // unchanged mulberry32
export function shuffle<T>(items: readonly T[], rng: RandomSource): T[];         // Fisher–Yates, unchanged
export function rollDie<T>(faces: readonly T[], rng: RandomSource): T;           // faces[rng.nextInt(faces.length)]

// state.ts
export function cloneState(state: GameState): GameState;                         // structuredClone; JSON-safe
export function player(game: PublicCore, playerId: PlayerId): PlayerState;       // throws InvariantError
export function turnOrder(game: PublicCore): PlayerId[];                         // First Player, then clockwise
export function nextClockwise(game: PublicCore, playerId: PlayerId): PlayerId;
export function decisionPrompt(game: PublicCore): DecisionPrompt;                // who must act now, and how (§3.4)
export function phaseAs<T extends GamePhaseType>(game: PublicCore, type: T): Extract<GamePhase, { type: T }>;
export function workStep<K extends WorkTurnStep["kind"]>(game: PublicCore, kind: K): Extract<WorkTurnStep, { kind: K }> | null;
export function emit(ctx: ResolveContext, event: GameEvent): void;
export function canAfford(resources: ResourceState, cost: Partial<ResourceState>): boolean;
export function gain(draft: GameState, playerId: PlayerId, delta: Partial<ResourceState>,
                     reason: ResourceChangeReason, ctx: ResolveContext): void;   // emits RESOURCES_CHANGED
export function spend(draft: GameState, playerId: PlayerId, cost: Partial<ResourceState>,
                      reason: ResourceChangeReason, ctx: ResolveContext): void;  // InvariantError if any total < 0
export function ceramic(game: PublicCore, id: CeramicId): CeramicState;
export function ceramicSequence(id: CeramicId): number;                          // "c12" → 12
export function ceramicsInOrder(game: PublicCore): CeramicState[];               // by ceramicSequence
export function ceramicsOf<S extends CeramicStage>(game: PublicCore, playerId: PlayerId, stage: S):
  Array<Extract<CeramicState, { stage: S }>>;                                    // sequence order
export function formCeramic(draft: GameState, ownerId: PlayerId, shape: Shape, decoration: Decoration,
                            formedBy: FormedBy, ctx: ResolveContext): ShapedCeramic; // Vessel card or proxy; CERAMIC_FORMED
export function returnVesselCard(draft: GameState, vesselInstanceId: VesselInstanceId): void; // proxies vanish
export function loadedCeramics(game: PublicCore): LoadedCeramic[];
export function heatMarkerOf(game: PublicCore, playerId: PlayerId, source: "own" | "kiln_master"): LoadedCeramic | null;
export function imperialKilnCeramic(game: PublicCore, playerId: PlayerId): LoadedCeramic | null;

// view.ts (§4.3)
export function publicCounts(state: GameState): PublicCounts;
export function projectPublicState(state: GameState): PublicGameState;
export function projectPrivateView(state: GameState, playerId: PlayerId, privateFiring: PrivateFiringState | null): PrivatePlayerView;
export function viewOf(state: GameState, viewerId: PlayerId | null, privateFiring?: PrivateFiringState | null): PlayerView;
export function actorViewOf(state: GameState, actorId: PlayerId, privateFiring?: PrivateFiringState | null): ActorView;
export function projectEvent(event: GameEvent): PublicGameEvent;
export function eventForViewer(event: GameEvent, viewerId: PlayerId | null): PublicGameEvent | GameEvent;

// placement.ts
export function availableWorkers(game: PublicCore, playerId: PlayerId): WorkerState[];
export function workersAt(game: PublicCore, locationId: LocationId): Array<{ playerId: PlayerId; worker: WorkerState }>;
export function centralCapacity(game: PublicCore, locationId: CentralLocationId): number | null;
export function nextPersonalSpace(game: PublicCore, playerId: PlayerId, locationId: PersonalLocationId): PersonalSpaceIndex | null;
export function validatePlacement(view: ActorView, workerId: WorkerId, locationId: LocationId,
                                  seniorApprentice: boolean): GameRuleError | null;
//   phase work_turn, step before_action, active player; worker available; absolute capacity (L139);
//   personal space unlocked and unused this round (L143); Senior Apprentice only for an Apprentice
//   at the Materials Yard or Commission Market with T18 ready (L619, R12).
//   The location's "at least 1 instance" check (L141) is the location module's job.
export function workerEffectFor(view: ActorView, workerId: WorkerId, seniorApprentice: boolean): WorkerEffect;
export function placeWorker(draft: GameState, playerId: PlayerId, workerId: WorkerId, locationId: LocationId,
                            seniorApprentice: boolean, ctx: ResolveContext): WorkerPlacement; // WORKER_PLACED; marks T18 used

// techs.ts
export function ownsTech(p: PlayerState, techId: TechId): boolean;
export function techReady(p: PlayerState, techId: TechId): boolean;            // owned and not (oncePerRound and used)
export function markTechUsed(draft: GameState, playerId: PlayerId, techId: TechId, ctx: ResolveContext): void; // TECH_USED
export function readyAllAbilities(draft: GameState): void;                       // Techs and Kiln Traditions (L131)
export function handLimit(p: PlayerState): number;                              // 4, or T10 params.handLimit (5)
export function acquisitionError(p: PlayerState, techId: TechId): GameRuleError | null; // TECH_LIMIT / TECH_DISCIPLINE_OWNED
export function techPrice(techId: TechId, effect: WorkerEffect): number;        // printed cost, Shifu −1, minimum 0 (L207)
export function grantTech(draft: GameState, playerId: PlayerId, techId: TechId, ctx: ResolveContext): void;
//   adds OwnedTechState and unlocks space 1 of the matching personal location (L211); PERSONAL_SPACE_UNLOCKED.
//   Does not resolve when-acquired effects (guildHall.ts does).

// kilns.ts
export function hasKiln(p: PlayerState, kilnId: KilnId): boolean;
export function kilnAbilityReady(p: PlayerState, kilnId: KilnId): boolean;
export function markKilnAbilityUsed(draft: GameState, playerId: PlayerId, ctx: ResolveContext): void; // KILN_ABILITY_USED
export function availableKilns(game: PublicCore): KilnId[];                     // all five minus chosen (R1)
```

**Conventions for every package:**

- **Resources.**
  - Pay through `spend` and gain through `gain`, always after validation.
  - A payment is atomic: validate the whole cost first (§3.5).
- **Errors.**
  - Rule failures are typed `GameRuleError`s returned from `validate`.
  - `resolve` never returns a rule error. Anything impossible after validation is an `InvariantError`.
  - Error messages must not reveal hidden information. They cannot, because validators only see views.
- **Events.** Emit events in resolution order. The UI animates them in that order (§4.4).
- **Iteration order.** Postgres `jsonb` stores object keys sorted by length, then bytes, so a state loaded from Supabase iterates `sharedKiln.spaces` as `low_1, low_2, high_1, …` and `techDisplay` as `firing, workshop, glazing_loading`. The in-memory store keeps insertion order. Therefore:
  - never derive rule order, event order, enumeration order or RNG consumption from `Object.keys`/`values`/`entries` of a state `Record`;
  - iterate `KILN_SPACE_IDS`, `DISCIPLINES`, `CENTRAL_LOCATION_IDS`, `playerOrder`/`turnOrder`, or ceramics by `ceramicSequence`;
  - lookups by key are fine.
  - The determinism and fuzz tests enforce this with a key-sorting round trip (§7).
- **JSON safety.** State never holds `undefined` (omit optional keys), `NaN`, `Infinity` or class instances. `assertInvariants` rejects them (§8.3).
- **IDs.**
  - Ceramics: `c${n}` from `nextCeramicSequence`.
  - Proxies: `${shape}-proxy-${n}` from `nextProxySequence`.
  - Workers: `${playerId}:shifu` and `${playerId}:apprentice:${1..3}`.
  - Contribution window: `${gameId}:r${round}:contributions`.

### 2.4 Module contracts

Every location and window module exports a `Pick<ActionHandlerTable, …>` of handlers (`ActionHandler` in `types.ts`). `engine.ts` spreads them into one `ActionHandlerTable`, so the compiler rejects a missing or duplicated action type.

| Module | Exports (beyond handlers) | Actions / phases owned | May import |
| --- | --- | --- | --- |
| `content.ts` (P1) | `GAME_CONFIG`, `FIRING`, `IMPERIAL_TRACK`, `LOCATIONS: {[K in LocationId]: LocationDefinition<K>}`, `KILNS`, `TECHS: {[K in TechId]: TechDefinition<K>}`, `ORDERS`, `STARTING_ORDER_IDS`, `MAIN_ORDER_IDS`, `KILN_IDS`, `TECH_IDS`, `LOCATION_IDS`, `CENTRAL_LOCATION_IDS`, `PERSONAL_LOCATION_IDS`, `SHAPES`, `GLAZES`, `DECORATIONS`, `DISCIPLINES`, `KILN_SPACE_IDS`, `QUALITY_RANK`; `preferredHeat(g)`, `shapeClay(s)`, `decorationCost(d)`, `zoneOf(space)`, `zoneModifier(space)`, `activeKilnSpaces(n)`, `locationCapacity(id, n)`, `qualityForDifference(diff)`, `contributionCard(id)`, `techsOfDiscipline(d)` | none | `types` |
| `setup.ts` (P2) | `createInitialState(input, rng): CreateGameResult` | `SELECT_KILN`; `setup_kiln_selection`; emits `setup_done` | L0–3 |
| `round.ts` (P2) | `startRound(draft, ctx)`, `openCleanup(draft, ctx)` | `PLACE_SETTERS_MARK`, `DISCARD_TO_HAND_LIMIT`; `round_start_setters_mark`, `cleanup_hand_limit`; emits `round_start_done`, `cleanup_done`, `game_over` | L0–3 |
| `market.ts` (P2) | `drawMainOrder(draft, ctx): OrderId \| null` (reshuffles the discard only when the deck is empty, L511); `takeTopMainOrders(draft, max, ctx): OrderId[]` (looks: reshuffle only if the deck is empty when the look starts, never to complete it, B1); `discardMainOrders(draft, ids)` (face down); `takeFaceUpOrder(draft, playerId, slotIndex): OrderId` (leaves `null`, sets `refillPendingFor`); `refillMainDisplay(draft, cause, ctx)` (compact left, then fill empty positions from the deck, L190, B1); `rotateMainDisplay(draft, ctx)` (L127–129); `addToHand`, `removeFromHand`; `reservable(game: PublicGameState): { faceUpSlots: number[]; blind: boolean; look: boolean }`; `drawTechsForInspection(draft, d, n)`; `returnTechsToBottom(draft, d, ids)`; `takeFaceUpTech(draft, techId)`; `refillTechDisplay(draft, d, ctx)` | none | L0–2 |
| `kilnLoading.ts` (P3) | `sharedSpaceOpenFor(game, pid, space)` (R5a); `invertedFiringTarget(game, pid, space)` (R5c/R8); `imperialKilnEmpty(game, pid)`; `hasAnyLegalLoad(game, pid)` (R5, current Shapes only: §11 Q3); `validateLoads(view, loads, maxLoads, loadedBy)` (sequential simulation, R8; per load: ceramic → `reworkShape` → destination incl. the Inverted Firing Shape test on the reworked Shape → Kiln Furniture, see the `LoadSpec` JSDoc); `loadCeramic(draft, pid, spec, loadedBy, ctx): LoadedCeramic`; `reworkShape(draft, ceramicId, shape, ctx)`; `loadDestinationOptions(view, pid, ceramicId, earlierLoads, reworkShape?)` | none | L0–2 |
| `work/materialsYard.ts` (P3) | `quoteMaterialsYard(view, action): CostQuote` (order: split → Shifu bonus → Prepared Clay, each validated against the running totals, §3.5) | `PLACE_MATERIALS_YARD` | L0–3 |
| `work/formDecorate.ts` (P3) | `quoteFormDecorate(view, action): CostQuote`; `canFormAny(game, pid): boolean` (L171, R4: tries every single Shape × Decoration with every ready Workshop discount — Large Throwing Wheel on a Vase/Censer, Decorator's Kit on a non-Plain; forming 2 is never cheaper than forming 1, so singles suffice) | `PLACE_FORM_DECORATE` | L0–3 |
| `work/glazeLoad.ts` (P3) | none | `PLACE_GLAZE_LOAD` | L0–3 |
| `work/centralSimple.ts` (P3) | none | `PLACE_CANAL_WHARF`, `PLACE_MAGISTRATES_HALL` | L0–3 |
| `work/turn.ts` (P4) | `openWorkPhase(draft, ctx)`; `completeWorkerAction(draft, pid, ctx)` (wired as `flow.workerActionDone`); `afterActionWindowOpen(game, pid)`; `imperialPriorityUsable(game, pid)`; `afterWindowAbilityUsed(draft, pid, ctx)`; `endTurn(draft, pid, automatic, ctx)` | `END_TURN`; `work_turn`; emits `work_phase_done` | L0–3 |
| `work/commissionMarket.ts` (P4) | none | `PLACE_COMMISSION_MARKET`, `COMMISSION_RESERVE`, `COMMISSION_CHOOSE_LOOKED`, `COMMISSION_GAIN`, `COMMISSION_STOP` | L0–3 |
| `work/guildHall.ts` (P4) | none | `PLACE_GUILD_HALL`, `GUILD_TAKE`, `COLOUR_SAMPLES_CHOOSE` | L0–3 |
| `work/windowAbilities.ts` (P4) | none | `USE_CANAL_BARGE`, `USE_IMPERIAL_PRIORITY` | L0–3, `work/turn` |
| `firing/heat.ts` (P5) | `baseHeat(die, sum)`; `contributionHeat(sub)`; `contributionWood(sub)`; `positionFor(game, ceramic)`; `heatCalculation(input): HeatCalculation`; `heatPreviews(view): HeatPreview[]` | none | L0–1 |
| `firing/fireDeck.ts` (P5) | `drawFire(draft, ctx)`, `peekFire(draft, ctx)` (both reshuffle only when empty, L512), `buryTopFire(draft)`, `discardFire(draft, m)` | none | L0–2 |
| `firing/contributions.ts` (P5) | `openFiringPhase(draft, ctx)`; `createPrivateFiringState(state)`; `validateContribution(view, privateState, cmd)`; `applyContribution(draft, privateDraft, actorId, cmd, ctx)`; `legalContributions(view): SubmitContributionCommand[]` (TEND first, then BANK, STOKE, then the Fuel Ledger variants; always non-empty for an eligible viewer) | `firing_contributions` | L0–3, `firing/pipeline` |
| `firing/pipeline.ts` (P5) | `openAfterBaseHeat(draft, ctx)`; `heatMarkerStepOptions(view)`, `testPiecesOptions(view)`, `junOptions(view)` | `TEST_PIECES_DECIDE`, `TEST_PIECES_BURY`, `RESOLVE_HEAT_MARKERS`, `RESOLVE_JUN`; `firing_test_pieces`, `firing_heat_markers`, `firing_heat_adjustment`; reveals the Fire card automatically when the Heat-marker step ends (§3.3) | L0–3, `firing/afterQuality` |
| `firing/afterQuality.ts` (P5) | `openAfterQuality(draft, ctx)`; `resolveSecondFiringJun(draft, actorId, adjustment, ctx)`; `finishFiring(draft, ctx)`; `afterQualityOptions(view)`, `salvageOptions(view)` | `USE_PROTECTIVE_SAGGARS`, `USE_SECOND_FIRING`, `USE_GE_CRACKLE`, `END_AFTER_QUALITY`, `SALVAGE_FLAWED`; `firing_after_quality`, `firing_second_firing_jun`, `firing_salvage`; emits `firing_done`. Second Firing's extra card sits in `firing.pendingExtraFire` only while the R7 Jun window is open, then goes to `fireDiscard` | L0–3 |
| `orders/matching.ts` (P6) | `matchOrder(order, ceramics, declared?): OrderMatch \| null` (`declared` absent → deterministic search; present → used exactly, never searched; see `OrderCompletionSpec.crackleDeclarations`); `findOrderMatches(order, pool, limit?)`; `ruTriggers(ceramics)` | none | L0–1 |
| `orders/completion.ts` (P6) | `validateOrderCompletion(view, spec)`; `resolveOrderCompletion(draft, pid, spec, via, ctx): CompletedOrderRecord`; `completableOrderIds(game, pid, hand)` | none | L0–2, `recognition` |
| `recognition.ts` (P6) | `gainCrown(draft, pid, source, orderId, ctx)` (1 step, or +1 VP at Recognition 4); `advanceRecognitionStep(draft, pid, source, orderId, ctx)` (resolves the milestone reached); `magistratesHallOpen(p)` | none | L0–2 |
| `orders/phase.ts` (P6) | `openOrderPhase(draft, ctx)` | `COMPLETE_ORDER`, `END_ORDER_TURN`; `orders`; emits `order_phase_done` | L0–3 |
| `scoring.ts` (P6) | `computeFinalResult(game: PublicCore): FinalResult`; `scorePreview(game, pid): ScorePreview`; `finishGame(draft, ctx)` | `finished` | L0–3 |
| `selectors.ts` (P7) | §5.4. Re-exports, never reimplements, the option functions owned by P3 (`loadDestinationOptions`), P5 (`heatPreviews`, `heatMarkerStepOptions`, `testPiecesOptions`, `junOptions`, `afterQualityOptions`, `salvageOptions`, `legalContributions`) and P6 (`findOrderMatches`) | none | L0–4 (validators and quotes only) |
| `legalActions.ts` (P7) | `legalActions(view, opts): GameAction[]`; `enumerateLegalActions(view, opts): Generator<GameAction>`; `legalCommands(view, opts): AuthoritativeCommand[]` (= `legalContributions(view)` in `firing_contributions`, else `legalActions`); `sampleLegalAction(view, chooser): GameAction`; `legalActionFamilies(view)` | none | L0–4 |
| `invariants.ts` (P7) | `assertInvariants(state): void` (P0 stub: no-op) | none | L0–3 |

Within-layer exceptions (each stays inside one package):

- P0 layer 2: `state.ts` is the base of layer 2. `techs.ts`, `kilns.ts`, `view.ts`, `placement.ts` and `actionGuard.ts` may import it, and `placement.ts` may also import `techs.ts` (Senior Apprentice). No other P0 layer-2 module imports another.
- `work/windowAbilities → work/turn` (P4): after each Canal Barge or Imperial Priority use it calls `afterWindowAbilityUsed`, which rechecks the window and ends the turn when nothing is left.
- `firing/contributions → firing/pipeline → firing/afterQuality` is a one-way chain inside P5.
- Every other `work/*` module hands over through `ctx.flow.workerActionDone` (§2.2), never an import.

**Cross-package calls.** These are the only runtime calls from one package's module into another package's module (P0/P1 helpers excluded). §9.2 orders delivery so the callee lands first (milestone M2a):

| Caller (package) | Callee (package) | Used for |
| --- | --- | --- |
| `work/centralSimple` (P3) | `recognition.advanceRecognitionStep` (P6) | Magistrate's Hall |
| `work/commissionMarket` (P4) | `market` (P2) | reservations, looks, discards, `reservable` |
| `work/guildHall` (P4) | `market` (P2) | Tech inspection, return, take, refill; Colour Samples look |
| `work/turn` (P4) | `market.refillMainDisplay` (P2) | deferred refill |
| `work/windowAbilities` (P4) | `orders/completion` (P6); `kilnLoading` (P3) | Canal Barge; Imperial Priority load and rework |
| any work module → next step | `ctx.flow.workerActionDone` → `work/turn` (P4) | flow hook, not an import |
| any phase closer → next phase | `ctx.flow.continueAfter` → openers (P2, P4, P5, P6) | flow hook, not an import |

### 2.5 Dispatcher (`engine.ts`, P0)

```ts
export function createGame(input: CreateGameInput, rng: RandomSource, options?: EngineOptions): CreateGameResult; // = setup.createInitialState
export function validateAction(view: ActorView, action: GameAction): GameRuleError | null;
export function applyAction(state: GameState, actorId: PlayerId, action: GameAction, rng: RandomSource,
                            options?: EngineOptions): ApplyResult;
export function submitContribution(state: GameState, privateState: PrivateFiringState, actorId: PlayerId,
                                   command: SubmitContributionCommand, rng: RandomSource,
                                   options?: EngineOptions): SubmitContributionResult;
// actionGuard.ts
export function parseCommand(input: unknown): AuthoritativeCommand | GameRuleError;   // MALFORMED_ACTION
```

`validateAction(view, action)` is the **single** legality function. The UI, `legalActions`, the computer player and `applyAction` all call it, so nothing the client is offered can be rejected by the server for a reason the client could not see. It runs, on `view.game`:

1. `phase.type === "finished"` → `GAME_FINISHED`. `view.viewerId` not seated → `UNKNOWN_PLAYER`.
2. `handler = HANDLERS[action.type]`. If `handler.phases` does not include the current phase → `WRONG_PHASE`.
3. If `decisionPrompt(view.game).actorIds` does not include the viewer → `NOT_YOUR_DECISION`.
4. `handler.validate(view, action)`. Validation never touches the RNG.

`applyAction`:

1. `err = validateAction(actorViewOf(state, actorId), action)` (an unknown `actorId` → `UNKNOWN_PLAYER` before the view is built).
2. `draft = cloneState(state)`, then `ctx = { rng, events: [], flow: options.flow ?? FLOW }`, then `handler.resolve(draft, actorId, action, ctx)`.
   - The resolver and the openers it reaches run every automatic step until a decision is pending (§3.7).
3. `draft.revision += 1` and `draft.eventSequence += events.length`.
4. If `options.checkInvariants`, call `assertInvariants(draft)`. The engine reads no environment: `LocalTable` and the fuzz test pass `true`, and the service passes `true` when its own `KILN_ENGINE_INVARIANTS=1` is set. P0's stub is a no-op until P7 lands.

`createGame` sets `eventSequence = events.length` (its events are persisted, §4.6).

The service runs `parseCommand(unknown)` (`actionGuard.ts`) on **every** command, `SUBMIT_CONTRIBUTION` included, before it branches on the type. It rejects malformed client JSON (unknown type, wrong enum, missing `windowId`, non-boolean `fuelLedger`, …) with `MALFORMED_ACTION`, so validators may assume well-typed input.

`FLOW.continueAfter`:

| Milestone | Next opener |
| --- | --- |
| `setup_done` | `round.startRound` |
| `round_start_done` | `turn.openWorkPhase` |
| `work_phase_done` | `contributions.openFiringPhase` |
| `firing_done` | `orders/phase.openOrderPhase` |
| `order_phase_done` | `round.openCleanup` |
| `cleanup_done` | `round.startRound` |
| `game_over` | `scoring.finishGame` |
| `FLOW.workerActionDone(draft, pid, ctx)` | `turn.completeWorkerAction` |

`submitContribution` follows the same pattern:

1. Check the window id (`PRIVATE_WINDOW_MISMATCH`). This includes the case where no Contribution window is open: a late submission that arrives after the last one revealed the window gets `PRIVATE_WINDOW_MISMATCH`, not `WRONG_PHASE`. Only `UNKNOWN_PLAYER` and `GAME_FINISHED` come first.
2. Run `validateContribution`.
3. Clone the state and the private state, then run `applyContribution`.
4. When the last eligible player submits, `applyContribution` reveals, pays and continues into Base Heat and the following steps. The returned `privateState` then has `windowId: null`.

---

## 3. Phase state machine

### 3.1 Round flow

```
createGame ─► setup_kiln_selection (reverse turn order, all 5 Kilns, R1) ─► [setup_done]
   ┌─────────────────────────────────────────────────────────────────────────────────────┐
   ▼                                                                                     │
startRound: ROUND_STARTED → KILN_DIE_ROLLED → (R2–5) MAIN_DISPLAY_ROTATED + DISPLAY_REFILLED
   → ABILITIES_READIED → round_start_setters_mark? ─► [round_start_done]                 │
work_turn × 4 per player (First Player clockwise) ─► WORK_PHASE_ENDED [work_phase_done]  │
openFiringPhase: nothing loaded → FIRING_SKIPPED ────────────────────────────┐           │
   FIRING_STARTED → firing_contributions? → CONTRIBUTIONS_REVEALED            │           │
   → BASE_HEAT_DETERMINED → firing_test_pieces? → firing_heat_markers?        │           │
   → FIRE_REVEALED → ACTUAL_HEAT_CALCULATED (automatic)                       │           │
   → firing_heat_adjustment? → QUALITY_ASSIGNED×n                             │           │
   → firing_after_quality? (⇄ firing_second_firing_jun)                       │           │
   → firing_salvage? → FIRING_FINISHED ─► [firing_done] ◄─────────────────────┘           │
orders (single pass, First Player clockwise) ─► [order_phase_done]                       │
openCleanup: WORKERS_RETURNED, SETTERS_MARK_RETURNED → cleanup_hand_limit? (not Round 5)  │
   ├─ Rounds 1–4: FIRST_PLAYER_PASSED, round + 1 ─► [cleanup_done] ──────────────────────┘
   └─ Round 5 ─► [game_over] → finishGame → FINAL_SCORE_CALCULATED → finished
```

A window marked `?` opens only when at least one player has a decision. Otherwise it is skipped automatically, inside the same command.

### 3.2 Work turn

`work_turn.step` drives the turn:

1. **`before_action`.**
   - The active player may use `USE_CANAL_BARGE` and `USE_IMPERIAL_PRIORITY`, in either order. A token or Imperial Kiln gained in the window can be used within it (INT).
   - Then exactly one `PLACE_*` command. `END_TURN` here returns `WORKER_ACTION_REQUIRED`. The player cannot pass (L142).
2. **Worker action.** It is atomic, except at the Commission Market, the Guild Hall Shifu inspection and Colour Samples (§3.5). Each of those runs its `WorkTurnStep` sub-step. Every location module ends its action with `ctx.flow.workerActionDone(draft, pid, ctx)`.
   - Kiln Tending (T20) resolves automatically at the end of the first Glaze & Load action each round (INT), inside `glazeLoad.ts`.
3. **`completeWorkerAction`** (the production `workerActionDone`) chooses what happens next:
   - It opens `after_action` if `afterActionWindowOpen` is true:
     - Canal Barge is owned and unused this round, or
     - Imperial Priority is usable: token `held`, the player's Imperial Kiln has been gained and is empty, and they have at least one Shaped vessel.
   - The Canal Barge test deliberately ignores the hand (§4.5).
   - Otherwise it calls `endTurn(…, automatic: true)`.
   - After each use of an ability in `after_action`, it rechecks and ends the turn automatically when nothing is left.
4. **`endTurn`.**
   1. If `market.refillPendingFor` is the ending player, run `refillMainDisplay("end_of_turn")`. This is the deferred refill (L190, L390). Because it runs after the after-action window, a Canal Barge in that window may complete an Order reserved by the same action (INT).
   2. Emit `WORK_TURN_ENDED`.
   3. The next active player is the next clockwise player with an available worker. With equal worker counts, players simply alternate.
   4. When nobody has an available worker, emit `WORK_PHASE_ENDED` and call `continueAfter("work_phase_done")`.

**Commission Market sub-step** (L186–200, R12, B1):

1. `PLACE_COMMISSION_MARKET` carries the mandatory first reservation:
   - `face_up`: reserve the Order and gain the chosen resource in the same command;
   - `blind`: the card goes to the hand, then `awaiting: "resource"`;
   - `look_top_three`: then `awaiting: "look_choice"`, with the cards in `hidden.pendingLook`.
2. `COMMISSION_CHOOSE_LOOKED` reserves one looked-at Order, discards the rest face down, then sets `awaiting: "resource"`.
3. `COMMISSION_GAIN` grants the resource. If `reservationsMade < maxReservations` and `reservable()` still finds an Order, the step becomes `awaiting: "reservation"`, where `COMMISSION_RESERVE` or `COMMISSION_STOP` is legal. Otherwise the worker action completes.
4. A face-up reservation leaves `display[slot] = null` until the turn ends. The Shifu's second reservation therefore chooses among the Orders still showing (L198).

**Guild Hall:**

- **Apprentice:** `PLACE_GUILD_HALL{buy_face_up}`. The command pays, takes the Tech, grants it (unlocking a space) and refills the display. If the Tech is Colour Samples, the Colour Samples step follows.
- **Shifu:** `PLACE_GUILD_HALL{inspect}` draws up to 2 Techs, or as many as remain (possibly 0), into `hidden.pendingLook`.
  1. `GUILD_TAKE` takes a face-up Tech from any discipline, or one inspected Tech, at −1 Coin (minimum 0).
  2. `bottomOrder` must list every untaken inspected Tech exactly once (`INVALID_BOTTOM_ORDER`).
  3. The untaken Techs go to the deck bottom first, then the display refills (B2).
- **Colour Samples (T10)**, when acquired:
  - If at least 1 Main Order can be looked at (deck or discard non-empty), the step becomes `colour_samples` (mandatory, R4).
  - `COLOUR_SAMPLES_CHOOSE` reserves one card and discards the rest. It gives no resource and does not refill the display (L626, L650).

### 3.3 Firing pipeline (Appendix D, L670–693)

| Appendix D step | Phase or automatic action | Module | Events |
| --- | --- | --- | --- |
| Skip check (L236, L670) | Automatic: nothing loaded in the Shared Kiln or any Imperial Kiln → `continueAfter("firing_done")`, no Fire card | contributions | `FIRING_SKIPPED` |
| Setup | Automatic: build `FiringContext`. `participantIds` = players with ≥1 Shared Kiln ceramic (L260); `firingPlayerIds` = players with any ceramic in this firing | contributions | `FIRING_STARTED` |
| 1. Choose Contributions | `firing_contributions` (secret, simultaneous, any order); skipped with no participants (INT) | contributions | `CONTRIBUTION_SUBMITTED` (no card) |
| 2. Reveal and pay | Automatic, on the last submission: revalidate every sealed choice, pay Wood, reveal | contributions | `CONTRIBUTIONS_REVEALED`, `RESOURCES_CHANGED` |
| 3. Base Heat | Automatic: `clamp(kilnDie + Σheat, 0, 5)` (L262, L674) | contributions → pipeline | `BASE_HEAT_DETERMINED` |
| 4. Test Pieces | `firing_test_pieces`. Queue: First Player order, T13 ready, ≥1 ceramic in this firing (INT), ≥1 Wood. `TEST_PIECES_DECIDE`, then `TEST_PIECES_BURY` | pipeline | `TEST_PIECES_PEEKED` (secret), `TEST_PIECES_USED` |
| 5. Heat markers | `firing_heat_markers`. Queue: First Player order, players with a face-down own marker or a ready T24 with an eligible ceramic. `RESOLVE_HEAT_MARKERS` | pipeline | `HEAT_MARKER_TURNED`, `HEAT_MARKER_RETURNED`, `KILN_MASTER_PLACED` |
| 6. Reveal Fire | Automatic (L677), in the command that ends step 5, or that ends step 4 / 3 when step 5 has no actor. There is no player decision; pacing is a UI animation of `FIRE_REVEALED` | pipeline + fireDeck | `FIRE_REVEALED` (`FIRE_DECK_RESHUFFLED` only if empty) |
| 7. Actual Heat | Automatic. Shared: `globalHeat + (Kiln Furniture modifier ?? zone modifier) + marker`. Imperial: `kilnDie + fire + imperialModifier + marker` (L244, L678) | pipeline + heat | `ACTUAL_HEAT_CALCULATED` |
| 8. Heat adjustment | `firing_heat_adjustment`. Queue: First Player order, Jun ready, ≥1 ceramic in this firing, ≥1 Wood. `RESOLVE_JUN` | pipeline | `JUN_ADJUSTED` |
| 9. Quality | Automatic, from the heat difference (L273–278) | pipeline | `QUALITY_ASSIGNED` |
| 10. After-Quality | `firing_after_quality`. Queue: First Player order, players with a ready, affordable ability with an eligible target. The player uses abilities in any order and eligibility is rechecked after each one. `END_AFTER_QUALITY` ends early. A player with nothing left is advanced automatically | afterQuality | `QUALITY_IMPROVED`, `CRACKLE_APPLIED`, `SECOND_FIRING_REVEALED`, `QUALITY_ASSIGNED` |
| 10 (R7) | `firing_second_firing_jun`, after Second Firing's extra card and recalculation, when the actor's Jun is ready and they have ≥1 Wood. The card waits in `firing.pendingExtraFire`. `RESOLVE_JUN`, then the new Quality is assigned and the extra card moved to `fireDiscard`, then back to step 10. Without the window, draw → recalculate → Quality → discard happen in the `USE_SECOND_FIRING` command | afterQuality | `JUN_ADJUSTED{during: second_firing}` |
| 11. Salvage | `firing_salvage`: players with a still-Flawed ceramic from this firing, any order. `SALVAGE_FLAWED` | afterQuality | `CERAMIC_SALVAGED` |
| 12. Finish | Automatic, then `continueAfter("firing_done")`. Steps below | afterQuality | `FIRING_FINISHED` |

Step 12 in detail:

1. Loaded ceramics become `finished`, carrying Quality and Crackle.
2. All kiln spaces are emptied and Kiln Furniture is removed. Heat markers vanish with the loaded state.
3. The round's Fire card goes to `fireDiscard` (Second Firing cards are already there; `pendingExtraFire` is `null` by now).
4. `lastFiring` is set, then `firing = null` and `hidden.firePeeks = {}`.

Second Firing (T14, L640) recalculates with the same Base Heat (or Kiln Die for the Imperial Kiln), the same position modifier and the same marker, plus the new Fire card. Jun from the first calculation does not carry over. The new Quality replaces the old one even if it is worse.

Protective Saggars (T11): +1 level, never to Masterpiece. Ge (L467): a Standard ceramic becomes Fine and gains `crackle = true`. It may follow Saggars on the same ceramic (L654). Once Crackled, the ceramic is Fine for good: Saggars and Second Firing only target Flawed or Standard ceramics, so `FinishedQuality` types a Crackle ceramic as exactly Fine.

Reachable after-Quality sets: Protective Saggars and Second Firing are both Firing Techs (L210), so one player's step-10 turn holds at most one of them, plus Ge if they own the Ge Kiln. The owner's chosen order (L681) therefore matters only between Ge and that one Tech.

### 3.4 Orders, Cleanup, final scoring, and who acts

**Order Phase** (L296, INT):

- `turnOrder` is the First Player order.
- A player is skipped automatically when `completableOrderIds(game, pid, hand)` is empty (`ORDER_TURN_ENDED{automatic: true}`). This happens at the start of their turn and after each completion.
- `COMPLETE_ORDER` (only held Orders) and `END_ORDER_TURN` are the only actions. The display does not change.

**Cleanup** (L302–304):

1. Return workers and remaining Setter's Marks. Reset `placementSequence`.
2. In Rounds 1–4, players with a hand above `handLimit` enter `cleanup_hand_limit`. In Round 5 the trim is skipped (INT).
3. `DISCARD_TO_HAND_LIMIT` must name exactly `hand − limit` held Orders (`HAND_LIMIT_DISCARD_COUNT`). Starting Orders go to `hidden.startingBox`; Main Orders go face down to `hidden.mainDiscard`.
4. Rounds 1–4: the First Player passes clockwise, the round advances, then `cleanup_done`. Round 5: `game_over`.

**Who acts:** `decisionPrompt(game)` (state.ts, exported from the barrel) returns the current actors and the `DecisionMode`.

| Phase | Actors | Mode |
| --- | --- | --- |
| `setup_kiln_selection` | `selectionOrder[index]` | `single` |
| Queue phases (`round_start_setters_mark`, `firing_test_pieces`, `firing_heat_markers`, `firing_heat_adjustment`, `firing_after_quality`) | `queue.actorIds[queue.index]` | `single` |
| `work_turn` | `activePlayerId` | `single` |
| `firing_contributions` | eligible minus submitted | `simultaneous_secret` |
| `firing_second_firing_jun` | `actorId` | `single` |
| `firing_salvage`, `cleanup_hand_limit` | `pendingPlayerIds` (any order) | `parallel` |
| `orders` | `turnOrder[index]` | `single` |
| `finished` | `[]` | `single` |

Every consumer routes on `decisionPrompt`, never on a phase-specific rule of its own:

- The client calls `advance_computers` when `prompt.actorIds.some(isComputerSeat)`, whatever the mode.
- The service's `nextOnlineDecisionActor` returns the first computer seat in `prompt.actorIds`.
- The computer policy accepts any `playerId` in `prompt.actorIds` (not only "the" actor).
- In `parallel` and `simultaneous_secret` windows, a human and a computer may act concurrently. §4.6 defines how the service tolerates the resulting revision races.

### 3.5 Atomic commands and multi-step windows

| Decision | Command shape | Why |
| --- | --- | --- |
| Materials Yard, incl. split, Shifu bonus, Senior Apprentice, Prepared Clay | 1 command, resolved in the order split → Shifu bonus (pay 1 Coin, +1 Clay +1 Wood, L162 "Then") → Prepared Clay (L618 "after gaining resources"). `quoteMaterialsYard` validates each step against the running totals, so Prepared Clay may spend the bonus Clay | All information is known |
| Form & Decorate, incl. vessels, Decorations, Ding extra, Large Throwing Wheel, Decorator's Kit | 1 command | All information is known. The cost is computed by the engine (`quoteFormDecorate`) |
| Glaze & Load, incl. 1–2 ordered loads, Glaze, destination, Imperial modifier, Kiln Furniture, Inverted Firing, Reworking Table, Heat-marker target | 1 command | All information is known. Loads resolve in array order (R8) |
| Commission face-up reservation + resource | 1 command | Known |
| Commission blind / top-3 | reserve → (choose) → gain | A card is revealed to the actor before the next choice |
| Guild Hall (Apprentice) | 1 command | Known |
| Guild Hall (Shifu) | inspect → `GUILD_TAKE` (take + bottom order) | Private reveal |
| Colour Samples | step after acquisition | Private reveal |
| Canal Barge / Imperial Priority | 1 command each | Known |
| Contributions | 1 secret submission per player | Simultaneous secret |
| Test Pieces | decide → bury | Private reveal |
| Heat-marker step | 1 command per player | Known. Players act in order, each seeing the earlier choices |
| Second Firing | 1 command, plus the R7 Jun step if eligible | The extra card is revealed before Jun |
| Order completion | 1 command. Crackle declarations are either omitted (the engine searches and records) or given and used exactly, never mixed (`OrderCompletionSpec` JSDoc) | Known |

### 3.6 Progress guarantee

| Phase / step | Always-legal exit |
| --- | --- |
| `setup_kiln_selection` | Any remaining Kiln (5 ≥ 4) |
| `round_start_setters_mark` | `PLACE_SETTERS_MARK{spaceId: null}` |
| `before_action` | `PLACE_CANAL_WHARF` (uncapped, no cost, L142) |
| `commission_market` | Placement legality guarantees a first reservation. Then `COMMISSION_GAIN`, `COMMISSION_CHOOSE_LOOKED` (≥1 card) or `COMMISSION_STOP` |
| `guild_inspection` | Placement legality guaranteed an affordable face-up Tech of an unowned discipline (L212) |
| `colour_samples` | Opened only when ≥1 card was looked at |
| `after_action` | `END_TURN` |
| `firing_contributions` | `TEND` (always affordable, L260) |
| `firing_test_pieces` | `TEST_PIECES_DECIDE{peek: false}` / `TEST_PIECES_BURY{bury: false}` |
| `firing_heat_markers` | `RESOLVE_HEAT_MARKERS{ownMarker: "return"}`, or without `kilnMaster` |
| Jun windows | `RESOLVE_JUN{adjustment: null}` |
| `firing_after_quality` | `END_AFTER_QUALITY` |
| `firing_salvage` | `SALVAGE_FLAWED{ceramicId: null}` |
| `orders` | `END_ORDER_TURN` |
| `cleanup_hand_limit` | Any `hand − limit` held Orders |

### 3.7 What the engine resolves automatically

Each of these takes no player decision and runs inside the command that reaches it:

- **Round flow:**
  - the Kiln Die roll; the round-start rotation; readying abilities (L131);
  - every window with no eligible actor; the Fire-card reveal when the Heat-marker step ends (L677); Actual Heat; Quality;
  - finishing the firing.
- **Turns:**
  - the end of a Work turn with no after-action option;
  - the deferred refill;
  - skipping a player with no completable Order (Order Phase, INT);
  - the end of an after-Quality turn with nothing eligible left.
- **Effects that are never declined:**
  - Kiln Tending (INT); the Imperial Grant and other milestone rewards; Colour Samples' look (mandatory, R4);
  - the automatic Exhibition (INT);
  - the Shifu's Form & Decorate discount, which always reduces the total by 1 when 2 vessels are formed. Which vessel takes it never changes the total.

---

## 4. Hidden information (b)

### 4.1 How V1.4 separates secrets (findings)

- **Authoritative state.** `private.game_heads.state_json` stores the full `GameState`, including hands (`PlayerState.orderHand`), deck orders, `privateFirePeeks` and phase-private fields (`offeredOrderIds`, `colourSamplesChoices`, `inspectedTechniqueIds`).
  - The `private` schema is revoked from `anon` and `authenticated`. Only `service_role` (Edge Functions) can read it.
  - `private.game_snapshots`, `private.game_commands` (raw commands, e.g. Guild return order) and `private.game_events.full_payload` are equally private.
- **Public state.** `public.game_public_states.state_json` and `public.game_public_events.payload` hold the output of `src/multiplayer/projection.ts`. They are readable by room members under RLS.
  - The projection copies fields one by one and redacts per phase type: hand → `[]` plus `orderHandCount`, decks → counts, `colourSamplesChoices`/`inspectedTechniqueIds` → `[]`.
  - Per-phase redaction is fragile: every new private field must be remembered.
  - V1.4 also published `discards.market` identities. V1.6.1 forbids this: the Main discard is face down (B3).
- **Contributions** never enter `GameState` before the reveal.
  - Sealed cards live in `private.private_submissions` (`contribution_card`, historical `use_fuel_ledger`, `revealed_revision`). `private_window_reveals` records each reveal.
  - `service.ts` rebuilds `PrivateFiringState` from those rows and calls `submitWoodContribution(state, privateState, …)`. The state only records `submittedPlayerIds`. Payment and reveal happen atomically on the last submission.
- **Private delivery.**
  - Each `CommandSuccess` and reconnect carries `ownPrivateDecision` (`PrivateDecisionState`: hand, setup offer, Colour Samples choices, Guild inspection, Fire peek) and `ownPendingContribution` for the requesting seat only.
  - Computer players receive a `ComputerObservation`: the public projection plus their own private fields.

### 4.2 Secret inventory and projection rules (V1.6.1)

The storage model stays the same. The **shape** changes:

- every secret in `GameState` lives under `hidden`;
- unrevealed Contributions stay in `PrivateFiringState`;
- every private event payload sits under `secret`.

`projectPublicState` is therefore "drop `hidden`, add `counts`" (§4.3).

| Secret | Where it lives | Who may see it | Public projection | Persisted in |
| --- | --- | --- | --- | --- |
| Order hands (L200, L507) | `hidden.orderHands` | Owner | `counts.orderHands[pid]` | `game_heads` |
| Setup deal (L100) | `hidden.orderHands`; `ORDERS_DEALT.secret` | Owner | Counts only | `game_heads`, `game_events.full_payload` |
| Main deck order and identities | `hidden.mainDeck` | Nobody | `counts.mainDeck` | `game_heads` |
| Main discard identities (B3) | `hidden.mainDiscard` | Nobody. Rotated-out display Orders were public when shown (`MAIN_DISPLAY_ROTATED`) | `counts.mainDiscard` | `game_heads` |
| Starting box (L101, L303) | `hidden.startingBox` | Nobody | Omitted | `game_heads` |
| Tech deck order | `hidden.techDecks` | Nobody. The chooser's own bottom order reaches them again on reconnect through `server_list_private_events` (§4.6) | `counts.techDecks` | `game_heads` |
| Fire deck order | `hidden.fireDeck` | Nobody | `counts.fireDeck`. The Fire discard is public (L512) | `game_heads` |
| Test Pieces peek (L639, INT) | `hidden.firePeeks[pid]`; `TEST_PIECES_PEEKED.secret` | Owner, for the rest of the firing | `firing.testPieces[]` (peeked/buried); `TEST_PIECES_USED{buried}` | `game_heads`, events |
| Commission Shifu top-3 (L196, B3) | `hidden.pendingLook`; `PRIVATE_LOOK_OPENED.secret` | Actor | `counts.pendingLook {playerId, kind, count}` | `game_heads`, events |
| Colour Samples top-3 (L626, B3) | Same | Actor | Same | Same |
| Guild Shifu inspection (L207, B2) | `hidden.pendingLook {discipline, techIds}`; `PRIVATE_LOOK_OPENED.secret` | Actor | Discipline and count (the deck picked up is visible at the table) | Same |
| Guild bottom order (B2) | `hidden.techDecks`; `GUILD_TAKE.bottomOrder`; `TECHS_RETURNED_TO_BOTTOM.secret` | Actor | Count only | `game_heads`, `game_commands`, events |
| Blind / top-3 / Colour Samples reservation | Hand; `ORDER_RESERVED.secret.orderId` | Owner | `source`, `via`; `orderId: null` | Events |
| Face-up reservation | Hand | Everyone saw it taken | `ORDER_RESERVED.orderId`, `slotIndex` | Public events |
| Unchosen looked-at Orders | `hidden.mainDiscard`; `LOOKED_ORDERS_DISCARDED.secret` | Actor | Count | Events |
| Cleanup discards (L303) | `hidden.mainDiscard` / `startingBox`; `HAND_TRIMMED.secret` | Owner | Count | Events |
| Contribution and Fuel Ledger commitment (L504, L638, L672) | `PrivateFiringState` → `private.private_submissions` | Owner until every eligible participant submits | `firing_contributions.submittedPlayerIds`; after the reveal, `firing.contributions` | `private_submissions` |
| Raw commands carrying secrets (`GUILD_TAKE`, `COMMISSION_CHOOSE_LOOKED`, `COLOUR_SAMPLES_CHOOSE`, `DISCARD_TO_HAND_LIMIT`, `SUBMIT_CONTRIBUTION`) | `private.game_commands.command_json` | Server | Never published | `game_commands` |

Never secret: all ceramics and their attributes, incl. Shaped vessels, loads, the Imperial modifier (R11), Kiln Furniture, turned and face-down markers (a face-down marker has no hidden value, INT), Crackle (L508). Also: resources (L504), the Kiln Die (INT), the Fire discard (L512), the display, owned Techs, completed Orders and hand counts.

### 4.3 Projection API (`view.ts`, P0)

- **`projectPublicState(state)`**
  - Returns `{ ...structuredClone(stateWithoutHidden), counts: publicCounts(state) }`.
  - It removes `hidden` by destructuring (`const { hidden, ...rest } = state`). It never edits fields one by one.
  - A runtime self-check throws if `firing.contributions` is not `null` while `firing_contributions` is open. The `FiringContext` itself exists from `FIRING_STARTED` on.
- **`projectPrivateView(state, pid, privateFiring)`** returns:
  - `orderHand`;
  - `pendingLook` only if `pendingLook.playerId === pid`;
  - `firePeek`;
  - `pendingContribution` from `privateFiring.submissions[pid]`, with `fuelLedger` and the `windowId`. The service must pass a `PrivateFiringState` rebuilt from the store (§4.6), including on reconnect; passing `null` during an open Contribution window hides the seat's own sealed choice.
- **`viewOf` / `actorViewOf`** compose the two. Validators, selectors, `legalActions` and the computer player use only these.
- **`projectEvent(e)`** removes `secret`. The type is `PublicGameEvent = WithoutSecret<GameEvent>`, so adding a private field outside `secret` is a type error in review.
  - `eventForViewer(e, pid)` keeps `secret` only when `secret.visibleTo === pid`.
- **Unit tests** (`projection_privacy.test.ts`) check two things:
  - `JSON.stringify(projectPublicState(s))` contains no Order ID other than those in the display and completed records;
  - no Tech ID other than those displayed or owned, and no hidden Fire values.

### 4.4 Events

Events are the presentation timeline, in resolution order. The UI may animate them, skip them, and jump to the end state on reconnect.

- **Events with `secret`:** `ORDERS_DEALT`, `ORDER_RESERVED` (blind / top-3 / Colour Samples), `PRIVATE_LOOK_OPENED`, `LOOKED_ORDERS_DISCARDED`, `TECHS_RETURNED_TO_BOTTOM`, `TEST_PIECES_PEEKED`, `HAND_TRIMMED`.
- **`CONTRIBUTION_SUBMITTED`** carries no card at all. Revealed cards appear only in `CONTRIBUTIONS_REVEALED`.
- **All other events are public.** `ORDER_COMPLETED` reveals the Order, as the physical game does (L409).

### 4.5 Inference channels

Timing and automatic skips can leak information:

| Channel | V1.6.1 handling |
| --- | --- |
| Order Phase auto-skip shows "nothing completable" | Sanctioned by INT ("skipped automatically"). Accepted. |
| After-action window could show "holds a completable Order" | The window opens whenever Canal Barge is ready, **regardless of the hand**. Imperial Priority usability is public. No leak. |
| Test Pieces / Jun / after-Quality queues | Membership uses public facts (owned Tech, Wood, ceramics). No leak. |
| Commission blind reservation then resource step | The resource step follows every blind reservation regardless of the card. No leak. |
| Error messages | Validators see only views, so an error cannot mention hidden data. |
| Computer players | Observe `PlayerView` only (replaces `ComputerObservation`). |
| Computer policy failures | The policy sees its own hand, looks and peek, so an exception message may name them. The service never forwards it: `COMPUTER_TURN_FAILED` carries a fixed message and the seat's display name only; the cause is logged server-side (§4.6). |

### 4.6 Changes to the multiplayer layer and database (Phase 4, P8 unless noted)

**Types (`src/multiplayer/types.ts`, `store.ts`).**

- Re-export `PublicGameState`, `PlayerView`, `PublicGameEvent`, `DecisionPrompt` from `types.ts`. Delete the local copies.
- `StoredRulesVersion` gains `"1.6.1"`. `aiPolicyVersion` gains `"rules-v1.6.1-…"`.
- `PrivateDecisionState` → `PrivatePlayerView`. `PendingContribution` is deleted; `PrivatePlayerView.pendingContribution` (`{card, fuelLedger, windowId}`) replaces it everywhere.
- `SubmitWoodCommand` → `SubmitContributionCommand` (`{windowId, card, fuelLedger}`).
- **Fuel Ledger through every store layer.** `PrivateCommitInput`, `PrivateSubmissionRecord` and the store's pending-submission record gain `fuelLedger: boolean`. `inMemoryStore.ts` and `supabase/functions/_shared/supabaseStore.ts` write and read it. Without this, a Fuel Ledger −2/+2 would silently resolve as −1/+1.

**Projection and computer observation.**

- `projection.ts` becomes a thin wrapper over `view.ts`.
- `computerObservation.ts` becomes `viewOf(state, pid, privateFiring)`.

**`service.ts`.**

- `gameCompatibilityError` accepts only schema 6 / `"1.6.1"`.
- Every command passes `parseCommand` before the service branches on its type (§2.5). Contributions map to `submitContribution`.
- `privateFiringState(room, head)` rebuilds `PrivateFiringState.submissions` as `{card, fuelLedger}` from the stored rows.
- **Responses** carry `ownPrivateView` plus, for the acting seat, the `secret` payloads of that command's events (`ownSecrets`).
- **Reconnect** loads the open window's private submissions, rebuilds `PrivateFiringState` and returns `projectPrivateView(state, seat, privateFiring)`, so a reconnecting seat sees its own sealed card and Fuel Ledger commitment.
- **Game start** persists `createGame`'s events (`GAME_CREATED`, `ORDERS_DEALT` with each seat's secret, the setup display events) through `server_commit_start`, which gains `p_full_events` and `p_public_events`. `public_states.event_sequence` then equals the persisted event count, which the client's event reload keys on.
- **Private event log (required).** `server_list_private_events(room, player, after)` returns `full_payload.secret` for events whose `secret.visibleTo = player`. It is how a non-host seat receives its setup deal as a log entry and how a reconnecting seat recovers secrets that are not in `PrivatePlayerView`, such as the Guild bottom order it chose (B2). Pending looks and peeks are also in `PrivatePlayerView`.
- **Computer failures leak nothing.** `advanceComputerTurns` returns `COMPUTER_TURN_FAILED` with a fixed message ("<name> could not choose an action"), never `cause.message`; the cause is logged server-side only.
- **Computer fallback.** `fallbackComputerCommands(view) = legalCommands(view, {mode: "canonical", perFamilyLimit: 8})`. In `firing_contributions` that is `legalContributions(view)` with TEND first, so a failing policy always has a safe exit there too.
- **Routing.** `nextOnlineDecisionActor(state)` = first computer seat in `decisionPrompt(state).actorIds`. `chooseOnlineComputerAction(view, seat)` accepts any seat in `actorIds`.
- **Revision races in shared windows.** `executePublicCommand` normally requires `expectedRevision === head.revision`. In a `parallel` window (`firing_salvage`, `cleanup_hand_limit`) it also accepts `phase.openedAtRevision ≤ expectedRevision < head.revision` when the actor is still in `decisionPrompt(head.state).actorIds` and the command validates against the current head. Choices in these windows touch only the actor's own ceramics or hand, so validating against the newer head is sound. A commit conflict is retried at most 3 times with a fresh head (the same compare-and-swap loop as `executeContribution`). Every other phase keeps strict equality.

**Client (`src/ui/App.tsx`, `src/multiplayer/client.ts`).** The client imports `decisionPrompt` from the barrel and calls `advance_computers` when `prompt.actorIds.some(isComputerSeat)`. It no longer uses its own "current decision actor" or "first unsubmitted" logic. (`App.tsx` changes are Phase 5; `client.ts` is P8.)

**New migration `v161_rules.sql`.** Every V1.4 gate must be rewritten; missing any one makes every V1.6.1 commit fail with "unsupported rules or schema version".

| Object | Change |
| --- | --- |
| `rooms_rules_version_check` | allow `'1.6.1'` |
| `rooms_content_version_check` | allow `'1.6.1'` |
| `rooms_v161_fingerprint_check` (new; keep the V1.4 one for old rows) | `rules_version <> '1.6.1' or (content_version = '1.6.1' and content_digest ~ '^r29-[0-9a-f]{16}$')` |
| `room_ai_seats_policy_version_check` | allow `rules-v1.6.1-…` |
| `private_submissions_contribution_card_check` | `contribution_card in ('BANK','TEND','STOKE')` |
| `private_submissions_fuel_ledger_card_check` | keep `not use_fuel_ledger or contribution_card in ('BANK','STOKE')` |
| `server_create_room` | stamp `'1.6.1'`; require `^r29-` |
| `server_join_room`, `server_add_computer_seat` | reject `rules_version <> '1.6.1'`, `content_version <> '1.6.1'` or a non-`r29` digest |
| `server_commit_start` | V1.6.1 / schema 6 / `^r29-` gate; new `p_full_events`, `p_public_events` parameters |
| `server_commit_transition` | V1.6.1 / schema 6 / `^r29-` gate; inserts `use_fuel_ledger` from `p_private_submission->>'fuelLedger'`; validates the card set |
| `server_load_private_submissions`, `server_find_own_pending` | return `use_fuel_ledger` as `fuelLedger` |
| `server_list_private_events` (new) | as above; `security definer`, seat-token checked, returns only the caller's secrets |

V1.4 rooms are rejected by version and fingerprint (DIG).

**Tests (P8, `test/v161/platform/`).**

- `fuel_ledger_store.test.ts`: a Fuel Ledger −2/+2 reveal through an in-memory store round trip, and the Supabase adapter's row mapping.
- `computer_failure_privacy.test.ts`: a policy that throws a message containing its hand; the response omits it.
- `parallel_windows.test.ts`: a human and a computer acting in `firing_salvage` and in `cleanup_hand_limit`, in both orders, without `STALE_REVISION`.
- `reconnect.test.ts`: reconnect during an open Contribution window returns the seat's own `{card, fuelLedger}`; seat and state unchanged.
- `supabase/tests/rls.test.sql` updated for the new RPCs and constraints, and run in P8 acceptance.

## 5. Legal actions and selectors (c)

### 5.1 One rule implementation, three consumers

The UI, the computer player and the fuzz test never re-implement rules. They call:

- `validateAction(view, action)`: the exact server check, phase and actor checks included (§2.5);
- `legalActions` / `legalCommands` / `sampleLegalAction`: built from per-family generators, each candidate filtered through `validateAction` (or `validateContribution`);
- `selectors.ts`: the quotes, option lists and view models that the UI needs to build a command step by step and to draw the board.

### 5.2 Enumeration strategy

Collapsed in **both** modes:

- **Worker identity.** Apprentices are interchangeable, so each family uses the lowest-ID available Apprentice and, separately, the Shifu.
- **Equivalent vessels.** Two of a player's Shaped vessels with the same Shape and Decoration are interchangeable for every rule; the lowest ceramic sequence represents them.

Collapsed in **canonical** mode only:

- **Equivalent targets.** Two empty Shared Kiln spaces of the same zone that are unmarked and carry no Kiln Furniture are equivalent; canonical uses one per zone (the lowest ID). Under Kiln Furniture the zone no longer matters, so Kiln Furniture variants use a single representative open space.
- **Optional abilities (R4).** Every optional ability that applies yields **two** candidates: used and declined. The computer can therefore keep a once-per-round use for later.

Command options that the 1-per-discipline limit (L210) makes unreachable together are never generated in one command: Prepared Clay with Decorator's Kit, Large Throwing Wheel with Decorator's Kit, Senior Apprentice with Prepared Clay, Kiln Furniture with Inverted Firing. Validators still handle them, and test fixtures cannot build such Tech sets (§8.1).

| Family | `canonical` | `exhaustive` |
| --- | --- | --- |
| `SELECT_KILN` | All available Kilns | Same |
| `PLACE_SETTERS_MARK` | One empty active space per zone + `null` | All + `null` |
| `PLACE_MATERIALS_YARD` | All splits × bonus {no, yes if affordable} × Senior Apprentice {no, yes if ready} × Prepared Clay {none, each Shape × Decoration if ready} | Same |
| `PLACE_FORM_DECORATE` | Apprentice: 20 single vessels; Shifu: 20 + 210 multisets. × Large Throwing Wheel {off, on if triggered} or Decorator's Kit {off, on the first eligible vessel} × Ding {none, each Decoration on the first Bowl/Plate/Brush Washer} | Every legal toggle and index |
| `PLACE_GLAZE_LOAD` | Built step by step, like the UI: vessel class → Glaze (4) → `loadDestinationOptions` (zone representatives, own Setter's Mark space, each Inverted Firing target, Imperial × 3, Kiln Furniture × 3 on one representative). Rework: none, plus, if T05 is ready, each other Shape for each vessel class with the first Glaze and the first destination (linear, not a product). The Shifu's second load is generated from `loadDestinationOptions(…, earlierLoads)` after the first, lazily, singles before pairs. Heat marker: none, or each of `heatMarkerTargets(view, pid, loads)` (R9) | Every space ID, rework Shape and marker target. Lazy; only ever consumed with a limit |
| `PLACE_COMMISSION_MARKET` | Each worker effect (incl. Senior Apprentice) × first reservation: face-up slots × 3 gains, blind, look | Same |
| `PLACE_GUILD_HALL` | Apprentice: each affordable face-up Tech. Shifu: each discipline with a non-empty deck | Shifu: incl. empty decks |
| `PLACE_CANAL_WHARF` / `PLACE_MAGISTRATES_HALL` | Each worker effect | Same |
| Commission / Guild / Colour Samples sub-steps | All (`GUILD_TAKE` × bottom permutations ≤ 2) | Same |
| `USE_CANAL_BARGE` / `COMPLETE_ORDER` | Per held Order: the first match, plus a Ru-triggering match if one exists; each triggered Ru/Guan/Tribute Ware both used and declined | All distinct groups × decline flags |
| `USE_IMPERIAL_PRIORITY` | Vessel class × Glaze × modifier; rework none, plus one rework variant per vessel class and Shape if T05 is ready (Q1) | Every rework |
| Firing windows, salvage, `END_*` | All, incl. the `null` / decline choice | Same |
| `DISCARD_TO_HAND_LIMIT` | All C(hand, excess) (hands are small) | Same |
| Contributions | `legalContributions(view)`: TEND, BANK, STOKE, then BANK and STOKE with Fuel Ledger, affordable only | Same |

- `enumerateLegalActions` is a deterministic generator: families in a fixed order, then parameters in a fixed order (never `Record` key order, §2.3). `legalActions(view, {mode, limit, perFamilyLimit})` collects it. `perFamilyLimit` (default 64 in canonical) stops each family separately, so Glaze & Load cannot crowd out the rest.
- `legalCommands(view, opts)` returns `legalContributions(view)` in `firing_contributions` and `legalActions(view, opts)` elsewhere. It is the computer fallback (§4.6) and the fuzz test's exit of last resort.
- **The computer player** builds Form & Decorate and Glaze & Load choices step by step with the §5.4 selectors, like the UI, and uses canonical enumeration for the small families and as the fallback. It never enumerates exhaustive Glaze & Load.
- **Budget:** `legal_actions_perf.test.ts` (P7) requires canonical `legalCommands` with default limits in under 50 ms on a 4-player Round 4 fixture (6 Shaped vessels, Shifu available, Imperial Kiln, every applicable Tech ready), measured as the median of 20 runs.

### 5.3 Sampling for the fuzz test

`sampleLegalAction(view, chooser: RandomSource)` builds a random legal action:

1. Compute `legalActionFamilies(view)`: the families with at least one legal command, decided cheaply from selectors.
2. Pick a family uniformly. Canal Wharf's weight is reduced so games stay varied.
3. Build the parameters step by step with selectors (e.g. Shaped ceramic → Glaze → `loadDestinationOptions`), deciding each optional ability by coin flip, then validate.
4. Retry up to 20 times. On failure, fall back to `legalCommands(view, {mode: "canonical", limit: 1})[0]`, which the progress guarantee (§3.6) makes legal.

The chooser RNG is separate from the game RNG, so fuzz choices never perturb engine draws.

### 5.4 Selectors and view models (`selectors.ts`, P7)

React reads only these, plus `validateAction`, `decisionPrompt` and events. It never compares rule constants, sums score fields or scans workers itself. Types are in `types.ts` §16. A personal space's `unlocked: false` is rendered as a space not yet added ("Learn a Workshop Tech to add this space" / 习得坯作技艺即添此工位), and `true` on space 1 as "Added by ⟨Tech⟩" / 由「⟨技艺⟩」添设; player-facing text never says lock or unlock (owner decision D7). Functions owned by other packages are re-exported, not reimplemented (§2.4).

```ts
// Who acts, the board and the players (public)
decisionPrompt(view): DecisionPrompt                    // re-export of state.decisionPrompt
boardView(view): BoardView                              // central occupants incl. order, kiln spaces with Setter's Mark /
                                                        //   Furniture / markers, displays, counts, Kiln Die, firing
playerSummary(view, pid): PlayerSummary                 // recorded VP, Tech and Kiln readiness, workers, personal spaces
                                                        //   with occupants, Imperial status, marker locations, hand count
scorePreview(view, pid): ScorePreview                   // public information only
handLimitStatus(view, pid): { held: number; limit: number; mustDiscard: number }
firingSummary(view): FiringContext | null               // current or last firing, for the recap
heatPreviews(view): HeatPreview[]                       // re-export (P5)

// Setup and Start of Round
kilnSelectionOptions(view): KilnSelectionOption[]
settersMarkOptions(view): KilnSpaceId[]                 // empty active spaces (T22, L630)

// Work Phase
placementOptions(view): PlacementOption[]               // per location and worker effect incl. Senior Apprentice
quoteMaterialsYard(view, draft): CostQuote              // re-export (P3); split → bonus → Prepared Clay
quoteFormDecorate(view, draft): CostQuote               // re-export (P3); shape Clay, Decorations, Shifu −1, Kit, LTW, Ding
dingCopyableVesselIndexes(view, draft): number[]
shapedVessels(view, pid): ShapedCeramic[]
loadDestinationOptions(view, pid, ceramicId, earlierLoads, reworkShape?): LoadDestinationOption[]  // re-export (P3)
heatMarkerTargets(view, pid, pendingLoads): CeramicId[]                                            // R9
commissionOptions(view, effect): CommissionOptions      // at placement (by effect) and in the sub-step
lookedOrderOptions(view): LookedOrderOptions | null     // Commission top-3 or Colour Samples (own private look)
guildOptions(view, effect): GuildOptions                // Apprentice buy list or Shifu inspect list, with prices
guildInspectionOptions(view): GuildInspectionOptions | null   // after inspecting (own private look)
magistratesHallQuote(view, effect): CostQuote & { reachable: Recognition | null }
canalBargeOptions(view): OrderMatchOption[]             // own view only
imperialPriorityOptions(view): { usable: boolean; ceramicIds: CeramicId[] }

// Orders (Order Phase and Canal Barge pickers)
completableOrders(view): OrderMatchOption[]             // one entry per completable held Order
orderMatchOptions(view, orderId, limit?): OrderMatchOption[]   // every distinct ceramic group for one Order
orderSelectionCheck(view, orderId, ceramicIds, declarations?): OrderSelectionCheck

// Firing
contributionOptions(view): ContributionOption[]         // card × Fuel Ledger with Wood, heat and affordability
testPiecesOptions(view): TestPiecesOptions | null       // re-export (P5)
heatMarkerStepOptions(view): HeatMarkerStepOptions | null   // re-export (P5)
junOptions(view): JunOptions | null                     // re-export (P5)
afterQualityOptions(view): AfterQualityOption[]         // re-export (P5)
salvageOptions(view): SalvageOptions | null             // re-export (P5)
```

**Agreement property (P7, `selector_agreement.test.ts`, also run inside the fuzz loop):** for every `legal` / `affordable` flag and every listed option, building the corresponding command and calling `validateAction` (or `validateContribution`) agrees. A selector that says "legal" for a command the validator rejects, or omits a target the validator accepts, fails the test.

## 6. Content data schemas (`data/*.json`, P1)

Every file has `"rulesVersion": "1.6.1"`.

- `content.ts` validates on load and throws on any mismatch.
- Display strings use `name` / `nameZh`, `ability` / `abilityZh`, `shortText` / `shortTextZh`, `…Text` / `…TextZh`.
- Chinese text follows the Song-dynasty kiln-workshop register and the fixed terms in `docs/GLOSSARY_ZH_V1.6.1.md`. P1 creates the glossary first if it does not exist.

### 6.1 `game_config.json` → `GameConfigDefinition`

```json
{
  "rulesVersion": "1.6.1",
  "players": { "min": 2, "max": 4 },
  "rounds": 5,
  "startingResources": { "clay": 2, "wood": 2, "coins": 3 },
  "workers": { "shifu": 1, "apprentices": 3 },
  "setupDeal": { "startingOrders": 2, "mainOrders": 1 },
  "mainMarket": { "displaySize": 6, "roundStartDiscard": 2 },
  "handLimit": { "base": 4 },
  "techs": { "perDiscipline": 6, "faceUpPerDiscipline": 2, "maxOwned": 3, "maxPerDiscipline": 1, "vpEach": 1 },
  "sharedKiln": { "activeSpacesByPlayerCount": {
    "2": ["high_1", "high_2", "middle_1", "low_1"],
    "3": ["high_1", "high_2", "middle_1", "middle_2", "low_1", "low_2"],
    "4": ["high_1", "high_2", "high_3", "middle_1", "middle_2", "middle_3", "low_1", "low_2"] } },
  "shapes": { "bowl": 1, "plate": 1, "washer": 1, "vase": 2, "censer": 2 },
  "shapeSupplyEach": 10,
  "decorations": { "plain": 2, "carved": 2, "impressed": 2, "painted": 2 },
  "glazes": { "white": 1, "celadon": 2, "grey_green": 3, "moon_white": 4 },
  "coinEndGame": { "coinsPerVp": 3, "maxVp": 5 }
}
```

### 6.2 `firing.json` → `FiringDefinition`

- `kilnSpaces`: 8 entries `{id, zone, modifier}`.
- `kilnDie.faces`: `[1,1,2,2,3,3]`.
- `baseHeat`: `{minimum: 0, maximum: 5}`.
- `fireDeck`: the 12 modifiers `[-2,-1,-1,-1,0,0,0,0,1,1,1,2]`.
- `qualityByHeatDifference`: `[{maxDifference:0,quality:"masterpiece"},{1,"fine"},{2,"standard"},{null,"flawed"}]`.
- `contributionCards`: BANK 1 Wood / −1, TEND 0 / 0, STOKE 1 / +1.
- `imperialModifiers`: `[-1,0,1]`.
- `salvageCoins`: 2.

The Fuel Ledger values live in T12's params (`extraWood: 1`, `heat: 1`, which turns ±1 into ±2).

### 6.3 `action_locations.json` → `{rulesVersion, locations: LocationDefinition[7]}`

| id | scope | capacity (2/3/4) | effects (apprentice / shifu) |
| --- | --- | --- | --- |
| `materials_yard` | central | 2/3/4 | `{resources:3}` / `{resources:4, bonus:{coins:1,clay:1,wood:1}}` |
| `commission_market` | central | 2/3/4 | `{maxReservations:1, gainAfterEach:1}` / `{maxReservations:2, gainAfterEach:1, topThreeLooks:1, lookSize:3}` |
| `guild_hall` | central | 2/3/4 | `{discount:0}` / `{inspectCount:2, discount:1}` |
| `canal_wharf` | central | null/null/null | `{coins:2}` / `{coins:4}` |
| `magistrates_hall` | central | 1/1/2 | `{coins:4, recognitionSteps:1}` / `{coins:3, recognitionSteps:1}`; `usableAtRecognition: [0,1,2]` |
| `form_decorate` | personal | `capacity: null`, `personalSpaces: {total:2, unlockedAtStart:1}` | `{maxVessels:1}` / `{maxVessels:2, twoVesselDecorationDiscount:1}` |
| `glaze_load` | personal | Same | `{maxLoads:1, maxImperialLoads:1}` / `{maxLoads:2, maxImperialLoads:1, placesHeatMarker:true}` |

### 6.4 `kilns.json` → `{rulesVersion, kilns: KilnDefinition[5]}`

There is no `enabled` flag: all five are selectable (R1).

| id | params |
| --- | --- |
| RU | `{vp:4, glaze:"celadon", decoration:"plain", quality:"masterpiece"}` |
| GU | `{coins:2, vp:1, minPrintedCrowns:1}` |
| GE | `{fromQuality:"standard", toQuality:"fine"}` |
| DI | `{shapes:["bowl","plate","washer"], clay:1, coins:1}` |
| JU | `{wood:1, deltas:[1,-1]}` |

### 6.5 `techniques.json` → `{rulesVersion, advanced: TechDefinition[18]}`

There is no `starting` key. Each entry has `id, discipline, cost, oncePerRound, timing, unlocks, params` and text. The ID mapping and costs are in the `TechId` JSDoc.

| ID | oncePerRound | timing | params |
| --- | --- | --- | --- |
| T01 | yes | form_decorate_action | `{clayReduction:2, triggerShapes:["vase","censer"]}` |
| T16 | yes | form_decorate_action | `{coinReduction:1, decorations:["carved","impressed","painted"]}` |
| T05 | yes | glaze_and_load | `{}` |
| T17 | yes | materials_yard_action | `{claySurcharge:1}` |
| T18 | yes | worker_placement | `{locations:["materials_yard","commission_market"]}` |
| T19 | no | game_end | `{vpPerCeramic:1, qualities:["fine","masterpiece"], maxVp:5}` |
| T10 | no | when_acquired_and_ongoing | `{lookSize:3, handLimit:5}` |
| T20 | yes | glaze_load_action_after | `{clay:1, wood:1}` |
| T15 | yes | loading_shared_kiln | `{modifiers:[-1,0,1]}` |
| T21 | yes | loading_shared_kiln | `{shapes:["bowl","plate","washer"]}` |
| T22 | yes | work_phase_start | `{}` |
| T23 | yes | before_or_after_worker_action | `{}` |
| T11 | yes | after_quality | `{wood:1}` |
| T12 | no | contributions | `{extraWood:1, heat:1}` |
| T13 | yes | after_base_heat | `{wood:1}` |
| T14 | yes | after_quality | `{}` |
| T24 | yes | heat_marker_step | `{values:[1,-1]}` |
| T25 | yes | order_completion | `{bonusCrowns:1}` |

`unlocks` is `form_decorate` for Workshop, `glaze_load` for Glazing & Loading and `null` for Firing.

`timing` is informational: it names the tile's usual window for UI grouping and reminders, and no rule reads it. A Tech applies wherever its ability text applies. In particular, T16 Decorator's Kit (`form_decorate_action`) also reduces a Decoration paid through Prepared Clay (T17) during a Materials Yard action (audit interpretation, L616).

### 6.6 `orders.json` → `{rulesVersion, starting: OrderDefinition[16], main: OrderDefinition[48]}`

The data is transcribed from the V1.6.1 tables (L519–605). The V1.2.7 deck (`git show b79bb47:apps/kiln-opening/data/orders.json`) and the 16-card Starting deck (`git show 5e21f71:…`) are templates only. Every VP, Coin and Crown value is checked against the V1.6.1 tables, including:

- S10 4 VP; S14 3/3; S16 2/3; S01–S03 4 Coins (R2, R3);
- O16/O21 9 VP; O31 12; O32 15; O33 14; O40 15.

Relation vocabulary (V1.2.7, kept):

- `same_shape`, `different_shape`, `all_different_shape`;
- `same_glaze`, `different_glaze`, `all_different_glaze`;
- `same_decoration`, `different_decoration`, `at_least_n_distinct_decorations`;
- `required_glazes` and `required_decorations` (multiset inclusion);
- `at_least_n_quality`.

The V1.4-only types (`same_nonplain_decoration`, `glaze_categories`, `at_least_n_distinct_glazes`) are dropped.

Painted replaces Crackle in S13, O13, O17, O23, O39 (`required_decorations:["plain","painted"]`), O40 (`["impressed","painted"]`) and O46 (`["carved","impressed","painted"]`). O31 is `required_decorations:["plain"]`. O48 is `at_least_n_distinct_decorations` with count 2.

**Matching** (`orders/matching.ts`):

1. Assign the selected ceramics to slots by permutation, satisfying each slot's `shape`/`shapes`/`glaze`/`decoration`.
2. Every ceramic must be at least `minQuality`.
3. Evaluate relations over the whole selection. Content validation requires every `indices` list to name all slots.
4. **Crackle wildcard** (L469, R6). Each Crackle ceramic takes one declared Decoration ∈ 4 values for this Order. That value replaces the printed Decoration in the slot `decoration` check and in every Decoration relation. It never applies to Glaze, Shape or Quality.
   - Declarations are either omitted (deterministic search, first hit recorded) or given and used exactly, never mixed; see the `OrderCompletionSpec.crackleDeclarations` JSDoc for the error codes.
   - The search covers at most 4^3 × 3! combinations, in a fixed order (ceramics by sequence, Decorations in `DECORATIONS` order).
   - Ru, Exhibition and diversity use the printed Decoration.
   - A Crackle ceramic is never a Masterpiece, so it cannot satisfy a Masterpiece minimum or count toward `at_least_n_quality: masterpiece`.

### 6.7 `imperial_progress.json` → `ImperialTrackDefinition`

- **Track 0–4:**
  - 1 is `{kind:"resources", clay:1, wood:1, coins:1}`;
  - 2 is `{kind:"imperial_kiln"}`;
  - 3 is `{kind:"imperial_priority"}`;
  - 4 is `{kind:"vp", vp:6}`.
- `overflowVpPerCrown: 1`.
- **Exhibition:** `minimumQuality:"standard"`, `qualityVp {standard:2, fine:3, masterpiece:5}`, `distinctShapes {threshold:3, vp:3}`, `distinctGlazes {threshold:3, vp:3}`.

### 6.8 Prose-only files

These are not read by the engine:

- `round_structure.json`: `{rulesVersion, roundCount:5, phases:[{order, id, name, nameZh, summary, summaryZh}]}`, rewritten from L115–121.
- `components.json`: `{rulesVersion, components:[{id, name, nameZh, qty, notes, notesZh}]}`, from L68–93.
- `asset_specs.json` (P1): the specs of assets that must be rebuilt from current data (AGENTS "Approved asset rule"). P1 updates every rules-bearing spec to V1.6.1 names, locations, Techs, Decorations (Painted) and values, and removes specs for retired components (Kiln Yard, Starting Techs, Glaze Palette, …).

There are 10 data files in all: the 7 mechanical files of §6.1–6.7 and these 3.

### 6.10 Rule-error text (`src/game/ruleErrorText.ts`, P1)

`RULE_ERROR_TEXT: Record<GameRuleErrorCode, { en: string; zh: string; detailKeys: string[] }>`. Templates interpolate `details` by key. The UI localises errors from `code` + `details` through this table only. Player-facing text never says lock or unlock (owner decision D7): `PERSONAL_SPACE_LOCKED` reads "Learn a {discipline} Tech to add this space." / 习得{discipline}技艺即添此工位 (the same sentence as the board label), and board labels say a Tech *adds* the second space. The identifiers `unlocked`, `unlocks`, `PERSONAL_SPACE_LOCKED` and `PERSONAL_SPACE_UNLOCKED` are internal and keep their names; `localization_content.test.ts` guards every data text field and rule-error template. `content_contract.test.ts` checks that every code has non-empty EN and ZH text, and the fuzz loop checks that every emitted error's `details` keys are listed in `detailKeys`.

### 6.9 Content validation and fingerprint (P1)

**`content.ts` throws unless:**

- **Counts:**
  - 16 Starting (`deck:"starting"`, `crowns:0`, `minQuality:"standard"`) and 48 Main Orders, with unique IDs matching `StartingOrderId`/`MainOrderId`;
  - 18 Techs, 6 per discipline, `unlocks` consistent with the discipline;
  - 5 Kilns; 7 locations; 8 kiln spaces (3/3/2) with modifiers +1/0/−1.
- **Values:**
  - active space counts 4/6/8, matching 2-1-1 / 2-2-2 / 3-3-2;
  - the Fire deck distribution 1/3/4/3/1 (12 cards); die faces `[1,1,2,2,3,3]`;
  - each Order relation's `indices` covers every slot; each `required_*` length ≤ number of slots.
- **Text:** every display string, Chinese included, is non-empty.

**`rulesFingerprint.ts`:**

- Bump `RULES_BEHAVIOUR_REVISION` to 29, with the history line "V1.6.1 rework of V1.2.7".
- Add the new prose keys to `PROSE_KEYS`: `shortText`, `shortTextZh`, `apprenticeText`, `apprenticeTextZh`, `shifuText`, `shifuTextZh`, `title`, `titleZh`, `rewardText`, `rewardTextZh`, `summary`, `summaryZh`, `notes`, `notesZh`.
- Drop the V1.4 `requirementsZh` compatibility shim. V1.4 rooms are rejected anyway.
- Keep `CONTENT_SOURCES` to the seven mechanical files.

---

## 7. Determinism and randomness (d)

- **Every random draw goes through `RandomSource`.** A test greps `src/game` for `Math.random`, `Date` and `crypto` and fails on any match.
- **Validation never consumes randomness.** Only resolvers draw.
- **The service persists the RNG state per revision**, as V1.4 does. Each command constructs `SeededRandom(head.rngState)` and stores `rng.getState()`.
- **Setup draw order is fixed** (P2 must follow it exactly):
  1. Shuffle the Starting deck.
  2. Shuffle the Main deck.
  3. Deal 2 Starting Orders to each player in seat order, then 1 Main Order to each player in seat order.
  4. Return the undealt Starting Orders to the box.
  5. Reshuffle the Main deck and reveal 6.
  6. Shuffle the Tech decks in the order workshop, glazing_loading, firing, and reveal 2 each.
  7. Shuffle the Fire deck.
  8. Choose the First Player: `playerOrder[rng.nextInt(n)]`.
- **Per round:** `rollDie(FIRING.kilnDie.faces, rng)` at Start of Round, then any reshuffles triggered by draws.
- **Draws happen at the step that needs the card:** Main deck draws and refills; Tech refills; the Test Pieces peek (reshuffles only if the deck is empty); the Fire reveal; Second Firing's extra card.
- **A buried Fire card is moved to the end of `hidden.fireDeck`.** If the deck ever empties, the discard is shuffled into a new deck (L649). The editorial note says this cannot happen in a real game, because at most 10 of the 12 cards are drawn.
- **Storage independence.** The in-memory store keeps object key order; Postgres `jsonb` does not (§2.3 "Iteration order"). Rules never depend on key order, and the tests prove it:
  - `determinism.test.ts` replays each recorded command log twice: once as is, and once passing the state through `keySortedJsonRoundTrip` (keys sorted by length, then bytes, as `jsonb` does) before every command. Both runs must produce identical events, state hashes and RNG states at every revision.
  - The fuzz loop applies the same round trip before a random 10% of its commands.
- **Tests:**
  - All tests use `SeededRandom(seed)`.
  - `determinism.test.ts` replays a recorded command log from the same seed and asserts identical state hashes at every revision.
  - The fuzz test records `(seed, chooserSeed)` in every failure message.

---

## 8. Test plan (e)

### 8.1 Layout

- `test/v161/engine/`: pure engine. Gated by `npm run test:engine` and `npm run typecheck:engine`.
- `test/v161/engine/support/` (P0, Phase 1):
  - `fixtures.ts`:
    - `buildState(spec)`: a complete, invariant-clean `GameState` from a compact spec (`players`, `round`, `phase`, resources, Techs, Kilns, ceramics, kiln contents, display, decks, hands). It does **not** depend on `setup.ts`, so every Phase 2 package can build scenarios before P2 lands.
    - `newGame(seed, n)`: `createGame` plus Kiln selection. Usable once P2 lands.
    - `stageCeramic`, `giveTech`, `setResources`, `setHand`, `setDisplay`. `giveTech` calls `acquisitionError` and throws on an illegal Tech set, so tests never build a state the 3-total / 1-per-discipline limit (L210) excludes.
  - `haltingFlow(halts)`: a `FlowController` whose `continueAfter` and `workerActionDone` record the hand-over in `halts` and leave the draft as the resolver left it.
  - `LocalTable`: holds state, `PrivateFiringState` and RNG; exposes `act`, `contribute`, `expectRuleError` and `halts`; takes `{ flow: "full" | "halt" }`. With `"halt"`, a Phase 2 resolver test stops at the first cross-package hand-over instead of reaching another package's stub.
  - `invariants.ts` re-exports P7's `assertInvariants` (a no-op until P7 lands).
- `test/v161/platform/`: multiplayer, Supabase contract, reconnect (P8).
- `test/v161/ui/`: React (Phase 5).

### 8.2 Required tests (AGENTS.md "Tests that must exist")

| AGENTS.md item | Test file(s) | Package |
| --- | --- | --- |
| Setup for 2/3/4; reverse-order selection of all five Kilns | `setup.test.ts` | P2 |
| 2 Clay / 2 Wood / 3 Coins; 1 Shifu + 3 Apprentices | `setup.test.ts` | P2 |
| Secret deal of 2 Starting + 1 Main | `setup.test.ts`, `privacy_setup.test.ts` | P2 |
| 6-card Main display; 2 face-up Techs per discipline | `setup.test.ts` | P2 |
| No passing; all four workers placed each round | `work_turn.test.ts` | P4 |
| Absolute capacity MY/CM/GH 2/3/4, MH 1/1/2, CW uncapped | `capacity.test.ts` | P3 |
| "At least 1 instance of the main action" at every location | P3: `placement_legality_materials.test.ts` (MY), `placement_legality_personal.test.ts` (F&D incl. Large Throwing Wheel with 0 Clay and Decorator's Kit with 1 Coin; G&L incl. R5 a/b/c), `placement_legality_central.test.ts` (CW, MH). P4: `placement_legality_commission.test.ts`, `placement_legality_guild.test.ts` | P3, P4 |
| Personal spaces once per round; second locked; unlocked by Workshop / G&L Tech, usable later the same round (player-facing text: the Tech *adds* the space, never lock/unlock, D7) | `personal_spaces.test.ts` | P3 |
| Apprentice and Shifu effects at all seven locations | `materials_yard`, `form_decorate`, `glaze_load`, `simple_locations` (P3); `commission_market`, `guild_hall` (P4) | P3, P4 |
| MY Shifu 1-Coin bonus | `materials_yard.test.ts` | P3 |
| F&D Decoration costs and Shifu −1 when forming 2 | `form_decorate.test.ts` | P3 |
| G&L Imperial modifier choice; optional Heat-marker placement | `glaze_load.test.ts` | P3 |
| Commission deferred refill, blind, private Shifu top-3, resource after each | `commission_market.test.ts`, `market.test.ts` | P4, P2 |
| Guild private inspection and chosen bottom order | `guild_hall.test.ts`, `privacy_guild.test.ts` | P4 |
| Canal Wharf | `simple_locations.test.ts` | P3 |
| Magistrate's Hall 4/3 Coins, Recognition 0–2 only, never to 4 | `simple_locations.test.ts` | P3 |
| Shape costs and non-limiting Vessel proxies | `vessels.test.ts` | P3 |
| Ru, Guan | `kilns_orders.test.ts` | P6 |
| Ge (incl. after Saggars, wildcard, never Masterpiece) | `after_quality.test.ts`, `order_matching.test.ts` (both declaration modes and both error codes) | P5, P6 |
| Ding (1 Clay + 1 Coin, outside discounts) | `form_decorate.test.ts` | P3 |
| Jun (incl. Second Firing, R7) | `heat_adjustment.test.ts`, `after_quality.test.ts` | P5 |
| All 18 Techs, incl. Colour Samples when acquired, Kiln Master, Inverted Firing stacks, Setter's Mark reservation, Canal Barge before/after | Module tests + `tech_matrix.test.ts` (one scenario per Tech ID; fails if any `TechId` is uncovered) | P3–P6, P7 |
| 3-total / 1-per-discipline limit, discipline refill and partial display, printed cost, Shifu discount, 1 VP each recorded on gain (A1) | `guild_hall.test.ts`, `scoring.test.ts`, `tech_vp_on_gain.test.ts` | P4, P6 |
| Optional abilities (R4): declining keeps the once-per-round use | `optional_abilities.test.ts` (table-driven over every optional Tech / Kiln ability) | P7 |
| Kiln Die every round (seeded, public) | `round_start.test.ts` | P2 |
| Contribution eligibility from the Shared Kiln only, incl. zero participants | `contributions.test.ts` | P5 |
| Secret simultaneous reveal; Fuel Ledger −2/+2 with extra Wood | `contributions.test.ts`, `privacy_contributions.test.ts` (engine); `fuel_ledger_store.test.ts` (store round trip) | P5; P8 |
| Base Heat clamp 0–5 | `heat_quality.test.ts` | P5 |
| Test Pieces after Base Heat (private peek, public bury) | `test_pieces.test.ts` | P5 |
| Heat-marker step in First Player order; Kiln Master | `heat_markers.test.ts` | P5 |
| Fire deck 1/3/4/3/1, open discard, reshuffle only when empty | `fire_deck.test.ts` | P5 |
| Actual Heat for the Shared Kiln (zone or Kiln Furniture + marker) and the Imperial Kiln | `heat_quality.test.ts` | P5 |
| Quality assignment | `heat_quality.test.ts` | P5 |
| After-Quality abilities in the owner's order | `after_quality.test.ts` | P5 |
| Optional 2-Coin salvage | `after_quality.test.ts` | P5 |
| Skipping the firing when nothing is loaded | `firing_flow.test.ts` | P5 |
| All 16 Starting + 48 Main Orders, incl. multi-ceramic and Crackle | `order_matching.test.ts` (table-driven: a passing set and a near miss per Order) | P6 |
| Empty Main supply (B1) | `market.test.ts`, `commission_market.test.ts` | P2, P4 |
| Round-start discard-2 / slide / reveal-2 | `market.test.ts`, `round_start.test.ts` | P2 |
| Single-pass Order Phase, held Orders only | `order_phase.test.ts` | P6 |
| Hand limit 4/5 at Cleanup | `cleanup.test.ts` | P2 |
| Crowns one at a time, every milestone, 0–4 cap, +1 VP beyond 4 | `recognition.test.ts` | P6 |
| Fixed Grant, Imperial Kiln at 2, Imperial Priority at 3, Audience 6 VP at 4 | `recognition.test.ts`, `imperial_priority.test.ts` | P6, P4 |
| Tribute Ware bonus Crown (R13) | `kilns_orders.test.ts`, `recognition.test.ts` | P6 |
| Automatic Exhibition 2/3/5, +3/+3, Connoisseur's Cabinet | `scoring.test.ts` | P6 |
| Coin VP; all tie-breakers | `scoring.test.ts` | P6 |
| EN/ZH rendering from the same IDs | `localization_content.test.ts`: every stable ID (Order, Tech, Kiln, location, Recognition space, error code) resolves to non-empty EN and ZH text through the content and `ruleErrorText` layers, and rendering either language leaves a deep-frozen `GameState` unchanged. `test/v161/ui/localization.test.tsx` adds the React check in Phase 5 | P1 (owner of the AGENTS item); UI |
| Full random legal games for 2/3/4 players | `fuzz.test.ts` | P7 |
| Reconnect without changing seat or state | `test/v161/platform/reconnect.test.ts` | P8 |

**Additional engine suites:**

| Suite | Package | Checks |
| --- | --- | --- |
| `content_contract.test.ts` | P1 | Every value against the rulebook tables; printed numbers in `ability` text match `params` (successor of V1.2.7's printed-number guard); one source per value |
| `rules_fingerprint.test.ts` | P1 | Revision 29; prose keys excluded |
| `round_start.test.ts` | P2 | Setter's Mark window |
| `canal_barge.test.ts` | P4 | Completes an Order reserved by the same action; triggers Ru/Guan/Tribute/Crackle (R6) |
| `kiln_loading.test.ts` | P3 | R5 a/b/c, R8, Setter's Mark return; Reworking Table applied before the Inverted Firing Shape test (Vase → Bowl then stacked); R5c legality ignores possible reworks (Q3 default) |
| `projection_privacy.test.ts` | P0 | §4.3, on states built with `buildState` only. P2, P4 and P5 own `privacy_setup`, `privacy_guild` and `privacy_contributions` |
| `source_of_truth.test.ts` | P1 | Successor of the V1.2.7/V1.4 `source_of_truth` and `rulebook_assets` suites (the printed-number guard's successor is `content_contract`): the checked-in rulebook matches the audit's SHA-256; `AGENTS.md` and `GAME_RULES.md` name V1.6.1; `asset_specs.json` and every data file use only current IDs (no T02–T04, T06–T09, ST01–ST04, Kiln Yard, Glaze Palette) |
| `flow_halting.test.ts` | P0 | `haltingFlow` records every hand-over; the production `FLOW` maps each milestone and `workerActionDone` to the §2.5 openers |
| `selector_agreement.test.ts` | P7 | §5.4 agreement property over scripted states and inside the fuzz loop |
| `legal_actions_perf.test.ts` | P7 | §5.2 budget: canonical `legalCommands` < 50 ms median |
| `determinism.test.ts` | P7 | Replay |
| `legal_actions.test.ts` | P7 | Every enumerated action validates and applies; §3.6 per phase |

### 8.3 Fuzz test (`fuzz.test.ts`, P7)

**Runs:** N seeded games each for 2, 3 and 4 players (default N = 30 in CI, 500 nightly). Each game runs `sampleLegalAction` until `finished`. Contributions go through `legalContributions` and `submitContribution`. The long run is `npm run test:fuzz:long` (`KILN_FUZZ_GAMES`, default 500). Each game's test first yields one macrotask to the event loop: an all-synchronous file otherwise starves Vitest's worker RPC and, past 60 s, fails the run with "Timeout calling onTaskUpdate" although every game passed.

**After every command, check:**

- `assertInvariants(state)`:
  - **JSON safety:** no `undefined`, `NaN` or `Infinity` anywhere in the state (§2.3);
  - resources never negative;
  - **card conservation:** 16 Starting, 48 Main, 18 Techs and 12 Fire cards, each in exactly one zone. Order zones: hands, Main deck, Main discard, display, completed records, Starting box, pending look. Fire zones: `hidden.fireDeck`, `fireDiscard`, `firing.fireModifier` (the round's card until step 12) and `firing.pendingExtraFire` (only during the R7 Jun window). History records — `FiringCeramicRecord.second.fireModifier`, `lastFiring`, `kilnDie` — are never counted;
  - placements: workers ≤ 4 per player, each placed at most once per round; capacities never exceeded; personal spaces locked unless the matching discipline is owned;
  - kiln consistency: kiln space contents match the loaded ceramics (each loaded Shared ceramic's `spaceId` lists it, in loading order); ≤ 2 per space, only when stacked and with the same owner; covered spaces empty; ≤ 1 Imperial ceramic per player and only if `kilnGained`;
  - **Setter's Mark:** only on an active, empty space; the owner owns T22; ≤ 1 per owner; none during `setup_kiln_selection`, `cleanup_hand_limit` or `finished` (returned at Cleanup step 1, L302);
  - **Kiln Furniture:** `underCeramicId` is in that space's `ceramicIds` and owned by `ownerId`; `ownerId` owns T15; ≤ 1 tile in the Shared Kiln; none outside a loaded space;
  - **markers:** ≤ 1 marker per ceramic; markers only on loaded ceramics (structural); ≤ 1 `own` marker per player; ≤ 1 `kiln_master` marker in the game, owned by the T24 owner; face-down markers only before the Heat-marker step resolves that player;
  - **Crackle:** every Crackle ceramic (Finished, Delivered or in `firing.ceramics`) is exactly Fine (the type enforces it for stored ceramics; this checks casts and the firing record);
  - Techs ≤ 3 and ≤ 1 per discipline;
  - Recognition flags consistent with the Recognition value;
  - the score ledger's `orders` equals Σ completed `vp`;
  - the score ledger's `techs` equals 1 VP per owned Tech (A1: recorded on gain).
- **Privacy:**
  - `projectPublicState` passes the §4.3 ID scan;
  - every projected event lacks `secret`;
  - no unrevealed Contribution appears in public state.
- **Legality** (bounded; exhaustive Glaze & Load membership is not computable):
  - the sampled command validates (`validateAction` / `validateContribution`);
  - its family is in `legalActionFamilies(view)`;
  - every 10th command: every canonical candidate (`legalCommands(view, {mode: "canonical"})`, default limits) validates;
  - the §5.4 selector agreement property holds for the current phase's selectors.
- **Storage round trip:** before a random 10% of commands the state passes through `keySortedJsonRoundTrip` (§7).

**At the end, check:**

- `computeFinalResult` recomputed from scratch equals `state.finalResult`;
- totals equal the sum of the breakdown;
- each breakdown's Tech line equals the old end-game count, 1 VP per owned Tech (A1), so totals are unchanged;
- the game took fewer than 2,000 commands;
- the replay from the command log reproduces the same final state hash.

---

## 9. Migration and build plan (f)

### 9.1 What is moved, deleted, kept or added

V1.4 history stays in git. **Starting point:** `src/game/types.ts` has already been replaced in place by the V1.6.1 contract, so the root `tsc --noEmit` currently reports about 3,300 errors (V1.4 `engine.ts`, `computerPlayer.ts`, `ActionPanel.tsx`, …) and `build`, `typecheck` and `typecheck:edge` are red before any package starts. P0's first commit repairs this.

**P0's first commit ("pin V1.4"), before any other Phase 1 work:**

1. Move the V1.4 engine to `src/game-v14/`: `engine.ts`, `content.ts`, `setup.ts`, `selectors.ts`, `firingRules.ts`, `orderRules.ts`, `rulesFingerprint.ts`, `rng.ts`, `errors.ts`, `index.ts`, plus the V1.4 `types.ts` restored from `HEAD` (`git show HEAD:apps/kiln-opening/src/game/types.ts`).
2. Copy the V1.4 `data/*.json` to `src/game-v14/data/` and point the copy's JSON imports there, so P1's rewrite of `data/` cannot break it.
3. Repoint every V1.4 consumer from `src/game/` to `src/game-v14/`: `src/multiplayer/**`, `src/ui/**`, `src/playtest/**`, `supabase/functions/**`, `test/v14/**`, `test/v127/**`. Mechanical import edits only.
4. Keep the V1.6.1 `src/game/types.ts`; add `tsconfig.engine.json` and the engine scripts.

After this commit the root `build`, `typecheck`, `typecheck:edge` and `npm test` are green again (all on V1.4), and the engine gate exists. The rules-agnostic platform suites (`multiplayer_privacy`, `public_event_pagination`, `rules_fingerprint_gate`, `supabase_contract`, `multiplayer_computer_turns`, `online_computer_player*`) keep protecting the store, CAS and idempotency code until P8 ports them.

**Later moves and deletions:**

- **P8** ports the platform suites to `test/v161/platform/`, repoints `src/multiplayer`, `src/playtest` and `supabase/functions` to `src/game`, then deletes the V1.4 copies of those suites.
- **Phase 5** repoints `src/ui` and deletes `src/game-v14/`, `test/v14/**` and `test/v127/**`. Still-valid UI tests are rewritten under `test/v161/ui`.

**New V1.6.1 files in `src/game/`:** every file in §2.1. `rng.ts` starts as a copy of the V1.4 file, with `RandomSource` imported from `types.ts` and `rollDie` added.

**Versioning:**

- `RulesVersion` `"1.6.1"`, `schemaVersion: 6`, `RULES_BEHAVIOUR_REVISION = 29`;
- `package.json` version `1.6.1`;
- `StoredRulesVersion` gains `"1.6.1"`;
- the Supabase migration in §4.6.

**`tsconfig.engine.json`** (P0, first commit):

```json
{
  "extends": "./tsconfig.json",
  "include": ["src/game/**/*.ts", "test/v161/engine/**/*.ts"]
}
```

**`tsconfig.platform.json`** (P8): `src/game/**`, `src/multiplayer/**`, `src/playtest/**`, `supabase/functions/**`, `test/v161/platform/**`.

**Scripts:**

```json
"typecheck:engine": "tsc -p tsconfig.engine.json",
"test:engine": "vitest run test/v161/engine",
"typecheck:platform": "tsc -p tsconfig.platform.json",
"test:platform": "vitest run test/v161/platform"
```

**Gating:**

| Period | Must stay green |
| --- | --- |
| Phases 1–3 | root `build`, `typecheck`, `typecheck:edge`, `npm test` (V1.4, pinned) **and** `typecheck:engine`, `test:engine` |
| From P8's repoint until Phase 5 lands | `typecheck:engine`, `test:engine`, `typecheck:platform`, `test:platform`. The root `build` and the V1.4 UI suites are red in this window only, because `src/ui` still expects V1.4 multiplayer types |
| After Phase 5 | everything; `vitest.config.ts` stays "run everything", so nothing is skipped silently |

### 9.2 Phases and work packages

**Phase 1: foundations.** Two agents in parallel. Both must merge before Phase 2.

| Package | Files | Acceptance |
| --- | --- | --- |
| **P0 Foundations** (lead) | First commit as §9.1. Then `types.ts` (done), `engine.ts`, `actionGuard.ts`, `state.ts`, `rng.ts`, `errors.ts`, `view.ts`, `placement.ts`, `techs.ts`, `kilns.ts`, `index.ts`; stubs for every other §2.1 file (`invariants.ts` as a no-op); `test/v161/engine/support/` (`buildState`, `haltingFlow`, `LocalTable`, fixtures with the `giveTech` limit check) | Root gates green on V1.4; `typecheck:engine` green with stubs. `projection_privacy.test.ts` (hand-built states). The dispatcher returns `GAME_FINISHED`, `UNKNOWN_PLAYER`, `WRONG_PHASE`, `NOT_YOUR_DECISION` from `validateAction`, and `parseCommand` returns `MALFORMED_ACTION` for malformed `GameAction`s and `SUBMIT_CONTRIBUTION`s. `flow_halting.test.ts`. Helper unit tests (`gain`/`spend`/`turnOrder`/`decisionPrompt` incl. `mode`/`placeWorker`/`grantTech`/`ceramicsInOrder`) |
| **P1 Content** | `data/*.json` (all 10, incl. `asset_specs.json`), `content.ts`, `rulesFingerprint.ts`, `ruleErrorText.ts`, `docs/GLOSSARY_ZH_V1.6.1.md` if missing | `content_contract.test.ts`, `rules_fingerprint.test.ts`, `localization_content.test.ts` (the AGENTS EN/ZH item), `source_of_truth.test.ts` |

**Phase 2: rules.** Five agents in parallel, in two milestones.

- **M2a: helper drop.** Each package's first merge delivers its layer-2/3 helpers that another package calls (§2.4 "Cross-package calls"). They depend only on P0 and P1.

  | Package | M2a files | M2a tests |
  | --- | --- | --- |
  | P2 | `market.ts` | `market.test.ts` |
  | P3 | `kilnLoading.ts` | `kiln_loading.test.ts` |
  | P5 | `firing/heat.ts`, `firing/fireDeck.ts` | `heat_quality.test.ts` (pure math part), `fire_deck.test.ts` |
  | P6 | `orders/matching.ts`, `orders/completion.ts`, `recognition.ts` | `order_matching.test.ts`, `recognition.test.ts` |

- **M2b: everything else.** A test whose code calls another package's helper runs once that helper's M2a merge has landed; it never waits for another package's M2b. Tests that cross a flow hand-over use `LocalTable({flow: "halt"})` and assert on the halted state. Scenario tests build state with `buildState`; `newGame` is available once P2's `setup.ts` lands.

| Package | Files | Acceptance |
| --- | --- | --- |
| **P2 Setup, round and market** | `setup.ts`, `round.ts`, `market.ts` | `setup`, `round_start`, `market`, `cleanup`, `privacy_setup` |
| **P3 Workshop actions and kiln loading** | `kilnLoading.ts`, `work/materialsYard.ts`, `work/formDecorate.ts`, `work/glazeLoad.ts`, `work/centralSimple.ts` | `capacity`, `placement_legality_materials`, `placement_legality_personal`, `placement_legality_central`, `personal_spaces`, `materials_yard`, `form_decorate`, `glaze_load`, `kiln_loading`, `simple_locations`, `vessels` |
| **P4 Turn flow, Commission, Guild, window abilities** | `work/turn.ts`, `work/commissionMarket.ts`, `work/guildHall.ts`, `work/windowAbilities.ts` | `work_turn`, `commission_market`, `guild_hall`, `canal_barge`, `imperial_priority`, `placement_legality_commission`, `placement_legality_guild`, `privacy_guild` |
| **P5 Firing** | `firing/*.ts` | `contributions`, `privacy_contributions`, `heat_quality`, `test_pieces`, `heat_markers`, `fire_deck`, `heat_adjustment`, `after_quality`, `firing_flow` |
| **P6 Orders, recognition, scoring** | `orders/*.ts`, `recognition.ts`, `scoring.ts` | `order_matching`, `order_phase`, `kilns_orders`, `recognition`, `scoring` |

**Phase 3: integration.** One agent. It may start during Phase 2 against the stubs, but its acceptance requires every Phase 2 package.

| Package | Files | Acceptance |
| --- | --- | --- |
| **P7 Views, enumerator, invariants, fuzz** | `selectors.ts`, `legalActions.ts`, `invariants.ts` | `legal_actions`, `legal_actions_perf`, `selector_agreement`, `tech_matrix`, `optional_abilities`, `determinism` (incl. the key-sorted round trip), `fuzz` (2/3/4 players). Exit criterion for the engine: full legal games complete |

**Phase 4: platform.** Two agents.

| Package | Scope | Acceptance |
| --- | --- | --- |
| **P8 Multiplayer and Supabase** | `src/multiplayer/{types,projection,service,store,inMemoryStore,client,index}.ts`; `supabase/functions/**`; `supabase/migrations/…_v161_rules.sql`; `supabase/tests/rls.test.sql`; `src/playtest/{types,schema,model,client}.ts` (V1.6.1 version gate; `StartingTechniqueId`, `TECHNIQUES` and `activeKilnSpaceIds` replaced by the V1.6.1 content API); `tsconfig.platform.json`; port of the V1.4 platform suites | `test/v161/platform/*`: privacy over the service (incl. `computer_failure_privacy`), contribution CAS, `fuel_ledger_store`, `parallel_windows`, reconnect, fingerprint gate, Supabase contract, `storage_roundtrip` (a full seeded game through the in-memory store with the key-sorted round trip on every load gives the same final hash as without it); `rls.test.sql` |
| **P9 Computer player** | `computerPlayer.ts`, `computerFallback.ts` (fallback = `legalCommands(view, {mode: "canonical"})`, §4.6), `computerObservation.ts` → `PlayerView` | Full games with all-computer tables in the in-memory backend. `computer_fallback.test.ts`: the strategic policy forced to throw in every phase type, Contributions included, still reaches `finished`. `computer_hidden_independence.test.ts`: re-randomising `GameState.hidden` while keeping the computer's own private view fixed (deck orders, other hands with the same counts) never changes its choice |

**Phase 5: UI.** Out of scope here. The UI rework (`V1.6_IMPLEMENTATION_PLAN.md` phases 4–6) consumes only `selectors.ts`, `legalActions`, `validateAction`, `decisionPrompt` and events. It owns `src/ui/**` (incl. `App.tsx`'s `decisionPrompt` routing, §4.6), `test/v161/ui/**` and the final deletion of `src/game-v14/`, `test/v14/**` and `test/v127/**`.

## 10. Rule-coverage matrix (g)

Abbreviations:

- **Modules:** MY = `work/materialsYard`, FD = `work/formDecorate`, GL = `work/glazeLoad`, KL = `kilnLoading`, CS = `work/centralSimple`, TN = `work/turn`, CM = `work/commissionMarket`, GH = `work/guildHall`, WA = `work/windowAbilities`, CO = `firing/contributions`, PL = `firing/pipeline`, AQ = `firing/afterQuality`, HT = `firing/heat`, FDk = `firing/fireDeck`, OM = `orders/matching`, OC = `orders/completion`, OP = `orders/phase`, RC = `recognition`, SC = `scoring`, RD = `round`, SU = `setup`, MK = `market`, PLc = `placement`, TC = `techs`, KN = `kilns`, VW = `view`.
- **State:** `p` = `PlayerState`, `g` = `GameState`.

### 10.0 Overview, glossary and components (L33–95)

| Ref | Rule | Coverage |
| --- | --- | --- |
| L37, L39 | One shared firing; exactly 5 rounds | §3.1; `GameConfigDefinition.rounds` |
| L43–64 | Glossary: ceramic stages, worker kinds, central and personal locations, Tech effect ≠ worker action, held Orders, Imperial Kiln and Priority, Heat marker, Preferred / Base / Global / Actual Heat, Heat Difference, Load | Defined where used: §10.3–10.9; `CeramicStage`, `WorkerKind`, `LocationId`, `FormedBy` / `loadedBy`, `HeatCalculation` |
| L70–72 | Central board (Magistrate's Hall 2 spaces); Shared Kiln 3/3/2 with +1/0/−1; five Kiln boards with 2 + 2 personal spaces (1 locked each) | `action_locations.json`, `firing.json` `kilnSpaces`, `kilns.json`; `PlayerState.personalSpaces` |
| L73–75, L85, L87–88 | 1 Shifu + 3 Apprentices, 1 Heat marker, 1 Recognition marker, 1 Imperial Priority token, 2 Lock tokens per colour | `p.workers`; `CeramicHeatMarker` (≤ 1 own per player, §8.3); `p.imperial`; `personalSpaces[*][1].unlocked` |
| L76–78, L95 | Resources unlimited; quantities are not limits | `gain` / `spend`, no supply counters |
| L79, L328 | 50 Vessel cards, 10 per Shape, not a limit | `g.vesselSupply`, proxies |
| L80–81 | 48 Main + 16 Starting Orders; Starting never shuffled into Main | `hidden.mainDeck`, `hidden.startingBox` |
| L82 | 18 Techs, 6 per discipline; Kiln Master has its own marker | `techniques.json`; one `kiln_master` marker game-wide (§8.3) |
| L83, L92 | Fire deck 1/3/4/3/1; Kiln Die faces 1,1,2,2,3,3 | `firing.json`; `content_contract.test.ts` |
| L84 | 3 Contribution cards per player | `ContributionCardId`, `firing.json` `contributionCards` |
| L86 | 4 Imperial Kiln tiles | `p.imperial.kilnGained` |
| L89–91 | VP track, First Player marker, Round marker | `ScoreLedger`, `g.firstPlayerId`, `g.round` |
| L93 | Crackle markers (Ge only); kept until delivered or exhibited | `FinishedQuality.crackle` survives into `DeliveredCeramic`; Exhibition reads the finished ceramic |

### 10.1 Setup (L97–111)

| Ref | Rule | State | Phase / action | Module |
| --- | --- | --- | --- | --- |
| L99 | Shared Kiln covered 2-1-1 / 2-2-2 / 3-3-2; Magistrate's Hall second space covered at 2–3 players | `g.sharedKiln.spaces[].active`; MH capacity data | createGame | SU, content |
| L100 | Shuffle Starting and Main decks separately; deal 2 Starting + 1 Main, secret | `hidden.orderHands`, `ORDERS_DEALT.secret` | createGame | SU, MK |
| L101 | Undealt Starting Orders to the box; reshuffle Main; reveal 6 | `hidden.startingBox`, `hidden.mainDeck`, `g.market.display` | createGame | SU, MK |
| L102 | 3 Tech decks of 6; reveal 2 each | `hidden.techDecks`, `g.techDisplay` | createGame | SU, MK |
| L103 | Fire deck shuffled; open discard; Kiln Die | `hidden.fireDeck`, `g.fireDiscard` | createGame | SU |
| L104 | Resources and Vessel cards by Shape | `g.vesselSupply` | createGame | SU |
| L105 | 4 Imperial Kiln tiles | `p.imperial.kilnGained` | n/a | RC |
| L106 | Colour components; Imperial Priority token on space 3 | `p.workers`, `p.imperial.priority = "on_track"` | createGame | SU |
| L107 | Random First Player; reverse-order Kiln choice; lock second spaces | `g.firstPlayerId`, `p.kilnId`, `p.personalSpaces[*][1].unlocked = false` | `setup_kiln_selection` / `SELECT_KILN` | SU, KN |
| L108 | 1 Shifu + 3 Apprentices | `p.workers` | createGame | SU |
| L109 | Imperial Kiln area empty | `p.imperial.kilnGained = false` | createGame | SU |
| L110 | 2 Clay, 2 Wood, 3 Coins | `p.resources` | createGame | SU |
| L111 | Recognition 0; Round 1 | `p.imperial.recognition`, `g.round` | createGame | SU |

### 10.2 Round structure and Start of Round (L113–131)

| Ref | Rule | State | Phase / action | Module |
| --- | --- | --- | --- | --- |
| L115–121, L39 | 5 rounds; 5 phases | `g.round`, `g.phase` | flow | engine, RD |
| L125, change 15 | Kiln Die every round, incl. Round 1 (INT) | `g.kilnDie` | `startRound` / `KILN_DIE_ROLLED` | RD |
| L127–129 | Rounds 2–5: discard 2 leftmost, slide, reveal 2 (B1: up to 2, slide, fill as available) | `g.market.display`, `hidden.mainDiscard` | `startRound` / `MAIN_DISPLAY_ROTATED`, `DISPLAY_REFILLED` | RD, MK |
| L131 | Ready once-per-round abilities | `p.techs[].usedThisRound`, `p.kilnAbilityUsedThisRound` | `startRound` / `ABILITIES_READIED` | RD, TC |
| L117 "refill displays" | Tech displays refill immediately after a take (L209); round start re-runs the refill idempotently | `g.techDisplay` | `startRound` | RD, MK |

### 10.3 Work Phase general rules (L133–155)

| Ref | Rule | State | Phase / action | Module |
| --- | --- | --- | --- | --- |
| L135 | First Player clockwise; 1 worker per turn, resolved immediately; until all placed | `work_turn.activePlayerId` | `PLACE_*`, `END_TURN` | TN |
| L137 | 1 Shifu + 3 Apprentices each round | `p.workers` | n/a | PLc |
| L139 | Any unoccupied space; capacities absolute; no overfill | `WorkerState.placement` | `validatePlacement` / `LOCATION_FULL` | PLc |
| L140 | The Shifu follows Apprentice placement rules and receives the Shifu effect | `WorkerPlacement.effect` | `placeWorker` | PLc |
| L141 | At least 1 instance of the main action; "up to 2" = 1 or 2; optional bonuses declinable | Per-location validators / `NO_MAIN_ACTION_POSSIBLE` | `PLACE_*` | MY, FD, GL, CM, GH, CS |
| L142 | No passing; Canal Wharf always legal | `before_action` | `END_TURN` → `WORKER_ACTION_REQUIRED` | TN, CS |
| L143 | Personal spaces once per round; locked spaces unusable | `p.personalSpaces`, `WorkerState.placement` | `PERSONAL_SPACE_LOCKED` / `PERSONAL_SPACE_USED` | PLc |
| L147–155 | Capacity table | `LocationDefinition.capacity` | `validatePlacement` | content, PLc |

### 10.4 Locations (L157–232)

| Ref | Rule | State | Phase / action | Module |
| --- | --- | --- | --- | --- |
| L161 | MY Apprentice: 3 Clay/Wood in any mix | `p.resources` | `PLACE_MATERIALS_YARD` | MY |
| L162 | MY Shifu: 4; then may pay 1 Coin for +1 Clay +1 Wood (resolved after the split, before Prepared Clay, §3.5) | Same | `buyShifuBonus` | MY |
| L168 | F&D Apprentice: 1 vessel, Clay + Decoration | `g.ceramics` (`shaped`) | `PLACE_FORM_DECORATE` | FD |
| L169 | F&D Shifu: up to 2; if 2, one Decoration −1 Coin | Same | `vessels` length 2 | FD |
| L171, R4 | F&D legal only if Clay + a Decoration are payable for 1 vessel, after ready Workshop discounts (Large Throwing Wheel, Decorator's Kit) | n/a | `canFormAny` | FD |
| L172, L356 | Shaped records Shape and Decoration | `ShapedCeramic` | n/a | state |
| L178 | G&L Apprentice: 1 vessel, Glaze, load | `LoadedCeramic` | `PLACE_GLAZE_LOAD` | GL, KL |
| L179, R9 | G&L Shifu: up to 2; optional Heat marker face down on any of your loaded ceramics without a marker | `LoadedCeramic.heatMarker` | `heatMarkerCeramicId` / `HEAT_MARKER_PLACED` | GL |
| L181 | Empty active Shared space, or 1 load into your empty Imperial Kiln | `SharedKilnSpaceState.ceramicIds`, `LoadPlacement` | `LoadSpec.destination` | KL |
| L182, R5 | Legal if ≥1 Shaped vessel has a legal destination (a/b/c) | n/a | `hasAnyLegalLoad` | KL |
| L183 | Covered spaces unusable; Imperial Kiln 1 per firing | `space.active` | `KILN_SPACE_UNAVAILABLE` / `IMPERIAL_KILN_UNAVAILABLE` | KL |
| L184 | Marker resolved in Firing; 1 per ceramic | `heatMarker` | `HEAT_MARKER_INVALID` | GL, PL |
| L188–191 | Reservation: face-up (position empty until turn end, then slide and refill) or blind top card | `g.market`, `hidden.mainDeck` | `CommissionReservationChoice` | CM, MK |
| L195 | CM Apprentice: reserve 1, then gain 1 Clay/Wood/Coin | `hidden.orderHands` | `PLACE_COMMISSION_MARKET`, `COMMISSION_GAIN` | CM |
| L196 | CM Shifu: up to 2; one may be top-3 (look, reserve 1, discard rest; optional per editorial note); gain after each | `hidden.pendingLook`, `hidden.mainDiscard` | `look_top_three`, `COMMISSION_CHOOSE_LOOKED` | CM, MK |
| L198 | Must reserve ≥1; may stop after first; second reservation from the Orders still showing | `WorkTurnStep.commission_market` | `COMMISSION_STOP` | CM |
| L199, L303 | No hand limit during the round; limit 4/5 at Cleanup | n/a | `cleanup_hand_limit` | RD, TC |
| L200, L507 | Hands secret; counts public | `hidden.orderHands`, `counts.orderHands` | projection | VW |
| L206 | GH Apprentice: pay printed cost, take 1 face-up | `p.techs`, `g.techDisplay` | `PLACE_GUILD_HALL{buy_face_up}` | GH |
| L207, B2 | GH Shifu: inspect top 2 (or remaining) of 1 discipline; take a face-up or inspected Tech at −1 (min 0); rest to bottom in chosen private order | `hidden.pendingLook`, `hidden.techDecks` | `inspect`, `GUILD_TAKE` | GH, MK |
| L209 | Refill the discipline to 2 if possible (after the bottom return, B2) | `g.techDisplay` | `refillTechDisplay` | MK |
| L210 | ≤ 3 Techs, ≤ 1 per discipline | `p.techs` | `acquisitionError` | TC |
| L211 | Unlocking; usable later this round | `p.personalSpaces[*][1].unlocked` | `grantTech` / `PERSONAL_SPACE_UNLOCKED` | TC |
| L212 | GH legality: affordable face-up Tech from an unowned discipline (after the Shifu discount for the Shifu) | n/a | GH validate | GH |
| L213 | Newly acquired Tech usable this round if its timing permits; when-acquired resolves immediately | `OwnedTechState` | Colour Samples step | GH, TC |
| L219–220 | CW 2 / 4 Coins | `p.resources` | `PLACE_CANAL_WHARF` | CS |
| L224 | MH 1/1/2 spaces; Recognition 0–2; both spaces usable by one player | Capacity data, `usableAtRecognition` | `PLACE_MAGISTRATES_HALL` | CS, PLc |
| L228–229 | Pay 4 / 3 Coins → +1 Recognition | `p.imperial` | Same | CS, RC |
| L231–232 | No Crown requirement; 0→1, 1→2, 2→3; resolve reward; never to 4 | Same | `RECOGNITION_GATE` | CS, RC |

### 10.5 Firing Phase (L234–292) and Appendix D (L668–693)

| Ref | Rule | State | Phase / action | Module |
| --- | --- | --- | --- | --- |
| L236, L670 | Skip if nothing loaded; no Fire card | n/a | `openFiringPhase` / `FIRING_SKIPPED` | CO |
| L240, L672, L260, change 16 | Participants: ≥1 Shared Kiln ceramic; secret choice; must afford | `FiringContext.participantIds`, `PrivateFiringState` | `firing_contributions` / `SUBMIT_CONTRIBUTION` | CO |
| L252–258 | Bank 1/−1, Tend 0/0, Stoke 1/+1 | Content | `contributionHeat`, `contributionWood` | HT, content |
| L260 | Tend always affordable; cards returned after firing | n/a | Progress guarantee | CO |
| L262, L674 | Base Heat = die + Σ, clamp 0–5 | `firing.baseHeat`, `unclampedBaseHeat` | `BASE_HEAT_DETERMINED` | HT, CO |
| L673 | Reveal all simultaneously, then pay | `firing.contributions` | `CONTRIBUTIONS_REVEALED` | CO |
| L247–248 | Base and Global Heat per firing; only Base Heat clamped | `firing.globalHeat` | Automatic | HT, PL |
| L242, L675 | Test Pieces in First Player order | `firing_test_pieces` | `TEST_PIECES_*` | PL |
| L242, L266–269, L676 | Heat markers: First Player order; turn ±1 or return; Kiln Master now | `LoadedCeramic.heatMarker` | `RESOLVE_HEAT_MARKERS` | PL |
| L268 | A marker is not a zone modifier; stacks with Kiln Furniture; stays for Second Firing | `HeatCalculation.heatMarker` | n/a | HT, AQ |
| L269 | 1 marker per ceramic; returned when the ceramic leaves the kiln | Step 12 | `finishFiring` | AQ |
| L243, L677 | Reveal Fire (automatic when the Heat-marker step ends); Global Heat = Base + Fire | `firing.fireModifier`, `globalHeat` | `FIRE_REVEALED` | PL, FDk |
| L244, L678 | Actual Heat formulas (Shared, Imperial) | `FiringCeramicRecord.first` | `ACTUAL_HEAT_CALCULATED` | HT, PL |
| L245, L679–680 | Jun and similar, then Quality | `firing_heat_adjustment` | `RESOLVE_JUN`, `QUALITY_ASSIGNED` | PL |
| L273–278 | Quality table | `qualityForDifference` | n/a | HT |
| L278 | Flawed cannot complete Orders or be exhibited | `minQuality`, exhibition filter | n/a | OM, SC |
| L280, L682 | Salvage 1 still-Flawed ceramic from this firing for 2 Coins after after-Quality; Vessel card back | `firing.ceramics[].salvaged`, `g.vesselSupply` | `firing_salvage` / `SALVAGE_FLAWED` | AQ |
| L681 | After-Quality in First Player order; owner chooses own order | `firing_after_quality` | `USE_*`, `END_AFTER_QUALITY` | AQ |
| L683 | Finish: finished area, empty kilns, return markers / Kiln Master / Furniture, discard Fire face up, return cards | `g.fireDiscard`, `g.lastFiring` | `finishFiring` / `FIRING_FINISHED` | AQ |
| L686–693 | Timing vocabulary | `TechTiming` | n/a | content |
| L284 | Imperial Kiln tile at Recognition 2 | `p.imperial.kilnGained` | `IMPERIAL_KILN_GAINED` | RC |
| L286 | 1 ceramic per firing | Derived | KL validate | KL |
| L287 | G&L (1 vessel) or Imperial Priority loads it; no Tech effect does | `loadedBy` | GL, WA | KL |
| L288, R10, R11 | Court-fired: die + Fire + chosen modifier + marker; immune to Contributions; modifier public | `LoadPlacement.imperialModifier` | n/a | HT |
| L289 | Counts for Techs/abilities in this firing; not a participant; no Shared space | `firing.firingPlayerIds` vs `participantIds` | n/a | CO |
| L290 | Resolves Quality and finishes normally | n/a | AQ | AQ |
| L292, L433, R10 | Imperial Priority: once per game, before/after worker action, free, Shaped → empty Imperial Kiln; token effect | `p.imperial.priority` | `USE_IMPERIAL_PRIORITY` | WA, TN |

### 10.6 Order Phase, Cleanup, production (L294–359)

| Ref | Rule | State | Phase / action | Module |
| --- | --- | --- | --- | --- |
| L296, INT | First Player clockwise, single pass; held Orders only; face-up never; display unchanged; auto-skip | `orders` phase | `COMPLETE_ORDER`, `END_ORDER_TURN` | OP |
| L302 | Return workers and Setter's Marks | `WorkerState.placement`, `space.setterMarkOwnerId` | `openCleanup` | RD |
| L303 | Trim to 4/5; Starting → box, Main → discard | `hidden.*` | `DISCARD_TO_HAND_LIMIT` | RD |
| L304 | Round 5 → scoring; else pass First Player, advance round | `g.firstPlayerId`, `g.round` | `FIRST_PLAYER_PASSED` | RD |
| L310–316 | Production stages | Ceramic stages | n/a | n/a |
| L320–326 | Shape Clay costs | Content | `shapeClay` | FD, MY |
| L328 | Vessel cards non-limiting; proxies | `vesselSupply`, `nextProxySequence` | `formCeramic` | state |
| L332–339 | Decorations 2 Coins at forming; Shifu and Kit each −1 on one | Content | `quoteFormDecorate` | FD |
| L343–352 | Glaze chosen at loading; Preferred Heat 1–4 | `LoadedCeramic.glaze` | `LoadSpec.glaze` | GL, HT |
| L356–359 | Shaped / Loaded / Fired / Delivered | `CeramicStage` | n/a | types |

### 10.7 Workshop development and Techs (L361–380, Appendix B L607–654)

| Ref | Rule | State | Phase / action | Module |
| --- | --- | --- | --- | --- |
| L365, L373–375 | 1 Kiln + ≤ 3 Techs (1 per discipline) + ≤ 2 personal spaces; 6/6/6; unlocks | `p.techs`, `p.personalSpaces` | n/a | TC |
| L369, L646 | Tech effects are not worker actions (Prepared Clay, Canal Barge, Imperial Priority) | `FormedBy`, `loadedBy`, `CompletedOrderRecord.via` | n/a | MY, WA |
| L376–377, L481 | Printed timing; same-timing order chosen by the owner; players in First Player order | Queues | n/a | PL, AQ |
| L378, L492, L609, L755 → A1 | 1 VP per Tech, recorded when the Tech is gained (owner amendment A1; no longer at game end); the final breakdown shows it as its own line from the ledger | `p.score.techs`, `FinalScoreBreakdown.techs` | `TECH_ACQUIRED.vp` (GH via `grantTech`) | TC, GH, SC |
| L615 T01 Large Throwing Wheel | Once/round; F&D with ≥1 Vase/Censer; total Clay −2 (min 0); Ding's vessel never triggers it (L652); counts for F&D legality (L171) | `usedThisRound` | `useLargeThrowingWheel` | FD |
| L616 T16 Decorator's Kit | Once/round; one Carved/Impressed/Painted −1 Coin; may stack with the Shifu discount; not Ding's vessel; may apply to Prepared Clay (INT, implemented but unreachable: T16 and T17 are both Workshop); counts for F&D legality (L171) | Same | `decoratorsKitVesselIndex`, `preparedClay.useDecoratorsKit` | FD, MY |
| L617 T05 Reworking Table | Once/round; at glaze and load, change Shape first (applied before the Inverted Firing Shape test); return card; no Clay; Decoration stays; placement legality ignores possible reworks (Q3) | `CERAMIC_RESHAPED` | `LoadSpec.reworkShape`, IP `reworkShape` (Q1) | KL |
| L618 T17 Prepared Clay | Once/round; MY action after gaining (incl. the Shifu bonus); form 1 at Clay +1 plus a Decoration; not an F&D action | `formedBy: "prepared_clay"` | `preparedClay` | MY |
| L619, L653 T18 Senior Apprentice | Once/round; 1 Apprentice at MY/CM resolves the Shifu effect (incl. 1-Coin bonus, 2 reservations, top-3; R12); never at MH | `WorkerPlacement.viaSeniorApprentice` | `seniorApprentice` | PLc, MY, CM |
| L620 T19 Connoisseur's Cabinet | +1 per exhibited Fine/Masterpiece, max +5 | `FinalScoreBreakdown.connoisseur` | n/a | SC |
| L626, L650, R4, B1, B3 T10 Colour Samples | When acquired: look at top 3 (deck only, as many as remain), reserve 1, discard rest; no resource, no refill; mandatory if ≥ 1 card; hand limit 5 | `hidden.pendingLook`, `handLimit` | `colour_samples` / `COLOUR_SAMPLES_CHOOSE` | GH, TC |
| L627 T20 Kiln Tending | Once/round after a G&L action with ≥ 1 load: +1 Clay +1 Wood; automatic on the first (INT) | `usedThisRound` | GL resolve | GL |
| L628, L647 T15 Kiln Furniture | Once/round; loading into the Shared Kiln; tile beneath; choose −1/0/+1; returned after firing; Shared only | `space.kilnFurniture` | `LoadSpec.destination.kilnFurniture` | KL |
| L629, R5c, R8 T21 Inverted Firing | Once/round; Bowl/Plate/Brush Washer into an active space with exactly 1 of your ceramics (incl. one from the same action); both use the space's / Furniture modifier | `LoadPlacement.stacked`, `space.ceramicIds` | `invertedFiring` | KL |
| L630, INT T22 Setter's Mark | Once/round at Work Phase start, First Player order, on an empty active space; only you load there; returned on your load or at Cleanup; optional; bought mid-round → next round | `space.setterMarkOwnerId` | `round_start_setters_mark` / `PLACE_SETTERS_MARK` | RD, KL |
| L631, R6 T23 Canal Barge | Once/round; before/after a worker action; complete 1 held Order with every completion effect | `CompletedOrderRecord.via` | `USE_CANAL_BARGE` | WA, OC |
| L637, L651 T11 Protective Saggars | Once/round after Quality; 1 Wood; your Flawed→Standard or Standard→Fine from this firing; never Masterpiece | `FiringCeramicRecord.quality` | `USE_PROTECTIVE_SAGGARS` | AQ |
| L638, L504 T12 Fuel Ledger | With Bank/Stoke, secret +1 Wood → −2/+2; revealed together | `ContributionSubmission.fuelLedger` | `SUBMIT_CONTRIBUTION` | CO |
| L639, L649, INT T13 Test Pieces | Once/round after Base Heat, before markers; ≥ 1 ceramic in this firing (Imperial counts); 1 Wood; private peek; optional bury; may not show | `hidden.firePeeks`, `firing.testPieces` | `TEST_PIECES_DECIDE` / `TEST_PIECES_BURY` | PL, FDk |
| L640, L651, R7 T14 Second Firing | Once/round after Quality; your Flawed/Standard from this firing; extra Fire card; same Base/zone/Furniture/marker; first Jun not carried; replaces even if worse; discard extra after resolving; affects no other ceramic | `FiringCeramicRecord.second`, `firing.pendingExtraFire` (R7 window only), `g.fireDiscard` | `USE_SECOND_FIRING`, `firing_second_firing_jun` | AQ |
| L641, L648 T24 Kiln Master | Once/round in the marker step; your markerless ceramic in this firing; ±1 face up; is a Heat marker; not with your own marker on the same ceramic | `heatMarker{source:"kiln_master"}` | `RESOLVE_HEAT_MARKERS.kilnMaster` | PL |
| L642, R13 T25 Tribute Ware | Once/round; completing a printed-Crown Order: +1 bonus Crown (advances or +1 VP); not printed; no Guan trigger; not tie-breaker 2 | `CompletedOrderRecord.bonusCrowns` | `declineTributeWare` | OC, RC |
| L652 | Three separate reductions; Shifu + Kit may hit the same Decoration (Carved for 0); Ding takes neither; LTW Clay only | n/a | `quoteFormDecorate` | FD |
| L654 | Ge after Saggars on the same ceramic; Crackle never fills Masterpiece | n/a | AQ, OM | AQ, OM |
| L210 + Appendix B | **Reachability.** Two Techs of one discipline never coexist, so these modelled combinations cannot occur: Prepared Clay + Decorator's Kit (the audit INT), Large Throwing Wheel + Decorator's Kit, Senior Apprentice + Prepared Clay, Reworking Table + Large Throwing Wheel; Kiln Furniture + Inverted Firing (R8's Furniture clause), Setter's Mark + either; Protective Saggars + Second Firing; Test Pieces + Kiln Master. Reachable cross-discipline pairs that need tests: Reworking Table + Inverted Firing, Reworking Table + Imperial Priority (Q1), Decorator's Kit or Large Throwing Wheel + Ding, Canal Barge + Tribute Ware, Fuel Ledger + any, Ge + Saggars or Second Firing, Jun + Second Firing (R7) | Validators keep every branch; enumeration skips the unreachable ones (§5.2); `giveTech` refuses them (§8.1) | n/a | all |

### 10.8 Orders and Recognition (L382–451)

| Ref | Rule | State | Phase / action | Module |
| --- | --- | --- | --- | --- |
| L386 | One 48-card Main deck and a 6-card display; the 16-card Starting deck at setup only | `g.market`, `hidden.mainDeck` | n/a | MK |
| L388 | Display oldest (left) to newest | `display` order | n/a | MK |
| L390 | Leaves only by reservation or round-start discard; refill after the reserving turn; multiple takes → one refill | `refillPendingFor` | `endTurn` | MK, TN |
| L392 | VP, Coins, 0–3 Crowns | `OrderDefinition` | n/a | content |
| L396 | Reservation options; Colour Samples | n/a | CM, GH | CM, GH |
| L400–403 | Held: secret, counts for limit, completable later or via Canal Barge, scores as printed | `hidden.orderHands` | n/a | OC |
| L409–416 | Completion steps 1–8 (reveal, select, confirm, beneath, VP, Coins, Crowns one at a time, scoring area) | `p.completedOrders`, `DeliveredCeramic`, `p.score.orders` | `COMPLETE_ORDER` / `ORDER_COMPLETED` | OC, RC |
| L418 | A ceramic satisfies only one Order | `stage: "delivered"` | `DUPLICATE_CERAMIC` / `ILLEGAL_CERAMIC_STAGE` | OC |
| L422 | Independent multi-ceramic requirements unless a pairing is printed | `OrderRelationDefinition` | `matchOrder` | OM |
| L426, L429–435 | Recognition by Crowns or MH; milestones 1–4; +1 VP per Crown beyond 4 | `p.imperial`, `p.score` | `RECOGNITION_ADVANCED`, `CROWN_OVERFLOW_VP` | RC |
| L437–439 | Overflow VP; one Crown at a time across milestones; each milestone once | Flags | `gainCrown` | RC |
| L443–451 | Exhibition: any number of undelivered Standard+, 2/3/5, +3 Shapes, +3 Glazes; never Flawed; automatic (INT) | `FinalScoreBreakdown.exhibition` | `finishGame` | SC |

### 10.9 Kiln Traditions (L453–485)

| Ref | Rule | State | Phase / action | Module |
| --- | --- | --- | --- | --- |
| L459 Ru | Once/round; completing with an actual Celadon + Plain Masterpiece → 4 VP (also via Canal Barge) | `p.kilnAbilityUsedThisRound`, `score.kilnAbilities` | `COMPLETE_ORDER` / `USE_CANAL_BARGE` | OC, KN |
| L463 Guan | Once/round; completing an Order with ≥ 1 printed Crown → 2 Coins + 1 VP | Same | Same | OC, KN |
| L467–469 Ge | Once/round after Quality; your Standard ceramic from this firing → Fine + Crackle marker; wildcard Decoration for Orders; never Masterpiece (typed: `FinishedQuality` / `DeliveredQuality`) | `FinishedCeramic.crackle`, `firing.ceramics[].crackle` | `USE_GE_CRACKLE`; `crackleDeclarations` | AQ, OM |
| L473, R1 Ding | Once/round in an F&D action (either worker); after forming a Bowl/Plate/Brush Washer, 1 Clay + 1 Coin for another of the same Shape with any Decoration; outside vessel limit and discounts; counts as formed by that action | `formedBy: "ding_extra"` | `dingExtra` | FD |
| L477, R7 Jun | Once/round after Actual Heat, before Quality; 1 Wood; ±1 on your ceramic; also in Second Firing if unused | `HeatCalculation.junAdjustment` | `RESOLVE_JUN` | PL, AQ |
| L481–485 | Timing summary; L484: the wildcard is declared while completing the Order (omitted → engine search; given → used exactly) | Queues | `crackleDeclarations` | PL, AQ, OC |

### 10.10 End of game (L487–498)

| Ref | Rule | State | Phase / action | Module |
| --- | --- | --- | --- | --- |
| L489 | Ends after Round 5 Cleanup | `game_over` | `finishGame` | RD, SC |
| L491–494, A1 | Recorded VP (incl. Tech VP recorded on gain, A1) + Exhibition + Coins (1 per 3, max 5) | `FinalScoreBreakdown` | `FINAL_SCORE_CALCULATED` | SC |
| L496 | Most VP wins | `FinalResult.winnerIds` | n/a | SC |
| L498, R13 | Ties: Recognition → printed Crowns → Masterpieces delivered or exhibited → shared | `TieBreakValues`, `resolvedBy` | n/a | SC |

### 10.11 General clarifications (L500–513)

| Ref | Rule | Coverage |
| --- | --- | --- |
| L502–503 | Unlimited resources; gain from / return to supply | No supply counters. `gain`/`spend` |
| L504 | Resources public; Contribution / Fuel Ledger secret; committed Wood stays until paid | Projection; payment at reveal (CO) |
| L505–506 | No trading; non-binding talk | No trade actions exist |
| L507–508 | Hands secret, counts public; ceramics public | §4.2 |
| L509 | Ceramics persist between rounds | Stages persist |
| L510 | No end-game penalties | SC computes no penalties |
| L511 | Empty Main deck → shuffle the discard | `drawMainOrder` (MK) |
| L512 | Open Fire discard; reshuffle only when empty | `g.fireDiscard`, FDk |
| L513 | Partial Tech display allowed | `refillTechDisplay` (MK) |

### 10.12 Appendices and change list

| Ref | Coverage |
| --- | --- |
| Appendix A (L515–605) | `orders.json` (§6.6); `order_matching.test.ts` covers every ID |
| Appendix B (L607–654) | §10.7 (L609's Tech VP timing → A1) |
| Appendix C (L656–666) | `firing.json` `fireDeck`; `fire_deck.test.ts` |
| Appendix D (L668–693) | §3.3 |
| Appendix E (L695–757) | Summary of the rows above (L755's Tech VP → A1). `content_contract.test.ts` checks the quick-reference numbers (capacities, costs, Exhibition values, Coin cap, Tech VP and the A1 row) against data |
| Changes 1–19 (L11–29) | 1 → §10.3–10.4; 2 → FD/GL; 3 → heat markers; 4 → L139; 5 → §10.7; 6 → CM/MK, OP; 7 → L288, L292; 8 → MH, Grant; 9 → kiln data; 10 → Ge; 11 → step 4; 12 → L512; 13 → orders data; 14 → FD/Kit/Ding/S10; 15 → Kiln Die; 16 → participants; 17 → setup deal and hand limit; 18 → MH from 0, Grant; 19 → Painted. Line 17's "2 + Fire" is superseded by change 15 (editorial) |

### 10.13 Owner rulings, editorial corrections, interpretations and digital decisions

| Item | Implementation |
| --- | --- |
| A1 | Tech VP on gain: `grantTech` adds `GAME_CONFIG.techs.vpEach` to `p.score.techs`; `TECH_ACQUIRED.vp`; `breakdownFor` reads the ledger; invariant `score.techs = techs.length × vpEach`; fuzz final check against the old end-game count; `tech_vp_on_gain.test.ts`. Revision stays 29 (unreleased) |
| R1 | `availableKilns` = all five; Ding either worker (FD) |
| R2, R3 | Data values exactly as printed (P1 contract test) |
| R4 | Optional flags (`decline*`, `use*`, `null` choices); `usedThisRound` set only on use; Colour Samples mandatory; `optional_abilities.test.ts` |
| R5 | `kilnLoading` a/b/c; `hasAnyLegalLoad` |
| R6 | `resolveOrderCompletion(…, "canal_barge")` runs the same Ru/Guan/Tribute/Crackle code |
| R7 | `firing_second_firing_jun` |
| R8 | Sequential `validateLoads` (rework before the Inverted Firing Shape test); Kiln Furniture on the space. The Furniture-under-a-stack clause is implemented but unreachable (L210) |
| R9 | `heatMarkerCeramicId` optional; any of your loaded ceramics without a marker |
| R10 | Imperial Priority free; `imperialModifier` required |
| R11 | Imperial modifier stored on the ceramic and public |
| R12 | `workerEffectFor` + Senior Apprentice only at MY/CM |
| R13 | `bonusCrowns` separate from `printedCrowns`; Guan checks printed; tie-breaker 2 uses printed |
| B1 | MK draw/look/refill/rotation rules; `ORDER_SUPPLY_EMPTY`; `reservable()` from public counts |
| B2 | `GUILD_TAKE.bottomOrder` private; return before refill; inspect any discipline |
| B3 | Looks private; face-down discard (`counts.mainDiscard` only) |
| Editorial L390 | Colour Samples takes from the deck only |
| Editorial L714 | Top-3 optional (`look_top_three` is a choice) |
| Editorial L649 | Buried card at the end of the deck array |
| Editorial L17 | Kiln Die replaces "2" |
| INT Kiln Die | `startRound` every round incl. Round 1, public |
| INT No participants | Skip window; Base Heat = die |
| INT Test Pieces | Imperial counts; public Wood and bury; private value |
| INT Heat-marker step | Face chosen in the step; own marker and Kiln Master in one command; returned marker frees its ceramic |
| INT Ge Crackle | AQ + OM as above |
| INT Deferred refill | `endTurn` after the after-action window |
| INT Before/after window | Either order; gained token/kiln usable within |
| INT Order Phase | Single pass, auto-skip |
| INT Round 5 Cleanup | Trim skipped |
| INT Exhibition | Automatic, all eligible |
| INT Kiln Tending | Automatic on the first qualifying G&L |
| INT Setter's Mark | Optional; mid-round purchase → next round |
| INT Decorator's Kit | Prepared Clay yes (implemented, unreachable under L210), Ding never |
| DIG Versioning | Rules 1.6.1, schema 6, revision 29; V1.4 rooms rejected |
| DIG Stable IDs | `StartingOrderId`, `MainOrderId`, `TechId` mapping |
| DIG Chinese | Glossary-driven `*Zh` strings (P1) |

---

## 11. Open questions (h)

Only items the text cannot decide are listed. For each, the engine adopts the stated default, and changing it needs no change to the contract.

1. **Reworking Table with Imperial Priority** (L617, L292, L646).
   - Reworking Table triggers "when you glaze and load a Shaped vessel". It does not require the Glaze & Load *action*.
   - Imperial Priority "give[s] 1 of your Shaped vessels a Glaze and load[s] it", but is "not a Glaze & Load action".
   - **Default:** allowed (`USE_IMPERIAL_PRIORITY.reworkShape`), consuming Reworking Table's once-per-round use. If the owner rules otherwise, the validator rejects `reworkShape` there.
2. **Refilling more than two empty display positions** (L129, L190, B1). This is reachable only after the Main deck and discard were both exhausted.
   - L129 says "reveal 2 … restoring the display to 6", and B1 leaves positions empty when no card is available.
   - **Default:** every refill (end of turn or round start) compacts the display and then fills **all** empty positions as cards allow, aiming at 6. The alternative is to reveal at most 2 at round start.
3. **Does Glaze & Load placement legality (R5c) count a vessel that Reworking Table could make eligible for Inverted Firing?** (L617, L629, R5c, L141.)
   - Reworking Table (Workshop) and Inverted Firing (Glazing & Loading) can be owned together. Example: no empty active Shared Kiln space, no Imperial Kiln, one of your ceramics alone in a space, both Techs ready, and your only Shaped vessel is a Vase.
   - R5c lists "a Bowl, Plate or Brush Washer with Inverted Firing unused". L617 lets the Shape change "first" when the vessel is glazed and loaded, which is during the action, after placement. R4's "apply valid discounts before payment" covers costs, not Shape changes.
   - **Default (literal):** placement legality looks only at each Shaped vessel's current Shape, so the example placement is illegal (`NO_MAIN_ACTION_POSSIBLE`). Within a legal action the order is settled: the rework is applied before the Inverted Firing Shape test (L617 "first"), so a Vase reworked to a Bowl may be stacked.
   - If the owner rules otherwise, only `hasAnyLegalLoad` changes (it also tries each reachable reworked Shape while T05 is ready). The contract does not change.

Every other case in the rulebook and audit is decidable from the text and is mapped in §10. In particular these are decided, not open: the Materials Yard order split → Shifu bonus → Prepared Clay (L162 "Then", L618 "after gaining resources"); Form & Decorate legality counting ready discounts (L171 with R4); the automatic Fire reveal (L677).

---

## 12. Review dispositions

Revision 2 answers two independent reviews of revision 1: a **rules review** (RR, verdict "sound", 10 minor findings) and a **consumer review** (CR, verdict "needs changes", 1 blocker, 9 major, 5 minor). Every finding is accepted. No rule or balance value changed. Where the fix differs from the one proposed, the last column says why.

### 12.1 Rules review

| ID | Finding | Disposition | Where |
| --- | --- | --- | --- |
| RR1 | Reworking Table vs Inverted Firing order; R5c and reworkable vessels | **Fixed.** `validateLoads` applies `reworkShape` before the Inverted Firing Shape test (L617 "first"). The R5c legality question is open as §11 Q3, with the literal default (current Shapes only) | `LoadSpec` JSDoc; §2.4; §8.2 `kiln_loading`; §10.7; §11 Q3 |
| RR2 | Materials Yard order of Shifu bonus and Prepared Clay | **Fixed.** Split → bonus → Prepared Clay, each validated against running totals | `PLACE_MATERIALS_YARD` JSDoc; §2.4; §3.5; §10.4 |
| RR3 | `canFormAny` and ready discount Techs | **Fixed.** Tries every single Shape × Decoration with Large Throwing Wheel and Decorator's Kit; singles suffice because forming 2 is never cheaper. Tests added for both Techs | `PLACE_FORM_DECORATE` JSDoc; §2.4; §8.2; §10.4 |
| RR4 | Combinations unreachable under 1 Tech per discipline | **Fixed.** Validators keep the branches; JSDoc and §10.7 mark them unreachable; enumeration never generates them; `giveTech` refuses illegal Tech sets; Kit dropped from canonical Prepared Clay | `types.ts` JSDoc; §5.2; §8.1; §10.7, §10.13 |
| RR5 | `firing_reveal_fire` cites a DIG that the audit does not record | **Fixed** by the second proposed option: the phase and `REVEAL_FIRE` are removed; the Fire card is revealed automatically when the Heat-marker step ends (L677). Recording a new digital decision would need an audit edit and owner sign-off, outside this revision; pacing is a UI animation of `FIRE_REVEALED` | `GamePhase`, `GameAction`; §2.4; §3.1, §3.3, §3.4, §3.6, §3.7; §10.5, §10.13 |
| RR6 | Crackle-never-Masterpiece only a comment | **Fixed, tighter than proposed:** `{crackle: true; quality: "fine"}` rather than `"fine" \| "standard"`. Ge makes the ceramic Fine and no ability can change a Fine ceramic afterwards (Saggars and Second Firing target Flawed or Standard only), so exactly Fine is the true invariant. A `tsc` probe confirms `{crackle: true, quality: "masterpiece"}` and `"standard"` are rejected. The runtime invariant stays for the firing record | `FinishedQuality`, `DeliveredQuality`; §3.3; §8.3 |
| RR7 | Second Firing card double-counted | **Fixed** by moving the card: `extraFireCards` is replaced by `pendingExtraFire` (non-null only during the R7 Jun window); the history is `FiringCeramicRecord.second.fireModifier` | `FiringContext`; §3.3; §8.3 conservation list |
| RR8 | Crackle declaration semantics | **Fixed:** omitted → deterministic search, recorded; present → used exactly, never searched or mixed. One refinement: a well-formed declaration that fails returns `INVALID_CRACKLE_DECLARATION` only when another declaration would satisfy the Order, else `ORDER_REQUIREMENTS_NOT_MET`, so a Glaze or Shape mismatch is not reported as a declaration problem | `OrderCompletionSpec` JSDoc; §2.4; §3.5; §6.6 |
| RR9 | V1.4 wording (`"jun"` cause, "actual Glazes") | **Fixed** | `QualityChangeCause`; `ExhibitionScore` |
| RR10 | Missing Setter's Mark, Kiln Furniture and marker invariants | **Fixed.** The Setter's Mark check is stricter than proposed ("empty", not "empty or the owner's ceramic"), because loading there returns the Mark (L630) | `SharedKilnSpaceState`, `CeramicHeatMarker` JSDoc; §8.3 |

### 12.2 Consumer review

| ID | Finding | Disposition | Where |
| --- | --- | --- | --- |
| CR1 (blocker) | Phase 2 resolver tests cannot run | **Fixed.** `invariants.ts` stub is a no-op; P3 location modules hand over through the new `FlowController.workerActionDone` hook instead of importing `work/turn`; `EngineOptions.flow` + `haltingFlow` let a test stop at any cross-package hand-over; `buildState` removes the dependency on `setup.ts`; stubs throw `NotImplementedError`; cross-package calls are listed and their callees ship first (M2a). The proposed "minimal turn core in P0" was not taken: it would make P0 and P4 edit `work/turn.ts` in the same phase | `FlowController`, `EngineOptions`; §2.1–2.5; §8.1; §9.2 |
| CR2 | Fuel Ledger commitment lost in every store layer | **Fixed** as proposed, including reconnect rebuilding `PrivateFiringState` and a store round-trip test. `PrivatePlayerView.pendingContribution` gains `windowId` and replaces `PendingContribution` | `PrivatePlayerView`; §4.3; §4.6 |
| CR3 | Policy exception message forwarded to a human | **Fixed** as proposed, with a platform privacy test | §4.5; §4.6 |
| CR4 | Parallel windows not routed end to end | **Fixed.** `DecisionPrompt.mode`; `decisionPrompt` exported for the client; computer advance gated on any computer actor; the policy accepts any actor; revision tolerance in `parallel` windows with a bounded CAS retry. Refinement: tolerance is bounded below by the new `openedAtRevision` on `firing_salvage` and `cleanup_hand_limit`, so a stale command from an earlier window of the same type is never accepted | `DecisionPrompt`, `GamePhase`; §3.4; §4.6 |
| CR5 | No computer fallback in `firing_contributions` | **Fixed.** `legalContributions(view): SubmitContributionCommand[]` (TEND first) and `legalCommands(view, opts): AuthoritativeCommand[]`; the fallback is `legalCommands`; a test forces the policy to throw in every phase | §2.4; §4.6; §5.2; §9.2 P9 |
| CR6 | Canonical Glaze & Load explodes; fuzz membership uncomputable | **Fixed.** Step-wise canonical construction, `perFamilyLimit`, computer builds Glaze & Load step by step, bounded fuzz legality checks, 50 ms budget test | `LegalActionOptions`; §5.2; §8.3 |
| CR7 | Selector set leaves rules in React | **Fixed.** All proposed selectors and view models added with types; `PlacementOption` gains per-effect `workers` and `seniorApprentice`; `commissionOptions` / `guildOptions` take the effect; selector–validator agreement test | `types.ts` §16; §5.4 |
| CR8 | SQL migration scope underspecified | **Fixed.** Every RPC and constraint listed; `rls.test.sql` in P8 acceptance | §4.6; §9.2 |
| CR9 | Repo untestable; unowned files | **Fixed** with the "pinned V1.4 copy" option: P0's first commit moves the V1.4 engine (with its `types.ts` and data) to `src/game-v14/` and repoints consumers, so the root gates are green again and the platform suites keep running until P8 ports them. The "engine-independent fake" option was not taken because the service imports the engine directly and would need new injection seams. Ownership assigned: `src/playtest/*`, `client.ts`, `multiplayer/index.ts`, `supabase/tests` → P8; `asset_specs.json`, `ruleErrorText.ts` → P1; data file count corrected to 10 | §6.8, §6.10; §9.1; §9.2 |
| CR10 | Several packages edit the same files | **Fixed.** Test files split per package; `selectors.ts` re-exports the P3/P5/P6 option functions | §2.1, §2.4; §8.2; §9.2 |
| CR11 | `jsonb` key order breaks determinism | **Fixed.** Iteration convention, `ceramicsInOrder`, JSON-safety invariant, key-sorted round trip in the determinism, fuzz and storage tests | `GameState` JSDoc; §2.3; §7; §8.3 |
| CR12 | Private info lost on reconnect; setup events lost | **Fixed:** `server_commit_start` persists `createGame`'s events and `server_list_private_events` is required. A `knownTechBottom` view field was not added: a per-player memory of deck bottoms goes stale as cards are drawn and would duplicate `hidden.techDecks`; the private event log already holds the chooser's order | §2.5; §4.2; §4.6 |
| CR13 | Untrusted-input gaps; validator vs dispatcher checks | **Fixed.** `parseCommand` covers every `AuthoritativeCommand`; `validateAction` itself runs the finished / unknown / phase / actor checks, so client and server share one function | §2.5; §5.1 |
| CR14 | Canonical mode never declines, never reworks, marks only the first ceramic | **Fixed** as proposed | §5.2 |
| CR15 | Remaining test gaps | **Fixed:** hidden-independence (P9), selector agreement (P7), storage round trip (P8), content-only EN/ZH test owned by P1, `source_of_truth` successor (P1) | §8.2; §9.2 |

### 12.3 Coverage re-check

After these changes the §10 matrix was re-checked against the source line by line. Revision 2 adds §10.0 (overview, glossary and components, L33–95), which revision 1 covered only indirectly. Every rule-bearing line in L33–693 now maps to a matrix row, and Appendix E (L695–757) is a summary of those rows. The open questions are §11 Q1–Q3.
