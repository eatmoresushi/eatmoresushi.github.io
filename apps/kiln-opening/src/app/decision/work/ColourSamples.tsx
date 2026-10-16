/**
 * ColourSamples (UI_V1.6.1_ARCHITECTURE §3.4 `colour_samples`; wireframe `decLook`). Owner: B4.
 *
 * The privately looked-at Orders ("Only you can see"), one to reserve; the rest go face down to
 * the discard. Others see only that you are looking, and how many. Colour Samples and every
 * Order open their rules details (D10).
 */
import { useT } from "../../i18n/I18nProvider.tsx";
import { Chip } from "../../kit/Chip.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { colourSamplesDraft } from "./ColourSamples.draft.ts";
import type { ColourSamplesAction, ColourSamplesDraft } from "./ColourSamples.draft.ts";
import { OrderLines, OrderReward } from "./pieces.tsx";
import { RulesDetail } from "../../rules/RulesDetail.tsx";
import "./pieces.css";

const COLOUR_SAMPLES = "T10" as const;

export function ColourSamples() {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const [draft, dispatch] = useDraft<ColourSamplesDraft, ColourSamplesAction>();
  const options = colourSamplesDraft.options(draft, model, engine);
  const me = model.me;
  return (
    <div className="b4-form" data-b4="colour-samples">
      <div className="b4-row">
        <p className="b4-prompt">{t("work.cs.prompt")}</p>
        <RulesDetail subject={{ kind: "tech", id: COLOUR_SAMPLES }} />
      </div>
      <OptionGroup
        legend={t("work.cm.lookTitle")}
        aside={<Chip tone="private">{t("common.status.onlyYou")}</Chip>}
        name="orderId"
        value={draft.orderId}
        onChange={(value) => {
          const orderId = options.orderIds.find((candidate) => candidate === value);
          if (orderId !== undefined) dispatch({ type: "order", orderId });
        }}
      >
        {options.orderIds.map((orderId) => (
          <OptionCard key={orderId} value={orderId} title={orderId} meta={<OrderReward orderId={orderId} />} description={<OrderLines orderId={orderId} />}>
            <RulesDetail subject={{ kind: "order", id: orderId }} />
          </OptionCard>
        ))}
      </OptionGroup>
      {me === null ? null : (
        <div className="b4-privacy">
          <strong>{t("work.cm.othersSee")}</strong>
          <span>{t("work.cm.looking", { name: me.displayName, n: options.orderIds.length })}</span>
        </div>
      )}
    </div>
  );
}
