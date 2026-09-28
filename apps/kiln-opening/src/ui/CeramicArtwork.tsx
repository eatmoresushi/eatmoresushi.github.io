import { useId } from "react";
import type { Decoration, Glaze, Shape } from "../game";
import bowl_plain from "../../assets/current_v04/ceramics/ceramic-bowl-plain-v1.webp";
import bowl_carved from "../../assets/current_v04/ceramics/ceramic-bowl-carved-v1.webp";
import bowl_impressed from "../../assets/current_v04/ceramics/ceramic-bowl-impressed-v1.webp";
import bowl_painted from "../../assets/current_v04/ceramics/ceramic-bowl-painted-v1.webp";
import plate_plain from "../../assets/current_v04/ceramics/ceramic-plate-plain-v1.webp";
import plate_carved from "../../assets/current_v04/ceramics/ceramic-plate-carved-v1.webp";
import plate_impressed from "../../assets/current_v04/ceramics/ceramic-plate-impressed-v1.webp";
import plate_painted from "../../assets/current_v04/ceramics/ceramic-plate-painted-v1.webp";
import washer_plain from "../../assets/current_v04/ceramics/ceramic-washer-plain-v1.webp";
import washer_carved from "../../assets/current_v04/ceramics/ceramic-washer-carved-v1.webp";
import washer_impressed from "../../assets/current_v04/ceramics/ceramic-washer-impressed-v1.webp";
import washer_painted from "../../assets/current_v04/ceramics/ceramic-washer-painted-v1.webp";
import vase_plain from "../../assets/current_v04/ceramics/ceramic-vase-plain-v1.webp";
import vase_carved from "../../assets/current_v04/ceramics/ceramic-vase-carved-v1.webp";
import vase_impressed from "../../assets/current_v04/ceramics/ceramic-vase-impressed-v1.webp";
import vase_painted from "../../assets/current_v04/ceramics/ceramic-vase-painted-v1.webp";
import censer_plain from "../../assets/current_v04/ceramics/ceramic-censer-plain-v1.webp";
import censer_carved from "../../assets/current_v04/ceramics/ceramic-censer-carved-v1.webp";
import censer_impressed from "../../assets/current_v04/ceramics/ceramic-censer-impressed-v1.webp";
import censer_painted from "../../assets/current_v04/ceramics/ceramic-censer-painted-v1.webp";
import crackleArtwork from "../../assets/current_v04/ceramics/ceramic-crackle-overlay-v1.webp";

export const CERAMIC_ARTWORK: Record<Shape, Record<Decoration, string>> = {
  bowl: { plain: bowl_plain, carved: bowl_carved, impressed: bowl_impressed, painted: bowl_painted },
  plate: { plain: plate_plain, carved: plate_carved, impressed: plate_impressed, painted: plate_painted },
  washer: { plain: washer_plain, carved: washer_carved, impressed: washer_impressed, painted: washer_painted },
  vase: { plain: vase_plain, carved: vase_carved, impressed: vase_impressed, painted: vase_painted },
  censer: { plain: censer_plain, carved: censer_carved, impressed: censer_impressed, painted: censer_painted },
};

// Neutral generated surfaces carry the actual Decoration. A luminance mapping
// supplies the game-state Glaze while preserving their modelling and alpha.
const GLAZE_COLOURS: Record<Glaze | "raw", readonly [number, number, number]> = {
  raw: [0.72, 0.49, 0.29],
  white: [0.96, 0.93, 0.85],
  celadon: [0.57, 0.76, 0.64],
  grey_green: [0.40, 0.53, 0.46],
  moon_white: [0.65, 0.81, 0.94],
};

export function CeramicArtwork({ shape, glaze, decoration, crackle = false }: {
  shape: Shape;
  glaze: Glaze | null;
  decoration: Decoration | null;
  crackle?: boolean;
}) {
  const filterId = `ceramic-glaze-${useId().replace(/:/g, "")}`;
  const crackleMaskId = `${filterId}-crackle-mask`;
  const surface = decoration ?? "plain";
  const colour = GLAZE_COLOURS[glaze ?? "raw"];
  const matrix = [...colour.flatMap((channel) => [
    0.2126 * channel / 0.85, 0.7152 * channel / 0.85, 0.0722 * channel / 0.85, 0, 0,
  ]), 0, 0, 0, 1, 0].join(" ");
  return <svg className="kiln-ceramic-art" viewBox="0 0 384 384" aria-hidden="true" focusable="false"
    data-ceramic-art={`${shape}-${surface}`} data-glaze={glaze ?? "raw"} data-decoration={surface} data-crackle={crackle || undefined}>
    <defs>
      <filter id={filterId} colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={matrix} />
      </filter>
      {crackle && <mask id={crackleMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width="384" height="384" style={{ maskType: "alpha" }}>
        <image href={CERAMIC_ARTWORK[shape][surface]} width="384" height="384" />
      </mask>}
    </defs>
    <image href={CERAMIC_ARTWORK[shape][surface]} width="384" height="384" filter={`url(#${filterId})`} />
    {/* Ge's permanent property overlays the actual finish; it never substitutes it. */}
    {crackle && <g className="kiln-ceramic-crackle-overlay" mask={`url(#${crackleMaskId})`} opacity="0.8" style={{ mixBlendMode: "multiply" }}>
      <image href={crackleArtwork} width="384" height="384" />
    </g>}
  </svg>;
}
