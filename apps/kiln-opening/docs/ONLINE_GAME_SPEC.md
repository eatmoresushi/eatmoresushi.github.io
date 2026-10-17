# ONLINE_GAME_SPEC.md — V1.6.2

## Goal

A synchronous 2–4 player browser version for remote playtesting. The digital version automates administration while preserving every decision and every piece of hidden information.

The [V1.6.2 Player Rulebook](./KILN_OPENING_v1.6.2_EN_SOURCE.md) and its [audit](./RULEBOOK_AUDIT_V1.6.2.md) govern the rules. The [engine design](./ENGINE_V1.6.1_DESIGN.md), as amended by the [V1.6.2 delta](./ENGINE_V1.6.2_DELTA.md), is the contract for the engine and the multiplayer layer. This document describes how the online game behaves; it restates no rule and never overrides the rulebook.

## Transition status

- The V1.6.2 engine (`src/game`), multiplayer service (`src/multiplayer`), Edge Functions (`supabase/functions`) and migrations (`202610150001_v161_rules.sql`, `202610150002_playtest_v161.sql`, written for V1.6.1 and edited in place for V1.6.2 before any deployment; nothing has been deployed) are the current server.
- The browser UI still runs the pinned V1.4 copies (`src/game-v14`, `src/multiplayer-v14`, `src/playtest-v14`) until the UI phase replaces it with the table UI in `src/app`, which the UI stage moves to the V1.6.2 commands. The UI phase also deletes those copies.
- The SQL migrations, both Edge Functions and the client must be deployed together. The migration replaces the V1.4 signatures of `server_add_computer_seat` and `server_commit_start`, so a V1.4 Edge Function cannot run against it. Checked-in migrations do not apply themselves.

## Rooms and seats

### Create, join, lobby

- The host enters a display name (1–40 characters). The server creates a six-character room code and a stable seat credential. The browser keeps the raw seat token in durable per-room storage; the server stores only its hash.
- Players join with the room code and a display name, up to 4 seats. An authenticated account holds at most one seat per room.
- The lobby shows seats, the host, and computer seats. The host starts the game with 2–4 seats.
- Every room is stamped `rules_version = content_version = '1.6.2'` and the server's rules fingerprint `r30-<digest>` (`RULES_BEHAVIOUR_REVISION` 30). Joining or adding a computer to any other room is refused before a seat is written.

### Computer players

- The host may add or remove computer seats in the lobby. A room keeps at least one human seat (the host) and may hold up to three computers.
- Each computer seat has a private seed and a policy label `rules-v1.6.2-<name>-<nnn>`, stamped from the service's configured policy. The database accepts any label of that shape, so a new policy needs no migration.
- The browser never chooses a computer's command. An authenticated seat asks the service to advance (`advance_computers`); the service decides everything else.
- **Policy interface.** A policy (`ComputerPolicy` in `src/multiplayer/computerPolicy.ts`) receives only that seat's `ActorView` — the public projection plus its own hand, its own pending look or Test Pieces peek, and its own sealed Contribution — and proposes one command. It never sees `GameState`, deck order, another hand or an unrevealed Contribution. The default is the strategic policy (`rules-v1.6.2-strategic-001`); the canonical policy (`rules-v1.6.2-canonical-001`), a seeded choice among the canonical legal commands, is also available.
- **Fallback.** The service shape-checks the proposal with `parseCommand` and applies it through the engine. A missing, malformed, illegal or throwing proposal falls back to `legalCommands(view, {mode: "canonical"})` (in the Contribution window: Tend first). The first command the engine accepts is committed with the same revision checks as a human command.
- **Failures leak nothing.** A policy can see its own private cards, so its exception message may name them. The cause is logged server-side only. If no candidate is legal, the response is `COMPUTER_TURN_FAILED` with the fixed message "<name> could not choose an action." and the state is unchanged.
- Consecutive computer decisions run in bounded batches (24 per request). Concurrent advance requests are safe: compare-and-swap persistence accepts each revision once.

## Who acts

Every consumer routes on the engine's `decisionPrompt(state)` alone, never on a phase rule of its own:

