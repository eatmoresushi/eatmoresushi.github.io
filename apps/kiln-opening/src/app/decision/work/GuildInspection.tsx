/**
 * GuildInspection (UI_V1.6.1_ARCHITECTURE §3.4 `guild_inspection`, §8.1; v1.6.2 L236–243, B2).
 * Owner: B4.
 *
 * The Shifu's private inspection: take a Tech, inspected or face up, each at its printed cost
 * (reasons from the engine); after the first take, take another of a different discipline or
 * take no more. Stopping returns the untaken inspected Techs to the bottom of the deck in an
 * order set with Move up / Move down (`ReorderList`; announced politely; no drag-only
 * interaction). Only this seat sees the inspected Techs and their order (B2).
 *
 * Every Tech — inspected or face up — is a tile as printed on the Tech display (owner review,
 * 2026-10-17): name, cost, discipline and short text with its timing clause in bold
 * (`TechOption`, a native radio of the `take` group). A Tech the Shifu cannot take is greyed out
 * with the engine's reason. "Take no more Techs" is a radio of the same group. The window
 * carries no "Only you can see" pill and no "Full rules" buttons (D15, D19). The face-up Techs
 * may also be chosen on the Tech display (the window's table adapter, `inspectionTechChooser`).
 *
 * The steps read in order: the prompt (before the first take) or what was taken (after it), the
 * inspected Techs, the face-up Techs, then stopping and the bottom order. A single untaken
 * inspected Tech needs no order: it is named in a sentence instead of a one-item list.
 *
 * After the second take (`inspectionReturnOnly`) no Tech can be taken: the window shows what was
 * taken, says the action's takes are used, and asks only for the bottom order of the 2 untaken
 * inspected Techs (stopping is pre-selected by the draft). No Tech tiles, no "take another"
 * note, no stop radio.
 */
import type { GuildTechOption } from "../../../game/index.ts";
import { disciplineName, techName } from "../../i18n/content.ts";
import { list } from "../../i18n/format.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { ReorderList } from "../../kit/ReorderList.tsx";
import { announcePolite } from "../../shell/announce.ts";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { TechOption } from "../../table/TechCard.tsx";
import { GUILD_FINISH_VALUE, guildInspectionDraft, inspectionReason, inspectionReturnOnly, takeKey } from "./GuildInspection.draft.ts";
import type { GuildInspectionAction, GuildInspectionDraft, GuildTake } from "./GuildInspection.draft.ts";
import { techPriceText } from "./locations/GuildHall.tsx";
import { FormNote, useRuleErrorText } from "./pieces.tsx";
import "./pieces.css";

export function GuildInspection() {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const errorText = useRuleErrorText();
  const [draft, dispatch] = useDraft<GuildInspectionDraft, GuildInspectionAction>();
  const options = guildInspectionDraft.options(draft, model, engine);
  if (options === null) return null;
  const discipline = disciplineName(options.discipline, t.locale);
  const all: GuildTake[] = [
    ...options.inspected.map((option) => ({ kind: "inspected" as const, techId: option.techId })),
    ...options.faceUp.map((option) => ({ kind: "face_up" as const, techId: option.techId })),
  ];
  const max = options.takes.length + options.takesLeft;
  const tile = (option: GuildTechOption) => {
    const reason = inspectionReason(option, options, model);
    return (
      <TechOption
        key={takeKey({ kind: option.source === "inspected" ? "inspected" : "face_up", techId: option.techId })}
        techId={option.techId}
        price={techPriceText(option, t)}
        disabled={!option.legal}
        reason={reason === null ? null : errorText(reason)}
      />
    );
  };
  const value = draft.choice === null ? null : draft.choice.kind === "finish" ? GUILD_FINISH_VALUE : draft.choice.take.techId;
  const onTake = (picked: string) => {
    if (picked === GUILD_FINISH_VALUE) {
      dispatch({ type: "finish" });
      return;
    }
    const take = all.find((candidate) => candidate.techId === picked);
    if (take !== undefined) dispatch({ type: "take", take });
  };
  const finishing = draft.choice?.kind === "finish";
  const aside = options.takesLeft > 0 ? t("work.gi.takeN", { a: options.takes.length + 1, b: max }) : undefined;
  const taken =
    options.takes.length === 0 ? null : (
      <p className="b4-prompt" data-b4="guild-taken">
        {t("work.gi.taken", { techs: list(options.takes.map((take) => techName(take.techId, t.locale)), t.locale) })}
      </p>
    );
  const bottom =
    draft.bottomOrder.length === 0 ? null : draft.bottomOrder.length === 1 ? (
      <p className="b4-note" data-b4="guild-return-one">
        {t("work.gi.returnOne", { tech: techName(draft.bottomOrder[0]!, t.locale), discipline })}
      </p>
    ) : (
      <div className="b4-sub-block" data-b4="guild-bottom">
        <p className="b4-sub-title">{t("work.gi.bottom", { discipline })}</p>
        <ReorderList
          label={t("work.gi.bottom", { discipline })}
          announce={announcePolite}
          items={draft.bottomOrder.map((techId) => ({ id: techId, label: techName(techId, t.locale) }))}
          onReorder={(ids) => {
            const order = ids.flatMap((id) => draft.bottomOrder.filter((techId) => techId === id));
            dispatch({ type: "reorder", bottomOrder: order });
          }}
        />
        <FormNote tone="private">{t("work.gi.bottomNote")}</FormNote>
      </div>
    );
  if (inspectionReturnOnly(options)) {
    // Both takes are made: the bottom order is the only decision left (B2).
    return (
      <div className="b4-form" data-b4="guild-inspection" data-takes={options.takes.length} data-return-only="">
        {taken}
        <p className="b4-note" data-b4="guild-return-prompt">
          {t("work.gi.returnPrompt", { n: max, discipline })}
        </p>
        {bottom}
      </div>
    );
  }
  return (
    <div className="b4-form" data-b4="guild-inspection" data-takes={options.takes.length}>
      {taken ?? (
        <p className="b4-prompt" data-b4="guild-prompt">
          {t("work.gi.prompt", { n: max })}
        </p>
      )}
      {options.inspected.length === 0 ? (
        <FormNote>{t("work.gi.noneInspected", { discipline })}</FormNote>
      ) : (
        <OptionGroup legend={t("work.gi.inspected", { discipline })} aside={aside} name="take" value={value} onChange={onTake}>
          {options.inspected.map(tile)}
        </OptionGroup>
      )}
      {options.faceUp.length === 0 ? null : (
        <OptionGroup legend={t("work.gi.faceUp")} aside={options.inspected.length === 0 ? aside : undefined} name="take" value={value} onChange={onTake}>
          {options.faceUp.map(tile)}
        </OptionGroup>
      )}
      {options.takes.length === 0 ? null : <FormNote>{t("work.gi.secondNote")}</FormNote>}
      {!options.canFinish ? null : (
        <OptionGroup legend={t("work.gi.stop")} name="take" value={value} onChange={onTake}>
          <OptionCard value={GUILD_FINISH_VALUE} title={t("work.gi.finish")} description={draft.bottomOrder.length === 0 ? undefined : t(draft.bottomOrder.length === 1 ? "work.gi.finishHintOne" : "work.gi.finishHint")} />
        </OptionGroup>
      )}
      {finishing ? bottom : null}
    </div>
  );
}
