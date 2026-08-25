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

Computer seats use the current production policy through the V1.1.6 authoritative engine, with no live exploration or learning. Historical calibration labels remain honest and are not claims of V1.1.6 calibration. Each seat has a private persistent seed and stable player/seat identity. The browser never chooses an AI command: an authenticated client only asks the Edge Function to advance, and the server derives the active computer, enumerates legal commands, applies the selected command through the authoritative engine, and commits it with the same revision checks as a human command.

Consecutive computer turns run in bounded batches so an Edge Function invocation cannot monopolize the session. Concurrent advance requests are safe; compare-and-swap persistence accepts each revision only once. Contribution-card choices remain private in the server-only schema until the normal simultaneous reveal, including when computers contribute.

### Game setup

- random First Player;
- reverse-order Kiln selection;
- each player privately receives 2 Market and 2 Imperial Orders, secretly keeps exactly 2, and all kept Orders are revealed simultaneously after every player submits;
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
2. resolve pre-Contribution Kiln Setting, Clay Substitution, and private Test Pieces choices in First-Player order;
3. eligible players privately submit one Bank/Tend/Stoke Contribution card;
4. UI shows only submission status, never card values;
5. once all eligible players submit, server atomically reveals and spends contributions;
6. resolve Fuel Ledger, then calculate Base Heat;
7. offer each eligible Kiln Yard Shifu one reposition decision in First-Player order;
8. reveal Fire card, reshuffling the discard first if needed;
9. resolve Sagger Selection;
10. calculate Actual Heat and resolve Jun/Ge adjustments;
11. assign Quality;
12. resolve Protective Saggars, then Second Firing;
13. resolve Kiln Records and move remaining ceramics to Finished areas.

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

Opening Order offers/selections, Colour Samples top-two choices, Test Pieces peeks, and Wood/Fuel Ledger submissions are private. Wood and Fuel Ledger choices remain strictly secret until the simultaneous reveal.

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

Imperial Progress is server-authoritative and public. Every public snapshot and reconnect response includes each player's current space, pending Apprentice unlocks, current worker availability, and the global Imperial Seal owner. The serialized legacy stipend field remains empty for replay compatibility.

Completing a Market Order never advances Imperial Progress. An Imperial Order advances by the number of ceramics it requires (+1, +2, or +3), up to space 5, even when several are completed in one round. The server checks every crossed milestone: spaces 1 and 3 each queue one Apprentice for unlock during Cleanup, and the first player to reach or cross into space 5 takes the 2-VP Imperial Seal permanently. Spaces 2 and 4 grant no immediate resources.

The client renders the full six-space track, prints each Imperial card's +1/+2/+3 reward, and uses committed server events containing the original space, final space, printed reward, and crossed milestones for advancement, Apprentice-unlock, and Seal feedback. It must not predict or apply any of those transitions locally.

Completed Order history is persisted and public. Court Patronage eligibility is derived from that authoritative history, never inferred from current Progress. Blind deck tops remain absent from public projections; only the chosen deck and revealed Order are published after the committed draw resolves.

## Game end

Server calculates final score and tie breakers.

Results screen shows VP breakdown by:

- Orders;
- Imperial Progress;
- Imperial Seal;
- Imperial Exhibition;
- immediate ability VP;
- Techniques;
- leftover Coins.

Every player may submit up to 5 Finished, undelivered Standard-or-better ceramics to the End-game Exhibition. Standard, Fine, and Masterpiece ceramics score 2/3/5 VP. A player exhibiting at least three ceramics chooses exactly three as the featured collection; three different Shapes and three different Glazes within that collection each score +2 VP.

## Localization

English is the default language. An always-available `EN / 中文` control switches the normal home, lobby, game, rules-facing labels, cards, rule errors, and results UI between English and Simplified Chinese. The preference is stored locally in the browser and is presentation-only: changing it never sends a game command, replaces authoritative state, or alters reconnect credentials. Both languages render the same stable Order, Technique, Kiln, location, and event IDs.

## Playtest telemetry

With room owner consent, record anonymous game-level balance metrics described in `PLAYTEST_TELEMETRY.md`.

Do not record chat, personal information, or hidden choices beyond what is necessary for aggregate game analysis.
