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
- starting Market Order is dealt directly to that player's Order area and is public immediately, because Orders are open information in V1.0.2;
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
11. resolve Sagger Selection in First-Player order;
12. calculate immutable natural heat from the original Fire modifier and final Actual Heat from each ceramic's applicable modifier;
13. resolve Jun/Ge windows in First-Player order;
14. assign Quality;
15. resolve Protective Saggars, then Second Firing, in First-Player order;
16. resolve Test Pieces/Kiln Records/Ru;
17. move remaining ceramics to Finished areas; Second Firing choices remain Glazed.

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

## Imperial Progress synchronization

Imperial Progress is server-authoritative and public. Every public snapshot and reconnect response includes each player's current space, pending Apprentice unlocks, current worker availability, and the global Imperial Seal owner.

Completing a Market Order never advances Imperial Progress. A single-ceramic Imperial Order advances 1 space and a multi-ceramic Imperial Order advances 2 spaces, up to space 5, even when several are completed in one round. The server checks every crossed milestone: spaces 1 and 3 each queue one Apprentice for unlock during Cleanup, and the first player to reach or cross into space 5 takes the 2-VP Imperial Seal permanently.

The client renders the full six-space track, prints each Imperial card's +1/+2 reward, and uses committed server events containing the original space, final space, and printed reward for advancement, unlock, Presentation-eligibility, and Seal feedback. It must not predict or apply any of those transitions locally.

Completed Order history is persisted and public. Court Patronage eligibility is derived from that authoritative history, never inferred from current Progress. Blind deck tops remain absent from public projections; only the chosen deck and revealed Order are published after the committed draw resolves.

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
