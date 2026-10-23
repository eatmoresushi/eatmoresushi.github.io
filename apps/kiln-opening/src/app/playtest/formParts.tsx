/**
 * Small form controls of the Playtest Form V3 page (owner: B3): a labelled field, a number
 * field, a select, a numbered section and a 0/1 usage counter. Native inputs throughout; every
 * control has a visible label (or an `aria-label` in the round tables) and an `id` derived from
 * its schema path (`fieldId`), so a validation issue can link to it.
 */
import type { ReactNode } from "react";
import { useT } from "../i18n/I18nProvider.tsx";
import { num } from "../i18n/format.ts";
import { Button } from "../kit/Button.tsx";
import { numberFromInput } from "./draftOps.ts";
import { fieldId } from "./issueText.ts";

export function Field({ label, hint, path, children }: { label: string; hint?: string; path: string; children: ReactNode }) {
  const id = fieldId(path);
  return (
    <div className="pt-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint === undefined ? null : <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}

export function NumberField({
  label,
  path,
  value,
  onChange,
  min = 0,
  max,
  required = false,
  hint,
}: {
  label: string;
  path: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  required?: boolean;
  hint?: string;
}) {
  const id = fieldId(path);
  return (
    <Field label={label} path={path} {...(hint === undefined ? {} : { hint })}>
      <input
        id={id}
        name={path}
        type="number"
        inputMode="numeric"
        value={value ?? ""}
        min={min}
        max={max}
        required={required}
        aria-describedby={hint === undefined ? undefined : `${id}-hint`}
        onChange={(event) => onChange(numberFromInput(event.target.value))}
      />
    </Field>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function SelectField({
  label,
  path,
  value,
  options,
  onChange,
  placeholder,
  required = false,
}: {
  label: string;
  path: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  /** An empty first option ("Not recorded", "None", "Choose…"). */
  placeholder?: { label: string; disabled?: boolean };
  required?: boolean;
}) {
  const id = fieldId(path);
  return (
    <Field label={label} path={path}>
      <select id={id} name={path} value={value} required={required} onChange={(event) => onChange(event.target.value)}>
        {placeholder === undefined ? null : (
          <option value="" disabled={placeholder.disabled === true}>
            {placeholder.label}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled === true}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function FormSection({ index, title, description, optional = false, children }: { index: number; title: string; description: string; optional?: boolean; children: ReactNode }) {
  const t = useT();
  const headingId = `pt-section-${String(index)}-title`;
  return (
    <section className="pt-section" id={`pt-section-${String(index)}`} aria-labelledby={headingId}>
      <header className="pt-section-head">
        <span className="pt-section-n num" aria-hidden="true">{num(index)}</span>
        <div>
          <div className="pt-section-title">
            <h2 id={headingId}>{title}</h2>
            {optional ? <small>{t("playtest.optional")}</small> : null}
          </div>
          <p>{description}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

/** A 0/1 counter with labelled − / + buttons (Kiln ability uses per round). */
export function UsageCounter({ label, path, value, max = 1, onChange }: { label: string; path: string; value: number; max?: number; onChange: (value: number) => void }) {
  const t = useT();
  return (
    <div className="pt-counter" role="group" aria-label={label} id={fieldId(path)}>
      <Button size="sm" aria-label={t("common.kit.stepperFewer", { item: label })} disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))}>
        <span aria-hidden="true">−</span>
      </Button>
      <output className="num" aria-live="polite">{num(value)}</output>
      <Button size="sm" aria-label={t("common.kit.stepperMore", { item: label })} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        <span aria-hidden="true">+</span>
      </Button>
    </div>
  );
}
