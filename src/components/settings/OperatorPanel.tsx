import React, { useState, useEffect } from "react";
import {
  Buildings,
  CreditCard,
  Copy,
  CheckCircle,
  CircleNotch as Loader2,
  WarningCircle as AlertCircle,
  EnvelopeSimple,
  Stack,
  ChartBar,
} from "@phosphor-icons/react";
import {
  callProvisionOrganization,
  callSetSubscription,
  callSetOrgPlan,
  callGetOrgUsage,
  callSetEmailConfig,
  callGetEmailConfigStatus,
  OrgUsage,
} from "../../services/firebaseFunctions";
import { PLAN_ORDER, PLANS } from "../../lib/plans";

// Operator-only console: create a new customer org (30-day trial) and manually
// manage subscriptions until automated (Razorpay) checkout is wired.
export const OperatorPanel: React.FC = () => {
  // Provision
  const [companyName, setCompanyName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [pBusy, setPBusy] = useState(false);
  const [pErr, setPErr] = useState<string | null>(null);
  const [provisioned, setProvisioned] = useState<{ orgId: string; link: string; emailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  // Email (Resend) config
  const [emailStatus, setEmailStatus] = useState<{ configured: boolean; fromEmail: string; fromName: string } | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("Sitetru");
  const [emBusy, setEmBusy] = useState(false);
  const [emMsg, setEmMsg] = useState<string | null>(null);
  const [emErr, setEmErr] = useState<string | null>(null);

  useEffect(() => {
    callGetEmailConfigStatus()
      .then((s) => { setEmailStatus(s); if (s.fromEmail) setFromEmail(s.fromEmail); if (s.fromName) setFromName(s.fromName); })
      .catch(() => {});
  }, []);

  const saveEmail = async () => {
    setEmBusy(true); setEmErr(null); setEmMsg(null);
    try {
      await callSetEmailConfig({ apiKey: apiKey.trim(), fromEmail: fromEmail.trim(), fromName: fromName.trim() });
      setApiKey("");
      setEmMsg("Saved. Invite emails are now enabled.");
      const s = await callGetEmailConfigStatus();
      setEmailStatus(s);
    } catch (e: any) {
      setEmErr(e?.message || "Couldn't save email settings.");
    } finally { setEmBusy(false); }
  };

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
      setProvisioned({ orgId: res.orgId, link, emailed: res.emailed });
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

  // Plan
  const [plan, setPlan] = useState("starter");
  const [planBusy, setPlanBusy] = useState(false);
  const [planErr, setPlanErr] = useState<string | null>(null);
  const [planOk, setPlanOk] = useState<string | null>(null);

  const applyPlan = async () => {
    setPlanBusy(true); setPlanErr(null); setPlanOk(null);
    try {
      const res = await callSetOrgPlan({ orgId: orgId.trim(), plan });
      setPlanOk(`Plan set to ${res.plan} (${res.includedProjects === null ? "unlimited" : res.includedProjects} projects, AI ${res.aiQuota === null ? "unlimited" : res.aiQuota}).`);
    } catch (e: any) {
      setPlanErr(e?.message || "Couldn't set the plan.");
    } finally { setPlanBusy(false); }
  };

  // Usage (safety-cap view)
  const [usage, setUsage] = useState<OrgUsage | null>(null);
  const [uBusy, setUBusy] = useState(false);
  const [uErr, setUErr] = useState<string | null>(null);

  const loadUsage = async () => {
    setUBusy(true); setUErr(null); setUsage(null);
    try {
      setUsage(await callGetOrgUsage(orgId.trim()));
    } catch (e: any) {
      setUErr(e?.message || "Couldn't load usage.");
    } finally { setUBusy(false); }
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
          Creates a new customer org on a 30-day trial and mints an Owner invite link.
        </p>
        {pErr && (
          <div className="mb-3 p-3 bg-danger/8 text-danger rounded-xl border border-danger/20 flex items-start gap-2 text-sm">
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
          <div className="mt-4 p-4 rounded-2xl border border-success/30 bg-success/10">
            <div className="flex items-center gap-2 font-bold text-ink mb-1">
              <CheckCircle weight="fill" className="w-5 h-5 text-success" /> Org created
            </div>
            <p className="text-xs mb-2">
              {provisioned.emailed
                ? <span className="text-success font-semibold">✓ Invite emailed to the owner.</span>
                : <span className="text-ink-muted">Not emailed — share the link below.</span>}
            </p>
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
          <div className="mb-3 p-3 bg-danger/8 text-danger rounded-xl border border-danger/20 flex items-start gap-2 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" /><p>{sErr}</p>
          </div>
        )}
        {sOk && (
          <div className="mb-3 p-3 bg-success/10 text-ink rounded-xl border border-success/30 text-sm font-semibold">{sOk}</div>
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

      {/* Plan */}
      <section className="soft-card p-8 squircle-24">
        <div className="flex items-center gap-2 mb-1">
          <Stack className="w-5 h-5 text-primary" />
          <h3 className="text-xl font-bold text-ink">Set project plan</h3>
        </div>
        <p className="text-ink-muted text-sm mb-5">
          Places the org (the <span className="font-mono">orgId</span> above) on a project-based plan —
          sets its project cap, AI quota and ₹{99}/extra-project overage. Free is never gated; paid
          plans activate for the period.
        </p>
        {planErr && (
          <div className="mb-3 p-3 bg-danger/8 text-danger rounded-xl border border-danger/20 flex items-start gap-2 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" /><p>{planErr}</p>
          </div>
        )}
        {planOk && (
          <div className="mb-3 p-3 bg-success/10 text-ink rounded-xl border border-success/30 text-sm font-semibold">{planOk}</div>
        )}
        <div className="flex flex-col sm:flex-row gap-3">
          <select value={plan} onChange={(e) => setPlan(e.target.value)}
            className="flex-1 bg-panel border border-divider px-4 py-3 rounded-xl text-ink text-sm font-semibold">
            {PLAN_ORDER.map((id) => (
              <option key={id} value={id}>
                {PLANS[id].name} — {PLANS[id].includedProjects === null ? "unlimited" : `${PLANS[id].includedProjects} projects`}
                {PLANS[id].monthly ? ` · ₹${PLANS[id].monthly}/mo` : PLANS[id].monthly === 0 ? " · free" : " · custom"}
              </option>
            ))}
          </select>
          <button onClick={applyPlan} disabled={planBusy || !orgId.trim()}
            className="px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-[#B85F3B] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {planBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Set plan"}
          </button>
        </div>
      </section>

      {/* Usage (safety-cap) */}
      <section className="soft-card p-8 squircle-24">
        <div className="flex items-center gap-2 mb-1">
          <ChartBar className="w-5 h-5 text-primary" />
          <h3 className="text-xl font-bold text-ink">Usage &amp; safety-cap</h3>
        </div>
        <p className="text-ink-muted text-sm mb-5">
          Live usage for the <span className="font-mono">orgId</span> above — spot an org running past
          its included projects or AI quota (the only way margin gets thin).
        </p>
        {uErr && (
          <div className="mb-3 p-3 bg-danger/8 text-danger rounded-xl border border-danger/20 flex items-start gap-2 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" /><p>{uErr}</p>
          </div>
        )}
        <button onClick={loadUsage} disabled={uBusy || !orgId.trim()}
          className="px-6 py-3 bg-onyx text-white rounded-xl font-bold hover:bg-onyx/80 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mb-4">
          {uBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Load usage"}
        </button>
        {usage && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div className="bg-panel border border-divider rounded-xl p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">Plan</p>
              <p className="font-bold text-ink">{usage.plan || usage.subscriptionStatus || "—"}</p>
            </div>
            <div className="bg-panel border border-divider rounded-xl p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">Projects</p>
              <p className="font-bold text-ink">
                {usage.projectCount}{usage.includedProjects === null ? "" : ` / ${usage.includedProjects}`}
              </p>
            </div>
            <div className={`rounded-xl p-3 border ${usage.overageProjects > 0 ? "bg-[#B85F3B]/10 border-[#B85F3B]/30" : "bg-panel border-divider"}`}>
              <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">Overage</p>
              <p className="font-bold text-ink">{usage.overageProjects} · ₹{usage.overageCost}/mo</p>
            </div>
            <div className="bg-panel border border-divider rounded-xl p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">AI this month</p>
              <p className="font-bold text-ink">
                {usage.aiUsed}{usage.aiQuota === null ? " (unlimited)" : ` / ${usage.aiQuota}`}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Email (Resend) */}
      <section className="soft-card p-8 squircle-24">
        <div className="flex items-center gap-2 mb-1">
          <EnvelopeSimple className="w-5 h-5 text-primary" />
          <h3 className="text-xl font-bold text-ink">Invite emails (Resend)</h3>
        </div>
        <p className="text-ink-muted text-sm mb-5">
          Paste your Resend API key so invite links are emailed automatically when you provision an
          org or invite a teammate. {emailStatus && (
            emailStatus.configured
              ? <span className="text-success font-semibold">Currently ON — sending from {emailStatus.fromEmail}.</span>
              : <span className="text-[#B85F3B] font-semibold">Currently OFF — links are copy-only.</span>
          )}
        </p>
        {emErr && (
          <div className="mb-3 p-3 bg-danger/8 text-danger rounded-xl border border-danger/20 flex items-start gap-2 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" /><p>{emErr}</p>
          </div>
        )}
        {emMsg && (
          <div className="mb-3 p-3 bg-success/10 text-ink rounded-xl border border-success/30 text-sm font-semibold">{emMsg}</div>
        )}
        <div className="space-y-3">
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" placeholder="Resend API key (re_…)"
            className="w-full bg-panel border border-divider px-4 py-3 rounded-xl text-ink text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20" />
          <div className="flex flex-col sm:flex-row gap-3">
            <input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="from email (e.g. invites@yourdomain.com)"
              className="flex-1 bg-panel border border-divider px-4 py-3 rounded-xl text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            <input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="from name"
              className="sm:w-48 bg-panel border border-divider px-4 py-3 rounded-xl text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            <button onClick={saveEmail} disabled={emBusy || !apiKey.trim() || !fromEmail.trim()}
              className="px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-[#B85F3B] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {emBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </button>
          </div>
          <p className="text-[10px] text-ink-muted">
            The from-email's domain must be verified in Resend to email anyone. Until then, Resend only
            delivers to your own account email (test mode).
          </p>
        </div>
      </section>
    </div>
  );
};
