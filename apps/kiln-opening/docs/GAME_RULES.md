# GAME_RULES.md — Kiln Opening / 开窑 V1.0.9

**Players:** 2–4  
**Length:** 5 rounds  
**Rules version:** V1.0.9

This is the authoritative implementation transcription of the English V1.0.9 rulebook. The Simplified Chinese rulebook is authoritative for Chinese terminology. Exact component values live in `data/*.json`; the IDs and values in those files form part of these rules.

## 1. Objective and game end

The game ends after Cleanup in Round 5. Players score:

- completed Market and Imperial Orders;
- Imperial Progress: 0/0/2/2/4/8 VP at spaces 0–5;
- the 2 VP Imperial Seal;
- the End-game Exhibition;
- immediate Kiln Tradition VP;
- 1 VP per owned Technique;
- 1 VP per 3 Coins, capped at 5 VP.

Tie breakers, in order: farther along Imperial Progress; more completed Imperial Orders; more Masterpieces delivered or exhibited; shared victory.

## 2. Workers, resources, and ceramics

Each player owns 1 Shifu and 5 Apprentices. The Shifu and 3 Apprentices begin available; the other Apprentices unlock when Imperial Progress reaches or crosses spaces 1 and 3. Unlocks resolve during Cleanup and are usable next round. If an Apprentice would unlock during Round 5 Cleanup, gain 3 Coins instead.

Resources are Clay, Wood, and Coins. There is no Refined Clay.

| Shape | Clay cost |
|---|---:|
| Bowl | 1 |
| Plate | 1 |
| Washer | 1 |
| Vase | 2 |
| Censer | 2 |

There are 8 Vessel cards of each Shape.

| Glaze | Preferred Heat |
|---|---:|
| White | 1 |
| Celadon | 2 |
| Grey-Green | 2 |
| Moon White | 3 |

| Decoration | Coin cost |
|---|---:|
| Plain | 1 |
| Carved | 2 |
| Impressed | 2 |
| Crackle | 2 |

A ceramic progresses from Shaped, to Glazed, to Loaded, to Finished, and finally Delivered. A Glazed ceramic has exactly one Glaze and one Decoration. Delivered ceramics cannot be reused.

## 3. Setup

1. Configure worker-placement capacities and the Shared Kiln for player count.
2. Shuffle Market, Imperial, and the three Technique discipline decks. Reveal 4 Market Orders, 4 Imperial Orders, and 2 Techniques per discipline.
3. Shuffle the 12 Fire cards.
4. Randomly choose First Player.
5. In reverse turn order, players choose Kiln Traditions.
6. Each player gains 2 Clay, 2 Wood, and 3 Coins.
7. Deal each player 2 Market and 2 Imperial Orders privately. Each player secretly keeps exactly 2 in any combination and returns 2. Shuffle returned cards into their matching decks, then reveal all kept Orders simultaneously.

Starting Order offers and selections are private until the simultaneous reveal.

## 4. Round structure

Each round has Start of Round, Work, Firing, Order, and Cleanup phases.

At the start of Rounds 2–5, discard the single leftmost card from each Order display, slide left, and refill to 4. Refill incomplete displays, ready once-per-round abilities, and reset Kiln Traditions.

During Work, players alternate clockwise. On a turn, place one available worker and resolve the location, or pass permanently. A player may take less than an action's maximum unless the rule requires an exact amount. Unused workers provide no benefit.

If the Shared Kiln is empty, skip Firing. During the Order Phase, players may complete any number of legal Orders in turn order. Cleanup returns workers, resolves unlocks or Round-5 compensation, forces Order discards to the cleanup limit, passes First Player clockwise, and advances the round.

## 5. Worker-placement locations

| Location | Apprentice | Shifu |
|---|---|---|
| Materials Yard | Gain exactly 3 Clay/Wood in any combination. | Gain exactly 4 Clay/Wood, then exchange Clay and Wood with the supply 1:1 any number of times. |
| Forming Studio | Pay normal cost to shape 1 vessel. | Shape up to 2; each Vase or Censer costs 1 Clay during this action. |
| Glaze Workshop | Glaze and decorate 1 shaped ceramic, paying the Decoration cost. | Glaze and decorate up to 2, ignoring the Coin cost of one selected Decoration. |
| Kiln Yard | Load 1 ceramic and gain 1 Wood. | Load up to 2, gain 1 Wood for each loaded, and receive the pre-Fire reposition opportunity described below. |
| Market & Imperial Office | Take 1 face-up Market or Imperial Order; or sell one Flawed ceramic for 1 Coin. | Take 1 face-up Order, then optionally sell up to 2 Flawed ceramics for 1 Coin each; alternatively use Court Patronage. |
| Guild & Academy | Buy 1 face-up Technique at printed cost. | Refresh one face-up Technique, then buy one at −1 Coin, minimum 0. |

Court Patronage costs 5 Coins, requires at least one previously completed Imperial Order, draws one blind Imperial Order, and cannot advance Imperial Progress from space 4 to 5.

Action capacity counts total workers at a location:

| Location | 2P | 3P | 4P |
|---|---:|---:|---:|
| Materials Yard | 2 | 3 | 4 |
| Forming Studio | 2 | 3 | 4 |
| Glaze Workshop | 2 | 3 | 4 |
| Kiln Yard | 3 | 4 | 5 |
| Market & Imperial Office | 2 | 3 | 4 |
| Guild & Academy | 1 | 2 | 3 |

## 6. Shared Kiln and firing

