import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

// Keep the physical board's coordinates intact; only its display size changes.
const MIN_BOARD_WIDTH = 1200;

export function ResponsiveGameBoard({ children, scaleToFit = true }: {
  children: ReactNode;
  scaleToFit?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ availableWidth: MIN_BOARD_WIDTH, height: 0 });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const board = boardRef.current;
    if (!scaleToFit || !viewport || !board) return;

    const measure = () => {
      const availableWidth = viewport.clientWidth;
      const height = board.offsetHeight;
      if (!availableWidth) return;
      setSize((previous) => previous.availableWidth === availableWidth && previous.height === height
        ? previous
        : { availableWidth, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(board);
    return () => observer.disconnect();
  }, [scaleToFit]);

  const scale = Math.min(1, size.availableWidth / MIN_BOARD_WIDTH);
  return (
    <div
      className={`kiln-responsive-board-viewport${scaleToFit ? "" : " is-fluid"}`}
      ref={viewportRef}
      style={scaleToFit ? { height: size.height ? size.height * scale : undefined } : undefined}
    >
      <div
        className="kiln-tabletop-board-body kiln-responsive-board-scene"
        ref={boardRef}
        style={scaleToFit ? { width: Math.max(MIN_BOARD_WIDTH, size.availableWidth), transform: `scale(${scale})` } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
