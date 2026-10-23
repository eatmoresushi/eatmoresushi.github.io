// The stylesheet entry must be the first import (§7.2): it fixes the cascade-layer order.
import "./styles/index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { ImmediateTimeline, presentWith } from "./motion/timeline.ts";
import { createBrowserSessionStore } from "./session/sessionStore.ts";
import { applyTheme } from "./theme.ts";

/**
 * The V1.6.1 app entry (UI_V1.6.1_ARCHITECTURE §1.2, §4.2): `next/index.html` during phase 4,
 * `index.html` after the cutover. The theme is applied before the first render (§7.1); the
 * session store talks to Supabase, or to the local backend at `/test-api-v161` when
 * `VITE_E2E_LOCAL_BACKEND=1` (`npm run dev:local`).
 */
applyTheme();

const store = createBrowserSessionStore({ present: presentWith(new ImmediateTimeline()) });
const container = document.getElementById("root");
if (container === null) throw new Error("The page has no #root element.");

createRoot(container).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);
