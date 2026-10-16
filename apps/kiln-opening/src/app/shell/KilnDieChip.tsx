/**
 * KilnDieChip (UI_V1.6.1_ARCHITECTURE §4.1, §4.2). Owner: B1 (shell, log, lobby).
 * Source: wireframe `topBar` `die-chip`.
 *
 * This round's public Kiln Die result (`board.kilnDie`), rolled at the Start of every round. The
 * visible label is decoration; the die itself reads "Kiln Die: 2" (or "not rolled yet").
 */
import { useT } from "../i18n/I18nProvider.tsx";
import { KilnDie } from "../pieces/KilnDie.tsx";
import { useModel } from "../state/hooks.ts";

export function KilnDieChip() {
  const t = useT();
  const value = useModel((model) => model.board.kilnDie?.value ?? null);
  return (
    <span className="die-chip">
      <span className="die-chip-label" aria-hidden="true">
        {t("shell.kilnDie")}
      </span>
      <KilnDie value={value} />
    </span>
  );
}
