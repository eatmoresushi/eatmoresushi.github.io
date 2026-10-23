/**
 * ThemeToggle (kit, §7.1): Light / Dark / System. Controlled: the shell's SessionMenu passes the
 * stored choice and applies it (`theme.ts` `applyTheme`, A2), so this file reads no storage.
 */
import { useT } from "../i18n/I18nProvider.tsx";
import "./Toggles.css";

/** The stored theme choice (`kiln-opening:theme`). */
export type ThemeChoice = "light" | "dark" | "system";

export const THEME_CHOICES: readonly ThemeChoice[] = ["light", "dark", "system"];

export interface ThemeToggleProps {
  value: ThemeChoice;
  onChange: (choice: ThemeChoice) => void;
  className?: string;
}

export function ThemeToggle({ value, onChange, className }: ThemeToggleProps) {
  const t = useT();
  const name = (choice: ThemeChoice) =>
    choice === "light" ? t("common.theme.light") : choice === "dark" ? t("common.theme.dark") : t("common.theme.system");
  return (
    <div className={["kit-seg", className ?? ""].filter((part) => part !== "").join(" ")} role="group" aria-label={t("common.theme.label")}>
      {THEME_CHOICES.map((choice) => (
        <button key={choice} type="button" className="kit-seg-btn" aria-pressed={value === choice} onClick={() => onChange(choice)}>
          {name(choice)}
        </button>
      ))}
    </div>
  );
}
