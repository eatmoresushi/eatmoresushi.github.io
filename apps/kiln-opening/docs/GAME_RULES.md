# GAME_RULES.md — Kiln Opening / 开窑 V0.6.5

**Players:** 2–4  
**Length:** 5 rounds  
**Target weight:** medium Euro  
**Primary mechanisms:** worker placement, resource/production planning, shared-kiln risk, contract fulfilment, asymmetric powers, persistent Craft Techniques.

This file is the gameplay source of truth for the digital implementation.

---

## 1. Objective

Earn the most VP from:

- completed Market and Imperial Orders;
- final Imperial Progress;
- the Imperial Seal;
- an eligible Imperial Presentation;
- immediate Kiln Tradition scoring;
- leftover Coins.

The game ends after Cleanup of Round 5.

---

## 2. Player workforce

Each player owns:

- 1 Shifu;
- 5 Apprentices total.

At setup:

- Shifu + 3 Apprentices are available;
- 2 Apprentices are locked.

The locked Apprentices are unlocked by Imperial Progress spaces 2 and 4. They become available during Cleanup and can act starting next round.

There is no training, hiring, worker specialisation, or worker loss.

---

## 3. Resources and ceramic attributes

Resources:

- Clay
- Wood
- Coins

There is **no Refined Clay**.

### Shapes and Clay costs

| Shape | Clay |
|---|---:|
| Bowl | 1 |
| Plate | 1 |
| Washer | 1 |
| Vase | 2 |
| Censer | 2 |

There are 8 Vessel cards of each Shape.

### Glazes and Preferred Heat

| Glaze | Preferred Heat |
|---|---:|
| White | 1 |
| Celadon | 2 |
| Grey-Green | 2 |
| Moon White | 3 |

### Decorations and costs

| Decoration | Coin cost |
|---|---:|
| Plain | 1 |
| Carved | 2 |
| Impressed | 2 |
| Crackle | 2 |

A ceramic must have exactly one Glaze and one Decoration before loading.

### Ceramic states

1. **Shaped:** Shape only.
2. **Glazed:** Shape + Glaze + Decoration.
3. **Loaded:** glazed ceramic occupying one Shared Kiln space.
4. **Fired/Finished:** Shape + Glaze + Decoration + Quality.
5. **Delivered:** committed beneath a completed Order and unusable again.

Clay cleaning, refining, mixing, drying, etc. are abstracted into the Forming Studio action.

---

## 4. Setup

1. Place action board, Shared Kiln, Round track and Imperial Progress track.
2. Configure action capacities for player count.
3. Shuffle Market and Imperial Order decks separately. Reveal 4 Market and 3 Imperial Orders.
4. Separate Techniques by discipline: Forming, Glazing, Firing. Shuffle each discipline and reveal 2 from each.
5. Shuffle the 20-card Fire deck.
6. Place Clay, Wood, Coins and sorted Vessel cards in common supply.
7. Each player takes a colour, 1 Shifu, 5 Apprentices, Imperial Progress marker, and Wood Contribution cards 0–3.
8. Randomly choose First Player.
9. In reverse turn order, players choose available Kiln Player Boards.
10. Each player starts with Shifu + 3 Apprentices available; 2 Apprentices locked.
11. Each player gains 2 Clay, 2 Wood and 3 Coins.
12. Each player draws 1 Market Order. If it requires 2+ ceramics, they may discard it and draw once more.
13. All Imperial Progress markers begin at 0. Round marker begins at 1.

### Action capacity

| Location | 2P | 3P | 4P |
|---|---:|---:|---:|
| Materials Yard | 2 | 3 | 4 |
| Forming Studio | 2 | 3 | 4 |
| Glaze Workshop | 2 | 3 | 4 |
| Kiln Yard | 3 | 4 | 5 |
| Market & Imperial Office | 2 | 3 | 4 |
| Guild & Academy | 1 | 2 | 3 |

