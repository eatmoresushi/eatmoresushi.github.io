/**
 * SharedKiln (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B3 (kiln, firing stage, results, playtest).
 * Source: wireframe `sharedKiln`: rows Low (2, centred under the dome) / Middle / High by the firebox (D8).
 *
 * - **Owner decision D8 / K13:** Low (−1) at the top with its two spaces centred under the dome,
 *   Middle (0) in the middle, High (+1) at the bottom beside the firebox. Layout only: the data
 *   order (`KILN_SPACE_IDS`), the modifiers and the covered spaces per player count are the
 *   engine's (`board.kilnSpaces`).
 * - The firebox shows the Fire card face down until it is turned, then the card and Global Heat
 *   (Base Heat before that), as the table does (D3). Nothing else: no odds, no deck size (D4).
 * - `data-webgl-mount="shared-kiln"` is phase 6's mount; the DOM kiln stays the accessible
 *   source of truth (§8.4).
 */
import type { FiringStageView, KilnZone } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { zoneName } from "../i18n/content.ts";
import { signed } from "../i18n/format.ts";
import { FireCard } from "../pieces/FireCard.tsx";
import { useGame } from "../state/hooks.ts";
import { KilnSpace } from "./KilnSpace.tsx";
import { cssVars } from "./cssVars.ts";
import "./SharedKiln.css";

/** Owner decision D8: top to bottom, Low under the dome, Middle, High by the firebox. */
export const KILN_ROW_ORDER: readonly KilnZone[] = ["low", "middle", "high"];

function Firebox({ stage }: { stage: FiringStageView | null }) {
  const t = useT();
  const heat = stage === null ? null : stage.globalHeat ?? stage.baseHeat;
  return (
    <div className="firebox" role="group" aria-label={t("kiln.firebox")}>
      <span className="firebox-label">{t("kiln.fire")}</span>
      <FireCard value={stage?.fireModifier ?? null} motionKey="fire:round" />
      {stage === null || heat === null ? null : (
        <span className="firebox-heat">
          {stage.globalHeat === null ? t.rich("kiln.baseHeatValue", { n: heat }) : t.rich("kiln.globalHeatValue", { n: heat })}
        </span>
      )}
    </div>
  );
}

/** The glow of the kiln body follows the public heat on the table (a picture, not a number). */
function glowOf(stage: FiringStageView | null): string {
  if (stage === null) return "10%";
  const heat = stage.globalHeat ?? stage.baseHeat ?? 0;
  return `${String(Math.max(8, Math.min(70, 14 + heat * 10)))}%`;
}

export function SharedKiln() {
  const t = useT();
  const model = useGame();
  const stage = model.firingStage;
  const playerCount = model.players.length;
  return (
    <div
      className="kiln"
      role="group"
      aria-label={t("kiln.sharedKilnLabel", { n: playerCount })}
      data-webgl-mount="shared-kiln"
      data-motion="kiln"
      data-motion-key="shared-kiln"
      style={cssVars({ "--glow": glowOf(stage) })}
    >
      <span className="kiln-label" aria-hidden="true">{t("kiln.sharedKilnPlayers", { n: playerCount })}</span>
      <div className="kiln-rows">
        {KILN_ROW_ORDER.map((zone) => {
          const spaces = model.board.kilnSpaces.filter((space) => space.zone === zone);
          const first = spaces[0];
          if (first === undefined) return null;
          const modifier = signed(first.zoneModifier);
          return (
            <div key={zone} className={`kiln-row kiln-row--${zone}`} role="group" aria-label={t("kiln.zoneLabel", { zone: zoneName(zone, t.locale), modifier })} data-zone={zone}>
              <span className="kiln-zone" aria-hidden="true">
                <b>{zoneName(zone, t.locale)}</b>
                <span className="kiln-zone-mod num">{modifier}</span>
              </span>
              {zone === "low" ? <span className="kiln-spacer" aria-hidden="true" /> : null}
              {spaces.map((space) => (
                <KilnSpace key={space.spaceId} spaceId={space.spaceId} />
              ))}
              {zone === "low" ? <span className="kiln-spacer" aria-hidden="true" /> : null}
            </div>
          );
        })}
      </div>
      <Firebox stage={stage} />
    </div>
  );
}
