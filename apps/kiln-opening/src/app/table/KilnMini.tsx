/**
 * KilnMini (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `kilnMini`: `kilnLayout`, `board.kilnDie`, `board.fireDiscard`; D8 row order.
 *
 * A one-line Shared Kiln summary on the Table: a glyph of the kiln (owner decision D8: Low at the
 * top, centred under the dome; Middle; High at the bottom by the firebox), how many spaces this
 * player count uses by zone (High-Middle-Low, e.g. "2-1-1") and how many are empty; this round's
 * Kiln Die; and the open Fire discard (D4: the only Fire-deck information, never a count of cards
 * left). "Open Kiln" goes to the Kiln section (§8.1: scroll on desktop and tablet, the Kiln tab on
 * phones). During the Firing Phase the firing stage takes the Kiln's place (D3), so the strip is
 * not shown.
 *
 * Owner review 2026-10-17: covered spaces are not shown at all, here as in the Kiln section. The
 * glyph draws only the engine's active spaces (`kilnLayout.activeSpaceIds`, from
 * `activeKilnSpaces`), each row centred, so it reads 2 / 3 / 3 with 4 players, 2 / 2 / 2 with 3
 * and 1 / 1 / 2 with 2; the text names no covered count.
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

function cellState(space: KilnSpaceView): "full" | "empty" {
  return space.ceramics.length > 0 ? "full" : "empty";
}

export function KilnMini() {
  const t = useT();
  const model = useGame();
  const { jumpTo } = useUi();
  if (model.roundPhase === "firing") return null;
  const layout = model.kilnLayout;
  // Only the spaces this player count uses (engine data); covered spaces are left out.
  const active = model.board.kilnSpaces.filter((space) => layout.activeSpaceIds.includes(space.spaceId));
  const inZone = (zone: KilnZone) => active.filter((space) => space.zone === zone);
  const zones = NOTATION.map((zone) => inZone(zone).length).join("-");
  const discard = model.board.fireDiscard;
  return (
    <div className="kmini" data-kiln-mini="">
      <span className="kmini-grp">
        <span className="kglyph" aria-hidden="true">
          {GLYPH_ROWS.map((zone) => {
            const cells = inZone(zone);
            return cells.length === 0 ? null : (
              <span key={zone} className={`kglyph-row kglyph-row--${zone}`}>
                {cells.map((space) => (
                  <i key={space.spaceId} className={`kglyph-cell kglyph-cell--${cellState(space)}`} data-space-id={space.spaceId} />
                ))}
              </span>
            );
          })}
        </span>
        <strong className="kmini-title">{t("table.kilnMini.title")}</strong>
        <span>
          {t("table.kilnMini.layout", {
            active: layout.activeSpaceIds.length,
            zones,
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
