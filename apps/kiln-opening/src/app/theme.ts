/**
 * The colour theme (UI_V1.6.1_ARCHITECTURE §7.1). `applyTheme()` runs in every entry before the
 * first render (`main.tsx`, `playtest/main.tsx`, `dev/gallery-main.tsx`), so `data-theme` is
 * always set on `<html>`: `light-dark()` is not used (it breaks every colour before Safari 17.5).
 *
 * - The choice is stored under `kiln-opening:theme` as `light`, `dark` or `system`.
 * - `system` follows `matchMedia("(prefers-color-scheme: dark)")` and keeps following it.
 * - Every storage call is wrapped in `try`/`catch` (§3.2).
 *
 * The control is `kit/ThemeToggle.tsx` in the top bar's SessionMenu (B1); the choice itself
 * lives in `state/uiStore.ts`, which calls `applyTheme` when it changes.
 */

import type { ThemeChoice } from "./kit/ThemeToggle.tsx";

export type { ThemeChoice } from "./kit/ThemeToggle.tsx";

export const THEME_STORAGE_KEY = "kiln-opening:theme";
export const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

export type ResolvedTheme = "light" | "dark";

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The stored choice, or `system`. */
export function readStoredTheme(): ThemeChoice {
  try {
    const value = browserStorage()?.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(value) ? value : "system";
  } catch {
    return "system";
  }
}

export function storeTheme(choice: ThemeChoice): void {
  try {
    browserStorage()?.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage may be blocked; the choice still applies to this page.
  }
}

/** `light` or `dark` for a choice; `system` asks the media query (light without one). */
export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): ResolvedTheme {
  if (choice === "system") return prefersDark ? "dark" : "light";
  return choice;
}

function darkQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  try {
    return window.matchMedia(DARK_SCHEME_QUERY);
  } catch {
    return null;
  }
}

let stopFollowing: (() => void) | null = null;

/**
 * Sets `data-theme` on `<html>` for `choice` (default: the stored choice). For `system` it
 * keeps following the OS scheme until the next call. Returns the theme applied. A no-op
 * returning `light` without a document (SSR, node tests).
 */
export function applyTheme(choice: ThemeChoice = readStoredTheme()): ResolvedTheme {
  stopFollowing?.();
  stopFollowing = null;
  if (typeof document === "undefined") return resolveTheme(choice, false);
  const root = document.documentElement;
  const query = darkQuery();
  const resolved = resolveTheme(choice, query?.matches ?? false);
  root.dataset["theme"] = resolved;
  if (choice === "system" && query !== null) {
    const onChange = (event: MediaQueryListEvent): void => {
      root.dataset["theme"] = event.matches ? "dark" : "light";
    };
    query.addEventListener("change", onChange);
    stopFollowing = () => query.removeEventListener("change", onChange);
  }
  return resolved;
}
