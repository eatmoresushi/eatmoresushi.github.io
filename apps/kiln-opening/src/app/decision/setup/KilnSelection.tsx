/**
 * KilnSelection (UI_V1.6.1_ARCHITECTURE §3.4 `kiln_selection`). Owner: B4.
 *
 * Setup step 9 (rev. 4 L122, R23): one turn chooses a Kiln and takes 1 face-up Main Order.
 * - The five Kiln Player Boards as radio cards: name, ability name and short text (timing in
 *   bold); a Kiln another player took is unavailable, with who took it. The options carry no
 *   "Full rules" button (owner review, 2026-10-17): the card text is the choice.
 * - The display's Main Orders as radio cards with their card text (requirement, Quality and
 *   reward); like the Kiln cards, no "Full rules" button in this window (owner decision D19).
 *   The display's Choose toggles on the table choose the same. The take is public.
 * The prompt says the choice goes in reverse turn order; the window does not list the order (owner
 * review, 2026-10-17): the seat chips already show who is choosing.
 */
import { shortTextSegments } from "../../../game/index.ts";
import { kilnText } from "../../i18n/content.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { usePlayerName, useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { OrderLines, OrderReward } from "../work/pieces.tsx";
import { kilnSelectionDraft } from "./KilnSelection.draft.ts";
import type { KilnSelectionAction, KilnSelectionDraft } from "./KilnSelection.draft.ts";
import "../work/pieces.css";
import "./setup.css";

export function KilnSelection() {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const playerName = usePlayerName();
  const [draft, dispatch] = useDraft<KilnSelectionDraft, KilnSelectionAction>();
  const options = kilnSelectionDraft.options(draft, model, engine);
  const viewer = model.viewerId;
  return (
    <div className="b4-form" data-b4="kiln-selection">
      <p className="b4-prompt">{t("work.ks.prompt")}</p>
      <OptionGroup
        legend={t("work.ks.kilns")}
        name="kilnId"
        value={draft.kilnId}
        onChange={(value) => {
          const kiln = options.kilns.find((candidate) => candidate.kilnId === value && candidate.available);
          if (kiln !== undefined) dispatch({ type: "kiln", kilnId: kiln.kilnId });
        }}
      >
        {options.kilns.map((kiln) => {
          const text = kilnText(kiln.kilnId, t.locale);
          return (
            <OptionCard
              key={kiln.kilnId}
              value={kiln.kilnId}
              title={text.name}
              meta={text.abilityName}
              description={
                <span className="b4-kiln-short">
                  {shortTextSegments(text.short).map((segment, index) => (segment.emphasis ? <strong key={index}>{segment.text}</strong> : <span key={index}>{segment.text}</span>))}
                </span>
              }
              disabled={!kiln.available}
              reason={kiln.chosenBy === null ? undefined : t("work.ks.chosenBy", { name: kiln.chosenBy === viewer ? t("work.ks.you") : playerName(kiln.chosenBy) })}
            />
          );
        })}
      </OptionGroup>
      {options.orders.length === 0 ? null : (
        <OptionGroup
          legend={t("work.ks.orders")}
          description={t("work.ks.ordersNote")}
          name="mainOrder"
          value={draft.slotIndex === null ? null : String(draft.slotIndex)}
          onChange={(value) => {
            const order = options.orders.find((candidate) => String(candidate.slotIndex) === value);
            if (order !== undefined) dispatch({ type: "order", slotIndex: order.slotIndex });
          }}
        >
          {options.orders.map((order) => (
            <OptionCard
              key={order.slotIndex}
              value={String(order.slotIndex)}
              title={t("work.cm.slot", { n: order.slotIndex + 1, order: order.orderId })}
              meta={<OrderReward orderId={order.orderId} />}
              description={<OrderLines orderId={order.orderId} />}
            />
          ))}
        </OptionGroup>
      )}
    </div>
  );
}
