import React, { useState } from "react";
import {
  Buildings,
  CreditCard,
  Copy,
  CheckCircle,
  CircleNotch as Loader2,
  WarningCircle as AlertCircle,
} from "@phosphor-icons/react";
import { callProvisionOrganization, callSetSubscription } from "../../services/firebaseFunctions";

// Operator-only console: create a new customer org (7-day trial) and manually
// manage subscriptions until automated (Razorpay) checkout is wired.
export const OperatorPanel: React.FC = () => {
  // Provision
  const [companyName, setCompanyName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [pBusy, setPBusy] = useState(false);
  const [pErr, setPErr] = useState<string | null>(null);
  const [provisioned, setProvisioned] = useState<{ orgId: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Subscription
  const [orgId, setOrgId] = useState("");
  const [action, setAction] = useState("activate");
  const [months, setMonths] = useState(1);
  const [sBusy, setSBusy] = useState(false);
  const [sErr, setSErr] = useState<string | null>(null);
  const [sOk, setSOk] = useState<string | null>(null);

  const provision = async () => {
    setPBusy(true); setPErr(null); setProvisioned(null); setCopied(false);
    try {
      const res = await callProvisionOrganization({ companyName: companyName.trim(), ownerEmail: ownerEmail.trim() || undefined });
      const link = `${window.location.origin}/?invite=${res.code}`;
      setProvisioned({ orgId: res.orgId, link });
      setOrgId(res.orgId);
      setCompanyName(""); setOwnerEmail("");
    } catch (e: any) {
      setPErr(e?.message || "Couldn't provision the organization.");
    } finally { setPBusy(false); }
  };

  const setSub = async () => {
    setSBusy(true); setSErr(null); setSOk(null);
    try {
      const res = await callSetSubscription({ orgId: orgId.trim(), action, months });
      setSOk(`Updated: ${res.subscriptionStatus}${res.currentPeriodEnd ? ` (until ${new Date(res.currentPeriodEnd).toLocaleDateString()})` : ""}`);
    } catch (e: any) {
      setSErr(e?.message || "Couldn't update the subscription.");
    } finally { setSBusy(false); }
  };

  return (
    <div className="space-y-6">
      {/* Provision */}
      <section className="soft-card p-8 squircle-24">
        <div className="flex items-center gap-2 mb-1">
          <Buildings className="w-5 h-5 text-primary" />
          <h3 className="text-xl font-bold text-ink">Provision new organization</h3>
        </div>
        <p className="text-ink-muted text-sm mb-5">
          Creates a new customer org on a 7-day trial and mints an Owner invite link.
        </p>
        {pErr && (
          <div className="mb-3 p-3 bg-[#EF4444]/8 text-[#B91C1C] rounded-xl border border-[#EF4444]/20 flex items-start gap-2 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" /><p>{pErr}</p>
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-3">
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company name"
            className="flex-1 bg-panel border border-divider px-4 py-3 rounded-xl text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
          <input value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="Owner email (optional)"
            className="flex-1 bg-panel border border-divider px-4 py-3 rounded-xl text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
          <button onClick={provision} disabled={pBusy || !companyName.trim()}
            className="px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-[#B85F3B] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {pBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Provision"}
          </button>
        </div>
        {provisioned && (
          <div className="mt-4 p-4 rounded-2xl border border-[#059669]/30 bg-[#059669]/10">
            <div className="flex items-center gap-2 font-bold text-ink mb-1">
              <CheckCircle weight="fill" className="w-5 h-5 text-[#059669]" /> Org created
            </div>
            <p className="text-xs text-ink-muted mb-2">orgId: <span className="font-mono">{provisioned.orgId}</span></p>
            <div className="flex items-center gap-2">
              <input readOnly value={provisioned.link}
                className="flex-1 bg-surface border border-divider px-3 py-2 rounded-lg text-xs font-mono text-ink truncate" />
              <button onClick={async () => { try { await navigator.clipboard.writeText(provisioned.link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} }}
                className="px-4 py-2 bg-onyx text-white rounded-lg text-sm font-bold flex items-center gap-1.5 shrink-0">
                {copied ? <><CheckCircle className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
              </button>
            </div>
            <p className="text-xs text-ink-muted mt-2">Send this Owner-invite link to the customer.</p>
          </div>
        )}
      </section>

      {/* Subscription */}
      <section className="soft-card p-8 squircle-24">
        <div className="flex items-center gap-2 mb-1">
          <CreditCard className="w-5 h-5 text-primary" />
          <h3 className="text-xl font-bold text-ink">Manage subscription</h3>
        </div>
        <p className="text-ink-muted text-sm mb-5">
          Manually activate (after payment), extend a trial, or expire an org. Automated Razorpay
          checkout will drive this later.
        </p>
        {sErr && (
          <div className="mb-3 p-3 bg-[#EF4444]/8 text-[#B91C1C] rounded-xl border border-[#EF4444]/20 flex items-start gap-2 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" /><p>{sErr}</p>
          </div>
        )}
        {sOk && (
          <div className="mb-3 p-3 bg-[#059669]/10 text-ink rounded-xl border border-[#059669]/30 text-sm font-semibold">{sOk}</div>
        )}
        <div className="flex flex-col sm:flex-row gap-3">
          <input value={orgId} onChange={(e) => setOrgId(e.target.value)} placeholder="orgId"
            className="flex-1 bg-panel border border-divider px-4 py-3 rounded-xl text-ink text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20" />
          <select value={action} onChange={(e) => setAction(e.target.value)}
            className="bg-panel border border-divider px-4 py-3 rounded-xl text-ink text-sm font-semibold">
            <option value="activate">Activate (paid)</option>
            <option value="extend_trial">Extend trial 7d</option>
            <option value="expire">Expire</option>
            <option value="internal">Internal (never gated)</option>
          </select>
          {action === "activate" && (
            <input type="number" min={1} value={months} onChange={(e) => setMonths(parseInt(e.target.value) || 1)}
              className="w-24 bg-panel border border-divider px-4 py-3 rounded-xl text-ink text-sm" title="Months" />
          )}
          <button onClick={setSub} disabled={sBusy || !orgId.trim()}
            className="px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-[#B85F3B] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {sBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
          </button>
        </div>
      </section>
    </div>
  );
};
