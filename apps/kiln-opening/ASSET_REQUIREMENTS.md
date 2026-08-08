# Kiln Opening tabletop asset inventory

This inventory records the V0.6.3 artwork used by the graphical tabletop. The
rules and live labels remain HTML driven; artwork is presentation only.

## Supplied and integrated

| Component | Runtime file | Source size | Use |
| --- | --- | ---: | --- |
| Central Action Board, Shared Kiln, Imperial Track | `public/assets/tabletop/central-table.webp` | 1448 × 1086 | Table background with normalized interactive overlays |
| Kiln workshop boards (Ru, Guan, Ge, Ding, Jun) | `public/assets/tabletop/player-boards.webp` | 1448 × 1086 | Cropped at runtime from one atlas |
| Market Orders M01–M20 | `public/assets/tabletop/market-orders.webp` | 948 × 1659 | 4 × 5 runtime sprite atlas |
| Imperial Orders I01–I10 | `public/assets/tabletop/imperial-orders.webp` | 1672 × 941 | 5 × 2 runtime sprite atlas |
| Craft Techniques T01–T12 | `public/assets/tabletop/techniques.webp` | 1448 × 1086 | 4 × 3 runtime sprite atlas |
| Vessel reference art | `public/assets/tabletop/vessels.webp` | 1448 × 1086 | Reference atlas; live pieces remain state-labelled SVG/CSS silhouettes |
| Shifu, Apprentice, resources, Imperial Seal | `public/assets/tabletop/tokens.webp` | 1536 × 1024 | Reference atlas; live tokens use accessible SVG/CSS equivalents |
| Fire and Wood Contribution cards | `public/assets/tabletop/firing-cards.webp` | 1448 × 1086 | Runtime sprite atlas |

The original generated files remain under `assets/`. Runtime code references
only the optimized stable filenames above, so final art can be swapped without changing
components.

## Known limitations in supplied art

- The central-table image includes printed capacity circles that do not exactly
  match every V0.6.3 player-count value. Live hotspot badges cover and replace
  these with values read from `data/action_locations.json`.
- Several sheets contain multiple components rather than transparent standalone
  images. They are cropped in CSS from a single atlas and never copied into game
  state.
- The token sheet has a dark illustrated background rather than isolated alpha
  cut-outs. Live meeples and resource tokens therefore use code-native visual
  pieces with text alternatives.
- The Ding and Jun workshop boards are close to the lower edge of their atlas.
  The UI uses a decorative crop and keeps all rules-bearing text in live HTML.

## Replacement-ready assets still wanted

These are optional polish assets. Their current placeholders are fully usable
and have the same semantic role.

| Recommended filename | Target size / ratio | Requirements |
| --- | --- | --- |
| `public/assets/boards/central-board.webp` | 1800 × 2100, 6:7 portrait | Six action locations; no printed player-count capacity values |
| `public/assets/boards/shared-kiln.webp` | 1800 × 1050, 12:7 landscape | Eight empty chambers: 2 high, 3 middle, 3 low |
| `public/assets/boards/imperial-track.webp` | 1800 × 540, 10:3 landscape | Spaces 0–5, milestone icon areas, separate Seal area |
| `public/assets/player-boards/ru.webp` | 1400 × 900, 14:9 | Decorative Ru workshop; 1 Shifu, 3 starting Apprentices, 2 locked |
| `public/assets/player-boards/guan.webp` | 1400 × 900, 14:9 | Same safe zones as Ru |
| `public/assets/player-boards/ge.webp` | 1400 × 900, 14:9 | Same safe zones as Ru |
| `public/assets/player-boards/ding.webp` | 1400 × 900, 14:9 | Same safe zones as Ru |
| `public/assets/player-boards/jun.webp` | 1400 × 900, 14:9 | Same safe zones as Ru |
| `public/assets/tokens/meeple-shifu.svg` | 120 × 160, 3:4 | Transparent, single-colour tintable silhouette |
| `public/assets/tokens/meeple-apprentice.svg` | 100 × 130, 10:13 | Transparent, single-colour tintable silhouette |
| `public/assets/tokens/clay.svg` | 128 × 128, 1:1 | Transparent token |
| `public/assets/tokens/wood.svg` | 128 × 128, 1:1 | Transparent token |
| `public/assets/tokens/coin.svg` | 128 × 128, 1:1 | Transparent token |
| `public/assets/tokens/imperial-seal.svg` | 160 × 160, 1:1 | Transparent seal token |
| `public/assets/cards/order-back-market.webp` | 700 × 980, 5:7 | Market deck back |
| `public/assets/cards/order-back-imperial.webp` | 700 × 980, 5:7 | Imperial deck back |
| `public/assets/cards/fire-back.webp` | 700 × 980, 5:7 | Fire deck back |
| `public/assets/cards/wood-back.webp` | 700 × 980, 5:7 | Secret Wood card back |

## Safe-area convention for future replacements

- Boards: keep the outer 4% free of rules-critical marks.
- Cards and tiles: keep IDs and values inside the inner 8%.
- Tokens: use a transparent canvas and keep the silhouette inside the inner 6%.
- Do not bake live quantities, capacity by player count, ownership, heat totals,
  or legal-action indicators into artwork. Those are rendered from authoritative
  state.
