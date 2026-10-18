# UI fixtures (V1.6.1)

Real game states captured from the V1.6.1 engine (`src/game`), so every string, count and option on screen matches the rules. Nothing is hand-written: each state comes from seeded games played through `createGame`, `applyAction` and `submitContribution`, or from scripted engine scenarios. One generator, `tools/uiFixtures.ts`, writes two sets:

| Set | Files | Used by |
| --- | --- | --- |
| **Test fixtures** (`--target tests`, the default) | `test/v161/ui/fixtures/scenarios.json`, `moments.json`, `secrets.json` | the production UI: SSR tests, `FixtureGameSource`, the dev scenario gallery, the leak checks ([UI plan §9.1](../UI_V1.6.1_ARCHITECTURE.md)) |
| **Wireframe fixtures** (`--target wireframe`) | `docs/ui-v1.6.1/fixtures.json` | the signed-off [wireframes](./kiln-opening-wireframes.html). **Frozen** with the sign-off; not part of any gate |

## Regenerate

```sh
npm run fixtures            # vite-node tools/uiFixtures.ts --target tests: writes the three test files
npm run fixtures:check      # regenerates in memory, byte-diffs and runs the privacy verification
npx vitest run --config tools/uiFixtures.vitest.config.ts       # the tests target under Vitest
npx vite-node tools/uiFixtures.ts --target wireframe           # the frozen wireframe file
npx vite-node tools/uiFixtures.ts --verify [file]              # privacy check of the wireframe file
```

The output is deterministic: the seeds are fixed, the policy's decision clock is frozen and object keys are sorted before writing. `fixtures:check` takes about 15 seconds and is a phase-exit gate. Importing the generator (as `fixtures_current.test.ts` does) runs nothing.

`test/v161/ui/fixtures_current.test.ts` runs in `npm test`:

- it regenerates `scenarios.json` in memory (tens of milliseconds) and requires it byte for byte, with the same scenario entries in `secrets.json`;
- moments are played by the strategic policy, which is too slow for every run, so for each moment it requires the current `rulesFingerprint()`, the recorded `decisionPrompt` from its view, and that the viewer's recomputed canonical commands still validate;
- it runs the privacy checks below, including negative tests that plant foreign secrets.

## Test fixture entries

Each entry of `scenarios.json` and `moments.json` is one viewer's client data at one moment:

| Field | Content |
| --- | --- |
| `id` | `w-…` (decision-window scenario), `t-…` (table-state scenario) or `m…` (played moment) |
| `name`, `description`, `notes` | developer labels for the gallery (not player-facing) |
| `kind` | `window`, `table` or `moment` |
| `viewerId`, `viewerActs` | whose screen this is, and whether they are among `decisionPrompt.actorIds` |
| `decisionPrompt` | `decisionPrompt(game)` |
| `playerView` | `actorViewOf(state, viewer, privateState)`: the public projection (with `counts`) plus the viewer's own hand, private look, Test Pieces peek and sealed Contribution |
| `recentPublicEvents` | `{ sequence, revision, actorId, event }` with projected events: the last 24 of a moment, the whole log of a scenario. Sequences number the game's events from 1, as the service does |
| `ownSecrets` | every secret event of the viewer's own so far: full events, `secret.visibleTo` = the viewer |
| `source` | moments: `{ kind: "played", seed, playerCount, gameId, round, revision, phase, commandsPlayed, policy, steered }`; scenarios and fallbacks: `{ kind: "scripted", from, scenario, round, revision, phase }` |

Selectors are not stored: the UI computes them from `playerView` (DESIGN §5.4).

`secrets.json` maps each entry `id` to the Order and Tech IDs that viewer must never see: other seats' hands, other seats' private looks, the Main deck, its face-down discard, the Starting box and the Tech decks — minus IDs a public event revealed and IDs the viewer was shown privately (its own looks, trims and returned Techs). It is the oracle of the rendered-markup leak test (`rendered_text`, B6) and of the local backend's `e2e_secret_ids`; `src/app` never loads it.

## Scenarios (`scenarios.json`)

