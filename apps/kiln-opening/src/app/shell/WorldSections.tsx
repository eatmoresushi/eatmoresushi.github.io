/**
 * WorldSections (UI_V1.6.1_ARCHITECTURE §4.1, §4.2, §7.3, §8.2). Owner: B1 (shell, log, lobby).
 * Source: wireframe `sectionOrder`, `SEC_TAB`, `sectionHtml`, `jump`.
 *
 * Its **imports were fixed in phase A** (they name every B2 and B3 section component by its
 * final path). B1 adds the section headings and the phone-section visibility. The jump bar
 * (`JumpNav`) is a row of the shell above the world, not part of it (`GameShell`; owner review
 * 2026-10-17, item 3).
 *
 * Sections, in `sectionOrder(model.roundPhase)` order (`state/uiStore.ts`):
 * - `firing`: FiringStage (D3: takes over the column during the Firing Phase);
 * - `results`: ResultsSection;
 * - `table`: KilnMini and CentralBoard;
 * - `orders`: OrderDisplay, LookedOrders, HandRow and FinishedCeramicsStrip; the hand before the
 *   display outside the Work Phase (wireframe `secOrders`). There is no public-hands block (owner
 *   review, 2026-10-17): the seat chips show every hand count, and someone else's private look is
 *   said by the waiting pane, the live region, the log and the turn toasts;
 * - `progress`: RecognitionTrack and TechDisplay;
 * - `kiln`: IdleFiringRecap and KilnBlock;
 * - `workshops`: BoardArea (D1).
 *
 * Each section is `#sec-<id>` (the `jumpTo` scroll target) with `data-tab` naming its phone tab
 * and `data-current` on the sections of the current phone tab. Markup is identical at every
 * width (§7.3): below 900px the CSS hides the sections of the other tabs (the one width-dependent
 * hiding the plan allows besides the collapsed sheet). Each heading is `tabIndex={-1}`, the
 * focus target of the section switch and of focus rescue (§8.2), and each section is a
 * `data-focus-fallback` container.
 */
import type { ReactNode } from "react";
import { BoardArea } from "../boards/BoardArea.tsx";
import { FiringStage } from "../firing/FiringStage.tsx";
import { useT } from "../i18n/I18nProvider.tsx";
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
import { RecognitionTrack } from "../table/RecognitionTrack.tsx";
import { TechDisplay } from "../table/TechDisplay.tsx";
import { SECTION_TITLE, sectionHeadingId, sectionId } from "./sections.ts";
import "./WorldSections.css";

/**
 * The Orders section in the wireframe's `secOrders` order: in the Work Phase the Main display
 * comes first (reservations happen there), then the private look and the hand; in every other
 * phase the hand (and, in the Order Phase, the Finished ceramics strip) comes first, so the
 * player does not scroll past six display cards to reach the Orders they act on.
 */
function OrdersContent() {
  const work = useModel((model) => model.roundPhase === "work");
  if (work) {
    return (
      <>
        <OrderDisplay />
        <LookedOrders />
        <HandRow />
        <FinishedCeramicsStrip />
      </>
    );
  }
  return (
    <>
      <LookedOrders />
      <HandRow />
      <FinishedCeramicsStrip />
      <OrderDisplay />
    </>
  );
}

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
  orders: () => <OrdersContent />,
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

function SectionSub({ id }: { id: WorldSectionId }) {
  const t = useT();
  const playerCount = useModel((model) => model.players.length);
  switch (id) {
    case "table":
      return <span className="world-section-sub">{t("shell.section.tableSub", { n: playerCount })}</span>;
    case "workshops":
      return <span className="world-section-sub">{t("shell.section.workshopsSub")}</span>;
    default:
      return null;
  }
}

export function WorldSections() {
  const t = useT();
  const phase = useModel((model) => model.roundPhase);
  const { section: currentTab } = useUi();
  return (
    <>
      {sectionOrder(phase).map((id) => (
        <section
          key={id}
          id={sectionId(id)}
          className="world-section"
          data-section={id}
          data-tab={SECTION_TAB[id]}
          data-current={SECTION_TAB[id] === currentTab ? "" : undefined}
          data-focus-fallback=""
          aria-labelledby={sectionHeadingId(id)}
        >
          <div className="world-section-head">
            <h2 id={sectionHeadingId(id)} className="world-section-title" tabIndex={-1}>
              {t(SECTION_TITLE[id])}
            </h2>
            <SectionSub id={id} />
          </div>
          <div className="world-section-body">{SECTION_CONTENT[id]()}</div>
        </section>
      ))}
    </>
  );
}
