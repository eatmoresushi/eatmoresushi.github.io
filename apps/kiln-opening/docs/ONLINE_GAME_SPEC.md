# ONLINE_GAME_SPEC.md

## Goal

Create a synchronous 2–4 player browser version suitable for remote playtesting.

The digital version should automate administration while preserving decisions and hidden information.

Clay, Wood and Coins have unlimited shared supplies. Track each player's earned resources and payments without a finite bank counter or physical-token cap.

## MVP user flow

### Home

- Create Game
- Join Game
- Optional local “sandbox/debug” mode for developers

### Create Game

Host enters display name.

Server creates short room code.

Host receives a stable player/seat identity token.

### Join Game

Player enters:

- room code;
- display name.

Maximum 4 seats.

### Lobby

Show:

- players;
- host;
- connection status;
- selected colour if applicable.

Host starts only with 2–4 players.

### Computer players

The host may add or remove computer seats while the room is in the lobby. A room must retain at least one human seat and may contain up to three computer players, for the normal four-seat maximum.

Computer seats use the single `rules-v1.4-strategic-001` production policy through the V1.4 authoritative engine, with no live exploration or learning. Historical calibration labels remain honest and are not claims of human-calibrated strength. Each seat has a private persistent seed and stable player/seat identity. The browser never chooses an AI command: an authenticated client only asks the Edge Function to advance. The server derives the active computer, creates a sanitized observation containing public state plus only that seat's private decisions, preflights the strategic command and conservative fallbacks through the engine, and commits the first legal result with the same revision checks as a human command.

Consecutive computer turns run in bounded batches so an Edge Function invocation cannot monopolize the session. Concurrent advance requests are safe; compare-and-swap persistence accepts each revision only once. Contribution-card choices remain private in the server-only schema until the normal simultaneous reveal, including when computers contribute. The client times out a stalled advance request without changing local game state, pauses automatic retries for that revision, and offers an explicit retry. Successful batches produce a paced public-event recap while the complete authoritative history remains available in the log.

### Game setup

- random First Player;
- reverse-order Kiln selection;
- the separate Starting Order deck contains eight cards, S01–S08; each player receives 2 Starting Orders and no Main Order in a secret hand; only hand counts are public;
- each player chooses 1 Starting Tech from the common supply;
- every player starts with 2 Clay, 2 Wood, 4 Coins, 1 Shifu + 3 Apprentices and an empty Imperial Kiln area;
- Shared-Kiln High/Middle/Low capacities are 1/2/1, 2/2/2 and 3/2/3 at 2/3/4 players;
- all eight action locations are shared; Materials Yard, Potter's Wheel, Decoration Workshop, Commission Market, and Craft Academy use 2 / 3 / 4 global printed spaces at 2 / 3 / 4 players, while Kiln Yard, Paid Work and Imperial Court are uncapped;
- game begins Round 1 with a six-card Main Order queue, oldest on the left and newest on the right.

## Synchronous turn model

Production uses Workshop (Plain, no Glaze) → optional Decoration → paid Glaze & Load → Firing. Decoration costs 2 Coins per vessel, with one free for the Shifu. Glazing and loading costs 1 Coin per ceramic and chooses Glaze at placement. Crackle is a permanent Ge property separate from Decoration and Glaze. When completing an Order, each Crackle ceramic may use one independently chosen virtual Glaze consistently for every requirement of that Order. It cannot substitute Decoration; actual attributes remain unchanged, including Glaze for Exhibition diversity.

Work Phase has one active player at a time. Every player must place all four workers; there is no Work pass. Imperial Court costs 5 Coins and advances Recognition only from 0, 1 or 2.

UI shows:

- active player;
- available workers;
- legal locations;
- capacity remaining;
- action-specific modal after location is selected.

Players cannot submit actions out of turn except special simultaneous/timing-window submissions.

The Main Order display behaves as a left-to-right queue. Whenever a face-up Order is reserved or completed, all later cards slide left and the replacement is appended at the right. Blind deck reservations and privately viewed Colour Samples reservations leave the display unchanged. A multi-reservation Commission action resolves one reservation completely before presenting the updated choices for the next. At the start of Rounds 2–5, discard the two leftmost Orders, retain the others in order, then refill. If the deck and discard are both empty, draw only available cards and leave the display short. A reservation must still take an available card.

During the Order Phase, the action panel shows only held or face-up Orders that the active player can fulfil with a legal Finished-ceramic group. An explicit pass remembers the legal Orders declined at that opportunity. When later completions advance and refill the public display, the server checks every player in reverse Work order: it prompts a prior passer again only when a newly displayed Order is now completable, skips unchanged or impossible opportunities, and ends the phase after a complete circuit with no completion. This automates repeated no-choice passes without suppressing a newly created decision.

## Firing multiplayer flow

Firing is the most important digital interaction.

