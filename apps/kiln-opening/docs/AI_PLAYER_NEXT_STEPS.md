# AI Player Next Steps

> Current online rules compatibility: V1.0.4. The V003 online policy and V004–V006 studies retain their original V1.0.1/V1.0.2 training labels and evidence. Write new compatibility output only below `playtests/v1.0.4/`; do not overwrite or relabel historical datasets.

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
