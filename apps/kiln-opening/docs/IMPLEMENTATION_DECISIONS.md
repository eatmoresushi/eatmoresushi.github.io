# IMPLEMENTATION_DECISIONS.md — V1.6.2

The [V1.6.2 Player Rulebook](./KILN_OPENING_v1.6.2_EN_SOURCE.md) governs mechanics. The [audit](./RULEBOOK_AUDIT_V1.6.2.md) records the owner's revisions (the latest, revision 3 of 2026-10-18, is changes 25–27), amendments and rulings (A1, superseded by change 27; A2; R1–R19, B1–B3), editorial corrections, interpretations and digital decisions. The [engine design](./ENGINE_V1.6.1_DESIGN.md), as amended by the [V1.6.2 delta](./ENGINE_V1.6.2_DELTA.md), is the implementation contract. This document lists how the online game represents those rules; where it summarises a ruling, the audit is authoritative.

## Versions and identifiers

- Rules `1.6.2`, state schema 8, `RULES_BEHAVIOUR_REVISION` 31. A room stores `r31-<content digest>`; a room from before owner revision 3 (schema 7, `r30-`), a V1.6.1 room (schema 6, `r29-`) or a V1.4 room (schema 5, revision ≤ 28) is rejected, never migrated (DIG).
- Stable IDs: Orders S01–S08 and O01–O48 (owner revision 2 rebuilt the Starting deck under S01–S08; S09–S16 are retired); Techs T01, T05, T10–T25 (retired T02–T04, T06–T09 and ST01–ST04 are never reused); Kilns RU, GU, GE, DI, JU; Contribution cards `BANK`, `TEND`, `STOKE`, `FUEL_LEDGER_BANK`, `FUEL_LEDGER_STOKE`; locations `materials_yard`, `commission_market`, `guild_hall`, `canal_wharf`, `magistrates_hall`, `form_decorate`, `glaze_load`; Shared Kiln spaces `high_1…3`, `middle_1…3`, `low_1…2`.
- Content values come only from `data/*.json` through `src/game/content.ts`. Game state is plain JSON and must survive Postgres `jsonb`'s key reordering: no rule depends on the key order of a `Record`.

## Engine boundaries

- The engine is pure and deterministic. All randomness goes through the seeded `RandomSource`, including the order in which several looked Orders go under the Main deck (R19); the service stores the RNG state with every revision.
- Validation sees only the actor's view (public projection + own private data). The UI, the computer player and the server call the same validators, so nothing offered to a client can be rejected for a reason it could not see.
- Every secret is structurally separate: server-only state under `GameState.hidden`, unrevealed Contributions in `PrivateFiringState`, private event payloads under `secret`. The public projection drops all three by construction.
- Timing windows mirror Appendix D one-to-one. A window opens only when someone has a decision; otherwise it resolves inside the command that reaches it. Every window has an always-legal exit.

## Setup and rounds

- Setup deals each player 2 Starting Orders and 1 Main Order secretly from the 8-card Starting deck (a 4-player game deals all 8; otherwise the rest go to the box), reveals 6 Main Orders and 2 Techs per discipline, then picks the First Player at random. Kiln selection runs in reverse turn order over all five Kilns (R1).
- The server rolls the Kiln Die publicly at the start of every round, Round 1 included (INT). The rotation in Rounds 2–5 discards the 2 leftmost Main Orders face down, slides and refills (B1 for an empty supply; every refill compacts and fills all empty positions as cards allow, provisional default P2).
- Setter's Mark placement is optional and asked at the start of the Work Phase (INT).

## Work Phase

