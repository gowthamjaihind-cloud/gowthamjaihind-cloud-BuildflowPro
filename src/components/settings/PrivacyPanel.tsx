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
import { useL } from "../../i18n";

// Settings → Privacy & Data: the data-subject rights surface (export + erasure)
// plus links to the legal documents. Deletions are irreversible and gated by a
// typed confirmation; the server enforces the actual authorization.
export const PrivacyPanel: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
  const L = useL();
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
      setExportError(e?.message || L("Couldn't prepare your export. Please try again.", "உங்கள் எக்ஸ்போர்ட்டைத் தயாரிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."));
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
      setOrgError(e?.message || L("Couldn't delete the organization.", "நிறுவனத்தை நீக்க முடியவில்லை."));
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
      setAcctError(e?.message || L("Couldn't delete your account.", "உங்கள் கணக்கை நீக்க முடியவில்லை."));
      setDeletingAcct(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Legal documents */}
      <section className="soft-card p-8 squircle-24">
        <h3 className="text-xl font-bold text-ink mb-1 flex items-center gap-2">
          <FileText className="w-6 h-6 text-primary" /> {L("Legal", "சட்டம்")}
        </h3>
        <p className="text-ink-muted text-sm mb-6">
          {L("The terms that govern your use of Sitetru and how we handle your data.", "Sitetru இன் உங்கள் பயன்பாட்டை நிர்வகிக்கும் விதிமுறைகள் மற்றும் உங்கள் தரவை நாங்கள் எவ்வாறு கையாளுகிறோம்.")}
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href={TERMS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-between gap-2 bg-panel border border-divider px-5 py-4 rounded-xl font-semibold text-ink hover:bg-surface apple-transition"
          >
            {L("Terms of Service", "சேவை விதிமுறைகள்")} <ArrowSquareOut className="w-4 h-4 text-ink-muted" />
          </a>
          <a
            href={PRIVACY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-between gap-2 bg-panel border border-divider px-5 py-4 rounded-xl font-semibold text-ink hover:bg-surface apple-transition"
          >
            {L("Privacy Policy", "தனியுரிமைக் கொள்கை")} <ArrowSquareOut className="w-4 h-4 text-ink-muted" />
          </a>
        </div>
        {currentUser.legal?.acceptedAt && (
          <p className="text-[11px] text-ink-muted mt-4 flex items-center gap-1.5">
            <ShieldCheck weight="fill" className="w-4 h-4 text-success" />
            {L("You accepted version", "நீங்கள் பதிப்பு")} {currentUser.legal.termsVersion} {L("on", "ஐ ஏற்றுக்கொண்டது")}{" "}
            {new Date(currentUser.legal.acceptedAt).toLocaleDateString()}.
          </p>
        )}
      </section>

      {/* Export */}
      <section className="soft-card p-8 squircle-24">
        <h3 className="text-xl font-bold text-ink mb-1 flex items-center gap-2">
          <DownloadSimple className="w-6 h-6 text-primary" /> {L("Export my data", "என் தரவை எக்ஸ்போர்ட் செய்")}
        </h3>
        <p className="text-ink-muted text-sm mb-6 leading-relaxed">
          {L("Download a machine-readable (JSON) copy of your profile", "உங்கள் சுயவிவரத்தின் இயந்திரம்-படிக்கக்கூடிய (JSON) நகலைப் பதிவிறக்கவும்")}
          {isOwner || myRole === "Admin"
            ? L(" and your organization's data, including projects and their records.", " மற்றும் செயல்திட்டங்கள் மற்றும் அவற்றின் பதிவுகள் உட்பட உங்கள் நிறுவனத்தின் தரவு.")
            : L(". A full organization export is available to Owners and Admins.", ". முழு நிறுவன எக்ஸ்போர்ட் உரிமையாளர்கள் மற்றும் நிர்வாகிகளுக்கு கிடைக்கும்.")}
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
              <Loader2 className="w-5 h-5 animate-spin" /> {L("Preparing…", "தயாராகிறது…")}
            </>
          ) : (
            <>
              <DownloadSimple className="w-5 h-5" /> {L("Download my data", "என் தரவைப் பதிவிறக்கு")}
            </>
          )}
        </button>
      </section>

      {/* Danger zone */}
      <section className="rounded-[24px] border border-danger/30 bg-danger/[0.04] p-8">
        <h3 className="text-xl font-bold text-danger mb-1 flex items-center gap-2">
          <AlertCircle className="w-6 h-6" /> {L("Danger zone", "ஆபத்து மண்டலம்")}
        </h3>
        <p className="text-ink-muted text-sm mb-6">
          {L("These actions are permanent and cannot be undone. Export your data first if you might need it.", "இந்தச் செயல்கள் நிரந்தரமானவை, மீட்டெடுக்க முடியாது. தேவைப்படலாம் எனில் முதலில் உங்கள் தரவை எக்ஸ்போர்ட் செய்யவும்.")}
        </p>

        {/* Delete organization — Owner only */}
        {isOwner && orgId && (
          <div className="mb-8 pb-8 border-b border-danger/15">
            <div className="flex items-start gap-3 mb-3">
              <Buildings className="w-5 h-5 text-danger shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-ink">{L("Delete organization", "நிறுவனத்தை நீக்கு")}</div>
                <p className="text-sm text-ink-muted mt-1 leading-relaxed">
                  {L("Permanently deletes", "நிரந்தரமாக நீக்குகிறது")} <b>{companyName}</b> {L("and all of its projects, logs, purchase orders, invoices, and every other record — for all members.", "மற்றும் அதன் அனைத்து செயல்திட்டங்கள், பதிவுகள், கொள்முதல் ஆணைகள், விலைப்பட்டியல்கள் மற்றும் ஒவ்வொரு பதிவையும் — அனைத்து உறுப்பினர்களுக்கும்.")}
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
              {L("Type the organization name", "உறுதிப்படுத்த நிறுவனப் பெயரைத் தட்டச்சு செய்யவும்:")} <b className="text-ink">{settings.companyName || ""}</b>
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={orgConfirm}
                onChange={(e) => setOrgConfirm(e.target.value)}
                placeholder={settings.companyName || L("Organization name", "நிறுவனப் பெயர்")}
                className="flex-1 bg-surface border border-divider px-4 py-3 rounded-xl text-ink focus:outline-none focus:ring-2 focus:ring-danger/20"
              />
              <button
                onClick={handleDeleteOrg}
                disabled={deletingOrg || !settings.companyName || orgConfirm.trim() !== settings.companyName}
                className="px-6 py-3 bg-danger text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-danger/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deletingOrg ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                {L("Delete organization", "நிறுவனத்தை நீக்கு")}
              </button>
            </div>
          </div>
        )}

        {/* Delete account */}
        <div>
          <div className="flex items-start gap-3 mb-3">
            <Trash2 className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-ink">{L("Delete my account", "என் கணக்கை நீக்கு")}</div>
              <p className="text-sm text-ink-muted mt-1 leading-relaxed">
                {L("Permanently deletes your Sitetru account and removes you from every organization. If you're the only member of an organization, it will be deleted too. If you're the sole Owner of an organization with other members, transfer ownership or delete that organization first.", "உங்கள் Sitetru கணக்கை நிரந்தரமாக நீக்கி, ஒவ்வொரு நிறுவனத்திலிருந்தும் உங்களை அகற்றுகிறது. நீங்கள் ஒரு நிறுவனத்தின் ஒரே உறுப்பினராக இருந்தால், அதுவும் நீக்கப்படும். மற்ற உறுப்பினர்களைக் கொண்ட நிறுவனத்தின் ஒரே உரிமையாளராக நீங்கள் இருந்தால், முதலில் உரிமையை மாற்றவும் அல்லது அந்த நிறுவனத்தை நீக்கவும்.")}
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
            {L("Type", "தட்டச்சு")} <b className="text-ink">DELETE</b> {L("to confirm", "உறுதிப்படுத்த")}
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
              {L("Delete my account", "என் கணக்கை நீக்கு")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default PrivacyPanel;
