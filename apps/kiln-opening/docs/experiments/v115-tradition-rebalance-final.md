# Guan Coins-only, Jun 3 Wood, Ru Fine+ 3 VP — the resulting table

Three changes applied together at the designer's direction:

- **Guan** — award drops its VP half: 2 Coins, no VP (was 2 Coins + 1 VP).
- **Jun** — activation costs 3 Wood (was 2).
- **Ru** — triggers on a Celadon, Plain ceramic of **Fine quality or better**, worth **3 VP**
  (was a Masterpiece worth 4).

Measured on the same sequences and seeds as the two previous tables, so Tradition
assignments and deck order are identical and the deltas are real rather than a fresh draw.

## 800 games, 2,800 seats, baseline 28.6%

| kiln | win | 95% CI | verdict | VP | fires/game | before | delta |
|---|---|---|---|---|---|---|---|
| Ge | 31.1% | `[27.3, 34.7]` | fair | 34.2 | 2.33 (2.34) | 25.9% | +5.2 |
| Ru | 30.0% | `[26.3, 33.8]` | fair | 34.5 | **1.35 (0.61)** | 23.5% | +6.5 |
| Ding | 28.9% | `[25.2, 32.9]` | fair | 33.3 | 1.61 (1.61) | 26.1% | +2.8 |
| Jun | 26.6% | `[22.8, 30.3]` | fair | 33.9 | 2.17 (2.77) | 32.5% | −5.9 |
| Guan | 26.3% | `[22.8, 30.0]` | fair | 32.2 | 1.87 (2.02) | 34.9% | −8.6 |

**spread 4.8 pp** `[2.8, 11.5]`, against 11.4 pp before.

**Every interval contains the 28.6% baseline.** For the first time in this project no
Tradition is statistically distinguishable from fair share, and the spread has less than half
its previous width. Mean VP now runs 32.2 to 34.5, a range of 2.3 points.

## What each change did

Ru's firing rate more than doubled, 0.61 → 1.35 per game, close to the 1.68 the Fine+
arithmetic predicted. Jun's fell 2.77 → 2.17 under the heavier Wood price. Guan's fell
slightly, 2.02 → 1.87, as the agent values a Coins-only award less and pursues it a little
less hard.

## The deltas are confounded with each other, on purpose

Win rate is zero-sum: the gains (+5.2, +6.5, +2.8) are exactly the losses (−5.9, −8.6)
redistributed. Ru's +6.5 is therefore **not** the effect of the Fine+ change alone — it is
that change plus its share of the room freed by cutting Guan and Jun. The isolated Ru
estimate from the corrected full-table run was +1.9 for `master_6`; `fine_3` measured +4.10
pinned, which the opponent-cycle flaw inflates.

That confounding is acceptable here because the question was "where does the table land with
all three", not "what is each worth". If any single change later needs sizing on its own, it
needs its own arm.

## Caveats

The spread interval is wide, `[2.8, 11.5]`. 4.8 pp is the point estimate on this seed family;
a different assignment draw would move the individual figures by several points, as Ge's
30.4 / 25.0 across two identical-rules runs showed. What is solid is that no Tradition's
interval excludes fair share, which was not true of any previous table.

These are AI measurements. The agent fires Ru 1.35 times a game where a human table managed
2, so the Traditions that reward planning may still be understated for human play.
