# ENGINEERING_ARCHITECTURE.md

## Recommended stack

- React
- TypeScript
- Vite
- Supabase
- Vitest
- Playwright
- GitHub Actions
- GitHub Pages for static client

The user's existing GitHub Pages custom domain can host the client. A backend is still required for realtime multiplayer and authoritative rules.

## Separation of concerns

### `src/game/`

Pure TypeScript. No React, DOM, network, Supabase or localStorage.

Suggested modules:

```text
src/game/
├── ids.ts
├── types.ts
├── state.ts
├── setup.ts
├── actions.ts
├── validation.ts
├── reducer.ts
├── workerPlacement.ts
├── ceramics.ts
├── firing.ts
├── orders.ts
├── techniques.ts
├── kilns.ts
├── scoring.ts
├── rng.ts
└── selectors.ts
```

### `src/ui/`

React rendering and interaction only.

### `src/multiplayer/`

Room/realtime API client.

### `supabase/functions/game-action/`

Server endpoint that:

1. authenticates room/seat;
2. loads authoritative state;
3. validates command via game engine;
4. applies command;
5. persists state/event;
6. broadcasts updated public state.

## State model

Use stable IDs rather than array indexes.

Sketch:

```ts
interface GameState {
  version: number;
  gameId: string;
  rulesVersion: "0.6.5";
  status: "lobby" | "setup" | "playing" | "finished";
  playerOrder: PlayerId[];
  firstPlayerId: PlayerId;
  activePlayerId?: PlayerId;
  round: 1 | 2 | 3 | 4 | 5;
  phase: GamePhase;
  timingWindow?: TimingWindow;

  players: Record<PlayerId, PlayerState>;

  actionBoard: ActionBoardState;
  kiln: KilnState;

  marketDeck: OrderId[];
  marketDisplay: OrderId[];
  imperialDeck: OrderId[];
  imperialDisplay: OrderId[];

  techniqueDecks: Record<TechniqueDiscipline, TechniqueId[]>;
  techniqueDisplay: Record<TechniqueDiscipline, TechniqueId[]>;

  fireDeck: FireModifier[];
  fireDiscard: FireModifier[];

  vesselSupply: Record<Shape, VesselInstanceId[]>;
  imperialSealOwner?: PlayerId;

  eventSeq: number;
}
```

Ceramics should be instances, not just Shape counts, because each acquires Glaze/Decoration/Quality and moves through zones/orders.

## Commands

Prefer explicit commands such as:

```ts
type GameAction =
  | { type: "PLACE_WORKER"; workerId: WorkerId; location: LocationId }
  | { type: "MATERIALS_GAIN"; clay: number; wood: number }
  | { type: "FORM_VESSELS"; shapes: Shape[] }
  | { type: "GLAZE_CERAMICS"; selections: GlazeSelection[] }
  | { type: "LOAD_KILN"; ceramicIds: CeramicId[]; spaceIds: KilnSpaceId[] }
  | { type: "TAKE_ORDERS"; orderIds: OrderId[]; withCoinBonus?: boolean }
  | { type: "BUY_TECHNIQUE"; techniqueId: TechniqueId; shifuRefreshId?: TechniqueId }
  | { type: "PASS" }
  | { type: "USE_KILN_SETTING"; ceramicId: CeramicId; toSpaceId: KilnSpaceId }
  | { type: "SUBMIT_WOOD"; amount: 0|1|2|3 }
  | { type: "USE_FUEL_LEDGER" }
  | { type: "USE_JUN"; ceramicId: CeramicId; delta: -1|1 }
  | { type: "USE_GE"; ceramicId: CeramicId }
  | { type: "USE_SAGGAR"; ceramicId: CeramicId }
  | { type: "COMPLETE_ORDER"; orderId: OrderId; ceramicIds: CeramicId[] }
  | { type: "CHOOSE_PRESENTATION"; ceramicIds: CeramicId[] };
```

Some actions are two-step UI interactions but should commit atomically when possible.

## Event log

Persist a chronological event log in addition to the latest snapshot.

Benefits:

- reconnect debugging;
- replay;
- desync diagnosis;
- balance telemetry;
- deterministic test fixtures.

Never publish secret contribution payloads before reveal.

## Database sketch

Possible tables:

- `rooms`
- `room_players`
- `game_snapshots`
- `game_events`
- `private_submissions`

`private_submissions` holds unrevealed Wood Contribution values. RLS/service-role design must prevent one player from reading another player's submission.

## Realtime

Broadcast public snapshot/event updates after each committed action.

For normal Work actions, clients can optimistically animate only after server acceptance.

For secret simultaneous submissions, broadcast only `playerSubmitted=true` status until server reveal.

## Randomness

All deck shuffles should use a server-generated seed recorded at game creation.

Engine should accept an injected RNG so tests can reproduce exact deck order.

## GitHub Pages deployment

Build client as a static SPA.

If deploying under repository path instead of apex domain, configure Vite base path accordingly.

If using custom domain, preserve CNAME/deployment configuration already present in the user's site.

Backend URL and public Supabase key are build-time environment variables; service-role keys never enter frontend.

## Security boundaries

Server must validate:

- actor's turn;
- worker ownership/availability;
- action capacity;
- resource/coin affordability;
- legal ceramic state;
- Order hand limit;
- Technique slots;
- timing window;
- hidden submission eligibility;
- Order matching;
- scoring.

Client-side validation is UX only.
