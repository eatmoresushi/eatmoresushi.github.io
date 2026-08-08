# DESIGN_HISTORY.md

This is a distilled history so future agents understand *why* the current rules look the way they do. It is not a rules source.

## Initial concept

- Song Dynasty ceramic workshops.
- Five famous kiln traditions: Ru, Guan, Ge, Ding, Jun.
- Worker placement around ceramic production.
- Shared kiln with risk.
- Market/Imperial commissions.
- Prestige race toward an Imperial audience.
- Initially considered 2–5 players, later fixed at 2–4. Five Kilns remain as selectable asymmetric boards.

## V0.1 direction — rejected worker complexity

Early version used:

- 1 Shifu;
- untrained and trained Students;
- Hire action;
- Train action;
- Refined Clay;
- Refining House;
- fixed heat bands 0–2 / 3–5 / 6+.

Why it was rejected:

- worker state added tracking without enough strategy;
- Hire/Train consumed action-board space;
- Refined Clay was a mandatory transit resource;
- fixed heat bands changed dramatically by player count.

## V0.2 direction — workforce simplification

Changed to:

- only Shifu + Apprentices;
- start 1 Shifu + 2 Apprentices;
- 2 extra Apprentices on Imperial Progress;
- no Hire/Train;
- five-round game;
- one Imperial Progress advance maximum per round.

Reason:

An extra worker is an action-economy reward. Limiting Progress to once per round prevents an early positive-feedback runaway.

## Clay simplification

Refined Clay and Refining House were removed.

Current production is:

Clay → Form → Glaze/Decorate → Load → Fire.

Reason:

A 1:1 Clay → Refined Clay action was mostly a compulsory tax, not a decision.

Ding was rewritten so its extra matching vessel costs that Shape's normal Clay cost. Ding saves a Forming action, not material.

## Imperial Presentation

Considered negative VP for reaching court without a worthy ceramic.

Decision:

- no penalty for zero/fewer than 3 Presentation ceramics;
- Flawed ceramics cannot be presented;
- Standard/Fine/Masterpiece score positively.

Reason:

The Imperial route already has opportunity costs and firing includes shared uncertainty. A large negative penalty would over-punish unlucky final firing.

## Firing model

Fire deck remains:

- -1 ×5
- 0 ×10
- +1 ×5

We considered wider Fire ranges but rejected them for now.

Reason:

Wood contribution and zone placement should be the main source of meaningful uncertainty. Fire is a final perturbation, not the driver.

Fixed Wood thresholds were replaced by contributor-scaled Base Heat:

- Low if Wood < N;
- Medium N..2N;
- High >2N.

This keeps Low/Medium/High incentives more stable across 2–4 players.

## Shifu repositioning

Earlier Shifu Kiln Yard action could reposition one already-loaded ceramic.

Removed.

Current Shifu loads up to 2 but does not reposition.

Reason:

Repositioning is useful design space for a dedicated kiln-mastery path. It now belongs to the **Kiln Setting** Technique.

## Missing strategic layer diagnosis

The production loop was strong, but workshops did not develop much after setup.

Inspired by the *function* of development layers in strong Euros—not by copying a specific mechanism—the game added:

- Guild & Academy location;
- 12 Craft Techniques;
- maximum 2 Techniques per player.

Techniques create persistent, player-chosen development without another resource or phase.

## Order deck

The 20 Market + 10 Imperial Order cards remain unchanged while production/Technique changes are tested.

Reason:

Changing both action economy and Order rewards simultaneously would make balance data difficult to interpret.

Watch especially multi-ceramic Orders M15–M20 and I06–I10 in playtests. If they become too efficient, the first fallback test is roughly -1 VP on those cards, not an automatic change.

## Current version

V0.5 is the current source of truth. It changes Guild & Academy to Shifu-only, reduces its 4-player capacity to 2, and reduces every printed Technique cost by 1; other V0.4 gameplay remains unchanged.

Do not resurrect obsolete mechanics from old images or discussion unless explicitly requested.
