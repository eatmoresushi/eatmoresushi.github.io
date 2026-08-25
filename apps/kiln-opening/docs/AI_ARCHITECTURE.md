# Kiln Opening AI Architecture

## V1.1.6 compatibility status

The authoritative engine, public observation and online computer player now use the supplied V1.1.6 rules. The live policy retains the historical `rules-v1.1.5-order-001` identifier because policy identifiers describe AI lineage, not board-game rules versions; every candidate command is enumerated, validated and applied by the V1.1.6 engine. Existing serialized profiles and playtest outputs remain historical and must not be relabelled or overwritten. The pre-reconciliation V1.1.6 Technique calibration is disabled until its study is rerun against the reconciled engine.

## Selfplay-005 public-belief rollout candidate

Selfplay-005 reconstructs complete sampled engine states exclusively from `PlayerObservation`. For a fixed observation and seed, hidden authoritative deck order cannot affect the sampled belief. Projection tests require every sampled belief to project back to exactly the source public state.

In the historical V005 study, the decision oracle applied candidate commands through the then-current V1.0.1 engine, then advanced a bounded number of real legal transitions using common random numbers. Under current play it consumes the V1.1.6 engine. Unrevealed Contribution choices are never sampled from server state: Contribution decisions bypass the oracle and use the safe evaluator.

The V005 study separates four datasets:

1. serialisable public decision captures;
2. deeper decision-oracle calibration targets;
3. pre-holdout latency and cross-play canaries used to freeze configuration;
4. fresh paired 2/3/4-player holdout games used only for promotion.

The full held-out study did not promote V005. It was legal, deterministic, failure-free, and under the 20-ms p95 budget, but averaged 0.322 VP below Selfplay-003 and completed fewer Orders. Selfplay-003 therefore remains the default.

## Selfplay-006 calibrated leaf-ranking candidate

Selfplay-006 preserves V005's public-belief reconstruction, common-random-number rollouts, engine legality, optional-effect guards, and hidden-information boundary. It replaces only the handcrafted public leaf value used by the decision oracle.

The V006 training pipeline captures balanced V1.0.2 public decision states at 2/3/4 players, applies the top legal candidates to identical sampled beliefs, records short-, one-round-, and two-round public checkpoints, and continues each trajectory to game end with the frozen safe policy. A regularized linear model learns a compact public-state value target combining relative final VP, relative completed Orders, win credit, and a small stranded-pipeline penalty. Entire capture games, rather than individual rows, are held out for decision-state validation.

Historical V1.0.1 V005 observations are audited for schema and phase coverage but are never mixed into the final V1.0.2 fit. Model artifacts declare their rules version and are rejected across incompatible rules.

The bounded trial command is `npm run selfplay:v102:006:quick`. It is explicitly provisional. The full `npm run selfplay:v102:006` evaluation is promotion evidence only after the model and holdout report are reviewed; Selfplay-003 remains the default until every statistical, Order, legality, oracle-failure, and latency gate passes.

## Selfplay-004 candidate layer

`LookaheadAIPolicy` wraps the frozen Selfplay-003 evaluator. It searches an abstract route state derived only from `PlayerObservation`, never from authoritative hidden decks or other players' pending Wood. Search is deterministic: depth is capped at three and work is bounded by a fixed node count rather than wall-clock timing.

`SelfPlayGameConfig` can assign a policy version and profile per player. This supports direct V003-versus-V004 cross-play without changing the engine or rules. If no policy version is supplied, the runner continues to use Selfplay-003.

The V004 promotion pipeline is:

1. validate named strategic scenarios covering every Technique and Kiln;
2. tune bounded-search configurations on dedicated training seeds;
3. freeze the selected search configuration;
4. run fresh matched baseline/candidate pairs with candidate seats rotated;
5. promote only if legality, coverage, latency, completed-Order, mean-VP, and paired-confidence gates all pass.

Current rules version: V1.1.6
AI policy version: `rules-v1.1.5-order-001` (historical lineage identifier)

## Boundaries

The AI is a client of the existing rules engine. It does not calculate authoritative state, move resources, draw cards, assign Quality, or bypass intermediate timing windows.

The reusable flow is:

1. `createPlayerObservation` projects exactly what the acting player may know.
2. `getLegalAIActions` enumerates typed candidates and submits each candidate to the unchanged engine as the final legality oracle.
3. A feasibility planner reconstructs an advisory Order portfolio from that observation.
4. `HeuristicAIPolicy` evaluates only the sanitized observation, reconstructed plan, and legal commands.
5. The authoritative engine applies the selected command.
6. Structured events, plans, and decisions feed telemetry and future-game learning.

## Observation safety

`PlayerObservation` contains the public multiplayer projection, the acting player's own pending Contribution submission, and conditional Fire probabilities derived from the printed deck composition and face-up discard.

It never contains:

- Market, Imperial, Technique, or Fire deck order;
- the next blind Order or Fire card;
- another player's unrevealed Contribution card.

Order hands remain visible because `docs/IMPLEMENTATION_DECISIONS.md` defines tabletop Order areas as open information.

## Legal action coverage

