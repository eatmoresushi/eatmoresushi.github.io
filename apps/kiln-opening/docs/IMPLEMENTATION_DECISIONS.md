# IMPLEMENTATION_DECISIONS.md — V1.6.1

The [V1.6.1 Player Rulebook](./KILN_OPENING_v1.6.1_EN_SOURCE.md) governs mechanics. The [audit](./RULEBOOK_AUDIT_V1.6.1.md) records the owner's amendments and rulings (R1–R13, B1–B3), editorial corrections, interpretations and digital decisions. The [engine design](./ENGINE_V1.6.1_DESIGN.md) is the implementation contract. This document lists how the online game represents those rules; where it summarises a ruling, the audit is authoritative.

## Versions and identifiers

- Rules `1.6.1`, state schema 6, `RULES_BEHAVIOUR_REVISION` 29. A room stores `r29-<content digest>`; a V1.4 room (schema 5, revision ≤ 28) is rejected, never migrated (DIG).
- Stable IDs: Orders S01–S16 and O01–O48; Techs T01, T05, T10–T25 (retired T02–T04, T06–T09 and ST01–ST04 are never reused); Kilns RU, GU, GE, DI, JU; locations `materials_yard`, `commission_market`, `guild_hall`, `canal_wharf`, `magistrates_hall`, `form_decorate`, `glaze_load`; Shared Kiln spaces `high_1…3`, `middle_1…3`, `low_1…2`.
- Content values come only from `data/*.json` through `src/game/content.ts`. Game state is plain JSON and must survive Postgres `jsonb`'s key reordering: no rule depends on the key order of a `Record`.

## Engine boundaries

- The engine is pure and deterministic. All randomness goes through the seeded `RandomSource`; the service stores the RNG state with every revision.
- Validation sees only the actor's view (public projection + own private data). The UI, the computer player and the server call the same validators, so nothing offered to a client can be rejected for a reason it could not see.
- Every secret is structurally separate: server-only state under `GameState.hidden`, unrevealed Contributions in `PrivateFiringState`, private event payloads under `secret`. The public projection drops all three by construction.
- Timing windows mirror Appendix D one-to-one. A window opens only when someone has a decision; otherwise it resolves inside the command that reaches it. Every window has an always-legal exit.

## Setup and rounds

- Setup deals each player 2 Starting Orders and 1 Main Order secretly, reveals 6 Main Orders and 2 Techs per discipline, then picks the First Player at random. Kiln selection runs in reverse turn order over all five Kilns (R1).
- The server rolls the Kiln Die publicly at the start of every round, Round 1 included (INT). The rotation in Rounds 2–5 discards the 2 leftmost Main Orders, slides and refills (B1 for an empty supply; every refill compacts and fills all empty positions as cards allow, design §11 Q2).
- Setter's Mark placement is optional and asked at the start of the Work Phase (INT).

## Work Phase

- One worker action per Work turn; there is no pass. Canal Wharf is always legal.
- The before/after-action window offers Canal Barge and Imperial Priority in either order (INT). The after-action window opens whenever Canal Barge is owned and unused this round, regardless of the hand, so its opening reveals nothing. A face-up reservation's display refill is deferred to the end of that turn (INT).
- Commission Market: a face-up reservation and its resource are one command; a blind or top-3 reservation reveals a card first, so the resource is chosen in a following step. The Shifu top-3 look and Colour Samples look are private (B3); unchosen looked-at Orders go face down to the discard.
- Guild Hall: the Shifu's inspection and the bottom order of untaken Techs are private; they return to the bottom before the display refills (B2).
- Optional Tech and Kiln abilities may be declined without spending a once-per-round use (R4). Kiln Tending resolves automatically on the first qualifying Glaze & Load each round (INT). Colour Samples' when-acquired reservation is mandatory whenever a Main Order can be looked at (R4).
- Reworking Table with Imperial Priority is allowed (design §11 Q1); Glaze & Load placement legality uses current Shapes only (Q3).

## Firing Phase

