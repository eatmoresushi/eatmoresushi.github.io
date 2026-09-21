# Illustrated pottery district

Original scenery generated with the built-in image generation tool on 2026-09-20. Both current treatments show eight distinct activity settings connected by paths, streams and planting. The owner-selected ink treatment is the default; the painted treatment remains available in the local art study. Action-space surfaces are transparent so the village artwork remains visible. No game rules, labels, capacities, workers or playable ceramics are baked into these backgrounds.

## Files

- `recognition-cylinders-v2.webp` — transparent sprite sheet of four tall painted wooden player markers.
- `pottery-village-ink.webp` — current default: varied open-air activity settings and the enlarged integrated kiln.
- `pottery-village-painted.webp` — current alternate painted treatment of the same village.
- `pottery-district-ink-kiln-large.webp` — previous enlarged-kiln study with eight enclosed courtyards, retained as provenance.
- `pottery-district-painted-kiln-large.webp` — painted version of the previous enlarged-kiln study.
- `pottery-district-ink-kiln.webp` — previous integrated ink kiln study, retained as provenance.
- `pottery-district-painted-kiln.webp` — previous integrated painted kiln study, retained as provenance.
- `pottery-district-painted.webp` — original gouache study before the integrated kiln.
- `pottery-district-ink.webp` — original ink study before the integrated kiln.
- `shared-kiln.webp` — WebP quality 88 conversion of the existing approved `../shared_kiln_owner_reference.png`, at its original dimensions. No visual redesign.
- `shared-kiln-cutout.webp` — retained intermediate study, no longer used in the live board; transparent cutout edited with the built-in image generation tool on 2026-09-20. The printed title, seal, parchment surround and decorative frame are removed; the stonework, fire, zone labels and placement boxes remain. 1055 × 1491, WebP quality 88 with lossless alpha. Original generated PNG: `/Users/luyuan/.codex/generated_images/01a0bdef-fccd-7173-9388-962a061f93f7/exec-dac5fd61-16b7-4a0b-9e91-f811f6504f34.png`.

All landscape backgrounds are 1536 × 1024. Generated PNGs were converted to WebP at quality 87 with `cwebp`, without compositional edits. The current board paints the kiln into the same scenery as all eight action spaces. Three localized zone labels and seven outlined spaces are live DOM overlays: Low 2, Middle 2, High 3. Capacity locks and occupied ceramics come from game state. The kiln stays Low at the top and High above the firebox at the bottom.

Desktop displays the full continuous image. The round track and Fire deck discard area sit above the kiln, replacing its Base Heat / Last Fire header. The lower scenic strip contains five connected transparent rectangular Imperial Recognition spaces with shared borders. Tall image-generated wooden cylinders in the four player colours sit above the live reward labels. Up to four pieces fit side by side without covering the printed rank. Unclaimed Imperial Priority tokens remain distinct in space 3. Marker asset and generation prompt are documented in `recognition-markers.md`. The former board heading and separate Recognition row are removed. Compact layouts scale the entire board and turn-order rail together from a 1200px minimum layout, preserving all eight locations, kiln spaces, and tracks in place. A ResizeObserver fits the board to its container and reserves its scaled height. The surrounding player dock, six-card Order market, Tech market, and workshop reflow independently; action dialogs and portaled previews remain at readable screen size. No per-location artwork crops are used; the saved source images remain intact. The enlarged kiln has larger live spaces, with no firing reminder or occupancy footer.

## Varied village composition

The eight live action hit areas retain their equal size and ordering. Scenery provides distinct identities without repeating enclosed houses: Materials Yard is a clay and timber stockyard; Potter's Wheel has an open circular shelter; Glaze & Decoration is a roofless terrace with worktables and a wash pool; Kiln Yard has staging racks and a loading ramp; Commission Market is an open square with freestanding stalls and cloth awnings; Guild & Academy is a bamboo garden and small pavilion; Labour is a riverside clearing with sawhorses and a landing; Court Patronage uses a ceremonial gateway and broad steps. No mechanical changes.

