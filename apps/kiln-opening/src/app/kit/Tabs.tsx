/**
 * Tabs (kit; WAI-ARIA tabs pattern, wireframe `.btab`). Used for the D1 board tabs only (§8.1):
 * a `tablist` of `tab` buttons with a roving `tabindex`, Left/Right/Home/End moving focus and
 * selection (automatic activation), and one `tabpanel` holding the selected content.
 *
 * The phone section bar is NOT a tablist (§8.1, U4): it is a `nav` of buttons with
 * `aria-current`.
 */
import { useId, useRef } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import "./Tabs.css";

export interface TabItem {
  /** Stable ID (a player ID, `"home"`). Not shown. */
  id: string;
  label: ReactNode;
  /** Seat index for the coloured top edge (`--seat-N`). */
  seat?: number;
  /** Visual emphasis for the "Your workshop" tab. */
  home?: boolean;
  /** Leading icon, hidden from assistive technology. */
  icon?: ReactNode;
}

export interface TabsProps {
  /** The tablist's accessible name ("Kiln Player Boards"). */
  label: string;
  tabs: readonly TabItem[];
  selected: string;
  onSelect: (id: string) => void;
  /** The selected tab's panel content. */
  children?: ReactNode;
  className?: string;
}

export function Tabs({ label, tabs, selected, onSelect, children, className }: TabsProps) {
  const base = useId();
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const tabId = (id: string) => `${base}-tab-${id}`;
  const panelId = `${base}-panel`;
  const index = Math.max(0, tabs.findIndex((tab) => tab.id === selected));

  const move = (to: number) => {
    const tab = tabs[(to + tabs.length) % tabs.length];
    if (tab === undefined) return;
    onSelect(tab.id);
    refs.current.get(tab.id)?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowRight":
        move(index + 1);
        break;
      case "ArrowLeft":
        move(index - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(tabs.length - 1);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div className={["kit-tabs", className ?? ""].filter((part) => part !== "").join(" ")}>
      <div className="kit-tablist" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((tab) => {
          const isSelected = tab.id === (tabs[index]?.id ?? selected);
          const style = tab.seat === undefined ? undefined : ({ "--pc": `var(--seat-${tab.seat})` } as CSSProperties);
          return (
            <button
              key={tab.id}
              ref={(node) => {
                if (node === null) refs.current.delete(tab.id);
                else refs.current.set(tab.id, node);
              }}
              id={tabId(tab.id)}
              type="button"
              role="tab"
              className={["kit-tab", tab.home === true ? "kit-tab--home" : ""].filter((part) => part !== "").join(" ")}
              style={style}
              aria-selected={isSelected}
              aria-controls={panelId}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onSelect(tab.id)}
            >
              {tab.icon === undefined ? null : <span className="kit-tab-icon" aria-hidden="true">{tab.icon}</span>}
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        id={panelId}
        className="kit-tabpanel"
        role="tabpanel"
        aria-labelledby={tabs[index] === undefined ? undefined : tabId(tabs[index].id)}
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  );
}
