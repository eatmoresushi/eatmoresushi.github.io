# Jun's activation price: 2 Wood against 3

> Historical experiment. The owner-approved V1.1.6 ruleset uses 2 Wood as of 26 August 2026.

Jun led the Tradition table at 36.3% against a 28.6% fair share. The cause was not the
ability's face value — at 2.77 VP per game it is worth less than Ge's 4.76 — but what it
unlocks: Jun completed 3.04 Orders a game at 9.26 VP each, roughly 28 VP from Orders against
23–25 for everyone else.

## What Jun spends the ability on

964 activations across 350 Jun seat-games:

| transition | share |
|---|---|
| **Fine → Masterpiece** | **68.8%** |
| Standard → Fine | 27.6% |
| Flawed → Standard | 3.6% |

Jun almost never rescues a doomed piece. It manufactures Masterpieces — 1.89 a game — and
**8 of the 52 Orders require one**, averaging 10.4 VP against 8.3 for the rest. Masterpieces
are also worth 4 VP in the Exhibition against a Fine's 2.

This ruled out constraining Jun's window to Heat Difference 1–2 as Ge's is: that would have
removed 3.6% of its uses.

## Result — both arms, identical seeds, 1,200 games each, both seed families

**Jun seat, paired, 3 Wood minus 2 Wood, n = 840:**

| | delta | 95% CI |
|---|---|---|
| **win rate** | **−8.21 pp** | `[−11.07, −5.24]` |
| **VP** | **−2.05** | `[−2.49, −1.62]` |

| kiln | 2 Wood | | 3 Wood | |
|---|---|---|---|---|
| Jun | **36.3%** | ABOVE | **28.0%** | fair |
| Guan | 30.7% | fair | **33.5%** | ABOVE |
| Ge | 27.9% | fair | 30.6% | fair |
| Ding | 25.4% | below | 27.1% | fair |
| Ru | 22.7% | below | 23.6% | below |
| **spread** | **13.5 pp** | | **9.8 pp** | |

Jun lands on 28.0% against a 28.6% baseline. The mechanism is visible in the intermediate
figures: firings fall 2.79 → 2.16 and Orders follow, 3.04 → 2.89. Ding fixes itself as a side
effect, moving from below the band into it without being touched.

The estimate going in was −3 to −4 pp, taken from a confounded three-change run. The isolated
effect is more than twice that, which is why it was worth measuring alone.

## What it leaves

Guan becomes the sole outlier above, at 33.5%. It did not get stronger — win rate is
zero-sum and Guan was being held down by Jun. Two things argue for leaving it:

- The table is better on every count: spread 13.5 → 9.8 pp, outliers three → two.
- Guan is the one Tradition measured at **100% of its ability ceiling**, three times over. It
  cannot improve with human play, so at a real table its 33.5% should erode as the others
  close their headroom, where Jun's would not have.

**Shipped.** Behaviour revision 6, fingerprint `r6-aa8d94f4d803a371`. The `jun-wood-ab-001`
arm is retained for future sizing.
