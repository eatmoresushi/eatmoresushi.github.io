/**
 * Stepper (kit; wireframe `.stepper`): a number chosen with labelled − / + buttons ("One fewer
 * Clay", "One more Clay"). The bounds come from the draft model's `options()`; the stepper only
 * enforces them. The value is an `<output>` (a polite status).
 */
import { useId } from "react";
import { Button } from "./Button.tsx";
import { useT } from "../i18n/I18nProvider.tsx";
import { num } from "../i18n/format.ts";
import "./Stepper.css";

export interface StepperProps {
  /** What is counted ("Clay"); used in the button and value labels. */
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** Input name for the test driver (§9.6). */
  name?: string;
}

export function Stepper({ label, value, min, max, onChange, disabled = false, name }: StepperProps) {
  const t = useT();
  const id = useId();
  const labelId = `${id}-label`;
  return (
    <div className="kit-stepper" role="group" aria-labelledby={labelId} data-name={name}>
      <span id={labelId} className="kit-stepper-label">{label}</span>
      <Button
        size="sm"
        className="kit-stepper-btn"
        aria-label={t("common.kit.stepperFewer", { item: label })}
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <span aria-hidden="true">−</span>
      </Button>
      <output className="kit-stepper-value num" aria-label={t("common.kit.stepperValue", { item: label, n: value })}>{num(value)}</output>
      <Button
        size="sm"
        className="kit-stepper-btn"
        aria-label={t("common.kit.stepperMore", { item: label })}
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <span aria-hidden="true">+</span>
      </Button>
    </div>
  );
}
