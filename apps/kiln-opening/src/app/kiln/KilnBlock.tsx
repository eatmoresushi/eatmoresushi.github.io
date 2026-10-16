/**
 * KilnBlock (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B3 (kiln, firing stage, results, playtest).
 * Source: wireframe `kilnBlock`: SharedKiln and ImperialKilns.
 *
 * The Shared Kiln with the Imperial Kilns beside it (below it in a narrow container). It is the
 * same in the Kiln section and on the firing stage; kiln targets and pending chips come from the
 * open decision through `useTableSelection()` (§3.5).
 */
import { ImperialKilns } from "./ImperialKilns.tsx";
import { SharedKiln } from "./SharedKiln.tsx";
import "./KilnBlock.css";

export function KilnBlock() {
  return (
    <div className="kilnbox">
      <div className="kilnwrap">
        <SharedKiln />
        <ImperialKilns />
      </div>
    </div>
  );
}