| Mode | Phases | Behaviour |
| --- | --- | --- |
| `single` | Kiln selection, Setter's Mark, Work turns (with their private looks and the Colour Samples swap), Test Pieces, Heat markers, Jun windows, after-Quality, the Second Firing choice, Order Phase | Exactly one actor. Commands must name the current revision. |
| `parallel` | `firing_salvage`, `cleanup_hand_limit` | Several actors, independent choices about their own ceramics or hand, in any order. |
| `simultaneous_secret` | `firing_contributions` | Each eligible participant seals one Contribution; all are revealed together. |

- The client calls `advance_computers` whenever any actor in `decisionPrompt(game).actorIds` is a computer seat, whatever the mode (`shouldAdvanceComputers`).
- The service advances the first computer seat in the prompt's actors, repeatedly, until a human must act, the game ends or the batch cap is reached.
- **Revision races in shared windows.** In a `parallel` window a human and a computer may act at the same time. A command based on any revision since the window opened (`openedAtRevision`) is validated against the current head while its actor is still pending; a commit conflict is retried up to 3 times with a fresh head. Every other phase requires the exact current revision (`STALE_REVISION` otherwise).
- Contributions use compare-and-swap on the head and on the window: a submission for a window that is not open is `PRIVATE_WINDOW_MISMATCH`, a second submission per seat and window is refused, and concurrent submissions are retried against the fresh head and the fresh set of sealed choices.

## Commands

