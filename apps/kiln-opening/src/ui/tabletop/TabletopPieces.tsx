import type { CSSProperties, ReactNode } from "react";
import { ORDER_DEFINITIONS, TECHNIQUE_DEFINITIONS, preferredHeat } from "../../game";
import type {
  CeramicState,
  FireModifier,
  KilnId,
  TechniqueId,
  WorkerKind,
  WorkerStatus,
  WoodContribution,
} from "../../game";
import { TABLETOP_ASSETS, WORKSHOP_CROPS, orderSprite, techniqueSprite } from "./assetCatalog";

export const SEAT_COLOURS = ["#a9473d", "#356e81", "#927c31", "#674f7c"] as const;

function gridSpriteStyle(
  image: string,
  columns: number,
  rows: number,
  column: number,
  row: number,
): CSSProperties {
  return {
    backgroundImage: `url("${image}")`,
    backgroundSize: `${columns * 100}% ${rows * 100}%`,
    backgroundPosition: `${columns === 1 ? 0 : column / (columns - 1) * 100}% ${rows === 1 ? 0 : row / (rows - 1) * 100}%`,
  };
}

function arbitraryCropStyle(
  image: string,
  x: number,
  y: number,
  width: number,
  height: number,
): CSSProperties {
  return {
    backgroundImage: `url("${image}")`,
    backgroundSize: `${100 / width}% ${100 / height}%`,
    backgroundPosition: `${x / (1 - width) * 100}% ${y / (1 - height) * 100}%`,
  };
}

export function workshopBackground(kilnId: KilnId | null): CSSProperties | undefined {
  if (kilnId === null) return undefined;
  const crop = WORKSHOP_CROPS[kilnId];
  return arbitraryCropStyle(
    TABLETOP_ASSETS.playerBoards,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
  );
}

export function Meeple({
  kind,
  seatIndex,
  status = "available",
  selected = false,
  preview = false,
  label,
}: {
  kind: WorkerKind;
  seatIndex: number;
  status?: WorkerStatus;
  selected?: boolean;
  preview?: boolean;
  label: string;
}) {
  return (
    <span
      className={`tabletop-meeple meeple-${kind} status-${status} ${selected ? "is-selected" : ""} ${preview ? "is-preview" : ""}`}
      style={{ "--piece-colour": SEAT_COLOURS[seatIndex] ?? SEAT_COLOURS[0] } as CSSProperties}
      role="img"
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 64 84" aria-hidden="true" focusable="false">
        <circle cx="32" cy="14" r={kind === "shifu" ? 12 : 10} />
        <path d={kind === "shifu"
          ? "M22 28h20l7 20-9 5 8 25H35l-3-18-3 18H16l8-25-9-5z"
          : "M23 27h18l7 18-8 5 7 26H35l-3-18-3 18H17l7-26-8-5z"} />
      </svg>
      <small>{kind === "shifu" ? "师" : "徒"}</small>
    </span>
  );
}

export function ResourceToken({ kind, amount }: { kind: "clay" | "wood" | "coins"; amount: number }) {
  const labels = { clay: "Clay", wood: "Wood", coins: "Coins" } as const;
  return (
    <span className={`tabletop-resource resource-${kind}`} aria-label={`${amount} ${labels[kind]}`}>
      <i aria-hidden="true">{kind === "clay" ? "●" : kind === "wood" ? "▰" : "宋"}</i>
      <b>{amount}</b>
      <small>{labels[kind]}</small>
    </span>
  );
}

export function CeramicPiece({ ceramic, compact = false }: { ceramic: CeramicState; compact?: boolean }) {
  const glaze = ceramic.stage === "shaped" || ceramic.stage === "sold" ? "unfired" : ceramic.glaze;
  const decoration = ceramic.stage === "shaped" || ceramic.stage === "sold" ? null : ceramic.decoration;
  const quality = ceramic.stage === "finished" || ceramic.stage === "delivered" || ceramic.stage === "presented"
    ? ceramic.quality
    : null;
  const description = [
    ceramic.shape.replaceAll("_", " "),
    ceramic.stage,
    glaze === "unfired" ? "unfired" : `${glaze.replaceAll("_", " ")} glaze, preferred heat ${preferredHeat(glaze)}`,
    decoration,
    quality,
  ].filter(Boolean).join(", ");
  return (
    <span
      className={`tabletop-ceramic shape-${ceramic.shape} glaze-${glaze} decoration-${decoration ?? "none"} quality-${quality ?? "none"} ${compact ? "is-compact" : ""}`}
      data-ceramic-id={ceramic.id}
      role="img"
      aria-label={description}
      title={`${ceramic.id} · ${description}`}
    >
      <svg viewBox="0 0 80 72" aria-hidden="true" focusable="false">
        {ceramic.shape === "bowl" && <path d="M8 22h64c-3 26-14 38-32 38S11 48 8 22zM18 64h44" />}
        {ceramic.shape === "plate" && <path d="M7 35c10 22 56 22 66 0M13 35h54M25 55h30" />}
        {ceramic.shape === "washer" && <path d="M12 28h56l-7 30H19zM27 62h26M25 25c0-10 30-10 30 0" />}
        {ceramic.shape === "vase" && <path d="M29 8h22l-3 13c15 9 19 34 5 42H27c-14-8-10-33 5-42zM29 9h22" />}
        {ceramic.shape === "censer" && <path d="M18 27h44l-5 29H23zM29 17h22l5 10H24zM19 59l-5 7M61 59l5 7M36 12c-3-5 2-7 0-11M46 12c-3-5 2-7 0-11" />}
      </svg>
      {decoration !== null && decoration !== "plain" && <i aria-hidden="true">{decoration === "carved" ? "刻" : decoration === "impressed" ? "印" : "裂"}</i>}
      {quality !== null && <b>{quality.slice(0, 1).toUpperCase()}</b>}
    </span>
  );
}

