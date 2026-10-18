/**
 * FinalSummary (UI_V1.6.1_ARCHITECTURE §3.4 `final`; wireframe `decFinal`). Owner: B5.
 *
 * The decision pane once the game is finished: the winner (or the shared victory), what decided
 * it (`finalResult.resolvedBy`, in `TIE_BREAK_ORDER` terms), and the standings with each
 * player's final total. Totals, ranks and the deciding criterion all come from
 * `game.finalResult`; nothing is added up here. The full score table is B3's Results section.
 */
import type { CSSProperties } from "react";
import type { FinalResult } from "../../../game/index.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { andList } from "../../i18n/format.ts";
import type { MessageKey } from "../../i18n/translator.ts";
import { useGame } from "../../state/hooks.ts";
import { nameOf, seatOf } from "../firing/firingSupport.ts";
import { Lead, Note, Section } from "../firing/WindowParts.tsx";
import "../orders/Orders.css";

const DECIDED_BY: { readonly [K in FinalResult["resolvedBy"]]: MessageKey | null } = {
  total_vp: null,
  imperial_recognition: "orders.final.by.imperial_recognition",
  printed_crowns: "orders.final.by.printed_crowns",
  masterpieces: "orders.final.by.masterpieces",
  shared_victory: null,
};

export function FinalSummary() {
  const t = useT();
  const model = useGame();
  const result = model.finalResult;
  if (result === null) return null;
  const winners = result.winnerIds;
  const firstWinner = winners[0];
  const vp = firstWinner === undefined ? 0 : result.scores[firstWinner]?.total ?? 0;
  const names = winners.map((playerId) => nameOf(model, playerId));
  const decidedBy = DECIDED_BY[result.resolvedBy];
  const winnerSet = new Set(winners);
  return (
    <div className="dw-form">
      <Lead>
        {winners.length > 1
          ? t("orders.final.shared", { names: andList(names, t.locale), vp })
          : t("orders.final.winner", { name: names[0] ?? "", vp })}
      </Lead>
      {decidedBy === null || winners.length > 1 ? null : <Note>{t("orders.final.decidedBy", { criterion: t.dynamic(decidedBy) })}</Note>}
      <Section heading={t("orders.final.standings")}>
        <ol className="ord-final-list">
          {result.standings.map((standing) => (
            <li
              key={standing.playerId}
              className="ord-final-row"
              data-player-id={standing.playerId}
              data-winner={winnerSet.has(standing.playerId) ? "true" : undefined}
              style={{ "--pc": `var(--seat-${seatOf(model, standing.playerId)})` } as CSSProperties}
            >
              <span className="ord-final-rank">{t("orders.final.rank", { rank: standing.rank })}</span>
              <span className="ord-final-name">{standing.playerId === model.viewerId ? t("common.nameYou", { name: nameOf(model, standing.playerId) }) : nameOf(model, standing.playerId)}</span>
              <span className="ord-final-vp">{t("common.vpN", { n: standing.total })}</span>
            </li>
          ))}
        </ol>
      </Section>
      <Note>{t("orders.final.seeResults")}</Note>
    </div>
  );
}
