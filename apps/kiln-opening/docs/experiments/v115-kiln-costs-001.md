# Ding pays normal cost, Jun pays 2 Wood — measured outcome

Two Tradition repricings applied together at the designer's direction:

- **Ding** pays the normal Clay cost for its extra vessel (was free). The ability's remaining
  value is the extra vessel itself, which still does not count against the action's limit.
- **Jun** pays **2 Wood** to adjust Actual Heat (was 1).

## Result — 800 games, 2,800 seats, bootstrap resampled over whole games

Neutral baseline is **28.6%** (3P and 4P mixed equally).

| tradition | win rate | 95% CI | mean VP | ability fires/game |
|---|---|---|---|---|
| Jun | 32.1% | `[28.1, 35.8]` | 35.4 | 2.71 |
| Ge | 30.4% | `[26.7, 34.2]` | 34.2 | 2.41 |
| Guan | 29.2% | `[25.6, 33.2]` | 33.6 | 1.91 |
| Ding | 27.6% | `[23.9, 31.2]` | 33.6 | 1.55 |
| **Ru** | **23.6%** | `[20.1, 27.0]` | 32.7 | 0.64 |

**spread 8.6 pp** `[4.8, 14.4]`, against 15.7 pp before these changes.

**Four of the five traditions are now statistically indistinguishable from fair** — every CI
except Ru's contains 28.6%. Ru is the only remaining outlier: its interval tops out at 27.0%,
below the baseline.

## What moved, and why

| tradition | before | after | cause |
|---|---|---|---|
| Ding | 33.9% | 27.6% | Charging for the extra vessel cut its firing from 2.40 to 1.55 per game |
| Guan | 22.4% | 29.2% | Imperial-Order awareness (measured separately at +3.80 pp) |
| Jun | 36.8% | 32.1% | Doubled Wood cost |
| Ge | 28.7% | 30.4% | Unchanged; rises relative to the two that were cut |
| Ru | 21.1% | 23.6% | Unchanged; rises relative to the two that were cut |

One result needs care. **Jun's firing rose from 2.27 to 2.71 per game despite the cost
doubling.** That is not the repricing — it is the enumerator fix landing in the same change.
`legalActions.ts` had been gating Jun on `resources.coins` against a cost from the retired
`jun-ab-001` Coin experiment while the engine charged Wood, which suppressed activations
whenever the player was short of Coins. The pre-change 2.27 was therefore understated, and
Jun's true starting point was higher than 36.8% suggests. The direction of the repricing is
still correct; its measured size is confounded with the bug fix and should not be quoted as
the effect of the Wood cost alone.

## Ru

Ru is now the only significant outlier, and this is not something the AI can close. It fires
0.64 times per game against Jun's 2.71 because its trigger needs three simultaneous
conditions — Celadon, Plain, **and** Masterpiece — the last requiring an exact Heat hit that
lands about a third of the time. With ~4.8 ceramics fired per game, the ceiling is roughly
1.5 fires even under perfect play. Teaching the agent to seek qualifying Orders moved it from
0.49 to 0.64 and did not move its score. Any real fix is a rules change.
