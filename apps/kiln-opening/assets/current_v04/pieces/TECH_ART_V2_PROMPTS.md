# Tech art v2: exact prompts and provenance

Generated on 2026-09-27 using the built-in `image_gen.imagegen` tool, with one generation call for each of the 19 Tech illustrations. No CLI/API fallback was used.

## Reference scope

The owner supplied these images solely as illustration style references:

- `/Users/luyuan/Documents/kiln board game/v1.2.3/starting_tile_upscale.png`
- `/Users/luyuan/Documents/kiln board game/v1.2.3/tech_tile2_upscale.png`

Their older card text, costs, layouts and mechanics are not authoritative. Current V1.4 rules, including approved owner amendments, remain in structured data and localized HTML. For example, T09 is Painting Brushes; the obsolete Crackle Slips shown on the reference sheet was not restored.

The owner's follow-up requested clear isolated artwork without a background, arranged between a tile's title/category and description. The final prompts request transparent alpha, fully visible objects, modest margins and no background scenery, parchment surface, text, frame or UI.

## Final assets and optimization

| Assets | Count | Final dimensions | Delivery conversion |
| --- | ---: | --- | --- |
| `tech-ST01-v2.webp`–`tech-ST04-v2.webp` | 4 | 960 × 640 | Sharp resize and WebP, quality 90, alpha quality 100 |
| `tech-T01-v2.webp`–`tech-T05-v2.webp` | 5 | 960 × 640 | Sharp resize and WebP, quality 90, alpha quality 100 |
| `tech-T06-v2.webp`–`tech-T15-v2.webp` | 10 | 640 × 427 | `cwebp -quiet -q 82 -resize 640 0 <source> -o <destination>` |

Only format and size optimization was performed. No artwork was programmatically painted, composited or cropped. These delivery dimensions are retained without further resizing. All 19 illustrations were visually inspected and alpha transparency was verified. T06–T15 generated source PNGs are 1536 × 1024 RGBA with alpha ranging from 0 to 254 and 41–55% fully transparent pixels; their WebP delivery copies retain alpha and total approximately 620 KB.

The original generated files listed below remain at their built-in output locations. The final project assets are stored in this directory. Earlier `tech-*-v1.webp` assets and [their prompt record](TECH_ART_PROMPTS.md) are retained as history.

## Exact final prompts

The following entries preserve each final prompt verbatim and identify its generated source and project asset.

## ST01 — Prepared Clay

Final path: assets/current_v04/pieces/tech-ST01-v2.webp

Generated source: /Users/luyuan/.codex/generated_images/01a0e109-f952-7680-a3e1-237e70737bfa/exec-a6eee532-8b1a-4495-805c-fb0d7e49e4a3.png

Exact prompt:

```text
Use case: stylized-concept. Asset type: text-free illustration for a small digital board-game Tech tile. Create a new single still-life illustration using the attached images ONLY as object rendering style references, never copying their backgrounds, text, card layouts or rules. Match delicate antique natural-history watercolor, fine pencil and engraving outlines, subdued olive/celadon/tan pottery. Background MUST be genuinely transparent alpha, with NO parchment, paper, crackle background, room or environment. Isolated objects, fully visible, closely framed with modest 5–8% margins, balanced central grouping, landscape 3:2 composition. Clear readable silhouetted objects and a subtle small natural grounding shadow only. Fill composition usefully without large blank bands. No people, hands, village, landscape, room interior, text, letters, digits, symbols, borders, logos, cards, badges, or UI. Return only artwork with transparency. Subject: A mound of kneaded tan clay with smaller clay lumps on a worn low wooden board beside a plain half-formed cylindrical pottery vessel on a circular wooden wheel bat. Objects are the entire subject, like a museum craft illustration.
```

## ST02 — White Slip

Final path: assets/current_v04/pieces/tech-ST02-v2.webp

Generated source: /Users/luyuan/.codex/generated_images/01a0e109-f952-7680-a3e1-237e70737bfa/exec-03d4f720-3eb4-4c22-8db5-ec3892680615.png

