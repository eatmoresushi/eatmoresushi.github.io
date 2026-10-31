/**
 * SelectStep (UI_V1.6.1_ARCHITECTURE §3.4 `commission`, `colour_samples`, `colour_samples_swap`;
 * keyword Select N, v1.6.2 L80, change 25). Owner: B4.
 *
 * Every Select: after placing at the Commission Market (Select 2 for the Apprentice effect,
 * Select 3 reserving up to 2 for the Shifu effect), when Colour Samples is acquired (Select 3) and
 * after the Colour Samples swap gave up its held Order (Select 3). The privately looked-at Orders
 * ("Only you can see") and the Orders on the display are one choice list each, and both are also
 * choosable on the table: the look row and the display's Choose toggles. A limit of 1 makes the
 * two lists one radio group; the Shifu effect's limit of 2 makes them checkboxes, and once 2 are
 * chosen the others are unavailable, with the reason. The looked cards not reserved are discarded
 * face down (owner ruling R25); a display position reserved stays empty until the turn
 * ends. A look that showed fewer cards than N says the deck ran short (B1); one that showed none
 * says there was nothing to look at. Others see only that you are looking, and how many cards.
 *
 * The window's title names the keyword (Select 2 / Select 3, change 25); the prompt below it is a
 * plain sentence per window, saying what to reserve. Colour Samples' windows open its rules
 * details from the "Full rules" button after the prompt, and one taken by a Guild Hall Shifu says
 * the inspection resumes afterwards. Every Order shows its card text, and its rules details (D10)
 * open from the shared "Rules" pill in the option card's corner (`OrderDetails`). The form renders
 * only from `selectDraft.options()`.
 */
import { locationName } from "../../i18n/content.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import type { Translator } from "../../i18n/translator.ts";
import { Chip } from "../../kit/Chip.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { RulesDetail } from "../../rules/RulesDetail.tsx";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { ORDER_OPTION_CLASS, OrderDetails } from "../orders/OrderCompletionPicker.tsx";
import { COLOUR_SAMPLES } from "./ColourSamplesSwap.draft.ts";
import { selectDraft } from "./SelectStep.draft.ts";
import type { SelectAction, SelectChoice, SelectDraft, SelectPickKey, SelectStepOptions } from "./SelectStep.draft.ts";
import { FormNote, OrderLines, OrderReward } from "./pieces.tsx";
import "./pieces.css";

/** The form's `data-b4` per window (the test-driver contract keeps one per window). */
const FORM_ID = {
  commission: "commission",
  colour_samples: "colour-samples",
  colour_samples_swap: "colour-samples-swap-look",
} as const;

/** The prompt: a plain sentence (v1.6.2 L80 in words), with or without cards looked at. */
function promptText(options: SelectStepOptions, t: Translator): string {
  const none = options.looked.length === 0;
  switch (options.kind) {
    case "colour_samples":
      return none ? t("work.cs.promptNone") : t("work.cs.prompt");
    case "colour_samples_swap":
      return none ? t("work.cs.promptSwapNone") : t("work.cs.promptSwap");
    default:
      return options.maxReservations > 1 ? t("work.cm.promptTwo", { n: options.maxReservations }) : t("work.cm.promptOne");
  }
}

export function SelectStep() {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const [draft, dispatch] = useDraft<SelectDraft, SelectAction>();
  const options = selectDraft.options(draft, model, engine);
  const kind = options.kind ?? "commission";
  const me = model.me;
  const multi = options.maxReservations > 1;
  const keys = [...options.looked, ...options.slots].map((choice) => choice.key);
  const onChange = (value: string, checked: boolean) => {
    const key = keys.find((candidate) => candidate === value);
    if (key === undefined) return;
    dispatch(multi ? { type: "toggle", key, on: checked } : { type: "pick", key });
  };
  const radio = draft.picks[0] ?? null;
  const card = (choice: SelectChoice) => {
    const unavailable = multi && options.full && !draft.picks.includes(choice.key);
    return (
      <OptionCard
        key={choice.key}
        value={choice.key}
        title={choice.slotIndex === null ? choice.orderId : t("work.cm.slot", { n: choice.slotIndex + 1, order: choice.orderId })}
        meta={<OrderReward orderId={choice.orderId} />}
        description={<OrderLines orderId={choice.orderId} />}
        disabled={unavailable}
        reason={unavailable ? t("work.cm.limitReached", { n: options.maxReservations }) : undefined}
        className={ORDER_OPTION_CLASS}
      >
        <OrderDetails orderId={choice.orderId} />
      </OptionCard>
    );
  };
  const group = {
    name: "reservations",
    type: multi ? ("checkbox" as const) : ("radio" as const),
    ...(multi ? { values: draft.picks as readonly SelectPickKey[] } : { value: radio }),
    onChange,
  };
  const looked = options.looked.length;
  const prompt = <p className="b4-prompt">{promptText(options, t)}</p>;
  return (
    <div className="b4-form" data-b4={FORM_ID[kind]} data-select-n={options.n} data-max={options.maxReservations}>
      {kind === "commission" ? (
        prompt
      ) : (
        <div className="b4-row">
          {prompt}
          <RulesDetail subject={{ kind: "tech", id: COLOUR_SAMPLES }} />
        </div>
      )}
      {looked === 0 ? (
        <FormNote>{t("work.cm.lookNone")}</FormNote>
      ) : (
        <OptionGroup
          {...group}
          legend={t("work.cm.lookTitle", { n: looked })}
          aside={<Chip tone="private">{t("common.status.onlyYou")}</Chip>}
          description={options.short ? t("work.cm.lookedShort", { n: looked }) : t("work.cm.lookRest")}
        >
          {options.looked.map(card)}
        </OptionGroup>
      )}
      {options.slots.length === 0 ? null : (
        <OptionGroup {...group} legend={t("work.cm.display")} description={t("work.cm.emptySlotNote")}>
          {options.slots.map(card)}
        </OptionGroup>
      )}
      {multi ? (
        <p className="b4-note b4-note--muted num" data-b4="commission-count">
          {t("work.cm.chosenN", { a: draft.picks.length, b: options.maxReservations })}
        </p>
      ) : null}
      {options.resume ? <FormNote>{t("work.cs.resume", { location: locationName("guild_hall", t.locale) })}</FormNote> : null}
      {me === null || looked === 0 ? null : (
        <div className="b4-privacy">
          <strong>{t("work.cm.othersSee")}</strong>
          <span>{t("work.cm.looking", { name: me.displayName, n: looked })}</span>
        </div>
      )}
    </div>
  );
}
