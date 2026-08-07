# ASSET_MANIFEST.md — V0.4 AUDITED

Only files under `assets/current_v04/` are approved as current visual references.

## Approved and visually audited

### Order cards
- `order_cards_page_1_M01-M16.png`
- `order_cards_page_2_M17-M20_I01-I10.png`

The Order deck is unchanged in V0.4. Card IDs, requirements, minimum Qualities, VP and Coin values were checked against Appendix A of the V0.4 rulebook.

### Vessel cards
- `vessel_cards_page_1_bowl_plate.png`
- `vessel_cards_page_2_washer_vase.png`
- `vessel_cards_page_3_censer.png`

Together these contain 8 each of Bowl, Plate, Washer, Vase and Censer (40 total). The fields Glaze / Decoration / Quality / Delivered remain compatible with V0.4.

### Fire cards
- `fire_cards_page_1.png`
- `fire_cards_page_2_remaining_plus1.png`

Together these represent exactly:
- -1 x 5
- 0 x 10
- +1 x 5

The earlier mixed Fire/Wood Page 2 was removed from the canonical directory so it cannot be mistaken for extra Fire cards.

### Wood Contribution cards
- `wood_contribution_cards_4_sets.png`

Exactly four colour sets, each containing 0 / 1 / 2 / 3: 16 cards total.

## Intentionally absent because older raster text conflicts with V0.4

### Central game board
The older board is excluded. It contained obsolete content including Refining House / Refined Clay and older action/firing references.

The V0.4 central board must be generated from:
- `data/action_locations.json`
- `data/firing.json`
- `data/round_structure.json`

It must contain exactly:
1. Materials Yard
2. Forming Studio
3. Glaze Workshop
4. Kiln Yard
5. Market & Imperial Office
6. Guild & Academy

### Player boards
Earlier text-bearing player-board rasters are excluded. Generate all five from `data/kilns.json`. Resource areas are Clay / Wood / Coins.

### Craft Technique cards
Earlier raster sheets are excluded because at least one generated English title differs from the rulebook spelling. Generate all 12 from `data/techniques.json`.

### Player reference
Earlier reference raster predates the contributor-scaled firing rule and current six-location action board. Generate from current data.

## Authority rule

Raster artwork is never a rules source.

Codex must implement/render gameplay from:
1. `docs/GAME_RULES.md`
2. `data/*.json`
3. `docs/IMPLEMENTATION_DECISIONS.md`

The PNGs above are safe visual references only.
