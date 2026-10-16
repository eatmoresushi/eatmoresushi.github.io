/**
 * KilnSelection (UI_V1.6.1_ARCHITECTURE §3.4 `kiln_selection`). Owner: B4.
 *
 * The five Kiln Player Boards as radio cards: name, ability name and short text (timing in
 * bold), each opening its rules details (D10); a Kiln another player took is unavailable, with
 * who took it. The choosing order (reverse turn order) is listed with each player's pick.
 */
import { shortTextSegments } from "../../../game/index.ts";
import { kilnText } from "../../i18n/content.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { usePlayerName, useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { RulesDetail } from "../../rules/RulesDetail.tsx";
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
        legend={t("work.title.kilnSelection")}
        hideLegend
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
            >
              <RulesDetail subject={{ kind: "kiln", id: kiln.kilnId }} />
            </OptionCard>
          );
        })}
      </OptionGroup>
      <div className="b4-sub-block">
        <p className="b4-sub-title">{t("work.ks.order")}</p>
        <ol className="b4-kiln-order">
          {options.selectionOrder.map((playerId, index) => {
            const chosen = options.kilns.find((kiln) => kiln.chosenBy === playerId);
            return (
              <li key={playerId} data-current={index === options.index ? "true" : undefined}>
                <span>{playerId === viewer ? t("common.nameYou", { name: playerName(playerId) }) : playerName(playerId)}</span>
                {chosen === undefined ? null : <span className="b4-kiln-order-pick">{kilnText(chosen.kilnId, t.locale).name}</span>}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