Exact prompt:

```text
Use case: stylized-concept. Asset type: text-free illustration for a small digital board-game Tech tile. Create a new single still-life illustration using the attached images ONLY as object rendering style references, never copying their backgrounds, text, card layouts or rules. Match delicate antique natural-history watercolor, fine pencil and engraving outlines, subdued olive/celadon/tan pottery. Background MUST be genuinely transparent alpha, with NO parchment, paper, crackle background, room or environment. Isolated objects, fully visible, closely framed with modest 5–8% margins, balanced central grouping, landscape 3:2 composition. Clear readable silhouetted objects and a subtle small natural grounding shadow only. Fill composition usefully without large blank bands. No people, hands, village, landscape, room interior, text, letters, digits, symbols, borders, logos, cards, badges, or UI. Return only artwork with transparency. Subject: A shallow celadon ceramic bowl filled with creamy white slip, a slim bamboo-handled brush resting diagonally across its lip, and a small undecorated pale earthenware vessel beside it. Elegant restrained Song Dynasty craft still life.
```

## ST03 — Rapid Drying

Final path: assets/current_v04/pieces/tech-ST03-v2.webp

Generated source: /Users/luyuan/.codex/generated_images/01a0e109-f952-7680-a3e1-237e70737bfa/exec-e6c69928-8014-4c48-a4c2-652f06ce2066.png

Exact prompt:

```text
Use case: stylized-concept. Asset type: text-free illustration for a small digital board-game Tech tile. Create a new single still-life illustration using the attached images ONLY as object rendering style references, never copying their backgrounds, text, card layouts or rules. Match delicate antique natural-history watercolor, fine pencil and engraving outlines, subdued olive/celadon/tan pottery. Background MUST be genuinely transparent alpha, with NO parchment, paper, crackle background, room or environment. Isolated objects, fully visible, closely framed with modest 5–8% margins, balanced central grouping, landscape 3:2 composition. Clear readable silhouetted objects and a subtle small natural grounding shadow only. Fill composition usefully without large blank bands. No people, hands, village, landscape, room interior, text, letters, digits, symbols, borders, logos, cards, badges, or UI. Return only artwork with transparency. Subject: A small low wooden drying shelf with several pale bowls and vases, beside a small simple brick kiln mouth and a modest stack of split logs. The kiln is a compact isolated craft object, not part of a room or landscape. Gentle orange embers only.
```

## ST04 — Kiln Tending

Final path: assets/current_v04/pieces/tech-ST04-v2.webp

Generated source: /Users/luyuan/.codex/generated_images/01a0e109-f952-7680-a3e1-237e70737bfa/exec-87f69c5f-0b73-4687-ae27-25c046ec6d87.png

Exact prompt:

```text
Use case: stylized-concept. Asset type: text-free illustration for a small digital board-game Tech tile. Create a new single still-life illustration using the attached images ONLY as object rendering style references, never copying their backgrounds, text, card layouts or rules. Match delicate antique natural-history watercolor, fine pencil and engraving outlines, subdued olive/celadon/tan pottery. Background MUST be genuinely transparent alpha, with NO parchment, paper, crackle background, room or environment. Isolated objects, fully visible, closely framed with modest 5–8% margins, balanced central grouping, landscape 3:2 composition. Clear readable silhouetted objects and a subtle small natural grounding shadow only. Fill composition usefully without large blank bands. No people, hands, village, landscape, room interior, text, letters, digits, symbols, borders, logos, cards, badges, or UI. Return only artwork with transparency. Subject: Simple long iron firing tongs and a wooden poker lying diagonally in front of a small arched kiln opening, with a few split logs and a lump of raw clay nearby. Compact isolated still life, kiln object fully visible, mild warm ember glow.
```

## T01 — Large Throwing Wheel

Final path: assets/current_v04/pieces/tech-T01-v2.webp

