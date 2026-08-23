# V1.1.5 Order retry horizon — precommitted evaluation plan

Written **before** any A/B measurement. Gates are fixed; results are appended below without
editing this section.

## The defect

`evaluateOrderFeasibility` computed an Order's completion probability as the **product of
single-attempt Quality probabilities** across its required ceramics — as though every
requirement had to land simultaneously on one firing. In fact a ceramic that fires to the
wrong Quality is not destroyed: it stays in stock and the requirement can be attempted
again while rounds remain.

## Evidence (frozen V003, 360 games, 1,080 seats, 3,250 Orders completed)

| ceramics | model predicts | realised | model EV | realised EV | pool VP |
|---|---|---|---|---|---|
| 1 | 50.8% | 69.7% | **3.25** | 4.46 | 6.40 |
| 2 | 25.6% | 51.4% | **2.61** | **5.25** | 10.21 |
| 3 | 9.7% | 21.7% | 1.45 | 3.25 | 14.98 |

The model ranks one-ceramic Orders above two-ceramic ones; realised value is the reverse.
V003 completes 68% single-ceramic Orders and averages **7.84 VP/order**, against a human
table's 10.57 — the two-ceramic band. Only 19% of two-ceramic Orders clear the `feasible`
gate (vs 44% single), which then adds a −4 penalty in `acquisitionScore`.

**Caveat on the realised column:** these rates are conditional on V003's own selection — it
takes the two-ceramic Orders it judges easiest, so 51.4% is a selected sample and the
unbiased rate is lower. The gap is large enough that the ranking still inverts, but the
realised EV column is an upper bound, not a point estimate.

## The change

Each requirement is lifted from a single-shot probability to the chance of succeeding at
least once in `attempts = min(horizon, 6 − round)` firings. Retry *costs* are untouched and
still carried by `actionDebt`, `resourceDebt` and `timeProbability`, so this is not double
counting. Opt-in via `AIStrategyProfile.orderRetryHorizon`; frozen V003 leaves it unset and
keeps the single-attempt product exactly.

The horizon is structural, not fitted. A 3-attempt model implies lifts of 1.39× / 1.93× /
2.69× for one-, two- and three-ceramic Orders; the data asks for 1.37× / 2.01× / 2.24×. The
first two land without tuning, which is the evidence that the *form* was wrong rather than a
constant. Three-ceramic Orders are over-lifted, and gate 3 exists to catch that backfiring.

## Gates (precommitted)

| # | Gate | Threshold |
|---|---|---|
| 1 | **Primary** — win-rate lift over matched V003, pooled across 2P/3P/4P | bootstrap 95% CI lower bound **> 0** |
| 2 | **Behavioural** — VP per completed Order | rises above **8.6** (from 7.84, half way to the human 10.57) |
| 3 | **No 3-ceramic backfire** — share of completed Orders needing 3 ceramics | stays below **6%** (from 1%) |
| 4 | **No per-count regression** — 2P, 3P, 4P win-rate delta | each 95% CI lower bound **> −4 pp** |
| 5 | **Purity** — frozen V003 unaffected | `orderRetryHorizon` unset on V003; suite green |

Denial weights are **zeroed** for this evaluation so the Order change is measured alone;
the denial term failed its own gates and is not part of this candidate.

---

# Results (appended after measurement; gates above unedited)

Matched pairs on fresh seeds (`0x6BF5_xxxx`, disjoint from every prior study). Candidate is
seat 0 with `orderRetryHorizon = 3` and **denial weights zeroed**, against frozen V003.
200 pairs per player count, 600 pairs pooled.

| player count | win-rate lift | 95% CI | VP delta | 95% CI |
|---|---|---|---|---|
| 2P | +6.25 pp | `[-0.50, 13.25]` | +2.08 | `[0.92, 3.29]` |
| 3P | **+13.50 pp** | `[5.00, 22.00]` | +2.38 | `[0.85, 3.94]` |
| 4P | +6.50 pp | `[-1.00, 14.00]` | +0.47 | `[-0.81, 1.72]` |
| **pooled** | **+8.75 pp** | **`[4.42, 13.17]`** | — | — |