Current ink source: `/Users/luyuan/.codex/generated_images/01a0bdef-fccd-7173-9388-962a061f93f7/exec-e63d6a3d-c074-44fd-8663-b39cd714e687.png`.

Current painted source: `/Users/luyuan/.codex/generated_images/01a0bdef-fccd-7173-9388-962a061f93f7/exec-9e692c19-3d87-444f-95ca-662763b532f0.png`.

## Varied ink village edit prompt

```text
Use case: precise-object-edit
Asset type: final text-free ink-and-mineral-wash background for a playable browser Euro board game, 1536x1024.
Edit target: provided complete pottery district with large three-chamber kiln on right.
Primary request: creatively redesign the LEFT 64% as an organic Song Dynasty pottery village with EIGHT VISUALLY DISTINCT activity locations. Currently all eight look like identical rectangular walled houses; eliminate that repetition. Make a connected landscape of open-air places, different silhouettes, materials, and landforms, not eight enclosed compounds.
KEEP THE ENTIRE RIGHT 36% (x64–100%) EXACTLY UNCHANGED: large kiln, its scale and position, roof, chimney, all three empty chamber openings, two shelves, firebox, river and landscaping. Those are registered to live UI. Keep image dimensions, viewpoint and framing unchanged.
The left can be substantially redesigned and paths/props freely rearranged. The eight location identities stay approximately in these two-column/four-band regions so live text aligns:
1 Materials Yard, x0–32%, y0–22%: an OPEN clay excavation and timber stockyard, pale clay banks, exposed clay mound, logs stacked in irregular piles, baskets, split firewood and a handcart. No enclosing house, no courtyard wall. Natural hillside edge and a small flowing water channel.
2 Potter's Wheel, x32–64%, y0–22%: a distinctive OPEN-SIDED circular or shallow fan-shaped timber working shelter with only a light partial roof; clearly visible pottery wheels, unfired pots and benches. Not another rectangular front-facing house. Broad light stone apron.
3 Glaze & Decoration, x0–32%, y22–44%: completely ROOFLESS sunlit glazing terrace, several worktables with shallow bowls of mineral pigments, large dipping jars, neat drying boards and a little wash pool. Small flowering tree, hints of celadon and mineral blue. No building enclosing it.
4 Kiln Yard, x32–64%, y22–44%: an OPEN practical loading ramp and staging area leading toward the main kiln, staggered racks of glazed vessels, a low cart, baskets, a woodpile; gravel and pale stone steps. No separate house or extra kiln.
5 Commission Market, x0–32%, y44–66%: an OPEN-AIR market square, irregularly arranged small freestanding ceramic display stalls and low tables, two loose cream and faded terracotta CLOTH canopies, baskets and rolled commission scrolls. No tiled-roof building, no enclosing walls or rectangular courtyard. Stalls cluster at the edges of an open curving pedestrian route. Clear market identity.
6 Guild & Academy, x32–64%, y44–66%: a quiet scholars' bamboo garden, SMALL hexagonal open pavilion off-center with curved eaves, stone scholarly desk with scrolls and brushes, stone seats, rocks, and a pond edge. Distinct intimate garden character, not a house.
7 Labour, x0–32%, y66–90%: a broad ROOFLESS riverside working clearing, simple rough earth and patches of pale grass, timber sawhorses, handcart, coiled rope and carrying poles, a few cut stones and bundles, small wooden landing at the water. NO building, stall, canopy or enclosing wall. Big open outdoor feel.
8 Court Patronage, x32–64%, y66–90%: dignified OPEN ceremonial stone approach, broad shallow steps to a modest raised dais, a sculptural red wooden ceremonial gateway rather than a house, bronze incense vessel and two slender banners with NO markings, one elegant pine. Pale formal stone contrasts with Labour's earthy clearing.
One continuous, believable elevated oblique landscape. Replace the repeated straight grid roads, courtyard walls and doorways with softly winding connected paths, planting, a shared creek and subtle changes in terrain. No hard cell boundaries. Eight places should look unmistakably different even without labels. No more than two small tiled roofs in the LEFT area. At least four locations completely open to sky.
Within each region put most identifying props toward its upper/back and side edges; preserve broad quiet light ground through the centre/front so dark live descriptions and worker markers remain readable. The art is decorative scenery behind transparent UI. Avoid dense dark detail across every region.
Preserve the source's refined Chinese ink linework, delicate mineral-pigment washes, airy warm ivory ground, celadon foliage, weathered stone, restrained ochre and tiny cinnabar accents. Detailed premium historical physical board-game illustration. Calm soft daylight. Match the unedited kiln perfectly.
Absolutely no text, writing, characters, numbers, labels, symbols, signs, game UI, frames, slot outlines, dashed borders, tokens, watermark or modern objects. Do not add pottery inside the three kiln chambers.
```

