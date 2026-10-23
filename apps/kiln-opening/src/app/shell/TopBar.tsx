/**
 * TopBar (UI_V1.6.1_ARCHITECTURE §4.1, §4.2, §7.3, §8). Owner: B1 (shell, log, lobby).
 * Source: wireframe `topBar`.
 *
 * `<header>`: brand (the screen's `<h1>`) · round · PhaseStrip · KilnDieChip · then the tools
 * (GameLog · LanguageSwitch · SessionMenu) and the SeatChips, in this order in the markup at every
 * width (§7.3: layout is CSS). The drawn order follows the markup at every width, so the Tab
 * order matches what is seen (WCAG 2.4.3):
 * - Desktop and tablet (900px and wider, not short landscape): one row ending with the tools. The
 *   seat chips sit in the world's jump bar instead, after the section buttons (`JumpNav`; owner
 *   review, 2026-10-17), so the bar is never crammed.
 * - Below 900px, two rows: round ("2/5") · current phase (number and label) · Kiln Die (the die
 *   face) · Log (icon) · language · menu, then the seat chips, which scroll inside their own row
 *   and keep the acting (else the viewer's) chip in view. The words "Round 2/5" and "Kiln Die",
 *   the brand (the `<h1>`) and the other phases stay readable by assistive technology. On the
 *   narrowest phones, where the tools do not fit on row one, they start row two and the chips
 *   scroll beside them, so the bar is still two rows.
 * - Short landscape: one compact row, the chips scrolling after the tools.
 */
import { useT } from "../i18n/I18nProvider.tsx";
import { RULE_NUMBERS } from "../i18n/content.ts";
import { useLayoutMode, useModel } from "../state/hooks.ts";
import { isPhone } from "../state/layoutMode.ts";
import { GameLog } from "./GameLog.tsx";
import { KilnDieChip } from "./KilnDieChip.tsx";
import { LanguageSwitch } from "./LanguageSwitch.tsx";
import { PhaseStrip } from "./PhaseStrip.tsx";
import { SeatChips } from "./SeatChips.tsx";
import { SessionMenu } from "./SessionMenu.tsx";
import "./TopBar.css";

export function TopBar() {
  const t = useT();
  const round = useModel((model) => model.round);
  const phone = isPhone(useLayoutMode());
  return (
    <header className="top-bar">
      <h1 className="top-bar-brand">{t("shell.brand")}</h1>
      <div className="top-bar-round">
        <span className="top-bar-round-full">{t.rich("common.roundN", { n: round, total: RULE_NUMBERS.rounds })}</span>
        <span className="top-bar-round-short num" aria-hidden="true">
          {t.rich("shell.roundShort", { n: round, total: RULE_NUMBERS.rounds })}
        </span>
      </div>
      <PhaseStrip />
      <KilnDieChip />
      <div className="top-bar-end">
        <div className="top-bar-tools">
          <GameLog />
          <LanguageSwitch />
          <SessionMenu />
        </div>
        {phone ? (
          <div className="top-bar-seats">
            <SeatChips />
          </div>
        ) : null}
      </div>
    </header>
  );
}
