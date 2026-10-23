/**
 * GlazeLoad (UI_V1.6.1_ARCHITECTURE §3.4, §5 gap 15; wireframe `subEditor` glaze_load). Owner: B4.
 *
 * Per load: the Shaped vessel (named in words, D9), Reworking Table's Shape change, the Glaze,
 * and the destination — a Shared Kiln space (also choosable on the kiln, `TableSelection`), or
 * the Imperial Kiln — then, when a place offers several ways in, its modifier (zone, Kiln
 * Furniture −1/0/+1, Inverted Firing, or the Imperial modifier −1/0/+1). Kiln Master's optional
 * +1/−1 marker goes on one load, face up (T24, rev. 4 L628, R22). The kiln fuel block says what
 * the action pays (rev. 4 L197, R24: 1 Wood when any load goes into the Shared Kiln, 1 vessel or
 * 2; nothing when it loads only into the Imperial Kiln), from the engine's quote, with the
 * resulting resources. There is no Heat marker since revision 4. Lists come from the selectors
 * through `options`.
 */
import type { CSSProperties } from "react";
import type { CeramicId, Glaze, Shape } from "../../../../game/index.ts";
import { kilnSpaceName } from "../../../i18n/ceramicLabel.ts";
import { IMPERIAL_KILN_RECOGNITION, glazeName, shapeName, techName } from "../../../i18n/content.ts";
import { useT } from "../../../i18n/I18nProvider.tsx";
import type { Translator } from "../../../i18n/translator.ts";
import { OptionCard } from "../../../kit/OptionCard.tsx";
import { OptionGroup } from "../../../kit/OptionGroup.tsx";
import { CeramicArt } from "../../../pieces/CeramicArt.tsx";
import { FormNote, ResourceDelta } from "../pieces.tsx";
import { RulesDetail } from "../../../rules/RulesDetail.tsx";
import { destinationKey } from "./GlazeLoad.draft.ts";
import type { DestinationVariant, GlazeLoadAction, GlazeLoadDraft, GlazeLoadOptions, PlaceOption } from "./GlazeLoad.draft.ts";
import type { LocationEditorProps } from "./editor.ts";
import { amountText, signedModifier, vesselLabel } from "./shared.ts";

export type GlazeLoadProps = LocationEditorProps<GlazeLoadDraft, GlazeLoadAction, GlazeLoadOptions>;

const NO_MARKER = "none";

/** The radio value of Kiln Master's marker on one load (`<load index>:<face>`). */
function kilnMasterValue(index: number, value: number): string {
  return `${String(index)}:${String(value)}`;
}
const KEEP_SHAPE = "keep";

function placeTitle(place: PlaceOption, t: Translator): string {
  if (place.kind === "imperial" || place.spaceId === null) return t("work.gl.imperial");
  const only = place.variants.length === 1 ? place.variants[0] : undefined;
  if (only !== undefined && only.kind === "inverted") {
    return t("work.gl.placeInverted", { space: kilnSpaceName(place.spaceId, t), tech: techName("T21", t.locale), m: signedModifier(only.modifier) });
  }
  const plain = place.variants.find((variant) => variant.kind === "zone") ?? place.variants[0];
  return t("work.gl.placeSpace", { space: kilnSpaceName(place.spaceId, t), m: signedModifier(plain?.modifier ?? 0) });
}

function variantTitle(variant: DestinationVariant, t: Translator): string {
  const m = signedModifier(variant.modifier);
  switch (variant.kind) {
    case "zone":
      return t("work.gl.variant.zone", { m });
    case "furniture":
      return t("work.gl.variant.furniture", { tech: techName("T15", t.locale), m });
    case "inverted":
      return t("work.gl.variant.inverted", { tech: techName("T21", t.locale), m });
    case "imperial":
      return t("work.gl.variant.imperial", { m });
  }
}

