/**
 * MenuButton (kit, §8.1): a menu button (`aria-haspopup="menu"`, `aria-expanded`) over a
 * `role="menu"` list. Opening focuses the first enabled item; Up/Down/Home/End move between
 * items; Escape closes and returns focus to the button; Tab or an outside click closes it.
 * Items are `menuitem`s, or `menuitemradio`s when they carry `checked` (the Theme choice).
 */
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import "./MenuButton.css";

export interface MenuItem {
  id: string;
  label: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** Destructive action (End session). */
  danger?: boolean;
  /** A radio item (`menuitemradio`, `aria-checked`). */
  checked?: boolean;
  /** Items with the same group label are wrapped in a labelled `role="group"`. */
  group?: string;
  /** Keep the menu open after selecting (radio items). */
  keepOpen?: boolean;
}

export interface MenuButtonProps {
  /** Visible button content. */
  label: ReactNode;
  /** Accessible name when the visible content is an icon ("Menu"). */
  ariaLabel?: string;
  items: readonly MenuItem[];
  /** Which edge the menu aligns to. */
  align?: "start" | "end";
  className?: string;
}

export function MenuButton({ label, ariaLabel, items, align = "end", className }: MenuButtonProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = items.map((item, index) => (item.disabled === true ? -1 : index)).filter((index) => index >= 0);

  const focusItem = (index: number | undefined) => {
    if (index !== undefined) itemRefs.current[index]?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    focusItem(enabled[0]);
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const current = itemRefs.current.findIndex((node) => node === document.activeElement);
    const position = enabled.indexOf(current);
    switch (event.key) {
      case "ArrowDown":
        focusItem(enabled[(position + 1) % enabled.length]);
        break;
      case "ArrowUp":
        focusItem(enabled[(position - 1 + enabled.length) % enabled.length]);
        break;
      case "Home":
        focusItem(enabled[0]);
        break;
      case "End":
        focusItem(enabled[enabled.length - 1]);
        break;
      case "Escape":
        close(true);
        break;
      case "Tab":
        setOpen(false);
        return;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const onButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
    }
  };

  const groups: Array<{ name: string | undefined; entries: Array<{ item: MenuItem; index: number }> }> = [];
  items.forEach((item, index) => {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.name === item.group) last.entries.push({ item, index });
    else groups.push({ name: item.group, entries: [{ item, index }] });
  });

  const renderItem = ({ item, index }: { item: MenuItem; index: number }) => (
    <li key={item.id} role="none">
      <button
        ref={(node) => {
          itemRefs.current[index] = node;
        }}
        type="button"
        role={item.checked === undefined ? "menuitem" : "menuitemradio"}
        aria-checked={item.checked}
        aria-disabled={item.disabled === true ? true : undefined}
        tabIndex={-1}
        className={["kit-menu-item", item.danger === true ? "kit-menu-item--danger" : ""].filter((part) => part !== "").join(" ")}
        onClick={() => {
          if (item.disabled === true) return;
          item.onSelect();
          if (item.keepOpen !== true) close(true);
        }}
      >
        {item.checked === undefined ? null : <span className="kit-menu-check" aria-hidden="true">{item.checked ? "●" : "○"}</span>}
        {item.label}
      </button>
    </li>
  );

  return (
    <div ref={rootRef} className={["kit-menu", className ?? ""].filter((part) => part !== "").join(" ")}>
      <button
        ref={buttonRef}
        type="button"
        className="kit-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        aria-label={ariaLabel}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onButtonKeyDown}
      >
        {label}
      </button>
      <ul
        id={`${id}-menu`}
        role="menu"
        aria-label={ariaLabel}
        className="kit-menu-list"
        data-align={align}
        hidden={!open}
        onKeyDown={onMenuKeyDown}
      >
        {groups.map((group, groupIndex) =>
          group.name === undefined
            ? group.entries.map(renderItem)
            : (
              <li key={`group-${groupIndex}`} role="none">
                <ul role="group" aria-label={group.name} className="kit-menu-group">
                  <li role="presentation" className="kit-menu-group-label" aria-hidden="true">{group.name}</li>
                  {group.entries.map(renderItem)}
                </ul>
              </li>
            ))}
      </ul>
    </div>
  );
}