## Varied painted village edit prompt

```text
Use case: style-transfer
Asset type: alternate painted treatment of a final browser game-board background, 1536x1024.
Edit target: provided ink-and-mineral-wash pottery village with eight distinct open activity places and a large integrated three-chamber kiln.
Apply only a richer warm gouache/mineral-pigment finish. Preserve EXACT geometry and framing: the open clay/log stockyard at upper left, circular open potter shelter upper middle, outdoor glazing tables and pool second left, loading ramp and racks second middle, scattered open market stalls third left, hexagonal scholar garden pavilion third middle, roofless riverside labour clearing lower left, ceremonial gateway and steps lower middle, all paths, creeks, vegetation, and the large kiln on the RIGHT. Keep kiln's three chamber openings, two shelves and firebox pixel aligned with this reference. Do not move, resize, crop or add anything.
Palette: warmer late-afternoon parchment ochre, forest-green and celadon foliage, terracotta market cloth, restrained cinnabar accents, luminous painted depth. Still elegant historical Chinese board-game art, not cartoon or photorealistic. Keep activity clearings pale enough for dark UI text.
Keep the varied open-air identities. Do not enclose the spaces, add perimeter walls, or turn them into houses. No additional buildings, roofs, walls, banners or people.
No text, letters, numbers, symbols, writing, seals, frames, game markings, circles, slots, tokens or watermark. Kiln chambers stay empty.
```

## Enlarged ink kiln edit prompt

```text
Use case: precise-object-edit
Asset type: continuous background for a browser board game, 1536x1024.
Edit target: the provided integrated ink landscape board.
Primary request: ENLARGE the existing kiln on the RIGHT so it uses almost all of its available precinct, especially the large unused area below its firebox. Keep the LEFT 64% (all eight action courtyards, paths, roofs, art, paving and original geometry) unchanged. Do not zoom/crop the full image.
Enlarge ONLY the same right-hand kiln, preserving its recognizable existing stone, roof, open 3-chamber architecture, chimney and softly painted ink/mineral-wash style. New kiln envelope should fill x=65.5% to98.5% of canvas and from y=7% to96%. Extend the firebox/base DOWN into the currently empty lower-right garden/pathway so there is no large blank footer area. Remove/rearrange the little side shed and some garden within the right precinct as needed; blend organically at its boundaries, still one illustration.
The 3 EMPTY front-facing firing chambers should be wide and tall, occupying most of this enlarged facade: cool upper usable interior roughly x70–94%, y24–42%; neutral middle x69–96%, y47–63%; warm lower x68–97%, y67–82%; firebox and glowing logs BELOW them at y85–94%. Keep stone shelves between upper/middle and middle/lower. Keep upper chimney modest so the chambers, not roof, occupy the area. No objects or pottery inside the chambers. Do not add a fourth shelf.
Keep the precise painting style and restrained light palette of the source, with gentle warm glow only at the lower chamber/firebox. Stone edges and wider openings should remain readable. Preserve the ink village as one whole board, with no pasted-image/card boundary. No detached cutout.
Absolutely NO game text, title, labels, letters, numbers, symbols, player counts, dashed borders, ceramic tokens or slot rectangles. Game zones and seven placement spaces are drawn by live UI. No watermark.
```

