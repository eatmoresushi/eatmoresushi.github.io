/**
 * Inline styles that set only custom properties (§7.3: a TSX `style` prop may set only `--*`).
 * The key type admits only custom-property names, so a component cannot set a real property
 * through this helper. Owner: B3.
 */
import type { CSSProperties } from "react";

export function cssVars(vars: Readonly<Record<`--${string}`, string>>): CSSProperties {
  return vars as CSSProperties;
}

/** The seat colour of a player's ring, swatch or border (`--pc`). */
export function seatVar(seat: number): CSSProperties {
  return cssVars({ "--pc": `var(--seat-${String(seat)})` });
}
