# Kiln Opening V1.6.1: production UI architecture and parallel build plan

Branch `kiln-opening-next-version`. This document is the build contract for **phase 4, "functional UI rework (DOM)"**, of the [V1.6.1 implementation plan](./V1.6_IMPLEMENTATION_PLAN.md). The [engine design](./ENGINE_V1.6.1_DESIGN.md) calls the same work "Phase 5 repoints `src/ui`"; both names mean this plan.

Revision 2 answers an engine review and a UX review of the first draft. §12 records every finding and what changed.

Authority, in order:

1. [Owner decisions D1–D7](./ui-v1.6.1/OWNER_DECISIONS.md) are **binding**. Guiding principle: *show only what the physical table shows*. No Fire odds or cards-left counts, no Quality previews, no heat ladder or heat ledger, no before-Fire predictions.
2. The signed-off [wireframes](./ui-v1.6.1/kiln-opening-wireframes.html) are the layout and behaviour reference. They are a vanilla-JS renderer of real engine fixtures. Production ports their behaviour, not their code, and every wireframe function is cited below by name (`topBar`, `locCard`, `subEditor`, …).
3. The engine contract: [`ENGINE_V1.6.1_DESIGN.md`](./ENGINE_V1.6.1_DESIGN.md) §5.4 and `src/game/types.ts`. The UI consumes only:
   - the §5.4 selectors (`src/game/selectors.ts`), plus the additions of §5;
   - `validateAction`, `decisionPrompt` and `legalCommands`;
   - the `view.ts` projections;
   - events.

   React never recomputes a rule.
4. Chinese terms: [`GLOSSARY_ZH_V1.6.1.md`](./GLOSSARY_ZH_V1.6.1.md).

Phase 5 (motion) and phase 6 (WebGL) are out of scope. This plan leaves only their hooks (§8.4).

---

## 0. Key decisions

| # | Decision |
| --- | --- |
| K1 | **Build in a fresh `src/app/`.** Do not rewrite `src/ui` in place. A dev-only entry, `next/index.html`, runs it during phase 4 (it is also built, `noindex`). A two-commit cutover swaps the entry points and then deletes `src/ui`, `src/game-v14`, `src/multiplayer-v14`, `src/playtest-v14`, `test/v14` and `test/v127`. |
| K2 | **Every file has one creator and one owner.** A1 and A3 land small contract commits first. A2 then creates typed stubs for every file that is not A1's or A3's. Phase B agents edit only the files they own. Composition files, contracts and the i18n index are frozen after phase A and change only through B6, the contracts owner. |
| K3 | **One `GameSource` interface** has two implementations:<br>• `RemoteGameSource`: the multiplayer client or the local in-memory backend;<br>• `FixtureGameSource`: JSON engine fixtures for SSR tests and the scenario gallery.<br>Components read state only through typed hooks. The raw `PlayerView` is reachable only through `useEngineView()`, and only in `decision/**`, `state/**` and `dev/**`. |
| K4 | **No optimistic UI.** Confirm sends one command. The decision pane stays pending until the server's `CommandSuccess` replaces the view. `validateAction` gates Confirm locally; the server stays authoritative. One `commandId` is kept per pending submission and reused on retry, so a lost response cannot turn into a false failure. |
| K5 | **Every decision form is a pure draft model plus a thin component.** The model (`initial`, `reduce`, `options`, `build`, `fromCommand`, `summary`) is unit-tested in node, and the component renders only from `options()`. Drafts live in a store, and table selection is derived from it synchronously, so SSR shows Place shortcuts and kiln targets. A small happy-dom tier tests keyboard and focus behaviour. Property tests prove that the forms can express every canonical legal command and can play whole games. |
| K6 | **D3/D4 are enforced by types first.** Table, kiln, board and shell components receive a `TableBoardView` with no Fire-deck count and no `FiringContext`. All firing display goes through `firingStageView` and `firingRecapView`, which carry no heat ledger. An import-and-identifier scan and a rendered-markup scan of the full `GameScreen` are the second and third lines of defence. |
| K7 | **The i18n catalogue is ID-keyed and typed**, one namespace file per work package:<br>• rich text through `t.rich` tag placeholders; HTML is never injected;<br>• plurals through `Intl.PluralRules`;<br>• content names and rules text come from `data/*.json` through the engine content exports;<br>• rule errors come from `formatRuleError` and are stored as codes, so a language switch re-renders them;<br>• location summaries come from rulebook Appendix E and glossary §4, checked by a parity test, with no data or fingerprint change. |
| K8 | **One token file** with a light block and a dark block. `data-theme` is always set at boot, from the stored choice or `prefers-color-scheme`. `light-dark()` is not used, so iOS 16.4 works. The cascade is `@layer reset, tokens, base, layout, components, states, utilities`. The type scale is in `rem` with a 12px floor, raised to 13px for Chinese body text. Container queries apply only to block wrappers. Short landscape is a height media query. There is no transform scaling. Ceramic art is tinted by CSS mask and multiply. |
| K9 | **Native, named controls.**<br>• Single choices are native radios.<br>• D1 board tabs use the ARIA tabs pattern.<br>• The phone section bar is a `nav` of buttons with `aria-current`.<br>• Toggles use `aria-pressed`.<br>• Every piece (ceramic, marker) has an accessible name and a `PieceDetail` disclosure for tap, focus and hover. An owned Tech slot on a Kiln Player Board is not a control: it shows the Tech's name, its state this round and its printed short text (owner decision D19).<br>• There is one coalesced polite live region and one alert region.<br>• `data-motion` and `data-webgl-mount` hooks are placed now. |
| K10 | **Playwright becomes an explicit, exact-pinned devDependency** (`@playwright/test` 1.62.1, the version already in `node_modules` but in neither `package.json` nor the lockfile), with `@axe-core/playwright`. Specs live in `e2e/`, outside `npm test`. They run locally at each phase exit over 8 viewport projects. A CI job, if the owner approves it (§11), also runs a Chromium smoke test and a short full game against the **built** bundle. |
| K11 | **The local backend is ported to V1.6.1 as `tools/localBackendV161.ts`.** It runs at `/test-api-v161`, beside the V1.4 one at `/test-api`, until cutover, on both the dev and the preview server. It gains `list_private_events`, a seeded reset, invariant checks and a dev-only secret-ID oracle for leak tests. |
| K12 | **Work runs in three phases.**<br>• A: foundations. 3 agents, with the A1 and A3 contract commits first.<br>• B: features. 6 agents, merged in a fixed train; the cross-package tests land after B4 and B5.<br>• C: hardening and cutover, 1–2 agents.<br>Every commit keeps the engine, platform and root gates green, root build included. |
| K13 | **Shared Kiln layout follows owner decision D8:** Low (−1) at the top with its two spaces centred under the dome, Middle (0) in the middle, High (+1) at the bottom beside the firebox. The kiln mini-glyph on the Table uses the same order. Layout only; data order (`KILN_SPACE_IDS`) and rules are unchanged. |
| K14 | **No internal IDs on screen (owner decision D9).** Ceramic, worker and other engine IDs never reach rendered text, accessible names, the game log or error messages. One i18n helper, `ceramicLabel(ceramic, view, { withOwner, withPlace })`, describes a ceramic in words ("Lin's Celadon Vase, Carved · Fine"), adding owner and location only when needed to tell two apart; every component, event template and `formatRuleError` call uses it. `formatRuleError` gains a `ceramicName` resolver, like `playerName`, so `ceramicId` details render as descriptions. A rendered-markup test fails on any `/\bc\d+\b/` ceramic ID or worker ID in `GameScreen` output. Printed Order numbers (S01, O33) stay. |
| K15 | **Rules details on demand (owner decision D10).** Every Tech tile on the Tech display, Kiln Player Board, Order card and Recognition milestone opens a `RulesDetail` panel (the `PieceDetail` disclosure pattern: click, tap or keyboard). Owner decisions D15 and D19 (2026-10-17) list where there is none: action spaces, the Kiln selection window, the Guild Hall choices (the Tech display's chooser and the Shifu's inspection) and the owned Tech slots on a Kiln Player Board, which show the printed short text instead. The panel was planned with short component text (`shortText`), the full rule (`ability` / location and Order text), the clarifications that apply to that component (new prose field `clarifications: [{ en, zh, source }]` in `data/*.json`, sourced from `docs/KILN_OPENING_v1.6.1_CLARIFICATIONS.md`, outside the rules digest) and card facts (discipline, cost, once per round, used this round); since the owner review of 2026-10-17 it shows only the full rule and the clarifications (D10). A test checks every quoted rulebook sentence against the checked-in source and every `source` tag against the audit. No advice, odds or previews. |

---

## 1. Scope

### 1.1 Rebuilt and reused

| Area | V1.4 source | Phase 4 treatment |
| --- | --- | --- |
| Game table | `GameTable.tsx`, `TabletopGameExperience.tsx` (1,507 lines), `ResponsiveTabletop.tsx`, `tabletopLayout.ts`, `useTabletopPieceSizes.ts` (an 1800px scene scaled with `transform`) | **Rebuilt** as a fluid grid with container queries (§4, §7). Nothing is ported. |
| Action panel | `ActionPanel.tsx` (2,111 lines; rules duplicated in React) | **Rebuilt** as per-window decision forms over selectors (§3.4). |
| Lobby and room flow | `App.tsx` (`HomeScreen`, `LobbyScreen`, `EndedSessionScreen`, `EndSessionDialog`, reconnect, computer advance) | **Behaviour reused, code rewritten:**<br>• create, join and resume a saved seat; add and remove computer seats; start with 2–4; end a session for everyone; leave the view;<br>• the advance loop's 20s timeout, its failure latch per revision and the Retry button.<br>State moves from 15 `useState`/`useRef` cells into `SessionStore` (§3.1), and the code uses V1.6.1 types (`ownPrivateView`, `ownSecrets`). In-game session controls move into the top bar's `SessionMenu` and `ConnectionBanner` (§4.1). |
| Playtest form | `PlaytestFormPage.tsx`, `playtest-form.css` (Form V2, V1.4) | **Rebuilt** on `src/playtest` Form V3: `model.ts`, `schema.ts`, `client.ts`, `types.ts`. Its section structure and draft-save UX are reused. |
| Ceramic art | `CeramicArtwork.tsx`: one SVG `feColorMatrix` filter per instance, fixed RGB per Glaze | **Art reused, rendering replaced.** The same 20 cutouts and the crackle overlay are tinted with a CSS mask and multiply using theme-aware `--glz-*` tokens, as in the wireframe's `.cer` / `cerArt`. Each ceramic gets a text name (§7.4). The 100-appearance test is ported. |
| Worker meeples | `WorkerMeeple.tsx`, `worker-meeples.css` (wood art masked by player colour) | **Reused:**<br>• the masked wood art is the full variant;<br>• the wireframe's lettered token (`wk`: S/A, 师/徒) is the dense variant for queue rows and small chips.<br>Colour comes from the seat token, not `PublicSeat.colour` (§7.4). |
| i18n | `i18n.tsx`: English-string keys, a 350-line `ZH_CN` map | **Replaced** by the ID-keyed catalogue (§6). The locale storage key `kiln-opening:language` is kept, so the preference survives cutover. |
| Multiplayer client | `src/multiplayer/client.ts` (V1.6.1, already shipped) | **Used as is**, plus one option: the local endpoint path (A2, §3.9). |
| Engine, selectors, projection | `src/game` (V1.6.1) | **Used**, with additive selectors (§5). |

### 1.2 Fresh directory, then swap

**Chosen:** build `src/app/` beside `src/ui/`, then swap the entry points.

1. **Gates stay green.**
   - `src/ui` keeps compiling against the pinned V1.4 copies.
   - `src/app` is in the root `tsconfig.json` (`src/**`), so `typecheck` and `build` cover it from its first commit.
   - `next/index.html` is a build input, so the root `build` proves the new app bundles.
   - `test/v14` and `test/v127` keep passing until they are deleted.
2. **No collisions.** Every new file has one creator and one owner (§4.2). Nothing in `src/ui` is edited, so the V1.4 suites never break mid-phase.
3. **Clean revert.** The cutover is two small commits (§10.4), each green.

**Rejected: rewriting `src/ui` in place.** It interleaves V1.4 and V1.6.1 types in the same files. The 20 V1.4/V1.2.7 `.tsx` render tests would fail on the first edit, which breaks "green at every commit". It also forces agents to share the 2,111-line `ActionPanel.tsx`.

**Merge note.** `master` deploys `dist/` to Pages. This branch must not merge to `master` before cutover while `next/` is a build input. If an earlier merge is required, drop the `next` inputs from `vite.config.ts` in that merge.

### 1.3 End state and deletions

After cutover:

- `index.html` → `src/app/main.tsx`;
- `playtest/index.html` → `src/app/playtest/main.tsx`;
- `npm run dev:local` serves the V1.6.1 app against the V1.6.1 in-memory backend at `/test-api`.

Deleted at cutover (V1.4 stays in git history):

- `src/ui/**` (≈13k lines, 16 CSS files, the empty `mock/`), `src/main.tsx`, `src/playtest-main.tsx`;
- `src/game-v14/**`, `src/multiplayer-v14/**`, `src/playtest-v14/**`;
- `test/v14/**`, `test/v127/**`;
- `tools/localBackend.ts` (V1.4). `tools/localBackendV161.ts` is renamed to it.
- `next/` and its `vite.config.ts` inputs.

Ports required **before** the deletion commit, so no still-valid check disappears:

| Retiring test | Still-valid intent | New home |
| --- | --- | --- |
| `test/v14/ceramic_artwork.test.tsx` | 80 glazed + 20 unglazed appearances; a distinct treatment per Glaze; crackle overlays the actual finish | `test/v161/ui/pieces/ceramic_art.test.tsx` |
| `test/v127/localization.test.tsx`, `ui_labels.test.ts` | EN/ZH from the same IDs; no obsolete mechanic named in any UI string | `test/v161/ui/i18n/*.test.ts` and `rendered_text.test.ts` (§9.2) |
| `test/v127/printed_numbers_guard.test.ts` | Numbers in UI text match the code | `test/v161/ui/i18n/no_rule_numbers.test.ts`: catalogue strings carry no literal rule numbers; numbers arrive as placeholders (§5 gap 19) |
| `test/v127/fire_card_history.test.tsx` | Fire-card history visible | `test/v161/ui/kiln/fire_discard.test.tsx`: open discard only (D4) |
| `test/v127/tabletop_turn_order.test.tsx` | Turn order shown correctly | `test/v161/ui/shell/seat_chips.test.tsx` |
| `test/v127/tabletop_order_quality.test.tsx` | Order quality wording | `test/v161/ui/i18n/order_text.test.ts` |
| `test/v127/playtest_form.test.tsx` | Form page renders and validates | `test/v161/ui/playtest/form_page.test.tsx` (Form V3) |
| `test/v127/rulebook_assets.test.ts` | `public/rulebooks` publishes only the current ruleset | `test/v161/platform/rulebook_assets.test.ts` |

Everything else in `test/v14` and `test/v127` either tests V1.4 rules (Dipping Vats, the economy amendment, disabled Ding, …) or tests the scaled tabletop, and is dropped. Two comment-only references to `src/game-v14` change to "git history": `src/game/rulesFingerprint.ts` L33 and `test/v161/engine/rng.test.ts` L7.

### 1.4 Not in phase 4

- **Motion (phase 5):** an event→animation timeline. Phase 4 renders end states only (§8.4).
- **WebGL (phase 6):** mount points only.
- **Art regeneration** (`data/asset_specs.json` "MISSING" entries: 8 Tech illustrations, 5 Kiln Player Boards, central board scenery). Missing art renders as text-only cards; nothing is fetched from older images (AGENTS.md asset rule).
- **Deploying the V1.6.1 Supabase migrations and Edge Functions.** The cutover on this branch is not a deployment. The SQL migrations, both functions and the client must ship together ([ONLINE_GAME_SPEC](./ONLINE_GAME_SPEC.md) "Transition status"), and that needs owner approval.
- **Spectators, chat, timers and undo:** not in the MVP ([ONLINE_GAME_SPEC](./ONLINE_GAME_SPEC.md)).

### 1.5 Reconciliation with `UI_UX_SPEC.md`

`UI_UX_SPEC.md` predates D1–D7. Each of its still-relevant items is adopted, superseded or put to the owner. At cutover it gets a "superseded by" note that points here (§10.4).

| `UI_UX_SPEC` item | Status in this plan |
| --- | --- |
| Always-visible `EN / 中文` control; switching keeps selections, identity and state | **Adopted.** `LanguageToggle` sits in the top bar at every width, not in a menu. Drafts and errors survive a switch (§6.1, §9.3). |
| Host-only End session with a destructive confirmation; ended screen; Leave view keeps the seat; Resume and Forget seat | **Adopted:** `SessionMenu`, `EndSessionDialog`, `EndedScreen`, `HomeScreen` (§4.1). |
| Illegal choices disabled with a reason; cost before confirmation | **Adopted:** `aria-disabled` plus the engine reason; a quote in every sub-editor. |
| "Do not nest expand/collapse controls inside an action window" | **Superseded** by the signed-off wireframe, which puts unavailable locations in a disclosure (`decWork`). |
| Ceramic detail previews by hover, keyboard focus and tap; Escape dismisses | **Adopted:** `PieceDetail` (§7.4, §8.1). |
| Recognition track complete on narrow screens, rewards included | **Adopted.** Rewards stay and the track scrolls horizontally. The wireframe's `.rs p { display: none }` is not ported (§7.3). |
| Kiln spaces show zone and modifier; stable Tech IDs on face-up Tech tiles | **Adopted** (`KilnSpace`, `TechCard`). |
| Log every Tech and Kiln ability activation by name | **Adopted** through the event templates (§5 gap 4). |
| Keep the last Fire card and "Base Heat + Fire = Global Heat" visible until the next firing | **Adopted:** `IdleFiringRecap` over `firingRecapView` (§5 gap 18). |
| Main Order display as an ordered shelf, oldest to newest | **Adopted** (`displayRow` label). Its animation belongs to phase 5. |
| "Scores 1 VP when gained" reminder on every Tech tile | **Open (§11).** It is printed tile text, so it passes the table principle. It is rendered from `GAME_CONFIG.techs.vpEach` unless the owner declines. |
| Always show Preferred Heat on a glazed ceramic | **Open (§11).** Preferred Heat is printed reference information, but showing it per ceramic is close to a heat aid (D3). It is not rendered until the owner rules. |
| Timing banners (`Before Contributions`, …) | **Superseded** by the D3 step rail (Appendix D names). |
| "Desktop/tablet first"; phone suggestions | **Superseded** by D5 and the wireframes. The phone layout is a first-class layout. |
| Debug inspector | **Replaced** by the dev scenario gallery (§9.5). |
| Exhibition, Kiln Yard, V1.4 location names | **Obsolete** V1.4 content. V1.6.1 data supplies the names. |

---

## 2. Layers