Capacity is total workers at the location, not per player. A player may occupy the same location more than once if spaces remain.

### Order hand limit

Normally 3 uncompleted Orders total. Guan may hold 4.

Orders stay in hand until completed and cannot be voluntarily discarded unless a rule allows it. Uncompleted Orders score 0 and have no end-game penalty.

---

## 5. Round structure

Every round has five phases.

### Phase 1 — Start of Round

- Refill incomplete Order and Technique displays.
- Ready exhausted Techniques.
- Reset once-per-round Kiln Tradition abilities.
- First Player starts Work Phase.

### Phase 2 — Work Phase

Players alternate clockwise, placing exactly one available worker and resolving that location immediately.

Continue until all players have placed all workers or passed.

Rules:

- Apprentice uses Apprentice effect.
- Shifu uses Shifu effect.
- Same player may use same location multiple times if capacity remains.
- A player may take less than an action's maximum unless the action specifies an exact amount; unused capacity is lost.
- A player may pass while workers remain.
- Passing is permanent for that Work Phase.
- Unused workers give no benefit.

### Phase 3 — Firing Phase

If kiln is empty, skip the entire phase and do not draw Fire.

Otherwise use Section 8.

### Phase 4 — Order Phase

In turn order, each player may complete any number of Orders.

A single-ceramic Imperial Order advances its owner 1 Imperial Progress. A multi-ceramic Imperial Order advances its owner 2 Imperial Progress. Progress cannot exceed space 5, and there is no per-round limit.

### Phase 5 — Cleanup

1. Return all placed workers.
2. Unlock every Apprentice pending from reaching Progress 2 or 4.
3. Discard leftmost face-up Market Order and leftmost face-up Imperial Order; slide and refill.
4. Pass First Player clockwise.
5. Advance Round marker.

After Cleanup of Round 5, score the game.

---

## 6. Worker-placement locations

### Materials Yard

**Apprentice:** gain exactly 3 resources in any combination of Clay/Wood.
**Shifu:** gain exactly 4 resources in any combination of Clay/Wood.

### Forming Studio

**Apprentice:** pay normal Clay cost to shape 1 vessel of any Shape.  
**Shifu:** pay normal Clay costs to shape up to 2 vessels of any Shapes.

Take matching Vessel cards from supply.

### Glaze Workshop

**Apprentice:** apply 1 Glaze and choose 1 Decoration for 1 Shaped ceramic; pay Decoration normally.

**Shifu:** choose one:

- apply Glaze + Decoration to up to 2 Shaped ceramics, paying normally; or
- apply Glaze + Decoration to 1 Shaped ceramic and ignore that Decoration's Coin cost.

Once applied, Glaze and Decoration do not change unless an ability explicitly changes them.

### Kiln Yard

**Apprentice:** load 1 Glazed ceramic into any empty kiln space.

**Shifu:** load up to 2 Glazed ceramics into empty kiln spaces.

Clarifications:

- Kiln Yard gives no Wood;
- at least 1 eligible ceramic must be loaded to place a worker here;
- a loaded ceramic stays in place unless a Technique moves it;
- Shifu does **not** reposition ceramics.

### Market & Imperial Office

**Apprentice — choose one:**

- take 1 Market or Imperial Order, either face-up or as a blind top-deck draw;
- gain 2 Coins.

In addition, the Apprentice may sell 1 Flawed ceramic for 1 Coin after resolving the chosen action.

**Shifu — choose one:**

- take up to 2 Orders, choosing the deck and face-up/blind method separately for each;
- take 1 face-up or blind-top Order and gain 2 Coins;
- gain 4 Coins.
- use Court Patronage, if eligible.

In addition, the Shifu may sell up to 2 Flawed ceramics for 1 Coin each after resolving the chosen action.

Selling Flawed ceramics is an optional secondary effect, not a main Office action. The player may continue without selling.

