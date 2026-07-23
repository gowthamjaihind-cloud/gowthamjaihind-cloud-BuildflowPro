import { create } from "zustand";

interface UIState {
  activeTab: string;
  isCreatingProject: boolean;
  viewingSettings: boolean;
  darkMode: boolean;
  companyName: string;
  uiMode: "executive" | "site";
  setActiveTab: (tab: string) => void;
  setIsCreatingProject: (isCreating: boolean) => void;
  setViewingSettings: (viewing: boolean) => void;
  setDarkMode: (dark: boolean) => void;
  setCompanyName: (name: string) => void;
  setUIMode: (mode: "executive" | "site") => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTab: "dashboard",
  isCreatingProject: false,
  viewingSettings: false,
  companyName: localStorage.getItem("companyName") || "BuildFlow Pro",
  darkMode: localStorage.getItem("darkMode") === "true",
  uiMode: (localStorage.getItem("uiMode") as "executive" | "site") || "executive",
  setActiveTab: (tab) => set({ activeTab: tab }),
  setIsCreatingProject: (isCreatingProject) => set({ isCreatingProject }),
  setViewingSettings: (viewingSettings) => set({ viewingSettings }),
  setDarkMode: (darkMode) => {
    localStorage.setItem("darkMode", String(darkMode));
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    set({ darkMode });
  },
  setCompanyName: (companyName) => {
    localStorage.setItem("companyName", companyName);
    set({ companyName });
  },
  setUIMode: (uiMode) => {
    localStorage.setItem("uiMode", uiMode);
    if (uiMode === "site") {
      document.documentElement.classList.add("site-mode");
    } else {
      document.documentElement.classList.remove("site-mode");
    }
    set({ uiMode });
  },
}));
