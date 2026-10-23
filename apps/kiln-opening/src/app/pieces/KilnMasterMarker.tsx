/**
 * KilnMasterMarker (pieces; wireframe `markerBadge`, `.hm`): Kiln Master's +1 or −1 marker on a
 * loaded ceramic (T24, rev. 4 L628, R22). It is chosen face up when the ceramic is loaded, so it
 * always shows its value, and it is public (AGENTS.md). Revision 4 has no player Heat marker
 * (changes 28, 31), so this is the only marker a ceramic carries. The words are visually hidden
 * text ("Kiln Master marker +1"), so a chip that contains the badge reads it as part of its name.
 */
import type { HeatDelta } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { signed } from "../i18n/format.ts";
import type { Translator } from "../i18n/translator.ts";
import "./KilnMasterMarker.css";

export interface KilnMasterMarkerProps {
  /** The marker's face (`LoadedCeramic.kilnMasterMarker`). */
  value: HeatDelta;
  /** Phase 5 FLIP key (`data-motion-key`, §8.4): a stable ID such as `marker:<ceramic ID>`. An attribute only, never text (D9). */
  motionKey?: string;
  /** Hide from assistive technology when the surrounding name already says the marker. */
  decorative?: boolean;
  className?: string;
}

/** The marker in words: "Kiln Master marker +1" / "窑工标+1". */
export function kilnMasterMarkerWords(value: HeatDelta, t: Translator): string {
  return t("common.piece.kilnMasterMarker", { value: signed(value) });
}

export function KilnMasterMarker({ value, motionKey, decorative = false, className }: KilnMasterMarkerProps) {
  const t = useT();
  const classes = ["hm", "hm--kiln-master", className ?? ""].filter((part) => part !== "").join(" ");
  return (
    <span className={classes} data-motion="marker" data-motion-key={motionKey} aria-hidden={decorative ? true : undefined}>
      <span aria-hidden="true">{signed(value)}</span>
      {decorative ? null : <span className="sr-only">{kilnMasterMarkerWords(value, t)}</span>}
    </span>
  );
}