- One worker action per Work turn; there is no pass. Canal Wharf is always legal; its Shifu gains 4 Coins and then takes the top Main Order unseen (B1: no card when the deck and the discard are both empty).
- The before/after-action window offers the Colour Samples swap and Imperial Priority in either order (INT). It opens on public facts only (Imperial Priority usable, or Colour Samples owned, unused this round and at least 1 held Order), so its opening reveals nothing about the hand. A face-up reservation's display refill is deferred to the end of that turn, after the window (INT).
- Select N (change 25): every Select is one private look of the top N Main Orders (as many as remain, R16) followed by one `SELECT_CHOOSE`, whose picks are looked cards (secret) or face-up Orders (public; the position stays empty until the turn ends, then the display refills). The looked cards not reserved go face down to the bottom of the Main deck (change 24), several in random order (R19); which they are is private to the looker (B3). The step carries `select: { n, maxReservations, fromDisplay, lookedCount }`.
- Commission Market: the placement always opens the Select (Select 2 for the Apprentice effect, Select 3 for the Shifu effect, Senior Apprentice included); `SELECT_CHOOSE` reserves exactly 1 (Apprentice) or 1–2 (Shifu) in any mix. No resource is gained.
- Colour Samples: when acquired, a Select 3 with 1 mandatory reservation (R4) whenever an Order can be reserved. Its once-per-round swap (`USE_COLOUR_SAMPLES_SWAP`, then `SELECT_CHOOSE`) discards the held Order first (R17: a Main Order face down to the discard, a Starting Order to the box), then Selects 3. It can be used only if that Select could reserve an Order: a card to look at (counting the discarded Order, R17) or a face-up Order (B1).
- Guild Hall: the Apprentice buys 1 face-up Tech at printed cost. The Shifu's inspection is private; the Shifu then takes 1 or 2 Techs from different disciplines at printed cost, one `GUILD_TAKE` each, and `GUILD_FINISH` puts the untaken inspected Techs on the bottom in a private chosen order (B2). A taken Tech's position stays empty until the taker's turn ends; then every discipline refills to 2.
- Optional Tech and Kiln abilities may be declined without spending a once-per-round use (R4). Kiln Tending resolves automatically on the first qualifying Glaze & Load each round, and Canal Barge on the first Order its owner completes each round (INT). Protective Saggars' floor and Fuel Ledger's free Bank and Stoke are always on.
- Reworking Table with Imperial Priority is allowed (P1); Glaze & Load placement legality uses current Shapes only (P3).

## Firing Phase

1. Nothing loaded: the firing is skipped and no Fire card is revealed.
2. Contributions: players with a Shared Kiln ceramic seal one card each, in any order, from the cards they hold (`PlayerState.contributionCards`, public): Bank, Tend and Stoke, plus Fuel Ledger Bank (1 Wood, −2) and Fuel Ledger Stoke (1 Wood, +2) for the Fuel Ledger owner, whose plain Bank and Stoke cost no Wood (change 26). `SUBMIT_CONTRIBUTION` names the card only; the former `fuelLedger` commitment is refused, and `private.private_submissions.use_fuel_ledger` is history. With no participant the window is skipped (INT).
3. On the last submission the server revalidates every sealed choice, pays, reveals all cards together and sets Base Heat = clamp(Kiln Die + Contributions, 0, 5).
4. Test Pieces (private peek, public bury), then the Heat-marker step in First Player order (INT), then the Fire card is revealed automatically and Actual Heat calculated. When the Fire deck runs out, or holds only buried cards, the open discard is shuffled and placed above the buried cards (R15).
5. Jun, Quality (Protective Saggars' ceramics are never Flawed), then after-Quality abilities (Protective Saggars' Standard → Fine, Second Firing, Ge) in each owner's chosen order with eligibility rechecked after each use. Second Firing reveals 2 public cards; `SECOND_FIRING_CHOOSE` takes one, with R7's Jun, in one command.
6. Salvage of a still-Flawed ceramic: every eligible player decides independently, in any order (a `parallel` window).

## Orders, Cleanup and scoring

