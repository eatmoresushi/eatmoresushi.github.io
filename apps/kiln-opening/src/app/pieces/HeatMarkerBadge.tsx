/**
 * HeatMarkerBadge (pieces; wireframe `markerBadge`, `.hm`). A face-down marker shows "?" on the
 * Fire-card back pattern; a turned marker shows +1 or −1; Kiln Master's marker is square. The
 * words are visually hidden text ("Heat marker, face down" / "Heat marker +1"), so a chip that
 * contains the badge reads it as part of its name. Markers are public (AGENTS.md).
 */
import type { CeramicHeatMarker } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { signed } from "../i18n/format.ts";
import type { Translator } from "../i18n/translator.ts";
import "./HeatMarkerBadge.css";

/** A marker as the table shows it (the engine's `CeramicHeatMarker`): face down, or turned. */
export type HeatMarkerView = CeramicHeatMarker;

export interface HeatMarkerBadgeProps {
  marker: HeatMarkerView;
  /** Phase 5 FLIP key (`data-motion-key`, §8.4): a stable ID such as `marker:<ceramic ID>`. An attribute only, never text (D9). */
  motionKey?: string;
  /** Hide from assistive technology when the surrounding name already says the marker. */
  decorative?: boolean;
  className?: string;
}

/** The marker in words: "Heat marker, face down" / "Heat marker +1" / "Kiln Master marker −1". */
export function heatMarkerWords(marker: HeatMarkerView, t: Translator): string {
  if (marker.faceDown) return t("common.piece.heatMarkerFaceDown");
  return marker.source === "kiln_master"
    ? t("common.piece.kilnMasterMarker", { value: signed(marker.value) })
    : t("common.piece.heatMarkerValue", { value: signed(marker.value) });
}

export function HeatMarkerBadge({ marker, motionKey, decorative = false, className }: HeatMarkerBadgeProps) {
  const t = useT();
  const kilnMaster = marker.source === "kiln_master";
  const words = heatMarkerWords(marker, t);
  const classes = ["hm", marker.faceDown ? "hm--face-down" : "", kilnMaster ? "hm--kiln-master" : "", className ?? ""]
    .filter((part) => part !== "")
    .join(" ");
  return (
    <span className={classes} data-motion="marker" data-motion-key={motionKey} aria-hidden={decorative ? true : undefined}>
      <span aria-hidden="true">{marker.faceDown ? "?" : signed(marker.value)}</span>
      {decorative ? null : <span className="sr-only">{words}</span>}
    </span>
  );
}
