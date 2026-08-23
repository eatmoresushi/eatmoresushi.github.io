# Teaching Ding to seek same-Shape Orders — tried, measured, rejected

## The idea

Ding's ability adds a second vessel of the same Shape (Bowl, Plate or Washer) without
consuming an action slot. Ten of the 52 Orders can be served by a same-Shape pair, and seven
multi-ceramic Orders explicitly forbid one. The evaluator only ever noticed the ability at
*Forming* time, by which point the Order was long since chosen — so the proposal was to price
the pairing at Order-take time, as Ru, Guan and Ge had been.

## Result — 250 matched pairs per player count, Ding pinned to seat 0, n = 500

| measure | with awareness | without | delta | 95% CI |
|---|---|---|---|---|
| **win rate** | — | — | **−3.00 pp** | **`[-5.40, -0.80]`** |
| VP | — | — | −0.43 | `[-0.91, 0.05]` |
| pairable Orders completed/game | **0.55** | 0.42 | +31% | |
| **ability fires/game** | **1.57** | 1.56 | **+0.01** | |

**Significantly worse.** The interval excludes zero on the wrong side.

## Why the premise was wrong

The change did exactly what it was designed to do — Ding completed 31% more pairable Orders —
and the ability fired **no more often at all**: 1.57 against 1.56.

That is the whole answer. Ding's trigger is not gated on Orders. `applyFormCeramics` requires
only that the extra Shape be a Bowl, Plate or Washer already among the vessels being formed;
it never consults the Order hand. The extra vessel can serve any purpose — a different Order,
the Exhibition, speculative stock — so Ding was already firing the ability as often as it
could, and steering Order choice toward a narrow ten-card subset bought nothing while costing
the flexibility that choice was worth.

This is the second teaching premise in the same family to fail on measurement. Ge's ability
was already saturated at 2.33 fires per game, so Order-seeking had nothing to fix; Ding's is
not Order-dependent in the first place. The one that worked, Guan, worked because its bonus
points at a whole class of Orders that are independently worth more.

## What was kept

The `["bowl", "plate", "washer"]` literal buried inside `applyFormCeramics` is now
`DING_EXTRA_SHAPES` in `orderRules.ts`, shared with the engine. That literal being unreachable
is the reason the AI had no way to ask the question at all, and the extraction stands on its
own regardless of this result.

`orderAdmitsDingPair` and `DING_SAVED_ACTION_VP` were removed with the branch rather than left
as dead code.

## Consequence for the Tradition table

Ding's measured 27.6% stands. The concern that prompted this — that 27.6% was an artifact of a
bot which could not seek pairable Orders — is answered: seeking them makes Ding *worse*, not
better, so the figure is not understated on that account. No re-measurement of the 800-game
table is needed.
