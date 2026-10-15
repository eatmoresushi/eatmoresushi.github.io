/**
 * Chip (kit; wireframe `.chip`): a small non-interactive label. Tone carries emphasis only;
 * the text always says what it means (never colour alone).
 */
import type { ReactNode } from "react";
import "./Chip.css";

export type ChipTone = "neutral" | "ok" | "used" | "gold" | "warn" | "private";

export interface ChipProps {
  tone?: ChipTone;
  /** Leading decoration (icon), hidden from assistive technology. */
  icon?: ReactNode;
  /** Allow wrapping (long Order quality lines). */
  wrap?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Chip({ tone = "neutral", icon, wrap = false, className, children }: ChipProps) {
  const classes = ["kit-chip", `kit-chip--${tone}`, wrap ? "kit-chip--wrap" : "", className ?? ""].filter((part) => part !== "").join(" ");
  return (
    <span className={classes}>
      {icon === undefined ? null : <span className="kit-chip-icon" aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}
