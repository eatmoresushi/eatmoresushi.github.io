/**
 * ColourSamples (UI_V1.6.1_ARCHITECTURE §3.4 `colour_samples` and `colour_samples_swap`; T10,
 * v1.6.2 L617). Owner: B4.
 *
 * The privately looked-at Orders ("Only you can see"), one to reserve (radios; also choosable on
 * the table's look row); the rest go face down to the bottom of the Main Order deck. Others see
 * only that you are looking, and how many. The same form serves the look when Colour Samples is
 * acquired (top 3, mandatory) and the once-per-round swap's look (top 2, after the held Order was
 * given up): the window kind picks the draft and the prompt. A look that found only one card
 * says so, and a when-acquired look taken by a Guild Hall Shifu says the inspection resumes
 * afterwards. Colour Samples opens its rules details from the "Full rules" button after the
 * prompt; every Order opens its own from the shared "Rules" pill in the option card's corner
 * (D10).
 */
import { locationName } from "../../i18n/content.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { Chip } from "../../kit/Chip.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { RulesDetail } from "../../rules/RulesDetail.tsx";
import { ORDER_OPTION_CLASS, OrderDetails } from "../orders/OrderCompletionPicker.tsx";
import { colourSamplesLookDraft } from "./ColourSamples.draft.ts";
import type { ColourSamplesAction, ColourSamplesDraft } from "./ColourSamples.draft.ts";
import { COLOUR_SAMPLES } from "./ColourSamplesSwap.draft.ts";
import { FormNote, OrderLines, OrderReward } from "./pieces.tsx";
import "./pieces.css";

/** The prompt per window kind and look size (one card: "reserve it"). */
const PROMPT = {
  colour_samples: { one: "work.cs.promptOne", many: "work.cs.prompt" },
  colour_samples_swap: { one: "work.cs.promptSwapOne", many: "work.cs.promptSwap" },
} as const;

export function ColourSamples() {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const [draft, dispatch] = useDraft<ColourSamplesDraft, ColourSamplesAction>();
  const kind = model.window.kind === "colour_samples_swap" ? "colour_samples_swap" : "colour_samples";
  const options = colourSamplesLookDraft(kind).options(draft, model, engine);
  const me = model.me;
  const n = options.orderIds.length;
  return (
    <div className="b4-form" data-b4={kind === "colour_samples" ? "colour-samples" : "colour-samples-swap-look"}>
      <div className="b4-row">
        <p className="b4-prompt">{n === 1 ? t(PROMPT[kind].one) : t(PROMPT[kind].many, { n })}</p>
        <RulesDetail subject={{ kind: "tech", id: COLOUR_SAMPLES }} />
      </div>
      <OptionGroup
        legend={t("work.cm.lookTitle", { n })}
        aside={<Chip tone="private">{t("common.status.onlyYou")}</Chip>}
        description={n > 1 ? t("work.cm.lookRest") : undefined}
        name="orderId"
        value={draft.orderId}
        onChange={(value) => {
          const orderId = options.orderIds.find((candidate) => candidate === value);
          if (orderId !== undefined) dispatch({ type: "order", orderId });
        }}
      >
        {options.orderIds.map((orderId) => (
          <OptionCard
            key={orderId}
            value={orderId}
            title={orderId}
            meta={<OrderReward orderId={orderId} />}
            description={<OrderLines orderId={orderId} />}
            className={ORDER_OPTION_CLASS}
          >
            <OrderDetails orderId={orderId} />
          </OptionCard>
        ))}
      </OptionGroup>
      {options.resume ? <FormNote>{t("work.cs.resume", { location: locationName("guild_hall", t.locale) })}</FormNote> : null}
      {me === null ? null : (
        <div className="b4-privacy">
          <strong>{t("work.cm.othersSee")}</strong>
          <span>{t("work.cm.looking", { name: me.displayName, n })}</span>
        </div>
      )}
    </div>
  );
}
