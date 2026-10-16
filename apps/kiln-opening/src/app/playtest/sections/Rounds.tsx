/**
 * Rounds (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B3 (kiln, firing stage, results, playtest).
 * Source: Playtest Form V3: rounds.
 *
 * One disclosure per round (the first open): the round's Kiln Die (its faces from content),
 * each player's Contribution, ceramics loaded into the Shared and Imperial Kilns, Orders
 * completed and Kiln ability uses, the Fire card, Base Heat (`roundBaseHeat`) and Global Heat,
 * and the Firing Techs used. Bank −2 / Stoke +2 are offered only to the player who owns Fuel
 * Ledger (T12); `reconcileFiringTechOwnership` clears them when that changes.
 */
import type { FireModifier, TechId } from "../../../game/index.ts";
import { roundBaseHeat, sharedKilnCapacity } from "../../../playtest/model.ts";
import { FIRE_CONTRIBUTIONS, FIRING_TECH_IDS, FUEL_LEDGER_TECH_ID, KILN_DIE_FACES, contributionHeat } from "../../../playtest/schema.ts";
import type { FireContribution } from "../../../playtest/types.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { RULE_NUMBERS, contributionCardName, techName } from "../../i18n/content.ts";
import { num, signed } from "../../i18n/format.ts";
import type { Translator } from "../../i18n/translator.ts";
import { fuelLedgerOwnerIndex, isFuelContribution, numberFromInput, roundGlobalHeat, setContribution, toggleFiringTech, updateRound, updateRoundPlayer } from "../draftOps.ts";
import type { SectionProps } from "../draftOps.ts";
import { FormSection, SelectField, UsageCounter } from "../formParts.tsx";
import { draftPlayerName, fieldId } from "../issueText.ts";

/** The printed Fire card values (−2 … +2), in order. */
const FIRE_MODIFIERS: readonly FireModifier[] = [-2, -1, 0, 1, 2];

const CARD_OF: Readonly<Record<FireContribution, "BANK" | "TEND" | "STOKE">> = { bank_2: "BANK", bank: "BANK", tend: "TEND", stoke: "STOKE", stoke_2: "STOKE" };

function contributionLabel(contribution: FireContribution, t: Translator): string {
  const card = contributionCardName(CARD_OF[contribution], t.locale);
  const heat = signed(contributionHeat(contribution));
  return isFuelContribution(contribution)
    ? t("playtest.rounds.contributionFuel", { card, tech: techName(FUEL_LEDGER_TECH_ID, t.locale), heat })
    : t("playtest.rounds.contributionOption", { card, heat });
}

