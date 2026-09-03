# PLAYTEST_TELEMETRY.md

Telemetry is for balance analysis, not player profiling.

Current **V1.2.2** telemetry records Crown-driven Imperial Recognition and each milestone, the five-card Main Order display's three-card rotation, End-game Exhibition and featured-three scoring, Fire and Quality distributions, Jun/Ge and Kiln Yard Shifu windows, public Contribution cards and effective Heat only after simultaneous reveal, Fuel Ledger upgrades, Starting and Advanced Tech effects, Commission advances, Labour, Workshop Seconds, Imperial Kiln loads and Imperial Priority use. Starting Order offers, Colour Samples choices, Test Pieces peeks and unrevealed Fuel Ledger commitments remain private. Obsolete Court Patronage, Imperial Seal, Apprentice-unlock and Progress-stipend events are not produced by V1.2.2. Historical exports remain immutable under their original rules labels.

## Historical telemetry

The frozen `v109-v003-compat-001` baseline writes only below `playtests/v1.0.9/v109-v003-compat-001/`. Its 150 games retain the normalized game/player/round/Order/Technique/action/decision/firing/kiln tables plus explicit submitted/effective Wood distributions and V1.0.9 action coverage. The run completed with 150/150 valid games, zero illegal selections, and zero replacements. Its Selfplay-003 profiles remain labelled as trained under V1.0.2.

The `v109-population-001` precommit writes only below `playtests/v1.0.9/v109-population-001/precommit/`. It contains an untrained profile artifact and separate frozen schedules for 1,500 training games, 150 behavioral games, and 90 paired scenarios. The manifest explicitly records that V1.0.4 fitted weights and performance claims were not imported. No strength or human-likeness claim exists until those V1.0.9 schedules are executed and reviewed.

The V1.0.4 V003 baseline is a frozen-policy compatibility study: 50 games each at 2P, 3P, and 4P, with learning and exploration disabled. It writes only below `playtests/v1.0.4/selfplay-003-baseline-001/`, retains the established normalized game/player/round/action/decision/plan/Order/Technique/firing/kiln/intent/optional-effect metrics, and adds a focused public V1.0.4 rules-event export for Progress, stipends, Order-display rotation, Exhibition, and final scoring. The production V003 profile remains honestly labelled as trained under V1.0.2.

V1.0.4 Population-001 writes only below `playtests/v1.0.4/population-001/`. Its training records retain final realized outcomes, action types, completed Order IDs, owned Technique IDs, public Wood decisions, and anonymous persona IDs; they do not retain hidden deck order or reasoning text. The independent behavior holdout writes the same normalized tables as the V003 baseline. Persona weights retain a 2.5% floor and 12% cap so outcome calibration cannot erase a strategy family. Paired evaluation rotates a population focal seat against frozen V003 using common game and AI seeds.

V1.0.4 Population-002 writes only below `playtests/v1.0.4/population-002/` and retains the same privacy boundary and normalized tables. Its artifact, schedules, training records, source manifest, behavior holdout, and paired outcomes are versioned separately from Population-001. The completed holdout recorded 55 Technique purchases and Wood contributions of 0/1/2 at 3.5%/89.3%/7.2%; 3 Wood was never selected. These are synthetic coverage frequencies, not human-frequency estimates. The paired result failed the precommitted strength gate, so the dataset is diagnostic evidence and must not be used to relabel Population-002 as production-ready.

V1.0.4 Population-003 writes only below `playtests/v1.0.4/population-003/`. Its schedules must be seed-disjoint from Population-002, and its source manifest records the frozen thresholds and code identity used by the run. Technique coverage counts only acquisitions selected by the stricter anchor-profile public forecast. Wood coverage requires the one-Wood baseline plus at least one counterfactual alternative whose expected portfolio value clears the frozen margin; it does not require a particular 0/2/3 frequency. As with earlier populations, no output may contain hidden Fire-deck order or unrevealed contributions.

The completed Population-003 holdout recorded 20 Technique purchases, 25 zero-Wood contributions, 1,856 one-Wood contributions, and no 2/3-Wood contributions. Its fresh paired evaluation passed all precommitted gates at +0.067 mean VP, zero mean Order delta, and zero illegal actions. These data support synthetic non-inferiority only; preserve the schedules and source hashes when making any later deployment or human-telemetry comparison.

Selfplay-005 adds `oracle_observations.jsonl`, containing only serialisable `PlayerObservation`, typed legal commands, and public decision context. `oracle_targets.jsonl` stores common-seed rollout values, candidate action keys, target regret, duration, and failure counts. `pre_holdout_canary.json` freezes the latency-qualified policy before evaluation. None of these files contains authoritative deck order, vessel identities hidden in supply, another player's unrevealed Wood, or chain-of-thought.

