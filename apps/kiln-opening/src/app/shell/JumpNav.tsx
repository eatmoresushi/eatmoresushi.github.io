/**
 * JumpNav (UI_V1.6.1_ARCHITECTURE §4.1, §4.2). Owner: B1 (shell, log, lobby).
 * Source: wireframe `jump`, `jumpTo`.
 *
 * The desktop and tablet jump bar above the world: one button per section, in the phase's
 * section order, that scrolls to it (`useUi().jumpTo`, which on phones switches the section tab
 * instead). `GameShell` draws it in a row of its own right above the world's scroll area (owner
 * review 2026-10-17, item 3: so that the other players' turn toast, drawn below it, lies over
 * nothing); hidden on phones, where the phone section bar (`PhoneNav`) does the same job.
 *
 * On desktop and tablet the seat chips (D2) follow the section buttons and fill the rest of the
 * row, scrolling inside it when they do not fit (owner review, 2026-10-17); on phones they stay in
 * the top bar. The "sections follow the phase" hint is read by assistive technology only.
 */
import { useT } from "../i18n/I18nProvider.tsx";
import { useLayoutMode, useModel, useUi } from "../state/hooks.ts";
import { isPhone } from "../state/layoutMode.ts";
import { sectionOrder } from "../state/uiStore.ts";
import { SeatChips } from "./SeatChips.tsx";
import { SECTION_TITLE, sectionId } from "./sections.ts";

export function JumpNav() {
  const t = useT();
  const phase = useModel((model) => model.roundPhase);
  const ui = useUi();
  const phone = isPhone(useLayoutMode());
  return (
    <nav className="jump-nav" aria-label={t("shell.jump.label")}>
      <ul className="jump-nav-list">
        {sectionOrder(phase).map((id) => (
          <li key={id}>
            <button type="button" className="jump-nav-button" aria-controls={sectionId(id)} data-jump={id} onClick={() => ui.jumpTo(id)}>
              {t(SECTION_TITLE[id])}
            </button>
          </li>
        ))}
      </ul>
      {phone ? null : (
        <div className="jump-nav-seats">
          <SeatChips />
        </div>
      )}
      <span className="jump-nav-hint sr-only">{t("shell.jump.hint")}</span>
    </nav>
  );
}
