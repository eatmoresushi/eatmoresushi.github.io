/**
 * Meta (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B3 (kiln, firing stage, results, playtest).
 * Source: Playtest Form V3: session details.
 *
 * The date, the player count (2–4 from content; resizing keeps entries and re-runs
 * `reconcileFiringTechOwnership`), the rules version (read only), the First Player and the winner.
 */
import { GAME_CONFIG } from "../../../game/index.ts";
import type { PlayerCount } from "../../../game/index.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { num } from "../../i18n/format.ts";
import { setPlayerCount } from "../draftOps.ts";
import type { SectionProps } from "../draftOps.ts";
import { Field, FormSection, SelectField } from "../formParts.tsx";
import { draftPlayerName, fieldId } from "../issueText.ts";

const PLAYER_COUNTS: readonly PlayerCount[] = Array.from(
  { length: GAME_CONFIG.players.max - GAME_CONFIG.players.min + 1 },
  (_, index) => (GAME_CONFIG.players.min + index) as PlayerCount,
);

export function Meta({ draft, edit, index }: SectionProps & { index: number }) {
  const t = useT();
  const seats = draft.players.map((_, seat) => ({ value: String(seat), label: draftPlayerName(draft, seat, t) }));
  return (
    <FormSection index={index} title={t("playtest.meta.title")} description={t("playtest.meta.description")}>
      <div className="pt-grid pt-grid--four">
        <Field label={t("playtest.meta.date")} path="playedOn">
          <input id={fieldId("playedOn")} name="playedOn" type="date" value={draft.playedOn} required onChange={(event) => edit((current) => ({ ...current, playedOn: event.target.value }))} />
        </Field>
        <SelectField
          label={t("playtest.meta.players")}
          path="playerCount"
          value={String(draft.playerCount)}
          options={PLAYER_COUNTS.map((count) => ({ value: String(count), label: num(count) }))}
          onChange={(value) => edit(setPlayerCount(Number(value) as PlayerCount))}
        />
        <Field label={t("playtest.meta.rulesVersion")} path="rulesVersion">
          <input id={fieldId("rulesVersion")} name="rulesVersion" value={t("playtest.meta.version", { version: draft.rulesVersion })} readOnly aria-readonly="true" />
        </Field>
        <SelectField
          label={t("playtest.meta.firstPlayer")}
          path="firstPlayerIndex"
          value={String(draft.firstPlayerIndex)}
          options={seats}
          onChange={(value) => edit((current) => ({ ...current, firstPlayerIndex: Number(value) }))}
        />
        <SelectField
          label={t("playtest.meta.winner")}
          path="winnerIndex"
          value={String(draft.winnerIndex)}
          options={seats}
          onChange={(value) => edit((current) => ({ ...current, winnerIndex: Number(value) }))}
        />
      </div>
    </FormSection>
  );
}