export function VisualOrderCard({
  orderId,
  compact = false,
  onInspect,
}: {
  orderId: string;
  compact?: boolean;
  onInspect?: (orderId: string) => void;
}) {
  const sprite = orderSprite(orderId);
  const definition = ORDER_DEFINITIONS[orderId];
  const style = sprite === null
    ? undefined
    : gridSpriteStyle(sprite.image, sprite.columns, sprite.rows, sprite.column, sprite.row);
  const contents = (
    <>
      <span className="tabletop-card-art" style={style} aria-hidden="true" />
      <strong className="tabletop-card-id">{orderId}</strong>
      <span className="sr-only">
        {orderId}, {definition?.vp ?? 0} victory points, {definition?.coins ?? 0} coins,
        {definition?.ceramics.length ?? 0} ceramic requirement{definition?.ceramics.length === 1 ? "" : "s"}
      </span>
    </>
  );
  return onInspect === undefined ? (
    <span className={`visual-order-card ${orderId.startsWith("I") ? "is-imperial" : "is-market"} ${compact ? "is-compact" : ""}`} data-order-id={orderId}>
      {contents}
    </span>
  ) : (
    <button
      className={`visual-order-card ${orderId.startsWith("I") ? "is-imperial" : "is-market"} ${compact ? "is-compact" : ""}`}
      type="button"
      onClick={() => onInspect(orderId)}
      data-order-id={orderId}
      aria-label={`Inspect Order ${orderId}`}
    >
      {contents}
    </button>
  );
}

export function VisualTechniqueTile({
  techniqueId,
  exhausted = false,
  onInspect,
}: {
  techniqueId: TechniqueId;
  exhausted?: boolean;
  onInspect?: (techniqueId: TechniqueId) => void;
}) {
  const sprite = techniqueSprite(techniqueId);
  const definition = TECHNIQUE_DEFINITIONS[techniqueId];
  const contents = (
    <>
      <span className="tabletop-tile-art" style={gridSpriteStyle(sprite.image, sprite.columns, sprite.rows, sprite.column, sprite.row)} aria-hidden="true" />
      <strong className="tabletop-tile-id">{techniqueId}</strong>
      {techniqueId === "T08" && <span className="tabletop-tile-live-copy" aria-hidden="true"><b>Colour Samples</b><small>Before first Office Order: bottom 1 face-up Order from either display, then refill.</small></span>}
      {exhausted && <span className="tile-exhausted">Used</span>}
      <span className="sr-only">{techniqueId}, {definition?.name}, {definition?.cost} coins. {definition?.ability}</span>
    </>
  );
  return onInspect === undefined ? (
    <span className={`visual-technique-tile ${exhausted ? "is-exhausted" : ""}`} data-technique-id={techniqueId}>{contents}</span>
  ) : (
    <button className={`visual-technique-tile ${exhausted ? "is-exhausted" : ""}`} type="button" onClick={() => onInspect(techniqueId)} data-technique-id={techniqueId} aria-label={`Inspect Technique ${techniqueId}`}>{contents}</button>
  );
}

const FIRE_RECTS: Record<FireModifier, [number, number, number, number]> = {
  [-1]: [0.019, 0.014, 0.270, 0.477],
  0: [0.300, 0.014, 0.270, 0.477],
  1: [0.585, 0.014, 0.270, 0.477],
};

const WOOD_RECTS: Record<WoodContribution, [number, number, number, number]> = {
  0: [0.019, 0.510, 0.232, 0.475],
  1: [0.258, 0.510, 0.232, 0.475],
  2: [0.500, 0.510, 0.232, 0.475],
  3: [0.740, 0.510, 0.232, 0.475],
};

function AtlasCard({ rect, children, className }: { rect: [number, number, number, number]; children: ReactNode; className: string }) {
  return (
    <span className={className} style={arbitraryCropStyle(TABLETOP_ASSETS.firingCards, ...rect)}>
      {children}
    </span>
  );
}

export function FireCard({ modifier }: { modifier: FireModifier }) {
  return <AtlasCard rect={FIRE_RECTS[modifier]} className="visual-fire-card"><span className="sr-only">Fire modifier {modifier > 0 ? `plus ${modifier}` : modifier}</span></AtlasCard>;
}

export function WoodCard({ amount, faceDown = false }: { amount: WoodContribution; faceDown?: boolean }) {
  return (
    <AtlasCard rect={WOOD_RECTS[amount]} className={`visual-wood-card ${faceDown ? "is-face-down" : ""}`}>
      <span className="sr-only">{faceDown ? "Face-down Wood Contribution" : `${amount} Wood Contribution`}</span>
    </AtlasCard>
  );
}
