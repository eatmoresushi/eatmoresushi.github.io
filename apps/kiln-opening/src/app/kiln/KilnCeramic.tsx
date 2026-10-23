/**
 * A ceramic in the Shared Kiln, an Imperial Kiln, the recap or the results (wireframe `cchip`).
 * Owner: B3.
 *
 * The chip is the picture (art, owner ring, Quality, Crackle and Kiln Master badges); its name is
 * the ceramic in words (`ceramicLabel`, D9). Wrapped in `PieceDetail` (§7.4, §8.1), it opens a
 * panel with the full description, its place, Kiln Master's marker, Quality (and, when Protective Saggars kept
 * it Standard, that fact, as the game log records it) and Second Firing card. Inside a
 * kiln target button it renders as a plain chip (no nested controls). In its owner's own turn
 * (the after-Quality turn, R20), a Flawed ceramic of this firing the open window may sell carries
 * a Sell button under it (`SellButton`, `useTableSelection().sellTargets`), as on the owner's
 * board, since the firing stage takes over the column (D3).
 *
 * A ceramic the model holds no attributes for (see `tableCeramics.ts`) is shown in words only:
 * "Lin's ceramic · Fine".
 */
import type { CeramicId, FireModifier, HeatDelta, PlayerId, Quality } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { techName, qualityName } from "../i18n/content.ts";
import { KILN_TECHS } from "../i18n/catalog/kiln.ts";
import { ceramicLabel, ceramicPlace, placeName } from "../i18n/ceramicLabel.ts";
import { list, signed } from "../i18n/format.ts";
import type { Translator } from "../i18n/translator.ts";
import { PieceDetail } from "../kit/PieceDetail.tsx";
import { CeramicChip } from "../pieces/CeramicChip.tsx";
import { FireCard } from "../pieces/FireCard.tsx";
import { kilnMasterMarkerWords } from "../pieces/KilnMasterMarker.tsx";
import { QualityChip } from "../pieces/QualityChip.tsx";
import { useTableSelection } from "../state/hooks.ts";
import { SellButton } from "../table/SellButton.tsx";
import { useTableCeramics } from "./tableCeramics.ts";
import type { TableCeramics } from "./tableCeramics.ts";
import { seatVar } from "./cssVars.ts";
import "./KilnCeramic.css";

export interface KilnCeramicProps {
  id: CeramicId;
  /** Shown when the model holds no attributes for the ceramic. */
  ownerId: PlayerId;
  /** Kiln Master's face-up marker on the ceramic while it is loaded (T24, rev. 4 L628). */
  marker?: HeatDelta | null;
  /** A Quality to show when the model holds none (a recap or results record). */
  quality?: Quality | null;
  crackle?: boolean;
  /** Second Firing's Fire cards for this ceramic: both while its owner chooses, then the chosen one. */
  extraFire?: readonly FireModifier[] | null;
  /** Protective Saggars kept it Standard this firing instead of Flawed (v1.6.2 L636). */
  saggarsFloor?: boolean;
  size?: number;
  /** Letters instead of Quality words (narrow kiln spaces). */
  compactQuality?: boolean;
  /** False inside a target button: a plain chip with no details control. */
  interactive?: boolean;
  className?: string;
}

/** The ceramic in words, owner included; the place only when another would read the same. */
export function kilnCeramicLabel(ceramics: TableCeramics, id: CeramicId, ownerId: PlayerId, t: Translator, quality?: Quality | null): string {
  const facts = ceramics.facts(id);
  if (facts !== null) return ceramicLabel(facts, ceramics.view, { locale: t, among: ceramics.all });
  const base = ownerId === ceramics.view.viewerId
    ? t("kiln.recap.ceramicFallbackYours")
    : t("kiln.recap.ceramicFallback", { owner: ceramics.displayName(ownerId) });
  return quality === undefined || quality === null ? base : t("common.ceramic.withQuality", { ceramic: base, quality: qualityName(quality, t.locale) });
}

