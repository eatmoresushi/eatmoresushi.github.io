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

### V1.0.1 Fire-deck revision

The earlier narrow Fire distribution was replaced with a symmetric five-value deck:

- -2 ×5
- -1 ×3
- 0 ×4
- +1 ×3
- +2 ×5

This is a balance-only change. Base Heat, zone modifiers, Wood Contributions, the Quality table and firing abilities remain unchanged.

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

The 20 Market + 10 Imperial Order structure and all printed VP/Coin rewards remain stable. V0.6.3 changes only five named attributes—M10, M12, M14, I02 and I04—to reach explicit Glaze distribution 4/4/4/4 and Decoration distribution 3/3/4/3.

Multi-ceramic Imperial Orders I06–I10 now advance +2 rather than +1 Progress so their larger production commitment is not disadvantaged. They never advance +3, even when three ceramics are required.

## Current version

V0.6.3 is the current source of truth. It raises Decoration costs to Plain 1 and specialised Decorations 2, rebalances five Order attributes, and gives single-ceramic Imperial Orders +1 Progress versus +2 for multi-ceramic Imperial Orders. V0.6.1 previously added a third starting Apprentice, raised Materials Yard to 3/4 resources, removed Kiln Yard Wood, kept Flawed sales as an Office secondary effect, removed the once-per-round Imperial Progress cap, and restored Technique costs to the 2/3-Coin tiers.

V0.5 historically changed Guild & Academy to Shifu-only, reduced its 4-player capacity to 2, and reduced every printed Technique cost by 1.

Do not resurrect obsolete mechanics from old images or discussion unless explicitly requested.
