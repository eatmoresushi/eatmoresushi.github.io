# Archived Order and Tech illustrations

These images were generated with the built-in `image_gen` tool for earlier versions of the shared printed-card UI and remain as artwork history. Current Tech tiles are text-only. Current Order cards use the shared ceramic assets in `../ceramics/`, matching their Shape, Glaze and Decoration requirements. All names, rules, costs, quality requirements and rewards remain localized HTML derived from current V1.4 data and approved owner amendments; historical artwork does not define gameplay.

## Assets

- `tech-ST01-v2.webp`–`tech-ST04-v2.webp`: four historical Starting Tech illustrations, 960 × 640 pixels.
- `tech-T01-v2.webp`–`tech-T05-v2.webp`: five historical Forming Tech illustrations, 960 × 640 pixels; T03 predates Dipping Vats.
- `tech-T06-v2.webp`–`tech-T15-v2.webp`: ten historical Glazing and Firing Tech illustrations, 640 × 427 pixels.
- `vessel-bowl-v1.webp`, `vessel-plate-v1.webp`, `vessel-brush-washer-v1.webp`, `vessel-vase-v1.webp`, `vessel-censer-v1.webp`: five earlier transparent Order-card ceramic illustrations.

All 19 v2 Tech illustrations have genuine alpha transparency and depict isolated pottery or tools without a background scene, printed text or frame. Their existing delivery dimensions are retained. Earlier `tech-*-v1.webp` illustrations also remain in this directory as history. The earlier Order ceramic illustrations remain 640 × 640 pixels with transparency.

WebP delivery copies reduce download size. The application draws ornamental frames, titles, category plaques, requirements and rewards around the artwork rather than baking text into images.

## Prompts and integration

- [V2 Tech prompts and provenance](TECH_ART_V2_PROMPTS.md) preserve the exact prompts for all 19 v2 illustrations, the built-in tool mode, style reference paths, generated source paths and delivery dimensions.
- [Historical Tech prompts](TECH_ART_PROMPTS.md) record the earlier v1 illustrations.
- [Order prompts](ORDER_ART_PROMPTS.md) record the five ceramic subjects and selection rules.
- `src/ui/techniqueArtwork.ts` retains the historical Tech mapping; current tile faces do not import it.
- `src/ui/OrderIllustration.tsx` now uses `CeramicArtwork` to show one valid combination of Shapes, Glazes and Decorations for each Order. Adjacent rule text retains every allowed alternative and the Quality requirements.
- `src/ui/PieceFaces.tsx` and `src/ui/illustrated-pieces.css` provide the same face across setup, the board, selection controls, workshops and inspection dialogs.

All artwork is decorative and hidden from assistive technology; readable localized rule text supplies the card information. Pointer hover is inert. Keyboard focus and click inspection remain available.