- Every command is untrusted JSON. `parseCommand` shape-checks it — `SUBMIT_CONTRIBUTION` included — before the service branches on its type (`MALFORMED_ACTION` otherwise).
- Each command carries a UUID `commandId`. Replaying an accepted ID returns the stored response to the same seat and commits nothing; another seat using the ID gets `DUPLICATE_COMMAND` This holds after the room is `finished` or `abandoned`, including for the command that ended the game; only a new ID is refused with `SESSION_ENDED`.
- The engine validates on the actor's view only, so a rule error can never mention hidden information. Rule errors are typed (`GameRuleError.code` + `details`) and localised from `RULE_ERROR_TEXT`.
- Worker actions whose choices are all known when they are made are single commands (Materials Yard, Form & Decorate, Glaze & Load, Apprentice Guild purchases, Canal Wharf, Magistrate's Hall, Imperial Priority). Steps that follow a private reveal are separate commands: the Commission Market reservations after its look (`COMMISSION_CHOOSE`), the Guild Hall Shifu's takes and bottom order after the inspection (`GUILD_TAKE`, `GUILD_FINISH`), Colour Samples' reservation when acquired and its swap (`USE_COLOUR_SAMPLES_SWAP`, then `COLOUR_SAMPLES_SWAP_CHOOSE`), the Second Firing choice after its 2 cards are revealed, and the Test Pieces bury decision.
- Everything that needs no decision runs inside the command that reaches it: the Kiln Die roll, the round-start rotation, readying abilities, skipped windows, the Fire reveal, Actual Heat, Quality, Canal Barge's 2 Coins, the end of a Work turn with nothing left in the after-action window, the deferred Order and Tech display refills, the end of a Guild Hall Shifu's action when no decision is left, skipping a player with nothing to complete in the Order Phase, and final scoring.

## Responses and events

- Every response carries the public projection (`PublicGameState`: the state without `hidden`, plus public counts) and the command's public events.
- The acting seat's response also carries its own `PrivatePlayerView` (hand, own pending look, own Test Pieces peek, own sealed Contribution with its Fuel Ledger commitment) and the `secret` payloads of that command's events addressed to it (`ownSecrets`).
- In-game VP is public and recorded as it is scored: Orders, Ru/Guan, Imperial Audience, Crowns beyond Recognition 4 and, under owner amendment A1, each Advanced Tech's 1 VP the moment it is gained (`ScoreLedger.techs`, carried on `TECH_ACQUIRED.vp`). `playerSummary(...).recordedVp` and `scorePreview` include Tech VP from the purchase on; the final breakdown still lists it as its own Tech line and never adds it again at game end.
- Events are the presentation timeline, in resolution order. Events with a `secret` — the setup deal, private looks, reservations from a look and the Canal Wharf Shifu's unseen card, the looked-at Orders put under the Main deck, the held Order a Colour Samples swap discards, the Guild bottom order, the Test Pieces peek, hand trims — are published without it. `CONTRIBUTION_SUBMITTED` never carries a card; cards appear only in `CONTRIBUTIONS_REVEALED`.
- The game start persists `createGame`'s events, including each seat's secret deal, so the public event count always equals `eventSequence` and the event log can be reloaded by sequence.
- The seat-private event log (`list_private_events`) returns, for the authenticated seat only, every event whose secret is addressed to it, with the secret intact. A non-host seat receives its setup deal this way; a reconnecting seat recovers secrets that are not in its private view, such as the Guild bottom order it chose.

## Reconnect

Refreshing the browser or a network loss never forfeits a seat. On reconnect the service:

- authenticates the stored seat credential and re-checks the room's rules version and fingerprint;
- returns the same seat, the public projection, and the seat's own `PrivatePlayerView`, rebuilt from the authoritative head and the open window's stored submissions — so a seat that already sealed its Contribution sees its own card and Fuel Ledger commitment;
- returns the seat's own private event log;
- writes nothing.

## Hidden information

- Public: every ceramic and its attributes (Shaped, loaded, Finished, delivered; Imperial modifier; Kiln Furniture; Heat markers, turned or face down), resources, the Kiln Die, the Fire discard, the displays, owned Techs, completed Orders and Recognition, and hand counts.
- Private to the owner: the Order hand and setup deal; the Commission Market looks (top 2 or 3) and the Colour Samples looks (top 3 when acquired, top 2 for a swap); which looked-at Orders went under the Main deck; the held Order a swap discarded; the Guild Hall Shifu inspection and chosen bottom order; the Test Pieces peek; reservations from a look and the Canal Wharf Shifu's card; Cleanup discards; a sealed Contribution and its Fuel Ledger commitment until every participant has submitted.
- Private to nobody: deck orders (Main, Tech, Fire; several looked-at Orders go under the Main deck in random order, R19, so not even the looker knows their order) and the face-down Main discard (only its count is public).
- The authoritative state, full events, raw commands and sealed submissions live only in the `private` schema, readable by the service role. Browser roles read only their own rooms' public rows under RLS. The commit RPCs refuse a public state that carries `hidden` and a public event that carries `secret`.

## Versions and compatibility

- Only V1.6.2 rooms with the server's own `r30-` fingerprint and schema-7 saves continue. A V1.6.1 or V1.4 room is refused by version (`UNSUPPORTED_RULES_VERSION`); a room whose fingerprint differs — older revision, missing or foreign digest — is refused with `RULES_FINGERPRINT_MISMATCH`. Nothing is migrated or relabelled; old rows remain as history.
- The client refuses any snapshot whose room or game is not V1.6.2 / schema 7 and drops its private payload.

## Session lifecycle

The host may end a lobby or active game for everyone after an explicit confirmation. This is a service operation outside the rules engine and does not count as normal game completion.

- The room status becomes `abandoned` with the ending time and host player ID; the update is broadcast.
- Reconnect still works and shows the ended session; no further commands are accepted.
- Repeating the operation is safe. Non-hosts get `HOST_ONLY`.

Abandoned sessions are kept 7 days and finished games 30 days for debugging; a daily job deletes expired rooms and their cascaded rows.

## No timers, undo, spectators or chat

- No clocks or automatic turns.
- No undo after a command is committed; the UI confirms irreversible actions.
- Spectators and chat are not part of the MVP.

## Localization

English is the default. An `EN / 中文` control switches every player-facing label, card, rule error and result between English and Simplified Chinese. It is presentation only: both languages render the same stable IDs and never change game state.

## Playtest form

The playtest form records physical-table games as Form V3 for rules V1.6.2 (`src/playtest`): setup per player (Kiln, up to one Tech per discipline), per-round Kiln Die, Contributions (incl. Fuel Ledger's −2/+2), Shared and Imperial loading, Orders completed, Kiln ability use, Fire card and Firing Techs used, and end-game results. See [PLAYTEST_FORM.md](./PLAYTEST_FORM.md) and [PLAYTEST_TELEMETRY.md](./PLAYTEST_TELEMETRY.md).