## Enlarged painted treatment prompt

```text
Use case: style-transfer
Asset type: alternate painted-background treatment for the same live browser board game, 1536x1024.
Edit target: the provided complete ink landscape pottery game board with an enlarged three-chamber kiln on the right.
Create a slightly richer gouache/mineral-pigment painted version of this EXACT illustration. Preserve ALL geometry precisely: eight courtyards on the left, every building, path, river, tree, wall; right kiln outer silhouette, all THREE chamber openings, TWO shelf positions, lower firebox and the location/size of each object. Keep the same framing. Do not crop or move anything. Live game slots must align at the same coordinates in both art treatments.
Change ONLY painting finish/palette: warmer late afternoon parchment/ochre, forest green foliage and muted celadon, tiny cinnabar accents, nuanced hand-painted gouache depth. Premium historical board-game art, original Song Dynasty ceramic workshop village. Keep paving and kiln chamber interiors calm, light enough for dark live overlay labels. Warm fire only beneath the lowest chamber.
No letters, numbers, text, symbols, seals, game markings, slots, circles, rectangles or card frames. Do not add any ceramic pieces inside the three chambers. Still one seamless full-board landscape.
```

## Integrated ink kiln edit prompt

```text
Use case: precise-object-edit
Asset type: one continuous background illustration for a playable online Euro board game, 1536 by 1024 landscape, same composition and aspect ratio as input.
Edit target: the provided pale Chinese ink-and-mineral-wash pottery district.
Primary request: paint a shared pottery kiln INTO the empty precinct on the RIGHT 36 percent of this landscape so it is all ONE coherent original board illustration. Preserve the entire LEFT 64 percent, all eight action courtyards, paths, buildings, details, paving, scale and positions as faithfully as possible. Do not move, crop, zoom, replace or redesign any of those eight courtyards.
Right precinct: replace the large empty grassy area with a tall, front-open stone pottery kiln, centered at x83 percent. Integrate its base, stonework, surrounding pots, stacked wood, footpath and rising smoke with the existing precinct and landscape. Follow the same refined ink outlines, muted grey stone, celadon/mineral washes, warm ivory paper and soft lighting as the rest of the image. NOT a separate pasted glossy card or realistic dark cutout. Keep surrounding pine, wall, paths and river connected.
The kiln is a legible architectural cutaway with THREE vertically stacked EMPTY firing chambers, all front-facing, behind a wide arched stone facade: cool upper, neutral middle, warmer lower. Two horizontal stone shelves separate the chambers. Fire burns in a small firebox BELOW the lowest chamber, visibly near the bottom, not in the middle. Leave the three chamber interiors open and uncluttered for live ceramic tokens and labels to be overlaid by the app.
Layout targets (percent of full canvas): physical kiln outline roughly x67–98, y8–90; upper chamber empty usable area x73–93, y16–32; middle chamber x71–95, y38–54; lower chamber x69–96, y60–76; shelves around y34–36 and y56–58; firebox y79–88. Keep chambers big enough for two, two, and three live square spaces respectively. DO NOT DRAW those spaces, rectangles, slots, tokens or game UI. No ceramics inside the chambers.
The kiln belongs to the same illustrated world, with softer slightly lighter ink detail than the previous standalone photograph-like cutout, clear broad silhouette, quiet chamber textures, subtle warm hearth glow, irregular grounded base. No hard rectangular image boundary, no title, no parchment card, no frame.
NO TEXT ANYWHERE: no letters, numbers, Chinese characters, labels, zone names, title, player counts, signs, seals, symbols, watermarks. No dashed boxes or game markings. The app provides every game element as live UI.
```

