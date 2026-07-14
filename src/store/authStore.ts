import { create } from "zustand";
import { UserProfile } from "../types";
import { auth, googleProvider, signInWithPopup } from "../firebase";

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  isLoggingIn: boolean;
  loginError: string | null;
  setUser: (user: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  login: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  isLoggingIn: false,
  loginError: null,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  login: async () => {
    if (get().isLoggingIn) return;
    set({ isLoggingIn: true, loginError: null });
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Login failed:", error);
      if (
        error?.code !== "auth/cancelled-popup-request" &&
        error?.code !== "auth/popup-closed-by-user"
      ) {
        let errorMsg = "Authentication failed. Please try again.";
        if (
          error?.code === "auth/popup-blocked" || 
          error?.code === "auth/web-storage-unsupported" || 
          error?.message?.includes("cross-origin")
        ) {
          errorMsg = "Login requires cross-site cookies which are restricted in this iframe. Please open the app in a new tab using the icon in the top right to log in.";
        } else {
          errorMsg = error.message || errorMsg;
        }
        set({ loginError: errorMsg });
      }
    } finally {
      set({ isLoggingIn: false });
    }
  },
  logout: () => auth.signOut(),
}));
