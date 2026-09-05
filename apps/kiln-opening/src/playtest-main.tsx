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