## Integrated painted treatment prompt

```text
Use case: style-transfer
Asset type: alternate painted-background treatment for the same live browser board game, 1536x1024.
Edit target: the provided complete ink landscape pottery game board with an integrated three-chamber kiln on the right.
Create a slightly richer gouache/mineral-pigment painted version of this EXACT illustration. Preserve ALL geometry precisely: eight courtyards on the left, every building, path, river, tree, wall; right kiln outer silhouette, all THREE chamber openings, TWO shelf positions, lower firebox and the location/size of each object. Keep the same 1536x1024 framing. Do not crop or move anything. Live game slots must align at the same coordinates in both art treatments.
Change ONLY painting finish/palette: warmer late afternoon parchment/ochre, forest green foliage and muted celadon, tiny cinnabar accents, nuanced hand-painted gouache depth. Premium historical board-game art, original Song Dynasty ceramic workshop village. Keep paving and kiln chamber interiors calm, light enough for dark live overlay labels. Warm fire only beneath the lowest chamber.
No letters, numbers, text, symbols, seals, game markings, slots, circles, rectangles or card frames. Do not add any ceramic pieces inside the three chambers. Still one seamless full-board landscape.
```

## Shared Kiln cutout edit prompt

```text
Use case: background-extraction
Asset type: transparent illustration for a live browser board game.
Edit target: the provided Shared Kiln image.
Primary request: remove the entire parchment paper background outside the physical kiln, the thin rectangular decorative border and corners, the large SHARED KILN title and its red seal. Replace all those removed areas with REAL transparent alpha, not a solid color or painted checkerboard.
Preserve the original physical kiln exactly: the large stone arch, three stone-lined shelf chambers and stone shelves, cool upper chamber, warm middle, orange hot lower chamber, firebox flames and logs at bottom, log pile, little pots and small irregular strip of ground at the foot. Preserve all interior LOW ZONE (-1), MIDDLE ZONE (0), HIGH ZONE (+1) labels, dashed placement boxes and 3p+/4p markings exactly as in the source. These are inside the kiln and must stay aligned.
Keep the kiln silhouette, size, shelf positions, shape and camera perspective in exactly the same normalized image positions; original canvas aspect ratio about 0.7075 width/height. Do not crop, zoom, stretch, move, repaint or redesign the kiln. Leave transparent headroom where the title used to be. Keep detailed edges of stones, wood and ceramic props, with natural soft antialiasing. No external rectangular shadow or opaque halo; outside the physical object is transparent. The image will be laid over a pale Chinese ink landscape, so the surroundings must really be see-through.
```

## Painted prompt

