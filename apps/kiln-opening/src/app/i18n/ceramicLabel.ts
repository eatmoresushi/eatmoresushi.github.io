/**
 * Ceramic names in words (owner decision D9, UI_V1.6.1_ARCHITECTURE K14, §7.4).
 *
 * A physical Vessel card has no number, so no internal ID (`c4`, `c18`, worker IDs) ever reaches
 * rendered text, accessible names, the game log or error messages. A ceramic is described by
 * what the table shows: "Lin's Celadon Vase, Carved · Fine" / "林的青釉瓶 · 刻花 · 上品", with
 * its place added ("(in High 2)", "（高温区2）") only when needed to tell two apart.
 *
 * This is the one helper every component, event template and error formatter uses for a
 * ceramic; change the wording here (and in the `common.ceramic.*` / `common.place.*` keys) and
 * it changes everywhere.
 *
 * - `withOwner` (default `true`): "Your …" for the viewer's own ceramic, "Lin's …" otherwise.
 *   `"auto"` names the owner only when another ceramic in `among` reads the same.
 * - `withPlace` (default `"auto"`): adds the place only when another ceramic in `among` (default:
 *   every undelivered ceramic the view holds) would read the same. `true` always adds it.
 * - `withQuality` (default `true`) and `withCrackle` (default `true`).
 */
import type {
  CeramicId,
  CeramicStage,
  CeramicState,
  Decoration,
  Glaze,
  KilnSpaceId,
  LoadPlacement,
  PlayerId,
  Quality,
  Shape,
} from "../../game/index.ts";
import { ZONE_TEXT } from "../../game/index.ts";
import { decorationName, glazeName, qualityName, shapeName } from "./content.ts";
import { translatorFor } from "./translator.ts";
import type { Deferred, Locale, Translator } from "./translator.ts";

/** What a Vessel card shows. `id` is used only for lookups and comparison, never rendered. */
export interface CeramicFacts {
  readonly id?: CeramicId;
  readonly ownerId: PlayerId;
  readonly shape: Shape;
  readonly decoration: Decoration;
  readonly glaze?: Glaze | null;
  readonly quality?: Quality | null;
  readonly crackle?: boolean;
  readonly stage?: CeramicStage;
  readonly placement?: LoadPlacement | null;
}

/** A `PlayerView` (raw engine view). */
export interface CeramicLabelPlayerView {
  readonly viewerId: PlayerId | null;
  readonly game: {
    readonly players: Readonly<Record<PlayerId, { readonly displayName: string }>>;
    readonly ceramics: Readonly<Record<CeramicId, CeramicState>>;
  };
}

/** A `GameModel`-like view: players by summary, ceramics if the model carries them. */
export interface CeramicLabelModelView {
  readonly viewerId: PlayerId | null;
  readonly players: readonly { readonly playerId: PlayerId; readonly displayName: string }[];
  readonly ceramics?: Readonly<Record<CeramicId, CeramicFacts>>;
}

export type CeramicLabelView = CeramicLabelPlayerView | CeramicLabelModelView;

export interface CeramicLabelOptions {
  locale: Locale | Translator;
  withOwner?: boolean | "auto";
  withPlace?: boolean | "auto";
  withQuality?: boolean;
  withCrackle?: boolean;
  /** The ceramics shown together with this one, for `"auto"`. Default: all undelivered in the view. */
  among?: Iterable<CeramicFacts>;
}

export type CeramicPlace =
  | { kind: "space"; spaceId: KilnSpaceId }
  | { kind: "imperial" }
  | { kind: "workshop" }
  | { kind: "finished" }
  | { kind: "delivered" };

function isPlayerView(view: CeramicLabelView): view is CeramicLabelPlayerView {
  return "game" in view;
}

function viewCeramics(view: CeramicLabelView): CeramicFacts[] {
  const record: Readonly<Record<CeramicId, CeramicFacts>> | undefined = isPlayerView(view) ? view.game.ceramics : view.ceramics;
  return record === undefined ? [] : Object.values(record);
}

/** A ceramic's facts from its ID through the view, or `null` when the view does not hold it. */
export function ceramicFacts(ceramic: CeramicId | CeramicFacts, view: CeramicLabelView): CeramicFacts | null {
  if (typeof ceramic !== "string") return ceramic;
  const record: Readonly<Record<CeramicId, CeramicFacts>> | undefined = isPlayerView(view) ? view.game.ceramics : view.ceramics;
  return record?.[ceramic] ?? null;
}

/** A player's display name from the view; never the player ID (empty when unknown). */
export function playerDisplayName(playerId: PlayerId, view: CeramicLabelView): string {
  const name = isPlayerView(view)
    ? view.game.players[playerId]?.displayName
    : view.players.find((player) => player.playerId === playerId)?.displayName;
  return name ?? "";
}