Selfplay-006 adds `public_observations.jsonl`, `realized_leaf_examples.jsonl`, `leaf_model.json`, and `leaf_validation.json`. A realized-leaf example contains only the source fingerprint, typed candidate key, checkpoint label, public numeric feature vector, aggregate realized outcome, and training target; synthetic sampled decks are never serialized. Training and holdout are separated by complete capture game, and V1.0.1 observations are audit-only rather than V1.0.2 training rows. Quick-study summaries must retain `provisional=true` and cannot pass the minimum-sample promotion gate.

Selfplay-003 records `training` (games 1–50 per player count) and `holdout` (games 51–100) on every raw table. Policy learning is disabled throughout holdout. Its holdout seeds are rejected if they overlap Selfplay-001 or Selfplay-002, and comparisons and balance interpretation must report the frozen holdout separately from the adaptive training trajectory.

Selfplay-003 also writes normalized optional-effect, Technique-forecast, and intent-outcome tables. Optional-effect rows retain eligible targets, use/decline, natural and projected Quality, Order compatibility delta, full resource costs, projected net value, and a reason code. Technique acquisitions retain expected windows, beneficial-use probability, gross value, purchase/activation/opportunity costs, forecast net value, and later opportunities/uses. Intent outcomes retain first Market/Imperial/multi-ceramic acquisition timing and source, Imperial reachability, fallback, Presentation, Patronage, and terminal unused ceramics.

The frozen-bot `jun-ab-001` experiment uses `dataset_split=ab_evaluation` and adds `experiment_id`, `experiment_arm`, `pair_id`, `replacement_index`, `jun_activation_cost`, `frozen_profile_hash`, policy version, simulation version, and canonical rules version. `jun_opportunities.csv` contains every use/decline window with Coin balance, active cost, eligible targets, selected target and delta, natural/projected/final Quality, compatibility and value deltas, projected net value, actual payment, destination, and reason code. `paired_outcomes.csv` is one row per matched scenario, and `quality_monitor.csv` preserves the natural and final Quality audit by arm. No experiment row may contain deck order, unrevealed Wood, or chain-of-thought.

The frozen-bot `imperial-track-ab-001` package keeps the normalized game, player, round, action, plan, decision, firing, ceramic, Order, Order-event, Presentation-event, and intent tables for each candidate. Its Imperial Progress event table additionally records archived control/matched scenario IDs, candidate, frozen-profile hash, event sequence, player/seat/Tradition/intent, source, Order and requirement category, before/raw/applied/after Progress, crossed spaces and cap loss, every triggered Apprentice/Presentation/Seal milestone, track VP before/after, and active Seal VP. Historical control remains read-only; direct same-seat and Imperial-intent-relative comparisons are written at the experiment root. These exports must not contain hidden deck order, unrevealed Wood, or chain-of-thought.

## AI planning metrics

- assigned strategy intent and realized tags
- primary and compatible secondary Order targets
- unique ceramic assignment by Order requirement
- missing Shape, Glaze, Decoration, and Quality specifications
- action debt, resource debt, feasibility probability, reasons, and earliest completion round
- projected Clay, Wood, and Coin demand with safety margins
- shaped / glazed / loaded / finished pipeline counts
- conversion urgency, hand conflicts, and reachable Imperial space
- acquisition-time feasibility snapshot for each Order

These are structured audit features, not chain-of-thought. Hidden deck order and unrevealed opposing Wood values remain excluded.

## Per-game metrics

- player count
- game duration
- final VP by player
- winner Kiln
- final Imperial Progress
- round each player reached Progress 1 / 2 / 3 / 4 / 5
- Techniques acquired and acquisition round
- completed Market Orders
- completed Imperial Orders
- VP by scoring source
- Coin income/spend totals
- ceramics formed/fired
- Quality distribution
- number of Flawed ceramics sold
- Exhibition capacity, submitted Quality mix, diversity bonus, and score
- action-space usage by round
- Shifu location usage
- number of blocked attempted actions if UI records them

## Firing metrics

For each firing:

- contributor count
- selected contribution after reveal
- Fuel Ledger use
- total Wood
- Base Heat
- Fire modifier, recorded distinctly as -2, -1, 0, +1 or +2
- Global Heat
- number of ceramics in each zone
- natural Quality distribution
- final Quality distribution
- Jun/Ge/Saggar uses
- exact-match rate

For each fired ceramic retain the original revealed Fire modifier, natural Actual Heat, natural Heat Difference, natural Quality, and final Quality after abilities. Public discard history may be observed; hidden Fire-deck order and the next card must never be exposed.

## Balance questions

Flag after sufficient games:

- Is Progress 2 effectively mandatory?
- Do players who buy zero Techniques remain competitive?
- Is one Technique a dominant first purchase?
- Are M15–M20 / I06–I10 over-efficient?
- Is any Kiln consistently over/under winning?
- Are Masterpieces too common?
- Does contributor scaling keep Glaze choices viable at 2/3/4 players?

## Privacy

Use anonymous game/player IDs.

Do not collect names, email, chat, IP-derived profile data, or anything unnecessary for gameplay analytics.
