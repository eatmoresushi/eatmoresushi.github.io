import { useLayoutEffect } from "react";
import type { RefObject } from "react";

const ORDER_SELECTOR = ".kiln-tabletop-market .kiln-order-card";
const SIZE_PROPERTIES = ["--table-order-width", "--table-order-height"] as const;

/** Public Orders set personal Order sizes; Techs share a responsive CSS size. */
export function useTabletopPieceSizes(rootRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const root = rootRef.current;
    const view = root?.ownerDocument.defaultView;
    if (root === null || root === undefined || view === null || view === undefined) return;

    const previous = SIZE_PROPERTIES.map((property) => ({
      property,
      value: root.style.getPropertyValue(property),
      priority: root.style.getPropertyPriority(property),
    }));
    const written = new Map<string, string>();
    let observed = new Set<HTMLElement>();
    let pendingFrame: number | null = null;
    let disposed = false;

    function writeSize(property: typeof SIZE_PROPERTIES[number], pixels: number): void {
      // A temporarily empty/hidden display keeps its last useful measurement.
      if (pixels <= 0 || !Number.isFinite(pixels)) return;
      const value = `${Math.round(pixels * 1000) / 1000}px`;
      if (root!.style.getPropertyValue(property) === value) return;
      root!.style.setProperty(property, value);
      written.set(property, value);
    }

    function measure(): void {
      if (disposed) return;
      const orders = [...root!.querySelectorAll<HTMLElement>(ORDER_SELECTOR)];
      const nextObserved = new Set(orders);
      for (const element of observed) {
        if (!nextObserved.has(element)) resizeObserver?.unobserve(element);
      }
      for (const element of nextObserved) {
        if (!observed.has(element)) resizeObserver?.observe(element, { box: "border-box" });
      }
      observed = nextObserved;

      // Measure layout pixels, not transformed screen pixels, so personal Orders
      // receive the same single table scale as public Orders.
      const orderRects = orders.map((element) => ({ width: element.offsetWidth, height: element.offsetHeight }));
      writeSize("--table-order-width", Math.max(0, ...orderRects.map(({ width }) => width)));
      writeSize("--table-order-height", Math.max(0, ...orderRects.map(({ height }) => height)));
    }

    function scheduleMeasure(): void {
      if (disposed || pendingFrame !== null) return;
      pendingFrame = view!.requestAnimationFrame(() => {
        pendingFrame = null;
        measure();
      });
    }

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasure);
    const mutationObserver = new MutationObserver(scheduleMeasure);
    // Root style writes are deliberately excluded, preventing measurement feedback.
    mutationObserver.observe(root, { childList: true, characterData: true, subtree: true });
    view.addEventListener("resize", scheduleMeasure);
    measure();

    return () => {
      disposed = true;
      if (pendingFrame !== null) view.cancelAnimationFrame(pendingFrame);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      view.removeEventListener("resize", scheduleMeasure);
      for (const { property, value, priority } of previous) {
        if (root.style.getPropertyValue(property) !== written.get(property)) continue;
        if (value) root.style.setProperty(property, value, priority);
        else root.style.removeProperty(property);
      }
    };
  }, [rootRef]);
}