The legal-action layer covers setup, all eight worker locations, Office and Guild substeps, secret Contribution submission, every firing timing window, Order completion, Cleanup transition, and End-game Exhibition. Optional effects retain both use and decline commands.

Candidate enumeration is not a second rules engine. The real `applyAction` or `submitWoodContribution` result decides legality. Normal play bounds combinatorial Glaze choices; exhaustive mode exists for regression tests.

## Evaluator and policy

The evaluator retains named numeric factors instead of opaque reasoning text:

- immediate VP;
- future VP;
- resource efficiency;
- Imperial value;
- Quality value;
- blocking;
- risk;
- learned adjustment.
- Order feasibility;
- plan progress;
- conversion urgency;
- projected resource demand;
- opportunity cost.

For every held or visible candidate Order, the planner performs a unique-ceramic assignment, checks printed requirements and relationships, estimates stage and resource debt, uses the public conditional Fire distribution for Quality probability, and estimates the earliest plausible completion round. The current portfolio contains one primary target and compatible secondary targets. It is recomputed for every observation, so it has no hidden or stale reconnect state.

Resource values diminish after projected spending plus a small safety margin. Round-5 evaluation penalizes speculative production and stranded stages while increasing the value of Glaze, Load, Fire, delivery, sale, and Presentation routes. Blind Order expectation is calculated from printed composition minus public displays, discards, hands, and completions; hidden order is never consulted.

Quality decisions use public kiln positions and the conditional distribution of remaining Fire modifiers. The policy is deterministic for a fixed observation, profile, game context, and AI seed. Exploration samples only from high-scoring legal choices.

## Learning and persistence

Separate 2P, 3P, and 4P strategy profiles start from hand-authored priors. Deterministically scheduled Market, Imperial, Hybrid, Quality/control, Volume/multi-ceramic, and Technique/economy intents bias only feasible choices. A completed training game's results update future games only. Updates include completed and abandoned Orders, acquisition feasibility, actions invested, Technique opportunities and uses, intent and realized tags, excess resources, and unused ceramics. All values remain bounded.

The historical study serialized initial, game-10, game-30, game-50 mature, and frozen-holdout policy snapshots in `ai_strategy_v1.0.1.json`. A future V1.0.2 run writes `ai_strategy_v1.0.2.json` under `playtests/v1.0.2/`. Games 1–50 per player count train; games 51–100 use the frozen game-50 profile with fixed mature exploration. Rules and policy versions are independent.

## Reproducibility and diagnostics

Game randomness and AI exploration use separate seeded generators. The complete seed and replacement schedule is written before simulation. Decision logs retain identifiers, dataset split, version context, legal counts, chosen score, three alternatives, structured factors, assigned intent, realized tags, concise plan features, latency, and exploration. They do not store private chain-of-thought.

The self-play runner records and replaces invalid attempts without modifying rules. A decision guard prevents silent infinite games. Selfplay-003 adds pure after-Fire counterfactuals, decoration-aware Ge evaluation, terminal destination capacity, early Imperial route commitment, and expected-use Technique purchasing. Historical artifacts live in `playtests/v1.0.1/selfplay-003/`; new V1.0.2 runs write to `playtests/v1.0.2/selfplay-003/`. The Selfplay-001 and Selfplay-002 baselines remain immutable.

## Frozen-bot experiments

The historical `jun-ab-001` study reused the exact Selfplay-003 frozen 2P/3P/4P profiles with mature exploration and no learning. Its explicit V1.0.1 control cost 0, while the experiment-only `jun_cost_1` arm authoritatively charged 1 Coin only on a selected adjustment. V1.0.2 independently supersedes both with the official 2-Coin cost.

Both historical arms passed through the same legal-action, observation, planning, evaluator, policy, and engine paths. The evaluator read only the sanitized public cost and priced it through the existing marginal Coin model. A precommitted common-random-number schedule paired seeds, seats, Traditions, first player, and intents. Experiment evidence remains under `playtests/v1.0.1/experiments/jun-ab-001/` and cannot update the frozen profiles or current rules.

`imperial-track-ab-001` is a historical-holdout replay experiment. Its control is the unchanged archived 150-game Selfplay-003 V1.0.1 holdout, not a newly simulated control. Candidate A changed only every Imperial Order's active Progress gain to +2. Candidate B retained printed +1/+2 Order gains but exposed the public 1/3 Apprentice milestones, `0/0/2/2/4/8` VP curve, 4/5 Presentation spaces, and 2-VP Seal. V1.0.2 subsequently adopted those public Candidate B track values as part of the authoritative rulebook; this does not retroactively relabel the experiment or its policy.

The authoritative engine reads the active public rules for Progress, milestone crossing, Presentation eligibility, Seal ownership, and final scoring. The observation exposes only those public active rules. Planning and evaluation use one parameterized consequence model rather than candidate-specific policy branches, and never branch on game ID, seed, or known outcome. The exact archived game/AI seeds, seats, first player, Traditions, intents, deck RNG, frozen profile, and exploration are replayed once per candidate with no learning or replacements. Twelve default-configuration canaries must reproduce the archive before the 300 candidate games run. Evidence lives under `playtests/v1.0.1/experiments/imperial-track-ab-001/`; it cannot update official rules or the frozen profile.
