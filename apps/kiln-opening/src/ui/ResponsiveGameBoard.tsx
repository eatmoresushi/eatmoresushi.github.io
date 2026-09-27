import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

// Keep the physical board's coordinates intact; only its display size changes.
const MIN_BOARD_WIDTH = 1200;

export function ResponsiveGameBoard({ children, matchHeightRef, matchHeight = false }: {
  children: ReactNode;
  matchHeightRef?: RefObject<HTMLElement | null>;
  matchHeight?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ availableWidth: MIN_BOARD_WIDTH, height: 0, minimumHeight: 0 });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const board = boardRef.current;
    if (!viewport || !board) return;

    const measure = () => {
      const availableWidth = viewport.clientWidth;
      const height = board.offsetHeight;
      if (!availableWidth) return;
      const target = matchHeight ? matchHeightRef?.current : null;
      const frame = viewport.parentElement;
      const frameStyle = frame ? getComputedStyle(frame) : null;
      const insets = frameStyle ? [frameStyle.paddingTop, frameStyle.paddingBottom, frameStyle.borderTopWidth, frameStyle.borderBottomWidth]
        .reduce((total, value) => total + (parseFloat(value) || 0), 0) : 0;
      const scale = Math.min(1, availableWidth / MIN_BOARD_WIDTH);
      const minimumHeight = target ? Math.max(0, (target.offsetHeight - insets) / scale) : 0;
      setSize((previous) => previous.availableWidth === availableWidth && previous.height === height && previous.minimumHeight === minimumHeight
        ? previous
        : { availableWidth, height, minimumHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(board);
    if (matchHeightRef?.current) observer.observe(matchHeightRef.current);
    return () => observer.disconnect();
  }, [matchHeight, matchHeightRef]);

  const scale = Math.min(1, size.availableWidth / MIN_BOARD_WIDTH);
  return (
    <div
      className="kiln-responsive-board-viewport"
      ref={viewportRef}
      style={{ height: size.height ? size.height * scale : undefined }}
    >
      <div
        className={`kiln-tabletop-board-body kiln-responsive-board-scene${matchHeight ? " has-matched-height" : ""}`}
        ref={boardRef}
        style={{ width: Math.max(MIN_BOARD_WIDTH, size.availableWidth), minHeight: size.minimumHeight || undefined, transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}
