/**
 * SettersMark (UI_V1.6.1_ARCHITECTURE §3.4 `setters_mark`). Owner: B4.
 *
 * The empty active Shared Kiln spaces as radios (also clickable on the kiln, `TableSelection`),
 * with their modifier, plus "Do not place it this round"; ConfirmBar's alternative declines in
 * one step. Setter's Mark opens its rules details (D10).
 */
import { kilnSpaceName } from "../../i18n/ceramicLabel.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { signedModifier } from "../work/locations/shared.ts";
import { RulesDetail } from "../../rules/RulesDetail.tsx";
import { settersMarkDraft } from "./SettersMark.draft.ts";
import type { SettersMarkAction, SettersMarkDraft } from "./SettersMark.draft.ts";
import "../work/pieces.css";

const SETTERS_MARK = "T22" as const;
const DECLINE = "decline";

export function SettersMark() {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const [draft, dispatch] = useDraft<SettersMarkDraft, SettersMarkAction>();
  const options = settersMarkDraft.options(draft, model, engine);
  return (
    <div className="b4-form" data-b4="setters-mark">
      <div className="b4-row">
        <p className="b4-prompt">{t("work.sm.prompt")}</p>
        <RulesDetail subject={{ kind: "tech", id: SETTERS_MARK }} />
      </div>
      <OptionGroup
        legend={t("work.sm.space")}
        aside={t("work.gl.orKiln")}
        name="spaceId"
        layout="pills"
        value={draft.choice}
        onChange={(value) => {
          if (value === DECLINE) {
            dispatch({ type: "choose", choice: "decline" });
            return;
          }
          const space = options.spaces.find((candidate) => candidate.spaceId === value);
          if (space !== undefined) dispatch({ type: "choose", choice: space.spaceId });
        }}
      >
        {options.spaces.map((space) => (
          <OptionCard key={space.spaceId} variant="pill" value={space.spaceId} title={t("work.gl.placeSpace", { space: kilnSpaceName(space.spaceId, t), m: signedModifier(space.modifier) })} />
        ))}
        <OptionCard variant="pill" value={DECLINE} title={t("work.sm.decline")} />
      </OptionGroup>
    </div>
  );
}
