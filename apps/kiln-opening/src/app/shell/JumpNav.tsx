/**
 * JumpNav (UI_V1.6.1_ARCHITECTURE §4.1, §4.2). Owner: B1 (shell, log, lobby).
 * Source: wireframe `jump`, `jumpTo`.
 *
 * The desktop and tablet jump bar at the top of the world: one button per section, in the
 * phase's section order, that scrolls to it (`useUi().jumpTo`, which on phones switches the
 * section tab instead). Sticky inside the world's scroll area; hidden on phones, where the phone
 * section bar (`PhoneNav`) does the same job.
 */
import { useT } from "../i18n/I18nProvider.tsx";
import { useModel, useUi } from "../state/hooks.ts";
import { sectionOrder } from "../state/uiStore.ts";
import { SECTION_TITLE, sectionId } from "./sections.ts";

export function JumpNav() {
  const t = useT();
  const phase = useModel((model) => model.roundPhase);
  const ui = useUi();
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
      <span className="jump-nav-hint">{t("shell.jump.hint")}</span>
    </nav>
  );
}
