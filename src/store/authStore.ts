import { create } from "zustand";
import { UserProfile } from "../types";
import {
  auth,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  setDoc,
  doc,
} from "../firebase";
import { db } from "../firebase";

// Map Firebase auth error codes to friendly, actionable messages.
function friendlyAuthError(error: any): string {
  const code = error?.code || "";
  switch (code) {
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/email-already-in-use":
      return "An account with this email already exists — try signing in instead.";
    case "auth/weak-password":
      return "Please choose a password of at least 6 characters.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/popup-blocked":
    case "auth/web-storage-unsupported":
      return "Login requires cross-site cookies which are restricted in this iframe. Please open the app in a new tab using the icon in the top right to log in.";
    case "auth/operation-not-allowed":
      return "Email sign-in isn't enabled yet. Please try Google, or contact support.";
    default:
      return error?.message || "Authentication failed. Please try again.";
  }
}

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  isLoggingIn: boolean;
  loginError: string | null;
  setUser: (user: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setLoginError: (msg: string | null) => void;
  login: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name?: string) => Promise<void>;
  resetPassword: (email: string) => Promise<boolean>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  isLoggingIn: false,
  loginError: null,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  setLoginError: (msg) => set({ loginError: msg }),
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
        set({ loginError: friendlyAuthError(error) });
      }
    } finally {
      set({ isLoggingIn: false });
    }
  },
  loginWithEmail: async (email, password) => {
    if (get().isLoggingIn) return;
    set({ isLoggingIn: true, loginError: null });
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error: any) {
      console.error("Email login failed:", error);
      set({ loginError: friendlyAuthError(error) });
    } finally {
      set({ isLoggingIn: false });
    }
  },
  signUpWithEmail: async (email, password, name) => {
    if (get().isLoggingIn) return;
    set({ isLoggingIn: true, loginError: null });
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const displayName = (name || "").trim();
      if (displayName) {
        // Set the auth display name, and mirror it onto the profile doc so it
        // survives the first-sign-in profile write in useAuth.
        try {
          await updateProfile(cred.user, { displayName });
          await setDoc(doc(db, "users", cred.user.uid), { displayName }, { merge: true });
        } catch {
          /* non-fatal — the name can be edited later in Settings */
        }
      }
    } catch (error: any) {
      console.error("Email sign-up failed:", error);
      set({ loginError: friendlyAuthError(error) });
    } finally {
      set({ isLoggingIn: false });
    }
  },
  resetPassword: async (email) => {
    set({ loginError: null });
    try {
      await sendPasswordResetEmail(auth, email.trim());
      return true;
    } catch (error: any) {
      console.error("Password reset failed:", error);
      set({ loginError: friendlyAuthError(error) });
      return false;
    }
  },
  logout: () => auth.signOut(),
}));
