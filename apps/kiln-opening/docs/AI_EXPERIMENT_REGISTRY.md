# AI Experiment Registry

Board-game rules versions and AI experiment versions are independent. Historical outputs are immutable and remain useful as regression evidence, but they must not be relabelled as current-rules training data.

| AI lineage | Rules evidence | Status | Current use |
|---|---|---|---|
| Rules-V1.2.4-Heuristic-001 | V1.2.4 deterministic legal-play coverage | current online policy | Online AI and 2/3/4-player full-game regression coverage |
| Selfplay-003 | trained V1.0.2; compatibility baseline V1.0.4 | frozen historical policy | Historical regression opponent and V1.0.4 baseline only |
| Selfplay-004 | V1.0.1 | failed the positive paired-confidence gate | Historical negative result and search regression opponent |
| Selfplay-005 | V1.0.1 | failed strength, player-count, and Order gates | Historical public-belief/oracle pipeline evidence |
| Selfplay-006 | provisional V1.0.2 quick study | leaf-ranking holdout gate did not pass | Reusable public-only methodology; fitted weights are historical |
| Rules-V1.0.4 Population-001 | V1.0.4 | failed strength gate | Archived wide-behavior envelope and negative-result evidence |
| Rules-V1.0.4 Population-002 | V1.0.4 | passed safety/coverage, failed strength gate | Conservative V003-anchored candidate evidence; not deployable |
| Rules-V1.0.4 Population-003 | V1.0.4 | passed synthetic safety, coverage, and strength gates | Non-inferior fresh-seed candidate; deployment still requires a separate decision |
| V109-V003-Compat-001 | V1.0.9; V003 trained V1.0.2 | frozen compatibility baseline complete | Honest V1.0.9 comparison target; 150 complete games, zero illegal actions |
| V109 Population-001 | V1.0.9 | trained; passed every precommitted gate at a negative point estimate | Fresh V1.0.9 lineage; non-inferior within tolerance, not stronger; not deployable on this evidence |

## Compatibility discipline

- Preserve raw outputs under their original `playtests/<rules-version>/` directory.
- Reuse code and unchanged feature definitions, not historical performance claims.
- Do not mix rules-sensitive observations or fitted labels across rules versions.
- Compare candidates against a baseline executed by the same authoritative rules engine.
- A synthetic candidate can pass safety, coverage, and strength gates without becoming a human-calibrated model.
- Deployment remains a separate explicit decision after reviewing holdout evidence.

## V1.0.9 baseline and Population-001 precommit

`v109-v003-compat-001` uses the repaired V1.0.9 observation, legal-action, evaluation, and authoritative engine contract with frozen V003 profiles. Its 50 × 2P, 50 × 3P, and 50 × 4P games use a fresh, First-Player-balanced seed family. All 150 games completed with zero illegal selections, invalid attempts, or replacements. This is the only same-rules V1.0.9 comparison baseline; the V1.0.4 Population-003 result must not be used as its substitute. It is historical evidence, not a V1.1.6 baseline.

`rules-v1.0.9-population-001` reuses the Population-003 structural idea—deterministic V003 anchoring with narrow public-counterfactual Wood and Technique exceptions—but redefines those counterfactuals for V1.0.9, including Fuel Ledger and private Test Pieces information. Initial profiles are fresh V1.0.9 objects whose learned/action/Order/Technique priors equal frozen V003, with uniform persona weights and zero games learned. New conservative exception margins and all training/behavior/paired seeds are frozen in the precommit before training. The artifact explicitly contains no V1.0.4 fitted weights and no inherited V1.0.4 performance claim.

## Population-001 design

`rules-v1.0.4-population-001` contains six strategy families (Market, Imperial, Hybrid, Quality, Volume, and Technique) with conservative, balanced, and opportunistic temperaments. Training uses 500 games at each player count, final realized outcomes, bounded profile updates, and capped/floored persona weights. Independent evidence consists of 50 all-population games at each player count plus 30 paired focal-seat comparisons against frozen V003 at each player count.

The population policy uses only player-visible observations. Variable Wood contributions are evaluated from the acting player's public kiln portfolio and an explicit uncertainty assumption about other contributors. It never reads authoritative hidden deck order or unrevealed opposing Wood.

The completed study is under `playtests/v1.0.4/population-001/`. All 1,500 training games, 150 behavioral holdouts, and 90 paired focal-seat comparisons completed legally. Behavior coverage passed, but the strength gate failed: mean paired VP delta was -0.911 with a 95% bootstrap interval of [-2.689, 0.822]. Population-001 remains immutable negative-result evidence.

