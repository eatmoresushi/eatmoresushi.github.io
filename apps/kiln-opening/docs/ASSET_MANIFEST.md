# ASSET_MANIFEST.md — V1.1.6 rules / legacy visual audit

Only files under `assets/current_v04/` are approved as visual references. The directory name is a stable legacy path, not a rules-version claim. No raster text is authoritative.

## Approved visual references

### Vessel cards

- `vessel_cards_page_1_bowl_plate.png`
- `vessel_cards_page_2_washer_vase.png`
- `vessel_cards_page_3_censer.png`

Together these provide 8 each of Bowl, Plate, Washer, Vase and Censer. Their writable Glaze, Decoration and Quality fields remain usable, but all labels and rules must be checked against the V1.1.6 source and current structured data.

## Obsolete rules-bearing raster sets

- Earlier Fire-card sheets are incomplete and have the wrong distribution.
- The four-colour `0 / 1 / 2 / 3` Wood-card sheet is obsolete. V1.1.6 uses Bank, Tend and Stoke.
- Earlier Order sheets do not contain the complete 30 Market and 22 Imperial Orders.
- The older central board omits Labour and separate Court Patronage and contains obsolete effects.
- Earlier Technique and reference-card text predates V1.1.6 timing and costs.

The online client must cover or replace stale raster wording with data-driven bilingual UI; it must never expose obsolete text as the current rule.

## Assets to regenerate from V1.1.6 data

### Orders

Generate all 52 fronts from `data/orders.json`: 30 Market and 22 Imperial. Print each Imperial card's Progress reward and provide distinct deck backs. Use both English and Simplified Chinese text from the same stable card IDs.

### Central Action Board

Generate from `data/action_locations.json` with exactly eight locations:

1. Materials Yard
2. Forming Studio
3. Glaze Workshop
4. Kiln Yard
5. Market & Imperial Office
6. Guild & Academy
7. Labour
8. Court Patronage

Labour and Court Patronage are uncapped. Court Patronage is Shifu-only and costs 4 Coins. Kiln Yard must show loading counts and the Shifu reposition window after Base Heat is known.

### Shared Kiln and Fire deck

Generate from `data/firing.json`. The Shared Kiln has 3 High (+1), 2 Middle (0) and 2 Low (−1) spaces, with player-count covers. The 12-card Fire deck is:

- −2 ×1
- −1 ×3
- 0 ×4
- +1 ×3
- +2 ×1

### Kiln Contribution cards

Generate four identical three-card sets from `data/firing.json`: Bank the Fire, Tend the Fire and Stoke the Fire, for 12 cards total.

### Player boards, Techniques and reference

Generate the five player boards from `data/kilns.json`, all 15 Technique tiles from `data/techniques.json`, and the player reference from `data/round_structure.json` plus `data/firing.json`. All rules-bearing output must support matching English and Simplified Chinese text.

## Authority

For current gameplay use, in order:

1. `docs/KILN_OPENING_v1.1.6_SOURCE.md`
2. `docs/RULEBOOK_AUDIT_V1.1.6.md`
3. current `data/*.json`
4. `docs/IMPLEMENTATION_DECISIONS.md`

Raster artwork is visual direction only.
