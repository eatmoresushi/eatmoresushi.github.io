# ASSET_MANIFEST.md — V1.2.6 rules / legacy visual audit

Only files under `assets/current_v04/` are approved as visual references. The directory name is a stable legacy path, not a rules-version claim. No raster text is authoritative.

## Approved visual references

### Vessel cards

- `vessel_cards_page_1_bowl_plate.png`
- `vessel_cards_page_2_washer_vase.png`
- `vessel_cards_page_3_censer.png`

Together these provide 8 each of Bowl, Plate, Brush Washer, Vase and Censer. Their writable Glaze, Decoration and Quality fields remain usable, but all labels and rules must be checked against the V1.2.6 sources and current structured data. The physical card count is not a gameplay limit; provide a same-Shape proxy when all available cards are in use.

## Obsolete rules-bearing raster sets

Any image showing an earlier ruleset is obsolete, including:

- incomplete or incorrectly distributed Fire-card sheets;
- numeric 0/1/2/3 Wood bidding rather than Bank, Tend and Stoke;
- separate Market and Imperial Order decks or displays;
- Office, Court Patronage, private Potter's Wheel or private Glaze & Decoration locations;
- worker unlocks, Imperial Progress or the Imperial Seal;
- older Craft Technique sets rather than V1.2.6 Starting and Advanced Techs;
- an Imperial token that adjusts firing heat or is embedded as an additional Kiln Yard load rather than the before-or-after-action Imperial Priority load.

The online client must cover or replace stale raster wording with data-driven bilingual UI; it must never expose obsolete text as the current rule.

## Assets to regenerate from V1.2.6 data

### Orders

Generate all 64 fronts from `data/orders.json`: 16 separate Starting Orders and 48 unified Main Orders. Main cards print their Coin, VP and Crown rewards. Use distinct Starting and Main backs and matching English / Simplified Chinese text from the same stable card IDs.

### Central Action Board

Generate the seven shared worker locations from `data/action_locations.json`:

1. Materials Yard
2. Potter's Wheel
3. Glaze & Decoration
4. Kiln Yard
5. Commission Market
6. Guild & Academy
7. Labour

Materials, Wheel, Glaze, Commission and Guild use one global 2/3/4 capacity for 2/3/4 players. Kiln Yard and Labour are uncapped. Printed spaces do not belong to individual players; a Shifu may overfill a full location. Also show the Round track and the 0–4 Imperial Recognition track; Recognition is not a worker location.

### Shared Kiln and Fire deck

Generate from `data/firing.json`. The Shared Kiln has 3 High (+1), 2 Middle (0) and 2 Low (−1) spaces, with player-count covers. The 12-card Fire deck is −2×1, −1×3, 0×4, +1×3 and +2×1.

### Kiln Contribution cards

Generate four identical three-card sets: Bank the Fire, Tend the Fire and Stoke the Fire. Fuel Ledger uses a secret extra-Wood commitment with Bank or Stoke; it does not require a separate public Contribution card.

### Player boards and Techs

Generate the five Kiln player boards from `data/kilns.json`. Each board must show:

- one Starting Tech area and two Advanced Tech slots;
- one empty Imperial Kiln area that receives a one-ceramic tile at Recognition 2;
- an Imperial Priority token area.

Do not show private workshop worker spaces or Tech-based location unlocks. Potter's Wheel and Glaze & Decoration belong on the shared Central Action Board.

Generate four Starting Tech designs, with four physical copies each, and all 15 unique Advanced Techs from `data/techniques.json`.

### Reference

Generate the five-phase round sequence, Contribution/Firing sequence, Work-Phase Shifu-to-ceramic marker and after-Base/before-Fire movement of only that marked ceramic, the 2-Coin Flawed salvage, Recognition 0–4 milestones and Crown overflow VP, universal five-ceramic Exhibition and featured-three diversity rule from current structured data. All rules-bearing output must support matching English and Simplified Chinese text.

## Authority

For current gameplay use, in order:

1. `docs/KILN_OPENING_v1.2.6_EN_SOURCE.md` for mechanics
2. `docs/KILN_OPENING_v1.2.6_ZH_SOURCE.md` for Chinese localization
3. `docs/RULEBOOK_AUDIT_V1.2.6.md`
4. current `data/*.json`
5. `docs/IMPLEMENTATION_DECISIONS.md`

Raster artwork is visual direction only.