- The Order Phase is a single pass in First Player order and the only place Orders are completed; a player with nothing completable is skipped automatically (INT). Crackle declarations are either omitted (the engine searches and records the first that works) or given and used exactly. S07's "Carved, Impressed or Painted" is a Decoration alternative that a Crackle wildcard can fill.
- Cleanup returns workers and Setter's Marks; players over their hand limit discard in any order (a `parallel` window), a Main Order face down to the discard and a Starting Order to the box. The trim is skipped in Round 5 (INT).
- Exhibition is automatic (INT). Advanced Techs score no VP (change 27, which supersedes owner amendment A1): the score ledger, `TECH_ACQUIRED`, the score preview and the final breakdown have no Tech line. Connoisseur's Cabinet keeps its end-game VP. Final scoring and tie-breakers are computed by the server.

## Multiplayer

- **Routing.** Clients and the service decide who acts from `decisionPrompt(state)` only: `single`, `parallel` (`firing_salvage`, `cleanup_hand_limit`) or `simultaneous_secret` (`firing_contributions`). A computer seat is advanced whenever it is among the actors, in every mode.
- **Revisions.** Commands normally name the current revision. In a `parallel` window a command based on any revision since the window opened is validated against the current head while its actor is pending, and a commit conflict is retried up to 3 times. Contributions are compare-and-swap on the head and the window.
- **Untrusted input.** `parseCommand` shape-checks every command before the service branches on it; the retired commands (V1.6.1's `COMMISSION_RESERVE`, `COMMISSION_CHOOSE_LOOKED`, `COMMISSION_GAIN`, `COMMISSION_STOP`, `USE_CANAL_BARGE`; revision 2's `COMMISSION_CHOOSE`, `COLOUR_SAMPLES_CHOOSE`, `COLOUR_SAMPLES_SWAP_CHOOSE`; a `SUBMIT_CONTRIBUTION` with `fuelLedger`) are `MALFORMED_ACTION`.
- **Private delivery.** Responses carry the public projection and public events; the acting seat also receives its own `PrivatePlayerView` and its own event secrets. Reconnect rebuilds the private view from the head and the stored submissions and returns the seat's private event log. The game start persists `createGame`'s events, so the event count equals `eventSequence`.
- **Computer players.** A policy sees only its seat's `ActorView`. Its proposal is shape-checked and validated; on failure the service falls back to the canonical legal commands. A policy's exception is logged server-side, never returned: the response says only "<name> could not choose an action." The stored response of a computer command carries no private view. Labels are `rules-v1.6.2-<name>-<nnn>`.
- **Storage.** The in-memory store mirrors the Supabase RPCs and can apply `jsonb` key order on every read and write; a full seeded game ends in the same state hash either way.
- **Database.** `202610150001_v161_rules.sql` (written for V1.6.1 and edited in place for V1.6.2 before any deployment) rewrites every V1.4 gate (`server_create_room`, `server_join_room`, `server_add_computer_seat`, `server_commit_start`, `server_commit_transition`), allows `'1.6.2'`, schema 8 and `^r31-` fingerprints, restricts new private submissions to the 5 Contribution cards and refuses a payload carrying `fuelLedger` (owner revision 3), persists the game start's events, refuses public rows carrying `hidden` or `secret`, and adds the seat-checked `server_list_private_events`. Older rows stay as history. Nothing has been deployed.

## Playtest form

Form V3 records V1.6.2 tables (`rulesVersion: "1.6.2"`): Kilns (all five), at most one Tech per discipline, the round's Kiln Die (Base Heat = Kiln Die + Contributions, clamped 0–5), Contributions incl. Fuel Ledger's −2/+2 (its Fuel Ledger Bank and Fuel Ledger Stoke cards, recorded as `bank_2` and `stoke_2`), Shared and Imperial loads, Orders (S01–S08, O01–O48), Kiln ability uses, the Fire card and the Firing Techs used. `202610150002_playtest_v161.sql` accepts only Form V3 for V1.6.2 and keeps every earlier submission readable.
