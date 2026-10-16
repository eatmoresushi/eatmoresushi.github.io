/**
 * IdleFiringRecap (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B3 (kiln, firing stage, results, playtest).
 * Source: wireframe `idleStage`: the last firing from `firingRecap` (gap 18).
 *
 * Between firings (the Kiln section), the idle stage keeps the last firing visible, as
 * `UI_UX_SPEC` asks: "Kiln Die + Contributions = Base Heat; Fire → Global Heat" and the Quality
 * each ceramic recorded, plus this round's Kiln Die and the open Fire discard (D4). It reads
 * `firingRecapView` only (no heat ledger, D3). A round in which nothing was loaded (the public
 * `FIRING_SKIPPED` event in the log) is noted; before the first firing it says so.
 */
import type { FiringStageView } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { contributionCardName } from "../i18n/content.ts";
import { list } from "../i18n/format.ts";
import type { Translator } from "../i18n/translator.ts";
import { FireDiscard } from "../firing/FireDiscard.tsx";
import { FireCard } from "../pieces/FireCard.tsx";
import { KilnDie } from "../pieces/KilnDie.tsx";
import { useGame, useLog } from "../state/hooks.ts";
import type { GameModel } from "../state/model.ts";
import { KilnCeramic } from "./KilnCeramic.tsx";
import { playerLabel } from "./names.ts";
import "./IdleFiringRecap.css";

function contributionsText(recap: FiringStageView, model: GameModel, t: Translator): string {
  const revealed = recap.contributions.flatMap((entry) =>
    entry.revealed === null ? [] : [t("kiln.recap.contribution", { name: playerLabel(model, t, entry.playerId), card: contributionCardName(entry.revealed.card, t.locale) })],
  );
  return revealed.length === 0 ? t("kiln.recap.noContributions") : list(revealed, t.locale);
}

function Recap({ recap }: { recap: FiringStageView }) {
  const t = useT();
  const model = useGame();
  const fired = recap.ceramics.filter((record) => !record.salvaged);
  return (
    <div className="recap-last">
      <h4 className="recap-title">{t("kiln.recap.title", { r: recap.round })}</h4>
      {recap.baseHeat === null ? null : (
        <p className="recap-line">
          {t.rich("kiln.recap.lineBase", { die: recap.kilnDie, contributions: contributionsText(recap, model, t), base: recap.baseHeat })}
        </p>
      )}
      {recap.fireModifier === null || recap.globalHeat === null ? null : (
        <p className="recap-line">
          {t.rich("kiln.recap.lineGlobal", { fire: <FireCard value={recap.fireModifier} />, global: recap.globalHeat })}
        </p>
      )}
      {fired.length === 0 ? null : (
        <ul className="recap-cers" aria-label={t("kiln.recap.results")}>
          {fired.map((record) => (
            <li key={record.id}>
              <KilnCeramic id={record.id} ownerId={record.ownerId} quality={record.quality} crackle={record.crackle} extraFire={record.secondFireModifier} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function IdleFiringRecap() {
  const t = useT();
  const model = useGame();
  const { log } = useLog();
  const recap = model.firingRecap;
  const skipped = log
    .filter((entry) => entry.event.type === "FIRING_SKIPPED")
    .map((entry) => (entry.event.type === "FIRING_SKIPPED" ? entry.event.round : 0))
    .filter((round) => recap === null || round > recap.round);
  const lastSkipped = skipped.length === 0 ? null : Math.max(...skipped);
  return (
    <div className="recap">
      <div className="recap-banner">
        <h3 className="recap-heading">{t("kiln.recap.label")}</h3>
        <span className="recap-die">
          <span>{t("kiln.recap.dieThisRound")}</span>
          <KilnDie value={model.board.kilnDie?.value ?? null} />
        </span>
        <span className="recap-discard">
          <FireDiscard discard={model.board.fireDiscard} />
        </span>
      </div>
      <div className="recap-body">
        {lastSkipped === null ? null : <p className="recap-skipped">{t("kiln.recap.skipped", { r: lastSkipped })}</p>}
        {recap === null ? <p className="recap-none">{t("kiln.recap.none")}</p> : <Recap recap={recap} />}
      </div>
    </div>
  );
}
