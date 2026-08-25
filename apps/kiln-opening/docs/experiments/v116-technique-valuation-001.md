# Teaching the AI to value Craft Techniques — precommitted plan

> **Superseded for production:** these measurements were collected before the project was
> reconciled to the attached V1.1.6 source rulebook. The old simulations used materially
> different Exhibition, Imperial Progress and Technique behaviour. The values remain here
> as historical experiment output, but `techniqueCalibration` is disabled until the study
> is rerun against the reconciled engine.

Written **before** any A/B. Gates fixed; results appended without editing this section.

## The problem

The agent buys **0.26 Techniques per seat-game** across a 15-tile deck where a player may own
two. Four tiles are never bought at all. The Guild & Academy is 1% of Round-1 placements and
0% in Rounds 2–4. An entire subsystem is untested by simulation, so no Technique change can
be evaluated.

## Diagnosis

`forecastTechniqueAcquisition` reports a positive net value in only **4.4%** of 57,546
forecasts, mean −2.16:

| term | mean |
|---|---|
| grossBenefit | 1.67 *(1.0 of it the printed end-game VP)* |
| purchaseCost | 1.98 |
| activationCost | 0.12 |
| workerOpportunityCost | 1.80 |

## Ground truth

Each Technique granted free to one seat against a matched control, 240 games per tile,
7,200 games total. The VP delta is what **owning** it is worth — the acquisition cost is
excluded by construction, which is the term the forecast already models.

| | measured VP | forecast gross |
|---|---|---|
| Drying Frames | 5.95 | 3.24 |
| Sagger Selection | **5.28** | 2.05 |
| Protective Saggars | **3.34** | 1.68 |
| Measuring Calipers | 2.49 | 1.64 |
| Second Firing | 2.26 | 1.62 |
| Carving Knives | 2.12 | 1.40 |
| Seal Stamps | 1.89 | 1.37 |
| Colour Samples | 1.72 | 1.36 |
| Large Throwing Wheel | 1.63 | 1.27 |
| Kiln Records | 1.27 | 2.01 |
| Kiln Setting | 1.01 | 2.00 |
| Fuel Ledger | 0.98 | 1.48 |
| Clay Substitution | −0.05 | 1.20 |
| Connoisseur Network | −0.13 | 1.76 |
| **Test Pieces** | **−4.16** | 1.54 |
| **mean** | **1.71** | **1.67** |

**The benefit model is well-calibrated on average and wrong tile by tile.** Sagger Selection
and Protective Saggars are worth two to three times what it thinks; Test Pieces is actively
harmful at −4.16 while the model rates it positive. The prior hypothesis — that effects were
undervalued across the board — is refuted by the matching means.

Two errors remain, and they are different in kind:

1. **The Coin cost is overstated.** `marginalResourceValue` prices a Coin at 1.5–2.6 while
   the player is short, and early on everyone is short, so a 2-Coin tile reads as a ~4-point
   outlay. The model has no term for Labour, which sells Coins at 2 per Apprentice placement,
   uncapped — a Coin cannot be worth more than half a placement. Players finish holding 9.82
   Coins against 2.85 Wood, so at the margin Coins are surplus.
2. **Per-tile benefit is miscalibrated**, in both directions.

## The change

Opt-in via `AIStrategyProfile.techniqueCalibration`. Frozen V003 leaves it unset and keeps
today's behaviour exactly.

- `profile.techniqueValues` carries the **measured** value of owning each tile.
- The forecast uses it as the gross benefit. The measured delta already nets out activation
  costs the agent pays, so `activationCost` is no longer subtracted — double-counting it is
  the obvious trap here.
- Coins in `purchaseCost` are capped at the Labour ceiling: one Apprentice placement buys
  `labourApprenticeCoins`, so a Coin is worth at most `workerOpportunityCost / 2`.

**Circularity, stated plainly:** the measured values describe what a tile is worth *given how
this agent plays*. Test Pieces may be a fine card that the agent misuses. Calibrating to
these numbers makes the agent buy what actually benefits it, which is the goal; it does not
establish that the cards are correctly designed, and must not be quoted as if it did.

## Gates (precommitted)

| # | Gate | Threshold |
|---|---|---|
| 1 | **Primary** — Techniques bought per seat-game | rises above **0.60** (from 0.26) |
| 2 | **Not indiscriminate** — Test Pieces, Clay Substitution and Connoisseur Network purchases | stay below **0.02**/seat each |
| 3 | **No harm** — pooled win-rate delta against the unchanged agent | 95% CI lower bound **> −2 pp** |
| 4 | **Purity** — frozen V003 unaffected | flag unset on V003; suite green |

Gate 2 matters more than gate 1: an agent that buys everything is as useless for evaluating
Technique design as one that buys nothing.

---

# Results

## First run — 1,000 matched pairs

| gate | threshold | result | |
|---|---|---|---|
| 1 — Techniques bought/seat | > 0.60 | **1.470** (from 0.301) | PASS |
| 2 — Test Pieces / Clay Substitution / Connoisseur | < 0.02 each | 0.000 / 0.000 / 0.000 | PASS |
| 3 — pooled win-rate delta | CI low > −2 pp | −0.30 pp, CI [−2.30, 1.70] | **FAIL** |

Gate 3 fails on interval width, not on evidence of harm: the point estimate is −0.30 pp and
the VP delta −0.02 `[−0.30, 0.27]`.

**Stopping rule, fixed before the second run:** 2,500 pairs, one run, ship only if the lower
bound clears −2 pp. Re-running until a gate passes is p-hacking; enlarging a sample whose
point estimate sits on zero and whose interval is too wide to conclude is not. This is the
only additional run.