## Population-002 design and result

`rules-v1.0.4-population-002` preserves the Population-001 persona and calibration machinery but anchors ordinary actions to frozen V003. A non-V003 Wood choice is admitted only when the acting player's public loaded-ceramic portfolio values it materially above the one-Wood baseline. Technique-economy personas may enter the Guild only when a public multi-round Technique forecast clears a positive threshold. Other players' unrevealed Wood and authoritative deck order remain unavailable to the policy.

The completed study is under `playtests/v1.0.4/population-002/`. All 1,500 training games, 150 behavioral holdouts, and 90 paired comparisons completed with zero illegal actions. Every precommitted behavior-coverage gate passed: all six strategy families appeared, Techniques were purchased 55 times, and Wood 0/1/2 were all represented. Strength still failed. Mean paired VP delta was -0.711 with a 95% bootstrap interval of [-1.189, -0.289]; player-count deltas were -0.100 at 2P, -0.733 at 3P, and -1.300 at 4P. The overall floor was -0.500 and each player-count floor was -0.750. V003 therefore remains the production policy.

Post-study diagnosis is descriptive, not a valid retune on the same evaluation seeds. Sixty-six of 90 paired focal seats made no Population-002 exception and matched V003 exactly. The loss was concentrated in the seats that bought Techniques or chose alternate Wood, especially alternate-Wood choices at 4P. Any successor must be a new version with frozen changes and fresh paired seeds; do not rerun Population-002 on these evaluation seeds and claim promotion.

## Population-003 precommitment

`rules-v1.0.4-population-003` is a new candidate rather than a Population-002 relabel. It models each other eligible contributor at the observed one-Wood convention, preventing the Population-002 rounding error that could treat three V003 opponents as only two expected Wood. Technique decisions use the same V003-anchor public forecast written to telemetry, with frozen minimum net-value margins of 0.90–1.55 according to player count and temperament. Ordinary actions remain the deterministic V003 top action.

Training, behavioral holdout, persona sampling, and paired comparison use new seed families. Automated tests reject overlap with Population-002 game and AI seeds. The strength floors remain unchanged: overall mean paired VP delta at least -0.50, every player-count subgroup at least -0.75, mean Order delta at least -0.10, zero illegal actions, and decision p95 below 20 ms. Because the candidate deliberately removes quota-driven detours, its frozen behavioral floor is at least 3% of player-games purchasing a positive-forecast Technique, plus at least one public-value Wood alternative to the one-Wood baseline; the alternative's direction is not prescribed.

The completed study is under `playtests/v1.0.4/population-003/`. All 1,500 training games, 150 fresh behavioral holdouts, and 90 fresh paired comparisons completed with zero illegal actions. Every precommitted gate passed. Behavioral holdout seats purchased 20 Techniques (4.4% of player-games) and made 25 zero-Wood exceptions; 98.7% of contributions remained at the one-Wood convention. Paired mean VP delta versus frozen V003 was +0.067 with a 95% bootstrap interval of [-0.033, +0.200]. Player-count deltas were -0.033 at 2P, +0.033 at 3P, and +0.200 at 4P; mean Order delta was exactly zero and decision p95 was 12.828 ms.

This is evidence of non-inferiority, not proof that Population-003 is stronger or human-calibrated. Its interval includes zero, its behavioral frequencies are synthetic, and deployment remains a separate explicit decision. V003 stays online until that decision is made.

## V1.0.9 Population-001 result

The completed study is under `playtests/v1.0.9/v109-population-001/`. The runner refuses to start unless the regenerated training, behavior and paired schedules hash-match `precommit/`, so the result is reported against the seeds frozen before any fitting.

All 1,500 training games (500 at each player count across 18 personas), 150 behavioral holdout games, and 90 paired comparisons completed with zero illegal actions and zero invalid attempts. Profiles are fresh V1.0.9 objects calibrated only from multi-round realized outcomes in this study: Orders credited from the round they were delivered, Techniques weighted by realized use, and two signals V1.0.4 could not produce — realized firing quality tuning `qualityParameters`, and stranded ceramics raising the persona's Wood valuation.

Every precommitted gate passed, coverage and strength. Coverage: all six strategy families present, 262 Technique purchases across 450 player-games, and the required alternate-Wood exception. Strength: mean paired VP delta **-0.233** with a 95% bootstrap interval of [-0.878, +0.389]; player-count deltas -0.333 at 2P, -0.167 at 3P, and -0.200 at 4P; mean Order delta -0.044; decision p95 16.649 ms.

