/**
 * OrderCompletionPicker (UI_V1.6.1_ARCHITECTURE §3.4; wireframe `decOrders`). Owner: B5.
 *
 * Completing one held Order, a free action (owner revision 5, change 36: in the Order Phase turn and
 * before or after the worker action of a Work turn; `namePrefix` keeps the work window's radio names
 * apart). Which Order comes first, from a Deliver chip, a Deliver badge in the hand or the pane's
 * free-action list (owner UI decision D21; `FreeActionList`):
 * 1. the chosen Order, when no list above shows it (`showOrder`), with its rules details (D10);
 * 2. the ceramic groups that complete it (`orderMatchOptions`), described in words (D9);
 * 3. Crackle declarations, when the group holds a Crackle ceramic;
 * 4. the printed rewards (a Crown reward with the Imperial Recognition rules details, D10),
 *    Canal Barge's automatic 2 Coins on your first completion this round (v1.6.2 L637, never
 *    declined), Ge's automatic 1 VP per Crackle ceramic delivered (L484; the engine's
 *    `triggers.crackleVp`), and the optional abilities this completion would trigger (Ru/Guan, Tribute Ware;
 *    declining keeps their once-per-round use, R4).
 *
 * Renders only from the completion options; never filters or checks a choice itself.
 */
import type { OrderId } from "../../../game/index.ts";
import { RULE_NUMBERS, kilnText, orderRequirements, resourceName, techName, techText } from "../../i18n/content.ts";
import { list } from "../../i18n/format.ts";
import { orderQualityLine } from "../../i18n/orderText.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { Chip } from "../../kit/Chip.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { CeramicChip } from "../../pieces/CeramicChip.tsx";
import { CrownIcon } from "../../pieces/CrownIcon.tsx";
import type { EngineView, GameModel } from "../../state/model.ts";
import { B5_KILNS, B5_TECHS, ceramicWords, firingCeramicFacts, seatOf } from "../firing/firingSupport.ts";
import { Section, ShortText } from "../firing/WindowParts.tsx";
import { CrackleDeclarations } from "./CrackleDeclarations.tsx";
import { groupKey } from "./orderCompletion.ts";
import type { CompletionAction, CompletionDraft, CompletionOptions } from "./orderCompletion.ts";
import { OrderReward, RulesDetail } from "../../rules/RulesDetail.tsx";
import "./Orders.css";

/** An Order's printed reward: the shared rules component (B6), re-exported for B5's forms. */
export { OrderReward };

/**
 * An Order's rules details (D10): the shared "ⓘ Rules" pill named "Rules: Order O22", the same
 * trigger every Order option in the decision pane uses (B4's Commission and Colour Samples looks).
 * It sits in the option card's bottom corner (`ORDER_OPTION_CLASS` on the `OptionCard`), as a
 * sibling of the card's `<label>`, never inside it (§8.1).
 */
export function OrderDetails({ orderId }: { orderId: OrderId }) {
  return (
    <span className="ord-details">
      <RulesDetail subject={{ kind: "order", id: orderId }} />
    </span>
  );
}

/** The `OptionCard` class that places `OrderDetails` inside the card (Orders.css). */
export const ORDER_OPTION_CLASS = "ord-opt";

export interface OrderCompletionPickerProps {
  model: GameModel;
  engine: EngineView;
  draft: CompletionDraft;
  options: CompletionOptions;
  dispatch: (action: CompletionAction) => void;
  /** Input-name prefix (none in the Order Phase window). */
  namePrefix?: string;
  /** Show the chosen Order itself: no list above it does (a form opened by a chip or a badge). */
  showOrder?: boolean;
}