Generated source: /Users/luyuan/.codex/generated_images/01a0e109-f952-7680-a3e1-237e70737bfa/exec-6bab2717-20e2-4f98-9d62-5f7ce34e4cac.png

Exact prompt:

```text
Use case: stylized-concept. Asset type: text-free illustration for a small digital board-game Tech tile. Create a new single still-life illustration using the attached images ONLY as object rendering style references, never copying their backgrounds, text, card layouts or rules. Match delicate antique natural-history watercolor, fine pencil and engraving outlines, subdued olive/celadon/tan pottery. Background MUST be genuinely transparent alpha, with NO parchment, paper, crackle background, room or environment. Isolated objects, fully visible, closely framed with modest 5–8% margins, balanced central grouping, landscape 3:2 composition. Clear readable silhouetted objects and a subtle small natural grounding shadow only. Fill composition usefully without large blank bands. No people, hands, village, landscape, room interior, text, letters, digits, symbols, borders, logos, cards, badges, or UI. Return only artwork with transparency. Subject: A large traditional wooden potter's throwing wheel viewed three-quarter from above, with a tall unglazed vase standing on its broad wooden disc and a small three-footed unglazed censer beside it. No person, no surrounding workshop, fully visible isolated objects.
```

## T02 — Measuring Calipers

Final path: assets/current_v04/pieces/tech-T02-v2.webp

Generated source: /Users/luyuan/.codex/generated_images/01a0e109-f952-7680-a3e1-237e70737bfa/exec-d782a353-f323-41a5-a840-72cd49398d3a.png

Exact prompt:

```text
Use case: stylized-concept. Asset type: text-free illustration for a small digital board-game Tech tile. Create a new single still-life illustration using the attached images ONLY as object rendering style references, never copying their backgrounds, text, card layouts or rules. Match delicate antique natural-history watercolor, fine pencil and engraving outlines, subdued olive/celadon/tan pottery. Background MUST be genuinely transparent alpha, with NO parchment, paper, crackle background, room or environment. Isolated objects, fully visible, closely framed with modest 5–8% margins, balanced central grouping, landscape 3:2 composition. Clear readable silhouetted objects and a subtle small natural grounding shadow only. Fill composition usefully without large blank bands. No people, hands, village, landscape, room interior, text, letters, digits, symbols, borders, logos, cards, badges, or UI. Return only artwork with transparency. Subject: A pair of old wooden potter's measuring calipers leaning across a slender unglazed vase, with a low unglazed bowl beside it. Distinct vessel shapes and careful measuring tools, fine antique craftsmanship.
```

## T03 — Standardised Moulds

Final path: assets/current_v04/pieces/tech-T03-v2.webp

Generated source: /Users/luyuan/.codex/generated_images/01a0e109-f952-7680-a3e1-237e70737bfa/exec-cc69634c-d06a-461c-a3d1-592dc9016167.png

Exact prompt:

```text
Use case: stylized-concept. Asset type: text-free illustration for a small digital board-game Tech tile. Create a new single still-life illustration using the attached images ONLY as object rendering style references, never copying their backgrounds, text, card layouts or rules. Match delicate antique natural-history watercolor, fine pencil and engraving outlines, subdued olive/celadon/tan pottery. Background MUST be genuinely transparent alpha, with NO parchment, paper, crackle background, room or environment. Isolated objects, fully visible, closely framed with modest 5–8% margins, balanced central grouping, landscape 3:2 composition. Clear readable silhouetted objects and a subtle small natural grounding shadow only. Fill composition usefully without large blank bands. No people, hands, village, landscape, room interior, text, letters, digits, symbols, borders, logos, cards, badges, or UI. Return only artwork with transparency. Subject: Two carved shallow pottery bowl moulds propped at an angle, showing restrained floral relief patterns, and two matching plain unglazed bowls in front. Repeated matching shapes, a compact still life of traditional earthen moulds.
```

## T04 — Drying Frames

Final path: assets/current_v04/pieces/tech-T04-v2.webp

