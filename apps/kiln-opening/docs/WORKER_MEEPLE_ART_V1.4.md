# Generated worker meeples — 2026-09-27

Generated with the built-in `image_gen` tool. The user supplied the simple red meeple as a silhouette/style reference. Rules and localized worker labels remain in code.

## Assets

| Role | Workspace asset | Built-in source |
| --- | --- | --- |
| Apprentice | `assets/current_v04/workers/apprentice-wood-v1.webp` | `/Users/luyuan/.codex/generated_images/01a0e2ce-70aa-7e43-889a-e2c3a4427d17/exec-40e28633-5c61-41c6-9962-c3a4cd5c768a.png` |
| Shifu | `assets/current_v04/workers/shifu-wood-v1.webp` | `/Users/luyuan/.codex/generated_images/01a0e2ce-70aa-7e43-889a-e2c3a4427d17/exec-916fd6db-ee26-40bd-ab07-f20b4675bbe7.png` |

Both generated originals were inspected: complete upright pieces, distinct outlines, physical wood bevel, no letters, genuine transparent alpha. Each source is 1254 × 1254. Production WebP copies are 256 × 256, converted with `cwebp -q 90 -alpha_q 100 -resize 256 256`; no redesign or background removal was performed.

The shared `WorkerMeeple` renders a generated alpha mask filled with the existing player colour and multiplies the desaturated source onto it to retain bevel/grain. This supports all four player colours and neutral action reminders consistently without independent colour variants. The Shifu has a broad cap and robe sleeves; the Apprentice has the classic round head and outstretched arms. The wrapper retains localized accessible names, player/worker attributes, sizing classes and interaction behaviour.

## Apprentice prompt

```text
Use case: product-mockup.
Asset type: transparent PNG sprite for a board-game UI, a single Apprentice wooden meeple, intended to remain clear at 24–44 pixels high.
Primary request: classic physical board-game meeple silhouette, with a simple round head joined to broad sloping outstretched arms, tapered trunk and two wide feet with an unmistakable triangular leg gap. Similar to a classic simple red board-game pawn, but neutral ivory-white painted wood so the game can tint it to each player's color.
Composition: ONE isolated piece, straight-on front view, upright, perfectly centered, fills 90% of the square canvas; include entire silhouette, no cropping. The face is almost planar, with just a narrow shallow 3D thickness visible along the right and lower edges.
Material and lighting: softly painted ivory wood with extremely subtle natural grain, restrained bevel at the outside edge, soft light from upper left. Clean broad readable surfaces. Neutral grayscale/ivory only.
Background: genuinely transparent alpha all around the object, including the gap between the feet; no floor, no ground shadow, no checkerboard, no scenery, no card, no base, no circle.
Constraints: no face, no clothes drawn on it, no hat, no text, no letters, no symbols, no accessories, no outline strokes. It must read as a cut wooden tabletop board-game meeple, not a person or statuette.
```

## Shifu prompt

```text
Use case: product-mockup.
Asset type: transparent PNG sprite for a board-game UI, ONE Shifu master-potter wooden meeple, intended to remain clear at 24–44 pixels high.
Primary request: a distinct Shifu cut-wood board-game meeple. Its connected silhouette combines a squat traditional Song-era scholar/master cap with a flat broad horizontal brim and low rectangular raised crown, a round head below, broad angular robe sleeves extending to both sides, and a wide robed body ending in two separated broad feet with a triangular gap. The hat must give an immediately different outline from a classic round-headed apprentice meeple. Simple recognizable token, not a human illustration.
Composition: ONE isolated piece, straight-on front view, upright, symmetrical, perfectly centered, fills 90% of square canvas, entire silhouette visible. Face almost planar with a narrow shallow 3D thickness visible along right and lower edge.
Materials: neutral ivory-white painted wood, extremely subtle grain and restrained outer bevel. Soft studio light upper left. Clean broad readable surfaces, no intricate details. Neutral grayscale/ivory only so the game can tint this meeple accurately to each player's color.
Background: genuinely transparent alpha all around the object and through the gap between the feet. No floor, no ground shadow, no scenery, no checkerboard, no card, no base, no circle.
Constraints: no facial features, no clothing drawing, no text, no letters, no symbols, no staff or tool, no outline strokes. It must look like a solid wooden tabletop board-game meeple with an integrated master hat, not a statue, person, chess piece or circular badge.
```