export function GlazeLoad({ draft, options, dispatch, context }: GlazeLoadProps) {
  const t = useT();
  const two = draft.loads.length > 1;
  const vesselName = (ceramicId: CeramicId) => vesselLabel(context.view, ceramicId, t);
  const anyLoadable = (options.loads[0]?.vessels ?? []).some((vessel) => vessel.loadable);
  return (
    <div className="b4-sub" data-location="glaze_load">
      {!anyLoadable ? <FormNote tone="error">{t("work.gl.noVessel")}</FormNote> : null}
      {draft.loads.map((load, index) => {
        const loadOptions = options.loads[index];
        if (loadOptions === undefined) return null;
        const place = loadOptions.places.find((candidate) => candidate.key === load.place) ?? null;
        const chosenVessel = load.ceramicId === null ? null : context.view.game.ceramics[load.ceramicId] ?? null;
        return (
          <div key={index} className="b4-sub-block" data-load={index}>
            {two ? <p className="b4-sub-title">{t("work.gl.loadN", { n: index + 1 })}</p> : null}
            <OptionGroup
              legend={t("work.gl.vessel")}
              name={`loads.${index}.ceramicId`}
              layout="pills"
              value={load.ceramicId}
              onChange={(value) => dispatch({ type: "vessel", index, ceramicId: value })}
            >
              {loadOptions.vessels.map((vessel) => (
                <OptionCard
                  key={vessel.ceramicId}
                  variant="pill"
                  value={vessel.ceramicId}
                  disabled={!vessel.loadable}
                  title={vesselName(vessel.ceramicId)}
                  leading={vessel.ceramic === null ? undefined : <CeramicArt shape={vessel.ceramic.shape} decoration={vessel.ceramic.decoration} glaze={load.ceramicId === vessel.ceramicId ? load.glaze : null} size={22} />}
                />
              ))}
            </OptionGroup>
            {chosenVessel === null || loadOptions.reworkShapes.length === 0 ? null : (
              <div className="b4-sub-block">
                <OptionGroup
                  legend={t("work.gl.rework", { tech: techName(options.techs.reworkingTable, t.locale) })}
                  name={`loads.${index}.reworkShape`}
                  layout="pills"
                  value={load.rework ?? KEEP_SHAPE}
                  onChange={(value) => {
                    const shape = loadOptions.reworkShapes.find((candidate) => candidate === value);
                    dispatch({ type: "rework", index, shape: shape ?? null });
                  }}
                >
                  <OptionCard variant="pill" value={KEEP_SHAPE} title={t("work.gl.keepShape", { shape: shapeName(chosenVessel.shape, t.locale) })} />
                  {loadOptions.reworkShapes.map((shape: Shape) => (
                    <OptionCard key={shape} variant="pill" value={shape} title={shapeName(shape, t.locale)} />
                  ))}
                </OptionGroup>
                <RulesDetail subject={{ kind: "tech", id: options.techs.reworkingTable }} />
              </div>
            )}
            {chosenVessel === null ? null : (
              <OptionGroup
                legend={t("work.gl.glaze")}
                name={`loads.${index}.glaze`}
                layout="pills"
                value={load.glaze}
                onChange={(value) => {
                  const glaze = loadOptions.glazes.find((candidate) => candidate === value);
                  if (glaze !== undefined) dispatch({ type: "glaze", index, glaze });
                }}
              >
                {loadOptions.glazes.map((glaze: Glaze) => (
                  <OptionCard
                    key={glaze}
                    variant="pill"
                    value={glaze}
                    title={glazeName(glaze, t.locale)}
                    leading={<span className="b4-swatch" style={{ "--g": `var(--glz-${glaze})` } as CSSProperties} aria-hidden="true" />}
                  />
                ))}
              </OptionGroup>
            )}
            {chosenVessel === null ? null : (
              <OptionGroup
                legend={t("work.gl.place")}
                aside={t("work.gl.orKiln")}
                name={`loads.${index}.place`}
                layout="pills"
                value={load.place}
                onChange={(value) => dispatch({ type: "place", index, place: value })}
              >
                {loadOptions.places.map((candidate) => (
                  <OptionCard key={candidate.key} variant="pill" value={candidate.key} title={placeTitle(candidate, t)} />
                ))}
              </OptionGroup>
            )}
            {place === null || place.variants.length < 2 ? null : (
              <div className="b4-sub-block">
                <OptionGroup
                  legend={t("work.gl.variant")}
                  name={`loads.${index}.destination`}
                  layout="pills"
                  value={load.destination === null ? null : destinationKey(load.destination)}
                  onChange={(value) => dispatch({ type: "destination", index, key: value })}
                >
                  {place.variants.map((variant) => (
                    <OptionCard key={variant.key} variant="pill" value={variant.key} title={variantTitle(variant, t)} />
                  ))}
                </OptionGroup>
                {place.variants.some((variant) => variant.kind === "furniture") ? <RulesDetail subject={{ kind: "tech", id: options.techs.kilnFurniture }} /> : null}
                {place.kind === "imperial" ? <RulesDetail subject={{ kind: "recognition", space: IMPERIAL_KILN_RECOGNITION }} /> : null}
              </div>
            )}
            {place !== null && place.variants.some((variant) => variant.kind === "inverted") ? <RulesDetail subject={{ kind: "tech", id: options.techs.invertedFiring }} /> : null}
            {place !== null && place.variants.some((variant) => variant.returnsSettersMark) ? (
              <FormNote>{t("work.gl.returnsMark", { tech: techName(options.techs.settersMark, t.locale) })}</FormNote>
            ) : null}
          </div>
        );
      })}
      {options.maxLoads > 1 && (options.second || two) ? (
        <OptionCard type="checkbox" name="secondLoad" value="true" checked={two} onChange={(_, checked) => dispatch({ type: "second", on: checked })} title={t("work.gl.second")} />
      ) : null}
      {options.kilnMaster === null || options.kilnMaster.loads.length === 0 ? null : (
        <div className="b4-sub-block">
          <OptionGroup
            legend={t("work.gl.kilnMaster", { tech: techName(options.techs.kilnMaster, t.locale) })}
            description={t("work.gl.kilnMasterNote")}
            name="kilnMaster"
            layout="pills"
            value={draft.kilnMaster === null ? NO_MARKER : kilnMasterValue(draft.kilnMaster.index, draft.kilnMaster.value)}
            onChange={(value) => {
              const km = options.kilnMaster;
              const choice = km?.loads.flatMap((index) => km.values.map((face) => ({ index, value: face }))).find((entry) => kilnMasterValue(entry.index, entry.value) === value) ?? null;
              dispatch({ type: "kilnMaster", choice });
            }}
          >
            <OptionCard variant="pill" value={NO_MARKER} title={t("work.gl.kilnMasterNone")} />
            {options.kilnMaster.loads.flatMap((index) => {
              const ceramicId = draft.loads[index]?.ceramicId ?? null;
              return (options.kilnMaster?.values ?? []).map((face) => (
                <OptionCard
                  key={kilnMasterValue(index, face)}
                  variant="pill"
                  value={kilnMasterValue(index, face)}
                  title={
                    two && ceramicId !== null
                      ? t("work.gl.kilnMasterOn", { value: signedModifier(face), vessel: vesselName(ceramicId) })
                      : t("common.verb.placeKilnMaster", { value: signedModifier(face) })
                  }
                />
              ));
            })}
          </OptionGroup>
          <RulesDetail subject={{ kind: "tech", id: options.techs.kilnMaster }} />
        </div>
      )}
      <div className="b4-quote" role="group" aria-label={t("work.gl.fuel")} data-b4="kiln-fuel">
        <p className="b4-sub-title">{t("work.gl.fuel")}</p>
        {options.fuel.wood > 0 ? (
          <div className="b4-quote-line">
            <span>{t("work.gl.fuelLine")}</span>
            <span className="num">{amountText(t, "wood", options.fuel.wood)}</span>
          </div>
        ) : options.fuel.free ? (
          <p className="b4-note b4-note--muted">{t("work.gl.fuelFree")}</p>
        ) : null}
        <p className="b4-note b4-note--muted">{t("work.gl.fuelRule", { wood: amountText(t, "wood", options.fuel.perAction) })}</p>
        {options.fuel.short ? <FormNote>{t("work.gl.fuelNone")}</FormNote> : null}
      </div>
      <ResourceDelta before={context.me.resources} after={options.after} />
    </div>
  );
}