When a face-up Order is taken, refill that display position immediately before any second Order is selected. A blind draw removes and immediately reveals the actual top card of the chosen deck, adds it to the player's public Active Orders, and leaves the face-up display unchanged. A blind draw is a commitment and cannot be previewed or rejected.

A player may not exceed hand limit. Check the limit before every individual acquisition.

**Court Patronage:** this is a distinct Shifu-only main action. The player must have completed at least 1 Imperial Order during this game, have at least 5 Coins, and be at Imperial Progress 0–3. Pay 5 Coins and advance exactly 1 space. Court Patronage cannot advance from 4 to 5, cannot claim the Imperial Seal, and cannot be combined with Orders, Coin gain, Colour Samples, or the optional Flawed sale. A move to space 2 or 4 queues the normal Apprentice unlock for Cleanup.

Only the acting player's Finished Flawed ceramics may be sold. Each sold ceramic is removed from the Finished Ceramics area, its Vessel card returns to the matching Shape supply, and the player gains exactly 1 Coin. A sold ceramic cannot later be delivered to an Order or included in an Imperial Presentation. Standard, Fine, and Masterpiece ceramics cannot be sold through this effect.

### Guild & Academy

Both Apprentices and the Shifu may be placed at this location while capacity remains.

**Apprentice:** pay the selected Technique's printed Coin cost and take 1 face-up Technique. The Apprentice cannot refresh the display.

**Shifu:**

1. Before choosing a Technique, the player may place 1 face-up Technique on the bottom of its discipline deck and reveal a replacement from that same deck.
2. The player then takes 1 face-up Technique for 1 Coin less than its printed cost, minimum 1 Coin.
3. Refill the empty display slot immediately from the same discipline deck.

Rules:

- maximum 2 owned Techniques;
- both Techniques may share a discipline;
- cannot acquire without sufficient Coins or an empty Technique slot;
- newly acquired Technique may be used later that round if its timing allows.

---

## 7. Craft Techniques

Six Techniques are face-up: 2 Forming, 2 Glazing, 2 Firing.

Most are optional and usable once per round. Exhaust when used and ready next Start of Round.

Techniques give no direct VP.

Exact list is authoritative in `data/techniques.json`.

Printed costs are 2 Coins for T01, T02, T04, T05, T06, T07, T08 and T12; and 3 Coins for T03, T09, T10 and T11. The Apprentice pays the printed cost; the Shifu pays 1 less, minimum 1.

**T08 Colour Samples:** once per round, when its owner begins an Office main action that will take at least 1 Order, before the first acquisition they may place exactly 1 face-up Order from either display on the bottom of its corresponding deck and reveal a replacement from that deck. Then the Office action continues normally and may acquire from either deck by either method. This grants no extra Order or Coins and is unavailable during Coins-only actions or Court Patronage.

### Timing windows

- **during action:** Forming/Glazing Techniques
- **before Wood Contributions:** Kiln Setting
- **after Contributions revealed, before Base Heat:** Fuel Ledger
- **after Quality assigned:** Protective Saggars
- **after firing:** Test Pieces and Ru check before ceramics return

---

## 8. Shared Kiln and Firing

### Kiln layout

| Zone | Spaces | Actual Heat modifier |
|---|---:|---:|
| High | 2 | +1 |
| Middle | 3 | 0 |
| Low | 3 | -1 |

One ceramic per space unless a future rule explicitly says otherwise.

### Firing procedure

