/**
 * GlazeLoad (UI_V1.6.1_ARCHITECTURE §3.4, §5 gap 15; wireframe `subEditor` glaze_load). Owner: B4.
 *
 * Per load: the Shaped vessel (named in words, D9), Reworking Table's Shape change, the Glaze,
 * and the destination — a Shared Kiln space (also choosable on the kiln, `TableSelection`), or
 * the Imperial Kiln — then, when a place offers several ways in, its modifier (zone, Kiln
 * Furniture −1/0/+1, Inverted Firing, or the Imperial modifier −1/0/+1). The Shifu may place the
 * Heat marker face down. Lists come from the selectors through `options`.
 */
import type { CSSProperties } from "react";
import type { CeramicId, Glaze, Shape } from "../../../../game/index.ts";
import { kilnSpaceName } from "../../../i18n/ceramicLabel.ts";
import { IMPERIAL_KILN_RECOGNITION, glazeName, shapeName, techName, workerKindName } from "../../../i18n/content.ts";
import { useT } from "../../../i18n/I18nProvider.tsx";
import type { Translator } from "../../../i18n/translator.ts";
import { OptionCard } from "../../../kit/OptionCard.tsx";
import { OptionGroup } from "../../../kit/OptionGroup.tsx";
import { CeramicArt } from "../../../pieces/CeramicArt.tsx";
import { FormNote } from "../pieces.tsx";
import { RulesDetail } from "../../../rules/RulesDetail.tsx";
import { destinationKey } from "./GlazeLoad.draft.ts";
import type { DestinationVariant, GlazeLoadAction, GlazeLoadDraft, GlazeLoadOptions, PlaceOption } from "./GlazeLoad.draft.ts";
import type { LocationEditorProps } from "./editor.ts";
import { signedModifier, vesselLabel } from "./shared.ts";

export type GlazeLoadProps = LocationEditorProps<GlazeLoadDraft, GlazeLoadAction, GlazeLoadOptions>;

const NO_MARKER = "none";
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
      {options.marker === null || options.marker.targets.length === 0 ? null : (
        <div className="b4-sub-block">
          <OptionGroup
            legend={t("work.gl.marker", { shifu: workerKindName("shifu", t.locale) })}
            name="heatMarkerCeramicId"
            layout="pills"
            value={draft.marker ?? NO_MARKER}
            onChange={(value) => dispatch({ type: "marker", ceramicId: value === NO_MARKER ? null : value })}
          >
            {options.marker.targets.map((ceramicId) => (
              <OptionCard key={ceramicId} variant="pill" value={ceramicId} title={vesselName(ceramicId)} />
            ))}
            <OptionCard variant="pill" value={NO_MARKER} title={t("work.gl.noMarker")} />
          </OptionGroup>
          <FormNote>{t("work.gl.markerNote")}</FormNote>
        </div>
      )}
    </div>
  );
}

