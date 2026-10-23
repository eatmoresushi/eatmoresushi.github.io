// V1.4 entry. Since the cutover (UI plan §10.4 C2.1) no page loads it: `index.html` loads the
// V1.6.2 app in `src/app`. It stays in the tree only until the deletion commit (C2.2).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { LanguageProvider } from "./ui/i18n";
import "./ui/styles.css";
import "./ui/playtest.css";

const root = document.getElementById("root");
if (root === null) throw new Error("Missing application root");

createRoot(root).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
);
