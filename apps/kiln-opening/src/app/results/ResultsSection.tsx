/**
 * ResultsSection (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B3 (kiln, firing stage, results, playtest).
 * Source: wireframe `results`: podium, score table (`SCORE_BREAKDOWN_ROWS`), tie-breaks (`TIE_BREAK_ORDER`).
 *
 * Everything comes from `finalResult` (the engine's final scoring); nothing is summed here.
 * - Podium: standings in rank order, "Winner" / "Shared victory" / "Rank n", the total and the
 *   Kiln (its rules details on click or focus, D10).
 * - Score table: one row per `SCORE_BREAKDOWN_ROWS` key, players as columns in standing order.
 *   The Techs row follows owner amendment A1: each Tech's VP was recorded when gained and is
 *   listed once, never added again (the note says so). The row and note never print the
 *   internal amendment code; its source tag lives in each Tech's rules details (D10). The
 *   Exhibition cell shows its Quality, Shapes and Glazes parts and the exhibited ceramics. The
 *   table scrolls inside itself on narrow screens, so the rules details of Imperial Audience, Crown overflow and Connoisseur's Cabinet sit
 *   under it (a panel inside the scroll box would be clipped).
 * - Tie-breakers: `TIE_BREAK_ORDER` rows plus "still tied: shared victory"; the row that decided
 *   the winner (`resolvedBy`) is marked.
 */
import type { CSSProperties, ReactNode } from "react";
import { SCORE_BREAKDOWN_ROWS, TIE_BREAK_ORDER } from "../../game/index.ts";
import type { FinalResult, FinalScoreBreakdown, PlayerId, ScoreBreakdownRow, TieBreakStep } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { KILN_TECHS } from "../i18n/catalog/kiln.ts";
import { IMPERIAL_AUDIENCE_RECOGNITION, RULE_NUMBERS, kilnName, recognitionMilestones, techName } from "../i18n/content.ts";
import { list, num } from "../i18n/format.ts";
import type { Translator } from "../i18n/translator.ts";
import { KilnCeramic } from "../kiln/KilnCeramic.tsx";
import { playerLabel, seatOf } from "../kiln/names.ts";
import { useTableCeramics } from "../kiln/tableCeramics.ts";
import { RulesDetail } from "../rules/RulesDetail.tsx";
import { useGame } from "../state/hooks.ts";
import type { GameModel } from "../state/model.ts";
import { seatVar } from "../kiln/cssVars.ts";
import "./ResultsSection.css";

const TIE_KEYS = {
  recognition: "results.tie.recognition",
  printedCrowns: "results.tie.printedCrowns",
  masterpieces: "results.tie.masterpieces",
} as const satisfies Record<TieBreakStep["key"], string>;

function seatStyle(model: GameModel, playerId: PlayerId): CSSProperties {
  return seatVar(seatOf(model, playerId));
}

/** A score row's name. Plain text: the table scrolls inside itself, which would clip a rules panel. */
function rowHeader(row: ScoreBreakdownRow, t: Translator): string {
  switch (row) {
    case "orders":
      return t("results.row.orders");
    case "kilnAbilities":
      return t("results.row.kilnAbilities");
    case "imperialAudience":
      return recognitionMilestones(t.locale).find((milestone) => milestone.space === IMPERIAL_AUDIENCE_RECOGNITION)?.title ?? "";
    case "recognitionOverflow":
      return t("results.row.recognitionOverflow", { n: RULE_NUMBERS.recognitionMax });
    case "techs":
      return t("results.row.techs", { n: RULE_NUMBERS.techVp });
    case "exhibition":
      return t("results.row.exhibition");
    case "connoisseur":
      return techName(KILN_TECHS.connoisseur, t.locale);
    case "coins":
      return t("results.row.coins", { n: 1, coins: RULE_NUMBERS.coinsPerVp, max: RULE_NUMBERS.coinVpMax });
    case "total":
      return t("results.row.total");
  }
}

