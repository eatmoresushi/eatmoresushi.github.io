/**
 * Layout mode (UI_V1.6.1_ARCHITECTURE §3.3, §7.3, §8.1). Frozen after phase A; changes go
 * through B6.
 *
 * Markup is identical at every width: layout is CSS. The mode exists only for behaviour that
 * depends on the viewport (§8.1), which event handlers read through `useLayoutMode()`:
 * on phones a Place shortcut opens the sheet, a seat chip switches to the Workshop section, and
 * so on. SSR and tests use a fixed source, so server markup never depends on it.
 *
 * Breakpoints, matching the CSS:
 * - `phone-landscape`: `(orientation: landscape) and (max-height: 500px)` — short landscape is
 *   decided by height, not width (844×390, 915×412, 932×430);
 * - `phone`: `(max-width: 899px)`;
 * - `tablet`: `(max-width: 1199px)`;
 * - `desktop`: anything wider.
 */

export type LayoutMode = "desktop" | "tablet" | "phone" | "phone-landscape";

export const LAYOUT_MODES: readonly LayoutMode[] = ["desktop", "tablet", "phone", "phone-landscape"];

export const LAYOUT_QUERIES = {
  shortLandscape: "(orientation: landscape) and (max-height: 500px)",
  phone: "(max-width: 899px)",
  tablet: "(max-width: 1199px)",
} as const;

/** True for the two phone modes (the bottom sheet and the section bar exist). */
export function isPhone(mode: LayoutMode): boolean {
  return mode === "phone" || mode === "phone-landscape";
}

/** A subscribable source of the current mode (`useSyncExternalStore`). */
export interface LayoutSource {
  getSnapshot(): LayoutMode;
  getServerSnapshot(): LayoutMode;
  subscribe(listener: () => void): () => void;
}

/** A source that never changes: SSR, tests and the gallery's fixed viewports. */
export function fixedLayoutSource(mode: LayoutMode = "desktop"): LayoutSource {
  return {
    getSnapshot: () => mode,
    getServerSnapshot: () => mode,
    subscribe: () => () => undefined,
  };
}

/** The subset of `window` the media source needs. */
export interface MediaWindow {
  matchMedia(query: string): MediaQueryList;
}

/** The mode for three media-query results. Pure; exported for tests. */
export function layoutModeFrom(matches: { shortLandscape: boolean; phone: boolean; tablet: boolean }): LayoutMode {
  if (matches.shortLandscape) return "phone-landscape";
  if (matches.phone) return "phone";
  if (matches.tablet) return "tablet";
  return "desktop";
}

/**
 * The browser source: three `matchMedia` lists, re-read on change. The server snapshot is
 * `desktop`, so a hydrated page never mismatches; the client value applies after mount.
 */
export function mediaLayoutSource(target: MediaWindow): LayoutSource {
  const lists = {
    shortLandscape: target.matchMedia(LAYOUT_QUERIES.shortLandscape),
    phone: target.matchMedia(LAYOUT_QUERIES.phone),
    tablet: target.matchMedia(LAYOUT_QUERIES.tablet),
  };
  let current = read();
  function read(): LayoutMode {
    return layoutModeFrom({ shortLandscape: lists.shortLandscape.matches, phone: lists.phone.matches, tablet: lists.tablet.matches });
  }
  return {
    getSnapshot: () => current,
    getServerSnapshot: () => "desktop",
    subscribe(listener) {
      const onChange = (): void => {
        const next = read();
        if (next === current) return;
        current = next;
        listener();
      };
      for (const list of Object.values(lists)) list.addEventListener("change", onChange);
      current = read();
      return () => {
        for (const list of Object.values(lists)) list.removeEventListener("change", onChange);
      };
    },
  };
}

/** The browser source when `matchMedia` exists, else a fixed `desktop` source. */
export function browserLayoutSource(): LayoutSource {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return fixedLayoutSource("desktop");
  return mediaLayoutSource(window);
}
