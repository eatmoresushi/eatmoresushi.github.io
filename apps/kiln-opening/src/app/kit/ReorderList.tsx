/**
 * ReorderList (kit, §8.1): an ordered list with **Move up** and **Move down** buttons per item,
 * for the Guild Hall Shifu's secret bottom order. There is no drag-only interaction. After a
 * move, focus stays on the moved item's button (the other one at an edge), and the move is
 * announced politely ("Celadon Glazes moved to position 1"), through `announce` when given (the
 * shell's LiveAnnouncer) or a local polite region.
 */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useT } from "../i18n/I18nProvider.tsx";
import "./ReorderList.css";

export interface ReorderItem {
  /** Engine ID (Tech ID); not shown. */
  id: string;
  /** Plain-text name, used in button labels and announcements. */
  label: string;
  /** Visual content; defaults to the label. */
  content?: ReactNode;
}

export interface ReorderListProps {
  /** The list's accessible name ("Return to the bottom, first to last"). */
  label: string;
  items: readonly ReorderItem[];
  onReorder: (ids: string[]) => void;
  announce?: (message: string) => void;
  className?: string;
}

export function ReorderList({ label, items, onReorder, announce, className }: ReorderListProps) {
  const t = useT();
  const [message, setMessage] = useState("");
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<string | null>(null);

  // After the parent re-renders the new order, put focus back on the moved item's button.
  useEffect(() => {
    if (pendingFocus.current === null) return;
    buttons.current.get(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  });

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const ids = items.map((item) => item.id);
    const [moved] = ids.splice(from, 1);
    if (moved === undefined) return;
    ids.splice(to, 0, moved);
    onReorder(ids);
    const item = items[from];
    if (item !== undefined) {
      const text = t("common.kit.movedTo", { item: item.label, n: to + 1 });
      if (announce === undefined) setMessage(text);
      else announce(text);
      const direction = to < from ? "up" : "down";
      const atEdge = to === 0 || to === items.length - 1;
      const focusDirection = atEdge ? (direction === "up" ? "down" : "up") : direction;
      pendingFocus.current = `${item.id}:${focusDirection}`;
    }
  };

  const register = (key: string) => (node: HTMLButtonElement | null) => {
    if (node === null) buttons.current.delete(key);
    else buttons.current.set(key, node);
  };

  return (
    <div className={["kit-reorder", className ?? ""].filter((part) => part !== "").join(" ")}>
      <ol className="kit-reorder-list" aria-label={label}>
        {items.map((item, index) => (
          <li key={item.id} className="kit-reorder-item" data-id={item.id}>
            <span className="kit-reorder-pos num" aria-hidden="true">{index + 1}</span>
            <span className="kit-reorder-content">{item.content ?? item.label}</span>
            <span className="kit-reorder-buttons">
              <button
                ref={register(`${item.id}:up`)}
                type="button"
                className="kit-reorder-btn"
                aria-label={t("common.kit.moveItemUp", { item: item.label })}
                aria-disabled={index === 0 ? true : undefined}
                onClick={() => move(index, index - 1)}
              >
                <span aria-hidden="true">↑</span>
              </button>
              <button
                ref={register(`${item.id}:down`)}
                type="button"
                className="kit-reorder-btn"
                aria-label={t("common.kit.moveItemDown", { item: item.label })}
                aria-disabled={index === items.length - 1 ? true : undefined}
                onClick={() => move(index, index + 1)}
              >
                <span aria-hidden="true">↓</span>
              </button>
            </span>
          </li>
        ))}
      </ol>
      {announce === undefined ? <p className="sr-only" aria-live="polite">{message}</p> : null}
    </div>
  );
}
