/**
 * Placeholder (UI_V1.6.1_ARCHITECTURE §4.3 rule 1). Frozen after phase A.
 *
 * Every component stub A2 creates for a phase B owner renders `<Placeholder name="…" />` with
 * its final export name and props, so `GameScreen`, the `WorldSections` imports and
 * `decision/windows.ts` never change in phase B. The name is the component's file name, a
 * development label rather than game text; it disappears as each owner lands the real component.
 *
 * `children` lets a stub show development content (the dev session panel in the lobby stubs).
 */
import type { ReactNode } from "react";
import "./Placeholder.css";

export interface PlaceholderProps {
  /** The component this stands in for, e.g. `"CentralBoard"`. */
  name: string;
  /** Render inline (inside a line of text or a chip row) instead of as a block. */
  inline?: boolean;
  children?: ReactNode;
}

export function Placeholder({ name, inline = false, children }: PlaceholderProps) {
  const Tag = inline ? "span" : "div";
  return (
    <Tag className={inline ? "placeholder placeholder--inline" : "placeholder"} data-placeholder={name}>
      <span className="placeholder-name" lang="en" translate="no">
        {name}
      </span>
      {children}
    </Tag>
  );
}
