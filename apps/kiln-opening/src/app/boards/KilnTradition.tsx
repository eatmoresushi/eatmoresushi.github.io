/**
 * KilnTradition (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `kilnTrad`, `hmLine`: the Kiln Player Board's tradition and marker line.
 *
 * - `KilnTradition`: the Kiln and its Tradition ability, Ready or Used this round, and the short
 *   text (timing clause in bold). The block is the trigger of the Kiln's rules details (D10):
 *   full ability, the Kiln's clarifications, once per round and used this round.
 * - `MarkerLine`: Kiln Master's marker while it is on one of this player's loaded ceramics (it is
 *   chosen face up at loading, T24, rev. 4 L628; there is no player Heat marker since revision 4,
 *   changes 28, 31), and the Imperial Kiln's ceramic. Markers are public (AGENTS.md). Ceramics are
 *   named in words (D9).
 */
import type { ReactNode } from "react";
import type { CeramicId, PlayerId } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { ceramicLabel } from "../i18n/ceramicLabel.ts";
import { kilnText } from "../i18n/content.ts";
import { signed } from "../i18n/format.ts";
import { Chip } from "../kit/Chip.tsx";
import { useGame } from "../state/hooks.ts";
import { RulesDetail, ShortText } from "../rules/RulesDetail.tsx";
import { summaryOf, tableCeramics } from "../table/tableData.ts";
import "./KilnTradition.css";

export interface KilnTraditionProps {
  /** Whose Kiln. */
  playerId: PlayerId;
}

export function KilnTradition({ playerId }: KilnTraditionProps) {
  const t = useT();
  const model = useGame();
  const summary = summaryOf(model, playerId);
  if (summary === null) return null;
  if (summary.kilnId === null) return <p className="trad trad--none">{t("boards.board.noKiln")}</p>;
  const text = kilnText(summary.kilnId, t.locale);
  const ready = summary.kilnAbilityReady;
  const face = (
    <span className="trad-face">
      <span className="trad-t1">
        <strong className="trad-name">{t("boards.kiln.tradition", { kiln: text.name, ability: text.abilityName })}</strong>
        <Chip tone={ready ? "ok" : "used"}>{ready ? t("common.status.ready") : t("common.status.usedThisRound")}</Chip>
      </span>
      <span className="trad-short"><ShortText text={text.short} /></span>
    </span>
  );
  return (
    <div className="trad" data-kiln-id={summary.kilnId}>
      <RulesDetail subject={{ kind: "kiln", id: summary.kilnId }} trigger={face} className="trad-detail" />
    </div>
  );
}

export interface MarkerLineProps {
  playerId: PlayerId;
}

export function MarkerLine({ playerId }: MarkerLineProps) {
  const t = useT();
  const model = useGame();
  const summary = summaryOf(model, playerId);
  if (summary === null) return null;
  const { byId, markers, labelView } = tableCeramics(model);
  // The board is this player's, so the ceramic needs no owner; the place tells it apart.
  const name = (id: CeramicId): string => {
    const facts = byId.get(id);
    return facts === undefined ? t("common.ceramic.unknown") : ceramicLabel(facts, labelView, { locale: t, withOwner: false, withPlace: true });
  };
  const parts: ReactNode[] = [];
  const master = summary.kilnMasterCeramicId;
  const masterMarker = master === null ? null : markers.get(master) ?? null;
  if (master !== null && masterMarker !== null) {
    parts.push(t.rich("boards.markers.kilnMasterOn", { value: signed(masterMarker), ceramic: name(master) }));
  }
  const imperial = summary.imperial;
  const state = !imperial.kilnGained
    ? t("boards.markers.imperialNotYet")
    : imperial.kilnCeramic === null
      ? t("boards.markers.imperialEmpty")
      : ceramicLabel(imperial.kilnCeramic, labelView, { locale: t, withOwner: false, withPlace: false });
  parts.push(t("boards.markers.imperial", { state }));
  return (
    <>
      {parts.map((part, index) => (
        <span key={index} className="marker-part">
          {index === 0 ? null : <span aria-hidden="true"> · </span>}
          {part}
        </span>
      ))}
    </>
  );
}