export function Rounds({ draft, edit, index }: SectionProps & { index: number }) {
  const t = useT();
  const capacity = sharedKilnCapacity(draft.playerCount);
  const fuelOwner = fuelLedgerOwnerIndex(draft);
  const ownedFiringTechs = FIRING_TECH_IDS.flatMap((techId) => {
    const ownerIndex = draft.players.findIndex((player) => player.firingTechId === techId);
    return ownerIndex < 0 ? [] : [{ techId, ownerIndex }];
  });
  return (
    <FormSection index={index} title={t("playtest.rounds.title")} description={t("playtest.rounds.description", { n: capacity })}>
      <div className="pt-rounds">
        {draft.rounds.map((round, roundIndex) => {
          const base = `rounds.${String(roundIndex)}`;
          const baseHeat = roundBaseHeat(round);
          const globalHeat = roundGlobalHeat(round);
          const summary = baseHeat === null
            ? t("playtest.rounds.summaryNoDie")
            : globalHeat === null
              ? t("playtest.rounds.summaryNoFire", { base: baseHeat })
              : t("playtest.rounds.summary", { base: baseHeat, global: globalHeat });
          const roundLabel = t("playtest.rounds.round", { n: round.round });
          return (
            <details key={round.round} className="pt-round" open={roundIndex === 0}>
              <summary>
                <span className="pt-round-title">{roundLabel}</span>
                <small>{summary}</small>
              </summary>
              <div className="pt-round-body">
                <div className="pt-grid pt-grid--four">
                  <SelectField
                    label={t("playtest.rounds.kilnDie")}
                    path={`${base}.kilnDie`}
                    value={round.kilnDie === null ? "" : String(round.kilnDie)}
                    placeholder={{ label: t("playtest.notRecorded") }}
                    options={KILN_DIE_FACES.map((face) => ({ value: String(face), label: num(face) }))}
                    onChange={(value) => edit(updateRound(roundIndex, { kilnDie: numberFromInput(value) }))}
                  />
                  <SelectField
                    label={t("playtest.rounds.fireModifier")}
                    path={`${base}.fireModifier`}
                    value={round.fireModifier === null ? "" : String(round.fireModifier)}
                    placeholder={{ label: t("playtest.notRecorded") }}
                    options={FIRE_MODIFIERS.map((modifier) => ({ value: String(modifier), label: signed(modifier) }))}
                    onChange={(value) => edit(updateRound(roundIndex, { fireModifier: numberFromInput(value) }))}
                  />
                  <div className="pt-field">
                    <span id={`${fieldId(base)}-base`}>{t("playtest.rounds.baseHeat")}</span>
                    <output className="pt-output num" aria-labelledby={`${fieldId(base)}-base`} aria-describedby={`${fieldId(base)}-base-hint`}>
                      {baseHeat === null ? t("playtest.notRecorded") : num(baseHeat)}
                    </output>
                    <small id={`${fieldId(base)}-base-hint`}>{t("playtest.rounds.baseHeatHint", { min: RULE_NUMBERS.baseHeatMin, max: RULE_NUMBERS.baseHeatMax })}</small>
                  </div>
                  <div className="pt-field">
                    <span id={`${fieldId(base)}-global`}>{t("playtest.rounds.globalHeat")}</span>
                    <output className="pt-output num" aria-labelledby={`${fieldId(base)}-global`} aria-describedby={`${fieldId(base)}-global-hint`}>
                      {globalHeat === null ? t("playtest.notRecorded") : num(globalHeat)}
                    </output>
                    <small id={`${fieldId(base)}-global-hint`}>{t("playtest.rounds.globalHeatHint")}</small>
                  </div>
                </div>

                <div className="pt-table-wrap">
                  <table className="pt-table">
                    <thead>
                      <tr>
                        <th scope="col">{t("playtest.rounds.player")}</th>
                        <th scope="col">{t("playtest.rounds.contribution")}</th>
                        <th scope="col">{t("playtest.rounds.sharedLoaded")}</th>
                        <th scope="col">{t("playtest.rounds.imperialLoaded")}</th>
                        <th scope="col">{t("playtest.rounds.ordersCompleted")}</th>
                        <th scope="col">{t("playtest.rounds.kilnAbilityUses")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {round.players.map((roundPlayer, playerIndex) => {
                        const player = draftPlayerName(draft, playerIndex, t);
                        const path = `${base}.players.${String(playerIndex)}`;
                        const label = (field: string) => t("playtest.rounds.fieldLabel", { round: round.round, player, field });
                        const options = FIRE_CONTRIBUTIONS.filter((contribution) => playerIndex === fuelOwner || !isFuelContribution(contribution));
                        return (
                          <tr key={playerIndex}>
                            <th scope="row" data-label={t("playtest.rounds.player")}>
                              <span className="pt-seat">{t("playtest.seatN", { n: playerIndex + 1 })}</span> {player}
                            </th>
                            <td data-label={t("playtest.rounds.contribution")}>
                              <select
                                id={fieldId(`${path}.contribution`)}
                                name={`${path}.contribution`}
                                aria-label={label(t("playtest.rounds.contribution"))}
                                value={roundPlayer.contribution ?? ""}
                                onChange={(event) => edit(setContribution(roundIndex, playerIndex, event.target.value === "" ? null : (event.target.value as FireContribution)))}
                              >
                                <option value="">{t("playtest.rounds.notParticipating")}</option>
                                {options.map((contribution) => (
                                  <option key={contribution} value={contribution}>
                                    {contributionLabel(contribution, t)}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td data-label={t("playtest.rounds.sharedLoaded")}>
                              <input
                                id={fieldId(`${path}.sharedLoaded`)}
                                name={`${path}.sharedLoaded`}
                                aria-label={label(t("playtest.rounds.sharedLoaded"))}
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={capacity}
                                value={roundPlayer.sharedLoaded ?? ""}
                                onChange={(event) => edit(updateRoundPlayer(roundIndex, playerIndex, { sharedLoaded: numberFromInput(event.target.value) }))}
                              />
                            </td>
                            <td data-label={t("playtest.rounds.imperialLoaded")}>
                              <input
                                id={fieldId(`${path}.imperialLoaded`)}
                                name={`${path}.imperialLoaded`}
                                aria-label={label(t("playtest.rounds.imperialLoaded"))}
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={1}
                                value={roundPlayer.imperialLoaded}
                                onChange={(event) => edit(updateRoundPlayer(roundIndex, playerIndex, { imperialLoaded: numberFromInput(event.target.value) ?? 0 }))}
                              />
                            </td>
                            <td data-label={t("playtest.rounds.ordersCompleted")}>
                              <input
                                id={fieldId(`${path}.ordersCompleted`)}
                                name={`${path}.ordersCompleted`}
                                aria-label={label(t("playtest.rounds.ordersCompleted"))}
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={20}
                                value={roundPlayer.ordersCompleted ?? ""}
                                onChange={(event) => edit(updateRoundPlayer(roundIndex, playerIndex, { ordersCompleted: numberFromInput(event.target.value) }))}
                              />
                            </td>
                            <td data-label={t("playtest.rounds.kilnAbilityUses")}>
                              <UsageCounter
                                label={label(t("playtest.rounds.kilnAbilityUses"))}
                                path={`${path}.kilnAbilityUses`}
                                value={roundPlayer.kilnAbilityUses}
                                onChange={(kilnAbilityUses) => edit(updateRoundPlayer(roundIndex, playerIndex, { kilnAbilityUses }))}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {ownedFiringTechs.length === 0 ? null : (
                  <fieldset className="pt-fieldset" id={fieldId(`${base}.firingTechIds`)}>
                    <legend>{t("playtest.rounds.firingTechs")}</legend>
                    <div className="pt-checks">
                      {ownedFiringTechs.map(({ techId, ownerIndex }) => (
                        <label key={techId} className="pt-check">
                          <input
                            type="checkbox"
                            name={`${base}.firingTechIds`}
                            value={techId}
                            checked={round.firingTechIds.includes(techId as TechId)}
                            onChange={(event) => edit(toggleFiringTech(roundIndex, techId, event.target.checked))}
                          />
                          <span>{t("playtest.rounds.techOwner", { tech: techName(techId, t.locale), owner: draftPlayerName(draft, ownerIndex, t) })}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </FormSection>
  );
}
