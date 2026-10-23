/**
 * QualityChip (pieces; wireframe `.chip.q-*`, `QL`). The Quality never relies on colour (§8.1):
 * the word is always present ("Fine" / "上品"); `compact` shows the letter instead (M / F / S / ×,
 * 臻 / 上 / 良 / 瑕) and keeps the word for assistive technology.
 *
 * A container may switch to the letter itself: give the chip `compact` there, or in its own CSS
 * make `.qchip-word` visually hidden and show `.qchip-letter` (as the Shared Kiln's narrow
 * spaces do).
 */
import type { Quality } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { qualityName } from "../i18n/content.ts";
import "./QualityChip.css";

const LETTER_KEYS = {
  masterpiece: "common.qualityLetter.masterpiece",
  fine: "common.qualityLetter.fine",
  standard: "common.qualityLetter.standard",
  flawed: "common.qualityLetter.flawed",
} as const satisfies Record<Quality, string>;

export interface QualityChipProps {
  quality: Quality;
  compact?: boolean;
  /** Hide from assistive technology when the surrounding label already says the Quality. */
  decorative?: boolean;
  /** Phase 5 FLIP key (`data-motion-key`, §8.4): a stable ID such as `quality:<ceramic ID>`. An attribute only, never text (D9). */
  motionKey?: string;
  className?: string;
}

export function QualityChip({ quality, compact = false, decorative = false, motionKey, className }: QualityChipProps) {
  const t = useT();
  return (
    <span
      className={["qchip", `qchip--${quality}`, compact ? "qchip--compact" : "", className ?? ""].filter((part) => part !== "").join(" ")}
      data-quality={quality}
      data-motion="quality"
      data-motion-key={motionKey}
      aria-hidden={decorative ? true : undefined}
    >
      <span className="qchip-word">{qualityName(quality, t.locale)}</span>
      <span className="qchip-letter" aria-hidden="true">{t(LETTER_KEYS[quality])}</span>
    </span>
  );
}
