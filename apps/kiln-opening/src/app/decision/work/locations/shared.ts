/**
 * Small helpers shared by the location sub-editors (B4).
 */
import type { CeramicId, CostQuote, PlayerId, PlayerView, ResourceKind, ResourceState } from "../../../../game/index.ts";
import { ceramicLabel } from "../../../i18n/ceramicLabel.ts";
import { resourceName } from "../../../i18n/content.ts";
import type { Deferred, Translator } from "../../../i18n/translator.ts";
import { viewMemo } from "../context.ts";

/** Resource kinds in the glossary's display order (Clay, Wood, Coins). Display order only. */
export const RESOURCE_ORDER: readonly ResourceKind[] = ["clay", "wood", "coins"];

/** The resources after a quoted action: the engine's `gain` and `pay` applied to the current totals. */
export function resourcesAfter(current: Readonly<ResourceState>, quote: CostQuote | null): ResourceState | null {
  if (quote === null || !quote.ok) return null;
  return {
    clay: current.clay + quote.gain.clay - quote.pay.clay,
    wood: current.wood + quote.gain.wood - quote.pay.wood,
    coins: current.coins + quote.gain.coins - quote.pay.coins,
  };
}

/** The resources after gaining a fixed amount (Canal Wharf, a Commission gain). */
export function resourcesPlus(current: Readonly<ResourceState>, gain: Partial<ResourceState>, pay: Partial<ResourceState> = {}): ResourceState {
  return {
    clay: current.clay + (gain.clay ?? 0) - (pay.clay ?? 0),
    wood: current.wood + (gain.wood ?? 0) - (pay.wood ?? 0),
    coins: current.coins + (gain.coins ?? 0) - (pay.coins ?? 0),
  };
}

/** "2 Clay", "1 Coin", "2泥" (whole templates, §6.3). */
export function amountText(t: Translator, kind: ResourceKind, n: number): string {
  switch (kind) {
    case "clay":
      return t("common.amount.clay", { n });
    case "wood":
      return t("common.amount.wood", { n });
    case "coins":
      return t("common.amount.coins", { n });
  }
}

/** A list of amounts ("1 Clay, 1 Wood"), skipping zeros; "free" when all are zero. */
export function amountsText(t: Translator, amounts: Partial<ResourceState>): string {
  const parts = RESOURCE_ORDER.filter((kind) => (amounts[kind] ?? 0) !== 0).map((kind) => amountText(t, kind, amounts[kind] ?? 0));
  if (parts.length === 0) return t("common.free");
  return parts.join(t.locale === "zh-CN" ? "" : ", ");
}

/** `amountsText` as a deferred message parameter. */
export function amountsParam(amounts: Partial<ResourceState>): Deferred {
  return (t) => amountsText(t, amounts);
}

/** "+1 Clay" / "得1泥" for a gain of one resource. */
export function gainText(t: Translator, kind: ResourceKind, n: number): string {
  return t("common.gainRes", { n, res: resourceName(kind, t.locale, n) });
}

/** A signed modifier as shown on the table: +1, 0, −1 (U+2212). */
export function signedModifier(value: number): string {
  if (value > 0) return `+${String(value)}`;
  if (value < 0) return `−${String(Math.abs(value))}`;
  return "0";
}

/**
 * The owner's Shaped vessels that read the same as another one (same Shape and Decoration, all
 * in the same workshop): each one's position among its twins, "1 of 2". Physical Vessel cards
 * have no number (D9), but a form must still offer each one as its own choice.
 */
function shapedTwins(view: PlayerView, ownerId: PlayerId): ReadonlyMap<CeramicId, { n: number; total: number }> {
  return viewMemo(view, `shapedTwins:${ownerId}`, () => {
    const shaped = Object.values(view.game.ceramics).filter((ceramic) => ceramic.ownerId === ownerId && ceramic.stage === "shaped");
    const twins = new Map<CeramicId, { n: number; total: number }>();
    for (const ceramic of shaped) {
      const same = shaped.filter((other) => other.shape === ceramic.shape && other.decoration === ceramic.decoration);
      if (same.length > 1) twins.set(ceramic.id, { n: same.indexOf(ceramic) + 1, total: same.length });
    }
    return twins;
  });
}

/**
 * One of your ceramics in words, for a choice (D9): a Shaped vessel by its card ("Bowl, Plain"),
 * with "1 of 2" when an identical one waits beside it; a loaded ceramic with its place when
 * another reads the same ("White Bowl, Plain (in High 1)").
 */
export function vesselLabel(view: PlayerView, ceramicId: CeramicId, t: Translator): string {
  const ceramic = view.game.ceramics[ceramicId];
  if (ceramic === undefined) return "";
  if (ceramic.stage !== "shaped") return ceramicLabel(ceramicId, view, { locale: t, withOwner: false });
  const label = ceramicLabel(ceramicId, view, { locale: t, withOwner: false, withPlace: false });
  const twin = shapedTwins(view, ceramic.ownerId).get(ceramicId);
  return twin === undefined ? label : t("work.gl.vesselOf", { vessel: label, n: twin.n, total: twin.total });
}

/** `vesselLabel` as a deferred message parameter. */
export function vesselParam(view: PlayerView, ceramicId: CeramicId): Deferred {
  return (t) => vesselLabel(view, ceramicId, t);
}
