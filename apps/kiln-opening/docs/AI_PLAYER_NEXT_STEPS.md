# AI Player Next Steps

> Current online rules compatibility: **V1.1.6**. The online policy retains the historical
> `rules-v1.1.5-order-001` lineage identifier, but its legal actions are generated, validated,
> and applied by the V1.1.6 engine. Write new V1.1.6 output only below
> `playtests/v1.1.6/`; do not overwrite or relabel historical datasets.
>
> **Everything below documenting earlier rule-version lineages is a historical record.** The
> V1.0.4 and V1.0.9 policies were deleted when V1.1.4 replaced the numeric 0–3 Wood bid: they select a bid
> value that no longer exists in the legal action set, so they cannot play this ruleset.
> Their measurements are retained here; their code is not.

## V1.0.9 contract and honest baseline

The V1.0.9 observation/legal-action repair is complete. It exposes only the acting player's Test Pieces peek and sealed Fuel Ledger commitment; enumerates V1.0.9 Material exchanges, unlimited Clay Substitution, Drying Frames, merged Shifu Glaze actions, and all Connoisseur sale qualities; and evaluates the new Office, Kiln Yard, Technique, and Wood rules without the historical fixed-one-Wood bonus.

`v109-v003-compat-001` is now the frozen comparison target. It ran exactly 50 fresh-seed games at 2P, 3P, and 4P with frozen V003 profiles, no learning, and no exploration. All 150 games completed on V1.0.9 with zero illegal selections and no replacements. The local ignored evidence is under `playtests/v1.0.9/v109-v003-compat-001/`; rerunning the committed command requires a new empty output path rather than overwriting it.

`v109-population-001` is precommitted but untrained. It reuses Population-003's conservative V003-anchor architecture, with V1.0.9-native Wood/Fuel Ledger and Technique forecasts. Its profiles are freshly initialized from frozen V003, its persona weights are uniform, and its training, behavioral-holdout, and paired-evaluation seeds are frozen and disjoint before fitting. It imports no fitted V1.0.4 weights or performance claims. The precommit is under `playtests/v1.0.9/v109-population-001/precommit/` and can be regenerated only into a new empty directory with `npm run selfplay:v109:population:prepare`.

## V1.0.4 Population-002 outcome

Population-002 implemented the conservative successor to Population-001: V003-anchored ordinary play, positive public multi-round Technique exceptions, and public loaded-portfolio Wood exceptions. The full study completed 1,500 training games, 150 independent behavioral games, and 90 matched focal-seat pairs with zero illegal actions. All coverage gates passed, including 55 Technique purchases and Wood 0/1/2 representation.

It must not replace online V003. Mean paired VP delta was -0.711 with a 95% bootstrap interval of [-1.189, -0.289]. The 2P subgroup was close at -0.100, but 3P was -0.733 and 4P was -1.300. The precommitted overall and player-count strength floors were -0.500 and -0.750 respectively.

Run `npm run selfplay:v104:population:002:quick` only to check the pipeline. The completed full command is `npm run selfplay:v104:population:002`; its immutable local evidence is under `playtests/v1.0.4/population-002/`.

Population-003 is now registered as a separate frozen candidate. It corrects the expected-other-Wood model at 3P/4P, requires stricter V003-anchor forecast evidence for Technique detours, and uses fresh training, behavior, persona-sampling, and matched evaluation seeds. Its quick trial is pipeline evidence only; the unchanged strength gates and the revised 3% positive-Technique/any-alternate-Wood behavior floors are precommitted in `docs/AI_EXPERIMENT_REGISTRY.md` before the full study. Until real human telemetry exists, preserve all failed candidates as useful boundary evidence rather than treating their synthetic frequencies as human estimates.

The full Population-003 study passed every synthetic gate. Across 90 fresh matched pairs it averaged +0.067 VP versus V003, with a 95% bootstrap interval of [-0.033, +0.200], zero Order delta, zero illegal actions, and 12.828-ms decision p95. Its 2P/3P/4P deltas were -0.033/+0.033/+0.200. The behavior holdout retained 20 positive-forecast Technique purchases and 25 evidence-based zero-Wood exceptions while 98.7% of contributions remained one Wood.

Treat this as non-inferiority, not demonstrated superiority. Population-003 may now be considered for an explicit online A/B or difficulty-option decision, but it should not silently replace V003 and its synthetic persona frequencies should not be interpreted as human behavior.

## V1.0.4 Population-001 outcome

