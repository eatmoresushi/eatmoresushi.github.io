// V1.4 playtest entry. Since the cutover (UI plan §10.4 C2.1) no page loads it:
// `playtest/index.html` loads the V1.6.2 form in `src/app/playtest`. It stays in the tree only
// until the deletion commit (C2.2).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PlaytestFormPage } from "./ui/PlaytestFormPage.tsx";
import "./ui/styles.css";
import "./ui/playtest-form.css";

const root = document.getElementById("root");
if (root === null) throw new Error("Missing application root");

createRoot(root).render(
  <StrictMode>
    <PlaytestFormPage />
  </StrictMode>,
);