```
data/*.json ─► src/game (engine, selectors, view, ruleErrorText)          pure, no React
                    ▲                                ▲
src/multiplayer/client.ts (GameApi) ─┐               │ selectors / validateAction
tools/localBackendV161.ts (dev)      │               │
                                     ▼               │
src/app/session   SessionStore / RemoteGameSource / FixtureGameSource     plain TS, node-testable
                                     ▼
src/app/state     hooks · model · decisionWindow · draftStore · tableSelection · uiStore · layoutMode
                                     ▼
src/app/{shell,table,boards,kiln,firing,results,decision,lobby,playtest}  React components (render only)
src/app/{i18n,styles,kit,pieces}                                          shared presentation
```

Import rules are enforced by `test/v161/ui/import_boundaries.test.ts`. The test scans import specifiers, identifiers **and string literals**, so `counts["fireDeck"]` and destructuring are caught too.

- **`src/app` may import:**
  - the engine barrel `../game/index.ts`;
  - `../multiplayer/client.ts`, and `../multiplayer/types.ts` as types only;
  - `../playtest/{model,schema,client,types}.ts`.

  `src/app/dev/**` may also load `test/v161/ui/fixtures/*.json` through a lazy `import.meta.glob`, which tsc does not type. That JSON is never a build input.
- **`src/app` must never import:**
  - the `src/multiplayer` barrel, `service.ts`, `inMemoryStore.ts`, `store.ts` or `computerPlayer.ts` (the 2.7k-line strategic policy must not enter the client bundle);
  - anything `*-v14`, `src/ui`, or test code.
- **Identifiers forbidden in `src/app`:**
  - `applyAction`, `createGame`, `submitContribution`, `sampleLegalAction`, `enumerateLegalActions`;
  - `heatPreviews`, `qualityByFire`, `heatBeforeFire`, `qualityForDifference`, `scorePreview`, `firingSummary`, `lastFiring`, `fireDeck`, `HeatCalculation`;
  - `dangerouslySetInnerHTML`;
  - the pattern `game.firing`.

  The heat-calculation fields `actualHeat`, `finalActualHeat`, `heatSource` and `heatDifference` may appear only in `src/app/i18n/events.ts`, the game-log templates (public history, which D3 allows).
- **`useEngineView`** (the raw `PlayerView` and `ActorView`) may be called only in `decision/**`, `state/**` and `dev/**`. Every other component receives only `GameModel`, whose types carry no Fire-deck count and no `FiringContext` (§3.3).
- **`useSnapshot` and `useGameContext`** (the raw snapshot carries the raw `PlayerView`) may be called only in `decision/**`, `state/**`, `dev/**` and `App.tsx`. The log and the last event batch reach `GameLog` and `LiveAnnouncer` through `useLog()` (§3.3).
- **Vocabulary arrays** (`SHAPES`, `GLAZES`, `DECORATIONS`, `QUALITIES`, `DISCIPLINES`, `KILN_SPACE_IDS`, `CENTRAL_LOCATION_IDS`, `PERSONAL_LOCATION_IDS`, `CONTRIBUTION_CARD_IDS`) may be used anywhere for display order. They never decide whether a choice is offered; selectors do. `KILN_IDS` still contains the disabled Ding, so Kiln choices come only from `kilnSelectionOptions`.
- **Engine content constants** (`GAME_CONFIG`, `FIRING`, `IMPERIAL_TRACK`, `LOCATIONS`, `TECHS`, `KILNS`, `ORDERS`, `ROUND_STRUCTURE`) may be imported only by `src/app/i18n/**` (names, text and placeholder numbers) and `src/app/playtest/**` (option lists through `src/playtest/schema.ts`).
- **`legalCommands`** may be called only in `src/app/dev/**` and tests.
- **TSX `style` props** may set only custom properties (`--seat`, `--glz`, …), as checked by `css_rules` (§7.3).

---

## 3. Data flow

### 3.1 `GameSource` and `SessionStore`

```ts
// src/app/session/gameSource.ts (A2; frozen after phase A)
export interface GameSnapshot {
  room: PublicRoom | null;
  seats: readonly PublicSeat[];
  seat: PublicSeat | null;
  view: PlayerView | null;                  // { viewerId, game: PublicGameState, own: PrivatePlayerView | null }
  log: readonly LogEntry[];                 // public records merged with this seat's own secret records, by sequence
  lastBatch: { revision: number; firstSequence: number; events: readonly PublicGameEvent[]; origin: "self" | "computers" | "remote" } | null;
  status: {
    sending: boolean;
    unsent: PendingSubmission | null;       // outcome unknown after a transport failure; "Send again" reuses it
    reconnecting: boolean;
    advancingComputers: boolean;
    computerFailure: { revision: number; error: StoredError; timedOut: boolean } | null;
    error: StoredError | null;              // a code plus details, formatted at render time (§6.1)
    connection: "live" | "offline";
  };
}
export interface PendingSubmission { commandId: string; expectedRevision: number; command: AuthoritativeCommand }
export type StoredError = { kind: "rule"; error: GameRuleError } | { kind: "mp"; code: MultiplayerErrorCode; details?: Record<string, unknown> };
export interface LogEntry { sequence: number; revision: number; actorId: PlayerId; event: PublicGameEvent; own?: GameEvent }
export interface GameSource {
  getSnapshot(): GameSnapshot;              // immutable, replaced on change
  getServerSnapshot(): GameSnapshot;        // the same snapshot; required by useSyncExternalStore under renderToStaticMarkup
  subscribe(listener: () => void): () => void;
  submit(command: AuthoritativeCommand): Promise<SubmitOutcome>;
  resend(): Promise<SubmitOutcome>;         // resends status.unsent with its commandId and expectedRevision
  reconnect(): Promise<void>;
  retryComputers(): void;
}
```

- **`SessionStore`** (`src/app/session/sessionStore.ts`) implements `GameSource` and the pre-game actions: `create`, `join`, `resume`, `start`, `addComputer`, `removeComputer`, `endSession`, `leave` and `forgetSeat`.
  - It wraps `createGameApi()` from `src/multiplayer/client.ts`.
  - It is plain TypeScript and is tested in node with a `FakeGameApi`.
- **`FixtureGameSource`** (`src/app/session/fixtureSource.ts`) wraps one entry of `scenarios.json` or `moments.json` (§9.1), loaded as JSON. It never builds a state.
  - `submit` runs `validateAction` (or, for a Contribution, the affordability check from `contributionOptions`) and records the command. It never changes the view.
  - SSR tests and the scenario gallery use it.

### 3.2 Receiving state