1. Nothing loaded: the firing is skipped and no Fire card is revealed.
2. Contributions: players with a Shared Kiln ceramic seal one card each, in any order. Fuel Ledger is a separate secret commitment on Bank or Stoke (`fuelLedger: true`, ±2 Heat for 1 extra Wood), stored in `private.private_submissions.use_fuel_ledger`. With no participant the window is skipped (INT).
3. On the last submission the server revalidates every sealed choice, pays, reveals all cards together and sets Base Heat = clamp(Kiln Die + Contributions, 0, 5).
4. Test Pieces (private peek, public bury), then the Heat-marker step in First Player order (INT), then the Fire card is revealed automatically and Actual Heat calculated.
5. Jun, Quality, then after-Quality abilities (Protective Saggars, Second Firing, Ge) in each owner's chosen order with eligibility rechecked after each use. Jun on the Second Firing ceramic follows R7.
6. Salvage of a still-Flawed ceramic: every eligible player decides independently, in any order (a `parallel` window).

## Orders, Cleanup and scoring

- The Order Phase is a single pass in First Player order; a player with nothing completable is skipped automatically (INT). Crackle declarations are either omitted (the engine searches and records the first that works) or given and used exactly.
- Cleanup returns workers and Setter's Marks; players over their hand limit discard in any order (a `parallel` window). The trim is skipped in Round 5 (INT).
- Exhibition is automatic (INT). Advanced Tech VP is recorded in the score ledger when the Tech is gained (owner amendment A1; `ScoreLedger.techs`, `TECH_ACQUIRED.vp`), so mid-game scores and the score preview include it; final scoring shows it as a separate Tech line read from the ledger and does not add it again. Final totals and tie-breakers are unchanged, because no effect removes a Tech. Final scoring and tie-breakers are computed by the server.

## Multiplayer

- **Routing.** Clients and the service decide who acts from `decisionPrompt(state)` only: `single`, `parallel` (`firing_salvage`, `cleanup_hand_limit`) or `simultaneous_secret` (`firing_contributions`). A computer seat is advanced whenever it is among the actors, in every mode.
- **Revisions.** Commands normally name the current revision. In a `parallel` window a command based on any revision since the window opened is validated against the current head while its actor is pending, and a commit conflict is retried up to 3 times. Contributions are compare-and-swap on the head and the window.
- **Untrusted input.** `parseCommand` shape-checks every command before the service branches on it.
- **Private delivery.** Responses carry the public projection and public events; the acting seat also receives its own `PrivatePlayerView` and its own event secrets. Reconnect rebuilds the private view from the head and the stored submissions and returns the seat's private event log. The game start persists `createGame`'s events, so the event count equals `eventSequence`.
- **Computer players.** A policy sees only its seat's `ActorView`. Its proposal is shape-checked and validated; on failure the service falls back to the canonical legal commands. A policy's exception is logged server-side, never returned: the response says only "<name> could not choose an action." The stored response of a computer command carries no private view.
- **Storage.** The in-memory store mirrors the Supabase RPCs and can apply `jsonb` key order on every read and write; a full seeded game ends in the same state hash either way.
- **Database.** `202610150001_v161_rules.sql` rewrites every V1.4 gate (`server_create_room`, `server_join_room`, `server_add_computer_seat`, `server_commit_start`, `server_commit_transition`), allows `'1.6.1'` and `^r29-` fingerprints, restricts new private submissions to Bank/Tend/Stoke with the Fuel Ledger commitment, returns `fuelLedger` from the submission RPCs, persists the game start's events, refuses public rows carrying `hidden` or `secret`, and adds the seat-checked `server_list_private_events`. Older rows stay as history.

## Playtest form

Form V3 records V1.6.1 tables: Kilns (all five), at most one Tech per discipline, the round's Kiln Die (Base Heat = Kiln Die + Contributions, clamped 0–5), Contributions incl. Fuel Ledger's −2/+2, Shared and Imperial loads, Orders, Kiln ability uses, the Fire card and the Firing Techs used. `202610150002_playtest_v161.sql` accepts only Form V3 for V1.6.1 and keeps every earlier submission readable.

## Localization

English and Simplified Chinese render the same stable IDs; Chinese text follows the [glossary](./GLOSSARY_ZH_V1.6.1.md). Switching language never changes game state.
