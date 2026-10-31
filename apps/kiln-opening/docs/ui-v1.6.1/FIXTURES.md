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
| `draftCommand` | optional, a moment's or a table scenario's: a legal command of the viewer, checked by `validateAction`, which the gallery seeds as the open window's draft (`fromCommand`); never sent |

Selectors are not stored: the UI computes them from `playerView` (DESIGN §5.4).

`secrets.json` maps each entry `id` to the Order and Tech IDs that viewer must never see: other seats' hands, other seats' private looks, the Main deck, its face-down discard, the Starting box and the Tech decks — minus IDs a public event revealed and IDs the viewer was shown privately (its own looks, trims and returned Techs). It is the oracle of the rendered-markup leak test (`rendered_text`, B6) and of the local backend's `e2e_secret_ids`; `src/app` never loads it.

## Scenarios (`scenarios.json`)

**Decision windows** (kind `window`, viewer = the actor) come from `phaseScenarios()` in `test/v161/engine/phase_scenarios.ts`: the Kiln and Main Order choice (owner revision 4, change 32, R23); Setter's Mark; before the worker action (rich 4-player start; the Colour Samples swap, Imperial Priority with Reworking Table, Ding; Kiln Furniture, Inverted Firing, Setter's Marks, Senior Apprentice; Kiln Master at loading, the Magistrate's Hall Shifu's Crown Order and the kiln fuel, revision 4); the Commission Market Shifu and Apprentice looks; the Guild Hall Shifu inspection; Colour Samples and its swap; the after-action window; secret Contributions with Fuel Ledger; the Test Pieces decision and bury; Jun; after-Quality (Saggars and Ge); Second Firing's choice with Jun (R7); the after-action window with a completion and a sale (free actions, owner revision 5); the Order Phase sale of a Flawed ceramic (a free action since change 36, R28); the Order Phase with Ru and Tribute Ware, and with a Crackle wildcard (a Ge owner's crackled Masterpiece); Imperial Priority in the Order Phase (R28); the hand limit. Revision 4 has no Heat-marker step and no salvage window.

**Table states** (kind `table`) come from `test/v161/ui/fixtures/tableScenarios.ts`. Each passes `assertInvariants`.

| id | Viewer | What it shows |
| --- | --- | --- |
| `t-firing-skipped` | p1 (waiting) | Round 2 ended with nothing loaded: `FIRING_SKIPPED` in the log, Round 3 begins; the Round 1 recap stays (`firingRecapView`) |
| `t-imperial-only-firing` | p2 (waiting) | Only an Imperial Kiln ceramic: no Contributions, Base Heat = Kiln Die 3; the firing waits at Jun (step 3) |
| `t-fire-deck-reshuffle` | p2 (waiting) | The Fire deck was empty at the reveal: the open discard was shuffled back and is empty; Jun keeps the firing at step 3 |
| `t-empty-main-supply` | p1 (acts) | 4 players, Round 5: Main deck and discard exhausted, display `O17–O20` + 2 empty positions; 28 Orders completed earlier |
| `t-round5-over-limit` | p1 (acts) | Round 5 Order Phase holding 6 Orders: `handLimitStatus(...).trimDue` is false (no trim at the last Cleanup) |
| `t-tie-break-winner` | p2 | Final: equal VP, won on Imperial Recognition |
| `t-recognition-overflow` | p1 (waiting) | A Crown gained at Recognition 4 scored +1 VP (`CROWN_OVERFLOW_VP`) |
| `t-final-2p`, `t-final-4p` | p1, p3 | Final results after a last Order Phase (Ru bonus, Guan, Exhibition, Connoisseur, Coins; no Tech VP, change 27); in the 2-player one Zhao sold a Flawed ceramic first (a free action, R28) |
| `t-glaze-load-imperial-furniture` | p1 (acts) | Glaze & Load with an Imperial Kiln (−1/0/+1) and Kiln Furniture (−1/0/+1) to choose |
| `t-colour-samples-select-face-up` | p1 (acts) | Colour Samples' Select 3 took a face-up Order: its position stays empty until the turn ends; the after-action window is open |
| `t-fuel-ledger-reveal` | p2 (waiting) | A Contribution reveal with Fuel Ledger Stoke (+2 for 1 Wood); the firing waits at Jun (step 3) |
| `t-after-quality-no-sale` | p1 (acts) | After Quality: Lin may fire a Flawed ceramic of this firing again (Second Firing); no sale during the firing (owner ruling R26: no free actions during the firing). The scenario asserts that no sale is offered. Called `t-after-quality-sale` until the UI stage of owner revision 5 |
| `t-work-turn-sale` | p1 (acts) | A work turn with a Flawed Finished ceramic to sell before the worker action (a free action, change 36) |
| `t-cleanup-no-sale` | p1 (acts) | The hand trim with a Flawed Finished ceramic: no sale while trimming (owner ruling R26: Cleanup is not a free-action window). The scenario asserts that no sale is offered. Called `t-cleanup-sale` until the UI stage of owner revision 5 |
| `t-imperial-priority-carried` | p1 (waiting) | Round 3: Lin's Imperial Priority load from Round 2's Order Phase waits in the Imperial Kiln for this round's firing (R28); the tile says so |
| `t-free-action-chips` | p1 (acts) | Owner UI decision D21: the turn line's Free actions chips, all four at once (Deliver S05, Sell Flawed, Imperial Priority, the Colour Samples swap), with the pieces' own buttons (Deliver, Sell 2, Use) |
| `t-place-split-confirm` | p1 (acts) | D21: the same turn with the Canal Wharf chosen: Place · end turn beside Place, then free actions (`draftCommand`) |
| `t-after-action-free-actions` | p1 (acts) | D21: after the worker action: the free-action list, Deliver · end turn beside Deliver, and End turn (`draftCommand`) |
| `t-order-phase-free-actions` | p1 (acts) | D21: the Order Phase: the same list without the swap, Deliver · done beside Deliver, and Done (`draftCommand`) |
| `t-swap-select-after-action` | p1 (acts) | D21: the swap's Select after the worker action: Reserve · end turn beside Reserve |
| `t-reserve-deliver-hint` | p1 (acts) | D21: the Commission Market's Select with a display Order her Finished ceramics complete: Reserve · end turn beside Reserve, then free actions, and the private "You can deliver this now" (`draftCommand`) |
| `t-crown-order-deliver-hint` | p1 (acts) | D21: the Magistrate's Hall Shifu with such a Crown Order chosen: the Reserve buttons on the placement, with the hint (`draftCommand`) |

