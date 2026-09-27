import {
  ORDER_DEFINITIONS,
  STARTING_TECHNIQUE_DEFINITIONS,
  TECHNIQUE_DEFINITIONS,
} from "../game";
import type { OrderId, Quality, StartingTechniqueId, TechniqueId } from "../game";
import { term } from "./i18n";
import type { Locale } from "./i18n";
import { OrderIllustration } from "./OrderIllustration";
import { TechniqueDescription } from "./TechniqueDescription";
import { techniqueOverviewCopy } from "./TechniqueOverview";
import { TECHNIQUE_ARTWORK } from "./techniqueArtwork";
import "./illustrated-pieces.css";

function text(locale: Locale, english: string, chinese: string): string {
  return locale === "zh-CN" ? chinese : english;
}

function qualityLabel(quality: Quality, locale: Locale): string {
  return `${term(locale, quality)}${quality === "masterpiece" ? "" : "+"}`;
}

/** The same face can live in a selection button, a board slot, or a reference sheet. */
export function pieceSurfaceClass(id: OrderId | TechniqueId | StartingTechniqueId): string {
  const order = ORDER_DEFINITIONS[id];
  if (order !== undefined) return `kiln-piece kiln-order-card${order.crowns > 0 ? " is-crown" : ""}`;
  if (STARTING_TECHNIQUE_DEFINITIONS[id as StartingTechniqueId] !== undefined) {
    return "kiln-piece kiln-tech-tile is-starting";
  }
  const technique = TECHNIQUE_DEFINITIONS[id];
  if (technique === undefined) throw new Error(`Unknown piece ID: ${id}`);
  return `kiln-piece kiln-tech-tile is-${technique.discipline}`;
}

export function OrderFace({ id, locale, displayIndex }: { id: OrderId; locale: Locale; displayIndex?: number }) {
  const order = ORDER_DEFINITIONS[id];
  if (order === undefined) return null;
  const additionalQuality = (order.relations ?? []).flatMap((relation) => {
    if (relation.type !== "at_least_n_quality") return [];
    const quality = qualityLabel(relation.quality, locale);
    const englishQuality = `${quality}${relation.count === 1 ? "" : "s"}`;
    return [{
      key: `${relation.quality}:${relation.count}`,
      compact: text(locale, `≥${relation.count} ${englishQuality}`, `≥${relation.count}件${quality}`),
      full: text(locale, `At least ${relation.count} ${englishQuality}`, `至少${relation.count}件${quality}`),
    }];
  });
  return <>
    <span className="kiln-piece-art" aria-hidden="true" />
    {displayIndex !== undefined && <span className="kiln-piece-display-index">{displayIndex}</span>}
    <div className="kiln-piece-heading">
      <span className="kiln-piece-id">{id}</span>
      <span className="kiln-piece-category">{text(locale, "Order", "委托")}</span>
    </div>
    <OrderIllustration id={id} />
    <span className="kiln-piece-requirement-label">{text(locale, "Requirement", "要求")} <span className="kiln-piece-count">· {text(locale, `${order.ceramics.length} ceramic${order.ceramics.length === 1 ? "" : "s"}`, `${order.ceramics.length}件陶瓷`)}</span></span>
    <p className="kiln-piece-copy">{locale === "zh-CN" ? order.requirementsZh : order.requirements}</p>
    <div className="kiln-piece-quality">
      <small>{text(locale, "Quality", "品质")}</small>
      <b>{qualityLabel(order.minQuality, locale)}{order.ceramics.length > 1 ? text(locale, " each", "（每件）") : ""}</b>
      {additionalQuality.length > 0 && <div className="kiln-piece-quality-requirements">{additionalQuality.map((requirement) => <span key={requirement.key} aria-label={requirement.full}>{requirement.compact}</span>)}</div>}
    </div>
    <div className="kiln-piece-footer">
      <span className="kiln-piece-stat"><small className="kiln-piece-vp-label">{text(locale, "VP", "分")}</small><b>{order.vp}</b></span>
      <span className="kiln-piece-stat" aria-label={text(locale, `${order.coins} Coins`, `${order.coins}铜钱`)}><i className="kiln-piece-coin" aria-hidden="true" /><b>{order.coins}</b></span>
      {order.crowns > 0 && <span className="kiln-piece-crowns" aria-label={text(locale, `${order.crowns} Crown${order.crowns === 1 ? "" : "s"}`, `${order.crowns}皇冠`)}>{"👑".repeat(order.crowns)}</span>}
    </div>
  </>;
}

export function TechniqueFace({ id, locale, layer = "preview", exhausted = false, overview = false }: {
  id: TechniqueId | StartingTechniqueId;
  locale: Locale;
  layer?: "preview" | "full";
  exhausted?: boolean;
  overview?: boolean;
}) {
  const starting = STARTING_TECHNIQUE_DEFINITIONS[id as StartingTechniqueId];
  const advanced = starting === undefined ? TECHNIQUE_DEFINITIONS[id] : undefined;
  const technique = starting ?? advanced;
  if (technique === undefined) return null;
  const discipline = advanced === undefined
    ? text(locale, "Starting Tech", "起始技艺")
    : locale === "zh-CN"
      ? { forming: "成型", glazing: "施釉", firing: "烧成" }[advanced.discipline]
      : advanced.discipline[0]!.toUpperCase() + advanced.discipline.slice(1);
  return <>
    <span className="kiln-piece-art" aria-hidden="true" style={{ backgroundImage: `url(${TECHNIQUE_ARTWORK[id]})` }} />
    <div className="kiln-piece-heading">
      <span className="kiln-piece-id">{id}</span>
      {advanced !== undefined && <span className="kiln-piece-cost" aria-label={text(locale, `${advanced.cost} Coins`, `${advanced.cost}铜钱`)}><b>{advanced.cost}</b><i className="kiln-piece-coin" aria-hidden="true" /></span>}
    </div>
    <strong className="kiln-piece-name">{locale === "zh-CN" ? technique.nameZh : technique.name}</strong>
    <span className="kiln-piece-category">{discipline}</span>
    <p className="kiln-piece-copy" data-overview={overview ? "true" : undefined}>{overview
      ? techniqueOverviewCopy(id, locale)
      : <TechniqueDescription id={id} locale={locale} layer={layer} />}</p>
    {advanced !== undefined && <div className="kiln-piece-footer">
      <span className="kiln-piece-timing">{advanced.oncePerRound ? text(locale, "Once per round", "每轮一次") : text(locale, "Continuous", "持续生效")}</span>
      <b className="kiln-piece-endgame-vp" aria-label={text(locale, "Scores 1 VP at game end", "终局计分时获得1分")}>1VP</b>
    </div>}
    {exhausted && <span className="kiln-piece-state">{text(locale, "Used", "已用")}</span>}
  </>;
}