export function KilnCeramic({
  id,
  ownerId,
  marker = null,
  quality,
  crackle,
  extraFire = null,
  saggarsFloor = false,
  size = 30,
  compactQuality = false,
  interactive = true,
  className,
}: KilnCeramicProps) {
  const t = useT();
  const ceramics = useTableCeramics();
  const selection = useTableSelection();
  const stored = ceramics.facts(id);
  const facts = stored === null
    ? null
    : { ...stored, ...(quality === undefined || quality === null ? {} : { quality }), ...(crackle === undefined ? {} : { crackle: crackle || stored.crackle === true }) };
  const highlighted = selection.highlightedCeramicIds.has(id);
  const seat = ceramics.seat(facts?.ownerId ?? ownerId);
  const label = facts === null
    ? kilnCeramicLabel(ceramics, id, ownerId, t, quality)
    : ceramicLabel(facts, ceramics.view, { locale: t, among: ceramics.all });

  const chip = facts === null ? (
    <span className={["cchip", "kcer-fallback", highlighted ? "cchip--highlighted" : ""].filter((part) => part !== "").join(" ")} style={seatVar(seat)} data-motion="ceramic" data-motion-key={id}>
      <span className="sr-only">{label}</span>
      <span className="cchip-ring kcer-fallback-ring" aria-hidden="true" />
      {quality === undefined || quality === null ? null : <QualityChip quality={quality} compact={compactQuality} decorative className="cchip-quality" />}
    </span>
  ) : (
    <CeramicChip
      ceramic={facts}
      seat={seat}
      label={label}
      marker={marker}
      size={size}
      compactQuality={compactQuality}
      highlighted={highlighted}
    />
  );

  const fireLabel =
    extraFire === null || extraFire.length === 0
      ? null
      : extraFire.length === 1
        ? t("kiln.secondFireChosen", { tech: techName(KILN_TECHS.secondFiring, t.locale), value: signed(extraFire[0] ?? 0) })
        : t("kiln.secondFireCards", { tech: techName(KILN_TECHS.secondFiring, t.locale), values: list(extraFire.map((value) => signed(value)), t.locale) });
  const fire = extraFire === null || fireLabel === null ? null : (
    <span className="kcer-extra" title={fireLabel}>
      <span className="sr-only">{fireLabel}</span>
      <span aria-hidden="true" className="kcer-extra-tag">{t("kiln.secondFireTag", { tech: techName(KILN_TECHS.secondFiring, t.locale) })}</span>
      <span className="kcer-extra-cards" aria-hidden="true">
        {extraFire.map((value, index) => (
          <FireCard key={index} value={value} />
        ))}
      </span>
    </span>
  );

  if (!interactive) {
    return (
      <span className={["kcer", className ?? ""].filter((part) => part !== "").join(" ")}>
        {chip}
        {fire}
      </span>
    );
  }

  const place = facts === null ? null : ceramicPlace(facts);
  const lines: string[] = [];
  if (place !== null) lines.push(t("kiln.detail.place", { place: placeName(place, facts?.ownerId === ceramics.view.viewerId, t) }));
  const shownQuality = facts?.quality ?? quality ?? null;
  lines.push(shownQuality === null ? t("kiln.detail.noQuality") : t("kiln.detail.quality", { quality: qualityName(shownQuality, t.locale) }));
  if (marker !== null) lines.push(t("kiln.detail.marker", { marker: kilnMasterMarkerWords(marker, t) }));
  if (saggarsFloor) {
    lines.push(t("kiln.detail.saggarsFloor", { tech: techName(KILN_TECHS.protectiveSaggars, t.locale), standard: qualityName("standard", t.locale), flawed: qualityName("flawed", t.locale) }));
  }
  if (facts?.crackle === true || crackle === true) lines.push(t("kiln.detail.crackle"));
  if (fireLabel !== null) lines.push(fireLabel);

  return (
    <span className={["kcer", className ?? ""].filter((part) => part !== "").join(" ")}>
      <PieceDetail label={label} title={label} trigger={chip} className="kcer-detail">
        <ul className="kcer-lines">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </PieceDetail>
      {fire}
      {facts === null || !selection.sellTargets.has(id) ? null : (
        <SellButton ceramicId={id} label={ceramicLabel(facts, ceramics.view, { locale: t, withOwner: false, withPlace: true })} selection={selection} />
      )}
    </span>
  );
}
