# UI wireframe fixtures (V1.6.1)

`fixtures.json` holds real game states captured from the V1.6.1 engine (`src/game`). Use them when
building wireframes so that every string, count and option on screen matches the rules. Nothing
in the file is hand-written. Each value comes from seeded games played through `createGame`,
`applyAction` and `submitContribution`. Every seat is played by the strategic computer policy
(`rules-v1.6.1-strategic-001`), which falls back to the canonical commands when it has no
choice of its own.

## Regenerate

```sh
npx vite-node tools/uiFixtures.ts                               # writes fixtures.json and prints a summary
npx vitest run --config tools/uiFixtures.vitest.config.ts       # same generator, run under Vitest
npx vite-node tools/uiFixtures.ts --verify [path/to/fixtures.json]   # only re-run the file privacy check
```

The output is deterministic. Both commands produce byte-identical files because:

- the seeds are fixed;
- the policy's decision clock is frozen;
- object keys are sorted before writing.

A run takes about 13 seconds. The generator does not touch `src/`, `test/` or `data/`, and it is
not part of `npm test`.

## File layout

- `moments[]`: one entry per captured moment. Each entry has these fields:
  - `source`: seed, player count, `gameId`, round, revision, phase, policy, and `steered`. The
    `steered` list holds any commands that were chosen for a seat instead of by the policy (see
    below).
  - `viewerId` / `viewerActs`: whose screen this is, and whether that player must act now.
  - `playerView`: exactly what this viewer's client receives. It has two parts:
    - `game`: the public projection, with `counts` that give hand and deck sizes but never their
      contents;
    - `own`: the viewer's own hand, private look, Test Pieces peek and sealed Contribution.
  - `decisionPrompt`: the `decisionPrompt(game)` output.
  - `selectors`: DESIGN §5.4 outputs, all computed from `playerView`.
    - Every moment includes:
      - `boardView`
      - `playerSummaries` (all seats, public)
      - `scorePreviews`
      - `handLimitStatus`
      - `heatPreviews`
      - `firingSummary`
      - `kilnLayout` (active and covered spaces, central capacities for this player count)
      - `legalCommands` (canonical, grouped by type, up to 12 examples each)
    - Each moment also adds its own selectors, listed in the table below.
  - `recentPublicEvents`: the last 24 events, each run through `projectEvent`, so no `secret`
    payloads.
- `labels`: EN/ZH label tables built from:
  - `data/*.json`
  - `src/game/ruleErrorText.ts`
  - `docs/GLOSSARY_ZH_V1.6.1.md`

  They cover:
  - locations, with Apprentice and Shifu text, capacities and personal spaces;
  - all 18 Techs, with short text, ability, cost, timing and the second space each adds;
  - all 5 Kilns, with ability name, short text and ability;
  - Shapes (with Clay), Glazes (with Preferred Heat), Decorations (with Coins);
  - Qualities (and their high-to-low order), resources, workers, disciplines, zones, ceramic
    stages and kiln spaces;
  - round phases (开工 → 派工阶段 → 烧窑阶段 → 交货阶段 → 收工), engine timing windows and the
    firing steps from glossary §2.11;
  - Contribution cards, the Fire deck, Kiln Die faces and Imperial modifiers;
  - Recognition milestones, Exhibition and Coin scoring;
  - glossary tables §2.5, §2.10, §2.12 and §2.14;
  - UI verbs (glossary §2.16);
  - every rule-error message;
  - requirement text, VP, Coins and Crowns for all 64 Orders;
  - the ceramic-art file pattern.

## Moments