The exact decision sequence is documented in [Implementation decisions](./IMPLEMENTATION_DECISIONS.md#explicit-firing-windows). Resolve Glaze Palette at the end of Work, then Test Pieces, secret Contributions, Shifu Heat markers, initial Fire reveal, Actual Heat, Jun and Quality. Resolve after-Quality choices, including Ge, Protective Saggars and Second Firing, in First Player order; each owner chooses their ability order. Recheck each remaining ability's targets, current Quality, costs and usage limits after every use. Flawed salvage and unloading follow the completed after-Quality window.

Fuel Ledger provides two additional single-card choices, Bank −2 and Stoke +2, each costing 2 Wood. Store them privately until simultaneous reveal. No public payload exposes a pending card, cost or derived Heat.

During Second Firing, reveal the extra Fire card and calculate the selected ceramic's new Actual Heat before offering unused Jun. A previously used Jun ability is unavailable for the rest of that round. The UI shows the new card and calculated Heat before the decision, and the server assigns the replacement Quality afterward.

## No timers in MVP

Do not add chess clocks or automatic turns initially.

## Session lifecycle

The host may end a lobby or active game for everyone after an explicit confirmation. This is a service operation outside the pure rules engine and does not count as normal game completion.

- The authoritative room status changes to `abandoned` and records the ending time and host player ID.
- The room update is public and broadcast to every connected player.
- Reconnect remains available but returns an ended-session view; no further gameplay or starting commands are accepted.
- Repeating the host operation is safe. Non-host attempts return a typed `HOST_ONLY` failure.
- `Leave view` only returns that browser to the home screen and retains its reconnect credential. The player may resume or explicitly forget the saved seat.

Retain abandoned sessions for 7 days for debugging and finished games for 30 days. A daily database job deletes expired parent rooms; foreign-key cascades remove their snapshots, commands, events, credentials, and submissions.

## Reconnect

Refreshing browser or temporary network loss must not forfeit a seat.

Store a durable per-room seat token in local storage.

On reconnect:

- recover player seat;
- fetch current public game state;
- fetch only private data that player is entitled to see;
- resume current decision window.

## Hidden information

Every player's undelivered ceramics are public, including Workshop, loaded (Shared or Imperial Kiln), and Finished ceramics, with all recorded attributes. Every seat can inspect them through the player panel, including after reconnect.

Held Starting/Main Orders, Colour Samples top-three choices and ordering, Craft Academy Shifu Tech inspections and chosen return order, Test Pieces peeks, and Contribution/Fuel Ledger submissions are private. Order hand counts are public. Contribution and Fuel Ledger choices remain strictly secret until the simultaneous reveal.

Never put unrevealed contribution values in public realtime state.

## Undo

MVP default:

- no undo after an action is committed;
- UI should use confirmation before irreversible actions where appropriate;
- no undo once hidden/revealed information could have changed decisions.

A developer/debug build may support state rewind via event log.

## Spectators

Not required for MVP.

## Chat

Not required for MVP. Voice/chat can be external.

## Imperial Recognition synchronization

Imperial Recognition is server-authoritative and public. Every public snapshot and reconnect response includes each player's current 0–4 space, resolved milestone rewards, whether their Imperial Kiln has been gained, whether their Imperial Priority token is available, and immediate VP earned from Crowns beyond 4.

Recognition advances through Crown icons printed on completed Orders or Imperial Court, which costs 5 Coins and may advance only from spaces 0, 1 or 2. The server resolves Crowns one at a time, caps the marker at 4, and resolves every newly crossed milestone in ascending order: Recognition 1 **Imperial Grant** grants either 3 Coins or 1 Clay + 1 Wood + 1 Coin; Recognition 2 **Imperial Gift** grants the Imperial Kiln; Recognition 3 **Imperial Priority** grants its once-per-game token; and Recognition 4 **Imperial Audience** grants 6 VP. Every Crown gained after the marker reaches 4 grants 1 VP immediately, including remaining Crowns from the Order that first reaches 4.

Imperial Priority is a separate choice before or after one of the owner's worker actions. Spending it selects a Glaze, pays 1 Coin and loads one Workshop ceramic into the owner's empty Imperial Kiln; it does not increase Kiln Yard's normal load allowance and cannot move an already loaded ceramic. The client never predicts the unlock, token spend, overflow-Crown VP or Audience VP locally.

Completed Order history, Crown totals and Recognition milestones are persisted and public. Main deck order remains absent from public projections; only cards entering the public display or otherwise legitimately revealed are published.

## Game end

Server calculates final score and tie breakers.

Results screen shows VP breakdown by:

- Orders;
- Imperial Audience;
- Crowns beyond Recognition 4;
- Advanced Techs;
- End-game Exhibition;
- Kiln Tradition and other immediate ability VP;
- leftover Coins.

Every player may submit any number of Finished, undelivered Standard-or-better ceramics to the End-game Exhibition. Standard, Fine, and Masterpiece ceramics score 2/3/5 VP. At least three different Shapes and at least three different Glazes across the entire exhibition each score +3 VP independently. Each owned Advanced Tech scores 1 VP. Remaining Coins score 1 VP per 3 Coins, to a maximum of 5 VP.

## Localization

English is the default language. An always-available `EN / 中文` control switches the normal home, lobby, game, rules-facing labels, cards, rule errors, and results UI between English and Simplified Chinese. The preference is stored locally in the browser and is presentation-only: changing it never sends a game command, replaces authoritative state, or alters reconnect credentials. Both languages render the same stable Order, Technique, Kiln, location, and event IDs.

## Playtest telemetry

With room owner consent, record anonymous game-level balance metrics described in `PLAYTEST_TELEMETRY.md`.

Do not record chat, personal information, or hidden choices beyond what is necessary for aggregate game analysis.
