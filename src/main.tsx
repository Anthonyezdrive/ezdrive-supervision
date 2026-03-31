import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initSentry } from "./lib/sentry";
import "./lib/i18n";
import "./index.css";
import App from "./App";

// Initialize Sentry before rendering (requires VITE_SENTRY_DSN env var)
initSentry();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
