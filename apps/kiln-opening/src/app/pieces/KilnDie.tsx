/**
 * KilnDie (pieces; wireframe `.die`): the public Kiln Die result of this round (faces 1, 1, 2,
 * 2, 3, 3). Before the roll it shows an empty face.
 */
import type { KilnDieFace } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { num } from "../i18n/format.ts";
import "./KilnDie.css";

export interface KilnDieProps {
  value: KilnDieFace | null;
  size?: "sm" | "lg";
  /** Phase 5 FLIP key (`data-motion-key`, §8.4): a stable ID such as `die` (the default: one Kiln Die on the table). An attribute only, never text (D9). */
  motionKey?: string;
  className?: string;
}

export function KilnDie({ value, size = "sm", motionKey = "die", className }: KilnDieProps) {
  const t = useT();
  return (
    <span className={["die", size === "lg" ? "die--lg" : "", className ?? ""].filter((part) => part !== "").join(" ")} data-motion="die" data-motion-key={motionKey}>
      <span aria-hidden="true">{value === null ? "" : num(value)}</span>
      <span className="sr-only">{value === null ? t("common.piece.kilnDieNotRolled") : t("common.piece.kilnDieValue", { n: value })}</span>
    </span>
  );
}