export function OrderCompletionPicker({ model, engine, draft, options, dispatch, namePrefix = "", showOrder = false }: OrderCompletionPickerProps) {
  const t = useT();
  const mine = model.me?.finishedCeramicIds ?? [];
  const match = options.match;
  const kilnId = match === null ? null : match.triggers.ru ? B5_KILNS.ru : match.triggers.guan ? B5_KILNS.guan : null;
  return (
    <>
      {!showOrder || draft.orderId === null ? null : (
        <Section heading={draft.orderId}>
          <span className="dw-row">
            <OrderReward orderId={draft.orderId} />
            <OrderDetails orderId={draft.orderId} />
          </span>
          <span className="dw-note">{t("orders.requirementLine", { requirements: orderRequirements(draft.orderId, t.locale), quality: orderQualityLine(draft.orderId, t) })}</span>
        </Section>
      )}

      {draft.orderId === null ? null : (
        <OptionGroup
          legend={t("orders.turn.ceramics")}
          name={`${namePrefix}ceramicIds`}
          value={draft.ceramicIds === null ? null : groupKey(draft.ceramicIds)}
          onChange={(value) => dispatch({ type: "group", key: value })}
        >
          {options.groups.map((group, index) => (
            <OptionCard
              key={group.key}
              value={group.key}
              title={t("orders.turn.option", { n: index + 1 })}
              leading={
                <span className="ord-group-art" aria-hidden="true">
                  {group.ceramicIds.map((ceramicId) => {
                    const facts = firingCeramicFacts(engine.view, null, ceramicId);
                    return facts === null ? null : <CeramicChip key={ceramicId} ceramic={facts} seat={seatOf(model, facts.ownerId)} label="" size={28} motionKey={null} />;
                  })}
                </span>
              }
              description={list(group.ceramicIds.map((ceramicId) => ceramicWords(model, engine, ceramicId, t, mine)), t.locale)}
            />
          ))}
        </OptionGroup>
      )}

      <CrackleDeclarations model={model} engine={engine} draft={draft} options={options} dispatch={dispatch} namePrefix={namePrefix} />

      {match === null ? null : (
        <Section heading={t("orders.turn.rewards")}>
          <span className="dw-row">
            <Chip tone="ok">{t("common.vpGain", { n: match.vp })}</Chip>
            <Chip>{t("common.gainRes", { n: match.coins, res: resourceName("coins", t.locale, match.coins) })}</Chip>
            {match.printedCrowns > 0 ? (
              <Chip>
                <CrownIcon count={match.printedCrowns} />
              </Chip>
            ) : null}
            {match.triggers.canalBarge ? (
              <Chip>{t("orders.turn.canalBarge", { tech: techName(B5_TECHS.canalBarge, t.locale), n: RULE_NUMBERS.canalBargeCoins })}</Chip>
            ) : null}
            {match.triggers.crackleVp > 0 ? <Chip tone="ok">{t("orders.turn.crackleVp", { n: match.triggers.crackleVp })}</Chip> : null}
          </span>
          {match.printedCrowns > 0 ? (
            <div className="dw-row ord-crown-note">
              <RulesDetail subject={{ kind: "recognitionTrack" }} look="name" />
              <span className="dw-note dw-note--muted">{t("orders.turn.crownNote", { max: RULE_NUMBERS.recognitionMax, vp: RULE_NUMBERS.overflowVpPerCrown })}</span>
            </div>
          ) : null}
        </Section>
      )}

      {match === null || (kilnId === null && !match.triggers.tributeWare) ? null : (
        <OptionGroup
          legend={t("orders.turn.optional")}
          description={t("orders.turn.optionalNote")}
          type="checkbox"
          name={`${namePrefix}optional`}
          values={[...(kilnId !== null && !draft.declineKilnAbility ? ["kiln"] : []), ...(match.triggers.tributeWare && !draft.declineTributeWare ? ["tributeWare"] : [])]}
          onChange={(value, checked) => dispatch({ type: "decline", ability: value === "kiln" ? "kiln" : "tributeWare", decline: !checked })}
        >
          {kilnId === null ? null : (
            <OptionCard value="kiln" title={t("orders.turn.use", { name: kilnText(kilnId, t.locale).abilityName })} description={<ShortText text={kilnText(kilnId, t.locale).short} />}>
              <span className="ord-details">
                <RulesDetail subject={{ kind: "kiln", id: kilnId }} look="name" />
              </span>
            </OptionCard>
          )}
          {!match.triggers.tributeWare ? null : (
            <OptionCard value="tributeWare" title={t("orders.turn.use", { name: techName(B5_TECHS.tributeWare, t.locale) })} description={<ShortText text={techText(B5_TECHS.tributeWare, t.locale).short} />}>
              <span className="ord-details">
                <RulesDetail subject={{ kind: "tech", id: B5_TECHS.tributeWare }} look="name" />
              </span>
            </OptionCard>
          )}
        </OptionGroup>
      )}
    </>
  );
}
