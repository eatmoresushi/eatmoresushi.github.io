/**
 * SessionMenu (UI_V1.6.1_ARCHITECTURE §4.1, §8.1). Owner: B1 (shell, log, lobby).
 * Source: V1.4 `App.tsx` in-game session controls.
 *
 * The top bar's menu button (`kit/MenuButton`: `aria-haspopup="menu"`, arrow keys, Escape):
 * - Theme: Light / Dark / System (radio items; applied and stored through `useUi().setTheme`);
 * - the room code, which it copies (said through the one polite live region);
 * - Leave view: back to the home screen, the seat kept so it can be resumed;
 * - End session (host only): opens the destructive confirmation (`EndSessionDialog`).
 */
import { useState } from "react";
import { useT } from "../i18n/I18nProvider.tsx";
import { msg } from "../i18n/translator.ts";
import { MenuButton } from "../kit/MenuButton.tsx";
import type { MenuItem } from "../kit/MenuButton.tsx";
import { THEME_CHOICES } from "../kit/ThemeToggle.tsx";
import type { ThemeChoice } from "../kit/ThemeToggle.tsx";
import { EndSessionDialog } from "../lobby/EndSessionDialog.tsx";
import { useSession, useUi } from "../state/hooks.ts";
import { announcePolite } from "./announce.ts";

const THEME_KEY = {
  light: "common.theme.light",
  dark: "common.theme.dark",
  system: "common.theme.system",
} as const satisfies Readonly<Record<ThemeChoice, string>>;

/** Copies text to the clipboard; false when the browser refuses. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || navigator.clipboard === undefined) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function SessionMenu() {
  const t = useT();
  const session = useSession();
  const ui = useUi();
  const [ending, setEnding] = useState(false);
  const code = session.room?.code ?? null;

  const themeGroup = t("common.theme.label");
  const items: MenuItem[] = THEME_CHOICES.map((choice) => ({
    id: `theme-${choice}`,
    label: t(THEME_KEY[choice]),
    checked: ui.theme === choice,
    group: themeGroup,
    keepOpen: true,
    onSelect: () => ui.setTheme(choice),
  }));
  if (code !== null) {
    items.push({
      id: "room-code",
      label: t("shell.menu.roomCode", { code }),
      onSelect: () => {
        void copyText(code).then((copied) => {
          if (copied) announcePolite(msg("shell.menu.copied", { code }));
          else announcePolite(msg("shell.menu.copyFailed", { code }));
        });
      },
    });
  }
  items.push({ id: "leave", label: t("shell.menu.leave"), onSelect: () => session.leave() });
  if (session.isHost) {
    items.push({ id: "end-session", label: t("shell.menu.endSession"), danger: true, onSelect: () => setEnding(true) });
  }

  return (
    <>
      <MenuButton
        className="session-menu"
        label={<span className="session-menu-glyph" aria-hidden="true">⋯</span>}
        ariaLabel={t("shell.menu.label")}
        items={items}
        align="end"
      />
      {session.isHost ? <EndSessionDialog open={ending} onClose={() => setEnding(false)} /> : null}
    </>
  );
}
