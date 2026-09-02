import React, { useState, useEffect, Component } from "react";
import { demoRequested } from "./demo";
import { Feedback } from "./components/feedback/Feedback";
import { DemoBanner } from "./demo/DemoBanner";
import { DemoTour } from "./demo/DemoTour";
import {
  auth,
  db,
  googleProvider,
  signInWithPopup,
  collection,
  onSnapshot,
  query,
  where,
  addDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  writeBatch,
  handleFirestoreError,
  OperationType,
} from "./firebase";
import {
  UserProfile,
  Project,
  Task,
  DependencyType,
  TaskDependency,
} from "./types";
import { Layout } from "./components/Layout";
import { SettingsView } from "./components/SettingsView";
import { EnterpriseAuthView } from "./components/EnterpriseAuthView";
import {
  Barricade as Construction,
  Plus,
  ArrowRight,
  CircleNotch as Loader2,
  ShieldCheck,
  WarningCircle as AlertCircle,
  ArrowsClockwise as RefreshCw,
  Trash as Trash2,
  GearSix as Settings,
  Info,
  X,
  SignOut as LogOut,
  Image as ImageIcon,
  IconContext,
} from "@phosphor-icons/react";
import { motion, AnimatePresence, MotionConfig } from "motion/react";

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/react-query';
import { useAuthInit } from "./hooks/useAuth";
import { useProjectsQuery } from "./hooks/queries";
import { useAuthStore, useProjectStore, useUIStore } from "./store";
import { captureError, setSentryUser } from "./sentry";

import { LandingPage } from "./pages/LandingPage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { ProjectDashboard } from "./pages/ProjectDashboard";
import { Onboarding } from "./components/Onboarding";
import { Paywall, TrialBanner } from "./components/Paywall";
import { useOrgAccess } from "./hooks/useOrgAccess";

export const AuthContext = React.createContext<{ user: UserProfile | null }>({
  user: null,
});

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  props: ErrorBoundaryProps;
  state: ErrorBoundaryState = { hasError: false, error: null };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    captureError(error, { componentStack: errorInfo?.componentStack });
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "An unexpected error occurred.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        errorMessage = `Firestore Error: ${parsed.error} during ${parsed.operationType} on ${parsed.path}`;
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="h-screen flex items-center justify-center p-6">
          <div className="max-w-md w-full soft-card p-12 squircle-24 text-center">
            <div className="bg-danger/10 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-danger/20">
              <AlertCircle className="w-10 h-10 text-danger" />
            </div>
            <h2 className="text-[24px] font-bold text-ink mb-3">
              Something went wrong
            </h2>
            <p className="text-[15px] text-ink-muted mb-10 leading-relaxed">
              {errorMessage}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-onyx text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-onyx/80 apple-transition shadow-xl"
            >
              <RefreshCw className="w-5 h-5" /> Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <IconContext.Provider value={{ weight: "duotone" }}>
          <ErrorBoundary>
            <AppContent />
          </ErrorBoundary>
        </IconContext.Provider>
      </MotionConfig>
    </QueryClientProvider>
  );
}

function AppContent() {
  // Initialize stores globally
  useAuthInit();

  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);
  const isLoggingIn = useAuthStore((state) => state.isLoggingIn);
  const loginError = useAuthStore((state) => state.loginError);
  const login = useAuthStore((state) => state.login);

  // Tag Sentry errors with the signed-in account (no-op until a DSN is set).
  useEffect(() => {
    setSentryUser(user ? { uid: user.uid, email: user.email } : null);
  }, [user]);

  const { data: projects = [] } = useProjectsQuery();
  const activeProject = useProjectStore((state) => state.activeProject);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);

  const viewingSettings = useUIStore((state) => state.viewingSettings);
  const setViewingSettings = useUIStore((state) => state.setViewingSettings);

  const access = useOrgAccess();

  const visibleProjects = projects.filter((p) => {
    if (user?.role === "Admin" || user?.role === "Owner") return true;
    const access = user?.projectAccess?.[p.id];
    if (access === "none") return false;
    if (access === "read" || access === "write") return true;
    if (p.ownerId === user?.uid) return true;
    return false;
  });

  useEffect(() => {
    // If activeProject is no longer visible, reset it
    if (
      activeProject &&
      !visibleProjects.find((p) => p.id === activeProject.id)
    ) {
      setActiveProject(null);
    }
  }, [visibleProjects, activeProject, setActiveProject]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface-dark text-white">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <LandingPage isLoggingIn={isLoggingIn} onLogin={login} loginError={loginError} />;
  }

  // Multi-tenant gate: a signed-in user must belong to an organization. New
  // orgs are provisioned/invite-only, so anyone without one lands on the
  // invite-code screen until they join (or an admin provisions their org).
  // Also handle an ?invite=CODE link for users who ALREADY have an org (so an
  // invite link works regardless of whether the recipient is new) — Onboarding
  // asks them to confirm switching.
  const hasInviteParam = new URLSearchParams(window.location.search).has("invite");
  if (!user.currentOrgId || hasInviteParam) {
    return <Onboarding user={user} />;
  }

  // Billing gate: block the app once the trial has ended (or a subscription
  // lapsed). Grandfathered orgs (no subscriptionStatus) are always allowed.
  if (!access.loading && !access.allowed) {
    return <Paywall access={access} user={user} />;
  }

  let page: React.ReactNode;
  if (!activeProject) {
    page = viewingSettings ? (
      <SettingsView onBack={() => setViewingSettings(false)} currentUser={user} />
    ) : (
      <PortfolioPage
        user={user}
        visibleProjects={visibleProjects}
        onProjectSelect={setActiveProject}
        onSettingsClick={() => setViewingSettings(true)}
      />
    );
  } else {
    page = (
      <ProjectDashboard
        user={user}
        activeProject={activeProject}
        onUpdateProject={(p) => setActiveProject(p)}
        onBack={() => setActiveProject(null)}
      />
    );
  }

  return (
    <>
      {page}
      {access.isTrial && access.allowed && <TrialBanner daysLeft={access.daysLeft} />}
      {/* Folds away entirely in the production bundle. */}
      <Feedback />
      {__DEMO__ && demoRequested() && <DemoBanner />}
      {__DEMO__ && demoRequested() && <DemoTour />}
    </>
  );
}
