import React, { useState } from "react";
import {
  Lock,
  SignOut as LogOut,
  EnvelopeSimple,
  Check,
  CircleNotch as Loader2,
  Stack,
} from "@phosphor-icons/react";
import { UserProfile } from "../types";
import { OrgAccess } from "../hooks/useOrgAccess";
import { useAuthStore } from "../store";
import { useRazorpayCheckout } from "../hooks/useRazorpayCheckout";
import { PLANS, PlanId } from "../lib/plans";
import { useTranslation } from "../i18n";

const SALES_EMAIL = "gowtham.jaihind@gmail.com";
const PAID: PlanId[] = ["starter", "growth", "business"];

// Shown when the org's trial has ended (or its subscription lapsed). Owners/
// Admins get a plan picker with Razorpay checkout (payment auto-activates the
// plan); other members are told to contact their owner. If payments aren't
// configured yet, checkout surfaces that and the contact-us fallback remains.
export const Paywall: React.FC<{ access: OrgAccess; user: UserProfile }> = ({ access, user }) => {
  const { t } = useTranslation();
  const logout = useAuthStore((s) => s.logout);
  const isOwnerish = user.role === "Owner" || user.role === "Admin";
  const org = access.companyName || "your organization";
  const [period, setPeriod] = useState<"monthly" | "annual">("monthly");
  const { pay, busy, error } = useRazorpayCheckout();

  const headline =
    access.reason === "trial_expired" ? t("paywall.trialEnded") : t("paywall.subNeeded");

  if (!isOwnerish) {
    return (
      <Shell>
        <h2 className="text-2xl font-bold text-ink mb-2">{headline}</h2>
        <p className="text-ink-muted mb-6 text-[15px] leading-relaxed">
          {t("paywall.accessPausedPre")} <b>{org}</b> {t("paywall.accessPausedPost")}
        </p>
        <p className="text-[12px] text-ink-muted mb-2">{t("paywall.wrongAccount")}</p>
        <SignOutButton onClick={logout} />
      </Shell>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-surface">
      <div className="w-full max-w-3xl soft-card p-8 md:p-10 squircle-24">
        <div className="text-center mb-6">
          <div className="bg-primary/10 w-14 h-14 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-primary/20">
            <Lock className="w-7 h-7 text-[#B85F3B]" />
          </div>
          <h2 className="text-2xl font-bold text-ink mb-1">{headline}</h2>
          <p className="text-ink-muted text-[15px]">{t("paywall.choosePlanPre")} <b>{org}</b> {t("paywall.choosePlanPost")}</p>
        </div>

        {/* Monthly / annual toggle */}
        <div className="flex items-center justify-center mb-6">
          <div className="inline-flex items-center bg-panel border border-divider rounded-full p-1">
            <button
              onClick={() => setPeriod("monthly")}
              className={`px-4 py-1.5 rounded-full text-sm font-bold apple-transition ${period === "monthly" ? "bg-surface-dark text-white shadow" : "text-ink-muted hover:text-ink"}`}
            >
              {t("paywall.monthly")}
            </button>
            <button
              onClick={() => setPeriod("annual")}
              className={`px-4 py-1.5 rounded-full text-sm font-bold apple-transition flex items-center gap-2 ${period === "annual" ? "bg-surface-dark text-white shadow" : "text-ink-muted hover:text-ink"}`}
            >
              {t("paywall.annual")}
              <span className="text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-success/15 text-[#2E8B6F]">{t("paywall.savePct")}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-danger/8 text-danger rounded-xl border border-danger/20 text-sm text-center">
            {error}
          </div>
        )}

        <div className="grid sm:grid-cols-3 gap-4">
          {PAID.map((id) => {
            const p = PLANS[id];
            const monthly = period === "annual" ? Math.round((p.annual || 0) / 12) : p.monthly || 0;
            return (
              <div key={id} className={`rounded-2xl p-5 flex flex-col border ${id === "growth" ? "border-primary/40 ring-1 ring-primary/30" : "border-divider"}`}>
                <p className="text-sm font-black uppercase tracking-widest text-ink-muted mb-1">{p.name}</p>
                <div className="flex items-end gap-1 mb-0.5">
                  <span className="font-display font-bold text-3xl tracking-tight">₹{monthly.toLocaleString("en-IN")}</span>
                  <span className="text-xs text-ink-muted mb-1.5">{t("paywall.perMo")}</span>
                </div>
                <p className="text-[11px] text-ink-muted mb-3 h-4">
                  {period === "annual" ? t("paywall.billedYearly", { amount: (p.annual || 0).toLocaleString("en-IN") }) : ""}
                </p>
                <div className="inline-flex self-start items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full mb-3 bg-sage/15 text-[#3E8388]">
                  <Stack weight="bold" className="w-3.5 h-3.5" /> {t("paywall.upToProjects", { n: p.includedProjects })}
                </div>
                <ul className="space-y-1.5 mb-4 text-sm">
                  <li className="flex items-start gap-2"><Check weight="bold" className="w-4 h-4 mt-0.5 text-success shrink-0" /> {t("paywall.users", { n: p.userLimit })}</li>
                  <li className="flex items-start gap-2"><Check weight="bold" className="w-4 h-4 mt-0.5 text-success shrink-0" /> {t("paywall.aiScans", { n: p.aiQuota })}</li>
                </ul>
                <button
                  onClick={() => pay(id, period, () => window.location.reload())}
                  disabled={busy}
                  className={`mt-auto w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 apple-transition disabled:opacity-50 ${id === "growth" ? "bg-primary text-white hover:bg-[#B85F3B]" : "bg-panel border border-divider text-ink hover:bg-surface"}`}
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("paywall.pay", { amount: (period === "annual" ? p.annual : p.monthly)?.toLocaleString("en-IN") || "" })}
                </button>
              </div>
            );
          })}
        </div>

        <p className="text-center text-[11px] text-ink-muted mt-4">
          {t("paywall.extraNote")}{" "}
          <a href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent(`Plan for ${org}`)}`} className="text-primary font-semibold hover:underline">{t("paywall.contactUs")}</a>.
        </p>

        <div className="text-center mt-6 pt-5 border-t border-divider/60">
          <p className="text-[12px] text-ink-muted mb-2">{t("paywall.wrongAccountTrial")}</p>
          <SignOutButton onClick={logout} />
        </div>
      </div>
    </div>
  );
};

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen flex items-center justify-center p-6 bg-surface">
    <div className="w-full max-w-md soft-card p-10 squircle-24 text-center">{children}</div>
  </div>
);

const SignOutButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const { t } = useTranslation();
  return (
    <button onClick={onClick} className="text-sm text-ink-muted hover:text-ink inline-flex items-center gap-1.5">
      <LogOut className="w-4 h-4" /> {t("paywall.signOut")}
    </button>
  );
};

// Slim countdown shown while an org is on trial.
export const TrialBanner: React.FC<{ daysLeft: number }> = ({ daysLeft }) => {
  const { t } = useTranslation();
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-full bg-onyx text-white text-xs font-bold shadow-lg flex items-center gap-2">
      <Lock className="w-3.5 h-3.5" />
      {daysLeft > 1
        ? t("paywall.daysLeft", { n: daysLeft })
        : daysLeft === 1
          ? t("paywall.oneDayLeft")
          : t("paywall.trialEndsToday")}
    </div>
  );
};

export default Paywall;
