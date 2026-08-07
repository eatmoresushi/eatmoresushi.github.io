# ONLINE_GAME_SPEC.md

## Goal

Create a synchronous 2–4 player browser version suitable for remote playtesting.

The digital version should automate administration while preserving decisions and hidden information.

## MVP user flow

### Home

- Create Game
- Join Game
- Rules
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

### Game setup

- random First Player;
- reverse-order Kiln selection;
- starting Market Order is dealt directly to that player's hand and is public immediately, because Orders are open information in V0.4;
- game begins Round 1.

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

1. show final kiln layout;
2. server opens optional `before_contribution` timing window;
3. resolve Kiln Setting choices in First-Player order;
4. eligible players privately submit Wood Contribution 0–3;
5. UI shows only submission status, never values;
6. once all eligible players submit, server atomically reveals contributions;
7. server spends Wood;
8. resolve Fuel Ledger decisions in First-Player order;
9. calculate Base Heat;
10. reveal Fire card;
11. calculate natural Actual Heat and natural Heat Difference;
12. resolve Jun/Ge windows in First-Player order;
13. assign Quality;
14. resolve Protective Saggars;
15. resolve Test Pieces/Ru;
16. move ceramics to Finished areas.

## No timers in MVP

Do not add chess clocks or automatic turns initially.

Host may have a “remove disconnected player / abandon game” control later, but MVP should prioritise reconnect.

## Reconnect

Refreshing browser or temporary network loss must not forfeit a seat.

Store a durable per-room seat token in local storage.

On reconnect:

- recover player seat;
- fetch current public game state;
- fetch only private data that player is entitled to see;
- resume current decision window.

## Hidden information

Current game has little hidden information, but Wood Contributions are strictly secret until reveal.

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

## Game end

Server calculates final score and tie breakers.

Results screen shows VP breakdown by:

- Orders;
- Imperial Progress;
- Imperial Seal;
- Presentation;
- immediate ability VP;
- leftover Coins.

## Playtest telemetry

With room owner consent, record anonymous game-level balance metrics described in `PLAYTEST_TELEMETRY.md`.

Do not record chat, personal information, or hidden choices beyond what is necessary for aggregate game analysis.