Population-001 trained and evaluated the same 18 bounded-rational personas under authoritative V1.0.4 rules. It passed safety and behavior coverage but failed the strength gate at -0.911 paired VP, with a 95% bootstrap interval of [-2.689, 0.822]. Its wider Wood and Technique behavior remains useful archived coverage evidence, not a deployment candidate. See `docs/AI_EXPERIMENT_REGISTRY.md` for lineage and compatibility status.

## Selfplay-006 implementation

Selfplay-006 implements the recommended next step after V005: a compact learned leaf-ranking target trained against multi-round realized outcomes. It deliberately retains the V005 belief sampler and authoritative engine transitions, while fitting only from fresh V1.0.2 public states. Saved V1.0.1 V005 observations remain useful as an archived schema audit but are excluded from V1.0.2 weights.

Use `npm run selfplay:v102:006:quick` for a bounded smoke/holdout/cross-play trial. Do not interpret its small matched-game sample as promotion evidence. Review `playtests/v1.0.2/selfplay-006/leaf_validation.json` first; run `npm run selfplay:v102:006` only if the game-level holdout improves action ranking over the V005 handcrafted value.

## Selfplay-005 outcome (2026-08-10)

Selfplay-005 implemented public-only belief reconstruction, real engine-transition rollouts, a decision-oracle dataset, exact positive/decline Technique fixtures, latency-qualified pre-holdout tuning, and paired bootstrap promotion gates.

It must not replace Selfplay-003. Across 90 held-out pairs it averaged −0.322 VP, its bootstrap interval was [−1.344, 0.622], and completed Orders declined by 0.089 per focal game. All safety and operational gates passed: zero illegal actions, zero oracle failures across 3,659 oracle decisions, complete competency coverage, and 15.654-ms decision p95.

The next AI iteration should not merely widen or deepen the same oracle. Its five-decision calibration target and handcrafted leaf value predicted very low regret but did not correlate with final VP. The next bounded task is to train the leaf-value/ranking target against multi-round realized outcomes from the saved V005 public states, then validate that target on a separate decision-state holdout before starting another game-level promotion study.

The historical V005 command was:

```bash
npm run selfplay:v101:005
```

Artifacts are under `playtests/v1.0.1/selfplay-005/`.

This is a historical V1.0.1 result. Its policy and artifacts remain frozen; evaluate or retrain separately under V1.0.2 and write new outputs below `playtests/v1.0.2/`.

For a new V1.0.2 study, use `npm run selfplay:v102:005`; do not treat it as comparable evidence until a new precommitted evaluation is completed.

## Selfplay-004 implementation (2026-08-10)

Selfplay-004 is now a separate candidate policy. It adds an explicit multi-round route budget, deterministic public-information lookahead, recurring Technique valuation, visible-opponent location pressure, terminal conversion pressure, and per-seat paired cross-play. It does not replace the frozen Selfplay-003 baseline automatically.

The historical V004 command was:

```bash
npm run selfplay:v101:004
```

The runner first selects among conservative, balanced, and hard search configurations on training seeds. It then freezes that selection and evaluates fresh matched seeds with the V004 focal seat rotated through all seats at 2, 3, and 4 players. Promotion requires every gate in `playtests/v1.0.1/selfplay-004/study_summary.json` to pass.

This is also historical V1.0.1 evidence and must not be relabelled or overwritten by V1.0.2 work.

The V1.0.2 launcher is `npm run selfplay:v102:004` and writes to `playtests/v1.0.2/selfplay-004/`.

## Smallest production task

Add an `is_ai` flag and a serialized AI policy/profile reference to room seats, then let the server's authoritative command loop invoke the existing policy whenever an AI-controlled seat is the current actor.

That incremental task should:

1. let the host add or remove AI seats in the lobby;
2. persist AI seat identity, policy version, difficulty parameters, and AI seed;
3. build the acting seat's sanitized observation on the server;
4. obtain authoritative legal actions and call `HeuristicAIPolicy`;
5. submit the chosen command through the same multiplayer service used by humans;
6. continue automatically across AI-only timing windows while yielding after each authoritative revision;
7. expose a short visible “AI is choosing” state and a recoverable timeout;
8. add reconnect and mixed Human/AI integration tests.

Do not run the authoritative AI in a browser. A browser can disconnect or inspect data outside its seat. The server already owns validation and is the correct place to schedule AI turns.

## Later improvements

- Add difficulty presets by changing exploration, evaluation noise, opponent awareness, candidate breadth, and future search depth.
- Add stronger multi-round Order planning and explicit opponent intent models.
- Version and deploy policy artifacts independently of board-game rules; keep trained-rules and current-rules metadata separate.
- Allow replacing an empty disconnected seat only with explicit host consent and a durable audit event.
- Add time budgets and a deterministic fallback to the highest-scoring one-ply action.