/**
 * The rules details of the scored components (D10): Imperial Audience, Crowns beyond the top of
 * the track and Connoisseur's Cabinet. They sit under the table, outside its scroll box, so
 * their panels are never clipped; each names its row.
 */
function RowRules({ model, t }: { model: GameModel; t: Translator }) {
  const owner = model.players.find((player) => player.techs.some((tech) => tech.techId === KILN_TECHS.connoisseur));
  const overflow = rowHeader("recognitionOverflow", t);
  const items: Array<{ row: ScoreBreakdownRow; node: ReactNode }> = [
    {
      row: "imperialAudience",
      node: <RulesDetail subject={{ kind: "recognition", space: IMPERIAL_AUDIENCE_RECOGNITION }} trigger={<span className="score-rule">{rowHeader("imperialAudience", t)}</span>} />,
    },
    { row: "recognitionOverflow", node: <RulesDetail subject={{ kind: "recognitionOverflow" }} title={overflow} trigger={<span className="score-rule">{overflow}</span>} /> },
    {
      row: "connoisseur",
      node: (
        <RulesDetail
          subject={{ kind: "tech", id: KILN_TECHS.connoisseur }}
          ownerId={owner?.playerId ?? null}
          trigger={<span className="score-rule">{rowHeader("connoisseur", t)}</span>}
        />
      ),
    },
  ];
  return (
    <div className="results-rules">
      <span className="results-rules-label">{t("results.rowRules")}</span>
      <ul className="results-rules-list">
        {items.map((item) => (
          <li key={item.row} data-rules-row={item.row}>
            {item.node}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExhibitionCell({ playerId, score }: { playerId: PlayerId; score: FinalScoreBreakdown["exhibition"] }) {
  const t = useT();
  const ceramics = useTableCeramics();
  const known = score.ceramicIds.every((id) => ceramics.facts(id) !== null);
  return (
    <div className="score-exhib">
      <b className="num">{num(score.total)}</b>
      <span className="score-exhib-parts">{t("results.exhib", { q: score.qualityVp, s: score.shapesBonus, g: score.glazesBonus })}</span>
      {score.ceramicIds.length === 0 ? (
        <span className="score-exhib-parts">{t("results.exhibNone")}</span>
      ) : known ? (
        <ul className="score-exhib-cers" aria-label={t("results.exhibCeramics")}>
          {score.ceramicIds.map((id) => (
            <li key={id}>
              <KilnCeramic id={id} ownerId={playerId} size={26} interactive={false} />
            </li>
          ))}
        </ul>
      ) : (
        <span className="score-exhib-parts">{t("results.exhibCount", { n: score.ceramicIds.length })}</span>
      )}
    </div>
  );
}

function decidedText(result: FinalResult, t: Translator): string {
  switch (result.resolvedBy) {
    case "total_vp":
      return t("results.decidedByTotal");
    case "shared_victory":
      return t("results.decidedShared");
    default: {
      const step = TIE_BREAK_ORDER.find((candidate) => candidate.resolvedBy === result.resolvedBy);
      return step === undefined ? t("results.decidedByTotal") : t("results.decidedBy", { criterion: t(TIE_KEYS[step.key]) });
    }
  }
}

export function ResultsSection() {
  const t = useT();
  const model = useGame();
  const result = model.finalResult;
  if (result === null) return null;
  const standings = result.standings;
  const playerIds = standings.map((standing) => standing.playerId);
  const shared = result.resolvedBy === "shared_victory";
  const winners = new Set(result.winnerIds);
  const tiedFirst = standings.filter((standing) => standing.rank === 1);
  const head = (
    <tr>
      <th scope="col">
        <span className="sr-only">{t("results.player")}</span>
      </th>
      {playerIds.map((playerId) => (
        <th key={playerId} scope="col" style={seatStyle(model, playerId)}>
          <span className="score-swatch" aria-hidden="true" />
          {playerLabel(model, t, playerId)}
        </th>
      ))}
    </tr>
  );
  return (
    <div className="results">
      <ol className="podium" aria-label={t("results.podium")}>
        {standings.map((standing) => {
          const won = winners.has(standing.playerId);
          const player = model.players.find((summary) => summary.playerId === standing.playerId);
          const rank = won ? (shared ? t("results.sharedVictory") : t("results.winner")) : t("results.rank", { n: standing.rank });
          return (
            <li key={standing.playerId} className={won ? "stand stand--win" : "stand"} style={seatStyle(model, standing.playerId)} data-player-id={standing.playerId}>
              <span className="stand-rank">{rank}</span>
              <span className="stand-name">{playerLabel(model, t, standing.playerId)}</span>
              <span className="stand-total">{t.rich("results.totalVp", { n: standing.total })}</span>
              {player === undefined || player.kilnId === null ? null : (
                <RulesDetail subject={{ kind: "kiln", id: player.kilnId }} ownerId={player.playerId} trigger={<span className="stand-kiln">{kilnName(player.kilnId, t.locale)}</span>} />
              )}
            </li>
          );
        })}
      </ol>
      <p className="results-decided">{decidedText(result, t)}</p>

      <section className="results-block" aria-labelledby="results-score-title">
        <h3 id="results-score-title" className="results-title">{t("results.scoreTitle")}</h3>
        {/* Focusable: on a phone the table scrolls inside this box, and a keyboard user scrolls it. */}
        <div className="calc-wrap" role="group" aria-labelledby="results-score-title" tabIndex={0}>
          <table className="calc score">
            <thead>{head}</thead>
            <tbody>
              {SCORE_BREAKDOWN_ROWS.map((row) => (
                <tr key={row} className={row === "total" ? "score-total" : undefined} data-row={row}>
                  <th scope="row">{rowHeader(row, t)}</th>
                  {playerIds.map((playerId) => {
                    const score = result.scores[playerId];
                    if (score === undefined) return <td key={playerId} />;
                    if (row === "exhibition") {
                      return (
                        <td key={playerId}>
                          <ExhibitionCell playerId={playerId} score={score.exhibition} />
                        </td>
                      );
                    }
                    const value = score[row];
                    return (
                      <td key={playerId} className={row === "techs" ? "score-a1 num" : "num"}>
                        {row === "total" ? <b>{num(value)}</b> : num(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="results-note">{t("results.a1note", { n: RULE_NUMBERS.techVp })}</p>
        <RowRules model={model} t={t} />
      </section>

      <section className="results-block" aria-labelledby="results-tie-title">
        <div className="results-head">
          <h3 id="results-tie-title" className="results-title">{t("results.tieTitle")}</h3>
          {tiedFirst.length > 1 ? (
            <span className="results-meta">{t("results.tied", { names: list(tiedFirst.map((standing) => playerLabel(model, t, standing.playerId)), t.locale) })}</span>
          ) : null}
        </div>
        <div className="calc-wrap" role="group" aria-labelledby="results-tie-title" tabIndex={0}>
          <table className="calc score">
            <thead>{head}</thead>
            <tbody>
              {TIE_BREAK_ORDER.map((step) => {
                const decisive = step.resolvedBy === result.resolvedBy;
                return (
                  <tr key={step.key} className={decisive ? "tie-decisive" : undefined} data-tie={step.key}>
                    <th scope="row">
                      {t(TIE_KEYS[step.key])}
                      {decisive ? <span className="tie-mark">{t("results.decisive")}</span> : null}
                    </th>
                    {playerIds.map((playerId) => {
                      const standing = standings.find((candidate) => candidate.playerId === playerId);
                      return (
                        <td key={playerId} className="num">
                          {standing === undefined ? null : num(standing.tieBreak[step.key])}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr className={shared ? "tie-decisive" : undefined} data-tie="shared_victory">
                <th scope="row">
                  {t("results.tie.shared")}
                  {shared ? <span className="tie-mark">{t("results.decisive")}</span> : null}
                </th>
                {playerIds.map((playerId) => (
                  <td key={playerId}>{shared && winners.has(playerId) ? t("results.yes") : t("results.no")}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
