/**
 * FireDiscard (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B3 (kiln, firing stage, results, playtest).
 * Source: wireframe `fireDiscardHtml`: the open Fire discard, the only Fire-deck information (D4).
 *
 * The face-up discard pile, oldest first, as a list of turned Fire cards. Owner decision D4: this
 * is all the Fire-deck information on screen; never a count of cards left or an odds line. After
 * a reshuffle the discard is empty and reads "none yet".
 */
import type { FireModifier } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { FireCard } from "../pieces/FireCard.tsx";
import "./FireDiscard.css";

export interface FireDiscardProps {
  /** The discard pile, oldest first. */
  discard: readonly FireModifier[];
  /** Show the "Fire discard (open)" label (default true). */
  showLabel?: boolean;
}

export function FireDiscard({ discard, showLabel = true }: FireDiscardProps) {
  const t = useT();
  return (
    <span className="fdiscard">
      {showLabel ? <span className="fdiscard-label">{t("kiln.discard.label")}</span> : null}
      {discard.length === 0 ? (
        <span className="fdiscard-none">{t("kiln.discard.none")}</span>
      ) : (
        <ol className="fdiscard-list" aria-label={t("kiln.discard.list")}>
          {discard.map((value, index) => (
            <li key={index}>
              <FireCard value={value} motionKey={`fire:${String(index)}`} />
            </li>
          ))}
        </ol>
      )}
    </span>
  );
}
