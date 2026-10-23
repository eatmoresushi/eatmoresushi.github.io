/**
 * Players (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B3 (kiln, firing stage, results, playtest).
 * Source: Playtest Form V3: players.
 *
 * One card per player: name, Kiln (all five, R1), one Tech per discipline (V1.6.1 has no
 * Starting Tech; at most one per discipline, L211), then the end of the game: completed Orders,
 * Imperial Recognition, remaining resources and score. Every option list comes from content;
 * a Kiln, Tech or Order another player already recorded is disabled (the schema checks too).
 */
import { DISCIPLINES, GAME_CONFIG, KILN_IDS, ORDER_IDS, techsOfDiscipline } from "../../../game/index.ts";
import type { KilnId, TechId } from "../../../game/index.ts";
import { MAX_RECOGNITION, TECH_FIELDS } from "../../../playtest/schema.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { disciplineName, kilnName, orderRequirements, resourceName, techName } from "../../i18n/content.ts";
import { num } from "../../i18n/format.ts";
import { Button } from "../../kit/Button.tsx";
import { addCompletedOrder, removeCompletedOrder, setCompletedOrder, setTech, updatePlayer } from "../draftOps.ts";
import type { DraftPlayer, SectionProps } from "../draftOps.ts";
import { Field, FormSection, NumberField, SelectField } from "../formParts.tsx";
import { draftPlayerName, fieldId } from "../issueText.ts";

const RECOGNITION_SPACES: readonly number[] = Array.from({ length: MAX_RECOGNITION + 1 }, (_, space) => space);

const SCORE_FIELDS = [
  { key: "finalVp", label: "playtest.players.finalVp", required: true },
  { key: "orderVp", label: "playtest.players.orderVp", required: false },
  { key: "traditionVp", label: "playtest.players.traditionVp", required: false },
  { key: "exhibitionVp", label: "playtest.players.exhibitionVp", required: false },
  { key: "coinVp", label: "playtest.players.coinVp", required: false },
] as const;

const RESOURCE_FIELDS = [
  { key: "coinsRemaining", resource: "coins" },
  { key: "clayRemaining", resource: "clay" },
  { key: "woodRemaining", resource: "wood" },
] as const;

