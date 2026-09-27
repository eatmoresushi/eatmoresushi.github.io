import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { calculateTabletopLayout, TABLETOP_REFERENCE_WIDTH } from "./tabletopLayout";
import type { TabletopLayout } from "./tabletopLayout";

type TabletopSize = TabletopLayout & { availableWidth: number; sceneHeight: number };

/** The shared table and personal workshop scale together; dialogs stay outside. */
export function ResponsiveTabletop({ children, onLayoutChange }: {
  children: ReactNode;
  onLayoutChange?: (layout: TabletopLayout) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<TabletopSize>({
    mode: "wide", scale: 1, cardScale: 1, availableWidth: TABLETOP_REFERENCE_WIDTH, sceneHeight: 0,
  });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const scene = sceneRef.current;
    const view = viewport?.ownerDocument.defaultView;
    if (!viewport || !scene || !view) return;
    let pendingFrame: number | null = null;
    let disposed = false;

    const measure = () => {
      if (disposed || viewport.clientWidth <= 0) return;
      const layout = calculateTabletopLayout({
        availableWidth: viewport.clientWidth,
        textScale: parseFloat(view.getComputedStyle(viewport.ownerDocument.documentElement).fontSize) / 16,
      });
      const next = { ...layout, availableWidth: viewport.clientWidth, sceneHeight: scene.offsetHeight };
      setSize((previous) => previous.mode === next.mode && previous.scale === next.scale && previous.cardScale === next.cardScale
        && previous.availableWidth === next.availableWidth && previous.sceneHeight === next.sceneHeight
        ? previous : next);
    };
    const scheduleMeasure = () => {
      if (disposed || pendingFrame !== null) return;
      pendingFrame = view.requestAnimationFrame(() => { pendingFrame = null; measure(); });
    };

    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasure);
    observer?.observe(viewport);
    observer?.observe(scene);
    view.addEventListener("resize", scheduleMeasure);
    return () => {
      disposed = true;
      if (pendingFrame !== null) view.cancelAnimationFrame(pendingFrame);
      observer?.disconnect();
      view.removeEventListener("resize", scheduleMeasure);
    };
  }, []);

  useLayoutEffect(() => {
    onLayoutChange?.({ mode: size.mode, scale: size.scale, cardScale: size.cardScale });
  }, [size.mode, size.scale, size.cardScale, onLayoutChange]);

  const wide = size.mode === "wide";
  return (
    <div
      className="kiln-responsive-tabletop"
      data-layout={size.mode}
      ref={viewportRef}
      style={{ height: wide && size.sceneHeight ? size.sceneHeight * size.scale : undefined }}
    >
      <div
        className="kiln-responsive-tabletop-scene"
        data-layout={size.mode}
        ref={sceneRef}
        style={{
          position: "relative",
          width: wide ? TABLETOP_REFERENCE_WIDTH : "100%",
          transform: wide ? `scale(${size.scale})` : undefined,
          transformOrigin: "top left",
          marginLeft: wide ? Math.max(0, (size.availableWidth - TABLETOP_REFERENCE_WIDTH * size.scale) / 2) : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
