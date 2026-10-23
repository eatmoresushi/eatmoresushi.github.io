/**
 * OptionGroup (kit, UI_V1.6.1_ARCHITECTURE §8.1; wireframe `.dstep`, `.wsel`, `.pills`). Frozen
 * after phase A.
 *
 * A `<fieldset>` with a `<legend>` that holds native radios (single choice, arrow keys for free)
 * or checkboxes (multi-choice: the hand trim, the Glaze & Load vessels). Its `OptionCard`
 * children read `name`, `type`, the selection and `onChange` from the group, so a form renders
 * only from its draft model's `options()` and never wires inputs by hand.
 *
 * Test-driver contract (§9.6): each input's `name` and `value` are engine IDs.
 */
import { createContext, useContext, useId } from "react";
import type { ReactNode } from "react";
import "./OptionCard.css";

export type OptionInputType = "radio" | "checkbox";
export type OptionLayout = "list" | "grid" | "pills";

export interface OptionGroupContextValue {
  name: string;
  type: OptionInputType;
  isChecked: (value: string) => boolean;
  onChange: (value: string, checked: boolean) => void;
}

export const OptionGroupContext = createContext<OptionGroupContextValue | null>(null);

/** The surrounding group, or null for a standalone `OptionCard`. */
export function useOptionGroup(): OptionGroupContextValue | null {
  return useContext(OptionGroupContext);
}

export interface OptionGroupProps {
  /** The question this group answers ("Worker", "Location", "Glaze"). */
  legend: ReactNode;
  /** Keep the legend for assistive technology only. */
  hideLegend?: boolean;
  /** Numbered step badge before the legend (wireframe `.dstep h3 .n`). */
  step?: number;
  /** Short status after the legend ("2 of 5 open"). */
  aside?: ReactNode;
  /** Help text under the legend; linked with `aria-describedby`. */
  description?: ReactNode;
  /** Input `name`: the engine field this group sets. */
  name: string;
  /** `"radio"` (default) or `"checkbox"`. */
  type?: OptionInputType;
  /** Radio: the checked value, or null for none yet. */
  value?: string | null;
  /** Checkbox: the checked values. */
  values?: readonly string[];
  /** Called with the option's value and its new checked state. Never called for a disabled option. */
  onChange: (value: string, checked: boolean) => void;
  layout?: OptionLayout;
  /** A group-level problem (for example the engine's reason the selection cannot be built). */
  error?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function OptionGroup({
  legend,
  hideLegend = false,
  step,
  aside,
  description,
  name,
  type = "radio",
  value = null,
  values,
  onChange,
  layout = "list",
  error,
  className,
  children,
}: OptionGroupProps) {
  const id = useId();
  const descriptionId = description === undefined ? undefined : `${id}-desc`;
  const errorId = error === undefined || error === null ? undefined : `${id}-err`;
  const describedBy = [descriptionId, errorId].filter((part) => part !== undefined).join(" ") || undefined;
  const selected = new Set(type === "checkbox" ? values ?? [] : value === null ? [] : [value]);
  const context: OptionGroupContextValue = {
    name,
    type,
    isChecked: (candidate) => selected.has(candidate),
    onChange,
  };
  return (
    <fieldset className={["kit-optgroup", className ?? ""].filter((part) => part !== "").join(" ")} aria-describedby={describedBy}>
      <legend className={hideLegend ? "sr-only" : "kit-optgroup-legend"}>
        {step === undefined ? null : <span className="kit-optgroup-step" aria-hidden="true">{step}</span>}
        <span className="kit-optgroup-title">{legend}</span>
        {aside === undefined ? null : <span className="kit-optgroup-aside">{aside}</span>}
      </legend>
      {description === undefined ? null : <p id={descriptionId} className="kit-optgroup-desc">{description}</p>}
      <OptionGroupContext.Provider value={context}>
        <div className="kit-optgroup-items" data-layout={layout}>{children}</div>
      </OptionGroupContext.Provider>
      {errorId === undefined ? null : <p id={errorId} className="kit-optgroup-error">{error}</p>}
    </fieldset>
  );
}
