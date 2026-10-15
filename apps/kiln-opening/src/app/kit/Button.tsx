/**
 * Button (kit, UI_V1.6.1_ARCHITECTURE §4.2, §8.1; wireframe `.btn`). Frozen after phase A.
 *
 * - `disabled` renders `aria-disabled="true"`, never the native attribute: the button stays
 *   focusable (its reason can be read through `aria-describedby`) and its activation is ignored,
 *   including the implicit form submission of a `type="submit"` button.
 * - `busy` renders `aria-busy="true"` and ignores activation too; ConfirmBar keeps focus on the
 *   button while a command is sending (§3.6, §8.2).
 * - `pressed` makes it a toggle (`aria-pressed`).
 * - `action` is the test-driver hook (`data-action="confirm" | "alt"`, §9.6).
 * - `type` defaults to `"button"`, so a button inside a form never submits by accident.
 */
import type { ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from "react";
import "./Button.css";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "md" | "sm";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled" | "type" | "aria-pressed" | "aria-busy" | "aria-disabled"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  type?: "button" | "submit" | "reset";
  /** Unavailable: `aria-disabled`, focusable, activation ignored. */
  disabled?: boolean;
  /** Sending: `aria-busy`, activation ignored. */
  busy?: boolean;
  /** Toggle state (`aria-pressed`). Omit for a plain button. */
  pressed?: boolean;
  /** Test-driver hook: the form's main or alternative action (§9.6). */
  action?: "confirm" | "alt";
  /** Leading decoration (icon, piece); hidden from assistive technology. */
  icon?: ReactNode;
  /** Grow to fill the row (ConfirmBar's primary button). */
  block?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = "secondary",
  size = "md",
  type = "button",
  disabled = false,
  busy = false,
  pressed,
  action,
  icon,
  block = false,
  className,
  onClick,
  children,
  ref,
  ...rest
}: ButtonProps) {
  const inert = disabled || busy;
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (inert) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  const classes = ["kit-btn", `kit-btn--${variant}`, `kit-btn--${size}`, block ? "kit-btn--block" : "", className ?? ""]
    .filter((part) => part !== "")
    .join(" ");
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={classes}
      aria-disabled={disabled ? true : undefined}
      aria-busy={busy ? true : undefined}
      aria-pressed={pressed === undefined ? undefined : pressed}
      data-action={action}
      onClick={handleClick}
    >
      {icon === undefined ? null : <span className="kit-btn-icon" aria-hidden="true">{icon}</span>}
      {children}
    </button>
  );
}