**Passing the gates is not a promotion claim here.** Unlike V1.0.4 Population-003, whose point estimate was positive, this candidate's point estimate is negative and its interval is wide enough to contain both a meaningful gain and a meaningful loss. It clears the precommitted floors (-0.50 overall, -0.75 per player count) but provides no evidence of superiority over frozen V003. It should not be deployed on this evidence.

### The Base Heat band makes 2 and 3 Wood dominated

The holdout never reached High Base Heat in 748 firings, and never chose 2 or 3 Wood in 2,042 contributions. This is a property of the V1.0.9 rules, not a policy defect. Against contributors playing the one-Wood convention, a single player's options collapse:

| Focal Wood | 0 | 1 | 2 | 3 | 4 (Fuel Ledger) |
|---|---|---|---|---|---|
| Resulting Base Heat at 2P/3P/4P | Low | Medium | Medium | Medium | High |

Contributing 2 or 3 buys exactly the Base Heat that 1 already buys, at strictly greater Wood cost, so a rational policy never selects them. Zero Wood is the only unilateral band change available, and the population used it 74 times (3.6%). The single unilateral route to High is Fuel Ledger's fourth Wood — and the population bought Fuel Ledger **zero** times out of 262 Technique purchases, so High was structurally unreachable for the whole study.

This makes Migration Spec §10's suggested heuristic ("if most of my ceramics want High, contribute 3") ineffective as written: contributing 3 is indistinguishable from contributing 1 unless other contributors also raise. Reaching High is a coordination problem or a Fuel Ledger problem, not a Wood-quantity problem. Any successor lineage should be frozen as a new version with fresh seeds, and should treat Fuel Ledger acquisition — not Wood quantity — as the lever that opens high-heat play.

### Confirmatory evaluation and promotion decision

Screening used the precommitted 30 pairs per player count. Promotion evidence used a separate confirmatory family of 100 pairs per count (300 pairs / 600 games) whose seeds are disjoint from training, holdout, and screening; the runner asserts that disjointness before the first game and freezes the schedule to disk before any delta is visible. Screening seeds were not reused, because a candidate that survived screening has already been selected on them.

| Stage | Pairs | Mean VP delta | 95% bootstrap CI |
|---|---:|---:|---|
| Screening | 90 | -0.233 | [-0.878, +0.389] |
| Confirmatory | 300 | -0.213 | [-0.640, +0.197] |

The larger sample tightened the interval without moving the point estimate, so the negative result is stable rather than noise. Both stages completed with zero illegal actions and zero invalid attempts.

Player-count detail from the confirmatory stage is where the candidate actually fails: 2P -0.200 VP, 3P **+0.210** VP, 4P **-0.650** VP. The 4P Order delta is -0.120, which breaches the -0.10 Order floor even though the overall mean (-0.053) clears it — the precommitted gate tests only the overall mean, so it does not catch this. Any successor should gate Order delta per player count as well.

**Promotion is not recommended.** Every safety, completion, sample-size and latency gate passes, but the point estimate is negative and the confidence interval still admits a material loss (-0.640). Passing floors establishes non-inferiority within tolerance, not superiority, and 4P is a genuine regression. Frozen V003 remains the production policy.

### Edge latency defect found and fixed during evaluation

`V109PopulationPolicy.techniqueValue` rebuilt the multi-round anchor plan once per legal action, although the plan depends only on the observation, anchor profile and intent, and `chooseAction` had already computed the identical plan. At a 1,885-action work phase this repeated one plan 1,885 times.

The effect was invisible to the `decisionP95Under20Ms` gate, which measures a per-seat p95, and only appeared in the tail: p99 15.755 ms, p99.9 57.171 ms, maximum 442.806 ms, against frozen V003's 5.389 / 8.975 / 16.430 ms. With `MAX_COMPUTER_ACTIONS_PER_REQUEST = 24`, one Edge request could spend roughly 10.6 s in AI compute. The confirmatory stage's seat p95 of 18.616 ms cleared the 20 ms gate by 1.4 ms.

Passing the plan in from the caller is behaviour-preserving: over 12 Technique-economy games the SHA-256 of all 1,137 chosen actions is unchanged, and re-running the full 150-game holdout reproduces exactly 21,602 decisions. Post-fix latency is p50 0.424 ms, p95 3.632 ms, p99 5.264 ms, p99.9 8.726 ms, maximum 18.640 ms — at or below frozen V003 at every percentile except the maximum, where the two are comparable. Edge worst case falls from ~10.6 s to ~0.45 s.

Because the change is provably behaviour-preserving, the strength results above stand; only the latency figures recorded inside the confirmatory artifact are pre-fix and therefore pessimistic.
