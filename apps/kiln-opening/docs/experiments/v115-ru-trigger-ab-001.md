# Ru's trigger and award — four arms on matched seeds

Ru is the one Tradition every measurement has pointed at: last in all five runs of the
Tradition table (21.1, 23.5, 23.6, 24.2, 24.3) and firing 0.61 times a game against Jun's
2.77. Teaching the agent to seek qualifying Orders moved it 0.49 → 0.64 and did not move its
score, so the remaining lever is the rule.

Ru pinned to seat 0, 250 matched pairs per player count, n = 500 per arm, all arms sharing
the control's seeds. **Ru's fair share in this setup is 29.2%** — the average of 1/3 at three
players and 1/4 at four — not the 28.6% used for the full table.

## Results

| arm | trigger | award | win | delta vs control | 95% CI | VP delta | fires/game |
|---|---|---|---|---|---|---|---|
| control | Masterpiece | 4 VP | 25.5% | — | — | — | 0.60 |
| `fine_2` | Fine+ | 2 VP | 25.6% | +0.10 pp | `[-2.40, 2.70]` | −0.02 | 1.18 |
| **`fine_3`** | **Fine+** | **3 VP** | **29.6%** | **+4.10 pp** | `[0.80, 7.50]` | +1.52 | 1.28 |
| **`master_6`** | **Masterpiece** | **6 VP** | **30.5%** | **+5.00 pp** | `[2.70, 7.30]` | +1.11 | 0.63 |

## `fine_2` is a no-op, exactly as the arithmetic warned

Fine+ at 2 VP was predicted to give 3.4 VP/game — the same as Guan. It doubled the firing
rate (0.60 → 1.18) and moved the win rate by a tenth of a point.

That is the clearest evidence yet that **matching VP per game does not match win rate**. Guan
earns its 34.9% partly because its ability pulls it toward Imperial Orders, which are
independently worth more (9.73 against 7.83 VP) and carry Progress. Ru's ability pulls it
toward a Glaze, which carries no such compounding — and the earlier teaching experiment
showed that steering costs about as much flexibility as the bonus returns. Any Ru fix has to
be worth more than parity on paper.

## Both real fixes land Ru at fair share

`fine_3` reaches 29.6% and `master_6` 30.5%, against a fair share of 29.2%. Their intervals
overlap, so they are not distinguishable from each other; both are distinguishable from the
control.

`master_6` is the better buy per point of VP: +5.00 pp for +1.11 VP, against `fine_3`'s
+4.10 pp for +1.52 VP. It also has the tighter interval. The likely reason is that keeping
the Masterpiece requirement keeps Ru pointed at high-Quality play, which pays again in the
end-game Exhibition, where a Masterpiece is worth 4 VP against a Fine's 2.

## The design choice, not a balance one

Both arms fix the balance. They produce different games:

- **`master_6`** keeps Ru rare and decisive — 0.63 fires a game, each worth 6. The
  perfectionist kiln, whose ability lands about twice a game and matters when it does.
- **`fine_3`** makes it routine — 1.28 fires a game at 3 VP. A steadier, less dramatic
  ability that rewards consistent Celadon work rather than exact firing.

The shipped rules are unchanged; both remain experiment arms pending a decision.