1. **Before Contributions:** in turn order from First Player, resolve optional pre-contribution abilities (e.g. Kiln Setting).
2. **Choose Contributions:** each player with ≥1 loaded ceramic secretly selects Contribution 0–3 and must own at least that much Wood. Players with no loaded ceramic do not contribute.
3. **Reveal and Spend:** reveal simultaneously; spend selected Wood.
4. **Modify Contributions:** in turn order, resolve post-reveal contribution abilities (e.g. Fuel Ledger).
5. **Determine Base Heat:** count contributors, including those who chose 0, then use contributor-scaled thresholds.
6. **Reveal Fire:** draw top Fire card (-1/0/+1); Global Heat = Base Heat + Fire modifier. Do not cap it.
7. **Calculate Actual Heat:** Global Heat + ceramic's zone modifier.
8. **Before-Quality abilities:** in turn order resolve Jun and Ge.
9. **Assign Quality:** compare final Actual Heat with Preferred Heat.
10. **After-Quality abilities:** resolve Protective Saggars in turn order.
11. **After-Firing effects:** resolve Test Pieces and Ru. Return ceramics to owners' Finished areas. Empty kiln. Discard Fire card face-up.

### Base Heat

Let `N` = number of contributors (players with ≥1 loaded ceramic, including a contributor who selected 0).

- Low (Heat 1): total Wood `< N`
- Medium (Heat 2): total Wood from `N` through `2N`
- High (Heat 3): total Wood `> 2N`

Equivalent table:

| Contributors | Low | Medium | High |
|---:|---:|---:|---:|
| 1 | 0 | 1–2 | 3+ |
| 2 | 0–1 | 2–4 | 5+ |
| 3 | 0–2 | 3–6 | 7+ |
| 4 | 0–3 | 4–8 | 9+ |

### Quality

`Heat Difference = abs(Actual Heat - Preferred Heat)`

| Difference | Quality |
|---:|---|
| 0 | Masterpiece |
| 1 | Fine |
| 2 | Standard |
| 3+ | Flawed |

Order eligibility:

- Masterpiece: satisfies any minimum;
- Fine: Fine+ or Standard+;
- Standard: Standard+ only;
- Flawed: no Orders and no Imperial Presentation.

---

## 9. Orders

Two decks/displays:

- Market: 4 face-up;
- Imperial: 3 face-up.

Exact card definitions are authoritative in `data/orders.json`.

### Taking

Taken Orders enter the public Active Order area. For each acquisition, choose either a face-up Order or a blind draw from the Market or Imperial top card. Refill only a face-up selection, from its corresponding deck, immediately. Blind draws leave the display unchanged.

If an action allows 2 Orders, choose the deck and method separately for each. The second selection sees any refill caused by the first face-up selection. The player may stop after the first.

### Completing

During player's turn in Order Phase:

1. choose Order in hand;
2. select required finished, undelivered ceramics;
3. validate all Shape, Glaze, Decoration, relation and minimum Quality rules;
4. move ceramics beneath completed Order;
5. record printed VP and gain printed Coins;
6. if Imperial, advance 1 Progress for a single-ceramic Order or 2 Progress for a multi-ceramic Order, up to space 5.

Every Imperial Order advances Progress independently, including multiple Imperial Orders completed in the same Order Phase. Market Orders never advance Progress.

| Imperial Orders | Ceramics required | Progress |
|---|---:|---:|
| I01–I05 | 1 | +1 |
| I06–I10 | 2 or 3 | +2 |

Progress is categorical, not per ceramic: I08 and I10 each advance exactly 2, not 3.

---

## 10. Imperial Progress

| Space | Title | Reward | End-game VP |
|---:|---|---|---:|
| 0 | Local Workshop | — | 0 |
| 1 | Local Renown | — | 1 |
| 2 | Prefectural Recommendation | unlock 1 Apprentice in Cleanup | 1 |
| 3 | Court Examination | — | 3 |
| 4 | Awaiting Audience | unlock 1 Apprentice in Cleanup; Presentation eligible | 3 |
| 5 | Imperial Audience | take Imperial Seal if available; Presentation eligible | 7 |

Rules:

- single-ceramic Imperial Orders advance 1 space and multi-ceramic Imperial Orders advance 2 spaces, with no per-round limit;
- Progress cannot exceed space 5;
- every milestone crossed by a multi-space advance resolves; crossing space 2 or 4 queues its Apprentice for Cleanup, and crossing space 5 resolves Imperial Audience and the Seal;
- unlocked Apprentice becomes usable next round;
- first player ever reaching space 5 takes Imperial Seal, worth 3 VP;
- reaching 5 does not end game.
- Court Patronage advances exactly 1 space only from spaces 0–3, after the player has completed at least 1 Imperial Order; it cannot reach 5 or claim the Seal.

### Imperial Presentation

At game end, players at Progress 4 or 5 may present up to 3 finished, undelivered ceramics of **Standard or better**.

| Quality | VP |
|---|---:|
| Standard | 1 |
| Fine | 2 |
| Masterpiece | 4 |

Bonuses:

- +2 VP if exactly 3 presented ceramics have 3 different Shapes;
- +2 VP if exactly 3 presented ceramics have 3 different Glazes.

Flawed ceramics cannot be presented.

There is **no penalty** for presenting fewer than 3 or none.

---

## 11. Kiln Tradition abilities

### Ru Kiln / 汝窑 — Quiet Perfection

After all firing abilities are resolved, if you produced at least one Masterpiece with Celadon Glaze and Plain Decoration, gain 2 VP. Score once per round maximum.

### Guan Kiln / 官窑 — Imperial Patronage

Order hand limit is 4.

Once per round, when completing an Imperial Order, you may ignore one Decoration requirement. All Shape, Glaze, quantity, relationship and Quality requirements still apply.

### Ge Kiln / 哥窑 — Crackle from Fire

Once per round, after Actual Heat is calculated but before Quality is assigned, choose one of your ceramics with Heat Difference exactly 1.

Treat its Heat Difference as 0, assign Masterpiece Quality, and change its Decoration to Crackle.

This firing transformation does not charge the 2-Coin Crackle cost and does not refund the ceramic's original Decoration cost.

### Ding Kiln / 定窑 — Moulded Production

Once per round during Forming Studio, after shaping a Bowl, Plate or Washer, you may pay that Shape's normal Clay cost to shape one additional vessel of the same Shape.

The additional vessel does not count against normal action limit.

### Jun Kiln / 钧窑 — Kiln Transformation

Once per round, after Actual Heat is calculated but before Quality is assigned, adjust Actual Heat of one of your ceramics by +1 or -1.

Only that ceramic is affected.

### Same-window timing

If multiple players use abilities in the same timing window, resolve in turn order beginning with First Player.

---

## 12. Final scoring

After Round 5 Cleanup:

1. keep all VP already recorded from completed Orders, Ru, etc.;
2. add final Imperial Progress VP;
3. +3 VP for Imperial Seal holder;
4. add eligible Imperial Presentation;
5. add 1 VP per 3 leftover Coins, maximum 5 VP.

Highest VP wins.

Tie breakers, in order:

1. farther on Imperial Progress;
2. more completed Imperial Orders;
3. more Masterpieces delivered or presented;
4. shared victory.

---

## 13. General clarifications

- Supplies are finite.
- Coin denominations may be exchanged.
- No trading.
- Worker actions resolve immediately.
- Unused action capacity is lost.
- Newly unlocked Apprentice acts next round.
- Shaped/Glazed/Finished ceramics persist between rounds.
- Only delivered, presented, or sold ceramics leave Finished area.
- Flawed sale returns Vessel to supply.
- Non-Flawed ceramic cannot be voluntarily discarded.
- Uncompleted Orders and unused ceramics have no end-game penalty.
- Immediate VP is recorded once.
- If Technique deck is empty, do not refill unless a tile is returned.
- No special 2P rules beyond action capacities and contributor-scaled Base Heat.

---

## 14. Fire deck

20 cards:

- -1 × 5
- 0 × 10
- +1 × 5

The Fire deck supplies limited uncertainty. Major shifts should come from Wood decisions and zone placement.