Generated source: /Users/luyuan/.codex/generated_images/01a0e109-f952-7680-a3e1-237e70737bfa/exec-44520e22-8b28-4ed5-a8d6-23b30c018970.png

Exact prompt:

```text
Use case: stylized-concept. Asset type: text-free illustration for a small digital board-game Tech tile. Create a new single still-life illustration using the attached images ONLY as object rendering style references, never copying their backgrounds, text, card layouts or rules. Match delicate antique natural-history watercolor, fine pencil and engraving outlines, subdued olive/celadon/tan pottery. Background MUST be genuinely transparent alpha, with NO parchment, paper, crackle background, room or environment. Isolated objects, fully visible, closely framed with modest 5–8% margins, balanced central grouping, landscape 3:2 composition. Clear readable silhouetted objects and a subtle small natural grounding shadow only. Fill composition usefully without large blank bands. No people, hands, village, landscape, room interior, text, letters, digits, symbols, borders, logos, cards, badges, or UI. Return only artwork with transparency. Subject: A simple low two-tier wooden drying frame holding pale unglazed bowls and slender vases, with a small fine decorating brush and carving tool resting on the lowest board. Show the complete frame on transparent alpha.
```

## T05 — Reworking Table

Final path: assets/current_v04/pieces/tech-T05-v2.webp

Generated source: /Users/luyuan/.codex/generated_images/01a0e109-f952-7680-a3e1-237e70737bfa/exec-3b305c00-2b59-43ef-9aef-e513a3af4b73.png

Exact prompt:

```text
Use case: stylized-concept. Asset type: text-free illustration for a small digital board-game Tech tile. Create a new single still-life illustration using the attached images ONLY as object rendering style references, never copying their backgrounds, text, card layouts or rules. Match delicate antique natural-history watercolor, fine pencil and engraving outlines, subdued olive/celadon/tan pottery. Background MUST be genuinely transparent alpha, with NO parchment, paper, crackle background, room or environment. Isolated objects, fully visible, closely framed with modest 5–8% margins, balanced central grouping, landscape 3:2 composition. Clear readable silhouetted objects and a subtle small natural grounding shadow only. Fill composition usefully without large blank bands. No people, hands, village, landscape, room interior, text, letters, digits, symbols, borders, logos, cards, badges, or UI. Return only artwork with transparency. Subject: A low weathered wooden potter's work table, a reshaped damp clay vessel and a shallow bowl on top, a few wooden shaping ribs and a rolled lump of clay. Quiet still life of handcraft tools, no person or hands.
```

## T06 — Glaze Palette

Source: `/Users/luyuan/.codex/generated_images/01a0e10a-4ad1-7961-b13e-2051537b8b69/exec-87e5cfd0-9d12-4380-8aae-78a18f9029ad.png`

Final: `assets/current_v04/pieces/tech-T06-v2.webp`

Exact prompt:

```text
Use case: stylized-concept. Asset type: text-free illustration for a Song Dynasty ceramics board game Tech tile. Create a standalone antique watercolor and finely engraved pencil still life on a genuinely TRANSPARENT background (alpha). Match refined historical printed tabletop card illustrations: pale celadon and olive green ceramic glaze, warm sepia clay/wood, delicate hand-painted texture, precise object contours, soft realistic volume. Isolated objects only; modest tight margin around all fully visible objects, arranged wide landscape 3:2 for a central art band. Clear readable object silhouettes even at small size, colors subtle but not faded. Very subtle grounding shadow only. No rice paper, no solid background, no crackle surface outside objects, no room, landscape, village, people, typography, letters, digits, title, border, frame, UI, logo or watermark. Subject: Glaze Palette: an old shallow ceramic mixing palette with several small pools of soft celadon, cream, olive, blue-gray and warm brown glaze; two small glazed tasting dishes and a fine bamboo brush beside it.
```

## T07 — Carving Knives

Source: `/Users/luyuan/.codex/generated_images/01a0e10a-4ad1-7961-b13e-2051537b8b69/exec-58152f96-c4ac-4830-9ed0-477d084399b2.png`