`e2e/gallery.spec.ts` pins what the D21 scenarios and m28–m30 show (`D21_MOMENTS`): renaming one, or changing its chips or Confirm labels, fails that spec in every view.

Together the scenarios and moments reach every engine phase, every Work step (`before_action`, the Commission look of either effect, Guild inspection, Colour Samples and its swap, `after_action`), both Test Pieces steps, a waiting viewer, and 2-, 3- and 4-player finals; `fixtures_current.test.ts` checks this.

## Moments (`moments.json`)

Seeded games played by the strategic computer policy (`rules-v1.6.2-strategic-001`, which falls back to the canonical commands when it has no choice), regenerated for owner revision 5 (changes 36–42, R26–R32). m1–m9 are the wireframe set, recaptured in the entry format; m10–m18 reach the windows the wireframe could not; m19–m23 are the V1.6.2 windows, m24–m27 revision 4's and m28–m34 revision 5's, which the owner reviews in the gallery. A moment whose seed search exceeds its budget falls back to the matching scripted scenario (`source.kind: "scripted"`): m24 and m25 are taken from the revision 4 before-action scenario on purpose, and m29 falls back to the scripted after-action scenario (the computer players sell a Flawed ceramic before their action). A moment may carry a `draftCommand`: the gallery seeds the window's draft from it (`fromCommand`), so the moment opens with that choice made (m14, m15, m24–m34).

