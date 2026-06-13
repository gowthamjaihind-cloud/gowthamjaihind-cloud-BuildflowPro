import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/react-query';
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

// Apply initial theme settings from local storage
const savedTheme = localStorage.getItem("colorScheme");
if (savedTheme && savedTheme !== "default") {
  document.documentElement.setAttribute("data-theme", savedTheme);
}
const savedDarkMode = localStorage.getItem("darkMode");
if (savedDarkMode === "true") {
  document.documentElement.classList.add("dark");
}

if ("serviceWorker" in navigator) {
  registerSW({
    immediate: true,
    onRegisteredSW(swUrl, r) {
      r && setInterval(() => {
        r.update();
      }, 60 * 60 * 1000); // Check for updates every hour
    },
    onNeedRefresh() {
      console.log("New content available, please refresh.");
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