| behaviour | candidate | frozen V003 |
|---|---|---|
| VP per completed Order | **9.07** | 7.90 |
| Orders completed per game | 2.71 | 2.97 |
| share needing 3 ceramics | 0.5% | 0.9% |

## Verdict against the precommitted gates

| # | Gate | Threshold | Result |
|---|---|---|---|
| 1 | pooled win-rate CI lower bound > 0 | > 0 | **PASS** (4.42) |
| 2 | VP per completed Order | > 8.6 | **PASS** (9.07) |
| 3 | 3-ceramic share | < 6% | **PASS** (0.5%, *below* V003) |
| 4 | per-count regression | each CI low > −4 pp | **PASS** (−0.50, +5.00, −1.00) |
| 5 | frozen V003 unaffected | unset + suite green | **PASS** |

**All five gates pass.**

The bot now completes **fewer, larger** Orders — 2.71 per game at 9.07 VP against 2.97 at
7.90 — which is the behaviour the diagnosis predicted. Gate 3 is the notable one: the
3-attempt model over-lifts three-ceramic Orders by construction (2.69× against the 2.24×
the data asks for), and the concern was that the bot would start chasing them. It did the
opposite. The `actionDebt` and `timeProbability` terms restrain them, as intended.

## Robustness (exploratory — not gate evidence)

Run after the gates were decided, purely to check the result is not knife-edge on the
constant. 100 pairs per count.

| horizon | pooled win-rate lift | 95% CI | VP/order |
|---|---|---|---|
| 2 | +7.67 pp | `[2.67, 12.67]` | 8.82 |
| **3 (shipped)** | **+8.75 pp** | `[4.42, 13.17]` | **9.07** |
| 4 | +10.33 pp | `[4.33, 16.33]` | 9.24 |

Every horizon above 1 beats V003 significantly, which is the point: the defect was the
*form* of the model, not the value of a constant. Horizon 4 scores highest here, but that
comparison is post-hoc on a smaller sample, so the shipped value stays at the precommitted
3. Raising it is a candidate for its own precommitted test, not a decision to take from
this table.

## Status

Candidate passes and is ready to ship, but is **not yet live**. The online policy is still
`rules-v1.1.4-contribution-001`, and the `policy_version` check constraint in
`202608220002_online_ai_v114.sql` does not admit the V1.1.5 string, so promoting it needs a
migration and an Edge redeploy — an outward-facing change, left for an explicit decision.

---

## Confirmation against the live baseline (precommitted before running)

The A/B above used frozen V003 as the control, which is the right control for attributing
the change but is **not what is currently online**. Online runs `V114Policy`, which adds
v1.1.4's Contribution-card decision. The shipped V1.1.5 policy therefore composes over
V114 rather than replacing it, and the ship decision needs that comparison.

**Gate:** seat 0 playing V114 + `orderRetryHorizon = 3` against V114 opponents, matched
pairs, fresh seeds. Pooled win-rate lift 95% CI lower bound **> 0**, and VP per completed
Order **> 8.6**. Denial off on both sides.

### Result

| player count | win-rate lift vs live v1.1.4 | 95% CI | VP delta |
|---|---|---|---|
| 2P | +1.33 pp | `[-7.33, 10.00]` | +0.88 |
| 3P | +10.33 pp | `[2.00, 18.67]` | +2.31 |
| 4P | +9.33 pp | `[0.67, 18.00]` | +2.18 |
| **pooled** | **+7.00 pp** | **`[2.11, 12.00]`** | — |

VP per completed Order **9.02** against live v1.1.4's 7.93. Both confirmation gates pass
(450 matched pairs). 2P alone is not significant, but is not a regression either.

**Shipped.** `ONLINE_COMPUTER_POLICY_VERSION` moves to `rules-v1.1.5-order-001`.
