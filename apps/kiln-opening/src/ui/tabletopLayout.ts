export const TABLETOP_REFERENCE_WIDTH = 1440;
export const TABLETOP_COMPACT_BREAKPOINT = 960;

export type TabletopLayout = {
  mode: "wide" | "compact";
  scale: number;
  cardScale: number;
};

type TabletopMeasurements = {
  availableWidth: number;
  availableHeight: number;
  overviewHeight: number;
  textScale?: number;
};

/** Fit the shared overview, allowing at most 20% extra reduction for short windows. */
export function calculateTabletopLayout({ availableWidth, availableHeight, overviewHeight, textScale = 1 }: TabletopMeasurements): TabletopLayout {
  if (availableWidth < TABLETOP_COMPACT_BREAKPOINT || !Number.isFinite(availableWidth) || textScale > 1.25) {
    return {
      mode: "compact",
      scale: 1,
      cardScale: Number.isFinite(availableWidth) ? Math.max(.8, Math.min(1, availableWidth / 430)) : 1,
    };
  }

  const widthScale = Math.min(1.25, availableWidth / TABLETOP_REFERENCE_WIDTH);
  const heightScale = availableHeight > 0 && overviewHeight > 0
    && Number.isFinite(availableHeight) && Number.isFinite(overviewHeight)
    ? availableHeight / overviewHeight
    : widthScale;

  const scale = Math.max(widthScale * .8, Math.min(widthScale, heightScale));
  return { mode: "wide", scale, cardScale: scale };
}
