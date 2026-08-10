# ASSET_MANIFEST.md — V1.0.2 RULES / LEGACY VISUAL AUDIT

Only files under `assets/current_v04/` are approved as current visual references.

## Approved and visually audited

### Vessel cards
- `vessel_cards_page_1_bowl_plate.png`
- `vessel_cards_page_2_washer_vase.png`
- `vessel_cards_page_3_censer.png`

Together these contain 8 each of Bowl, Plate, Washer, Vase and Censer (40 total). The fields Glaze / Decoration / Quality / Delivered remain compatible with V1.0.2.

### Legacy Fire cards
- `fire_cards_page_1.png`
- `fire_cards_page_2_remaining_plus1.png`

These images cover only the earlier -1/0/+1 cards and are not a complete V1.0.2 Fire deck. Regenerate a full 20-card set from `data/firing.json` with:

- -2 ×5
- -1 ×3
- 0 ×4
- +1 ×3
- +2 ×5

Until that set exists, the online client renders ±2 with a data-driven live card rather than mislabelling an older raster.

### Wood Contribution cards
- `wood_contribution_cards_4_sets.png`

Exactly four colour sets, each containing 0 / 1 / 2 / 3: 16 cards total.

## Intentionally absent because older raster text conflicts with V1.0.2

### Order-card sheets

The V0.6.1 sheets `order_cards_page_1_M01-M16.png` and `order_cards_page_2_M17-M20_I01-I10.png` were moved to `assets/obsolete_v061/`. They do not show the V0.6.3 M10/M12/M14/I02/I04 attributes or the +1/+2 Imperial Progress rewards and are not approved current references. Regenerate all cards from `data/orders.json`.

### Central game board
The older board is excluded. It contained obsolete content including Refining House / Refined Clay and older action/firing references.

The V1.0.2 central board must be generated from:
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

Any older T08 raster is obsolete: V1.0.2 Colour Samples acts before the first Office acquisition, may target either display, and bottoms the target. The online tabletop covers stale atlas wording and all changed/new Technique text with live V1.0.2 data.

### V1.0.2 rules-bearing board updates

Market/Imperial decks require distinct backs for blind draws. The Office must show face-up/blind acquisition and gated Court Patronage; Guild & Academy must show both worker types, the Shifu discount, and capacity 1/2/3. Until regenerated raster art is available, the online tabletop uses authoritative HTML/CSS plaques over stale baked-in board text.

### Player reference
Earlier reference raster predates the contributor-scaled firing rule and current six-location action board. Generate from current data.

## Authority rule

Raster artwork is never a rules source.

Codex must implement/render gameplay from:
1. `docs/GAME_RULES.md`
2. `data/*.json`
3. `docs/IMPLEMENTATION_DECISIONS.md`

The PNGs above are safe visual references only.