Final: `assets/current_v04/pieces/tech-T07-v2.webp`

Exact prompt:

```text
Use case: stylized-concept. Asset type: text-free illustration for a Song Dynasty ceramics board game Tech tile. Create a standalone antique watercolor and finely engraved pencil still life on a genuinely TRANSPARENT background (alpha). Match refined historical printed tabletop card illustrations: pale celadon and olive green ceramic glaze, warm sepia clay/wood, delicate hand-painted texture, precise object contours, soft realistic volume. Isolated objects only; modest tight margin around all fully visible objects, arranged wide landscape 3:2 for a central art band. Clear readable object silhouettes even at small size, colors subtle but not faded. Very subtle grounding shadow only. No rice paper, no solid background, no crackle surface outside objects, no room, landscape, village, people, typography, letters, digits, title, border, frame, UI, logo or watermark. Subject: Carving Knives: three elegant wooden-handled carving knives arranged diagonally in front of a low pale celadon bowl with delicately incised lotus-petal decoration; a small matching incised plate behind, the crisp carved lines visible.
```

## T08 — Seal Stamps

Source: `/Users/luyuan/.codex/generated_images/01a0e10a-4ad1-7961-b13e-2051537b8b69/exec-f0c1f603-081e-49e3-bcf2-8d15664d0bea.png`

Final: `assets/current_v04/pieces/tech-T08-v2.webp`

Exact prompt:

```text
Use case: stylized-concept. Asset type: text-free illustration for a Song Dynasty ceramics board game Tech tile. Create a standalone antique watercolor and finely engraved pencil still life on a genuinely TRANSPARENT background (alpha). Match refined historical printed tabletop card illustrations: pale celadon and olive green ceramic glaze, warm sepia clay/wood, delicate hand-painted texture, precise object contours, soft realistic volume. Isolated objects only; modest tight margin around all fully visible objects, arranged wide landscape 3:2 for a central art band. Clear readable object silhouettes even at small size, colors subtle but not faded. Very subtle grounding shadow only. No rice paper, no solid background, no crackle surface outside objects, no room, landscape, village, people, typography, letters, digits, title, border, frame, UI, logo or watermark. Subject: Seal Stamps: several small traditional carved wooden pottery stamps standing and lying on their sides, stamp faces showing geometric and floral patterns (never lettering), beside a shallow soft-clay dish with repeated impressed lotus rosette decoration.
```

## T09 — Painting Brushes

Source: `/Users/luyuan/.codex/generated_images/01a0e10a-4ad1-7961-b13e-2051537b8b69/exec-7802fd2e-4799-4b44-8d85-dfe7e8bdd5af.png`

Final: `assets/current_v04/pieces/tech-T09-v2.webp`

Exact prompt:

```text
Use case: stylized-concept. Asset type: text-free illustration for a Song Dynasty ceramics board game Tech tile. Create a standalone antique watercolor and finely engraved pencil still life on a genuinely TRANSPARENT background (alpha). Match refined historical printed tabletop card illustrations: pale celadon and olive green ceramic glaze, warm sepia clay/wood, delicate hand-painted texture, precise object contours, soft realistic volume. Isolated objects only; modest tight margin around all fully visible objects, arranged wide landscape 3:2 for a central art band. Clear readable object silhouettes even at small size, colors subtle but not faded. Very subtle grounding shadow only. No rice paper, no solid background, no crackle surface outside objects, no room, landscape, village, people, typography, letters, digits, title, border, frame, UI, logo or watermark. Subject: Painting Brushes: a pair of fine bamboo-handled painting brushes in front of a pale ivory ceramic plate bearing a delicate cobalt-blue floral design; one tiny bowl of blue-gray pigment. The flowers are an elegant painted illustration without writing.
```

## T10 — Colour Samples