/** Where a ceramic is, from its stage and placement. */
export function ceramicPlace(facts: CeramicFacts): CeramicPlace | null {
  const placement = facts.placement ?? null;
  if (placement !== null) return placement.kiln === "shared" ? { kind: "space", spaceId: placement.spaceId } : { kind: "imperial" };
  switch (facts.stage) {
    case "shaped":
      return { kind: "workshop" };
    case "finished":
      return { kind: "finished" };
    case "delivered":
      return { kind: "delivered" };
    default:
      return null;
  }
}

/** "High 2" / "高温区2". */
export function kilnSpaceName(spaceId: KilnSpaceId, locale: Locale | Translator): string {
  const t = translatorFor(locale);
  const [zone, number] = spaceId.split("_") as [keyof typeof ZONE_TEXT, string];
  const zoneLabel = t.locale === "zh-CN" ? ZONE_TEXT[zone].zh : ZONE_TEXT[zone].en;
  return t("common.kilnSpace", { zone: zoneLabel, n: Number(number) });
}

/** "in High 2" / "高温区2"; "in your workshop" / "你的作坊"; … */
export function placeName(place: CeramicPlace, ownedByViewer: boolean, locale: Locale | Translator): string {
  const t = translatorFor(locale);
  switch (place.kind) {
    case "space":
      return t("common.place.space", { space: kilnSpaceName(place.spaceId, t) });
    case "imperial":
      return t("common.place.imperial");
    case "workshop":
      return ownedByViewer ? t("common.place.yourWorkshop") : t("common.place.workshop");
    case "finished":
      return t("common.place.finished");
    case "delivered":
      return t("common.place.delivered");
  }
}

/** The description without owner or place: "Celadon Vase, Carved · Fine · Crackle". */
function baseText(facts: CeramicFacts, t: Translator, withQuality: boolean, withCrackle: boolean): string {
  const shape = shapeName(facts.shape, t.locale);
  const decoration = decorationName(facts.decoration, t.locale);
  let text = facts.glaze === undefined || facts.glaze === null
    ? t("common.ceramic.unglazed", { shape, decoration })
    : t("common.ceramic.glazed", { glaze: glazeName(facts.glaze, t.locale), shape, decoration });
  if (withQuality && facts.quality !== undefined && facts.quality !== null) {
    text = t("common.ceramic.withQuality", { ceramic: text, quality: qualityName(facts.quality, t.locale) });
  }
  if (withCrackle && facts.crackle === true) text = t("common.ceramic.withCrackle", { ceramic: text });
  return text;
}

function sameCard(a: CeramicFacts, b: CeramicFacts, sameOwner: boolean, withQuality: boolean, withCrackle: boolean): boolean {
  if (a.id !== undefined && a.id === b.id) return false;
  if (a === b) return false;
  return a.shape === b.shape
    && a.decoration === b.decoration
    && (a.glaze ?? null) === (b.glaze ?? null)
    && (!withQuality || (a.quality ?? null) === (b.quality ?? null))
    && (!withCrackle || (a.crackle ?? false) === (b.crackle ?? false))
    && (!sameOwner || a.ownerId === b.ownerId);
}

/**
 * A ceramic in words, for text, accessible names and the log. Never contains an internal ID;
 * an unknown ID reads "a ceramic" / "一件器物".
 */
export function ceramicLabel(ceramic: CeramicId | CeramicFacts, view: CeramicLabelView, options: CeramicLabelOptions): string {
  const t = translatorFor(options.locale);
  const facts = ceramicFacts(ceramic, view);
  if (facts === null) return t("common.ceramic.unknown");
  const withQuality = options.withQuality ?? true;
  const withCrackle = options.withCrackle ?? true;
  const among = (): CeramicFacts[] => [...(options.among ?? viewCeramics(view).filter((other) => other.stage !== "delivered"))];

  const ownerMode = options.withOwner ?? true;
  const withOwner = ownerMode === "auto"
    ? among().some((other) => other.ownerId !== facts.ownerId && sameCard(facts, other, false, withQuality, withCrackle))
    : ownerMode;
  const placeMode = options.withPlace ?? "auto";
  const withPlace = placeMode === "auto"
    ? among().some((other) => sameCard(facts, other, withOwner, withQuality, withCrackle))
    : placeMode;

  let text = baseText(facts, t, withQuality, withCrackle);
  const own = view.viewerId !== null && facts.ownerId === view.viewerId;
  if (withOwner) {
    text = own
      ? t("common.ceramic.yours", { ceramic: text })
      : t("common.ceramic.owned", { owner: playerDisplayName(facts.ownerId, view), ceramic: text });
  }
  const place = withPlace ? ceramicPlace(facts) : null;
  if (place !== null) text = t("common.ceramic.at", { ceramic: text, place: placeName(place, own, t) });
  return text;
}

/**
 * The same description as a `Deferred` message parameter, so a stored `RichMessage` (a ConfirmBar
 * summary, an announcement) re-renders it in the current language.
 */
export function ceramicLabelParam(
  ceramic: CeramicId | CeramicFacts,
  view: CeramicLabelView,
  options: Omit<CeramicLabelOptions, "locale"> = {},
): Deferred {
  return (t) => ceramicLabel(ceramic, view, { ...options, locale: t });
}
