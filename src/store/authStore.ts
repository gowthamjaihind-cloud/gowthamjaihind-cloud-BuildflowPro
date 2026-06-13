import { create } from "zustand";
import { UserProfile } from "../types";
import { auth, googleProvider, signInWithPopup } from "../firebase";

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  isLoggingIn: boolean;
  setUser: (user: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  login: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  isLoggingIn: false,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  login: async () => {
    if (get().isLoggingIn) return;
    set({ isLoggingIn: true });
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Login failed:", error);
      if (
        error?.code !== "auth/cancelled-popup-request" &&
        error?.code !== "auth/popup-closed-by-user"
      ) {
        alert("Authentication failed. Please check your internet connection.");
      }
    } finally {
      set({ isLoggingIn: false });
    }
  },
  logout: () => auth.signOut(),
}));