The seven kiln spaces are 1 High (+1), 5 Middle (0), and 1 Low (−1). High and Low are always active. Use 3/4/5 Middle spaces at 2/3/4 players, for 5/6/7 active spaces total.

Only players with at least one loaded ceramic contribute. Each secretly chooses 0–3 Wood and must be able to pay it. Fuel Ledger may be committed secretly with the bid: pay 1 Coin for +1 Wood, to an effective maximum contribution of 4. Do not reveal any value until every contributor has submitted.

Base Heat is determined from total Wood and contributor count `N`:

- for one contributor: 0 = Low, 1–2 = Medium, 3+ = High;
- for `N >= 2`: below `N` = Low, `N` through `N+2` = Medium, above `N+2` = High.

Low, Medium, and High Base Heat are 1, 2, and 3.

The Fire deck contains −2×1, −1×3, 0×4, +1×3, and +2×1. Discard revealed cards face up. When the draw deck is empty, shuffle the discard to make a new draw deck.

Firing resolves in this order:

1. Before contribution: Kiln Setting and Test Pieces.
2. Secretly commit Wood and optional Fuel Ledger.
3. Reveal and spend.
4. Determine Base Heat.
5. Each eligible Kiln Yard Shifu may move one ceramic they loaded this round to a legal empty active space.
6. Reveal the Fire card.
7. Resolve Sagger Selection.
8. Calculate Actual Heat: Base Heat + Fire modifier + kiln-space modifier, subject to card effects.
9. Resolve Jun and Ge heat adjustments.
10. Assign Quality from absolute Heat Difference: 0 Masterpiece, 1 Fine, 2 Standard, 3+ Flawed.
11. Resolve Protective Saggars and Second Firing.
12. After firing fully resolves, resolve Kiln Records.

Test Pieces privately looks at and returns the top Fire card before bids. No peek is exposed in public state or logs. Ge sets a selected ceramic's Actual Heat to its Preferred Heat. Jun modifies Actual Heat in its printed timing window.

## 7. Orders

There are 28 Market Orders and 20 Imperial Orders. `data/orders.json` contains their authoritative IDs, requirements, quality thresholds, VP, Coins, and printed Imperial Progress.

Imperial Progress is always read from the completed card's printed `progress` value (+1, +2, or +3); it is never derived from ceramic count. Multiple Imperial Orders may advance Progress in one round, up to space 5. Every crossed milestone resolves even when an advance jumps over it:

- spaces 1 and 3 queue Apprentice unlocks;
- space 2 grants 2 Coins once;
- space 4 grants 3 Coins once;
- first arrival at space 5 takes the 2 VP Imperial Seal.

Displays refill immediately after a face-up Order is taken. When a draw deck empties, shuffle its discard. If both are empty, the display remains short and blind draws are unavailable.

There is no Order hand limit during a round. In Cleanup, discard face up to 3 Orders, or 4 with Guan, to their matching discard piles.

After completing Orders, a player may use the normal optional Flawed sale: Apprentice 0–1 ceramic, Shifu 0–2 ceramics, for 1 Coin each.

## 8. Techniques

There are 15 Technique tiles defined in `data/techniques.json`, with 2 cost-1, 5 cost-2, and 8 cost-3 tiles. Each owned Technique is worth 1 VP at game end.

All Techniques except Clay Substitution are once per round. Clay Substitution may replace any number of Clay with Coins 1:1 while paying one Forming action.

Important V1.0.9 effects:

- Measuring Calipers: after forming two different Shapes in one action, gain 2 Coins and 1 Clay.
- Drying Frames: after forming, immediately Glaze and apply Plain free; another Decoration still costs normally.
- Colour Samples: after taking a face-up Order, privately inspect the top 2 of either Order deck, keep 1, and put the other on the bottom.
- Connoisseur Network: after a normal Office action, sell one finished undelivered Standard/Fine/Masterpiece for 2/4/7 Coins; not after Court Patronage.
- Kiln Records: after firing, if at least one of your ceramics is a Masterpiece, gain 1 Clay and 2 Coins.
- Fuel Ledger and Test Pieces follow the secret firing rules above.

## 9. Kiln Traditions

- **Ru:** once per round when delivering a Celadon + Plain Masterpiece to complete any Order, gain 4 VP. Producing or exhibiting it does not trigger Ru.
- **Guan:** whenever completing an Imperial Order, gain 2 Coins. Separately, once per round, one printed Decoration requirement may be ignored. Cleanup Order limit is 4.
- **Ge:** once per round in the heat-adjustment window, set one own ceramic's Actual Heat to its Preferred Heat and its Decoration to Crackle.
- **Ding:** once per round after forming a Bowl, Plate, or Washer, form one additional matching vessel for no Clay.
- **Jun:** follows its printed heat-adjustment ability in `data/kilns.json`.

## 10. End-game Exhibition

Each player may exhibit Finished, undelivered ceramics up to the capacity shown by final Imperial Progress: 1/1/2/2/3/3 at spaces 0–5. Flawed/Standard/Fine/Masterpiece score 0/1/2/4 VP. At Progress 4 or 5, add the printed Glaze and Decoration diversity bonuses. An exhibited ceramic cannot also satisfy an Order.

## 11. Information and implementation constraints

The engine and server are authoritative. Clients never calculate resources, legal moves, draws, Quality, Progress, or scoring.

Hidden information includes opening Order offers/selections, Colour Samples choices, Test Pieces peeks, and unrevealed Wood/Fuel Ledger submissions. A client receives only its own private decision data. Public events reveal only what the timing rule makes public.

Stable component IDs remain identical in English and Chinese. Canonical Chinese terminology is maintained in the locale data and must not be machine-translated.
