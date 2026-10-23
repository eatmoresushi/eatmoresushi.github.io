/**
 * CeramicArt (pieces, §7.4; wireframe `.cer` / `cerArt`). Replaces V1.4 `CeramicArtwork` (one SVG
 * filter per instance, fixed RGB per Glaze).
 *
 * The neutral cutout for the Shape and Decoration is drawn, then the Glaze tint
 * (`--glz-<glaze>`, theme-aware; `--glz-clay` when unglazed) is multiplied through the same
 * mask. A Crackle ceramic adds the masked crackle overlay over its actual finish: Crackle never
 * replaces the Glaze or the Decoration.
 *
 * The image is decorative (`aria-hidden`): the ceramic's words come from `ceramicLabel` on the
 * surrounding chip or button.
 */
import type { CSSProperties } from "react";
import type { Decoration, Glaze, Shape } from "../../game/index.ts";
import { cssUrl, useArt } from "./art.ts";
import "./CeramicArt.css";

export interface CeramicArtProps {
  shape: Shape;
  decoration: Decoration;
  /** Null or absent while Shaped (unglazed). */
  glaze?: Glaze | null;
  crackle?: boolean;
  /** Edge length in CSS px (default 40). */
  size?: number;
  className?: string;
}

export function CeramicArt({ shape, decoration, glaze = null, crackle = false, size = 40, className }: CeramicArtProps) {
  const art = useArt();
  const style = {
    "--src": cssUrl(art.ceramic(shape, decoration)),
    "--glz": `var(--glz-${glaze ?? "clay"})`,
    "--sz": `${size}px`,
    ...(crackle ? { "--crk": cssUrl(art.crackle()) } : {}),
  } as CSSProperties;
  return (
    <span
      className={["cer", crackle ? "cer--crackle" : "", className ?? ""].filter((part) => part !== "").join(" ")}
      style={style}
      aria-hidden="true"
      data-ceramic-art={`${shape}-${decoration}`}
      data-glaze={glaze ?? "clay"}
      data-decoration={decoration}
      data-crackle={crackle ? "true" : undefined}
    >
      {crackle ? <i className="cer-crackle" /> : null}
    </span>
  );
}
