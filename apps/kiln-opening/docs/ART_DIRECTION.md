# ART_DIRECTION.md — Kiln Opening V0.6.3

This document preserves the visual direction from the physical prototype without requiring Codex to read obsolete rule text from older images.

## Overall visual language

- Song-dynasty-inspired rather than museum-reconstruction literalism.
- Warm parchment / ivory background.
- Deep teal as the main structural colour.
- Muted celadon greens, imperial blue, warm ivory, crackle grey-green and Jun blue-purple as kiln-specific accents.
- Restrained gold/brass for Imperial elements, Coins and important borders.
- Fine geometric Chinese corner ornaments and cloud motifs.
- Light ink-wash mountains, workshops, kilns and ceramic silhouettes as low-contrast background art.
- Elegant serif English typography paired with readable Chinese names.
- Functional Euro-game hierarchy: headings and numbers must remain clearer than decoration.

## Component families

### Market Orders

- Teal identity.
- Requirements on the left/top-left.
- VP and Coins visually prominent on the right/top-right.
- Stable card ID such as M01.

### Imperial Orders

- Gold/ochre identity.
- Similar layout to Market Orders so players can compare quickly.
- Print the Imperial Progress reward prominently: +1 on I01–I05 and +2 on I06–I10. Multiple Imperial completions in one round may all advance Progress.

### Vessels

- Large ceramic illustration.
- Shape name prominent.
- Digital version should show current Glaze, Decoration, Quality and lifecycle state as live UI rather than writable fields.

### Fire

- -1: cool/wind visual language.
- 0: neutral kiln visual language.
- +1: warm flame visual language.

### Wood Contribution

- Large 0/1/2/3 value.
- Player-colour identity.
- Values remain hidden until simultaneous reveal.

### Craft Techniques

- Forming: earthy olive / clay accent.
- Glazing: celadon/teal-blue accent.
- Firing: rust / kiln-fire accent.
- English and Chinese Technique names.
- English ability text.
- Cost visible near title/discipline.

### Kiln Player Boards

Each tradition should have its own ceramic hero art and accent while retaining the same layout.

- Ru / 汝窑: pale celadon, quiet/refined.
- Guan / 官窑: imperial/courtly blue-green.
- Ge / 哥窑: crackle network motif.
- Ding / 定窑: ivory-white carved ware.
- Jun / 钧窑: blue-purple transmutation/flambé glaze.

Digital player panels should prominently show current resources, available/locked workers, owned Techniques, ceramics and the exact current ability from `data/kilns.json`.

## Central board

The central board should visually prioritise:

1. six worker-placement locations;
2. the Shared Kiln;
3. occupancy/capacity information;
4. readable Apprentice vs Shifu effects.

Do not visually resurrect removed production stages merely for historical realism.

The current six locations are defined only by `data/action_locations.json`.

## Digital implementation

Use raster references for mood and ceramic illustrations, not as a source of rules text.

Prefer:

- SVG/CSS frames;
- live HTML text from JSON;
- reusable card components;
- responsive scalable icons;
- high-resolution pottery art cropped independently from text-heavy print sheets when suitable.

This keeps future balance/rules changes from requiring regeneration of every text-bearing image.