| id | Seed · players | Viewer | What it shows |
| --- | --- | --- | --- |
| `m1_work_phase_r2_3p` | 62 · 3P | p2 | Round 2, before the action |
| `m2_commission_market_look_r3_4p` | 1 · 4P | p1 | The Commission Market Shifu's private Select 3; 1 or 2 reservations from the display and those 3 (**steered** placement) |
| `m3_kiln_master_marker_3p` | 8 · 3P | p2 | A firing with Kiln Master's marker face up on a loaded ceramic, chosen at loading (R22) (**steered** T24 purchase and loading) |
| `m4_after_quality_3p` | 8 · 3P | p1 | Firing step 5: after-Quality abilities (**steered** Kiln choice GE) |
| `m5_two_player_board_2p` | 16 · 2P | p2 | The 2-1-1 Shared Kiln cover; Magistrate's Hall capacity 1 |
| `m6_order_phase_crackle_3p` | 5 · 3P | p1 | Order Phase with multi-ceramic Orders and a Crackle wildcard |
| `m7_cleanup_hand_limit_3p` | 1 · 3P | p2 | Cleanup trim down to the hand limit |
| `m8_final_results_3p` | 31 · 3P | p1 | Final results (Crackle VP in the Kiln abilities row) |
| `m9_contributions_step1_3p` | 52 · 3P | p3 | Step 1, secret Contributions; another seat has submitted (never what) (**steered** Guild purchases) |
| `m10a_setters_mark_window` | 2 · 3P | p2 | The Setter's Mark window at the start of the Work Phase (**steered** T22 purchase) |
| `m10b_setters_mark_on_space` | 2 · 3P | p2 | The tile on its Shared Kiln space (**steered** placement) |
| `m11a_test_pieces_decision` | 1 · 3P | p2 | End of step 1: pay 1 Wood to peek? (**steered** T13 purchase) |
| `m11b_test_pieces_bury` | 1 · 3P | p2 | The private peek (`own.firePeek`, own `TEST_PIECES_PEEKED`) before the public bury decision |
| `m12_guild_shifu_inspection` | 1 · 3P | p3 | The private Guild Hall inspection before the first take (**steered** inspection) |
| `m13_jun_heat_adjustment` | 1 · 3P | p1 | Step 3: Jun ±1 for 1 Wood (**steered** Kiln choice JU) |
| `m14_sell_flawed` | 2 · 3P | p1 | Order Phase: a Flawed Finished ceramic sold for 2 Coins (a free action, R28); the draft chooses the sale |
| `m15_kiln_selection` | 1 · 4P | p2 | Revision 0: reverse-order Kiln and Main Order choice (change 32, R23); the draft chooses both |
| `m16_colour_samples` | 3 · 3P | p1 | Colour Samples' Select 3 when acquired: a private look at the top 3, 1 reservation from those 3 or the display (**steered** T10 purchase) |
| `m17_after_action` | 1 · 3P | p3 | The after-action window with the Colour Samples swap (**steered** T10 purchase) |
| `m18_jun_second_firing` | 2 · 3P | p3 | R7: Second Firing's 2 turned cards, choose 1, Jun may still adjust (`firingStageView.extraFire`) (**steered** JU, T14, Jun kept unused in step 3, Second Firing) |
| `m19_commission_apprentice_look` | 1 · 3P | p2 | The Commission Market Apprentice's private Select 2; exactly 1 reservation |
| `m20_colour_samples_swap_look` | 1 · 3P | p3 | The Colour Samples swap's Select 3, before the worker action (**steered** T10 purchase and swap) |
| `m21_guild_shifu_second_take` | 2 · 3P | p1 | The Guild Hall Shifu after a first take: a second take of another discipline, or stop (**steered** inspection and first take) |
| `m22_saggars_upgrade` | 11 · 3P | p1 | Firing step 5: Protective Saggars' Standard → Fine (**steered** T11 purchase) |
| `m23_order_phase_s07` | 3 · 4P | p3 | Order Phase: S07 "Carved, Impressed or Painted" completable, with Canal Barge's 2 Coins on the first completion (**steered** T23 purchase) |
| `m24_glaze_load_fuel_kiln_master` | scripted · 2P | p1 | Glaze & Load: 2 vessels into the Shared Kiln for 1 Wood of kiln fuel, Kiln Master's +1 on the first (changes 34–35, R22) |
| `m25_magistrates_hall_crown_order` | scripted · 2P | p1 | The Magistrate's Hall Shifu: 4 Coins, then a face-up Crown Order reserved (change 33, R21) |
| `m26_ge_crackle_fine` | 1 · 3P | p1 | Firing step 5: Ge's Crackle on a Fine ceramic (changes 29, 39; since revision 5 Ge may take any ceramic of the firing) (**steered** Kiln choice GE) |
| `m27_crackle_vp_completion` | 1 · 3P | p1 | Order Phase: a completion delivering a Crackle ceramic, +1 VP (change 29) (**steered** GE and its Crackle) |
| `m28_before_action_delivery` | 1 · 3P | p2 | Before the worker action: a held Order completed as a free action (change 36); the draft chooses the completion |
| `m29_after_action_sale` | scripted · 2P | p1 | After the worker action: a Flawed ceramic sold for 2 Coins as a free action (R27); the draft chooses the sale |
| `m30_order_phase_imperial_priority` | 5 · 3P | p3 | Order Phase: Imperial Priority after the firing, its ceramic waiting for the next round's firing (R28); the draft chooses it, a pending chip in the Imperial Kiln |
| `m31_ge_crackle_masterpiece` | 1 · 3P | p1 | Firing step 5: Ge's Crackle on a Masterpiece, which stays a Masterpiece (change 39, R30) (**steered** Kiln choice GE) |
| `m32_ge_crackle_flawed` | 6 · 3P | p1 | Firing step 5: Ge's Crackle on a Flawed ceramic, which stays Flawed (change 39, R30) (**steered** Kiln choice GE) |
| `m33_ding_extra_vessel` | 1 · 3P | p1 | Form & Decorate with Ding's extra vessel at 1 Clay + 2 Coins, outside the Shifu's "if you form 2" (change 40, R29) (**steered** Kiln choice DI) |
| `m34_decorators_kit_plain` | 2 · 3P | p1 | Form & Decorate: Decorator's Kit on a Plain vessel (change 37) (**steered** T16 purchase) |

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
