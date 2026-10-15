/**
 * WorldSections (UI_V1.6.1_ARCHITECTURE §4.1, §4.2). Owner: B1 (shell, log, lobby).
 * Source: wireframe `sectionOrder`, `SEC_TAB`, `sectionHtml`, `jump`.
 *
 * Phase A stub created by A2 (§4.3 rule 1). Its **imports are fixed in phase A** (they name every
 * B2 and B3 section component by its final path), so they never change in phase B; B1 adds the
 * section headings, the phone-section visibility and the jump bar's behaviour around them.
 *
 * Sections, in `sectionOrder(model.roundPhase)` order (`state/uiStore.ts`):
 * - `firing`: FiringStage (D3: takes over the column during the Firing Phase);
 * - `results`: ResultsSection;
 * - `table`: KilnMini and CentralBoard;
 * - `orders`: LookedOrders, OrderDisplay, HandRow, FinishedCeramicsStrip, PublicHands;
 * - `progress`: RecognitionTrack and TechDisplay;
 * - `kiln`: IdleFiringRecap and KilnBlock;
 * - `workshops`: BoardArea (D1).
 *
 * Each section is `#sec-<id>` (the `jumpTo` scroll target) with `data-tab` naming its phone tab.
 */
import type { ReactNode } from "react";
import { BoardArea } from "../boards/BoardArea.tsx";
import { FiringStage } from "../firing/FiringStage.tsx";
import { IdleFiringRecap } from "../kiln/IdleFiringRecap.tsx";
import { KilnBlock } from "../kiln/KilnBlock.tsx";
import { ResultsSection } from "../results/ResultsSection.tsx";
import { useModel, useUi } from "../state/hooks.ts";
import { SECTION_TAB, sectionOrder } from "../state/uiStore.ts";
import type { WorldSectionId } from "../state/uiStore.ts";
import { CentralBoard } from "../table/CentralBoard.tsx";
import { FinishedCeramicsStrip } from "../table/FinishedCeramicsStrip.tsx";
import { HandRow } from "../table/HandRow.tsx";
import { KilnMini } from "../table/KilnMini.tsx";
import { LookedOrders } from "../table/LookedOrders.tsx";
import { OrderDisplay } from "../table/OrderDisplay.tsx";
import { PublicHands } from "../table/PublicHands.tsx";
import { RecognitionTrack } from "../table/RecognitionTrack.tsx";
import { TechDisplay } from "../table/TechDisplay.tsx";
import { JumpNav } from "./JumpNav.tsx";

/** The content of each world section. */
const SECTION_CONTENT: Readonly<Record<WorldSectionId, () => ReactNode>> = {
  firing: () => <FiringStage />,
  results: () => <ResultsSection />,
  table: () => (
    <>
      <KilnMini />
      <CentralBoard />
    </>
  ),
  orders: () => (
    <>
      <LookedOrders />
      <OrderDisplay />
      <HandRow />
      <FinishedCeramicsStrip />
      <PublicHands />
    </>
  ),
  progress: () => (
    <>
      <RecognitionTrack />
      <TechDisplay />
    </>
  ),
  kiln: () => (
    <>
      <IdleFiringRecap />
      <KilnBlock />
    </>
  ),
  workshops: () => <BoardArea />,
};

export function WorldSections() {
  const phase = useModel((model) => model.roundPhase);
  const { section: currentTab } = useUi();
  return (
    <>
      <JumpNav />
      {sectionOrder(phase).map((id) => (
        <section
          key={id}
          id={`sec-${id}`}
          className="world-section"
          data-section={id}
          data-tab={SECTION_TAB[id]}
          data-current={SECTION_TAB[id] === currentTab ? "" : undefined}
          data-focus-fallback=""
        >
          {SECTION_CONTENT[id]()}
        </section>
      ))}
    </>
  );
}
