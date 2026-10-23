/**
 * The SSR render harness (UI_V1.6.1_ARCHITECTURE §9.2). Created by A2; owned by B6 after phase A.
 *
 * `renderScreen`, `renderWindow` and `renderComponent` render with `renderToStaticMarkup` inside
 * the app's providers: `I18nProvider` (strict, so a missing key throws), `GameProvider` over a
 * `GameSource`, a seeded `UiStore`, a fixed layout mode and an optional seeded draft for the open
 * window. `harness()` returns the same providers for the happy-dom interaction tier.
 *
 * Dev tools are off unless asked for, so the rendered markup is what a player sees.
 */
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WINDOWS } from "../../../../src/app/decision/windows.ts";
import { DecisionPane } from "../../../../src/app/decision/DecisionPane.tsx";
import { I18nProvider } from "../../../../src/app/i18n/I18nProvider.tsx";
import type { Locale } from "../../../../src/app/i18n/translator.ts";
import { GameScreen } from "../../../../src/app/screens/GameScreen.tsx";
import type { GameSource } from "../../../../src/app/session/gameSource.ts";
import type { SessionActions } from "../../../../src/app/session/sessionStore.ts";
import { decisionWindow, windowDraftKey } from "../../../../src/app/state/decisionWindow.ts";
import { DraftStore } from "../../../../src/app/state/draftStore.ts";
import type { WindowRegistry } from "../../../../src/app/state/draftStore.ts";
import { GameProvider } from "../../../../src/app/state/hooks.ts";
import { fixedLayoutSource } from "../../../../src/app/state/layoutMode.ts";
import type { LayoutMode } from "../../../../src/app/state/layoutMode.ts";
import { UiStore } from "../../../../src/app/state/uiStore.ts";
import type { UiEffects, UiState } from "../../../../src/app/state/uiStore.ts";

export interface RenderOptions {
  locale?: Locale;
  /** UI state seeds (board shown, section, sheet, log, theme). */
  ui?: Partial<UiState>;
  /** A draft for the open window (seeded under its draft key). */
  draft?: unknown;
  layoutMode?: LayoutMode;
  /** Default: the app's registry. */
  registry?: WindowRegistry;
  session?: SessionActions | null;
  devTools?: boolean;
  /** Record UI side effects (scrolls, theme) instead of touching the DOM. */
  effects?: UiEffects;
}

export interface Harness {
  source: GameSource;
  drafts: DraftStore;
  ui: UiStore;
  locale: Locale;
  /** Wraps an element in every provider. */
  wrap(element: ReactNode): ReactElement;
}

/** The providers and stores for one source, with the seeds applied. */
export function harness(source: GameSource, options: RenderOptions = {}): Harness {
  const locale = options.locale ?? "en";
  const layout = fixedLayoutSource(options.layoutMode ?? "desktop");
  const drafts = new DraftStore();
  const ui = new UiStore({ layout, initial: options.ui ?? {}, ...(options.effects === undefined ? {} : { effects: options.effects }) });
  if (options.draft !== undefined) {
    const view = source.getServerSnapshot().view;
    if (view !== null) drafts.seed(windowDraftKey(decisionWindow(view)), options.draft);
  }
  const registry = options.registry ?? WINDOWS;
  const wrap = (element: ReactNode): ReactElement => (
    <I18nProvider locale={locale} strict>
      <GameProvider source={source} session={options.session ?? null} registry={registry} drafts={drafts} ui={ui} layout={layout} devTools={options.devTools ?? false}>
        {element}
      </GameProvider>
    </I18nProvider>
  );
  return { source, drafts, ui, locale, wrap };
}

/** The full `GameScreen` as static markup. */
export function renderScreen(source: GameSource, options: RenderOptions = {}): string {
  return renderToStaticMarkup(harness(source, options).wrap(<GameScreen />));
}

/** The decision pane alone. */
export function renderWindow(source: GameSource, options: RenderOptions = {}): string {
  return renderToStaticMarkup(harness(source, options).wrap(<DecisionPane />));
}

/** Any element inside the providers. */
export function renderComponent(source: GameSource, element: ReactNode, options: RenderOptions = {}): string {
  return renderToStaticMarkup(harness(source, options).wrap(element));
}
