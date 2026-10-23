/**
 * FireCard (pieces; wireframe `fireCard`, `.firec`). A turned Fire card shows its modifier
 * (−2 … +2, U+2212 for minus); a face-down card shows its back. This is the only Fire-deck
 * information on screen (D4): never a count of cards left.
 */
import type { FireModifier } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { signed } from "../i18n/format.ts";
import "./FireCard.css";

export interface FireCardProps {
  /** The turned modifier, or null for a face-down card. */
  value: FireModifier | null;
  size?: "sm" | "lg";
  /** Phase 5 FLIP key (`data-motion-key`, §8.4): a stable ID such as `fire:<i>`. An attribute only, never text (D9). */
  motionKey?: string;
  className?: string;
}

export function FireCard({ value, size = "sm", motionKey, className }: FireCardProps) {
  const t = useT();
  const tone = value === null ? "back" : value < 0 ? "neg" : value > 0 ? "pos" : "zero";
  const classes = ["firec", `firec--${tone}`, size === "lg" ? "firec--lg" : "", className ?? ""].filter((part) => part !== "").join(" ");
  return (
    <span className={classes} data-motion="fire" data-motion-key={motionKey} data-fire={value === null ? "back" : String(value)}>
      <span aria-hidden="true">{value === null ? "?" : signed(value)}</span>
      <span className="sr-only">{value === null ? t("common.piece.fireCardFaceDown") : t("common.piece.fireCard", { value: signed(value) })}</span>
    </span>
  );
}
