# Order vessel artwork

Generated with the built-in `image_gen` tool on 2026-09-26. Five individual new illustrations, visually inspected after generation, exported as 640 × 640 WebP with alpha preserved. No prompts contain rules, card text or interface elements. These pictures are decorative; structured Order text remains authoritative for all requirements.

## Common prompt

Use case: historical-scene.
Asset type: one original isolated ceramic illustration for a Song dynasty pottery board-game Order card, square 1:1.
Style: fine delicate warm-brown engraved ink linework with restrained muted watercolor washes; elegant historical board-game illustration, carefully modeled ceramic volume and subtle glaze, not photography or a flat icon. Match a palette of warm ivory, pale celadon, mineral grey-green, tiny soft brown accents.
Composition: exactly ONE complete vessel centered, dominant and unclipped, filling about 75% of image width or height, seen from a slightly elevated three-quarter viewpoint. Visually clean object silhouette at small card size. Soft contact shadow immediately beneath. Background plain extremely pale warm ivory (#faf6eb) only; no scenery, table edges, other objects or decorative frame. If transparency is possible, use a genuinely transparent background retaining the soft contact shadow instead of ivory.
Constraints: no people, hands, tools, plants, landscapes, shelves, patterns outside the vessel, text, calligraphy, numbers, symbols, UI, borders, labels, logos or watermark. Individual painting, not collage or multiple panels.

## Individual subjects

### vessel-bowl-v1.webp

A single Song dynasty celadon ceramic bowl with a clear broad open circular rim, deep gently flaring rounded sides and small raised foot ring. Plain smooth pale grey-green glaze with subtle hand-thrown tonal texture; no decoration or painted motif. It must read unmistakably as a deep bowl.

### vessel-plate-v1.webp

A single Song dynasty pale ivory ceramic plate: very broad, shallow circular dish with a gently curved rim and low foot, viewed sufficiently from above to see the shallow interior. Smooth creamy glaze with a quiet pale celadon reflection; no decoration or painted motif. It must read unmistakably as a flat plate, much shallower than a bowl.

### vessel-brush-washer-v1.webp

A single Song dynasty ceramic brush washer: a low wide rounded vessel with a shallow basin, a softly flattened celadon body and an elegantly lobed flower-shaped rim, wider than tall. Pale jade grey-green glaze, visibly low profile and distinct from a deep food bowl. Empty; no brush, water, flowers, decoration, or painted motif.

### vessel-vase-v1.webp

A single Song dynasty ceramic vase with a graceful tall pear-shaped body, slender neck, small flared open lip and low foot ring. Smooth pale celadon glaze with quiet ivory highlights; no handles, decoration or painted motif. It must read unmistakably as a tall vase.

### vessel-censer-v1.webp

A single Song dynasty ceramic incense censer: squat rounded pale celadon body raised on three short sturdy legs, two small upright loop handles at opposite sides, open broad circular mouth. No lid, no incense sticks, no smoke, no added motif. It must read unmistakably as a traditional tripod censer, not a bowl.

## Usage

`src/ui/OrderIllustration.tsx` draws one image per ceramic requirement, using a printed Shape where specified. Allowed Shape alternatives choose one illustrative representative; unrestricted Shape slots use a deterministic varied arrangement. Pictures do not assert Glaze, Decoration, matching relationships, or Quality. Each illustration is hidden from assistive technology and has an empty `alt`, because the adjacent rule text supplies the actual requirements.
