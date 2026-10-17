/**
 * ImperialKilns (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B3 (kiln, firing stage, results, playtest).
 * Source: wireframe `imperialTiles`: `players[].imperial`.
 *
 * One tile per player who has gained their Imperial Kiln (Recognition milestone, in turn order):
 * its ceramic this firing with marker and Quality (public, AGENTS.md), or "empty this round",
 * and the Imperial modifier chosen when it was loaded (R11; public). Players without one are
 * listed together. The heading opens the Imperial Gift milestone's rules details (D10).
 * Ceramics the open decision would load into the viewer's Imperial Kiln show as pending chips.
 */
import { useT } from "../i18n/I18nProvider.tsx";
import { IMPERIAL_KILN_RECOGNITION, IMPERIAL_MODIFIER_OPTIONS } from "../i18n/content.ts";
import { list, signed } from "../i18n/format.ts";
import { useGame, useTableSelection } from "../state/hooks.ts";
import { KilnCeramic } from "./KilnCeramic.tsx";
import { PendingChip, extraFireFor, saggarsFloorFor } from "./KilnSpace.tsx";
import { RulesDetail } from "../rules/RulesDetail.tsx";
import { playerLabel } from "./names.ts";
import { useTableCeramics } from "./tableCeramics.ts";
import { seatVar } from "./cssVars.ts";
import "./ImperialKilns.css";

export function ImperialKilns() {
  const t = useT();
  const model = useGame();
  const selection = useTableSelection();
  const ceramics = useTableCeramics();
  const have = model.players.filter((player) => player.imperial.kilnGained);
  const without = model.players.filter((player) => !player.imperial.kilnGained);
  const pending = selection.pendingCeramics.filter((entry) => entry.at === "imperial");
  return (
    <div className="imps" role="group" aria-label={t("kiln.imperialKilns")}>
      <RulesDetail
        subject={{ kind: "recognition", space: IMPERIAL_KILN_RECOGNITION }}
        className="imps-head"
        trigger={<span className="imps-title">{t("kiln.imperialKilns")}</span>}
      />
      {have.map((player) => {
        const ceramic = player.imperial.kilnCeramic;
        const modifier = ceramic !== null && ceramic.placement.kiln === "imperial" ? ceramic.placement.imperialModifier : null;
        const mine = player.playerId === model.viewerId;
        const pendingHere = mine ? pending : [];
        return (
          <div
            key={player.playerId}
            className="imp"
            style={seatVar(player.seatIndex)}
            role="group"
            aria-label={mine ? t("kiln.imperialKilnYours") : t("kiln.imperialKilnOf", { name: player.displayName })}
            data-webgl-mount="imperial-kiln"
            data-player-id={player.playerId}
            data-motion="kiln"
            data-motion-key={`imperial:${player.playerId}`}
          >
            <span className="imp-name" aria-hidden="true">
              <span className="imp-swatch" />
              {playerLabel(model, t, player.playerId)}
            </span>
            <span className="imp-body">
              {ceramic === null ? null : (
                <KilnCeramic id={ceramic.id} ownerId={ceramic.ownerId} marker={ceramic.heatMarker} extraFire={extraFireFor(model, ceramic.id)} saggarsFloor={saggarsFloorFor(model, ceramic.id)} size={34} />
              )}
              {pendingHere.map((entry) => (
                <PendingChip key={entry.ceramicId} ceramicId={entry.ceramicId} glaze={entry.glaze} ceramics={ceramics} t={t} />
              ))}
              {ceramic === null && pendingHere.length === 0 ? <span className="imp-empty">{t("kiln.impEmpty")}</span> : null}
            </span>
            <span className="imp-mod-label" aria-hidden="true">{t("kiln.impMod")}</span>
            <span
              className="imp-mods"
              role="img"
              aria-label={modifier === null ? t("kiln.impModNone") : t("kiln.impModValue", { value: signed(modifier) })}
            >
              {IMPERIAL_MODIFIER_OPTIONS.map((option) => (
                <span key={option} className={option === modifier ? "imp-mod imp-mod--on" : "imp-mod"} aria-hidden="true">
                  {signed(option)}
                </span>
              ))}
            </span>
          </div>
        );
      })}
      {without.length === 0 ? null : (
        <p className="imp imp--none">
          {t("kiln.impNone", { names: list(without.map((player) => playerLabel(model, t, player.playerId)), t.locale), n: IMPERIAL_KILN_RECOGNITION })}
        </p>
      )}
      {have.length === 0 ? null : <p className="imps-note">{t("kiln.courtFired")}</p>}
    </div>
  );
}
