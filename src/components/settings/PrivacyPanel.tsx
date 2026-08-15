import React, { useState } from "react";
import {
  DownloadSimple,
  Trash as Trash2,
  Buildings,
  FileText,
  ShieldCheck,
  WarningCircle as AlertCircle,
  CircleNotch as Loader2,
  ArrowSquareOut,
} from "@phosphor-icons/react";
import { UserProfile } from "../../types";
import { auth } from "../../firebase";
import { useOrgSettings } from "../../hooks/useOrgSettings";
import { TERMS_URL, PRIVACY_URL } from "../../lib/legal";
import {
  callExportMyData,
  callDeleteOrganization,
  callDeleteMyAccount,
} from "../../services/firebaseFunctions";

// Settings → Privacy & Data: the data-subject rights surface (export + erasure)
// plus links to the legal documents. Deletions are irreversible and gated by a
// typed confirmation; the server enforces the actual authorization.
export const PrivacyPanel: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
  const { orgId, members, settings } = useOrgSettings();
  const myRole = members?.[currentUser.uid];
  const isOwner = myRole === "Owner";
  const companyName = settings.companyName || "your organization";

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [orgConfirm, setOrgConfirm] = useState("");
  const [deletingOrg, setDeletingOrg] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  const [acctConfirm, setAcctConfirm] = useState("");
  const [deletingAcct, setDeletingAcct] = useState(false);
  const [acctError, setAcctError] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const data = await callExportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sitetru-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e: any) {
      setExportError(e?.message || "Couldn't prepare your export. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteOrg = async () => {
    if (!orgId) return;
    setDeletingOrg(true);
    setOrgError(null);
    try {
      await callDeleteOrganization(orgId);
      // The org (and this user's link to it) is gone; reload into whatever
      // remains (another org, or the onboarding screen).
      window.location.reload();
    } catch (e: any) {
      setOrgError(e?.message || "Couldn't delete the organization.");
      setDeletingOrg(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeletingAcct(true);
    setAcctError(null);
    try {
      await callDeleteMyAccount();
      // Account and auth record are gone — sign out and return to the landing page.
      try {
        await auth.signOut();
      } catch {
        /* ignore */
      }
      window.location.href = "/";
    } catch (e: any) {
      setAcctError(e?.message || "Couldn't delete your account.");
      setDeletingAcct(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Legal documents */}
      <section className="soft-card p-8 squircle-24">
        <h3 className="text-xl font-bold text-ink mb-1 flex items-center gap-2">
          <FileText className="w-6 h-6 text-primary" /> Legal
        </h3>
        <p className="text-ink-muted text-sm mb-6">
          The terms that govern your use of Sitetru and how we handle your data.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href={TERMS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-between gap-2 bg-panel border border-divider px-5 py-4 rounded-xl font-semibold text-ink hover:bg-surface apple-transition"
          >
            Terms of Service <ArrowSquareOut className="w-4 h-4 text-ink-muted" />
          </a>
          <a
            href={PRIVACY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-between gap-2 bg-panel border border-divider px-5 py-4 rounded-xl font-semibold text-ink hover:bg-surface apple-transition"
          >
            Privacy Policy <ArrowSquareOut className="w-4 h-4 text-ink-muted" />
          </a>
        </div>
        {currentUser.legal?.acceptedAt && (
          <p className="text-[11px] text-ink-muted mt-4 flex items-center gap-1.5">
            <ShieldCheck weight="fill" className="w-4 h-4 text-success" />
            You accepted version {currentUser.legal.termsVersion} on{" "}
            {new Date(currentUser.legal.acceptedAt).toLocaleDateString()}.
          </p>
        )}
      </section>

      {/* Export */}
      <section className="soft-card p-8 squircle-24">
        <h3 className="text-xl font-bold text-ink mb-1 flex items-center gap-2">
          <DownloadSimple className="w-6 h-6 text-primary" /> Export my data
        </h3>
        <p className="text-ink-muted text-sm mb-6 leading-relaxed">
          Download a machine-readable (JSON) copy of your profile
          {isOwner || myRole === "Admin"
            ? " and your organization's data, including projects and their records."
            : ". A full organization export is available to Owners and Admins."}
        </p>
        {exportError && (
          <div className="mb-4 p-3 bg-danger/8 text-danger rounded-xl border border-danger/20 flex items-start gap-2 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{exportError}</p>
          </div>
        )}
        <button
          onClick={handleExport}
          disabled={exporting}
          className="px-6 py-3 bg-primary text-white rounded-xl font-bold flex items-center gap-2 hover:bg-[#B85F3B] transition-colors disabled:opacity-50"
        >
          {exporting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" /> Preparing…
            </>
          ) : (
            <>
              <DownloadSimple className="w-5 h-5" /> Download my data
            </>
          )}
        </button>
      </section>

      {/* Danger zone */}
      <section className="rounded-[24px] border border-danger/30 bg-danger/[0.04] p-8">
        <h3 className="text-xl font-bold text-danger mb-1 flex items-center gap-2">
          <AlertCircle className="w-6 h-6" /> Danger zone
        </h3>
        <p className="text-ink-muted text-sm mb-6">
          These actions are permanent and cannot be undone. Export your data first if you might need it.
        </p>

        {/* Delete organization — Owner only */}
        {isOwner && orgId && (
          <div className="mb-8 pb-8 border-b border-danger/15">
            <div className="flex items-start gap-3 mb-3">
              <Buildings className="w-5 h-5 text-danger shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-ink">Delete organization</div>
                <p className="text-sm text-ink-muted mt-1 leading-relaxed">
                  Permanently deletes <b>{companyName}</b> and all of its projects, logs,
                  purchase orders, invoices, and every other record — for all members.
                </p>
              </div>
            </div>
            {orgError && (
              <div className="mb-3 p-3 bg-danger/8 text-danger rounded-xl border border-danger/20 flex items-start gap-2 text-sm">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>{orgError}</p>
              </div>
            )}
            <label className="block text-xs font-semibold text-ink-muted mb-1.5">
              Type the organization name <b className="text-ink">{settings.companyName || ""}</b> to confirm
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={orgConfirm}
                onChange={(e) => setOrgConfirm(e.target.value)}
                placeholder={settings.companyName || "Organization name"}
                className="flex-1 bg-surface border border-divider px-4 py-3 rounded-xl text-ink focus:outline-none focus:ring-2 focus:ring-danger/20"
              />
              <button
                onClick={handleDeleteOrg}
                disabled={deletingOrg || !settings.companyName || orgConfirm.trim() !== settings.companyName}
                className="px-6 py-3 bg-danger text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-danger/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deletingOrg ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                Delete organization
              </button>
            </div>
          </div>
        )}

        {/* Delete account */}
        <div>
          <div className="flex items-start gap-3 mb-3">
            <Trash2 className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-ink">Delete my account</div>
              <p className="text-sm text-ink-muted mt-1 leading-relaxed">
                Permanently deletes your Sitetru account and removes you from every organization.
                If you're the only member of an organization, it will be deleted too. If you're the
                sole Owner of an organization with other members, transfer ownership or delete that
                organization first.
              </p>
            </div>
          </div>
          {acctError && (
            <div className="mb-3 p-3 bg-danger/8 text-danger rounded-xl border border-danger/20 flex items-start gap-2 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{acctError}</p>
            </div>
          )}
          <label className="block text-xs font-semibold text-ink-muted mb-1.5">
            Type <b className="text-ink">DELETE</b> to confirm
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={acctConfirm}
              onChange={(e) => setAcctConfirm(e.target.value.toUpperCase())}
              placeholder="DELETE"
              className="flex-1 bg-surface border border-divider px-4 py-3 rounded-xl text-ink font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-danger/20"
            />
            <button
              onClick={handleDeleteAccount}
              disabled={deletingAcct || acctConfirm !== "DELETE"}
              className="px-6 py-3 bg-danger text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-danger/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {deletingAcct ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
              Delete my account
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default PrivacyPanel;
