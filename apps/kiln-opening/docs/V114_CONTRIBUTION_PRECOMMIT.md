# v1.1.4 Contribution policy — evaluation precommitment

Written **before** the candidate was derived. Gates are fixed here so a result cannot be
re-read after the fact. This exists because `wood-001` measured +0.94 focal VP on its own
development seeds and +0.58 on fresh ones: the difference was selection, not strength.

## Baseline

Frozen **V003** (`selfplay-003`: `HeuristicAIPolicy` + `createProductionV3Profile`) playing
v1.1.4 through the shared evaluator. Measured over 36 probe games it is legal and sane —
Tend 78.5%, Stoke 17.4%, Bank 4.2%, Base Heat concentrated at 2–3, mean VP 30.14 — so it
is a fair control rather than a straw man.

## Seed families

Fresh and disjoint from every prior run in this project.

| Purpose | Game seed base | AI seed base |
|---|---|---|
| Screening | `0x11A4_0000` | `0x11A5_0000` |
| Confirmatory | `0x11B4_0000` | `0x11B5_0000` |
| Mirror | `0x11C4_0000` | `0x11C5_0000` |

Prior work used `0x7C99/0x8C99`, `0x4A11/0x5B22` and probe `0x0BE0/0x0BE1`. None overlap.
The confirmatory family is disjoint from the screening family, so a candidate tuned against
screening cannot inherit its luck.

## Design

* **Matched pairs.** Identical game and AI seeds in both arms. Control seats every player
  as V003. The candidate arm replaces seat `P1` only. Focal VP = candidate `P1` VP minus
  control `P1` VP on the same seed.
* **Mirror match.** All seats candidate versus all seats V003, same seeds. Rooms seat up to
  three computers, so an all-candidate table is reachable in ordinary play. This gate exists
  because the earlier `joint-001` candidate won matched pairs by free-riding on opponents'
  Wood and cost an all-candidate table 6.3 VP per player.
* Screening at 40 games per player count; confirmatory at 120 per count on the separate
  family. Screening may reject; only the confirmatory number is reported as the result.

## Gates — all must hold

1. **Legality.** Zero illegal actions and 100% completion in both arms.
2. **Focal VP.** Mean focal delta > 0 with a bootstrap 95% CI lower bound > 0.
3. **No losing seat count.** Per-count focal delta ≥ −0.25 VP at 2P, 3P and 4P.
4. **Mirror safety.** All-candidate table mean VP ≥ all-V003 mean − 0.50 VP, and Flawed
   rate ≤ all-V003 + 2.0 percentage points.
5. **Latency.** Candidate worst decision ≤ 1.5 × V003 worst decision in the same run.
6. **Non-degenerate.** Candidate plays at least two distinct cards, and no single card
   exceeds 92% of its contributions. A policy that always Tends is not a policy.

Failing any gate means the candidate is not shipped. A candidate that passes 1–3 but fails
4 is explicitly **not** promoted, however large its focal delta.

---

# Result

Run after the candidate was derived, against the gates fixed above. The candidate is
**rejected**.

| Family | Focal delta | 95% CI | 2P | 3P | 4P |
|---|---|---|---|---|---|
| Screening (`0x11A4`, n=120) | +0.433 | [−0.583, +1.450] | +0.100 | +0.600 | +0.600 |
| **Confirmatory** (`0x11B4`, n=360) | **+0.019** | **[−0.600, +0.656]** | **−1.033** | −0.158 | +1.250 |

| Gate | Result |
|---|---|
| 1. Legality | **pass** — 0 illegal, 720/720 finished |
| 2. Focal VP CI lower bound > 0 | **fail** — −0.600 |
| 3. Per-count ≥ −0.25 VP | **fail** — 2P at −1.033 |
| 4. Mirror safety | **pass** — all-candidate +0.504 VP, Flawed −0.72 pp |
| 5. Latency ≤ 1.5× V003 | **pass** — 0.80× (19.8 ms vs 24.8 ms) |
| 6. Non-degenerate (no card > 92%) | **fail** — Tend 93.9% |

Screening read +0.433 and the disjoint confirmatory read +0.019. That gap is the reason
the two families exist, and it repeats the `wood-001` pattern exactly (+0.94 development,
+0.58 fresh). Nothing here is evidence of strength.

## What the measurement actually shows

The contribution card is a **low-leverage decision** under v1.1.4. Both derivations
converge on playing Tend the overwhelming majority of the time, and so does frozen V003
without any purpose-built policy. The profile the candidate uses is a clone of V003's
weights, so the contribution choice is the only behavioural difference — and it is worth
about zero.

The reason is structural. A card moves Base Heat by at most one step, and v1.1.4's own
loading rules mean a player has already committed their ceramics to a zone before the card
is chosen. V003's placements self-select for the neutral heat, so the table lands on Base
Heat 2–3 in about 82% of firings whatever the cards do. There is little left for the card
to win, and the main thing a good policy achieves is *not wasting Wood* — which shows up
as an even higher Tend rate, not a lower one.

The one genuinely favourable signal is the mirror: an all-candidate table scores +0.504 VP
with 0.72 pp less Flawed than an all-V003 table. That is the opposite of the `joint-001`
failure mode and worth noting, but it does not offset a −1.033 VP regression at two
players, which is the most common online configuration.

## Correction to an earlier claim

The v1.1.4 migration comments and the shipped commit state that frozen V003 "cannot play
this ruleset" because it selects a bid value that no longer exists. **That is wrong.** V003
chooses its contribution through the shared evaluator, which was updated for the card set,
so it plays v1.1.4 legally: 360 control games, zero illegal actions, 720/720 completion,
mean 30.14 VP. The claim needs correcting wherever it appears.
