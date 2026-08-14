import React, { useEffect, useRef, useState } from "react";
import {
  Buildings,
  SignOut as LogOut,
  ArrowRight,
  CircleNotch as Loader2,
  WarningCircle as AlertCircle,
  CheckCircle,
} from "@phosphor-icons/react";
import { UserProfile } from "../types";
import { useAuthStore } from "../store";
import { callAcceptInvite } from "../services/firebaseFunctions";

// Shown to a signed-in user who isn't part of any organization yet.
// New orgs are provisioned/invite-only, so the only self-serve path here is to
// redeem an invite code (or an ?invite=CODE link). On success the account's
// currentOrgId is set server-side and the auth listener re-renders into the app.
export const Onboarding: React.FC<{ user: UserProfile }> = ({ user }) => {
  const logout = useAuthStore((s) => s.logout);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);
  const autoTried = useRef(false);

  const accept = async (raw: string) => {
    const c = raw.trim().toUpperCase();
    if (!c) return;
    setBusy(true);
    setError(null);
    try {
      const res = await callAcceptInvite(c);
      setJoined(res.orgName || "your organization");
      // The auth listener will pick up currentOrgId and swap this screen for the
      // app shortly; the success state covers that brief window.
    } catch (e: any) {
      setError(e?.message || "Couldn't join with that code.");
    } finally {
      setBusy(false);
    }
  };

  // Auto-redeem an ?invite=CODE link once.
  useEffect(() => {
    if (autoTried.current) return;
    autoTried.current = true;
    const params = new URLSearchParams(window.location.search);
    const invite = params.get("invite");
    if (invite) {
      setCode(invite.toUpperCase());
      accept(invite);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-surface">
      <div className="w-full max-w-md soft-card p-10 squircle-24 text-center">
        <div className="bg-primary/10 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-primary/20">
          {joined ? (
            <CheckCircle weight="fill" className="w-8 h-8 text-[#059669]" />
          ) : (
            <Buildings className="w-8 h-8 text-primary" />
          )}
        </div>

        {joined ? (
          <>
            <h2 className="text-2xl font-bold text-ink mb-2">You're in</h2>
            <p className="text-ink-muted mb-6">
              Joined <b>{joined}</b>. Loading your workspace…
            </p>
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-ink mb-2">Join your team</h2>
            <p className="text-ink-muted mb-6 text-[15px] leading-relaxed">
              You're signed in as <b>{user.email}</b>, but your account isn't part of an
              organization yet. Enter the invite code your admin gave you.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-[#EF4444]/8 text-[#B91C1C] rounded-xl border border-[#EF4444]/20 flex items-start gap-2 text-sm text-left">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && accept(code)}
              placeholder="INVITE CODE"
              className="w-full bg-panel border border-divider px-4 py-3 rounded-xl text-center font-mono tracking-widest text-ink focus:outline-none focus:ring-2 focus:ring-primary/20 mb-4"
            />
            <button
              onClick={() => accept(code)}
              disabled={busy || !code.trim()}
              className="w-full bg-primary text-white py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#B85F3B] transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Join organization <ArrowRight className="w-4 h-4" /></>}
            </button>

            <p className="text-xs text-ink-muted mt-6">
              Don't have a code? Ask your organization's admin to invite you.
            </p>
          </>
        )}

        <button
          onClick={logout}
          className="mt-6 text-sm text-ink-muted hover:text-ink inline-flex items-center gap-1.5"
        >
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>
    </div>
  );
};
