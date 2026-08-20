import React, { useEffect, useRef, useState } from "react";
import {
  Buildings,
  SignOut as LogOut,
  ArrowRight,
  CircleNotch as Loader2,
  WarningCircle as AlertCircle,
  CheckCircle,
  Check,
  Stack,
  Ticket,
} from "@phosphor-icons/react";
import { UserProfile } from "../types";
import { useAuthStore } from "../store";
import { callAcceptInvite, callCreateOrganization } from "../services/firebaseFunctions";
import { useRazorpayCheckout } from "../hooks/useRazorpayCheckout";
import { PLANS, PlanId } from "../lib/plans";

const PAID: PlanId[] = ["starter", "growth", "business"];

// Shown to a signed-in user who isn't in an org yet (or arrived via an
// ?invite=CODE link). Two paths: create your own organization (self-serve —
// Free instantly, or a paid plan by trial/payment), or redeem an invite code.
export const Onboarding: React.FC<{ user: UserProfile }> = ({ user }) => {
  const logout = useAuthStore((s) => s.logout);
  const urlCode = new URLSearchParams(window.location.search).get("invite") || "";
  const hasOrg = !!user.currentOrgId;

  const [mode, setMode] = useState<"create" | "invite">(urlCode ? "invite" : "create");
  const [joined, setJoined] = useState<string | null>(null);

  const reload = () => window.location.assign(window.location.pathname);

  // ---- Invite path ----
  const [code, setCode] = useState(urlCode.toUpperCase());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoTried = useRef(false);

  const accept = async (raw: string) => {
    const c = raw.trim().toUpperCase();
    if (!c) return;
    setBusy(true); setError(null);
    try {
      const res = await callAcceptInvite(c);
      try { window.history.replaceState({}, "", window.location.pathname); } catch { /* ignore */ }
      setJoined(res.orgName || "your organization");
    } catch (e: any) {
      setError(e?.message || "Couldn't join with that code.");
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (autoTried.current) return;
    autoTried.current = true;
    if (urlCode && !hasOrg) accept(urlCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Create path ----
  const [companyName, setCompanyName] = useState("");
  const [period, setPeriod] = useState<"monthly" | "annual">("monthly");
  const [creating, setCreating] = useState<string | null>(null); // which action is busy
  const [createError, setCreateError] = useState<string | null>(null);
  const { pay } = useRazorpayCheckout();

  const requireName = () => {
    if (!companyName.trim()) {
      setCreateError("Enter your company / workspace name first.");
      return false;
    }
    return true;
  };

  const startFree = async () => {
    if (!requireName()) return;
    setCreating("free"); setCreateError(null);
    try {
      await callCreateOrganization({ companyName: companyName.trim(), plan: "free" });
      reload();
    } catch (e: any) {
      setCreateError(e?.message || "Couldn't create your organization.");
      setCreating(null);
    }
  };

  const startTrial = async (plan: PlanId) => {
    if (!requireName()) return;
    setCreating(`trial:${plan}`); setCreateError(null);
    try {
      await callCreateOrganization({ companyName: companyName.trim(), plan, startTrial: true });
      reload();
    } catch (e: any) {
      setCreateError(e?.message || "Couldn't start your trial.");
      setCreating(null);
    }
  };

  const payNow = async (plan: PlanId) => {
    if (!requireName()) return;
    setCreating(`pay:${plan}`); setCreateError(null);
    try {
      // Create the org UNLINKED (no workspace access yet), then pay for it.
      // Access is granted only when the payment activates the plan — so closing
      // the payment window leaves the user right here, not inside the app.
      const res = await callCreateOrganization({ companyName: companyName.trim(), plan });
      await pay(plan, period, () => reload(), res.orgId);
      setCreating(null); // reached only if the modal was dismissed without paying
    } catch (e: any) {
      setCreateError(e?.message || "Couldn't start checkout.");
      setCreating(null);
    }
  };

  // ---- Success state ----
  if (joined) {
    return (
      <Card>
        <Badge success />
        <h2 className="text-2xl font-bold text-ink mb-2">You're in</h2>
        <p className="text-ink-muted mb-6">Joined <b>{joined}</b>. Loading your workspace…</p>
        <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
      </Card>
    );
  }

  // ---- Invite mode ----
  if (mode === "invite") {
    return (
      <Card>
        <Badge />
        {urlCode && hasOrg ? (
          <>
            <h2 className="text-2xl font-bold text-ink mb-2">Join a new organization?</h2>
            <p className="text-ink-muted mb-6 text-[15px] leading-relaxed">
              You're invited to a different organization, signed in as <b>{user.email}</b>. Joining will switch you to it.
            </p>
            {error && <ErrorBox>{error}</ErrorBox>}
            <PrimaryButton onClick={() => accept(code)} busy={busy}>Join organization</PrimaryButton>
            <button onClick={() => window.location.assign(window.location.pathname)} className="mt-3 text-sm text-ink-muted hover:text-ink">No thanks — go to my workspace</button>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-ink mb-2">Join your team</h2>
            <p className="text-ink-muted mb-6 text-[15px] leading-relaxed">
              Signed in as <b>{user.email}</b>. Enter the invite code your admin gave you.
            </p>
            {error && <ErrorBox>{error}</ErrorBox>}
            <input
              type="text" value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && accept(code)}
              placeholder="INVITE CODE"
              className="w-full bg-panel border border-divider px-4 py-3 rounded-xl text-center font-mono tracking-widest text-ink focus:outline-none focus:ring-2 focus:ring-primary/20 mb-4"
            />
            <PrimaryButton onClick={() => accept(code)} busy={busy} disabled={!code.trim()}>Join organization</PrimaryButton>
            {!hasOrg && (
              <button onClick={() => setMode("create")} className="mt-5 text-sm font-semibold text-primary hover:underline">
                Or create your own organization →
              </button>
            )}
          </>
        )}
        <SignOut onClick={logout} />
      </Card>
    );
  }

  // ---- Create mode ----
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-surface">
      <div className="w-full max-w-3xl soft-card p-8 md:p-10 squircle-24">
        <div className="text-center mb-6">
          <div className="bg-primary/10 w-14 h-14 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-primary/20">
            <Buildings className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-ink mb-1">Create your organization</h2>
          <p className="text-ink-muted text-[15px]">Signed in as <b>{user.email}</b>. Set up your workspace to get started.</p>
        </div>

        <label className="block text-sm font-semibold text-ink mb-1.5">Company / workspace name</label>
        <input
          type="text" value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="e.g. BV Realty"
          className="w-full bg-panel border border-divider px-4 py-3 rounded-xl text-ink focus:outline-none focus:ring-2 focus:ring-primary/20 mb-6"
        />

        {createError && <ErrorBox>{createError}</ErrorBox>}

        {/* Free */}
        <div className="rounded-2xl border border-divider p-5 mb-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black uppercase tracking-widest text-ink-muted">Free</span>
              <span className="font-display font-bold text-2xl">₹0</span>
              <span className="text-xs text-ink-muted">forever</span>
            </div>
            <p className="text-xs text-ink-muted mt-0.5">1 project · up to 2 users · Telegram logging</p>
          </div>
          <button
            onClick={startFree} disabled={!!creating}
            className="shrink-0 px-6 py-3 rounded-xl font-bold text-sm bg-panel border border-divider text-ink hover:bg-surface apple-transition disabled:opacity-50 flex items-center gap-2"
          >
            {creating === "free" ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Start free <ArrowRight weight="bold" className="w-4 h-4" /></>}
          </button>
        </div>

        {/* Period toggle */}
        <div className="flex items-center justify-center mb-4">
          <div className="inline-flex items-center bg-panel border border-divider rounded-full p-1">
            <button onClick={() => setPeriod("monthly")} className={`px-4 py-1.5 rounded-full text-xs font-bold apple-transition ${period === "monthly" ? "bg-surface-dark text-white shadow" : "text-ink-muted hover:text-ink"}`}>Monthly</button>
            <button onClick={() => setPeriod("annual")} className={`px-4 py-1.5 rounded-full text-xs font-bold apple-transition flex items-center gap-1.5 ${period === "annual" ? "bg-surface-dark text-white shadow" : "text-ink-muted hover:text-ink"}`}>
              Annual <span className="text-[9px] font-black uppercase px-1 py-0.5 rounded-full bg-success/15 text-[#2E8B6F]">-17%</span>
            </button>
          </div>
        </div>

        {/* Paid plans */}
        <div className="grid sm:grid-cols-3 gap-4">
          {PAID.map((id) => {
            const p = PLANS[id];
            const monthly = period === "annual" ? Math.round((p.annual || 0) / 12) : p.monthly || 0;
            const payLabel = period === "annual" ? p.annual : p.monthly;
            return (
              <div key={id} className={`rounded-2xl p-5 flex flex-col border ${id === "growth" ? "border-primary/40 ring-1 ring-primary/30" : "border-divider"}`}>
                <p className="text-sm font-black uppercase tracking-widest text-ink-muted mb-1">{p.name}</p>
                <div className="flex items-end gap-1 mb-0.5">
                  <span className="font-display font-bold text-3xl tracking-tight">₹{monthly.toLocaleString("en-IN")}</span>
                  <span className="text-xs text-ink-muted mb-1.5">/ mo</span>
                </div>
                <div className="inline-flex self-start items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full my-2 bg-sage/15 text-[#3E8388]">
                  <Stack weight="bold" className="w-3.5 h-3.5" /> Up to {p.includedProjects} projects
                </div>
                <ul className="space-y-1.5 mb-4 text-sm">
                  <li className="flex items-start gap-2"><Check weight="bold" className="w-4 h-4 mt-0.5 text-success shrink-0" /> {p.userLimit} users</li>
                  <li className="flex items-start gap-2"><Check weight="bold" className="w-4 h-4 mt-0.5 text-success shrink-0" /> {p.aiQuota} AI scans / mo</li>
                </ul>
                <button
                  onClick={() => payNow(id)} disabled={!!creating}
                  className={`mt-auto w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 apple-transition disabled:opacity-50 ${id === "growth" ? "bg-primary text-white hover:bg-[#B85F3B]" : "bg-panel border border-divider text-ink hover:bg-surface"}`}
                >
                  {creating === `pay:${id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : `Pay ₹${payLabel?.toLocaleString("en-IN")}`}
                </button>
                {id === "starter" && (
                  <button
                    onClick={() => startTrial(id)} disabled={!!creating}
                    className="mt-2 text-xs font-semibold text-ink-muted hover:text-ink disabled:opacity-50"
                  >
                    {creating === `trial:${id}` ? "Starting…" : "or start 14-day free trial"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-center text-[11px] text-ink-muted mt-5">
          New to Sitetru? Try Starter free for 14 days — no card, upgrade anytime. Prices exclusive of GST.
          Extra projects ₹99/mo each. Need Enterprise?{" "}
          <a href="mailto:gowtham.jaihind@gmail.com?subject=Enterprise%20plan" className="text-primary font-semibold hover:underline">Contact us</a>.
        </p>

        <div className="flex items-center justify-center gap-6 mt-6">
          <button onClick={() => setMode("invite")} className="text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1.5">
            <Ticket className="w-4 h-4" /> Have an invite code?
          </button>
          <SignOutInline onClick={logout} />
        </div>
      </div>
    </div>
  );
};

// ---- small shared bits ----
const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen flex items-center justify-center p-6 bg-surface">
    <div className="w-full max-w-md soft-card p-10 squircle-24 text-center">{children}</div>
  </div>
);
const Badge: React.FC<{ success?: boolean }> = ({ success }) => (
  <div className="bg-primary/10 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-primary/20">
    {success ? <CheckCircle weight="fill" className="w-8 h-8 text-success" /> : <Buildings className="w-8 h-8 text-primary" />}
  </div>
);
const ErrorBox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mb-4 p-3 bg-danger/8 text-danger rounded-xl border border-danger/20 flex items-start gap-2 text-sm text-left">
    <AlertCircle className="w-5 h-5 shrink-0" /><p>{children}</p>
  </div>
);
const PrimaryButton: React.FC<{ onClick: () => void; busy?: boolean; disabled?: boolean; children: React.ReactNode }> = ({ onClick, busy, disabled, children }) => (
  <button onClick={onClick} disabled={busy || disabled}
    className="w-full bg-primary text-white py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#B85F3B] transition-colors disabled:opacity-50">
    {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <>{children} <ArrowRight className="w-4 h-4" /></>}
  </button>
);
const SignOut: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button onClick={onClick} className="mt-6 text-sm text-ink-muted hover:text-ink inline-flex items-center gap-1.5">
    <LogOut className="w-4 h-4" /> Sign out
  </button>
);
const SignOutInline: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button onClick={onClick} className="text-sm text-ink-muted hover:text-ink inline-flex items-center gap-1.5">
    <LogOut className="w-4 h-4" /> Sign out
  </button>
);
