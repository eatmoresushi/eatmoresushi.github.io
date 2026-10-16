/**
 * CeramicPiece (B2): a ceramic on a board or in the Finished ceramics strip, as the table shows
 * it (§7.4): the `CeramicChip` (art in the owner's colour ring, Quality word, Crackle and Heat
 * markers) inside a `PieceDetail` that names it in words with where it is (D9: never an ID).
 * `highlighted` marks a ceramic the open decision points at (an Order group, an ability target).
 */
import type { CeramicHeatMarker } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { ceramicLabel } from "../i18n/ceramicLabel.ts";
import type { CeramicFacts, CeramicLabelView } from "../i18n/ceramicLabel.ts";
import { PieceDetail } from "../kit/PieceDetail.tsx";
import { CeramicChip } from "../pieces/CeramicChip.tsx";
import { heatMarkerWords } from "../pieces/HeatMarkerBadge.tsx";
import "./CeramicPiece.css";

export interface CeramicPieceProps {
  ceramic: CeramicFacts;
  seat: number;
  view: CeramicLabelView;
  marker?: CeramicHeatMarker | null;
  highlighted?: boolean;
  size?: number;
  /** Name the owner ("Lin's …", "Your …"); boards already say whose they are. */
  withOwner?: boolean | "auto";
}

export function CeramicPiece({ ceramic, seat, view, marker = null, highlighted = false, size = 32, withOwner = "auto" }: CeramicPieceProps) {
  const t = useT();
  const full = ceramicLabel(ceramic, view, { locale: t, withOwner: true, withPlace: true });
  return (
    <PieceDetail
      label={full}
      className="cer-piece"
      trigger={<CeramicChip ceramic={ceramic} seat={seat} view={view} labelOptions={{ withOwner }} marker={marker} highlighted={highlighted} size={size} />}
    >
      <p className="cer-piece-line">{full}</p>
      {marker === null ? null : <p className="cer-piece-line">{heatMarkerWords(marker, t)}</p>}
    </PieceDetail>
  );
}
