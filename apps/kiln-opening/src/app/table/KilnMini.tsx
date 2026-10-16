/**
 * KilnMini (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `kilnMini`: `kilnLayout`, `board.kilnDie`, `board.fireDiscard`; D8 row order.
 *
 * A one-line Shared Kiln summary on the Table: a glyph of the kiln (owner decision D8: Low at the
 * top, its two spaces centred under the dome; Middle; High at the bottom by the firebox), how
 * many spaces are active by zone for this player count (High-Middle-Low, e.g. "2-1-1"), covered
 * and empty; this round's Kiln Die; and the open Fire discard (D4: the only Fire-deck
 * information, never a count of cards left). "Open Kiln" goes to the Kiln section (§8.1: scroll
 * on desktop and tablet, the Kiln tab on phones). During the Firing Phase the firing stage takes
 * the Kiln's place (D3), so the strip is not shown.
 */
import type { KilnSpaceView, KilnZone } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { FireCard } from "../pieces/FireCard.tsx";
import { KilnDie } from "../pieces/KilnDie.tsx";
import { useGame, useUi } from "../state/hooks.ts";
import "./KilnMini.css";

/** D8 glyph rows, top to bottom. */
const GLYPH_ROWS: readonly KilnZone[] = ["low", "middle", "high"];
/** Rule notation order for "2-1-1" (High-Middle-Low). */
const NOTATION: readonly KilnZone[] = ["high", "middle", "low"];

function cellState(space: KilnSpaceView): "covered" | "full" | "empty" {
  if (!space.active) return "covered";
  return space.ceramics.length > 0 ? "full" : "empty";
}

export function KilnMini() {
  const t = useT();
  const model = useGame();
  const { jumpTo } = useUi();
  if (model.roundPhase === "firing") return null;
  const layout = model.kilnLayout;
  const spaces = model.board.kilnSpaces;
  const zones = NOTATION.map((zone) => spaces.filter((space) => space.zone === zone && layout.activeSpaceIds.includes(space.spaceId)).length).join("-");
  const discard = model.board.fireDiscard;
  return (
    <div className="kmini" data-kiln-mini="">
      <span className="kmini-grp">
        <span className="kglyph" aria-hidden="true">
          {GLYPH_ROWS.map((zone) => (
            <span key={zone} className={`kglyph-row kglyph-row--${zone}`}>
              {spaces.filter((space) => space.zone === zone).map((space) => (
                <i key={space.spaceId} className={`kglyph-cell kglyph-cell--${cellState(space)}`} data-space-id={space.spaceId} />
              ))}
            </span>
          ))}
        </span>
        <strong className="kmini-title">{t("table.kilnMini.title")}</strong>
        <span>
          {t("table.kilnMini.layout", {
            active: layout.activeSpaceIds.length,
            zones,
            covered: layout.coveredSpaceIds.length,
            empty: layout.emptyActiveSpaceIds.length,
          })}
        </span>
      </span>
      <span className="kmini-grp">
        <span aria-hidden="true">{t("common.piece.kilnDie")}</span>
        <KilnDie value={model.board.kilnDie?.value ?? null} />
      </span>
      <span className="kmini-grp">
        <span>{t("table.kilnMini.discard")}</span>
        <span className="kmini-discard">
          {discard.length === 0
            ? <span className="kmini-none">{t("table.kilnMini.discardNone")}</span>
            : discard.map((value, index) => <FireCard key={index} value={value} motionKey={`discard:${index}`} />)}
        </span>
      </span>
      <button type="button" className="kmini-open" onClick={() => jumpTo("kiln")}>
        {t("table.kilnMini.open")} <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