```text
Use case: historical-scene
Asset type: text-free illustrated background for a playable online Euro board game, original Song Dynasty Chinese pottery district. Wide landscape image, 1536 by 1024 composition.
Composition: elevated near-top-down oblique view, one continuous district, paths and low courtyard walls connecting buildings. LEFT 66% of image is eight small distinct workshop courtyards arranged as TWO COLUMNS and FOUR ROWS. Each cell contains its identifiable building and activity in its UPPER HALF; leave its LOWER HALF mostly softly textured light paving for live UI labels and worker tokens to be overlaid by code. Cell centers in percent: x=17,49 and y=12,37,62,87. Upper-left clay stores, stacked split wood and baskets (Materials Yard); upper-right open pottery throwing studio with wheel and vessels (Potter's Wheel). Second-row-left glazing studio with bowls of mineral pigments and drying porcelain; second-row-right kiln loading yard with wooden racks and stacked glazed ceramics. Third-row-left commission market with silk awnings, scrolls and ceramics; third-row-right scholarly guild courtyard with open books, scrolls and bamboo. Bottom-left labour yard with handcart and simple timber workbench; bottom-right formal modest imperial patronage pavilion with cinnabar columns and golden details. RIGHT 34% is a tall kiln precinct: stone boundary, mature tree, smoke wisps at upper-right, warm earth and a broad quiet dark green/ochre open vertical area where a tall separate interactive kiln illustration will be placed. Do not paint a large second kiln in this right area.
Art must feel like a SINGLE coherent, hand-illustrated physical game board, not separate square pictures or a dashboard. Small bridges, paths, vegetation, ceramic jars, low walls link the spaces; avoid busy details in paving.
No writing, no Chinese characters, no Latin text, no numbers, no logos, no watermark. No game tokens, no worker meeples, no printed card frames, no arrows, no circles, no slot outlines. No modern objects. Buildings readable at small scale. Original artwork, not a copy of any published board game. Edge-to-edge illustration with no outer frame.
Style/medium: premium tactile physical board-game illustration, finely drawn and richly hand-painted gouache, believable small Song-era timber buildings, carved stone paths, warm late afternoon light, rich but restrained forest green/celadon and parchment ochre with cinnabar accents. Painterly realistic architectural detail without photorealism, crisp readable silhouettes, luminous ceramic glazes, warm hearth glow, charming inhabited world with no large people. Quiet light paving and roofs provide strong UI contrast. High polish and nuanced depth; no neon, no mobile-game cartoon look.
```

## Ink prompt

```text
Use case: historical-scene
Asset type: text-free illustrated background for a playable online Euro board game, original Song Dynasty Chinese pottery district. Wide landscape image, 1536 by 1024 composition.
Composition: elevated near-top-down oblique view, one continuous district, paths and low courtyard walls connecting buildings. LEFT 66% of image is eight small distinct workshop courtyards arranged as TWO COLUMNS and FOUR ROWS. Each cell contains its identifiable building and activity in its UPPER HALF; leave its LOWER HALF mostly softly textured light paving for live UI labels and worker tokens to be overlaid by code. Cell centers in percent: x=17,49 and y=12,37,62,87. Upper-left clay stores, stacked split wood and baskets (Materials Yard); upper-right open pottery throwing studio with wheel and vessels (Potter's Wheel). Second-row-left glazing studio with bowls of mineral pigments and drying porcelain; second-row-right kiln loading yard with wooden racks and stacked glazed ceramics. Third-row-left commission market with silk awnings, scrolls and ceramics; third-row-right scholarly guild courtyard with open books, scrolls and bamboo. Bottom-left labour yard with handcart and simple timber workbench; bottom-right formal modest imperial patronage pavilion with cinnabar columns and golden details. RIGHT 34% is a tall kiln precinct: stone boundary, mature tree, smoke wisps at upper-right, warm earth and a broad quiet dark green/ochre open vertical area where a tall separate interactive kiln illustration will be placed. Do not paint a large second kiln in this right area.
Art must feel like a SINGLE coherent, hand-illustrated physical game board, not separate square pictures or a dashboard. Small bridges, paths, vegetation, ceramic jars, low walls link the spaces; avoid busy details in paving.
No writing, no Chinese characters, no Latin text, no numbers, no logos, no watermark. No game tokens, no worker meeples, no printed card frames, no arrows, no circles, no slot outlines. No modern objects. Buildings readable at small scale. Original artwork, not a copy of any published board game. Edge-to-edge illustration with no outer frame.
Style/medium: elegant Chinese landscape album painting interpreted as readable game-board art, ink outlines and delicate mineral pigment washes on ivory rice paper, light airy warm cream composition, soft celadon, pine green, weathered gray tile roofs, pale ochre earth and tiny cinnabar accents. Fine architectural brushwork, restrained detail, soft mist at outer borders, small bamboo clumps and pine branches. Gentle morning light, calm artisan atmosphere. Courtyard paving stays mostly pale and uncluttered. No saturated cartoon shading, no photorealism.
```