export function Players({ draft, edit, index }: SectionProps & { index: number }) {
  const t = useT();
  const usedOrders = new Map<string, number>();
  draft.players.forEach((player, playerIndex) => {
    for (const orderId of player.completedOrderIds) if ((orderId as string) !== "") usedOrders.set(orderId, playerIndex);
  });
  const kilnOwner = (kilnId: KilnId, self: number) => draft.players.some((player, playerIndex) => playerIndex !== self && player.kilnId === kilnId);
  const techOwner = (techId: TechId, self: number) =>
    draft.players.some((player, playerIndex) => playerIndex !== self && DISCIPLINES.some((discipline) => player[TECH_FIELDS[discipline]] === techId));

  return (
    <FormSection index={index} title={t("playtest.players.title")} description={t("playtest.players.description")}>
      <div className="pt-cards">
        {draft.players.map((player: DraftPlayer, playerIndex) => {
          const base = `players.${String(playerIndex)}`;
          const name = draftPlayerName(draft, playerIndex, t);
          return (
            <article key={playerIndex} className="pt-card" aria-labelledby={`${fieldId(base)}-title`}>
              <header className="pt-card-head">
                <span className="pt-seat">{t("playtest.seatN", { n: playerIndex + 1 })}</span>
                <h3 id={`${fieldId(base)}-title`}>{name}</h3>
                {draft.winnerIndex === playerIndex ? <small className="pt-winner">{t("playtest.players.winner")}</small> : null}
              </header>
              <div className="pt-grid pt-grid--two">
                <Field label={t("playtest.players.name")} path={`${base}.name`} hint={t("playtest.players.nameHint")}>
                  <input
                    id={fieldId(`${base}.name`)}
                    name={`${base}.name`}
                    value={player.name}
                    maxLength={40}
                    autoComplete="off"
                    aria-describedby={`${fieldId(`${base}.name`)}-hint`}
                    onChange={(event) => edit(updatePlayer(playerIndex, { name: event.target.value }))}
                  />
                </Field>
                <SelectField
                  label={t("playtest.players.kiln")}
                  path={`${base}.kilnId`}
                  value={player.kilnId ?? ""}
                  required
                  placeholder={{ label: t("playtest.choose"), disabled: true }}
                  options={KILN_IDS.map((kilnId) => ({ value: kilnId, label: kilnName(kilnId, t.locale), disabled: kilnOwner(kilnId, playerIndex) }))}
                  onChange={(value) => edit(updatePlayer(playerIndex, { kilnId: value as KilnId }))}
                />
              </div>
              <fieldset className="pt-fieldset">
                <legend>{t("playtest.players.techs")}</legend>
                <div className="pt-grid pt-grid--three">
                  {DISCIPLINES.map((discipline) => (
                    <SelectField
                      key={discipline}
                      label={t("playtest.players.tech", { discipline: disciplineName(discipline, t.locale) })}
                      path={`${base}.${TECH_FIELDS[discipline]}`}
                      value={player[TECH_FIELDS[discipline]] ?? ""}
                      placeholder={{ label: t("playtest.none") }}
                      options={techsOfDiscipline(discipline).map((techId) => ({ value: techId, label: techName(techId, t.locale), disabled: techOwner(techId, playerIndex) }))}
                      onChange={(value) => edit(setTech(playerIndex, discipline, value === "" ? null : (value as TechId)))}
                    />
                  ))}
                </div>
              </fieldset>

              <div className="pt-orders">
                <div className="pt-orders-head">
                  <div>
                    <h4>{t("playtest.players.orders")}</h4>
                    <p>{t("playtest.players.ordersCount", { n: player.completedOrderIds.length })}</p>
                  </div>
                  <Button size="sm" onClick={() => edit(addCompletedOrder(playerIndex))}>{t("playtest.players.addOrder")}</Button>
                </div>
                {player.completedOrderIds.length === 0 ? <p className="pt-empty">{t("playtest.players.noOrders")}</p> : null}
                <ol className="pt-order-list">
                  {player.completedOrderIds.map((orderId, orderIndex) => {
                    const path = `${base}.completedOrderIds.${String(orderIndex)}`;
                    return (
                      <li key={orderIndex} className="pt-order-row">
                        <label className="sr-only" htmlFor={fieldId(path)}>{t("playtest.players.orderN", { n: orderIndex + 1 })}</label>
                        <select id={fieldId(path)} name={path} value={orderId} onChange={(event) => edit(setCompletedOrder(playerIndex, orderIndex, event.target.value))}>
                          <option value="" disabled>{t("playtest.players.chooseOrder")}</option>
                          {ORDER_IDS.map((id) => {
                            const owner = usedOrders.get(id);
                            return (
                              <option key={id} value={id} disabled={owner !== undefined && id !== orderId}>
                                {t("playtest.players.orderOption", { id, requirements: orderRequirements(id, t.locale) })}
                              </option>
                            );
                          })}
                        </select>
                        <Button size="sm" variant="quiet" aria-label={t("playtest.players.removeOrderLabel", { n: orderIndex + 1 })} onClick={() => edit(removeCompletedOrder(playerIndex, orderIndex))}>
                          {t("playtest.players.removeOrder")}
                        </Button>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div className="pt-grid pt-grid--two">
                <SelectField
                  label={t("playtest.players.recognition")}
                  path={`${base}.recognition`}
                  value={player.recognition === null ? "" : String(player.recognition)}
                  required
                  placeholder={{ label: t("playtest.notRecorded") }}
                  options={RECOGNITION_SPACES.map((space) => ({ value: String(space), label: num(space) }))}
                  onChange={(value) => edit(updatePlayer(playerIndex, { recognition: value === "" ? null : Number(value) }))}
                />
              </div>
              <fieldset className="pt-fieldset">
                <legend>{t("playtest.players.resources")}</legend>
                <div className="pt-grid pt-grid--three">
                  {RESOURCE_FIELDS.map(({ key, resource }) => (
                    <NumberField
                      key={key}
                      label={resourceName(resource, t.locale)}
                      path={`${base}.${key}`}
                      value={player[key]}
                      required
                      onChange={(value) => edit(updatePlayer(playerIndex, { [key]: value }))}
                    />
                  ))}
                </div>
              </fieldset>
              <fieldset className="pt-fieldset">
                <legend>{t("playtest.players.scoring")}</legend>
                <div className="pt-grid pt-grid--three">
                  {SCORE_FIELDS.map(({ key, label, required }) => (
                    <NumberField
                      key={key}
                      label={t(label)}
                      path={`${base}.${key}`}
                      value={player[key]}
                      min={key === "coinVp" ? 0 : -100}
                      max={key === "coinVp" ? GAME_CONFIG.coinEndGame.maxVp : 500}
                      required={required}
                      onChange={(value) => edit(updatePlayer(playerIndex, { [key]: value }))}
                    />
                  ))}
                </div>
              </fieldset>
            </article>
          );
        })}
      </div>
    </FormSection>
  );
}