**Decision windows** (kind `window`, viewer = the actor) come from `phaseScenarios()` in `test/v161/engine/phase_scenarios.ts`: Kiln selection; Setter's Mark; before the worker action (rich 4-player start; the Colour Samples swap, Imperial Priority with Reworking Table, Ding; Kiln Furniture, Inverted Firing, Setter's Marks, Senior Apprentice); the Commission Market Shifu and Apprentice looks; the Guild Hall Shifu inspection; Colour Samples and its swap; the after-action window; secret Contributions with Fuel Ledger; the Test Pieces decision and bury; Heat markers with Kiln Master; Jun; after-Quality (Saggars and Ge); Second Firing's choice with Jun (R7); Salvage; the Order Phase with Ru, Tribute Ware and a Crackle wildcard; the hand limit.

**Table states** (kind `table`) come from `test/v161/ui/fixtures/tableScenarios.ts`. Each passes `assertInvariants`.

| id | Viewer | What it shows |
| --- | --- | --- |
| `t-firing-skipped` | p1 (waiting) | Round 2 ended with nothing loaded: `FIRING_SKIPPED` in the log, Round 3 begins; the Round 1 recap stays (`firingRecapView`) |
| `t-imperial-only-firing` | p2 (waiting) | Only an Imperial Kiln ceramic: no Contributions, Base Heat = Kiln Die 3 |
| `t-fire-deck-reshuffle` | p2 (waiting) | The Fire deck was empty at the reveal: the open discard was shuffled back and is empty; Jun keeps the firing at step 8 |
| `t-empty-main-supply` | p1 (acts) | 4 players, Round 5: Main deck and discard exhausted, display `O17–O20` + 2 empty positions; 28 Orders completed earlier |
| `t-round5-over-limit` | p1 (acts) | Round 5 Order Phase holding 6 Orders: `handLimitStatus(...).trimDue` is false (no trim at the last Cleanup) |
| `t-tie-break-winner` | p2 | Final: equal VP, won on Imperial Recognition |
| `t-recognition-overflow` | p1 (waiting) | A Crown gained at Recognition 4 scored +1 VP (`CROWN_OVERFLOW_VP`) |
| `t-final-2p`, `t-final-4p` | p1, p3 | Final results after a last Order Phase (Ru bonus, Guan, Tech VP, Exhibition, Connoisseur, Coins) |
| `t-glaze-load-imperial-furniture` | p1 (acts) | Glaze & Load with an Imperial Kiln (−1/0/+1) and Kiln Furniture (−1/0/+1) to choose |

Together the scenarios and moments reach every engine phase, every Work step (`before_action`, the Commission look of either effect, Guild inspection, Colour Samples and its swap, `after_action`), both Test Pieces steps, a waiting viewer, and 2-, 3- and 4-player finals; `fixtures_current.test.ts` checks this.

## Moments (`moments.json`)

Seeded games played by the strategic computer policy (`rules-v1.6.2-strategic-001`, which falls back to the canonical commands when it has no choice). m1–m9 are the wireframe set, recaptured in the entry format; m10–m18 reach the windows the wireframe could not; m19–m23 are the V1.6.2 windows the owner reviews in the gallery. A moment whose seed search exceeds its budget would fall back to the matching scripted scenario (`source.kind: "scripted"`); in the current set every moment was reached by play.

