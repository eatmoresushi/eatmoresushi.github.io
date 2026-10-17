/**
 * GuildInspection (UI_V1.6.1_ARCHITECTURE §3.4 `guild_inspection`, §8.1). Owner: B4.
 *
 * The Shifu's private inspection: take one inspected Tech or one face-up Tech (prices after the
 * −1 Coin, reasons from the engine), then order the untaken inspected Techs for the bottom of
 * the deck with Move up / Move down (`ReorderList`; announced politely; no drag-only
 * interaction). Only this seat sees the inspected Techs and their order (B2).
 *
 * Every Tech — inspected or face up — is a tile as printed on the Tech display (owner review,
 * 2026-10-17): name, price, discipline and short text with its timing clause in bold
 * (`TechOption`, a native radio of the `take` group). A Tech the Shifu cannot take is greyed out
 * with the engine's reason. The window carries no "Only you can see" pill and no "Full rules"
 * buttons: the tile already shows the card.
 */
import type { GuildTechOption } from "../../../game/index.ts";
import { disciplineName, techName } from "../../i18n/content.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { ReorderList } from "../../kit/ReorderList.tsx";
import { announcePolite } from "../../shell/announce.ts";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { TechOption } from "../../table/TechCard.tsx";
import { guildInspectionDraft, takeKey } from "./GuildInspection.draft.ts";
import type { GuildInspectionAction, GuildInspectionDraft, GuildTake } from "./GuildInspection.draft.ts";
import { techPriceText, techReasonDetails } from "./locations/GuildHall.tsx";
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
  const tile = (option: GuildTechOption) => {
    const reason = techReasonDetails(option);
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
  const onTake = (value: string) => {
    const take = all.find((candidate) => candidate.techId === value);
    if (take !== undefined) dispatch({ type: "take", take });
  };
  return (
    <div className="b4-form" data-b4="guild-inspection">
      <OptionGroup legend={t("work.gi.inspected", { discipline })} name="take" value={draft.take === null ? null : draft.take.techId} onChange={onTake}>
        {options.inspected.map(tile)}
      </OptionGroup>
      {options.faceUp.length === 0 ? null : (
        <OptionGroup legend={t("work.gi.faceUp")} name="take" value={draft.take === null ? null : draft.take.techId} onChange={onTake}>
          {options.faceUp.map(tile)}
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
