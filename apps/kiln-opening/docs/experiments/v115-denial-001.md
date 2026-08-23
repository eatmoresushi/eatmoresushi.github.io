# `rules-v1.1.5-denial-001` — precommitted evaluation plan

Written **before** any measurement was taken. Gates below are fixed; results are appended
underneath without editing this section.

## What the candidate changes

Frozen V003 scores an action only by what it gains the actor. This lineage adds one term
(`opponentDenial`) for placements that crowd or close a contested location, and changes
nothing else. `test/v115_denial.test.ts` holds it to that: with the denial weights zeroed
the policy reproduces V003's choice byte-for-byte.

## Why

Across 2,000 measured 2-player player-rounds, V003 never once took both spaces at Forming
or Glaze — a lockout a human player finds immediately. Every 2-player measurement taken
against V003 therefore assumed a non-adversarial opponent.

## Design

Matched pairs on **fresh seeds** (`0x2AF5_xxxx` family, disjoint from every prior study —
the dev-seed inflation seen on `wood-001`, +0.94 dev vs +0.58 fresh, is the reason).
For each seed: one game with seat 0 playing the candidate against V003 opponents, and one
game with seat 0 playing V003 against V003. Same game seed, same assigned traditions, same
seating. The pair difference is the estimator; CIs are bootstrap over pairs.

Primary player count is **2**, where the lockout is structurally available. 3P and 4P are
regression checks only.

## Gates (precommitted)

| # | Gate | Threshold |
|---|---|---|
| 1 | **Primary** — 2P win-rate lift over matched V003 | bootstrap 95% CI lower bound **> 0** |
| 2 | **Behavioural** — 2P Forming/Glaze lockouts by the candidate | **> 2%** of its player-rounds (V003 = 0.0%) |
| 3 | **No regression** — 3P and 4P win-rate delta | 95% CI lower bound **> −4 pp** each |
| 4 | **Purity** — zero-weight equivalence to V003 | test passes (met before running) |

A candidate failing gate 1 or 2 is not shipped. Gate 2 exists because a term that never
changes behaviour is a no-op, and gate 1 alone cannot distinguish the two.

---

# Results (appended after measurement; gates above unedited)

## A correction to the premise, found during the build

The figure that motivated this lineage — "V003 never once took both spaces at Forming or
Glaze, 0.0% of 2,000 player-rounds" — was **wrong**. The probe read `action.location`; the
row field is `locationId`, so the counter saw `undefined` on every row and reported zero.
`tsx` transpiles without typechecking, so it never errored.

Re-measured correctly on the same 200 games: frozen V003 takes both spaces at Forming or
Glaze in **3.1%** of 2-player player-rounds (Forming 1.5%, Glaze 1.7%).

The *mechanism* claim survives and is code-verified: `evaluator.ts` has no opponent term,
and `test/v115_denial.test.ts` asserts `factors.opponentDenial` is 0 for every action V003
scores. V003's 3.1% is incidental, not deliberate. But it does not "never block".

## Weight response, 2 players, matched pairs on fresh seeds

| lockout weight | lockouts/round (cand vs V003) | blocker VP delta | win-rate delta |
|---|---|---|---|
| 1.9 (default) | 3.2% vs 3.4% | +0.72 `[0.02, 1.45]` | +1.00 pp `[-5.00, 7.00]` |
| 4 | 3.8% vs 3.4% | +0.51 `[-0.39, 1.40]` | +2.00 pp `[-5.00, 9.00]` |
| 8 | 5.8% vs 3.4% | −0.58 `[-1.63, 0.46]` | +1.00 pp `[-7.00, 9.00]` |
| 16 | 12.8% vs 3.4% | −1.65 `[-3.37, 0.08]` | +5.00 pp `[-6.00, 16.00]` |

n = 100 pairs per weight. The term demonstrably controls the behaviour — lockouts scale
monotonically with the weight — so this is not a wiring failure.

## Confirmation run at the blocking weight (n = 300 pairs)

| measure | value | 95% CI |
|---|---|---|
| lockouts/round | **12.5%** vs 3.6% baseline | — |
| **blocker** VP delta | **−1.47** | `[-2.53, -0.43]` |
| **victim** VP delta | −0.36 | `[-1.16, 0.44]` |
| win-rate delta | +1.00 pp | `[-5.00, 7.33]` |

## Verdict against the precommitted gates

| # | Gate | Result |
|---|---|---|
| 1 | 2P win-rate CI lower bound > 0 | **FAIL** at every weight tested |
| 2 | lockouts > 2% of candidate player-rounds | Met in absolute terms, but the gate was mis-specified — it should have required a *lift over baseline*, and the lift is +0.3pp at the default weight |
| 3 | 3P/4P regression | Not run; moot once gate 1 failed |
| 4 | zero-weight purity | **PASS** |

**Not shipped.** The online policy stays `rules-v1.1.4-contribution-001`. The lineage is
kept as a research policy: it is the instrument that answered the 2-player question below,
and it is the base for the separate order-valuation work.

## What it establishes about the 2-player board

Making the bot block hard does not make it win. Driving lockouts to 3.5× baseline costs the
blocker 1.47 VP significantly, costs the victim 0.36 VP not significantly, and moves win
rate not at all. Spending two workers to close a step buys less than the duplicate worker
gives up.

This is evidence *against* raising the 2-player Forming and Glaze capacities. It is also a
conservative reading in the direction that matters: the victim here is V003, which never
anticipates a block. A player who plans around it loses less than 0.36 VP, not more.

The caveat that remains is timing. This policy blocks by a scalar weight, not by reading
the one moment when an opponent has committed ceramics and no route around. A human picks
that moment. Whether a surgically-timed block pays is not settled by this experiment.