| Source | What arrives | How it merges |
| --- | --- | --- |
| `executeCommand` → `CommandSuccess` | `room`, `revision`, `game`, `events: PublicGameEvent[]`, `ownPrivateView`, `ownSecrets` | Applied only if `game.revision >= current.revision` (monotonic). `view = { viewerId: seat.playerId, game, own: ownPrivateView }`. The events take the sequences `game.eventSequence − events.length + 1 … game.eventSequence` (the store numbers public events from `eventSequence`; a session test asserts this against the in-memory service). Only sequences not already in the log enter `log` and `lastBatch`, with origin `"self"`. `ownSecrets` merge by `sequence`. |
| `advanceComputers` → `ComputerAdvanceSuccess` | as above, plus `advancedActions`, `actorIds` and `stoppedReason` | The same merge, with origin `"computers"`. |
| `subscribe(roomId, onPublicChange)` | a ping with no payload (a Realtime row change in Supabase; a 500ms timer in `TestHttpGameApi`) | A single-flight `listPublicEvents(roomId, lastSequence)`:<br>• if it returns new records, they become `lastBatch` with origin `"remote"` (deduplicated by sequence, so the viewer's own batch is never announced twice), and one `reconnect()` fetches the new head and own view;<br>• if it returns nothing, there is no reconnect, except a room-status reconnect at most every 5s during play and every 1s in the lobby, which catches seats joining and a host ending the session. |
| `reconnect` → `ReconnectResult` | room, seats, seat, `game`, `ownPrivateView` (rebuilt server-side, including the sealed Contribution), all `ownSecrets` | The same monotonic merge. A same-revision result replaces `own` and produces a new snapshot. `ownSecrets` are deduplicated by sequence. The service re-reads the seat's private history from sequence 0 on each reconnect; that is one seat's secret events (well under 200 per game), and the ping rule above keeps reconnects rare. |
| `listPublicEvents(roomId, after)` | `PublicEventRecord[]` | On resume, the log is filled once from sequence 0 (paginated). After that it is fetched only incrementally, as above. V1.4 refetched the full history on every change. |

**Privacy in the browser.** The hand, looks, peeks and own secrets live in memory only. `localStorage` holds only:

- the seat credential (`kiln-opening:v161:seat:<roomCode>`, plus `kiln-opening:v161:last-room`);
- the language and theme preferences;
- the playtest draft (`kiln-opening:playtest-draft-v3`).

Every storage call is wrapped in `try`/`catch`. The V1.4 keys `kiln-opening:last-seat` and `kiln-opening:playtest-draft-v2` are removed **only by the cutover commit** C2.1 (§10.4). During phase 4 both apps share the origin, and the V1.4 app still uses them.

### 3.3 Hook layer and `GameModel`

```ts
// src/app/state/hooks.ts (A2; frozen after phase A)
useSession(): SessionApi;                 // snapshot.room/seats/seat/status + lobby actions
useLog(): { log: readonly LogEntry[]; lastBatch: EventBatch | null };   // GameLog, LiveAnnouncer (§8.3)
useGame(): GameModel;
useModel<T>(pick: (m: GameModel) => T): T;
useEngineView(): EngineView;              // decision/**, state/**, dev/** only (§2)
useDecision(): DecisionApi;               // { window, sending, error, validate(cmd), submit(cmd), resend() }
useDraft<D>(): [D, (action: DraftAction<D>) => void];
useTableSelection(): TableSelection;      // derived synchronously from the draft store (§3.5)
useUi(): UiState & UiActions;             // board shown (D1), phone section, sheet, log open, theme
useLayoutMode(): LayoutMode;              // "desktop" | "tablet" | "phone" | "phone-landscape" (matchMedia)
// useT() is exported by i18n/I18nProvider.tsx (A3)
```

Every hook calls `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)`, so `renderToStaticMarkup` works (A2's harness test renders every hook).

```ts
interface GameModel {
  revision: number;
  viewerId: PlayerId | null;
  round: RoundNumber;
  phaseType: GamePhaseType;
  roundPhase: RoundPhaseId | "final";               // roundPhaseOf (gap 17)
  prompt: DecisionPrompt;                           // decisionPrompt(view.game)
  viewerActs: boolean;                              // viewerActs(view)
  board: TableBoardView;                            // boardView(view) without the Fire-deck count or FiringContext
  players: readonly PlayerSummary[];                // playerSummary per board.turnOrder
  me: PlayerSummary | null;
  hand: readonly OrderId[];                         // view.own.orderHand
  look: LookedOrderOptions | null;                  // lookedOrderOptions(view): the viewer's own private look only
  handLimits: Readonly<Record<PlayerId, HandLimitStatus>>;   // incl. trimDue (gap 3)
  kilnLayout: KilnLayoutView;                       // gap 5
  firingStage: FiringStageView | null;              // gap 7: the current firing
  firingRecap: FiringStageView | null;              // gap 18: the last completed firing
  finalResult: FinalResult | null;
  window: DecisionWindow;                           // decisionWindow(view), §3.4
  computerSeatIds: ReadonlySet<PlayerId>;           // from seats
  ceramics: Readonly<Record<CeramicId, CeramicState>>;   // view.game.ceramics: public, no heat value (B6, CR B1-1/B2-1/B3-1)
}
type TableBoardView = Pick<BoardView, "round" | "prompt" | "firstPlayerId" | "turnOrder" | "kilnDie" | "centralLocations" | "kilnSpaces" | "mainDisplay" | "techDisplay" | "fireDiscard">
  & { counts: Omit<PublicCounts, "fireDeck">; refillPendingFor: PlayerId | null };   // game.market.refillPendingFor (B6, CR B2-2)
interface EngineView { view: PlayerView; actor: ActorView | null }
```

- **`state/model.ts` builds `TableBoardView` by picking fields one by one.** It never spreads `boardView`, so neither the Fire-deck count nor a `FiringContext` (with its `HeatCalculation`s) reaches table, kiln, board or shell components. A type test asserts that `TableBoardView` has no `firing` key and that its `counts` has no `fireDeck`.
- **Memoisation** is keyed on the identity of `snapshot.view` (a `WeakMap`). Every merge creates a new view object, including a same-revision reconnect that replaces `own`, so the hand, look and sealed card are never stale.
- **Window-specific selectors** (`placementOptions`, quotes, `orderMatchOptions`, …) are called inside the window's draft model, memoised on the view and the draft. `placementOptions` probes `validateAction` per location and worker, so it runs once per view and only while the work window is open.

### 3.4 Decision windows

`src/app/state/decisionWindow.ts` (A2) maps the public phase to one window kind. It is an exhaustive `switch` over `GamePhaseType` and `WorkTurnStep["kind"]`, so a new engine phase fails `typecheck`. It replaces the wireframe's `decisionKind`/`phaseKind`. It routes; it decides no rule. Each window carries an `openKey` (§3.5).

| Window `kind` | Engine phase / step | Actor (from `decisionPrompt`) | Options read | Commands built | Component (owner) |
| --- | --- | --- | --- | --- | --- |
| `kiln_selection` | `setup_kiln_selection` | `selectionOrder[index]` | `kilnSelectionOptions` | `SELECT_KILN` | `decision/setup/KilnSelection.tsx` (B4) |
| `setters_mark` | `round_start_setters_mark` | queue head | `settersMarkOptions`; kiln targets via §3.5 | `PLACE_SETTERS_MARK {spaceId \| null}` | `decision/setup/SettersMark.tsx` (B4) |
| `work` (`before_action`) | `work_turn` / `before_action` | active player | `placementOptions`, the location sub-editors (below), `canalBargeOptions`, `imperialPriorityOptions` | `PLACE_*`, `USE_CANAL_BARGE`, `USE_IMPERIAL_PRIORITY` | `decision/work/WorkTurn.tsx` (B4) |
| `commission` | `work_turn` / `commission_market` (`awaiting`: `reservation` \| `look_choice` \| `resource`) | active | `commissionOptions(view, step.effect)`, `lookedOrderOptions`, `counts.pendingLook` | `COMMISSION_RESERVE`, `COMMISSION_STOP`, `COMMISSION_CHOOSE_LOOKED`, `COMMISSION_GAIN` | `decision/work/CommissionStep.tsx` (B4) |
| `guild_inspection` | `work_turn` / `guild_inspection` | active | `guildInspectionOptions` (private) | `GUILD_TAKE {take, bottomOrder}` | `decision/work/GuildInspection.tsx` (B4) |
| `colour_samples` | `work_turn` / `colour_samples` | active | `lookedOrderOptions` (kind `colour_samples`) | `COLOUR_SAMPLES_CHOOSE` | `decision/work/ColourSamples.tsx` (B4) |
| `work` (`after_action`) | `work_turn` / `after_action` | active | `canalBargeOptions`, `imperialPriorityOptions` | `USE_CANAL_BARGE`, `USE_IMPERIAL_PRIORITY`, `END_TURN` | `decision/work/ActionWindow.tsx` (B4) |
| `contributions` | `firing_contributions` (`simultaneous_secret`) | eligible minus submitted | `contributionOptions` (with Fuel Ledger), `own.pendingContribution`, `phase.submittedPlayerIds` | `SUBMIT_CONTRIBUTION` | `decision/firing/Contributions.tsx` (B5) |
| `test_pieces` | `firing_test_pieces` (`awaiting`: `decision` \| `bury`) | queue head | `testPiecesOptions` (`peekedModifier` from `own.firePeek`, private) | `TEST_PIECES_DECIDE`, `TEST_PIECES_BURY` | `decision/firing/TestPieces.tsx` (B5) |
| `heat_markers` | `firing_heat_markers` | queue head | `heatMarkerStepOptions` (own marker, Kiln Master `targets` / `targetsIfOwnReturned`) | `RESOLVE_HEAT_MARKERS` | `decision/firing/HeatMarkers.tsx` (B5) |
| `jun` | `firing_heat_adjustment`, and `firing_second_firing_jun` (R7) | queue head / `actorId` | `junOptions` (`during`); in R7, `firingStage.extraFire` shows the extra Fire card just turned (gap 7) | `RESOLVE_JUN` | `decision/firing/Jun.tsx` (B5) |
| `after_quality` | `firing_after_quality` | queue head | `afterQualityOptions`, re-read every revision (eligibility rechecked after each use) | `USE_PROTECTIVE_SAGGARS`, `USE_SECOND_FIRING`, `USE_GE_CRACKLE`, `END_AFTER_QUALITY` | `decision/firing/AfterQuality.tsx` (B5) |
| `salvage` | `firing_salvage` (`parallel`) | `pendingPlayerIds` | `salvageOptions` | `SALVAGE_FLAWED` | `decision/firing/Salvage.tsx` (B5) |
| `orders` | `orders` | `turnOrder[index]` | `completableOrders`, `orderMatchOptions`, `orderSelectionCheck`, `crackleDeclarationChecks` (§5) | `COMPLETE_ORDER` (with Ru/Guan/Tribute Ware decline flags from `triggers`), `END_ORDER_TURN` | `decision/orders/OrderTurn.tsx` (B5) |
| `hand_limit` | `cleanup_hand_limit` (`parallel`) | `pendingPlayerIds` | `handLimitStatus`, `own.orderHand` | `DISCARD_TO_HAND_LIMIT` | `decision/cleanup/HandTrim.tsx` (B5) |
| `final` | `finished` | — | `game.finalResult`, `SCORE_BREAKDOWN_ROWS`, `TIE_BREAK_ORDER` (§5) | — | `decision/results/FinalSummary.tsx` (B5) |
| `waiting` | any phase whose prompt does not include the viewer | — | `decisionPrompt`, phase, own sealed Contribution | — | `decision/Waiting.tsx` (B5) |

**Work sub-editors** (B4, `decision/work/locations/*`). Each is a `.tsx` + `.draft.ts` pair and ports the matching branch of the wireframe's `subEditor`. The pane has no worker or location picker (owner decision D14): the worker and the location are chosen with the Place shortcuts on the table (`placeTargets`, §3.5), one per entry of `placementOptions()[i].workers` (Shifu, Apprentice, and Apprentice-as-Shifu when `seniorApprentice`), and a location card shows the engine's reason where a worker cannot go. Until a placement is chosen the work turn hides the pane (`WindowSpec.pane`, §3.5 and §8.2). Every Shape, Glaze, modifier and Prepared Clay choice comes from a selector; the vocabulary arrays only order them.

| Location / ability | Draft | Selectors | Command |
| --- | --- | --- | --- |
| Materials Yard | Clay/Wood split, Shifu bonus, Prepared Clay (Shape, Decoration) | `materialsYardOptions(view, worker)` (gap 14: resources, bonus, Prepared Clay offer or `null`), `quoteMaterialsYard(actor, draft)` | `PLACE_MATERIALS_YARD` |
| Form & Decorate | 1–2 vessels (Shape × Decoration), Large Throwing Wheel or Decorator's Kit toggle, Ding extra | `placementLimits` (gap 10), `quoteFormDecorate(actor, draft)` live per draft (gap 6), `formDiscountVariants`, `dingCopyableVesselIndexes` | `PLACE_FORM_DECORATE` |
| Glaze & Load | 1–2 ordered loads, each: vessel, Glaze, Reworking Table Shape, destination (Shared space with `invertedFiring` / `kilnFurniture`, or Imperial with modifier); Heat-marker target | `glazeLoadVesselOptions(view, pid, earlierLoads)` (gap 15: Glazes and rework Shapes per vessel), `loadDestinationOptions(view, pid, ceramicId, earlierLoads, reworkShape)` (each option carries `modifier`, `requiresInvertedFiring` and `returnsSettersMark`), `heatMarkerTargets(view, pid, pendingLoads)` | `PLACE_GLAZE_LOAD` |
| Commission Market | first reservation: face-up slot + gain, blind, or look at the top 3; Senior Apprentice | `commissionOptions(view, effect)` | `PLACE_COMMISSION_MARKET` |
| Guild Hall | Apprentice: a face-up Tech; Shifu: a discipline to inspect | `guildOptions(view, effect)` (prices and reasons) | `PLACE_GUILD_HALL` |
| Canal Wharf | — | `placementLimits` (Coins shown from it) | `PLACE_CANAL_WHARF` |
| Magistrate's Hall | — | `magistratesHallQuote(view, effect)` (`reachable`, error details) | `PLACE_MAGISTRATES_HALL` |
| Imperial Priority (before or after the action) | vessel, Glaze, Imperial modifier, Reworking Table Shape | `imperialPriorityOptions(view).ceramics` (gap 16) | `USE_IMPERIAL_PRIORITY` |
| Canal Barge (before or after the action) | Order, ceramics, Crackle declarations | `canalBargeOptions`, `crackleDeclarationChecks`; draft and picker owned by B5 (§4.3) | `USE_CANAL_BARGE` |

### 3.5 Drafts, the draft store and table selection

**Draft models.** Every window has a `*.draft.ts`:

```ts
interface DraftModel<D> {
  initial(model: GameModel, engine: EngineView): D;           // no choice pre-selected unless only one exists
  reduce(draft: D, action: DraftAction<D> | { type: "revalidate" }, model: GameModel, engine: EngineView): D;
  options(draft: D, model: GameModel, engine: EngineView): DraftOptions<D>;   // every list the form renders, with reasons
  build(draft: D, model: GameModel, engine: EngineView): AuthoritativeCommand | null;  // null = incomplete
  fromCommand(command: AuthoritativeCommand, model: GameModel, engine: EngineView): D | null;  // the expressibility test (§9.4)
  summary(draft: D, model: GameModel, engine: EngineView): RichMessage;    // the ConfirmBar sentence (workSummary), via t.rich
}
```

The component renders only from `options()`. It never filters, sums or checks a choice itself. `reduce` with `revalidate` drops any choice the new options no longer offer.

**Draft store** (`src/app/state/draftStore.ts`, A2; frozen). It holds the active window's draft outside React.

- **Reset to `initial`:** when the window's `kind` or actor changes, when its `openKey` changes, or when this client's own command succeeds.
  - `openKey` is the Contribution `windowId`; `openedAtRevision` for Salvage and the hand trim; the queue index for queued firing steps; the selection index for Kiln selection; and, for the work turn, the turn's start revision.
- **Kept and revalidated:** after other players' commits, reconnects and `STALE_REVISION` recovery, the draft is kept and passed through `reduce(draft, { type: "revalidate" })`. A half-made Contribution or trim therefore survives another player's submission.
- **The work turn keeps one sub-draft per location** (`perLocation`). Pressing another location's Place shortcut never discards a sub-editor's choices.

**Table selection** (`src/app/state/tableSelection.ts`, A2; frozen) is derived synchronously, without an effect. Each registry entry in `decision/windows.ts` may declare a `table` adapter:

```ts
interface WindowSpec<D> {
  kind: DecisionWindowKind;
  Component: ComponentType;                 // reads useDraft / useEngineView
  draft: DraftModel<D>;
  title(model: GameModel, engine: EngineView, draft: D): WindowText;                    // pane heading, sheet strip
  table?: {
    select(draft: D, model: GameModel, engine: EngineView): TableSelectionData;          // pure
    act(draft: D, action: TableAction, model: GameModel, engine: EngineView): DraftAction<D> | null;
  };
  pane?(draft: D, model: GameModel, engine: EngineView): PanePresence<DraftAction<D>>;  // without it, always shown
}
type PanePresence<A> =
  | { hidden: false }
  | { hidden: true; lead: WindowText; openersLabel: WindowText | null; openers: { key: string; label: WindowText; action: A }[] };
interface TableSelectionData {
  placeTargets: ReadonlyMap<LocationId, readonly PlacementWorkerOption[]>;   // every entry, legal or not; Place shortcuts for legal ones, the engine's reason otherwise (B6, CR B2-3)
  activePlacement: { locationId: LocationId; workerKey: string } | null;
  kilnTargets: ReadonlyMap<KilnSpaceId, { pressed: boolean }>;                // G&L destination, Setter's Mark space
  pendingCeramics: readonly { ceramicId: CeramicId; glaze: Glaze; at: KilnSpaceId | "imperial" }[];
  orderTargets: ReadonlyMap<string, { state: "choosable" | "chosen" | "completable" | "blocked" | "discard"; disabled: boolean }>;  // OrderId or `slot:<i>`
  highlightedCeramicIds: ReadonlySet<CeramicId>;                              // Order group, ability target
}
type TableAction = { type: "place"; locationId: LocationId; workerKey: string } | { type: "kilnSpace"; spaceId: KilnSpaceId } | { type: "order"; key: string };
```

`useTableSelection()` returns `spec.table.select(currentDraft, model, engine)`, or the inert value (empty maps) when there is no adapter. Its handlers dispatch `spec.table.act(...)` into the draft store. Location Place buttons, kiln-space targets and clickable Order cards therefore change the pane's draft without either side importing the other (wireframe `draftTargets`, `data-act="place"`, `data-act="dest"`). Because the selection is a pure function of the draft, an SSR test seeds a draft and sees the targets.

**Pane presence** (owner decision D14, owner review 2026-10-17). `usePane()` (`state/pane.ts`) reads `spec.pane(currentDraft, model, engine)` the way `useTableSelection()` reads the adapter, so the shell, the pane and the bar above the world agree in one render. Only the work window has a `pane` member (`workPane` in `windows.work.ts`): it hides the pane during the viewer's own before-action step while the draft has no placement and no ability open. The hidden presence carries the bar's turn cue (`lead`: "Your turn: place a worker · 3 left") and one opener per ability that may come before the worker action (`openers`, after `openersLabel`: "Or first:"), each a draft action that brings the pane back. A pending server error keeps the pane shown. Focus and layout rules: §8.2 and §7.3.

### 3.6 Sending a command

1. The form's `build(draft)` returns a command.
2. ConfirmBar calls `validateAction(engine.actor, command)`. For a Contribution, it checks `contributionOptions[i].affordable`.
   - On an error, Confirm is disabled and `formatRuleError(error, locale, { playerName })` is shown inline.
3. `submit(command)`:
   - records a `PendingSubmission { commandId: crypto.randomUUID(), expectedRevision: game.revision, command }`;
   - sets `status.sending`;
   - makes only the form-fields region (`.pane-scroll`) `inert`. ConfirmBar stays outside the inert subtree with `aria-disabled="true"` and `aria-busy="true"`, its handler ignores a second submit, and focus stays on it (§8.2).
4. **Outcomes:**

   | Outcome | Handling |
   | --- | --- |
   | Success | Clear the pending submission; merge (§3.2); reset the draft (own success); move focus as in §8.2. |
   | Rule rejection (`GameRuleError`) | Clear the pending submission; show it through `formatRuleError`. |
   | `STALE_REVISION` | Clear it: the service replays a committed `commandId` before it checks the revision, so a stale answer means nothing was committed. Reconnect; the draft is revalidated, not reset. |
   | `SESSION_ENDED` | Route to the ended screen. |
   | `DUPLICATE_COMMAND` (the ID belongs to another seat) | Retry once with a new ID. |
   | Transport failure (network error, abort, timeout, `SERVICE_UNAVAILABLE`, `INTERNAL_SERVER_ERROR`) | **Keep** the pending submission as `status.unsent`, reconnect, and offer **Send again** in the ConnectionBanner. It resends the same `commandId` and `expectedRevision`; if the first attempt had committed, the service returns the stored response, which is a success. |

There is **no optimistic state**. The only client-held state is drafts, UI preferences and the pending submission. The `legalCommands` canonical list is never a menu in the UI; it is the oracle of the expressibility test (§9.4).

### 3.7 Simultaneous and parallel windows

- **Contributions** (`simultaneous_secret`).
  - The actor set is the eligible players minus those who have submitted. After the viewer submits, `own.pendingContribution` shows their own sealed card ("Sealed: Stoke · only you").
  - Everyone else sees only `phase.submittedPlayerIds` (wireframe `submitRow`).
  - On reconnect, the server rebuilds the sealed card.
  - `CONTRIBUTION_SUBMITTED` never carries a card, and the log template must not invent one.
- **Salvage and hand trim** (`parallel`). Several players act in any order. The client sends its current `revision`; the service accepts any revision since `openedAtRevision` (ONLINE_GAME_SPEC "Revision races"). The draft is kept across other players' commits (§3.5). The service side is covered by `test/v161/platform/parallel_windows.test.ts`. The client side is covered by the session tests (§9.2).
- In every mode, computers are advanced whenever any actor is a computer (§3.8). A human and a computer may therefore act at the same time.

### 3.8 Computer seats

- After every merge, `SessionStore` calls `shouldAdvanceComputers(game, seats)` from `client.ts`. It routes on `decisionPrompt(game).actorIds`, never on a phase rule.
- **Host first.** The host's client starts the advance loop at once. Any other client starts it only if the same computer-actor revision is still current after 2s, which covers a host who has left. This keeps races rare without stalling the table.
- **Single-flight loop**, ported from V1.4 `App.tsx` `advanceComputerTurns`, with an `AbortController` and a 20s timeout. Outcomes:

  | Outcome | Handling |
  | --- | --- |
  | Success | Merge with origin `"computers"`. |
  | `STALE_REVISION`, `PERSISTENCE_CONFLICT` or `DUPLICATE_COMMAND` | Another client won the race. Reconnect, with no latch and no banner. |
  | `COMPUTER_TURN_FAILED`, a timeout or a transport error | Latch the failure for that revision. The ConnectionBanner shows **Retry computer turn** (`role="alert"`). |

- **Display:**
  - an acting computer's seat chip shows the acting state and a "computer" badge;
  - `lastBatch.origin = "computers"` feeds the live region ("Zhao and Su took 6 actions") and the log;
  - phase 5 will animate the batch; phase 4 shows its end state.
- The lobby shows "Computer player". The raw `aiPolicyVersion` appears only in the seat's details. The client never imports the policy module (§2).

### 3.9 Reconnect, saved seats and the local backend

- **Resume.** On load, a saved seat for the last room is reconnected automatically.
  - On `ROOM_NOT_FOUND`, `AUTHENTICATION_FAILED`, `UNSUPPORTED_RULES_VERSION` or `RULES_FINGERPRINT_MISMATCH`, the seat is forgotten and the message is shown. The last two can never be played by this client.
  - On `visibilitychange` to visible, the store reconnects (single-flight). Pings follow §3.2.
  - Seat and state never change on reconnect (platform `reconnect.test.ts`). The UI test asserts that an equal `GameModel` results.
- **`tools/localBackendV161.ts`** (A2; B6 after phase A). It is a port of `tools/localBackend.ts`, which imports `../src/multiplayer-v14`. It imports `AuthoritativeGameService` and `InMemoryMultiplayerStore` from `../src/multiplayer/index.ts`, and adds:
  - `list_private_events`, which the V1.6.1 `TestHttpGameApi` calls and the V1.4 backend lacks;
  - `e2e_reset { seed, policy?: "strategic" | "canonical" }`;
  - `e2e_secret_ids { roomCode, viewerSeat }` (phase B, B6): the Order and Tech IDs this viewer must not see (other hands, other seats' looks, decks), minus IDs a public event revealed. It uses A1's `tools/fixturePrivacy.ts` and feeds the leak checks of `full_game.spec` (§9.6);
  - `checkInvariants: true` on the service;
  - deterministic `BrowserTestSecurity`.

  It mounts through both `configureServer` and `configurePreviewServer`, so `vite preview` of an e2e build works (§9.6). Like today, it is mounted only when `VITE_E2E_LOCAL_BACKEND=1`.
- **Mounting.** The backend is mounted at `/test-api-v161`, beside the V1.4 `/test-api`, so both UIs stay playable locally throughout phase 4.
  - `createGameApi(options?: { localEndpoint?: string })` gains one option, used by `TestHttpGameApi`. The default stays `/test-api`.
  - At cutover, the V1.6.1 backend moves to `/test-api` and the option is removed.
- **Typechecking `tools/`.** `tools/` is currently in no tsconfig. `tsconfig.platform.json` gains `tools/localBackendV161.ts`, `tools/uiFixtures.ts` and `tools/fixturePrivacy.ts`. `test/v161/platform/tsconfig_includes.test.ts` (A2) fails if any `include` entry of any tsconfig matches no file, because tsc skips such entries silently.

---

## 4. Component tree and file layout

### 4.1 Tree

```
App                                   app/App.tsx: home | lobby | ended | game (from useSession)
├─ HomeScreen / LobbyScreen / EndedScreen / EndSessionDialog / RoomBar       lobby/*
└─ GameScreen                         screens/GameScreen.tsx (composition, frozen)
   └─ GameShell                       shell/GameShell.tsx: grid "top top" / "banner banner" / "jump pane" / "world pane"
      │                               (+ "nav" on phones); data-pane="hidden" drops the pane's cell and adds the "bar" row
      ├─ SkipLink                     "Skip to your decision": opens the phone sheet first, then focuses the pane heading;
      │                               while the pane is hidden, the bar's turn cue (with openers) or the table
      ├─ TopBar <header>              brand · round · PhaseStrip · KilnDieChip · SeatChips · GameLog · LanguageToggle · SessionMenu
      │  ├─ PhaseStrip                5 round phases + firing step suffix (topBar `phases`), from roundPhaseOf
      │  ├─ KilnDieChip               game.kilnDie.value (topBar `die-chip`)
      │  ├─ SeatChips                 D2 opponent strips: swatch, first-player, name, kiln short name, VP (recordedVp, the
      │  │                            final total once finished), Clay/Wood/Coins, hand-count card back, acting badge
      │  │                            (a computer seat in the name only, D12); click → board (D1); in the jump bar on
      │  │                            desktop and tablet
      │  ├─ GameLog (dropdown)        D5 at every width; newest first; the newest 50, then "Show earlier" (logList, evText)
      │  ├─ LanguageToggle            always visible
      │  └─ SessionMenu               menu button: Theme · room code (copy) · Leave view · End session (host only)
      ├─ ConnectionBanner             role="status": reconnecting / offline; role="alert": computer failure + Retry,
      │                               unsent command + Send again
      ├─ PaneOpeners                  decision/PaneOpeners.tsx, only while the pane is hidden (D14): a region named "Your
      │                               decision" with the turn cue ("Your turn: place a worker · 3 left") and "Or first:"
      │                               openers for the abilities that may come before the worker action
      ├─ JumpNav <nav>                desktop and tablet: section buttons + seat chips, a row of its own above the world
      │                               (not part of its scroll area; owner review 2026-10-17, item 3)
      ├─ TurnToasts                   the other players' turns, one at a time (D17), at the right end under the jump bar
      │                               (across the world column on phones and in short landscape): at the top of the
      │                               world's cell, in a band the world gives up and scrolls by, so it lies over nothing
      │                               (shell/toastRoom.ts: what a closing toast gives back at the world's top stays empty
      │                               until scrolled past, a short section gets room below to scroll, a scroll under way
      │                               is never stopped, a control with the keyboard focus ring is never scrolled out of
      │                               view); every turn the viewer was there for, in turn order, even when its entries
      │                               come late
      ├─ World <main>                 WorldSections: sectionOrder per phase
      │  ├─ FiringSection             firing/FiringStage (D3, takes over the column during the Firing Phase)
      │  │  ├─ StepRail · QueueRow / SubmittedRow
      │  │  ├─ HeatEquation           Kiln Die + Contributions = Base Heat; Base Heat + Fire = Global Heat;
      │  │  │                         the R7 extra Fire card beside its ceramic
      │  │  ├─ KilnBlock              SharedKiln + ImperialKilns (static)
      │  │  └─ FireDiscard            the only Fire-deck information (D4)
      │  ├─ ResultsSection            results/ResultsSection: podium, score table, tie-breaks
      │  ├─ TableSection              KilnMini (outside firing) + CentralBoard (5 LocationCards + Place)
      │  ├─ OrdersSection             LookedOrders ("only you") · OrderDisplay (pending empty slots) · HandRow
      │  │                            (completable / discard states; no "Only you can see" pill, D19) · FinishedCeramicsStrip
      │  │                            (Order Phase); the seat chips give every hand count (D18)
      │  ├─ ProgressSection           RecognitionTrack · TechDisplay
      │  ├─ KilnSection               IdleFiringRecap (firingRecapView) + KilnBlock (SharedKiln, ImperialKilns)
      │  └─ WorkshopsSection          BoardArea (D1): tabs + PlayerBoard
      │     └─ PlayerBoard            kiln tradition · resources · workers · hand · PersonalSpaces (D7)
      │                               · TechSlots (name, state this round, short text; no rules details, D19)
      │                               · CeramicsRow · marker line · completed Orders
      ├─ DecisionPane <aside>         decision/DecisionPane.tsx (frame, frozen):
      │  │                            <h2> · OwnSummary · <form> [ .pane-scroll: <Window> fields ] · ConfirmBar </form>;
      │  │                            hidden (markup kept) during the work turn until a placement is chosen (D14)
      │  └─ <Window>                  per §3.4 registry
      ├─ PhoneNav <nav>               Table / Kiln / Workshop / Orders (D5) buttons with aria-current, badges
      └─ LiveAnnouncer                one polite region (coalesced) + one alert region
```

**Top bar at phone width (≤899px).** There are two rows:

1. round number · current phase (number and short label) · Kiln Die · Log · `EN`/`中文` · menu (`⋯`);
2. the seat chips, which scroll inside their own row.

The brand is dropped, as in the wireframe. At 900px and above there is one row, as in the wireframe `topBar`. The ConnectionBanner spans the full width under the top bar and takes no space when empty.

### 4.2 Files and owners

Every path is under `src/app/` unless stated. A component's CSS sits beside it (`X.tsx` + `X.css`) and has the same owner. "Wireframe source" names the function whose behaviour the file ports. Each file is **created** by exactly one agent: A1 and A3 create theirs, and A2 creates every other file, as a stub where a phase B agent owns it.

**Entry, session and state (created by A2; owned by A2 in phase A, then by B6; frozen otherwise)**

| File | Purpose |
| --- | --- |
| `main.tsx`, `App.tsx`, `theme.ts` (`applyTheme`, §7.1) | entry; screen switch by session state |
| `session/gameSource.ts`, `sessionStore.ts`, `fixtureSource.ts`, `savedSeat.ts`, `computerAdvance.ts`, `eventLog.ts` | §3.1–3.9 |
| `state/hooks.ts`, `model.ts`, `decisionWindow.ts`, `draftStore.ts`, `tableSelection.ts`, `uiStore.ts`, `layoutMode.ts` | §3.3–3.5. `uiStore` ports the wireframe's `resetApp` section and sheet defaults, `A.board`, and the viewport-dependent click behaviours (§8.1). |
| `screens/GameScreen.tsx`, `screens/Placeholder.tsx` | composition only; renders the section, pane and nav components by fixed import paths |
| `decision/DecisionPane.tsx`, `decision/windows.ts` (registry of `WindowSpec`s from the slices), `decision/OwnSummary.tsx`, `decision/ConfirmBar.tsx` | wireframe `pane`, `ownSummary`, `confirm` block, `stripText` |
| `motion/timeline.ts` | `PresentationTimeline` interface; phase 4 `ImmediateTimeline` (§8.4) |
| `dev/ScenarioGallery.tsx`, `dev/gallery-main.tsx` (discovers `dev/*.gallery.tsx` via `import.meta.glob`), `dev/CanonicalMoveButton.tsx` (removed in C1), `dev/DevSessionPanel.tsx` (the phase A lobby driver inside the lobby stubs; gated like the canonical-move button, so a production build drops it; removed in C1 at the latest) | §9.5 |

**Design system and i18n core (created and owned by A3 in phase A, then by B6)**

| File | Purpose |
| --- | --- |
| `styles/index.css` (layer order), `tokens.css`, `reset.css`, `base.css`, `utilities.css` | §7 |
| `kit/OptionCard.tsx`, `OptionGroup.tsx` (fieldset), `Stepper.tsx`, `Disclosure.tsx`, `Tabs.tsx` (roving tabindex), `Sheet.tsx`, `Chip.tsx`, `Button.tsx`, `MenuButton.tsx`, `ReorderList.tsx` (Move up/down), `PieceDetail.tsx`, `LanguageToggle.tsx`, `ThemeToggle.tsx` | wireframe `.opt`, `.pill`, `.stepper`, `details`, `.btab`, `.sheet-strip`, `.chip`, `.btn` |
| `pieces/CeramicArt.tsx`, `CeramicChip.tsx`, `WorkerPiece.tsx`, `HeatMarkerBadge.tsx`, `FireCard.tsx`, `KilnDie.tsx`, `CardBack.tsx`, `CrownIcon.tsx`, `QualityChip.tsx`, `ResourceRow.tsx`, `pieces/art.ts` (Vite asset imports, `ArtResolver` context) | `cerArt`, `cchip`, `wk`, `markerBadge`, `fireCard`, `.die`, `.cardback`, `CROWN`, `.chip.q-*`, `resRow` |
| `i18n/I18nProvider.tsx` (incl. `useT`), `translator.ts`, `richText.tsx`, `defineNamespace.ts`, `index.ts` (imports every namespace) | §6.1 |
| `i18n/format.ts`, `content.ts`, `errors.ts`, `orderText.ts`, `catalog/common.ts`, `catalog/locationSummary.ts`, `catalog/mp.ts`, and **empty stubs** `catalog/{shell,lobby,table,boards,kiln,results,playtest,work,firing,orders}.ts` | §6.2–6.4 |
| `dev/kit.gallery.tsx` | every kit control and piece, light and dark |
| `test/v161/support/glossary.ts` (moved out of `test/v161/engine/localization_content.test.ts`, which A3 edits to import it) | shared glossary checker |

**Shell, log and lobby (B1)**

| File | Wireframe source |
| --- | --- |
| `shell/GameShell.tsx`, `SkipLink.tsx`, `TopBar.tsx`, `PhaseStrip.tsx`, `KilnDieChip.tsx`, `SeatChips.tsx` | `topBar` (`phases`, `die-chip`, `chain`) |
| `shell/SessionMenu.tsx`, `shell/ConnectionBanner.tsx` | V1.4 `App.tsx` session controls; §3.6, §3.8 |
| `shell/GameLog.tsx`, `shell/logCeramics.ts` (the ceramics the log, the announcements and the turn toasts put into words, D9) | `logbtn` / `logpanel`, `logList` |
| `shell/WorldSections.tsx`, `shell/JumpNav.tsx` | `sectionOrder`, `SEC_TAB`, `jump`, `jumpTo` |
| `shell/PhoneNav.tsx` | `tabBar`, `badges`, `ICONS` |
| `shell/LiveAnnouncer.tsx`, `shell/announce.ts`, `shell/focusRescue.ts` | `announcement`; §8.2–8.3 |
| `shell/TurnToasts.tsx`, `shell/turnToasts.ts` (the turn queue), `shell/toastRoom.ts` (the band the world gives up) | none: owner decision D17 (owner reviews of 2026-10-17) |
| `i18n/catalog/shell.ts`, `i18n/events.ts` | `UI` keys for the top bar and log; `evText` |
| `lobby/HomeScreen.tsx`, `LobbyScreen.tsx`, `EndedScreen.tsx`, `EndSessionDialog.tsx` (native `<dialog>`), `RoomBar.tsx`, `i18n/catalog/lobby.ts` | V1.4 `App.tsx` screens |

**Table and boards (B2)**

| File | Wireframe source | Selectors |
| --- | --- | --- |
| `table/CentralBoard.tsx`, `table/LocationCard.tsx` | `centralBoard`, `locCard`, `reasonFor` | `board.centralLocations`, `useTableSelection().placeTargets`, `formatRuleError` |
| `table/KilnMini.tsx` | `kilnMini` | `kilnLayout`, `board.kilnDie`, `board.fireDiscard` |
| `table/OrderDisplay.tsx`, `table/OrderCard.tsx` | `displayRow`, `orderCard` | `board.mainDisplay`, `game.market.refillPendingFor`, `board.counts.mainDeck` / `mainDiscard` |
| `table/LookedOrders.tsx` | `secOrders` look branch | `model.look` (own look only), `orderTargets` |
| `table/HandRow.tsx` (`table/PublicHands.tsx` was removed by D18) | `handRow`, `handsPublic`, `secOrders` orders/trim branches | `model.hand`, `handLimits` (`trimDue`), `orderTargets` (completable, chosen, discard), `counts.orderHands`, `counts.pendingLook` |
| `table/FinishedCeramicsStrip.tsx` | `secOrders` orders branch | `me.finishedCeramicIds`, `highlightedCeramicIds`; the note that face-up Orders cannot be completed |
| `table/TechDisplay.tsx`, `table/TechCard.tsx` | `techDisplay`, `techCard` | `board.techDisplay` |
| `table/RecognitionTrack.tsx` | `recognitionTrack` | `players[].recognition`, `i18n/content` milestones |
| `boards/BoardArea.tsx` | `boardArea` (D1 tabs + Your workshop) | `players`, `useUi().boardShown` |
| `boards/PlayerBoard.tsx`, `PersonalSpaces.tsx`, `TechSlots.tsx`, `CeramicsRow.tsx`, `WorkersRow.tsx`, `KilnTradition.tsx` | `boardFull`, `personalSpaces`, `techSlots`, `ceramicsRow`, `workersRow`, `kilnTrad`, `hmLine` | `playerSummary` (incl. `personalSpaces[].addedByTechId`, §5) |
| `i18n/catalog/table.ts`, `i18n/catalog/boards.ts` | | |

**Kiln, firing stage, results section and playtest form (B3)**

| File | Wireframe source | Selectors |
| --- | --- | --- |
| `kiln/SharedKiln.tsx`, `kiln/KilnSpace.tsx` | `sharedKiln` (rows top to bottom **Low (2, centred under the dome), Middle, High beside the firebox** per owner decision D8; covered spaces, stacks, Setter's Mark, Kiln Furniture, markers, pending chips, target buttons) | `board.kilnSpaces`, `kilnLayout`, `firingStage.ceramics` (Quality, Crackle), `useTableSelection()` |
| `kiln/ImperialKilns.tsx` | `imperialTiles` | `players[].imperial` |
| `kiln/KilnBlock.tsx`, `kiln/IdleFiringRecap.tsx` | `kilnBlock`, `idleStage` | `firingRecap` (gap 18) |
| `firing/FiringStage.tsx`, `StepRail.tsx`, `HeatEquation.tsx`, `FireDiscard.tsx`, `QueueRow.tsx` | `firingStage`, `stepper`, `equation`, `fireDiscardHtml`, `queueRow`, `submitRow` | `firingStage` (gap 7) only |
| `results/ResultsSection.tsx` | `results` | `finalResult`, `SCORE_BREAKDOWN_ROWS`, `TIE_BREAK_ORDER` |
| `playtest/main.tsx`, `PlaytestFormPage.tsx`, `sections/{Meta,Players,Rounds,Feedback,Submit}.tsx` | V1.4 `PlaytestFormPage.tsx` | `src/playtest` Form V3 |
| `i18n/catalog/kiln.ts`, `results.ts`, `playtest.ts` | | |

**Work and setup decisions (B4):**

- `decision/setup/*`;
- `decision/work/WorkTurn.tsx`, `workDraft.ts` (`WorkerPicker.tsx` was removed by D14: workers are placed on the table), `ActionWindow.tsx` (composes Imperial Priority and B5's Canal Barge form, before and after the action), `ImperialPriority.{tsx,draft.ts}`, `CommissionStep.tsx`, `GuildInspection.tsx` (take plus a `ReorderList` bottom order), `ColourSamples.tsx`;
- `decision/work/locations/{MaterialsYard,FormDecorate,GlazeLoad,CommissionMarket,GuildHall,CanalWharf,MagistratesHall}.{tsx,draft.ts}`;
- `decision/work/windows.work.ts` (its slice of the registry);
- `i18n/catalog/work.ts`.

Wireframe sources: `decWork`, `subEditor`, `deltaRow`, `workSummary`, `decLook`.

**Firing, Order, Cleanup and Results decisions (B5):**

- `decision/firing/*`;
- `decision/orders/OrderTurn.tsx`, `orderDraft.ts`, `OrderCompletionPicker.tsx`, `CrackleDeclarations.tsx`, `CanalBarge.tsx`, `canalBargeDraft.ts` (composed by B4's `ActionWindow`, §4.3);
- `decision/cleanup/HandTrim.tsx`;
- `decision/results/FinalSummary.tsx`;
- `decision/Waiting.tsx`;
- `decision/windows.firing.ts`;
- `i18n/catalog/{firing,orders}.ts`.

Wireframe sources: `decContrib`, `decHeatMarker`, `decAfterQuality`, `decOrders`, `decTrim`, `decFinal`, `decWait`.

**Contracts and integration (B6):** every frozen file of §4.3 after phase A; `tools/localBackendV161.ts`; the gallery; `test/v161/ui/{rendered_text,expressibility_complete,form_driver_games}.test.ts`; `e2e/{gallery,full_game,two_humans,keyboard_focus}.spec.ts` and `e2e/support/*`; the CI workflow (§9.6) and its local equivalent `tools/ci-ui-local.sh` (`npm run ci:ui`). Added in phase B through change requests:

- `rules/RulesDetail.{tsx,css}` and `i18n/catalog/rules.ts`: the one rules-details panel of D10/K15 (`RulesDetail`, `ShortText`, `OrderReward`, `LocationSummaries`) over the content accessors in `i18n/content.ts` (`rulesClarifications`, `techFacts`, `kilnFacts`, `orderFacts`, `locationFacts`, `overflowClarifications`). It replaced four package copies (B2–B5);
- `rules/rulebookSections.ts`: the V1.6.1 rulebook's section headings by line (EN source and the line-aligned Chinese rulebook), so a clarification's rulebook source (`L140`, `ED L652`) is shown as the section a player can find ("Rulebook “Materials Yard”" / "规则书「泥柴场」"), never as a line number; `test/v161/ui/rules/rulebook_sections.test.ts` derives it again from both files;
- `decision/composition.tsx`: the Canal Barge composition seam (§4.3 rule 3);
- `state/pane.ts` (`usePane`, the focus moves `focusTable` and `focusHiddenDecision`) and `decision/PaneOpeners.{tsx,css}`: the hidden pane of D14 (owner review 2026-10-17, item 2), with `WindowSpec.pane` in `state/draftStore.ts` and `workPane` in `decision/work/windows.work.ts` (§3.5).

**Tests** live under `test/v161/ui/<area>/` and are owned by the area's owner. `test/v161/ui/support/*` (render harness, fixture loader, expressibility helper) is created by A2 and owned by B6 after phase A.

### 4.3 Shared-file rules

1. **One creator per file.** A1 and A3 create their own files, including A3's empty catalogue stubs. A2 creates every other file in §4.2 that is not A1's or A3's:
   - a component stub renders `<Placeholder name="…" />` with its final export name and props (most components take no props and read hooks);
   - a draft-model stub exports `stubDraft()`, whose `fromCommand` returns `null`, so the expressibility helper reports that window as `todo` (§9.4).

   `GameScreen`, the `WorldSections` imports and `decision/windows.ts` therefore never change in phase B.
2. **Frozen contracts:**
   - `state/*`, `session/gameSource.ts`, `decision/DecisionPane.tsx`, `decision/windows.ts`, `decision/composition.tsx`, `screens/*`, `rules/*`;
   - `kit/*`, `styles/tokens.css`, `i18n/index.ts`, `i18n/translator.ts`, `i18n/richText.tsx`;
   - `src/game/**`, `package.json`, `vite.config.ts`, `tsconfig*.json`, `tools/*`, `test/v161/ui/fixtures/*`, `test/v161/ui/support/*`.

   In phase B these change only through **B6**. A request is a short note, in the requesting agent's commit or PR, describing the signature it needs. B6 lands it as its own green commit.
3. **Cross-package use goes through a stub created in phase A.**
   - B5 owns the Canal Barge form (`CanalBarge.tsx`, `canalBargeDraft.ts`), its picker and its expressibility rows. B4's `ActionWindow` only composes it, with the props `{ source: "before_action" | "after_action" }`, and works against the stub until B5 lands.
   - As built (CR B4-2, B5-2): the work window keeps one draft, so B4's `workDraft` holds the Canal Barge draft as its `canalBarge` sub-draft (reduced, revalidated, built and `fromCommand`-ed through `canalBargeDraft`), and the window's ConfirmBar sends `USE_CANAL_BARGE`. `ActionWindow` renders `<CanalBarge>` inside `CanalBargeFormProvider` from the frozen `decision/composition.tsx`, whose types come from B5's draft only; inside it the form edits the sub-draft and has no button of its own, outside it (the gallery) it keeps a local draft and its own button.
   - Table and kiln components (B2, B3) talk to decision windows (B4, B5) only through `TableSelection`.
4. **One namespace file per package** in `i18n/catalog/`. `index.ts` imports them all; A3 creates it in phase A with an empty namespace object per file.
5. **No new runtime dependencies:** no router, no state library, no CSS-in-JS. React 19 provides `useSyncExternalStore`, `useId` and `inert`. The new devDependencies (exact pins, added by A2) are `@playwright/test`, `@axe-core/playwright` and `happy-dom`.

---

## 5. Selector and data gaps

These are closed in phase A by A1, except the i18n rows (A3) and the event templates (B1). Each engine addition is additive, gets an agreement or shape test in `test/v161/engine/ui_selectors.test.ts` or `selector_agreement.test.ts`, and is listed in DESIGN §5.4. None changes `RULES_BEHAVIOUR_REVISION` or the content digest.

| # | Gap (wireframe developer list and the reviews) | Addition | Where | Owner | Test |
| --- | --- | --- | --- | --- | --- |
| 1 | Location effect one-line summaries | Catalogue namespace `locationSummary` (`<locationId>.<effect>`). EN from rulebook Appendix E "Action Summary"; ZH from the short column (`短`) of glossary §4.1–4.7. **Not in `data/`:** a new data key outside `PROSE_KEYS` would move the `r29-` content digest | `src/app/i18n/catalog/locationSummary.ts` | A3 | `location_summary_parity.test.ts` parses both docs (with the same table reader as `uiFixtures.ts` `glossarySection`) and compares cell by cell |
| 2 | Order quality line (glossary §5.1 form) | `orderQualityLine(order, locale)`: from `minQuality`, slot count and `at_least_n_quality` relations ("Fine+ each; ≥1 Masterpiece" / "均上品以上，至少1件臻品"). Replaces the wireframe's `qualityText`/`QTXT` | `src/app/i18n/orderText.ts` | A3 | Glossary §5.2 examples (S01, S13, O14, O31, O39, O47) match exactly; all 64 Orders render in both languages with no `{` |
| 3 | `handLimitStatus(view, pid).trimDue` | `trimDue = !isFinalRound(round) && mustDiscard > 0`. `isFinalRound` is exported from `round.ts` (today module-private), so Cleanup and the selector share one predicate | `src/game/selectors.ts`, `round.ts` | A1 (contract commit) | Round 5 false; Rounds 1–4 equal `mustDiscard > 0` |
| 4 | Event text templates EN/ZH | `EVENT_TEXT: { [T in GameEventType]: EventTemplate }` (64 types, exhaustive by type), plus own-secret variants for `ORDERS_DEALT`, `ORDER_RESERVED`, `PRIVATE_LOOK_OPENED`, `LOOKED_ORDERS_DISCARDED`, `TECHS_RETURNED_TO_BOTTOM`, `TEST_PIECES_PEEKED`, `HAND_TRIMMED`. Replaces `evText`. A template reads only `PublicGameEvent` fields; own-secret variants read `LogEntry.own` | `src/app/i18n/events.ts` | B1 | Every type renders in both languages from fixtures and synthesized events; no placeholder left; no secret text for another seat |
| 5 | `kilnLayout.freeActiveSpaces` | `kilnLayout(view): { activeSpaceIds, coveredSpaceIds, emptyActiveSpaceIds }` (from `activeKilnSpaces` and `board.kilnSpaces`). Replaces the fixture-only `kilnLayout` and the wireframe's own count in `kilnMini` | `selectors.ts` | A1 (contract commit) | 2/3/4-player covers (2-1-1 / 2-2-2 / 3-3-2) |
| 6 | Form & Decorate quote per draft | No new selector. The draft model calls `quoteFormDecorate(actor, draft)` live, memoised on the draft, so every Shape × Decoration has its quote | B4 draft model | B4 | Draft tests over all 20 single vessels |
| 7 | D3/D4 firing display | `firingStageView(view): FiringStageView \| null` for the current firing:<br>• `round`; Appendix D `step` (1–12); `firstPlayerOrder` (steps 4, 5, 8, 10); `queue: { actorIds, index } \| null`; `submittedPlayerIds`;<br>• `kilnDie`; `contributions` (per contributor `null` until revealed, then `{ card, heat, woodPaid }`); `baseHeat`; the revealed `fireModifier`; `globalHeat`; `fireDiscard`; the public Test Pieces record `{ playerId, peeked, buried }`;<br>• `extraFire: { playerId, ceramicId, modifier } \| null`, from `pendingExtraFire` (set only while the R7 Jun window is open);<br>• per ceramic `{ id, ownerId, kiln, spaceId, marker: { source, faceDown, value? } \| null, quality, crackle, salvaged, secondFireModifier: FireModifier \| null }` (from `second.fireModifier`; `null` = not second-fired).<br>**No `actualHeat`, `heatSource`, `heatDifference`, previews or Fire-deck count.** Replaces the wireframe's `STEP_OF`, `FP_STEPS` and the fixture `heatLadder` | `selectors.ts`, `types.ts` | A1 (contract commit) | Key allow-list test (any new key fails until reviewed against D3); agreement with the engine's firing record; the R7 scenario and moment m18 expose `extraFire` |
| 8 | Crackle declaration verdicts | `crackleDeclarationChecks(view, orderId, ceramicIds, declarations)`: per selected Crackle ceramic and per Glaze choice, `orderSelectionCheck`'s verdict, plus the undeclared ("engine searches") verdict. Moves the generator's `crackleDeclarationChecks` into the engine | `selectors.ts` | A1 | Agreement with `validateAction` on `COMPLETE_ORDER` and `USE_CANAL_BARGE` |
| 9 | Final results rows and tie-break order | Export `SCORE_BREAKDOWN_ROWS` (L492 order: orders … total) and `TIE_BREAK_ORDER` (L498) | `scoring.ts` | A1 | Rows cover every `FinalScoreBreakdown` key |
| 10 | Form limits without reading rule constants | `placementLimits(view, locationId, effect)` → the typed `LOCATIONS[id].effects[effect]` record (`maxVessels`, `maxLoads`, `maxImperialLoads`, `placesHeatMarker`, `resources`, `bonus`, …) | `selectors.ts` | A1 | Matches content for every location × effect |
| 11 | D7 "Added by ⟨Tech⟩" | `PersonalSpaceView.addedByTechId: TechId \| null` in `playerSummary` (the owned Tech whose `unlocks` added that space). The "Learn a {discipline} Tech to add this space" text is `formatRuleError({ code: "PERSONAL_SPACE_LOCKED", details: { discipline } })`, one source | `selectors.ts`, `types.ts` | A1 | m1 viewer: space 1 of Form & Decorate → `T17` |
| 12 | Unavailable-location reason details | `PlacementWorkerOption.error: GameRuleError \| null` beside `reason`, so `formatRuleError` gets details (e.g. Magistrate's Hall Coins). Replaces `reasonFor`'s local patching | `selectors.ts`, `types.ts` | A1 | `selector_agreement` extended |
| 13 | Others' private look | None: `counts.pendingLook` is already public (`publicLookIndicator` in the fixtures) | — | — | — |
| 14 | Materials Yard choices (L350: Prepared Clay never with Senior Apprentice) | `materialsYardOptions(view, worker: PlacementWorkerOption)` → `{ resources, shifuBonus: CostQuote \| null, preparedClay: { shapes: Shape[]; decorations: Decoration[] } \| null }`. `preparedClay` is `null` for a Senior Apprentice placement or when Prepared Clay (T17) is not ready. Probed through `validateAction` | `selectors.ts`, `types.ts` | A1 | `selector_agreement`: every offered choice validates and no other choice does (exhaustive `legalCommands` over the Materials Yard scenarios) |
| 15 | Glaze & Load vessel choices (L325: Reworking Table) | `glazeLoadVesselOptions(view, pid, earlierLoads)` → per shaped vessel `{ ceramicId, glazes: Glaze[], reworkShapes: Shape[] }`. `reworkShapes` is empty unless Reworking Table (T05) is ready and no earlier load of this action was reworked | `selectors.ts`, `types.ts` | A1 | Agreement with exhaustive `legalCommands` over the Glaze & Load scenarios |
| 16 | Imperial Priority choices (L769–779) | `imperialPriorityOptions(view)` gains `ceramics: { ceramicId, glazes, imperialModifiers, reworkShapes }[]`. The existing `usable` and `ceramicIds` are unchanged. Probed through `validateAction` | `selectors.ts`, `types.ts` | A1 | Agreement with exhaustive `USE_IMPERIAL_PRIORITY` candidates |
| 17 | Round phases without the UI reading `data/` | `src/game/roundStructure.ts`: `ROUND_STRUCTURE` (`data/round_structure.json`, display text only and **not** a fingerprint input) and `roundPhaseOf(phaseType: GamePhaseType): RoundPhaseId \| "final"`, both exported from the barrel | `roundStructure.ts`, `index.ts` | A1 (contract commit) | Exhaustive over `GamePhaseType`; `ROUND_STRUCTURE.roundCount === GAME_CONFIG.rounds`; content digest unchanged |
| 18 | Idle recap without the heat ledger | `firingRecapView(view)`: a `FiringStageView` built from `lastFiring` (step 12, no queue), or `null` before the first firing. Replaces `firingSummary` for `IdleFiringRecap` | `selectors.ts` | A1 (contract commit) | The same key allow-list as gap 7 |
| 19 | Numbers in UI text | No engine change. `i18n/content.ts` fills placeholders from `GAME_CONFIG.rounds`, `GAME_CONFIG.coinEndGame` (`coinsPerVp`, `maxVp`), the top level of `IMPERIAL_TRACK` and the length of the catalogue's firing-step list (glossary §2.11) | `i18n/content.ts` | A3 | `no_rule_numbers` (§6.4) |

**Out of scope by owner decision (never built or rendered):**

- `heatPreviews`, `qualityByFire`, `heatBeforeFire`, `qualityForDifference` used as a preview;
- the Fire-deck count (`counts.fireDeck`), which `TableBoardView` omits by type;
- `scorePreview` as an in-game projection. Seat chips show the score-track value `recordedVp`, which includes Tech VP from the purchase (amendment A1). Results use `finalResult`.

They stay engine-side for the computer player. The §2 identifier scan and the rendered-markup scan (§9.2) enforce this.

**Deck counts.** Only the Fire-deck size is withheld (D4). The Main Order deck and discard counts and the Tech deck counts are shown, as in the signed-off wireframe (`deckLine`, `deckN`), because a player at the table can see those piles. §11 asks the owner to confirm this.

---

## 6. i18n

### 6.1 Typed, ID-keyed catalogue

```ts
// src/app/i18n/defineNamespace.ts
type EnEntry = string | { one: string; other: string };      // EN plural forms
export function defineNamespace<const E extends Record<string, EnEntry>>(ns: {
  en: E;
  zh: { [K in keyof E]: string };          // Chinese has no plural forms; missing or extra keys fail typecheck
}) { return ns; }

// src/app/i18n/catalog/work.ts (B4)
export const work = defineNamespace({
  en: { title: "Place a worker", workersLeft: { one: "{n} worker left", other: "{n} workers left" }, … },
  zh: { title: "派工", workersLeft: "还剩{n}名工人", … },
});

// translator: keys are `${namespace}.${key}`; params are inferred from the English template(s)
t("work.workersLeft", { n: 3 });                          // plural form chosen by Intl.PluralRules("en")
t.rich("shell.roundN", { n: 2 });                         // "Round <b>{n}</b>/{total}" → React nodes, <b> → <strong>
```

- **Locales:** `"en" | "zh-CN"`. `<html lang>` is `en` or `zh-Hans`.
- **Preference:** the existing `kiln-opening:language` key. On a first visit, the first `navigator.languages` entry starting with `zh` selects `zh-CN`; otherwise `en`.
- **Seed:** the wireframe's `UI` dictionary (215 keys), split by namespace. Its English-sentence keys become IDs. During seeding, every literal rule number becomes a placeholder (§5 gap 19). Concatenation helpers become whole templates (§6.3).
- **Rich text.** Templates may contain only the tag placeholders `<b>…</b>` and `<em>…</em>`. `richText.tsx` parses them into React nodes; parameters are always inserted as text. HTML is never injected, and `dangerouslySetInnerHTML` is forbidden in `src/app` (§2). ConfirmBar summaries (`workSummary`, `completeSum`, `useOn`) are `RichMessage`s `{ key, params }` rendered through `t.rich`, so player names are never markup. `RichMessage` is one object type, not a union with one member per key (a per-key union of well over 1,000 keys made `tsc` give up with TS2590, CR B2-5); messages are built with `msg(key, params)`, which keeps the per-key parameter check.
- **Plurals.** An EN entry may be `{ one, other }`, chosen with `Intl.PluralRules`. ZH is always one string. The placeholder type is the union of the placeholders of the EN forms, and the catalogue test requires ZH to use the same set. This replaces the wireframe's `coinsN`/`coin1` special case.
- **Fallback.**
  - In development and tests, `t` throws for a missing key, and content lookups throw for an empty `*Zh` field, an unknown event type or an unknown `MultiplayerErrorCode`.
  - In production, the EN text is shown with a `console.warn`. An unknown error code shows the raw code.
- **Formatting at render time.** Errors, announcements and the ConfirmBar summary are stored as codes and parameters (`StoredError`, `RichMessage`) and formatted when rendered. A language switch therefore re-renders all of them in the new language and leaves drafts untouched (tested, §9.3).

### 6.2 Where each string comes from

| Text | Source | Accessor |
| --- | --- | --- |
| Names of locations, Techs, Kilns and Kiln abilities; Tech short text and ability; location Apprentice/Shifu text; Kiln short names (seat chips) | `data/*.json` through `LOCATIONS`, `TECHS`, `KILNS` (`name`/`nameZh`, `shortText`/`shortTextZh`, …) | `i18n/content.ts`: `locationName(id)`, `techText(id)`, `kilnText(id)`, `kilnShortName(id)`, … |
| Shapes, Glazes, Decorations, Qualities, resources, workers, disciplines, zones, stages, phases | `ruleErrorText.ts` vocabularies (`SHAPE_TEXT`, `GLAZE_TEXT`, …, `PHASE_TEXT`) | `i18n/content.ts` |
| Order requirements | `ORDERS[id].requirements` / `requirementsZh` | `orderRequirements(id)` |
| Order quality line | gap 2 | `orderQualityLine` |
| Round phases | `ROUND_STRUCTURE` (gap 17) `name` / `nameZh` / `summary` | `roundPhases()` |
| Recognition milestones | `IMPERIAL_TRACK.track` `title` / `rewardText` (+`Zh`) | `recognitionMilestones()` |
| Firing step names | glossary §2.11 (12 steps). Short EN rail labels come from the wireframe's `STEP_SHORT` | `catalog/kiln.ts` `step.<n>.full` / `.short`, checked against the glossary |
| UI verbs (Confirm, Clear, Decide, End turn, …) | glossary §2.16 | `catalog/common.ts`, checked against the glossary |
| Ceramic accessible names | composed from the vocabularies | `ceramicLabel(ceramic, owner)` (§7.4) |
| Rule errors | `RULE_ERROR_TEXT` via `formatRuleError(error, locale, { playerName })` | `i18n/errors.ts` |
| Multiplayer errors | `mp` namespace: one key per non-rule `MultiplayerErrorCode`, as an exhaustive `Record` | `i18n/errors.ts` (replaces `localizeMultiplayerError`) |
| Location summaries | gap 1 | — |
| Event log and live announcements | `i18n/events.ts` (gap 4) | — |

### 6.3 Formatting (glossary §1.2–1.3)

`i18n/format.ts` keeps only number and list formatting: `num` (tabular numerals), `signed` (`+1`, `−1` with U+2212) and `list` (`、` in ZH, `, ` in EN). The wireframe's concatenating helpers `resDelta`, `vpN`, `paren` and `sp` are **not** ported. Every phrase is a whole template instead, for example:

| Key | EN | ZH |
| --- | --- | --- |
| `common.gainRes` | `+{n} {res}` | `得{n}{res}` |
| `common.payRes` | `pay {n} {res}` | `付{n}{res}` |
| `common.vpGain` | `+{n} VP` | `+{n}分` |
| `common.roundN` | `Round <b>{n}</b>/{total}` | `第<b>{n}</b>轮／共{total}轮` |

ZH rules enforced by `zh_punctuation.test.ts` (§6.4):

- full-width `，：；（）？！` next to Chinese, and `、` in lists;
- no space between a number or a `{placeholder}` and a Chinese unit or classifier (`2泥`, `第3轮`, `{n}名`, `{n}分`); classifiers 件/名/张/项/个 as in the glossary;
- `／` for compact alternatives, `「」` around names, `……` (never `…`);
- `−` (U+2212), never `-`, before a digit;
- half-width `=` and `+` with spaces in equation templates (`HeatEquation`), and en-dash ranges (`0–5`);
- the §1.3 compact cost and gain forms (`得1泥1柴`, `付2铜钱`, `+4分`).

### 6.4 D7 wording, glossary and tests

D7 wording:

- **Before the space is added:** `formatRuleError` `PERSONAL_SPACE_LOCKED`: "Learn a Form & Decorate Tech to add this space." / 习得坯作技艺即添此工位.
- **After:** `boards.addedBy`: "Added by {tech}" / 由「{tech}」添设.
- **Internal identifiers** (`unlocked`, `PERSONAL_SPACE_LOCKED`, `unlocks`) never reach rendered text.

Catalogue tests, in `test/v161/ui/i18n/` (A3, phase A):

- `catalog_complete`: every key has non-empty EN and ZH; placeholder sets match (the union of the EN plural forms).
- `rich_text`: no raw `<` in any template except the whitelisted tag placeholders; tags balance; parameters render as text.
- `glossary_terms`: ZH strings use the glossary terms and avoid the §1.5 banned terms, through `test/v161/support/glossary.ts` (shared with the engine test).
- `d7_wording`: EN has no `/\b(un)?lock/i`. ZH has none of 锁, 封条, 启封, 封存, 上锁, 解锁, and no 封 next to 窑位 or 工位 (glossary §1.5 and §2.10: a covered space is never 封).
- `obsolete_terms`: no AGENTS.md "Explicitly obsolete mechanics" term (Kiln Yard, Refining House, Starting Tech, …).
- `no_rule_numbers`: catalogue strings contain no digits. The `locationSummary` namespace is exempt by name, because it is sourced text checked by its own parity test. Numbers arrive as placeholders (gap 19).
- `zh_punctuation`: §6.3 over every ZH string.
- `fallback`: dev throws and production falls back as in §6.1.

Rendered-markup checks (D7, obsolete terms, ZH punctuation on text nodes, stable IDs, D3/D4 vocabulary, no foreign secrets) run over the **full `GameScreen`** of every fixture in `test/v161/ui/rendered_text.test.ts` (B6, §9.2). They scan text nodes and `aria-label`, `title` and `alt` values only, never class names or `data-*` attributes.

---

## 7. Styling

### 7.1 Tokens: one file, light and dark

`styles/tokens.css` holds every colour twice: once in the light block and once in the dark block. The values are the wireframe's light and dark palettes. Its four duplicated blocks (`:root`, the dark media query, `[data-theme="dark"]`, `.device[data-ftheme]`) collapse into two:

```css
@layer tokens {
  :root {
    color-scheme: light;
    --paper: #f4efe4; --ink: #1a2420; --glz-celadon: #a4c3ad; --seat-0: #34558b;
    /* … every wireframe colour token: surfaces, ink, lines, teal / celadon / cinnabar / gold,
       disciplines (--d-*), glazes (--glz-*), qualities (--q-*), seats (--seat-0..3), kiln body
       and cells, fire (--fire-*), chrome, focus, notes, shadow */
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --paper: #131a18; --ink: #ece6d9; --glz-celadon: #8fb19b; --seat-0: #86a6dc;
    /* … the same names */
  }
}
```

- **`data-theme` is always set.** `theme.ts` `applyTheme()` runs in every entry before the first render. It uses the stored choice (`kiln-opening:theme` = `light` / `dark` / `system`), and for `system` it uses `matchMedia("(prefers-color-scheme: dark)")` with a change listener. `light-dark()` is not used, because it makes every colour invalid on Safari before 17.5.
- **Parity:** `css_rules` checks that both blocks define the same colour tokens.
- **Browser floor:** Safari and iOS 16.4, Chrome and Edge 111, Firefox 121 (container queries, `@layer`, `dvh`, `inert`). It is documented in the README and confirmed in §11.
- **Non-colour tokens** (single values):
  - spacing `--sp-1…8`, radii, line heights, z-indexes;
  - `--pane-w` (400 / 340);
  - the fonts (`--serif`, `--serif-zh`, `--sans` from the wireframe);
  - the **type scale in `rem`**: `--fs-12: 0.75rem` … `--fs-30: 1.875rem`, so the browser's text-size setting applies (WCAG 1.4.4).

  Semantic aliases (`--fs-meta`, `--fs-body`, `--fs-rule`) are raised by `:lang(zh-Hans)` so that Chinese body and rule text is never below 13px (`0.8125rem`). Han characters in `--serif-zh` are hard to read at 12px.
- **The unused `--mix-d*` tokens are dropped.**
- **Theme control:** in the top bar's `SessionMenu` (B1).

### 7.2 Layers and files

`styles/index.css` declares `@layer reset, tokens, base, layout, components, states, utilities;`. It must be the **first** import of every entry (`main.tsx`, `playtest/main.tsx`, `dev/gallery-main.tsx`), so the layer order holds however Vite splits CSS chunks. `css_rules` checks this.

| Layer | What goes in it |
| --- | --- |
| `base` | type scale, `:focus-visible`, `.sr-only`, `.num`, `h1–h4`, and the `:lang(zh-Hans)` serif and size switch |
| `layout` | `shell/GameShell.css` (the shell grid and the phone grid) |
| `components` | each co-located component CSS file, wrapped in `@layer components { … }` |
| `states` | `[aria-pressed]`, `[aria-disabled]`, `[aria-current]`, `.acting`, `.pending` |
| `utilities` | few |

Wireframe CSS sections map to owners:

| Wireframe section | Owner |
| --- | --- |
| app shell, top bar, tablet, phone, landscape | B1 |
| tokens/pieces, ceramics | A3 |
| kiln mini, central board, recognition + techs, orders, player boards | B2 |
| Shared Kiln, firing stage, results | B3 |
| decision pane, `.opt` / `.pill` / `.sub` / `.quote` / `.delta` / `.err` | A3 (kit) + B4/B5 |
| phone tab bar | B1 |

### 7.3 Layout rules

- **Containers.**
  - `#root` is the `shell` container (`container: shell / inline-size`). Its width is the viewport width, so `useLayoutMode()`'s media queries agree with it.
  - The `shell` breakpoints: ≥1500 full phase labels; ≤1499 numbered phases; ≤1199 `--pane-w: 340px`; ≤899 the phone grid "top / banner / world / pane / nav", with the bottom sheet and its peek strip.
  - While the pane is hidden (D14, `data-pane="hidden"` on the shell) every grid drops the pane's cell and adds a `bar` row above the world for `PaneOpeners`: on desktop and tablet "top / banner / bar / jump / world", the world taking the pane's column; on phones "top / banner / bar / world / nav", with no bottom sheet; in short landscape the rail and "top / banner / bar / world", with no side column.
  - The turn toast's holder (D17) sits in the world's cell, at its top, not in a row of its own: the world gives up a band as tall as the holder (`--turn-toast-band`, set by `shell/toastRoom.ts`) and scrolls by as much, so the toast lies over nothing.
  - Other named containers (`world`, `section`, `central-board` (5 → 3 → 2 → 1 columns), `location`, `kiln`, `kiln-space`, `orders`, `order-card`, `stage`, `board`, `pane`) sit only on **block-level wrappers with a definite width**, such as grid cells, section bodies and cards in grid tracks. They never sit on shrink-to-fit flex items such as chips and pills, whose width `container-type: inline-size` would collapse.
- **Short landscape** is decided by height, not by the 899px container: `@media (orientation: landscape) and (max-height: 500px)`. It covers 844×390, 915×412 and 932×430. It gives a left section rail and a side pane (the wireframe's `data-short` rules).
- **Viewport height:** the phone grid uses `100dvh`, and the sheet's open height is `72dvh` (the wireframe used `--h`). `env(safe-area-inset-*)` pads the top bar, the nav and the sheet.
- **Markup is identical at every width.** Layout is CSS. Behaviour that depends on the viewport (§8.1) reads `useLayoutMode()` in event handlers only, so SSR markup does not change.
- **Content is not hidden by width.** The only `display: none` that depends on the viewport is for inactive phone sections and the collapsed sheet body. The wireframe's short-landscape `.prompt p` and `.confirm > .small` hiding becomes a disclosure. Its `.rs p` hiding at ≤640 is dropped: the Recognition track keeps its rewards and scrolls horizontally.
- **Floor and gutters:**
  - 12px text floor (13px for Chinese body and rule text); every `font-size` and `font:` shorthand uses a `--fs-*` token;
  - 16px side gutter on phones;
  - no horizontal page scroll; the step rail, the seat chips and the Recognition track scroll inside themselves.
- **No `transform: scale(…)`, `zoom` or fixed-width scenes.** Long rules text goes in a disclosure, never a line clamp.

CSS checks run in vitest over `src/app/**/*.css` and `src/app/**/*.tsx` (`test/v161/ui/styles/css_rules.test.ts`, A3):

- no colour literals (`#hex`, `rgb(`, `hsl(`, named colours) outside `tokens.css`; light/dark token parity;
- every `font-size` and every `font:` shorthand uses a `--fs-*` token, and no token is below `0.75rem`;
- no `scale(` or `zoom:`;
- every component file is wrapped in its layer;
- TSX `style` props set only custom properties (`--*`);
- `styles/index.css` is the first import of each entry.

### 7.4 Pieces and art

- **Ceramics** (`pieces/CeramicArt.tsx`) port the wireframe's `.cer`:
  - `--src` is the Vite-imported cutout `ceramic-<shape>-<decoration>-v1.webp`;
  - `::after` multiplies `var(--glz-<glaze>, var(--glz-clay))` through the same mask;
  - Crackle adds the masked `ceramic-crackle-overlay-v1.webp` layer;
  - attributes: `data-ceramic-art="<shape>-<decoration>"`, `data-glaze`, `data-decoration`, `data-crackle`; the image is `aria-hidden`.
- **`CeramicChip`** adds the seat-colour ring, the ID and the Quality word or letter (`QL`: M/F/S/× and 臻/上/良/瑕, never colour alone) plus the marker badges (`cchip`).
  - Its accessible name is visually hidden text from `ceramicLabel`, which replaces the wireframe's `title`-only `cerTitle`. Example: "Lin's c12: Celadon bowl, carved, Fine, Crackle, Heat marker face down".
  - `HeatMarkerBadge` likewise carries sr-only text ("Heat marker, face down" / "Heat marker +1").
- **`PieceDetail`** (kit) is a button plus a positioned panel, opened by click, tap or keyboard. Escape and an outside click close it, and the panel stays inside the viewport. The open panel is rendered into one body-level layer (`#kit-detail-layer`, a portal) and fixed beside its button, so no scrolling column or container query wrapper clips it or paints over it (B6, CR B2-6 and B3-5). It shows the full details of a ceramic or a Kiln tradition. (An owned Tech slot has no `PieceDetail`: its tile shows the printed short text, owner decision D19.) The `title` attribute is never the only carrier of game information.
- **`ArtResolver` context** (default: the static cutouts) is phase 6's hook for baked WebGL glaze images.
- **Seat colours** are `--seat-<seatIndex>`, wireframe-approved hues that are not Glaze colours. The store's `PublicSeat.colour` names (`cinnabar`, `celadon`, `ink`, `moon-white`) would be confused with Glaze tints, so the UI does not use them.
- **Missing art** (8 Tech illustrations, the 5 boards, central scenery) renders as text-only cards. The existing `tech-*-v2.webp` files are used where `asset_specs.json` says `REUSE`.

---

## 8. Accessibility, focus, motion and WebGL hooks

### 8.1 Semantics and keyboard

- **Landmarks:**
  - `header` (the top bar);
  - the ConnectionBanner region;
  - `main` (the world);
  - `aside aria-label="Your decision"` (the pane), or, while the pane is hidden (D14), the bar above the world, a `section` with the same name (the two never show together);
  - `nav aria-label="Sections"` (the phone nav) and the desktop jump nav.

  The **skip link** to the decision opens the phone sheet if it is in `peek`, then focuses the pane's heading. While the pane is hidden it focuses the bar's turn cue when the bar has openers, else the table (§8.2).
- **Decision forms are `<form>`s:**
  - single choices: native radios in `OptionGroup` / `OptionCard`, with arrow-key navigation for free;
  - multi-choices (hand trim, the Glaze & Load vessels): checkboxes;
  - steppers: buttons with labels ("One more Clay");
  - Confirm is `type="submit"`.
- **Unavailable options** stay focusable with `aria-disabled` and their reason in `aria-describedby`. Arrow keys can still check an `aria-disabled` radio, so the change handler ignores it and `reduce` would reject it anyway.
- **The location sub-editor** is a labelled group (`.b4-sub-region`, `role="group"`) after the chosen placement's summary; the pane has no location radios (D14). No other control is ever nested inside a radio's `<label>`, where it would be invalid. Because drafts are kept per location (§3.5), choosing another location's Place never loses choices.
- **The Shifu's Guild Hall inspection** (D19) offers each Tech as a native radio drawn as the Tech display's tile (`TechOption`): named by the Tech's name and price, described by its discipline and short text; an unavailable one keeps `aria-disabled` and its reason.
- **The Guild Hall Shifu bottom order** uses `ReorderList`: an ordered list with **Move up** and **Move down** buttons per item. Each move is announced politely ("Celadon Glazes moved to position 1"). There is no drag-only interaction.
- **Board tabs (D1)** use the WAI-ARIA tabs pattern (`Tabs` kit: roving `tabindex`, arrow keys, one `tabpanel` holding the `PlayerBoard`).
- **The phone section bar is not a tablist.** One phone tab maps to several sections (wireframe `SEC_TAB`: Table → table, progress and results). It is a `nav` of plain buttons with `aria-current="page"` on the current one. The sections are ordinary regions with headings, so on desktop, where the bar is hidden, nothing points at hidden tabs.
- **Seat chips, Place shortcuts and kiln targets** are buttons with `aria-pressed`. A seat chip's label reads "Open Lin's board · Jun Kiln · 12 VP · 3 Orders in hand".
- **The game log** is a disclosure button (`aria-expanded`, `aria-controls`) over an `<ol>`, newest first. `Escape` closes it and returns focus to the button.
- **`SessionMenu`** is a menu button (`aria-haspopup="menu"`, `aria-expanded`), with arrow keys inside and `Escape` to close.
- **The phone sheet strip** is a button with `aria-expanded`. Opening the sheet focuses its heading; `Escape` collapses it and returns focus to the strip.
- **End session** uses a native `<dialog>` with `showModal()`, which traps focus.
- **Quality never relies on colour.**
- **Touch targets:** every interactive element is at least 44×44 CSS px on phones, or has 44px spacing (WCAG 2.5.8, with its inline-text exception). The wireframe's 30px `logbtn`, 20px `.pbtn`, pills, `.decl` and seat chips grow to meet this at ≤899px.
- **Viewport-dependent behaviour** (from the wireframe click handler) lives in `uiStore` actions that read `useLayoutMode()`:
  - on phones, tapping a Place shortcut, a location or a hidden pane's opener (D14) opens the sheet;
  - on phones, a seat chip switches to the Workshop section and collapses an open sheet to `peek`, except in short landscape;
  - on desktop, KilnMini and seat chips scroll to their section (`jumpTo`).

### 8.2 Focus across re-renders

- **Stable keys.** Lists are keyed by stable engine IDs (location, ceramic, Order, player, space), so React keeps focused nodes across revisions. The wireframe's `focusKey` re-render hack is not needed.
- **Window change.** When the window `kind` or `openKey` changes, and focus was inside the pane or on `<body>`, focus moves to the pane's `<h2 tabIndex={-1}>` if it is visible. On a phone with the sheet in `peek`, it goes to the sheet strip button instead, whose label names the window. Otherwise focus stays where it is.
- **Hidden pane (owner review, 2026-10-17; D14).** A window spec may hide the pane for a draft (`WindowSpec.pane`, `state/pane.ts`): the work turn does until a placement is chosen, and the shell then gives the world the pane's room (`data-pane="hidden"`). It stays up while a server error is pending, so the error is never hidden with it.
  - While it is hidden, a slim bar above the world (`decision/PaneOpeners`) always gives the turn cue ("Your turn: place a worker · 3 left") and, when an ability may come before the worker action, its openers after "Or first:". On phones the cue takes one short line and the openers one row under it.
  - When the pane appears in the same window (a Place shortcut, an opener), focus moves to its heading (or the sheet strip). An ability opened with nothing placed offers only the abilities as the step's radios (arrow keys select as they move, and none of them hides the pane) and a separate "Back to placing a worker" button. A lone radio is no choice: with only one ability that may come first, the step has no radios. The heading and the phone sheet strip follow what the pane shows (`WindowSpec.title` receives the draft; `workDraft.options().heading`): "Place a worker" with a placement's choices, "Before your worker action" while an ability's form is open and the step's radios name it, the ability's own name ("Canal Barge") when it is open alone.
  - When it hides with focus inside it or on `<body>` (Clear, back to placing, a new turn after Confirm), focus goes back to the placement control the player last used: a Place shortcut or an opener (`PANE_RETURN_CONTROL`), never a prompt the code focused on the way such as the Guild Hall's Tech chooser. A control drawn anew is found again by its data attributes (`data-location-id`, `data-worker`, `data-pane-opener`), else another worker's Place at the same location, else the Table section's heading.
  - The world scrolls, the least it can, to show that target: always after the player's own Clear or back to placing (the world has just widened, and the Guild Hall's jump may have moved the view); at a new turn only when the focus ring shows, so the other players' turns never move a pointer player's view. The other players' turn toasts, whose band opens at the world's top right after that reveal, never scroll a control with the focus ring out of view again: the world scrolls only as far as keeps it in view, and the table moves down for the rest (`shell/toastRoom.ts`, `keepFocusInView`; checked in a real browser by `keyboard_focus.spec`).
  - The skip link then lands on the bar's cue when it has openers, else on the table.
- **Automatic section switch (phones).** If the focused element is still visible, focus stays. If the switch hid it, focus moves to the new section's heading.
- **Focus rescue** (`shell/focusRescue.ts`, B1). Its job is to catch a focused table control that a revision removed or hid, such as a Place button after placing or an Order card after completion.
  - On `focusin`, it records the nearest `[data-focus-fallback]` container.
  - After each commit, if `document.activeElement` is `<body>`, it focuses that container's heading. If the container is gone too, it focuses the pane heading.
- **While sending,** only `.pane-scroll` is `inert`. ConfirmBar keeps focus and shows `aria-busy`.

### 8.3 Announcements

`LiveAnnouncer` (B1) has one `aria-live="polite"` region, and one `role="alert"` region for errors and the ConnectionBanner alerts. It announces:

- **each `lastBatch`** of any origin (`self`, `computers`, `remote`), summarised through the event templates: moves, reveals, Fire, each Quality, completions;
- **becoming an actor**, with the wireframe's `announcement` text per window ("Your turn: place a worker. 3 workers left.");
- **someone else's private look**: "Zhao is looking at 3 Orders".

The other players' turn toasts (D17, `shell/TurnToasts.tsx`) are not a live region (no `aria-live`, no `role="status"`): this region already says every batch of moves in the same event templates, so nothing is said twice. A toast is a labelled group in the Tab order where it is drawn: after the top bar, the hidden pane's bar and the jump bar, and before the world.

Announcements are coalesced into one summary per revision gap, at least 1.5s apart. "Your turn" is always announced last. Batches are deduplicated by sequence (§3.2), so nothing is announced twice. The log dropdown renders the newest 50 entries and a **Show earlier** button, not the whole history.

### 8.4 Motion and WebGL hooks (phases 5–6)

- **`data-motion`** on every element phase 5 will animate. The vocabulary:
  `die`, `contribution`, `fire`, `marker`, `ceramic`, `worker`, `order-slot`, `board`, `kiln`, `quality`.
  Each carries `data-motion-key` with a stable ID (ceramic ID, worker ID, `slot:<i>`) for FLIP.
- **Reduced motion:** `@media (prefers-reduced-motion: no-preference)` allows only the wireframe's 0.25s transitions. `reduce` disables all of them.
- **`motion/timeline.ts`:**
  `PresentationTimeline { present(batch, apply): void; skip(): void }`.
  Phase 4 ships `ImmediateTimeline` (apply at once). `SessionStore` calls it for each `lastBatch`. Phase 5 swaps in the animated timeline (which jumps to the end on reconnect) without touching components.
- **`data-webgl-mount`:**
  - `"shared-kiln"` on the kiln body;
  - `"imperial-kiln"` (+`data-player-id`) on each Imperial tile;
  - `"firing-stage"` on the stage.

  The DOM kiln stays the accessible source of truth and the fallback. WebGL receives only public state.

---

## 9. Testing

### 9.1 Fixtures

All fixtures are JSON in `test/v161/ui/fixtures/`, generated by `tools/uiFixtures.ts --target tests` (A1). Tests read them with `readFileSync`. The gallery loads them lazily through `import.meta.glob`. `FixtureGameSource` never builds a state, so `src/app` never needs test code.

**1. Scripted scenarios → `scenarios.json`.** Every window and table state, fast and deterministic.

- **Window scenarios** come from `phaseScenarios()` in `test/v161/engine/phase_scenarios.ts`:
  - Kiln selection, Setter's Mark;
  - before-action with Canal Barge, Imperial Priority + Reworking Table, Ding;
  - Kiln Furniture, Inverted Firing, Setter's Marks, Senior Apprentice;
  - the three Commission steps, the Guild Shifu inspection, Colour Samples, after-action;
  - Contributions with Fuel Ledger, the Test Pieces decision and bury;
  - Heat markers + Kiln Master, Jun, after-Quality (Saggars and Ge), Jun during Second Firing (R7), Salvage;
  - the Order Phase with Ru, Tribute Ware and a Crackle wildcard;
  - the hand limit.
- **Table-state scenarios** come from the new `test/v161/ui/fixtures/tableScenarios.ts` (A1). They need no open window:
  - a round with nothing loaded (firing skipped, 本轮不烧窑);
  - an Imperial-only firing with zero Contribution participants (Kiln Die = Base Heat);
  - a Fire-deck reshuffle (the open discard empties);
  - an empty Main Order supply with a partial display;
  - Round 5 Cleanup with an over-limit hand (no trim, `trimDue` false);
  - a winner by tie-breaker;
  - Recognition overflow (+1 VP per Crown beyond 4);
  - a 2-player and a 4-player final;
  - Glaze & Load into an Imperial Kiln with the −1/0/+1 choice, and a Kiln Furniture modifier choice.
- Each entry is stored as `{ id, name, kind: "window" | "table", viewerId, playerView, recentPublicEvents, ownSecrets }`, projected with `actorViewOf(state, viewer, priv)`.
- Together these cover **every** `DecisionWindow` kind, including the moments the wireframe could not reach.

**2. Played moments → `moments.json`.** Realistic text lengths, for layout, the gallery and screenshots: m1–m9 from the wireframe set plus m10–m18. `docs/ui-v1.6.1/fixtures.json` stays frozen with the signed-off wireframe. Each new moment uses the generator's existing steering, and every step goes through `validateAction`.

| Moment | How it is reached |
| --- | --- |
| m10 Setter's Mark | Steer a T22 purchase. The next round start opens the window, and a tile then sits on a space |
| m11 Test Pieces | Steer T13 and Wood ≥ 1. Two captures: the decision, then the bury with `own.firePeek` |
| m12 Guild Shifu inspection | Steer a Shifu `inspect` |
| m13 Jun | `kilnSteer(seat, "JU")` with Wood |
| m14 Salvage | Seed search for a Flawed ceramic |
| m15 Kiln selection | Revision 0 |
| m16 Colour Samples | Steer T10 |
| m17 after-action window | Steer T23 Canal Barge and/or Imperial Priority |
| m18 Jun during Second Firing | Steer T14 + JU |

A moment whose seed search exceeds a fixed budget falls back to the matching scripted scenario, marked `source.kind: "scripted"`.

**3. Secrets oracle → `secrets.json`.** For each scenario and moment, the Order and Tech IDs that viewer must never see: other hands, other seats' looks, and the decks, minus IDs a public event revealed. It is computed by `tools/fixturePrivacy.ts`, which A1 extracts from the generator's `publiclyRevealed` and `assertNoForeignSecrets`. It is a test oracle for `rendered_text` and is never loaded by `src/app`.

**4. Shell-state fixtures** are driven through `FakeGameApi` in the session tests: home with and without a saved seat; lobby as host and as guest with computer seats; reconnecting; offline; computer failure; an unsent command; the ended session.

**Privacy checks for own secrets.** `ownSecrets` hold full `GameEvent`s with `secret: { visibleTo, … }`, and today's `verifyFixtureFile` and `assertNoForeignSecrets` reject every `secret` key. A1 changes both checks:

- a `secret` key is allowed only at `ownSecrets[i].event.secret`, and only when `visibleTo === viewerId`;
- at capture time, each own secret must equal the authoritative event;
- a negative test plants a foreign secret and expects a failure.

**Drift checks.**

- `test/v161/ui/fixtures_current.test.ts` (in `npm test`):
  - regenerates `scenarios.json` and `secrets.json` in memory and deep-compares them (deterministic, a few seconds);
  - for moments: the recorded `rulesFingerprint()` must equal the current value, each moment's `decisionPrompt` must still match, and its recomputed canonical commands must still validate.
- `npm run fixtures:check` regenerates everything, byte-diffs and runs the privacy verification (≈15s). It is a phase-exit gate.

### 9.2 Unit and SSR tests (vitest, node, `renderToStaticMarkup`)

`test/v161/ui/support/render.tsx` (A2) provides `renderScreen(source, { locale, ui?, draft?, layoutMode? })`, `renderWindow(...)` and `renderComponent(...)`. They wrap `I18nProvider`, a `GameSource` context, a seeded `uiStore` and an optional seeded draft. The harness test renders every hook, which proves `getServerSnapshot` is wired.

| Area | Owner | Examples |
| --- | --- | --- |
| `session/` | A2 | monotonic merge; event sequence assignment and deduplication; ping → incremental events → reconnect only on change; single-flight reconnect; one `commandId` reused on resend; `STALE_REVISION` recovery keeps and revalidates the draft; the draft kept across another player's Contribution and across a parallel Salvage or trim commit; computer race codes cause no latch; timeout and latch; host-first delay; secrets never written to storage; forget-seat codes; `snapshotCompatibilityError` path |
| `state/` | A2 | `decisionWindow` for every scenario; `openKey` and reset rules; `TableBoardView` type test; model memo per view identity; `uiStore` defaults per window (the wireframe `resetApp` table) and the viewport-dependent actions per `layoutMode` |
| `i18n/` | A3 / B1 | §6.4 catalogue tests; `orderText`; location-summary parity; event templates (B1) |
| `pieces/`, `styles/` | A3 | 100 ceramic appearances; every ceramic chip has a non-empty accessible name in EN and ZH; CSS rules (§7.3) |
| `shell/` | B1 | seat chips in `turnOrder` with first-player, acting and computer badges, `recordedVp` then the final total, hand count and kiln short name; phase strip from `roundPhaseOf`; log newest first, capped, with no foreign secret; PhoneNav badges and `aria-current`; SessionMenu items (End session for the host only); ConnectionBanner per status state |
| `table/`, `boards/` | B2 | m1 "Added by Prepared Clay" and the not-yet-added hint; m2 empty slot "refills when Zhao's turn ends" and LookedOrders "only you"; m5 Magistrate's Hall 1/1 and the 2-1-1 cover; unavailable reasons from `formatRuleError`; others' hands as counts only; Order Phase hand states and the finished-ceramics strip; trim discard tags |
| `kiln/`, `firing/`, `results/`, `playtest/` | B3 | m3/m4/m9 equation terms; R7 extra Fire card beside its ceramic (m18 and the R7 scenario); empty-kiln and Imperial-only recaps; covered spaces by player count; stacks, Setter's Mark tile, Kiln Furniture; m8 shared victory, the tie-breaker winner and the A1 Tech row; Playtest V3 (below) |
| `decision/` | B4 / B5 | per-window draft `reduce` / `options` / `build` tables; SSR of each window from scenarios and moments, EN and ZH, with seeded drafts showing table targets |

**`rendered_text.test.ts`** (B6, phase B). It renders the **full `GameScreen`** for every scenario and moment in EN and ZH, and asserts:

- D7 wording, obsolete terms and ZH punctuation on text nodes and on `aria-label`, `title` and `alt` values;
- **D3/D4:**
  - no Fire-deck count wording;
  - no heat value on any ceramic or kiln space;
  - none of the words odds, chance, probability, ladder, preview or expected, nor the phrases "cards left", "cards remaining" or "left in the deck"; nor 概率, 几率, 余张, 预估, 预览, 剩余火牌 or 牌堆剩余. Bare "left", "remaining" and 剩余 are not banned, because "3 workers left" and remaining Crowns are legitimate;
  - "ledger" and 柴簿 are allowed only as the Fuel Ledger name;
- none of that entry's `secrets.json` IDs anywhere in the markup;
- `stable_ids`: EN and ZH yield identical `data-*` ID attributes, and the view is unchanged.

### 9.3 Interaction tier (vitest + happy-dom)

There are a few files under `test/v161/ui/interaction/`, each marked `// @vitest-environment happy-dom`. They drive `react-dom/client` with `act`; no testing library is added. They cover what static markup cannot:

- **Kit (A3):** `Tabs` roving tabindex and arrows; `Disclosure`, `Sheet`, `MenuButton` and `PieceDetail` Escape and focus return; `ReorderList` moves and announcements.
- **Frame (A2 → B6):**
  - the sending state: `.pane-scroll` inert, Confirm keeps focus with `aria-busy`;
  - a window change moves focus to the heading, or to the strip in `peek`;
  - a Place shortcut click changes the pane draft synchronously;
  - a language toggle keeps the draft and re-renders the stored error in the new language;
  - the hidden pane of D14 (`decision/hidden_pane.test.tsx`): which drafts hide it, the bar's cue and openers in EN and ZH, focus into the pane when it appears and back to the Place shortcut or opener when it hides, the world's scroll, a pending error keeping it up, the phone sheet.
- **Shell (B1):** focus rescue after a revision removes the focused control; skip link opens the sheet (and, with the pane hidden, goes to the bar or the table); the log dropdown's Escape; the turn toasts of D17 (`interaction/turn_toasts.test.tsx` in the DOM, `shell/turn_toasts.test.ts` for the queue, `shell/toast_room.test.ts` for the band the world gives up and the focus it keeps in view).

### 9.4 Property tests: the forms can play the whole game

- **Helper** `test/v161/ui/support/expressibility.ts` (A2). For a view and its window, it takes `legalCommands(view, { mode: "canonical" })`, whose default per-family cap is 64, and routes each command to its window's draft model (`USE_CANAL_BARGE` goes to B5's `canalBargeDraft`). For each command it checks that:
  1. `fromCommand(cmd)` gives a draft;
  2. every value in that draft appears in `options(draft)`;
  3. `build(draft)` equals `cmd` after `normalizeCommand`, which drops optional flags that are absent or `false` and treats an omitted `crackleDeclarations` as the draft's explicit `declarations: "auto"` mode (the engine searches);
  4. `build(draft)` validates.

  A stub draft (`fromCommand` returns `null`) is reported as `it.todo`, not as a failure.
- **`expressibility.work.test.ts` (B4):** Kiln selection, Setter's Mark, every placement family, Commission, Guild inspection, Colour Samples, Imperial Priority, `END_TURN`.
- **`expressibility.firing.test.ts` (B5):** Contributions, Test Pieces, Heat markers, Jun, after-Quality, Salvage, Orders, Canal Barge, hand trim.
- **Inputs for both:**
  - canonical mode over every scripted scenario and every decision of 3 seeded games (2/3/4 players);
  - **exhaustive** mode over the scripted scenarios, capped at 5,000 commands per scenario, with a seeded stride sample above that (the count is logged), because the canonical cap does not prove every legal move.
- **`expressibility_complete.test.ts` (B6, merged after B4 and B5).** No `todo` remains, and every `DecisionWindow` kind is covered.
- **`form_driver_games.test.ts` (B6, merged after B4 and B5).**
  - Full 2/3/4-player games are played only through the draft models: `options` → a seeded choice → `build` → `validateAction` → engine `applyAction` in the test harness (tests may call the engine).
  - Every game must finish with `finalResult` and no validation failure.
  - `KILN_UI_FUZZ_GAMES` raises the count, like `test:fuzz:long`.

### 9.5 Scenario gallery (dev-only, tracked)

- **`next/gallery.html` → `src/app/dev/gallery-main.tsx` → `ScenarioGallery`.**
  - It lists every scripted scenario and every played moment from the JSON fixtures, the shell states and every `dev/*.gallery.tsx` page (A3's `kit.gallery.tsx` included), discovered through `import.meta.glob`.
  - Each fixture renders the **full `GameScreen`** on a `FixtureGameSource`. Confirm shows "Would send …" after `validateAction`.
  - The URL hash selects the view: `#<id>?lang=zh-CN&theme=dark&board=p2`.
  - The page is served by the dev server and is not a build input.
- **Uses:**
  - the owner reviews the windows the wireframe did not design (Kiln selection, Setter's Mark, Test Pieces, Guild inspection, Jun, Salvage) and the table states;
  - Playwright takes screenshots from it;
  - phase B agents use it to check their components before the real game reaches them.

### 9.6 Playwright and CI

**Dependencies and layout.**

- `@playwright/test` `1.62.1` and `@axe-core/playwright` are added to `devDependencies` with exact versions (no caret). Browsers come from `npx playwright install chromium webkit`.
- `playwright.config.ts` is at the root. Specs live in `e2e/*.spec.ts`, outside vitest's `test/**/*.test.{ts,tsx}` include. The root `tsconfig.json` gains `e2e/**/*.ts`.
- `webServer` runs `npm run dev:local -- --port 4317 --strictPort`.

**Scripts.**

| Script | What it does |
| --- | --- |
| `test:e2e` | all local projects |
| `test:e2e:update` | updates the ARIA snapshots |
| `build:e2e` | `VITE_E2E_LOCAL_BACKEND=1 vite build --outDir output/dist-e2e` |
| `test:e2e:ci` | Chromium only, against `vite preview --outDir output/dist-e2e`, served with the backend's `configurePreviewServer`; runs `smoke.spec` and the `@ci` case of `full_game.spec` |

None of them is part of `npm test`.

**Projects.**

- Sizes: 320×568, 390×844, 768×1024, 844×390, 932×430, 1024×768, 1440×900, 2560×1080.
- `gallery.spec` runs at every size in EN-light and ZH-dark, all four language × scheme combinations at 390 and 1440, and a 200% root-font run at 390 and 1440 (reflow with no horizontal scroll).

| Spec | Checks |
| --- | --- |
| `gallery.spec.ts` | For every gallery entry × project:<br>• axe: no serious or critical violation;<br>• computed `font-size` ≥ 12px for every text node (≥ 13px for Chinese body text);<br>• `document.scrollingElement.scrollWidth ≤ innerWidth`;<br>• no clipped text (`scrollWidth > clientWidth` on text containers);<br>• focus is visible after Tab;<br>• on phone projects, every interactive element is ≥ 44×44 or has 44px spacing;<br>• no game text is hidden at one size and shown at another, except inactive phone sections and the collapsed sheet body;<br>• an ARIA snapshot of the decision pane.<br>Screenshots go to `output/ui-v1.6.1/screens/` (gitignored) for review. No pixel baselines are committed in phase 4: the art is not final, and baselines would churn |
| `full_game.spec.ts` | **The phase 4 exit.** Create a room, add computers, start, and play to final results through the UI only:<br>• 1440 EN with 4 players (1 human + 3 computers);<br>• 390 ZH with 2 players;<br>• 844×390 EN with 3 players;<br>• 1024 ZH with 2 players;<br>• `@ci`: 1440 EN, 1 human + 1 computer, `e2e_reset { policy: "canonical" }`.<br>A per-window autopilot reads `data-window` and chooses through native inputs, varying its choices so that the Materials Yard, Form & Decorate and Glaze & Load forms, Commission steps, Contributions, Heat markers, after-Quality, Orders and the trim are all exercised. Then it presses Confirm.<br>After **every** Confirm it asserts:<br>• none of the IDs from `e2e_secret_ids` appear in the DOM (text or attributes);<br>• none of the D3/D4 vocabulary appears;<br>• `document.activeElement` is not `<body>`;<br>• Confirm held focus while sending.<br>The language is switched mid-game once. A reload mid-game checks reconnect: same seat, same revision |
| `two_humans.spec.ts` | Two browser contexts (distinct `x-e2e-user`):<br>• the secret Contribution: neither sees the other's card before the reveal;<br>• the private Commission top 3 is visible only to its owner.<br>Parallel Salvage and hand-trim races are **not** steered through the browser. They are covered by platform `parallel_windows.test.ts` and the session tests (§9.2) |
| `keyboard_focus.spec.ts` | 1440 only (owner review 2026-10-17, items 2 and 3). One human on the keyboard and two computers: three work turns, each placing an Apprentice at Canal Wharf with Enter and confirming with Enter with the world scrolled to its bottom. When the turn comes back, focus is on Canal Wharf's Place shortcut, and a frame sampler finds no frame in which a control with the focus ring in the world lies above the world's top while the other players' turn toasts open, grow and close |

**CI.** B6 adds `.github/workflows/kiln-opening-ui.yml` at the repository root, subject to the owner's approval (§11), because it sits outside the app directory and uses CI minutes. It runs on `pull_request` (paths `apps/kiln-opening/**`) and on `workflow_dispatch`, with these steps:

1. `npm ci`;
2. `npx playwright install --with-deps chromium`;
3. the root gate (§10.1);
4. `npm run build:e2e && npm run test:e2e:ci`.

This exercises the **built** bundle (base path, asset URLs, CSS layer order after chunking), not the dev server. The existing `pages.yml` deploy workflow is unchanged.

Until the owner approves the workflow, `npm run ci:ui` (`tools/ci-ui-local.sh`) runs the same steps locally: the root gate, then `build:e2e` and `test:e2e:ci`; `-- --install` adds `npm ci` and the Chromium download. On a machine without Playwright's WebKit build, `KILN_E2E_CHROMIUM_ONLY=1` runs the phone and tablet projects in Chromium with the same viewport, touch and mobile emulation; WebKit stays the reference.

**Test-driver contract** (created by A2 and A3, used by every form):

- the form root has `data-window="<kind>"`;
- each option input has `name` and `value` equal to engine IDs;
- the Confirm button has `data-action="confirm"`, and the alternative button (End turn, End, Decline) has `data-action="alt"`.

---

## 10. Work packages, phases and gates

### 10.1 Gates

| Gate | Command | When |
| --- | --- | --- |
| Engine | `npm run typecheck:engine && npm run test:engine` | every commit |
| Platform | `npm run typecheck:platform && npm run test:platform`. It now also type-checks `tools/localBackendV161.ts`, `tools/uiFixtures.ts` and `tools/fixturePrivacy.ts`, and `tsconfig_includes.test.ts` fails on any include that matches nothing | every commit |
| Root | `npm run typecheck && npm run typecheck:edge && npm test && npm run build`. The `build` includes `next/index.html` and `next/playtest.html`, so it bundles the new app | every commit; the deploy workflow runs the same on `master` |
| UI (subset of Root) | `npm run test:ui` (= `vitest run test/v161/ui`), including the happy-dom tier | every commit |
| Fixtures | `npm run fixtures:check` (regenerate, byte-diff, privacy verify) | end of phases A, B and C |
| UI CI | the `kiln-opening-ui.yml` job (§9.6), or `npm run build:e2e && npm run test:e2e:ci` locally until it is approved | every PR from phase B on |
| E2E | `npm run test:e2e` (all projects) | end of phases B and C |
| Owner review | the gallery at the eight sizes, EN and ZH, beside the wireframes; the new windows and table states of §9.5 | end of phase B, before cutover |

Each agent works on its own branch or worktree cut from the phase tip, commits only green states, and rebases before merge. Files are disjoint (§4), so only A2 (phase A) and B6 (phase B) touch `package.json` and the lockfile.

### 10.2 Phase A: foundations (3 agents)

Phase A has a short contract step, then parallel work.

```
A·1  A1.1 engine contract ─┐        A3.1 i18n/kit contract ─┐        A2a session + infra (starts at once)
                           ▼                                 ▼                     │
A·2  A1 rest (selectors, fixtures)   A3 rest (kit, pieces, i18n)    A2b state, frame, stubs, harness, gallery
                                                                    (starts after A1.1 and A3.1 merge)
```

**A1: engine selectors and fixtures.**

- **A1.1, the contract commit, merged first.**
  - Additive types in `src/game/types.ts` for every §5 engine row (`HandLimitStatus`, `KilnLayoutView`, `FiringStageView`, `MaterialsYardOptions`, `GlazeLoadVesselOption`, `ImperialPriorityCeramicOption`, `RoundPhaseId`, …).
  - Implementations of the `GameModel` inputs: gap 3 (`trimDue`, `isFinalRound` export), gap 5 (`kilnLayout`), gaps 7 and 18 (`firingStageView`, `firingRecapView`), and gap 17 (`roundStructure.ts`).
  - Their tests.
- **A1 rest:**
  - gaps 8–12 and 14–16 in `selectors.ts` and `scoring.ts`, with `test/v161/engine/ui_selectors.test.ts` and an extended `selector_agreement.test.ts`;
  - `tools/uiFixtures.ts --target tests`, `tools/fixturePrivacy.ts` (extracted), and the own-secret privacy rule with its negative test;
  - `test/v161/ui/fixtures/{scenarios,moments,secrets}.json`, `tableScenarios.ts`, `test/v161/ui/fixtures_current.test.ts`;
  - moments m10–m18;
  - `docs/ENGINE_V1.6.1_DESIGN.md` §5.4 list and `docs/ui-v1.6.1/FIXTURES.md`.
- **Acceptance:**
  - engine, platform and root gates green;
  - `firingStageView` and `firingRecapView` pass their key allow-list;
  - every new selector agrees with `validateAction` (exhaustive where §5 says so);
  - the privacy verification passes for every moment and scenario, own secrets included;
  - `RULES_BEHAVIOUR_REVISION` and the content digest are unchanged (no rule or data change).

**A2: session, state, skeleton and dev infrastructure.**

- **A2a** needs nothing new and starts at once:
  - `src/app/session/*`;
  - `tools/localBackendV161.ts`, mounted through `configureServer` and `configurePreviewServer`;
  - `src/multiplayer/client.ts` (the `localEndpoint` option);
  - `vite.config.ts` (`next` and `next-playtest` inputs; mount `/test-api-v161`);
  - `tsconfig.json` (`e2e/**`), `tsconfig.platform.json` (`tools/*`);
  - `package.json`: scripts `test:ui`, `test:e2e`, `test:e2e:update`, `build:e2e`, `test:e2e:ci`, `fixtures`, `fixtures:check`; devDependencies `@playwright/test`, `@axe-core/playwright` and `happy-dom` (exact pins);
  - `playwright.config.ts`;
  - `test/v161/ui/session/*`, `test/v161/platform/tsconfig_includes.test.ts`.
- **A2b** starts after A1.1 and A3.1 merge:
  - `src/app/{main.tsx, App.tsx, theme.ts}`, `state/*`, `screens/*`, `motion/timeline.ts`;
  - `decision/{DecisionPane, windows, OwnSummary, ConfirmBar}.tsx`;
  - **stubs for every §4.2 file that is not A1's or A3's**;
  - `dev/{ScenarioGallery, gallery-main, CanonicalMoveButton}.tsx`, `next/{index,playtest,gallery}.html`;
  - `test/v161/ui/{support/*, state/*, interaction/frame.test.tsx, import_boundaries.test.ts}`;
  - `e2e/smoke.spec.ts`.
- **Acceptance:**
  - root, platform and engine gates green;
  - `npm run dev:local` → `/kiln-opening/next/`: create a room, add 1–3 computers, start, and see live revisions in stub panes;
  - `dev/CanonicalMoveButton.tsx` submits `legalCommands(view, { mode: "canonical", limit: 1 })[0]`, so one human can finish a full game against computers through the real store, client and local backend;
  - the A2 tests of §9.2 and §9.3 pass;
  - `e2e/smoke.spec.ts` passes at 1440, against both `dev:local` and `build:e2e` + preview.

**A3: design system, kit, pieces and i18n core.**

- **A3.1, the contract commit, merged early:**
  - `i18n/{defineNamespace, translator, richText, I18nProvider}` with `useT`;
  - `i18n/index.ts` and the empty catalogue stubs for every package;
  - `styles/{index,tokens,reset,base}.css`;
  - kit `Button`, `OptionCard` and `OptionGroup` with their final props.
- **A3 rest:**
  - the remaining `styles/*`, `kit/*` and `pieces/*`;
  - `i18n/{format, content, errors, orderText}.ts`, `catalog/{common, locationSummary, mp}.ts`;
  - `dev/kit.gallery.tsx`;
  - `test/v161/support/glossary.ts`, and the edit to `test/v161/engine/localization_content.test.ts` that imports it;
  - `test/v161/ui/{i18n,pieces,styles}/*`, `test/v161/ui/interaction/kit.test.tsx`.
- **Acceptance:**
  - the A3 catalogue, piece, CSS and kit interaction tests pass;
  - the kit gallery page renders every control and piece in light and dark at 12px+;
  - the ceramic 100-appearance test passes.

**Phase A exit:**

- all merged; gates green; `fixtures:check` green;
- B6 takes over the frozen contracts.

### 10.3 Phase B: features (6 agents in parallel)

All six depend on phase A only. Inside phase B, the only cross-package link is B4's `ActionWindow` composing B5's Canal Barge form, which works against its stub until B5 merges.

| WP | Scope (files in §4.2) | Acceptance |
| --- | --- | --- |
| **B1 Shell, log, lobby** | `shell/*`, `lobby/*`, `i18n/events.ts`, `catalog/{shell,lobby}.ts` | • the top bar at every container width, with full or numbered phases, and the two-row phone layout;<br>• seat chips with every D2 element;<br>• D1 seat chip → board, with the viewport-dependent behaviours of §8.1;<br>• D5 log at every width, with Escape and Show earlier;<br>• `SessionMenu` and `ConnectionBanner` in every status state;<br>• PhoneNav and the sheet (peek/open, short-landscape rail);<br>• the automatic section switch (wireframe `resetApp`) and focus rescue;<br>• coalesced live announcements of all three origins;<br>• lobby flows against the local backend;<br>• 64 event templates EN/ZH |
| **B2 Table and boards** | `table/*`, `boards/*`, `catalog/{table,boards}.ts` | • the m1/m2/m5 assertions of §9.2;<br>• Place shortcuts, `orderTargets` and highlighted ceramics through `TableSelection`, seen in SSR with seeded drafts;<br>• LookedOrders and FinishedCeramicsStrip;<br>• D1 board tabs (ARIA tabs);<br>• D7 wording;<br>• the Recognition track (rewards kept on phones) and the Tech display from content |
| **B3 Kiln, firing stage, results, Playtest V3** | `kiln/*`, `firing/*`, `results/*`, `playtest/*`, `catalog/{kiln,results,playtest}.ts` | • D3 takes over the column in the Firing Phase;<br>• the step rail with First-Player marks;<br>• the equation EN/ZH (two lines on phones);<br>• the R7 extra Fire card;<br>• the idle recap from `firingRecapView`;<br>• kiln targets and pending chips through `TableSelection`;<br>• the results podium, score and tie-break tables;<br>• the Playtest V3 page: draft save and restore (`restorePlaytestDraft`), per-discipline Techs, Kiln Die, Fuel Ledger ±2 only when T12 is owned (`reconcileFiringTechOwnership`), `validatePlaytestSubmission` issues rendered, submission through `submitPlaytest`, SSR tests EN/ZH for 2–4 players |
| **B4 Work and setup decisions** | `decision/setup/*`, `decision/work/**`, `catalog/work.ts` | • every work-phase window of §3.4 renders from scenarios and moments;<br>• draft tables;<br>• every choice from a selector (gaps 10, 12, 14–16);<br>• `expressibility.work.test.ts` green with no `todo` |
| **B5 Firing, Order, Cleanup and Results decisions** | `decision/{firing,orders,cleanup,results}/*`, `decision/Waiting.tsx`, `catalog/{firing,orders}.ts` | • every firing, Order, Cleanup and final window renders;<br>• Crackle verdicts from `crackleDeclarationChecks`, with the explicit `auto` mode;<br>• the Canal Barge form for B4;<br>• the sealed Contribution after submit and on reconnect;<br>• `expressibility.firing.test.ts` green with no `todo` |
| **B6 Contracts and integration** | the frozen files of §4.3, `tools/localBackendV161.ts` (`e2e_secret_ids`), the gallery, `rendered_text`, `expressibility_complete` and `form_driver_games` tests, the e2e specs, the CI workflow | • change requests landed as their own green commits;<br>• the integration tests green after the merge train;<br>• `gallery.spec` and `two_humans.spec` green;<br>• the UI CI job green, or its local equivalent |

**Merge train (B6).** Each step is one merge, and every merge is green:

1. B1, B2 and B3, in any order;
2. B5 (the Canal Barge form becomes real);
3. B4;
4. B6's `expressibility_complete.test.ts` and `form_driver_games.test.ts`, which would be red before steps 2 and 3 and so land only now;
5. `rendered_text.test.ts`, which lands earlier over whatever exists and is tightened here to the full list.

**Phase B exit:**

- all root, engine and platform gates green;
- `fixtures:check` green;
- `expressibility_complete` and `form_driver_games` green for 2/3/4 players;
- `full_game.spec.ts` green in at least the 1440 EN and 390 ZH projects;
- the UI CI check green;
- owner review of the gallery.

### 10.4 Phase C: hardening and cutover (1–2 agents)

**C1: hardening.**

- all `full_game.spec.ts` projects green; axe-clean galleries in every project; the font-floor, overflow, target-size and hidden-content checks; the 200% text runs;
- fixes land in the owning file, through B6 rules if that owner has finished;
- remove `dev/CanonicalMoveButton.tsx` and, if B1's lobby screens no longer render it, `dev/DevSessionPanel.tsx`.

**C2: cutover**, as two commits, each green.

1. **Swap.**
   - `index.html` → `/src/app/main.tsx`; `playtest/index.html` → `/src/app/playtest/main.tsx`, and fix its stale "V1.2.4" description.
   - `vite.config.ts` imports `localBackendPlugin` from `./tools/localBackendV161` and mounts it at `/test-api`; drop the `localEndpoint` option from `client.ts`.
   - Remove the `next/index.html` and `next/playtest.html` inputs. Move `next/gallery.html` → `gallery/index.html` (still dev-only), and update the gallery URLs in `playwright.config.ts` and the specs.
   - Enable the one-time removal of the V1.4 keys `kiln-opening:last-seat` and `kiln-opening:playtest-draft-v2` in `savedSeat.ts` and the playtest draft store.
   - Rewrite `README.md` for V1.6.1: rules source, `dev:local`, the test layout, the browser floor.
   - The V1.4 tests still pass, because `src/ui` still exists and nothing imports it.
2. **Delete** the §1.3 list, after the ports in its table.
   - `git mv tools/localBackendV161.ts tools/localBackend.ts`, and in the same commit update the `vite.config.ts` import and the `tsconfig.platform.json` include. `tsconfig_includes.test.ts` fails if either is missed.
   - Update the two comments (§1.3).
   - Update the docs:
     - ONLINE_GAME_SPEC "Transition status";
     - `RESPONSIVE_UI.md` replaced by a pointer to §7 of this document;
     - a superseded note atop `UI_UX_SPEC.md` pointing to §1.5;
     - phase 4 marked done in the implementation plan;
     - the DESIGN §9.1 note.

**Phase C exit (= phase 4 exit):**

- a full legal V1.6.1 game in EN and ZH on phone and desktop through `npm run dev:local` and through the built bundle;
- every gate green;
- no V1.4 code left in the tree.

---

## 11. Open points for the owner

None of these blocks phase A.

1. **New windows and states outside the wireframe sign-off.** They are designed in the existing decision-form pattern and reviewed in the gallery at the end of phase B:
   - Kiln selection, Setter's Mark, Test Pieces, Guild Shifu inspection (with Move up/down ordering), Jun (both windows, including the R7 extra Fire card) and Salvage;
   - Colour Samples, the Commission resource step and the after-action window;
   - the table states of §9.1 (empty kiln, Imperial-only firing, reshuffle, empty supply).
2. **Session controls.** The top bar gains `LanguageToggle` and a `SessionMenu` (Theme, room code, Leave view, End session), and a ConnectionBanner sits under it. None of these is in the wireframe. Confirm the placement, and whether a Theme choice is wanted at all; without one, the app follows the system.
3. **Deck counts.** The Main Order deck and discard counts and the Tech deck counts are shown, as in the wireframe. Only the Fire-deck count is withheld (D4). Confirm.
4. **Tech "Scores 1 VP when gained" reminder** (`UI_UX_SPEC`). It is printed tile text and will be rendered unless declined.
5. **Preferred Heat on glazed ceramics** (`UI_UX_SPEC`). It is not rendered until ruled on against D3.
6. **Browser floor.** Safari/iOS 16.4, Chrome/Edge 111, Firefox 121.
7. **CI job.** The repository-root workflow `kiln-opening-ui.yml` (§9.6): Chromium smoke and a short full game on PRs touching the app.
8. **Deployment** of the V1.6.1 migrations and Edge Functions together with the new client is a separate, owner-approved step after cutover (§1.4).

---

## 12. Review dispositions

Two reviews of revision 1 were applied: an engine review (E) and a UX review (U). Every finding was accepted unless stated otherwise.

### 12.1 Engine review

| # | Finding (severity) | Disposition | Where |
| --- | --- | --- | --- |
| E1 | Prepared Clay, Reworking Table and Imperial Priority choices have no selector (major) | **Accepted.** `materialsYardOptions`, `glazeLoadVesselOptions` and `imperialPriorityOptions.ceramics`, each with an agreement test. The reviewer's separate `reworkShapeOptions` is folded into `glazeLoadVesselOptions`, which returns Glazes and rework Shapes per vessel in one call. The vocabulary arrays only order choices | §5 gaps 14–16, §3.4, §2 |
| E2 | `firingStageView` misses the Second Firing extra Fire card (major) | **Accepted.** `extraFire` from `pendingExtraFire`, and per-ceramic `secondFireModifier` (replacing `secondFired`) | §5 gap 7, §3.4 `jun`, §9.2 B3 |
| E3 | The gallery cannot list scripted scenarios without test code (major) | **Accepted** (first option). The generator writes `scenarios.json`; the gallery and `FixtureGameSource` load JSON only | §9.1, §3.1, §2 |
| E4 | Phase B circular dependency; one test file with three owners (major) | **Accepted.** `form_driver_games` and `expressibility_complete` belong to B6 and land after B4 and B5. Expressibility is split per owner, with stub windows as `todo`. B5 owns the Canal Barge form and its rows | §9.4, §10.3, §4.3 |
| E5 | Phase A cannot run as three independent agents (major) | **Accepted.** A1.1 and A3.1 contract commits come first; A2a starts at once and A2b follows. A2's stubs exclude A3's paths. Rendered-markup i18n tests move to B6 (`rendered_text`). A3 gets `dev/kit.gallery.tsx`, discovered by a glob. A3 creates the glossary helper | §10.2, §4.2, §4.3, §6.4 |
| E6 | `ownSecrets` in fixtures fail the privacy checks (major) | **Accepted.** A `secret` key is allowed only under `ownSecrets[*].event` with `visibleTo === viewerId`, checked against the authoritative event; a negative test is added | §9.1 |
| E7 | The round trip does not hold for canonical commands; cap; signature (minor) | **Accepted.** `normalizeCommand` and the explicit `auto` declaration mode; build must validate; an exhaustive run with a stated cap; `legalCommands(view, { mode: "canonical", limit: 1 })` | §9.4, §10.2 |
| E8 | D3/D4 enforcement holes (minor) | **Accepted.** Added to the forbidden identifiers: `scorePreview`, `qualityForDifference`, `lastFiring`, `firingSummary`, `fireDeck` (also as a string) and `game.firing`. `IdleFiringRecap` uses `firingRecapView`. Markup assertions run on the full `GameScreen` (see also U1) | §2, §5 gap 18, §9.2 |
| E9 | `round_structure.json` is not exported; no phase mapping (minor) | **Accepted.** `ROUND_STRUCTURE` and `roundPhaseOf` in `src/game/roundStructure.ts`, kept outside the fingerprint inputs, with an exhaustive test | §5 gap 17 |
| E10 | V1.4 key cleanup would break the V1.4 app during phase 4 (minor) | **Accepted.** Removal happens only in cutover commit C2.1, and the playtest V2 draft key is removed too | §3.2, §10.4 |
| E11 | Draft keyed by revision resets on STALE; model memo per revision (minor) | **Accepted.** The draft-store rules (reset only on a window change or own success, otherwise revalidate); the memo is per view identity | §3.3, §3.5 |
| E12 | A new `commandId` per retry turns a committed command into a failure (minor) | **Accepted.** `PendingSubmission` is kept on a transport failure; Send again reuses the ID and revision; a session test is added | §3.1, §3.6 |
| E13 | Every ping reconnects; no event dedupe (minor) | **Partly accepted.** A ping first reads public events incrementally and reconnects only on change (plus a throttled room-status check); sequences are assigned and deduplicated. *Not adopted:* incremental private events on reconnect. That needs a `reconnect` request change in the service and the Edge Function. The cost is one seat's secret history and reconnects are now rare, so it is deferred | §3.2 |
| E14 | Computer race codes would show a false Retry banner (minor) | **Accepted.** `PERSISTENCE_CONFLICT` and `DUPLICATE_COMMAND` are handled like STALE. The host advances first, and others only after 2s | §3.8 |
| E15 | The two-humans parallel-window spec is impractical (minor) | **Accepted** (second option). Parallel races stay in platform `parallel_windows.test.ts` and the session tests. The browser spec keeps the secret Contribution and the private look. No `e2e_load_scenario` is needed | §9.6, §3.7 |
| E16 | `useSyncExternalStore` without `getServerSnapshot` breaks SSR (minor) | **Accepted.** `GameSource.getServerSnapshot`; every hook passes it; the harness test covers it | §3.1, §3.3, §9.2 |
| E17 | Cutover misses tsconfig, vite, Playwright and README edits; forget-seat code; counts (minor) | **Accepted.** Those steps are added to C2, with `tsconfig_includes.test.ts` as a guard. `RULES_FINGERPRINT_MISMATCH` is now a forget-seat code. The counts are corrected to 16 CSS files and 20 `.tsx` tests | §10.4, §3.9, §1.2, §1.3 |

### 12.2 UX review

| # | Finding (severity) | Disposition | Where |
| --- | --- | --- | --- |
| U1 | D3/D4 enforced only lexically; components receive forbidden data by type (major) | **Accepted.** `TableBoardView` omits `counts.fireDeck` and `firing`, and is built by picking fields. `useEngineView` is restricted to `decision/state/dev`. `firingRecapView` is added. The lexical scan and the full-screen markup scan remain as backups | §3.3, §2, §5, §9.2 |
| U2 | The extra Fire card is missing (major) | **Accepted**, as E2. It is rendered in HeatEquation and beside the target ceramic, with SSR on the R7 scenario and m18 | §5 gap 7, §4.1, §9.2 |
| U3 | `inert` pane versus focus on Confirm (major) | **Accepted.** Only `.pane-scroll` is inert; ConfirmBar uses `aria-disabled` and `aria-busy` with a handler guard; tested in happy-dom and e2e | §3.6, §8.2, §9.3, §9.6 |
| U4 | The phone tabs do not fit the ARIA tabs pattern (major) | **Accepted**, option (b): `nav` buttons with `aria-current`. The tabs pattern is kept for D1 board tabs only. An axe check at 390 and 1440 is in `gallery.spec` | §8.1, §4.1 |
| U5 | Focus targets hidden on phones (major) | **Accepted.** The skip link opens the sheet; a window change focuses the strip in `peek`; section-switch and focus-rescue rules; an e2e check that focus never falls to `<body>` | §8.1, §8.2, §9.6 |
| U6 | No rich text; HTML in seed strings (major) | **Accepted.** `t.rich` with whitelisted tag placeholders; `RichMessage` summaries; `dangerouslySetInnerHTML` forbidden; a catalogue test | §6.1, §2, §6.4 |
| U7 | No place for session and connection controls (major) | **Accepted.** `LanguageToggle`, `SessionMenu` and `ConnectionBanner` in B1, with a two-row phone top bar and SSR per status state | §4.1, §4.2, §10.3 |
| U8 | Game attributes only in `title` (major) | **Accepted.** `ceramicLabel` sr-only names, marker sr-only text, the `PieceDetail` kit component, and a test that every ceramic has a name in EN and ZH | §7.4, §9.2 |
| U9 | Large landscape phones, viewport behaviours, `dvh`, missing sizes (major) | **Accepted.** A height-based short-landscape query; `useLayoutMode` for the click behaviours; `dvh` and safe-area; projects at 320×568, 768×1024, 932×430 and 2560×1080; a 200% text run | §7.3, §8.1, §9.6 |
| U10 | Nothing in CI proves playability (major) | **Accepted.** `DraftModel.options`; synchronous table selection from the draft store; a happy-dom interaction tier; a CI job against the built bundle (subject to owner approval, §11); per-step leak, vocabulary and focus assertions in `full_game.spec` | §3.5, §9.3, §9.6 |
| U11 | Styling risks: px fonts, ZH floor, `light-dark()`, containers, lint gaps (major) | **Accepted.** A `rem` scale; 13px for Chinese body text; a light/dark block with `data-theme` set at boot instead of `light-dark()`; `#root` as the shell container and containers only on block wrappers; the lint covers `font:`, TSX `style` and the entry import order | §7 |
| U12 | Plurals, fallback, first-visit locale (minor) | **Accepted.** EN `{ one, other }` and ZH as one string; dev and production fallback; stored codes formatted at render; `navigator.languages`; the toggle-keeps-draft test | §6.1, §9.3 |
| U13 | Glossary §1.2–1.3 only partly captured (minor) | **Accepted.** Whole templates replace `resDelta`/`vpN`/`paren`; the full ZH rule list; `zh_punctuation`; the extended D7 list; scans of text nodes and aria/title/alt only | §6.3, §6.4 |
| U14 | The seed contains literal rule numbers (minor) | **Accepted.** Numbers become placeholders during seeding (gap 19); `locationSummary` is exempt by name | §5 gap 19, §6.1, §6.4 |
| U15 | Orders-section content and seat-chip details unowned (minor) | **Accepted.** `LookedOrders` and `FinishedCeramicsStrip` in B2; `orderTargets` states; seat chips with hand count, kiln short name and the final total | §4.1, §4.2, §3.5, §9.2 |
| U16 | Still-valid `UI_UX_SPEC` items not reconciled (minor) | **Accepted.** The §1.5 table; Preferred Heat and the Tech VP reminder go to the owner; no width-based content hiding, checked in `gallery.spec` | §1.5, §7.3, §11 |
| U17 | Keyboard gaps in decision forms (minor) | **Accepted.** The sub-editor sits outside the label; drafts per location; disabled radios ignored; `ReorderList` for the Guild order; the 44px check | §8.1, §3.5, §9.6 |
| U18 | Remote events not announced; no coalescing (minor) | **Accepted.** Remote `lastBatch`, coalescing at least 1.5s apart, "your turn" last, and a log cap with Show earlier | §3.2, §8.3 |
| U19 | `scorePreview` not forbidden; deck-count rule unstated; narrow vocabulary (minor) | **Accepted.** It is now forbidden; the deck-count statement is added with an owner confirmation; the bilingual vocabulary is widened, with the Fuel Ledger allowance | §2, §5, §9.2, §11 |
| U20 | Public table states not covered by fixtures (minor) | **Accepted.** The `tableScenarios.ts` list and the shell-state fixtures through `FakeGameApi`, all in the gallery and the EN/ZH SSR set | §9.1 |

Rejected findings: none outright. One part was deferred, with its reason: E13's incremental private-event read on reconnect.
