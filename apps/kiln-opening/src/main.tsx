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
