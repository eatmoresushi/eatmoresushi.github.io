# Removing the Office Coin mode — measured on matched seeds

v1.1.5 introduced Labour and specified "Remove get coins from Market & Imperial Office", but
only the first half landed: `take_one_and_gain_two_coins` stayed implemented, enumerated and
playable. This measures the board with it finally gone.

Run on the **same sequences and seeds** as the ding-cost PAID arm, so Tradition assignments
and deck order are identical and the only difference is the retired mode. That matters: two
runs of identical rules on *different* seed families previously gave Ge 30.4% and then 25.0%,
because `assignedTraditionsForGame` is keyed on the sequence and the bootstrap cannot see
that variance.

Sanity check in the run: **Office Coin gains = 0** (the removal took effect), Labour used
8,010 times across 800 games.

## 800 games, 2,800 seats, baseline 28.6%

| kiln | win | 95% CI | VP | fires/game | before | delta |
|---|---|---|---|---|---|---|
| Guan | 34.9% | `[31.1, 39.0]` | 34.9 | 2.02 | 34.2% | +0.7 |
| Jun | 32.5% | `[28.7, 36.5]` | 35.5 | 2.77 | 33.5% | −1.0 |
| Ding | 26.1% | `[22.6, 29.6]` | 33.0 | 1.61 | 25.9% | +0.2 |
| Ge | 25.9% | `[22.3, 29.3]` | 34.1 | 2.34 | 25.0% | +0.9 |
| Ru | 23.5% | `[20.2, 27.1]` | 32.9 | 0.61 | 24.3% | −0.8 |

spread **11.4 pp** `[7.5, 17.5]`, against 9.9 pp before.

## The Coin mode was barely being taken

Every delta is at most 1.0 pp, on matched seeds where a real effect would show cleanly. The
mode existed and was priced by the evaluator, but it competes with `take_up_to_two` on the
same worker, and two Orders beat one Order plus two Coins often enough that removing the
option changed almost nothing.

**This is good news for everything measured before it.** The Labour result, the Tradition
tables and the Ding and Guan A/Bs were all taken on a board carrying a Coin source the rules
had already removed, and the correction is worth about a point. Those findings stand.

## Where the Traditions sit

Against the 28.6% baseline: **Guan and Jun are significantly above**, Ding and Ge contain it,
and **Ru is significantly below** — its interval tops out at 27.1%.

Hold the ordering loosely. On this seed family Guan reads 34.2 / 34.9; on the other it read
29.2. That five-point gap is assignment variance, not a change in Guan. What survives across
every draw is that **Ru is last** — 21.1, 23.5, 23.6, 24.2, 24.3 across five measurements —
and that Jun is consistently high.

Guan's current standing also reflects the Imperial-Order teaching, measured separately at
+3.80 pp. Before that it sat at 22.4%.
