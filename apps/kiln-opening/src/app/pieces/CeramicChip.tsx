/**
 * CeramicChip (pieces, §7.4; wireframe `cchip`): a ceramic as the table shows it.
 *
 * The art (`CeramicArt`) sits in a ring of the owner's seat colour, with its recorded Quality
 * (word, or letter when `compactQuality`; never colour alone), Kiln Master's marker (the only
 * marker a ceramic carries since revision 4) and its Crackle marker. It shows **no ID** (owner
 * decision D9): its accessible name is visually hidden text from `ceramicLabel`, e.g. "Lin's
 * Celadon Vase, Carved · Fine · Crackle", joined with the marker's words through
 * `common.ceramic.withMarker` ("…, Kiln Master marker +1"). A `PieceDetail` around the chip takes
 * this text as its button's name.
 *
 * `data-motion="ceramic"` and `data-motion-key` (default: the ceramic's engine ID, an attribute
 * only, never text) are phase 5's FLIP hooks (§8.4); the marker and Quality badges inside get
 * `marker:<key>` and `quality:<key>`.
 */
import type { CSSProperties } from "react";
import type { HeatDelta } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { ceramicLabel } from "../i18n/ceramicLabel.ts";
import type { CeramicFacts, CeramicLabelOptions, CeramicLabelView } from "../i18n/ceramicLabel.ts";
import { CeramicArt } from "./CeramicArt.tsx";
import { KilnMasterMarker, kilnMasterMarkerWords } from "./KilnMasterMarker.tsx";
import { QualityChip } from "./QualityChip.tsx";
import "./CeramicChip.css";

const NO_VIEW: CeramicLabelView = { viewerId: null, players: [] };

export interface CeramicChipProps {
  /** The ceramic's attributes, with this firing's Quality and Crackle merged in by the caller. */
  ceramic: CeramicFacts;
  /** The owner's seat index (ring colour `--seat-N`). */
  seat: number;
  /** Accessible name of the ceramic; default `ceramicLabel(ceramic, view, labelOptions)`. The marker's words are added to it. */
  label?: string;
  /** Used for the default label (owner name, "Your …", disambiguation). */
  view?: CeramicLabelView;
  labelOptions?: Omit<CeramicLabelOptions, "locale">;
  /** Kiln Master's face-up marker on this loaded ceramic (T24, rev. 4 L628), or null. */
  marker?: HeatDelta | null;
  /** Show the Quality badge when the ceramic has one (default true). */
  showQuality?: boolean;
  /** Letter instead of word (narrow kiln spaces). */
  compactQuality?: boolean;
  /** Edge length of the art in CSS px (default 38). */
  size?: number;
  /** Chosen in the open decision but not yet confirmed (dashed outline). */
  pending?: boolean;
  /** Highlighted by the open decision (an Order group, an ability target). */
  highlighted?: boolean;
  /** FLIP key; default the ceramic's ID. Pass `null` to omit. */
  motionKey?: string | null;
  className?: string;
}

export function CeramicChip({
  ceramic,
  seat,
  label,
  view,
  labelOptions,
  marker = null,
  showQuality = true,
  compactQuality = false,
  size = 38,
  pending = false,
  highlighted = false,
  motionKey,
  className,
}: CeramicChipProps) {
  const t = useT();
  const name = label ?? ceramicLabel(ceramic, view ?? NO_VIEW, {
    ...(view === undefined ? { withOwner: false } : {}),
    ...labelOptions,
    locale: t,
  });
  const quality = ceramic.quality ?? null;
  const crackle = ceramic.crackle === true;
  const classes = [
    "cchip",
    crackle ? "cchip--crackle" : "",
    pending ? "cchip--pending" : "",
    highlighted ? "cchip--highlighted" : "",
    className ?? "",
  ].filter((part) => part !== "").join(" ");
  const key = motionKey === undefined ? ceramic.id : motionKey ?? undefined;
  const fullName = marker === null ? name : t("common.ceramic.withMarker", { ceramic: name, marker: kilnMasterMarkerWords(marker, t) });
  return (
    <span className={classes} style={{ "--pc": `var(--seat-${seat})` } as CSSProperties} data-motion="ceramic" data-motion-key={key}>
      <span className="sr-only">{fullName}</span>
      <span className="cchip-ring" aria-hidden="true">
        <CeramicArt shape={ceramic.shape} decoration={ceramic.decoration} glaze={ceramic.glaze ?? null} crackle={crackle} size={size} />
      </span>
      {marker === null ? null : <span className="cchip-marker"><KilnMasterMarker value={marker} decorative {...(key === undefined ? {} : { motionKey: `marker:${key}` })} /></span>}
      {crackle ? <span className="cchip-crackle" aria-hidden="true">{t("common.piece.crackleShort")}</span> : null}
      {showQuality && quality !== null ? <QualityChip quality={quality} compact={compactQuality} decorative className="cchip-quality" {...(key === undefined ? {} : { motionKey: `quality:${key}` })} /> : null}
    </span>
  );
}
