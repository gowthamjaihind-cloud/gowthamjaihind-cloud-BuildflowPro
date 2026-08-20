import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/react-query';
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";
import { initSentry } from "./sentry";

// Start error tracking as early as possible (no-op until VITE_SENTRY_DSN is set).
initSentry();

// Apply initial theme settings from local storage
localStorage.removeItem("colorScheme");
document.documentElement.removeAttribute("data-theme");
const savedDarkMode = localStorage.getItem("darkMode");
if (savedDarkMode === "true") {
  document.documentElement.classList.add("dark");
}

if ("serviceWorker" in navigator) {
  // Auto-apply new versions. Previously onNeedRefresh only logged, so a new
  // build was downloaded but never activated — users kept running the old,
  // cached app until they manually cleared the cache. updateSW(true) activates
  // the waiting worker and reloads to the fresh version.
  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(swUrl, r) {
      r && setInterval(() => {
        r.update();
      }, 60 * 60 * 1000); // Check for updates every hour
    },
    onNeedRefresh() {
      updateSW(true);
    },
    onOfflineReady() {
      console.log("App ready to work offline");
    },
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
