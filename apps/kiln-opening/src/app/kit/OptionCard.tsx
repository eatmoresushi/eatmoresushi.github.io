/**
 * OptionCard (kit, UI_V1.6.1_ARCHITECTURE §8.1; wireframe `.opt`, `.pill`). Frozen after phase A.
 *
 * One choice as a native radio or checkbox inside a `<label>`, drawn as a card (`variant="card"`)
 * or a compact pill (`variant="pill"`: Shapes, Glazes, Decorations, modifiers).
 *
 * - **Unavailable** options stay focusable: the input gets `aria-disabled="true"` and the
 *   `reason` is shown (visibly, in both variants: a pill shows it after its title) and linked
 *   through `aria-describedby`. Arrow keys can still check an
 *   `aria-disabled` radio, so the change is ignored here (and the draft's `reduce` would reject
 *   it anyway); React then restores the controlled selection.
 * - **Sub-editor:** `children` are rendered *after* the label, never inside it (controls
 *   nested inside a label are invalid). Give that region an `id` and pass it as `controls`,
 *   which the input names in `aria-controls`.
 * - Inside an `OptionGroup` the card takes `name`, `type`, `checked` and `onChange` from the
 *   group; the props override them for a standalone card.
 * - Test-driver contract (§9.6): the input's `name` and `value` are engine IDs.
 */
import { useId } from "react";
import type { ChangeEvent, ReactNode, Ref } from "react";
import { useOptionGroup } from "./OptionGroup.tsx";
import type { OptionInputType } from "./OptionGroup.tsx";
import "./OptionCard.css";

export type OptionCardVariant = "card" | "pill";

export interface OptionCardProps {
  /** The engine ID this option stands for (input `value`). */
  value: string;
  /** The option's name. */
  title: ReactNode;
  /** Right-aligned short fact: a price, a count, "only you". */
  meta?: ReactNode;
  /** One line under the title. */
  description?: ReactNode;
  /** A piece or icon before the title (worker token, ceramic art, Glaze swatch). */
  leading?: ReactNode;
  /** Unavailable: `aria-disabled`, still focusable, change ignored. */
  disabled?: boolean;
  /** Why it is unavailable (or another note); shown and linked with `aria-describedby`. */
  reason?: ReactNode;
  /** The `id` of the sibling region this option opens (sub-editor), for `aria-controls`. */
  controls?: string;
  variant?: OptionCardVariant;
  /** Standalone use (outside an `OptionGroup`). */
  name?: string;
  type?: OptionInputType;
  checked?: boolean;
  onChange?: (value: string, checked: boolean) => void;
  className?: string;
  /** Sibling content after the label: the sub-editor region. */
  children?: ReactNode;
  inputRef?: Ref<HTMLInputElement>;
}

export function OptionCard({
  value,
  title,
  meta,
  description,
  leading,
  disabled = false,
  reason,
  controls,
  variant = "card",
  name,
  type,
  checked,
  onChange,
  className,
  children,
  inputRef,
}: OptionCardProps) {
  const group = useOptionGroup();
  const id = useId();
  const inputName = name ?? group?.name ?? "";
  const inputType: OptionInputType = type ?? group?.type ?? "radio";
  const isChecked = checked ?? group?.isChecked(value) ?? false;
  const notify = onChange ?? group?.onChange;
  const descriptionId = description === undefined ? undefined : `${id}-desc`;
  const reasonId = reason === undefined || reason === null ? undefined : `${id}-why`;
  const describedBy = [reasonId, descriptionId].filter((part) => part !== undefined).join(" ") || undefined;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    notify?.(value, event.currentTarget.checked);
  };

  const classes = ["kit-opt", `kit-opt--${variant}`, className ?? ""].filter((part) => part !== "").join(" ");
  return (
    <div className={classes} data-checked={isChecked ? "true" : undefined} data-disabled={disabled ? "true" : undefined}>
      <label className="kit-opt-label">
        <input
          ref={inputRef}
          className="kit-opt-input"
          type={inputType}
          name={inputName}
          value={value}
          checked={isChecked}
          onChange={handleChange}
          aria-disabled={disabled ? true : undefined}
          aria-describedby={describedBy}
          aria-controls={controls}
        />
        <span className={`kit-opt-mark kit-opt-mark--${inputType}`} aria-hidden="true" />
        <span className="kit-opt-body">
          <span className="kit-opt-head">
            {leading === undefined ? null : <span className="kit-opt-leading">{leading}</span>}
            <span className="kit-opt-title">{title}</span>
            {meta === undefined ? null : <span className="kit-opt-meta">{meta}</span>}
          </span>
          {description === undefined ? null : <span id={descriptionId} className="kit-opt-desc">{description}</span>}
          {reasonId === undefined ? null : <span id={reasonId} className="kit-opt-reason">{reason}</span>}
        </span>
      </label>
      {children}
    </div>
  );
}
