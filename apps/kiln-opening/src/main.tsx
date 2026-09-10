import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { LanguageProvider } from "./ui/i18n";
import "./ui/styles.css";
import "./ui/playtest.css";

const TabletopMockPage = lazy(async () => {
  const module = await import("./ui/mock/TabletopMockPage");
  return { default: module.TabletopMockPage };
});

const root = document.getElementById("root");
if (root === null) throw new Error("Missing application root");
const showTabletopMock = new URLSearchParams(window.location.search).get("ui") === "mock";

createRoot(root).render(
  <StrictMode>
    <LanguageProvider>
      {showTabletopMock
        ? <Suspense fallback={<div aria-live="polite">Loading tabletop…</div>}><TabletopMockPage /></Suspense>
        : <App />}
    </LanguageProvider>
  </StrictMode>,
);