| id | Seed · players | Viewer | What it shows |
| --- | --- | --- | --- |
| `m1_work_phase_r2_3p` | 1 · 3P | p3 | Round 2, before the action. A Form & Decorate Tech (Senior Apprentice) added the second Form & Decorate space; the second Glaze & Load space is not yet added |
| `m2_commission_market_look_r3_4p` | 1 · 4P | p3 | The Commission Market Shifu's private look at the top 3; 1 or 2 reservations from the display and those 3 (**steered** placement) |
| `m3_heat_marker_step_3p` | 5 · 3P | p2 | Firing step 5: face-down markers |
| `m4_after_quality_3p` | 7 · 3P | p2 | Firing step 10: after-Quality abilities |
| `m5_two_player_board_2p` | 57 · 2P | p1 | The 2-1-1 Shared Kiln cover; Magistrate's Hall capacity 1 |
| `m6_order_phase_crackle_3p` | 7 · 3P | p2 | Order Phase with multi-ceramic Orders and a Crackle ceramic |
| `m7_cleanup_hand_limit_3p` | 1 · 3P | p1 | Cleanup trim down to the hand limit |
| `m8_final_results_4p` | 2 · 4P | p1 | Final results |
| `m9_contributions_step1_3p` | 46 · 3P | p2 | Step 1, secret Contributions; another seat has submitted (never what) (**steered** Guild purchases) |
| `m10a_setters_mark_window` | 1 · 3P | p1 | The Setter's Mark window at the start of the Work Phase (**steered** T22 purchase) |
| `m10b_setters_mark_on_space` | 1 · 3P | p1 | The tile on its Shared Kiln space (**steered** placement) |
| `m11a_test_pieces_decision` | 10 · 3P | p1 | Step 4: pay 1 Wood to peek? (**steered** T13 purchase) |
| `m11b_test_pieces_bury` | 10 · 3P | p1 | The private peek (`own.firePeek`, own `TEST_PIECES_PEEKED`) before the public bury decision |
| `m12_guild_shifu_inspection` | 1 · 3P | p1 | The private Guild Hall inspection before the first take (**steered** inspection) |
| `m13_jun_heat_adjustment` | 2 · 3P | p1 | Step 8: Jun ±1 for 1 Wood (**steered** Kiln choice JU) |
| `m14_salvage` | 7 · 3P | p1 | Step 11: salvage a still-Flawed ceramic |
| `m15_kiln_selection` | 1 · 4P | p4 | Revision 0: reverse-order Kiln selection |
| `m16_colour_samples` | 1 · 3P | p1 | Colour Samples' Select 3 when acquired: a private look at the top 3, 1 reservation from those 3 or the display (**steered** T10 purchase) |
| `m17_after_action` | 1 · 3P | p1 | The after-action window with the Colour Samples swap (**steered** T10 purchase) |
| `m18_jun_second_firing` | 1 · 3P | p1 | R7: Second Firing's 2 turned cards, choose 1, Jun may still adjust (`firingStageView.extraFire`) (**steered** JU, T14, Jun kept unused in step 8, Second Firing) |
| `m19_commission_apprentice_look` | 1 · 3P | p1 | The Commission Market Apprentice's private look at the top 2; exactly 1 reservation |
| `m20_colour_samples_swap_look` | 1 · 3P | p1 | The Colour Samples swap's Select 3, before the worker action: a private look at the top 3, 1 reservation from those 3 or the display (**steered** T10 purchase and swap) |
| `m21_guild_shifu_second_take` | 2 · 3P | p1 | The Guild Hall Shifu after a first take: a second take of another discipline, or stop (**steered** inspection and first take) |
| `m22_saggars_upgrade` | 5 · 3P | p1 | Firing step 10: Protective Saggars' Standard → Fine (**steered** T11 purchase) |
| `m23_order_phase_s07` | 1 · 4P | p2 | Order Phase: S07 "Carved, Impressed or Painted" completable, with Canal Barge's 2 Coins on the first completion (**steered** T23 purchase) |

Every steered command is recorded in `source.steered` and went through `validateAction` like any other. Searches try a hinted seed first (the one a previous run found), so a regeneration is quick; the result is the same either way.

## Privacy rules

Shared by both targets (`tools/fixturePrivacy.ts`):

1. **At capture**, against the authoritative state and log (`entryPrivacyProblems`):
   - `own` is the viewer's; any look, peek or sealed Contribution is the viewer's;
   - a `secret` key appears **only** at `ownSecrets[i].event.secret`, and only with `visibleTo` = the viewer; each own secret equals the authoritative event with that sequence, and each public record is the projection of the authoritative event;
   - none of the viewer's secret IDs (above) appears anywhere in the entry;
   - while the Contribution window is open, no sealed card outside the viewer's own view, and no card or Fuel Ledger flag on another seat's `CONTRIBUTION_SUBMITTED` (that a seat has submitted is public, `phase.submittedPlayerIds`);
   - no other seat's fire peek.
2. **After writing**, without the state (`verifyFixtureEntries`): the structural rules above, and no entry containing one of its `secrets.json` IDs. Other seats' hands appear only as counts.

## Wireframe fixtures (`docs/ui-v1.6.1/fixtures.json`, frozen)

The legacy format the wireframe renders: per moment `source`, `viewerId`, `viewerActs`, `playerView`, `decisionPrompt`, a `selectors` block (DESIGN §5.4 outputs including `heatPreviews`, `firingSummary` and a `heatLadder` the production UI never shows, D3), and the last 24 projected events (`seq`), plus EN/ZH `labels` from `data/*.json`, `src/game/ruleErrorText.ts` and `docs/GLOSSARY_ZH_V1.6.1.md`. It covers m1–m9 above. It is kept byte-stable with the signed-off wireframe and is not regenerated as part of any gate; the production UI uses the test fixtures and the engine content exports instead.
