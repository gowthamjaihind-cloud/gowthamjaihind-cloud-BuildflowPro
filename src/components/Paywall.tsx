import React from "react";
import {
  Lock,
  SignOut as LogOut,
  EnvelopeSimple,
} from "@phosphor-icons/react";
import { UserProfile } from "../types";
import { OrgAccess } from "../hooks/useOrgAccess";
import { useAuthStore } from "../store";

const SALES_EMAIL = "gowtham.jaihind@gmail.com";

// Shown when the org's trial has ended (or its subscription lapsed). Owners/
// Admins get a subscribe CTA; other members are told to contact their owner.
// Payment is currently manual — the CTA emails the operator, who activates the
// org. (Automated checkout replaces this later.)
export const Paywall: React.FC<{ access: OrgAccess; user: UserProfile }> = ({ access, user }) => {
  const logout = useAuthStore((s) => s.logout);
  const isOwnerish = user.role === "Owner" || user.role === "Admin";
  const org = access.companyName || "your organization";

  const headline =
    access.reason === "trial_expired" ? "Your free trial has ended" : "Subscription needed";

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-surface">
      <div className="w-full max-w-md soft-card p-10 squircle-24 text-center">
        <div className="bg-primary/10 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-primary/20">
          <Lock className="w-8 h-8 text-[#B85F3B]" />
        </div>
        <h2 className="text-2xl font-bold text-ink mb-2">{headline}</h2>

        {isOwnerish ? (
          <>
            <p className="text-ink-muted mb-6 text-[15px] leading-relaxed">
              To keep using the app for <b>{org}</b>, activate a subscription. Reach out and
              we'll get you set up.
            </p>
            <a
              href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent(`Subscription for ${org}`)}&body=${encodeURIComponent(`Hi, I'd like to activate a subscription for ${org} (account: ${user.email}).`)}`}
              className="w-full inline-flex items-center justify-center gap-2 bg-primary text-white py-3.5 rounded-xl font-bold hover:bg-[#B85F3B] transition-colors"
            >
              <EnvelopeSimple className="w-5 h-5" /> Subscribe / contact us
            </a>
          </>
        ) : (
          <p className="text-ink-muted mb-6 text-[15px] leading-relaxed">
            Access to <b>{org}</b> is paused. Please ask your organization's owner to activate
            the subscription.
          </p>
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

// Slim countdown shown while an org is on trial.
export const TrialBanner: React.FC<{ daysLeft: number }> = ({ daysLeft }) => (
  <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-full bg-onyx text-white text-xs font-bold shadow-lg flex items-center gap-2">
    <Lock className="w-3.5 h-3.5" />
    {daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in your free trial` : "Trial ends today"}
  </div>
);