Source: `/Users/luyuan/.codex/generated_images/01a0e10a-4ad1-7961-b13e-2051537b8b69/exec-b6c3c010-f899-42f3-83f5-13670efa7acc.png`

Final: `assets/current_v04/pieces/tech-T10-v2.webp`

Exact prompt:

```text
Use case: stylized-concept. Asset type: text-free illustration for a Song Dynasty ceramics board game Tech tile. Create a standalone antique watercolor and finely engraved pencil still life on a genuinely TRANSPARENT background (alpha). Match refined historical printed tabletop card illustrations: pale celadon and olive green ceramic glaze, warm sepia clay/wood, delicate hand-painted texture, precise object contours, soft realistic volume. Isolated objects only; modest tight margin around all fully visible objects, arranged wide landscape 3:2 for a central art band. Clear readable object silhouettes even at small size, colors subtle but not faded. Very subtle grounding shadow only. No rice paper, no solid background, no crackle surface outside objects, no room, landscape, village, people, typography, letters, digits, title, border, frame, UI, logo or watermark. Subject: Colour Samples: a neat gently fanned row of five rectangular glazed ceramic sample tiles in pale celadon, ivory, warm ochre, soft dusty blue and dark charcoal, with one fine bamboo brush laid diagonally alongside. No sample labels or text.
```

## T11 — Protective Saggars

Source: `/Users/luyuan/.codex/generated_images/01a0e10a-4ad1-7961-b13e-2051537b8b69/exec-7d367149-f525-443a-a752-8df4f65b2e66.png`

Final: `assets/current_v04/pieces/tech-T11-v2.webp`

Exact prompt:

```text
Use case: stylized-concept. Asset type: text-free illustration for a Song Dynasty ceramics board game Tech tile. Create a standalone antique watercolor and finely engraved pencil still life on a genuinely TRANSPARENT background (alpha). Match refined historical printed tabletop card illustrations: pale celadon and olive green ceramic glaze, warm sepia clay/wood, delicate hand-painted texture, precise object contours, soft realistic volume. Isolated objects only; modest tight margin around all fully visible objects, arranged wide landscape 3:2 for a central art band. Clear readable object silhouettes even at small size, colors subtle but not faded. Very subtle grounding shadow only. No rice paper, no solid background, no crackle surface outside objects, no room, landscape, village, people, typography, letters, digits, title, border, frame, UI, logo or watermark. Subject: Protective Saggars: two thick cream and tan refractory clay saggar containers, one square and one cylindrical, open to show a small pale celadon bowl nestled safely within; matching lids and a tiny supporting ring alongside, all isolated as historical potter tools.
```

## T12 — Fuel Ledger

Source: `/Users/luyuan/.codex/generated_images/01a0e10a-4ad1-7961-b13e-2051537b8b69/exec-f63d1ed5-1656-4fee-b55e-cd393698bea6.png`

Final: `assets/current_v04/pieces/tech-T12-v2.webp`

Exact prompt:

```text
Use case: stylized-concept. Asset type: text-free illustration for a Song Dynasty ceramics board game Tech tile. Create a standalone antique watercolor and finely engraved pencil still life on a genuinely TRANSPARENT background (alpha). Match refined historical printed tabletop card illustrations: pale celadon and olive green ceramic glaze, warm sepia clay/wood, delicate hand-painted texture, precise object contours, soft realistic volume. Isolated objects only; modest tight margin around all fully visible objects, arranged wide landscape 3:2 for a central art band. Clear readable object silhouettes even at small size, colors subtle but not faded. Very subtle grounding shadow only. No rice paper, no solid background, no crackle surface outside objects, no room, landscape, village, people, typography, letters, digits, title, border, frame, UI, logo or watermark. Subject: Fuel Ledger: an old open hand-bound paper ledger with completely blank ivory pages and a dark brown wooden cover, propped beside a neatly stacked small pile of cut firewood logs. No lines, marks, letters, tally marks, numerals, or symbols anywhere on the pages.
```

## T13 — Test Pieces

