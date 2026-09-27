# Illustrated Order cards and Tech tiles

Generated with the built-in `image_gen` tool for the shared printed-card UI. The current Tech art was replaced on 2026-09-27 with 19 transparent watercolor still lifes, following the owner’s attached illustrations as style references only. All names, rules, costs, quality requirements and rewards remain localized HTML derived from current v1.4 data and approved owner amendments; text printed on the older reference sheets does not define gameplay.

## Assets

- `tech-ST01-v2.webp`–`tech-ST04-v2.webp`: four current Starting Tech illustrations, 960 × 640 pixels.
- `tech-T01-v2.webp`–`tech-T05-v2.webp`: five current Forming Tech illustrations, 960 × 640 pixels.
- `tech-T06-v2.webp`–`tech-T15-v2.webp`: ten current Glazing and Firing Tech illustrations, 640 × 427 pixels.
- `vessel-bowl-v1.webp`, `vessel-plate-v1.webp`, `vessel-brush-washer-v1.webp`, `vessel-vase-v1.webp`, `vessel-censer-v1.webp`: five transparent ceramic illustrations used on Order cards.

All 19 current Tech illustrations have genuine alpha transparency and depict isolated pottery or tools without a background scene, printed text or frame. Their existing delivery dimensions are retained. Earlier `tech-*-v1.webp` illustrations remain in this directory as history. Order ceramic illustrations remain 640 × 640 pixels with transparency.

WebP delivery copies reduce download size. The application draws ornamental frames, titles, category plaques, requirements and rewards around the artwork rather than baking text into images.

## Prompts and integration

- [Current Tech prompts and provenance](TECH_ART_V2_PROMPTS.md) preserve the exact final prompts for all 19 v2 illustrations, the built-in tool mode, style reference paths, generated source paths and delivery dimensions.
- [Historical Tech prompts](TECH_ART_PROMPTS.md) record the earlier v1 illustrations.
- [Order prompts](ORDER_ART_PROMPTS.md) record the five ceramic subjects and selection rules.
- `src/ui/techniqueArtwork.ts` maps stable Tech IDs to their illustrations.
- `src/ui/OrderIllustration.tsx` shows one ceramic per requirement, matching explicit Shapes or choosing a representative allowed Shape. Glaze, Decoration and Quality remain defined by the adjacent rule text.
- `src/ui/PieceFaces.tsx` and `src/ui/illustrated-pieces.css` provide the same face across setup, the board, selection controls, workshops and inspection dialogs.

All artwork is decorative and hidden from assistive technology; readable localized rule text supplies the card information. Pointer hover is inert. Keyboard focus and click inspection remain available.
