# Ding's extra vessel: free vs paid, on one seed set

The earlier comparison (33.9% free against 27.6% paid) came from two separate runs with
Guan's teaching and Jun's repricing landing in between, so it could not be attributed. This
runs both arms on **identical seeds and identical Tradition assignments**, with only the Clay
charge differing, via a registered `ding-cost-ab-001` experiment arm.

## The clean number

Ding's own seat, free minus paid, same seeds, n = 560:

| | delta | 95% CI |
|---|---|---|
| **win rate** | **+7.50 pp** | `[3.30, 11.79]` |
| **VP** | **+2.43** | `[1.65, 3.23]` |

Free is worth about seven and a half points of win rate to Ding. That part is not ambiguous.

## Both tables — 800 games, 2,800 seats each, baseline 28.6%

**PAID** (shipped)

| kiln | win | 95% CI | VP | fires/game |
|---|---|---|---|---|
| Guan | 34.2% | `[30.4, 38.3]` | 34.9 | 2.03 |
| Jun | 33.5% | `[29.6, 37.5]` | 35.5 | 2.76 |
| Ding | 25.9% | `[22.4, 29.5]` | 32.8 | 1.62 |
| Ge | 25.0% | `[21.3, 28.5]` | 34.2 | 2.30 |
| Ru | 24.3% | `[20.7, 27.9]` | 32.8 | 0.59 |

spread **9.9 pp** — outliers: Guan and Jun above, Ge and Ru below.

**FREE**

| kiln | win | 95% CI | VP | fires/game |
|---|---|---|---|---|
| Ding | 33.4% | `[29.5, 37.4]` | 35.3 | 2.37 |
| Jun | 32.0% | `[28.0, 35.7]` | 35.5 | 2.74 |
| Guan | 27.8% | `[24.2, 31.5]` | 34.2 | 1.99 |
| Ge | 25.5% | `[22.0, 29.3]` | 34.2 | 2.29 |
| Ru | 24.2% | `[20.7, 27.8]` | 32.5 | 0.60 |

spread **9.2 pp** — outliers: Ding above, Ru below.

## Reading

The spread is the same either way, near 9–10 pp. What the charge decides is **who** is strong,
not how uneven the table is. Free concentrates strength in Ding; paid moves it to Guan and
Jun, which under this seed set both sit significantly above fair share.

Ru is unaffected by either arm (24.3% / 24.2%, 0.59 / 0.60 fires) and remains the one
consistent outlier.

## A methodological caveat that matters more than the result

The PAID arm here does **not** reproduce the previous 800-game table, which read
JU 32.1 / GE 30.4 / GU 29.2 / DI 27.6 / RU 23.6 under the same rules. Ge moves 30.4 → 25.0 and
Guan 29.2 → 34.2 between two runs of identical rules at 2,800 seats each — swings larger than
the within-run bootstrap intervals suggest.

The cause is that `assignedTraditionsForGame` is keyed on the game sequence, so a different
seed family changes which Tradition sits in which seat and against whom. The bootstrap
resamples games within a run and therefore cannot see that variance at all.

**Consequence:** absolute per-Tradition win rates are only comparable *within* a run. Across
runs they carry several points of assignment variance that no interval here reports. The
matched-pair delta is the trustworthy statistic, because both arms share seeds and
assignments; the per-Tradition tables should be read as a within-run comparison of the two
arms, not as an absolute ranking. This supersedes the earlier note that 800 games buys ±2 pp
per Tradition — that holds for sampling noise, not for assignment variance.