Source: `/Users/luyuan/.codex/generated_images/01a0e10a-4ad1-7961-b13e-2051537b8b69/exec-af8f84e8-c092-48be-90b9-52fd538aaf23.png`

Final: `assets/current_v04/pieces/tech-T13-v2.webp`

Exact prompt:

```text
Use case: stylized-concept. Asset type: text-free illustration for a Song Dynasty ceramics board game Tech tile. Create a standalone antique watercolor and finely engraved pencil still life on a genuinely TRANSPARENT background (alpha). Match refined historical printed tabletop card illustrations: pale celadon and olive green ceramic glaze, warm sepia clay/wood, delicate hand-painted texture, precise object contours, soft realistic volume. Isolated objects only; modest tight margin around all fully visible objects, arranged wide landscape 3:2 for a central art band. Clear readable object silhouettes even at small size, colors subtle but not faded. Very subtle grounding shadow only. No rice paper, no solid background, no crackle surface outside objects, no room, landscape, village, people, typography, letters, digits, title, border, frame, UI, logo or watermark. Subject: Test Pieces: a low small wooden rack supporting a pale celadon test bowl, with two slim ceramic test cups and an ivory vase of differing clay and glaze finishes beside it. Quiet historical pottery quality samples, all fully visible.
```

## T14 — Second Firing

Source: `/Users/luyuan/.codex/generated_images/01a0e10a-4ad1-7961-b13e-2051537b8b69/exec-d85bc793-5854-4abf-957a-795110feb8d5.png`

Final: `assets/current_v04/pieces/tech-T14-v2.webp`

Exact prompt:

```text
Use case: stylized-concept. Asset type: text-free illustration for a Song Dynasty ceramics board game Tech tile. Create a standalone antique watercolor and finely engraved pencil still life on a genuinely TRANSPARENT background (alpha). Match refined historical printed tabletop card illustrations: pale celadon and olive green ceramic glaze, warm sepia clay/wood, delicate hand-painted texture, precise object contours, soft realistic volume. Isolated objects only; modest tight margin around all fully visible objects, arranged wide landscape 3:2 for a central art band. Clear readable object silhouettes even at small size, colors subtle but not faded. Very subtle grounding shadow only. No rice paper, no solid background, no crackle surface outside objects, no room, landscape, village, people, typography, letters, digits, title, border, frame, UI, logo or watermark. Subject: Second Firing: a small isolated domed stone pottery kiln with a warm glowing fire inside its arched mouth, beside a single pale celadon bowl and an ivory vase ready to be fired again. Only the kiln object, pottery and a few tiny logs, no buildings or surrounding scene.
```

## T15 — Kiln Furniture

Source: `/Users/luyuan/.codex/generated_images/01a0e10a-4ad1-7961-b13e-2051537b8b69/exec-5ddbc183-717d-48e4-97cc-d663f972325b.png`

Final: `assets/current_v04/pieces/tech-T15-v2.webp`

Exact prompt:

```text
Use case: stylized-concept. Asset type: text-free illustration for a Song Dynasty ceramics board game Tech tile. Create a standalone antique watercolor and finely engraved pencil still life on a genuinely TRANSPARENT background (alpha). Match refined historical printed tabletop card illustrations: pale celadon and olive green ceramic glaze, warm sepia clay/wood, delicate hand-painted texture, precise object contours, soft realistic volume. Isolated objects only; modest tight margin around all fully visible objects, arranged wide landscape 3:2 for a central art band. Clear readable object silhouettes even at small size, colors subtle but not faded. Very subtle grounding shadow only. No rice paper, no solid background, no crackle surface outside objects, no room, landscape, village, people, typography, letters, digits, title, border, frame, UI, logo or watermark. Subject: Kiln Furniture: a low two-tier kiln shelf built entirely from tan refractory clay slabs and cylindrical ceramic posts, holding one small pale celadon bowl; two separate spare square-topped ceramic kiln props and support rings beside it. These are isolated pottery firing furniture tools, never a room or household furniture.
```
