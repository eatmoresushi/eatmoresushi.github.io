# ONLINE_GAME_SPEC.md

## Goal

Create a synchronous 2–4 player browser version suitable for remote playtesting.

The digital version should automate administration while preserving decisions and hidden information.

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

Computer seats use the current production policy through the V1.2.5 authoritative engine, with no live exploration or learning. Historical calibration labels remain honest and are not claims of V1.2.5 calibration. Each seat has a private persistent seed and stable player/seat identity. The browser never chooses an AI command: an authenticated client only asks the Edge Function to advance, and the server derives the active computer, enumerates legal commands, applies the selected command through the authoritative engine, and commits it with the same revision checks as a human command.

Consecutive computer turns run in bounded batches so an Edge Function invocation cannot monopolize the session. Concurrent advance requests are safe; compare-and-swap persistence accepts each revision only once. Contribution-card choices remain private in the server-only schema until the normal simultaneous reveal, including when computers contribute.

### Game setup

- random First Player;
- reverse-order Kiln selection;
- each player receives 4 private Starting Orders, secretly keeps exactly 2, and all kept Starting Orders become public after every player submits;
- each player chooses 1 Starting Tech from the common supply;
- every player starts with 1 Shifu + 3 Apprentices and an empty Imperial Kiln area;
- all seven action locations are shared; Materials Yard, Potter's Wheel, Glaze & Decoration, Commission Market, and Guild & Academy use 2 / 3 / 4 global printed spaces at 2 / 3 / 4 players, while Kiln Yard and Labour are uncapped;
- game begins Round 1 with a five-card Main Order display.

## Synchronous turn model

Work Phase has one active player at a time.

UI shows:

- active player;
- available workers;
- legal locations;
- capacity remaining;
- action-specific modal after location is selected.

Players cannot submit actions out of turn except special simultaneous/timing-window submissions.

## Firing multiplayer flow

Firing is the most important digital interaction.

1. if no ceramic is loaded in either the Shared Kiln or any Imperial Kiln, skip the complete Firing Phase and reveal no Fire card;
2. show the Shared- and Imperial-Kiln layout and resolve private Test Pieces choices before Contributions;
3. eligible players privately submit Bank, Tend or Stoke; an affordable Fuel Ledger owner may instead submit Bank −2 or Stoke +2 with the extra Wood committed secretly;
4. UI shows only submission status, never card values, the extra commitment or derived heat;
5. once all eligible players submit, the server atomically reveals and pays all Contributions, calculates Base Heat from 2, then clamps it to 0–5;
6. before revealing Fire, offer every player who used a Kiln Yard Shifu this round one reposition decision in First Player order. The player may move one owned Shared-Kiln ceramic to an empty active space in a neighbouring zone only: High ↔ Middle ↔ Low. It never enters or leaves an Imperial Kiln, and Kiln Furniture travels with its ceramic;
7. reveal the Fire card, reshuffling the discard first if needed, and calculate uncapped Global Heat;
8. calculate each ceramic's Actual Heat and resolve Jun/Ge adjustments in the rulebook timing window;
9. assign Quality;
10. in First Player order, resolve Protective Saggars, Second Firing and similar after-Quality choices; a player controlling multiple abilities at that timing chooses their order. Relevant unused once-per-round abilities may resolve at their normal timing inside a Second Firing recalculation;
11. resolve the Flawed salvage: each player may discard at most one ceramic still Flawed from this firing for 2 Coins, returning its Vessel card to the matching Shape supply;
12. move remaining ceramics to Finished areas, empty all kiln spaces, return Kiln Furniture tiles, discard used Fire cards and return Contribution cards.

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

Opening Starting Order offers/selections, Colour Samples top-three choices and ordering, Test Pieces peeks, and Contribution/Fuel Ledger submissions are private. Contribution and Fuel Ledger choices remain strictly secret until the simultaneous reveal.

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

Only Crown icons printed on completed Orders advance Recognition. The server resolves Crowns one at a time, caps the marker at 4, and resolves every newly crossed milestone in ascending order: Recognition 1 **Imperial Grant** grants either 3 Coins or 1 Clay + 1 Wood + 1 Coin; Recognition 2 **Imperial Gift** grants the Imperial Kiln; Recognition 3 **Imperial Priority** grants its once-per-game token; and Recognition 4 **Imperial Audience** grants 6 VP. Every Crown gained after the marker reaches 4 grants 1 VP immediately, including remaining Crowns from the Order that first reaches 4.

Imperial Priority is a separate choice before or after one of the owner's worker actions. Spending it loads one unloaded Glazed ceramic into the owner's empty Imperial Kiln; it does not increase Kiln Yard's normal load allowance and cannot move an already loaded ceramic. The client never predicts the unlock, token spend, overflow-Crown VP or Audience VP locally.

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

Every player may submit up to 5 Finished, undelivered Standard-or-better ceramics to the End-game Exhibition. Standard, Fine, and Masterpiece ceramics score 2/3/5 VP. A player exhibiting at least three ceramics chooses exactly three as the featured collection; three different Shapes and three different Glazes within that collection each score +3 VP. Each owned Advanced Tech scores 1 VP. Remaining Coins score 1 VP per 3 Coins, to a maximum of 5 VP.

## Localization

English is the default language. An always-available `EN / 中文` control switches the normal home, lobby, game, rules-facing labels, cards, rule errors, and results UI between English and Simplified Chinese. The preference is stored locally in the browser and is presentation-only: changing it never sends a game command, replaces authoritative state, or alters reconnect credentials. Both languages render the same stable Order, Technique, Kiln, location, and event IDs.

## Playtest telemetry

With room owner consent, record anonymous game-level balance metrics described in `PLAYTEST_TELEMETRY.md`.

Do not record chat, personal information, or hidden choices beyond what is necessary for aggregate game analysis.
