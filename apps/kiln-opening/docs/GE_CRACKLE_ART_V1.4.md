# Ge Crackle overlay — v1.4

Generated with the built-in image generation tool on 2026-09-27.

- Delivered asset: `assets/current_v04/ceramics/ceramic-crackle-overlay-v1.webp`
- Original transparent PNG: `/Users/luyuan/.codex/generated_images/01a0dcc5-5096-7330-aab8-c68c76ed05f0/exec-0c53002d-7850-46db-b4bd-fd1e74c85a21.png`
- Conversion: `cwebp -q 90 -alpha_q 100 -resize 384 384`, preserving generated alpha.

The shared ceramic renderer clips this independent texture to the exact alpha silhouette of the current Shape/Decoration artwork. Crackle is drawn after the Glaze colour mapping, over the original surface at 80% opacity using multiply blending. It does not change the ceramic's Glaze, Decoration, Quality or rules. Player-colour rims and the existing Crackle reminder remain separate.

## Exact generation prompt

```text
Use case: historical-scene.
Asset type: one transparent crackle-glaze texture overlay for Song Dynasty Ge ceramic game pieces.
Create ONLY a delicate organic network of dark warm-grey hairline crackle fissures, on a genuinely transparent background. Square canvas. This will be composited on top of existing painted, carved and impressed ceramic artwork and masked to the vessel silhouette at runtime. Do not draw any vessel, glaze surface, paper, colour wash or background.
Appearance: authentic fine Ge ware crazing, natural irregular interlocking polygon cells with a few branching thinner secondary lines, softly nuanced etched edges. Medium-scale network, around 8 irregular cells across the full width so the network remains legible when the texture is reduced to 50 pixels. Main fissures about 5 pixels wide on a 1024px canvas, secondary lines 2 pixels. Restrained warm graphite-grey, no metallic gold. Fine shallow ceramic glaze crazing, not broken pottery or wide holes.
Composition: uniform continuous network spread edge to edge, no central motif, no obvious repeating grid, no symmetrical pattern, no large empty region. Every polygon interior must remain entirely transparent; only the fine line network has opacity. True alpha transparency outside the lines; absolutely no white/black/checkerboard background. No text, labels, borders, shadow, lighting gradient, objects or scenery.
```
