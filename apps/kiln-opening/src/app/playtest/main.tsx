// The stylesheet entry must be the first import (§7.2): it fixes the cascade-layer order.
import "../styles/index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { applyTheme } from "../theme.ts";
import { PlaytestFormPage } from "./PlaytestFormPage.tsx";

/**
 * The Playtest Form V3 entry (UI_V1.6.1_ARCHITECTURE §4.2): `next/playtest.html` during phase 4,
 * `playtest/index.html` after the cutover. Owner: B3 (kiln, firing stage, results, playtest).
 *
 * Created by A2 in phase A: the entry is complete (styles first, theme before the first render,
 * i18n); `PlaytestFormPage` is a stub until B3 lands it.
 */
applyTheme();

const container = document.getElementById("root");
if (container === null) throw new Error("The page has no #root element.");

createRoot(container).render(
  <StrictMode>
    <I18nProvider>
      <PlaytestFormPage />
    </I18nProvider>
  </StrictMode>,
);
