/**
 * GuildInspection (UI_V1.6.1_ARCHITECTURE §3.4 `guild_inspection`, §8.1). Owner: B4.
 *
 * The Shifu's private inspection: take one inspected Tech or one face-up Tech (prices after the
 * −1 Coin, reasons from the engine), then order the untaken inspected Techs for the bottom of
 * the deck with Move up / Move down (`ReorderList`; announced politely; no drag-only
 * interaction). Only this seat sees the inspected Techs and their order (B2). Every Tech opens its
 * rules details (D10).
 */
import type { GuildTechOption } from "../../../game/index.ts";
import { disciplineName, techName } from "../../i18n/content.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { Chip } from "../../kit/Chip.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { ReorderList } from "../../kit/ReorderList.tsx";
import { announcePolite } from "../../shell/announce.ts";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { guildInspectionDraft, takeKey } from "./GuildInspection.draft.ts";
import type { GuildInspectionAction, GuildInspectionDraft, GuildTake } from "./GuildInspection.draft.ts";
import { DisciplineSwatch, techPriceText, techReasonDetails } from "./locations/GuildHall.tsx";
import { FormNote, useRuleErrorText } from "./pieces.tsx";
import { RulesDetail } from "../../rules/RulesDetail.tsx";
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
  const card = (option: GuildTechOption) => {
    const reason = techReasonDetails(option);
    return (
      <OptionCard
        key={takeKey({ kind: option.source === "inspected" ? "inspected" : "face_up", techId: option.techId })}
        value={option.techId}
        title={techName(option.techId, t.locale)}
        leading={<DisciplineSwatch discipline={option.discipline} />}
        meta={techPriceText(option, t)}
        description={disciplineName(option.discipline, t.locale)}
        disabled={!option.legal}
        reason={reason === null ? undefined : errorText(reason)}
      >
        <RulesDetail subject={{ kind: "tech", id: option.techId }} />
      </OptionCard>
    );
  };
  const onTake = (value: string) => {
    const take = all.find((candidate) => candidate.techId === value);
    if (take !== undefined) dispatch({ type: "take", take });
  };
  return (
    <div className="b4-form" data-b4="guild-inspection">
      <OptionGroup
        legend={t("work.gi.inspected", { discipline })}
        aside={<Chip tone="private">{t("common.status.onlyYou")}</Chip>}
        name="take"
        value={draft.take === null ? null : draft.take.techId}
        onChange={onTake}
      >
        {options.inspected.map(card)}
      </OptionGroup>
      {options.faceUp.length === 0 ? null : (
        <OptionGroup legend={t("work.gi.faceUp")} name="take" value={draft.take === null ? null : draft.take.techId} onChange={onTake}>
          {options.faceUp.map(card)}
        </OptionGroup>
      )}
      <div className="b4-sub-block">
        <p className="b4-sub-title">{t("work.gi.bottom", { discipline })}</p>
        {draft.bottomOrder.length === 0 ? (
          <FormNote>{t("work.gi.nothingToReturn")}</FormNote>
        ) : (
          <ReorderList
            label={t("work.gi.bottom", { discipline })}
            announce={announcePolite}
            items={draft.bottomOrder.map((techId) => ({ id: techId, label: techName(techId, t.locale) }))}
            onReorder={(ids) => {
              const order = ids.flatMap((id) => draft.bottomOrder.filter((techId) => techId === id));
              dispatch({ type: "reorder", bottomOrder: order });
            }}
          />
        )}
        <FormNote tone="private">{t("work.gi.bottomNote")}</FormNote>
      </div>
    </div>
  );
}
