/**
 * Disclosure (kit; wireframe `details`): a native `<details>`/`<summary>`, used for long rules
 * text (never a line clamp, §7.3) and the "unavailable" location list. Escape closes an open
 * disclosure and returns focus to its summary.
 */
import { useRef } from "react";
import type { KeyboardEvent, ReactNode, SyntheticEvent } from "react";
import "./Disclosure.css";

export interface DisclosureProps {
  summary: ReactNode;
  /** Uncontrolled initial state. */
  defaultOpen?: boolean;
  /** Controlled state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Visual tone of the summary: `"warn"` for an unavailable reason. */
  tone?: "default" | "warn";
  className?: string;
  children?: ReactNode;
}

export function Disclosure({ summary, defaultOpen, open, onOpenChange, tone = "default", className, children }: DisclosureProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const onToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const next = event.currentTarget.open;
    if (open !== undefined && next !== open) {
      event.currentTarget.open = open;
    }
    onOpenChange?.(next);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDetailsElement>) => {
    const details = detailsRef.current;
    if (event.key !== "Escape" || details === null || !details.open) return;
    event.stopPropagation();
    if (open === undefined) details.open = false;
    onOpenChange?.(false);
    summaryRef.current?.focus();
  };
  const classes = ["kit-disclosure", tone === "warn" ? "kit-disclosure--warn" : "", className ?? ""].filter((part) => part !== "").join(" ");
  return (
    <details
      ref={detailsRef}
      className={classes}
      open={open ?? defaultOpen}
      onToggle={onToggle}
      onKeyDown={onKeyDown}
    >
      <summary ref={summaryRef} className="kit-disclosure-summary">{summary}</summary>
      <div className="kit-disclosure-body">{children}</div>
    </details>
  );
}
