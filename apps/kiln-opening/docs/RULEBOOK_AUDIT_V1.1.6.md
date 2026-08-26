# V1.1.6 rulebook consistency audit

Reviewed source: `KILN OPENING 开窑 v1.1.6.md`  
Checked-in copy: [KILN_OPENING_v1.1.6_SOURCE.md](./KILN_OPENING_v1.1.6_SOURCE.md)  
Original supplied SHA-256: `57e2a14876abd83c41c27f204583ec88979345b461fa10ce6a1d3f3655c25f1e`
Current authoritative SHA-256: `0397db9c9e5c44a049587f91209f3d966fdc643751f4f253693f98baa0f5fe0b`

## Owner-approved amendment

On 26 August 2026, the project owner changed Jun Kiln / 钧窑's activation cost from 3 Wood to 2 Wood / 2柴薪. The checked-in source, structured data, engine, AI, English UI and Simplified Chinese UI all use the amended 2-Wood cost. Historical balance experiments retain their original measured 2-versus-3-Wood arms and are marked as historical.

## Material inconsistency

### Imperial Progress spaces 4 and 5

The main Imperial Progress table gives end-game VP of `4` at space 4 and `8` at space 5. The Quick Reference gives `6` and `10`, and the explicit V1.1.6 change log says the track changed from `0/0/2/2/4/8` to `0/0/2/2/6/10`.

Implementation ruling: use `0/0/2/2/6/10`. Two independent V1.1.6 sections—including the section whose purpose is to enumerate the version's changes—agree on those values. The main track table appears not to have received the V1.1.6 edit.

Recommended source correction: change the main table's space-4 and space-5 VP cells to `6 VP` and `10 VP`.

## Material omission

### Exhibition capacity in the main rules

The main End-game Exhibition section says every player may exhibit but does not state the maximum. The Quick Reference and V1.1.6 change log both state that every player may exhibit up to 5 ceramics.

Implementation ruling: every player has capacity 5 regardless of Imperial Progress.

Recommended source correction: add “up to 5” to the main End-game Exhibition procedure and explicitly state that a player exhibiting at least three ceramics chooses exactly three of them as the featured collection.

## Procedure ambiguity

### Featured collection when exhibiting fewer than three ceramics

Both Exhibition passages say to choose three exhibited ceramics, but the rules allow a player to exhibit zero, one, or two. They do not explicitly state whether a smaller featured collection exists in that case.

Implementation ruling: a player exhibiting at least three ceramics chooses exactly three as the featured collection. A player exhibiting fewer than three scores those ceramics normally but has no featured collection and cannot receive either diversity bonus.

Recommended source correction: add “If you exhibit at least three ceramics, choose exactly three of them as your featured collection.”

## Terminology inconsistency

### Court Patronage location

The action-capacity table, action-location rules and Quick Reference all define Court Patronage as its own eighth, uncapped, Shifu-only worker location. The Imperial Progress section instead calls it “a Shifu Office action,” while the Office section says Patronage is not a normal Office main action.

Implementation ruling: Court Patronage is the separate eighth location. It does not occupy Office capacity and does not trigger Office-only effects. The isolated “Shifu Office action” phrase is treated as stale terminology.

Recommended source correction: replace “as a Shifu Office action” in the Imperial Progress section with “as a Shifu action at the Court Patronage location.”

## Editorial errors

- Court Patronage contains an unmatched Markdown bold marker after “game”.
- The Quick Reference says “rotate 2 Order”; this should be “rotate 2 Orders”.
- Several adjacent Labour and Court Patronage bullets use inconsistent punctuation and Markdown emphasis.
- The main Exhibition section should use the defined term “featured collection” when describing the three ceramics checked for Shape and Glaze diversity.
- The Imperial Progress clarification says a milestone can be reached “during Cleanup,” although Progress advances during the Order Phase; it should instead say that a marked milestone resolves during Round-5 Cleanup.

These items do not change game behaviour.

## Cross-checks completed

- The Fire-deck count is 12 and its `1/3/4/3/1` distribution matches the probability table.
- Bank/Tend/Stoke costs and heat adjustments match the Base Heat formula and examples.
- The seven kiln spaces and the 2/3/4-player active-space counts reconcile.
- All 15 Technique IDs, costs, English text, and Chinese text reconcile internally after applying the explicit Kiln Records V1.1.6 change.
- All 52 Orders are represented by stable IDs in the structured data; Imperial Progress equals each Imperial Order's required ceramic count.
- The five-round structure, worker unlock spaces, Round-5 1-VP substitution, Court Patronage limit, Order hand limit, Imperial Seal, Coin conversion, and tie breakers are mutually consistent.

## Online reconciliation completed

The V1.1.6 pickup changes cover:

- source/version references and rules fingerprinting;
- Imperial Progress and universal Exhibition scoring;
- five exhibited ceramics plus a three-ceramic featured collection;
- Round-5 unlock compensation with no obsolete Coin award;
- Order-display rotation, hand limit, action locations, component counts, kiln layout, and contribution cards;
- all 15 Techniques and their timing windows, including Large Throwing Wheel, Measuring Calipers, Clay Substitution, Drying Frames, Carving Knives, Seal Stamps, Colour Samples, Protective Saggars, and Kiln Records;
- corrected Wood/Coin labels and costs for Jun, Ge, Protective Saggars, Sagger Selection, Court Patronage, Office sales, and Connoisseur Network;
- matching English and Simplified Chinese player-facing copy.
