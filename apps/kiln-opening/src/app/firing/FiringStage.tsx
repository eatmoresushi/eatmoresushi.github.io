/**
 * FiringStage (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B3 (kiln, firing stage, results, playtest).
 * Source: wireframe `firingStage`: D3 takes over the column in the Firing Phase (`firingStage`, gap 7).
 *
 * Owner decision D3: during the Firing Phase the stage is the first world section (B1's
 * `sectionOrder`) and shows only what the physical table shows:
 * - a banner with the open Appendix D step, whose turn it is ("Your turn" when the viewer acts)
 *   and the queue or the Contribution submissions (`QueueRow`);
 * - the step rail (`StepRail`) with First-Player marks;
 * - the heat equation (`HeatEquation`), Second Firing's 2 revealed Fire cards included while
 *   their owner chooses one (v1.6.2 L646);
 * - public firing records: Test Pieces (who paid, whether the card was buried; never the card)
 *   and the card Second Firing fired a ceramic again with (both cards then lie in the discard).
 *   Nothing is sold during the firing (owner revision 5, owner ruling R26: no free actions then);
 * - the kiln (`KilnBlock`) with Kiln Master's marker, modifiers and each recorded Quality;
 * - the open Fire discard (in the equation; D4).
 * It reads `firingStage` (`firingStageView`) only: no heat ledger, no previews, no odds.
 */
import type { FiringStageView, TechId } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { KILN_TECHS } from "../i18n/catalog/kiln.ts";
import { firingStepCount, techName } from "../i18n/content.ts";
import { signed } from "../i18n/format.ts";
import { KilnBlock } from "../kiln/KilnBlock.tsx";
import { kilnCeramicLabel } from "../kiln/KilnCeramic.tsx";
import { useTableCeramics } from "../kiln/tableCeramics.ts";
import { RulesDetail } from "../rules/RulesDetail.tsx";
import { playerLabel } from "../kiln/names.ts";
import { useGame } from "../state/hooks.ts";
import type { GameModel } from "../state/model.ts";
import type { Translator } from "../i18n/translator.ts";
import { HeatEquation } from "./HeatEquation.tsx";
import { QueueRow } from "./QueueRow.tsx";
import { StepRail } from "./StepRail.tsx";
import "./FiringStage.css";

function Records({ stage, model, t }: { stage: FiringStageView; model: GameModel; t: Translator }) {
  const ceramics = useTableCeramics();
  const testPieces = techName(KILN_TECHS.testPieces, t.locale);
  const secondFiring = techName(KILN_TECHS.secondFiring, t.locale);
  const lines: { key: string; text: string; tech: TechId | null }[] = [
    ...stage.testPieces.map((record) => ({
      key: `tp:${record.playerId}`,
      text: !record.peeked
        ? t("kiln.record.testPiecesDeclined", { name: playerLabel(model, t, record.playerId), tech: testPieces })
        : record.buried
          ? t("kiln.record.testPiecesBuried", { name: playerLabel(model, t, record.playerId), tech: testPieces })
          : t("kiln.record.testPiecesPeeked", { name: playerLabel(model, t, record.playerId), tech: testPieces }),
      tech: KILN_TECHS.testPieces,
    })),
    // Second Firing's chosen card (v1.6.2 L646): both cards are in the discard now, so the
    // record says which one fired the ceramic again, as the game log does.
    ...stage.ceramics.flatMap((record) =>
      record.secondFireModifier === null
        ? []
        : [{
            key: `second:${record.id}`,
            text: t("kiln.record.secondFired", { ceramic: kilnCeramicLabel(ceramics, record.id, record.ownerId, t, record.quality), value: signed(record.secondFireModifier), tech: secondFiring }),
            tech: KILN_TECHS.secondFiring,
          }],
    ),
  ];
  if (lines.length === 0) return null;
  return (
    <ul className="stage-records">
      {lines.map((line) => (
        <li key={line.key}>
          {line.tech === null ? line.text : <RulesDetail subject={{ kind: "tech", id: line.tech }} trigger={<span>{line.text}</span>} />}
        </li>
      ))}
    </ul>
  );
}

export function FiringStage() {
  const t = useT();
  const model = useGame();
  const stage = model.firingStage;
  if (stage === null) {
    return (
      <div className="stage" data-webgl-mount="firing-stage">
        <p className="stage-idle">{t("kiln.stage.notStarted")}</p>
        <div className="stage-main">
          <KilnBlock />
        </div>
      </div>
    );
  }
  const total = firingStepCount();
  // Test Pieces resolves at the end of step 1 (L645, L689: after Base Heat is determined,
  // before the Fire card is revealed), in First Player order: the queue tells it from step 1's
  // secret Contributions.
  const testPieces = stage.step === 1 && stage.queue !== null;
  const title = testPieces
    ? t("kiln.stage.testPieces", { tech: techName(KILN_TECHS.testPieces, t.locale) })
    : t.dynamic(`kiln.step.${String(stage.step)}.full`);
  const acting = model.viewerActs;
  return (
    <div className="stage" data-webgl-mount="firing-stage" data-step={stage.step}>
      <div className="stage-banner">
        <span className="stage-eyebrow">
          {acting ? t("kiln.stage.eyebrowYou", { n: stage.step, total }) : t("kiln.stage.stepOf", { n: stage.step, total })}
        </span>
        <h3 className="stage-title">{title}</h3>
        <QueueRow stage={stage} />
        {acting ? <span className="stage-go">{t("kiln.stage.decide")}</span> : null}
      </div>
      <StepRail stage={stage} />
      <HeatEquation stage={stage} />
      <Records stage={stage} model={model} t={t} />
      <div className="stage-main">
        <KilnBlock />
      </div>
    </div>
  );
}
