# Illustrated Order cards and Tech tiles

Generated with the built-in `image_gen` tool on 2026-09-26 for the shared printed-card UI. The owner’s reference images guide the visual layout only. All names, rules, costs, quality requirements and rewards remain localized HTML derived from v1.4 data.

## Assets

- `tech-ST01-v1.webp`–`tech-ST04-v1.webp`: four unique Starting Tech illustrations.
- `tech-T01-v1.webp`–`tech-T15-v1.webp`: fifteen unique Advanced Tech illustrations.
- `vessel-bowl-v1.webp`, `vessel-plate-v1.webp`, `vessel-brush-washer-v1.webp`, `vessel-vase-v1.webp`, `vessel-censer-v1.webp`: five transparent ceramic illustrations used on Order cards.

Tech illustrations are 640 pixels wide. Ceramic illustrations are 640 × 640 pixels with transparency. WebP delivery copies reduce download size. The application draws ornamental frames, titles, category plaques, requirements and rewards around the artwork rather than baking text into images.

## Prompts and integration

- [Tech prompts](TECH_ART_PROMPTS.md) record the common style and each of the 19 subjects.
- [Order prompts](ORDER_ART_PROMPTS.md) record the five ceramic subjects and selection rules.
- `src/ui/techniqueArtwork.ts` maps stable Tech IDs to their illustrations.
- `src/ui/OrderIllustration.tsx` shows one ceramic per requirement, matching explicit Shapes or choosing a representative allowed Shape. Glaze, Decoration and Quality remain defined by the adjacent rule text.
- `src/ui/PieceFaces.tsx` and `src/ui/illustrated-pieces.css` provide the same face across setup, the board, selection controls, workshops and inspection dialogs.

All artwork is decorative and hidden from assistive technology; readable localized rule text supplies the card information. Pointer hover is inert. Keyboard focus and click inspection remain available.
