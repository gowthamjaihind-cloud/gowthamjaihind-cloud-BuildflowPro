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

// Shown to a signed-in user who is either (a) not part of any org yet, or
// (b) arriving via an ?invite=CODE link. New orgs are provisioned/invite-only,
// so the only self-serve path is to redeem an invite. On success the account's
// currentOrgId is set server-side and the auth listener re-renders into the app.
export const Onboarding: React.FC<{ user: UserProfile }> = ({ user }) => {
  const logout = useAuthStore((s) => s.logout);
  const urlCode = new URLSearchParams(window.location.search).get("invite") || "";
  const hasOrg = !!user.currentOrgId; // already in an org → joining will switch them

  const [code, setCode] = useState(urlCode.toUpperCase());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);
  const autoTried = useRef(false);

  const stripInviteParam = () => {
    try {
      window.history.replaceState({}, "", window.location.pathname);
    } catch { /* ignore */ }
  };

  const accept = async (raw: string) => {
    const c = raw.trim().toUpperCase();
    if (!c) return;
    setBusy(true);
    setError(null);
    try {
      const res = await callAcceptInvite(c);
      stripInviteParam();
      setJoined(res.orgName || "your organization");
      // The auth listener picks up the new currentOrgId and swaps this screen
      // for the app shortly; the success state covers that brief window.
    } catch (e: any) {
      setError(e?.message || "Couldn't join with that code.");
    } finally {
      setBusy(false);
    }
  };

  // Auto-redeem an ?invite=CODE link once — but only for users with NO org yet.
  // A user who already belongs to an org must confirm (joining switches them),
  // so we don't silently move someone who clicked a shared link.
  useEffect(() => {
    if (autoTried.current) return;
    autoTried.current = true;
    if (urlCode && !hasOrg) accept(urlCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToMyWorkspace = () => {
    // Drop the invite param and reload into their existing org.
    window.location.replace(window.location.pathname);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-surface">
      <div className="w-full max-w-md soft-card p-10 squircle-24 text-center">
        <div className="bg-primary/10 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-primary/20">
          {joined ? (
            <CheckCircle weight="fill" className="w-8 h-8 text-success" />
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
        ) : urlCode && hasOrg ? (
          // Signed-in user with an existing org clicked an invite link.
          <>
            <h2 className="text-2xl font-bold text-ink mb-2">Join a new organization?</h2>
            <p className="text-ink-muted mb-6 text-[15px] leading-relaxed">
              You're invited to join a different organization. You're signed in as{" "}
              <b>{user.email}</b>. Joining will switch you to the new organization.
            </p>
            {error && (
              <div className="mb-4 p-3 bg-danger/8 text-danger rounded-xl border border-danger/20 flex items-start gap-2 text-sm text-left">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>{error}</p>
              </div>
            )}
            <button
              onClick={() => accept(code)}
              disabled={busy}
              className="w-full bg-primary text-white py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#B85F3B] transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Join organization <ArrowRight className="w-4 h-4" /></>}
            </button>
            <button onClick={goToMyWorkspace} className="mt-3 text-sm text-ink-muted hover:text-ink">
              No thanks — go to my workspace
            </button>
          </>
        ) : (
          // No org yet: enter/confirm an invite code.
          <>
            <h2 className="text-2xl font-bold text-ink mb-2">Join your team</h2>
            <p className="text-ink-muted mb-6 text-[15px] leading-relaxed">
              You're signed in as <b>{user.email}</b>, but your account isn't part of an
              organization yet. Enter the invite code your admin gave you.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-danger/8 text-danger rounded-xl border border-danger/20 flex items-start gap-2 text-sm text-left">
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
