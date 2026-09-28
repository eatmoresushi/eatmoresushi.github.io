export const TABLETOP_REFERENCE_WIDTH = 1800;
export const TABLETOP_COMPACT_BREAKPOINT = 960;

export type TabletopLayout = {
  mode: "wide" | "compact";
  scale: number;
  cardScale: number;
};

type TabletopMeasurements = {
  availableWidth: number;
  textScale?: number;
};

/** Fill the available width; short windows scroll without shrinking the table. */
export function calculateTabletopLayout({ availableWidth, textScale = 1 }: TabletopMeasurements): TabletopLayout {
  if (availableWidth < TABLETOP_COMPACT_BREAKPOINT || !Number.isFinite(availableWidth) || textScale > 1.25) {
    return {
      mode: "compact",
      scale: 1,
      cardScale: Number.isFinite(availableWidth) ? Math.max(.8, Math.min(1, availableWidth / 430)) : 1,
    };
  }

  const scale = Math.min(2, availableWidth / TABLETOP_REFERENCE_WIDTH);
  return { mode: "wide", scale, cardScale: scale };
}