| # | id | Seed · players · round | Viewer | What it shows | Extra selectors |
| --- | --- | --- | --- | --- | --- |
| 1 | `m1_work_phase_r2_3p` | 27 · 3P · R2 | p3 | Work Phase, the viewer's turn before acting. The viewer owns Prepared Clay (Workshop), so they have added the 2nd Form & Decorate space but not yet the 2nd Glaze & Load space. The viewer has Shaped vessels. | `placementOptions`, `quotes` (Materials Yard and Form & Decorate for Apprentice and Shifu), `shapedVessels`, `loadDestinationOptions`, `heatMarkerTargets`, `commissionOptions`, `guildOptions`, `magistratesHallQuote`, `canalBargeOptions`, `imperialPriorityOptions` |
| 2 | `m2_commission_market_look_r3_4p` | 1 · 4P · R3 | p2 | The viewer's Commission Market Shifu, in the middle of the action. It reserved display slot 0 face up, and that slot stays `null` with `market.refillPendingFor = p2` until the turn ends. The viewer then chose to look at the top 3, which only they can see in `own.pendingLook`; other players see only `counts.pendingLook` (the kind and a count of 3). **Steered** (2 commands, see `source.steered`). | `commissionOptions`, `lookedOrderOptions`, `market`, `publicLookIndicator` |
| 3 | `m3_heat_marker_step_3p` | 17 · 3P · R5 | p2 | Firing step 5, the Heat-marker step. The Kiln Die shows 3. Contributions are revealed (Tend, Tend, Stoke), so Base Heat is 4; the Fire card is not revealed yet. Three Heat markers are face down, including the viewer's marker on their Imperial Kiln ceramic (Imperial modifier 0). Kiln Furniture sits under a Low ceramic. p3 owns Kiln Master. The Fire discard is open. | `heatLadder`, `heatMarkerStepOptions`, `contributionOptions`, `testPiecesOptions`, `junOptions`, `afterQualityOptions`, `salvageOptions`, `fireDiscard`, `fireDeckCount` |
| 4 | `m4_after_quality_3p` | 17 · 3P · R5 | p2 | The same firing, after Quality in step 10. The viewer can use Second Firing or Ge Crackle on their Standard ceramic. `heatLadder.chips` gives, for every ceramic: heat source, position modifier, Heat marker, Jun ±1, Actual and final Actual Heat, Heat Difference, Quality and history. It includes a Jun-adjusted ceramic, a Kiln Master marker, Kiln Furniture and an Imperial ceramic. | same as #3 |
| 5 | `m5_two_player_board_2p` | 35 · 2P · R2 | p1 | 2-player board. The Shared Kiln uses the 2-1-1 cover: High 1–2, Middle 1 and Low 1 active, the other spaces `active:false`. The Magistrate's Hall has capacity 1 and is occupied. | as #1 |
| 6 | `m6_order_phase_crackle_3p` | 5 · 3P · R5 | p2 | Order Phase. The viewer holds 5 Orders, 4 of them completable, including multi-ceramic O48 and O39. O39 needs the Crackle ceramic c18, printed Plain, to be declared **Painted**. | `completableOrders`, `orderMatchOptions` (per held Order), `crackleDeclarationChecks` (validator verdict for each Decoration and for leaving it undeclared), `orderSelectionCheck` (partial selection that can still be completed, and the full selection), `crackleCeramicIds` |
| 7 | `m7_cleanup_hand_limit_3p` | 2 · 3P · R3 | p3 | Cleanup hand-limit trim: 6 held against a limit of 4, so the viewer must discard 2 (15 legal discard pairs). The prompt is parallel. | `handLimitViewer`, `heldOrders` |
| 8 | `m8_final_results_3p` | 10 · 3P · end | p1 | Final results. Each player's breakdown covers: orders, kiln abilities, Recognition overflow, Audience, Techs (A1, recorded when gained), Exhibition (quality VP + Shape/Glaze diversity), Connoisseur, Coins and total. p1 and p3 tie on 47 VP and on all three tie-breakers, so `resolvedBy = shared_victory`. | `finalResult`, `scoreBreakdownRows`, `tieBreakOrder` |
| 9 | `m9_contributions_step1_3p` | 118 · 3P · R4 | p2 | Firing step 1, secret Contributions. p1 has submitted: the moment shows only that p1 is in `phase.submittedPlayerIds`, never the card. The viewer (p2) owns Fuel Ledger, so `contributionOptions` lists five choices with Wood cost and affordability. The Shared Kiln holds an Inverted Firing stack (c12 + c11 in Middle 1), Kiln Furniture under c9 and a face-down Heat marker. **Steered** (2 Guild Hall purchases, see `source.steered`). No Setter's Mark appears. | `submittedPlayerIds`, `contributionOptions` and the firing selectors of #3 |

Heat ladder notes:

- `heatLadder.preferredHeatBands` lists White 1 / Celadon 2 / Grey-Green 3 / Moon White 4.
- `qualityByHeatDifference` gives the distance-to-Quality table.
- Before the Fire card, a chip's `heatBeforeFire` comes from `heatPreviews`. It is `null` while
  a face-down marker is still undecided (its +1 / −1 face is chosen at step 5).

## Steering and limits

- **Steered commands.** Moment 2 needed one seat to choose a face-up reservation and then
  look at the top 3. In moment 9, two seats' Apprentices were steered to buy Inverted Firing and
  Fuel Ledger at the Guild Hall; the policy then used them on its own. The other moments were reached by the policy alone. Moments 4 and 6 also
  passed a hook to the generator that asks p1 to take Ge at Kiln selection, but in both seeds
  the policy's own choices led to Ge. Their `steered` lists are empty. Every steered command
  went through `validateAction` like any other command.
- **Kiln choices.** The strategic policy often takes Ge and Prepared Clay, so most viewers are
  Ge. Opponents show Jun and other kilns. Ding, Ru and Guan appear only in `labels`.
- **Moment 3 compromises.** Kiln Master is owned (by p3), but its marker is not yet placed in
  moment 3: p3 places it later in the same queue, and it is visible on c20 in moment 4. The
  only Imperial Kiln ceramic in that firing uses modifier 0.

## Privacy check

Each moment is checked twice:

1. **At capture.** `assertNoForeignSecrets` compares the moment with the authoritative state's
   hidden piles. It fails the run if any of the following appears anywhere in the moment:
   - an Order ID from another seat's hand, the Main deck or discard, or the Starting box;
   - a Tech ID from a Tech deck;
   - the contents of another seat's private look, a `hidden` key or a `secret` key;
   - while the Contribution window is open, any sealed Contribution outside the viewer's own
     view, or a card or Fuel Ledger flag on another seat's `CONTRIBUTION_SUBMITTED` event.
     That another seat has submitted is public (`phase.submittedPlayerIds`).

   The exceptions are IDs that a public event already revealed (for example a face-up Order
   that was later reserved or rotated away) and the viewer's own private look.
2. **After writing.** `verifyFixtureFile` re-reads the JSON. It checks the following:
   - `own` belongs to the viewer;
   - any look, peek or sealed Contribution belongs to the viewer;
   - there are no server-only keys or piles;
   - other seats' hands appear only as counts.
