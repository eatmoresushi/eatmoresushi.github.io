export type PreviewPosition = {
  left: number;
  top: number;
  maxHeight: number;
  placement: "above" | "below";
};

/** Fixed-position previews stay readable even at screen edges or in short viewports. */
export function previewPosition(
  anchor: { left: number; right: number; top: number; bottom: number; width: number },
  viewport: { width: number; height: number },
): PreviewPosition | null {
  const gutter = 12;
  const gap = 12;
  if (anchor.bottom < gutter || anchor.top > viewport.height - gutter
    || anchor.right < gutter || anchor.left > viewport.width - gutter) return null;
  const width = Math.min(320, viewport.width - gutter * 2);
  const left = Math.min(viewport.width - gutter - width / 2, Math.max(gutter + width / 2, anchor.left + anchor.width / 2));
  const roomAbove = Math.max(0, anchor.top - gap - gutter);
  const roomBelow = Math.max(0, viewport.height - anchor.bottom - gap - gutter);
  if (Math.max(roomAbove, roomBelow) < 180) {
    return { left, top: gutter, maxHeight: Math.max(1, viewport.height - gutter * 2), placement: "below" };
  }
  const placement = roomBelow >= 280 || roomBelow >= roomAbove ? "below" : "above";
  return {
    left,
    top: placement === "below" ? anchor.bottom + gap : anchor.top - gap,
    maxHeight: placement === "below" ? roomBelow : roomAbove,
    placement,
  };
}
