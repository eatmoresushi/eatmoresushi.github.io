# ART_DIRECTION.md — Kiln Opening V1.2.6

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

### Starting Orders

- A distinct opening-deck identity.
- Requirements on the left/top-left.
- VP and Coins visually prominent on the right/top-right.
- Stable card ID such as S01.

### Main Orders

- One coherent public/reservable deck identity with stable IDs O01–O48.
- Requirements, minimum Quality, VP, Coins and 0–3 Crowns must be directly comparable across the five-card display.
- Crown-bearing cards may use restrained gold/ochre emphasis, but must not look like a separate deck or imply a separate Imperial Order action.

### Vessels

- Large ceramic illustration.
- Shape name prominent.
- Digital version should show current Glaze, Decoration, Quality and lifecycle state as live UI rather than writable fields.

### Fire

- -2: strongest cool/wind visual language.
- -1: restrained cool/wind visual language.
- 0: neutral kiln visual language.
- +1: restrained warm flame visual language.
- +2: strongest flame/heat visual language.

### Kiln Contribution

- Clear Bank the Fire (−1), Tend the Fire (0), and Stoke the Fire (+1) identity.
- Player-colour identity.
- Choices and any Fuel Ledger upgrade remain hidden until simultaneous reveal.

### Starting and Advanced Techs

- Forming: earthy olive / clay accent.
- Glazing: celadon/teal-blue accent.
- Firing: rust / kiln-fire accent.
- English and Chinese Tech names.
- English ability text.
- Cost visible near title/discipline.

### Kiln Player Boards

Each tradition should have its own ceramic hero art and accent while retaining the same layout.

- Ru / 汝窑: pale celadon, quiet/refined.
- Guan / 官窑: imperial/courtly blue-green.
- Ge / 哥窑: crackle network motif.
- Ding / 定窑: ivory-white carved ware.
- Jun / 钧窑: blue-purple transmutation/flambé glaze.

Digital player panels should prominently show current resources, available/placed workers, owned Techs, ceramics and the exact current ability from `data/kilns.json`. Do not show private workshop worker spaces or Tech-based location unlocks.

## Central board

The central board should visually prioritise:

1. seven shared worker-placement locations;
2. the Shared Kiln;
3. occupancy/capacity information;
4. readable Apprentice vs Shifu effects.

Do not visually resurrect removed production stages merely for historical realism.

The current seven locations are defined only by `data/action_locations.json`. Materials Yard, Potter's Wheel, Glaze & Decoration, Commission Market, and Guild & Academy show 2 / 3 / 4 global spaces by player count; Kiln Yard and Labour are uncapped. The visual grammar must allow one or more Shifu to overfill a location without implying extra printed spaces.

## Digital implementation

Use raster references for mood and ceramic illustrations, not as a source of rules text.

Prefer:

- SVG/CSS frames;
- live HTML text from JSON;
- reusable card components;
- responsive scalable icons;
- high-resolution pottery art cropped independently from text-heavy print sheets when suitable.

This keeps future balance/rules changes from requiring regeneration of every text-bearing image.
