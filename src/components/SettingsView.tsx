import React, { useState } from "react";
import {
  ArrowsClockwise as RefreshCw,
  Layout,
  Shield,
  Bell,
  CaretRight as ChevronRight,
  GearSix as Settings,
  Info,
  CreditCard,
  Users,
  SignOut as LogOut,
  ArrowsLeftRight as ArrowLeftRight,
  Trash as Trash2,
  PaperPlaneTilt as Send,
  SquaresFour as LayoutDashboard,
  FloppyDisk as Save,
  Monitor,
  PencilSimple as Edit2,
  TelegramLogo,
  LockKey,
} from "@phosphor-icons/react";
import { Project, UserProfile } from "../types";
import { EnterpriseAuthView } from "./EnterpriseAuthView";
import { useUIStore } from "../store";
import { useOrgSettings } from "../hooks/useOrgSettings";
import { callSetupOrganization } from "../services/firebaseFunctions";
import { TeamPanel } from "./settings/TeamPanel";
import { OperatorPanel } from "./settings/OperatorPanel";
import { PrivacyPanel } from "./settings/PrivacyPanel";
import { TelegramIntegration } from "./TelegramIntegration";

const SUPER_ADMIN_EMAILS = ["gowtham.jaihind@gmail.com"];

interface SettingsViewProps {
  onBack: () => void;
  currentUser: UserProfile;
}

type SettingsSection =
  | "organization"
  | "enterprise"
  | "notifications"
  | "billing"
  | "team"
  | "telegram"
  | "operator"
  | "appearance"
  | "privacy"

export const SettingsView: React.FC<SettingsViewProps> = ({
  onBack,
  currentUser,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsSection>("organization");
  const companyName = useUIStore((state) => state.companyName);
  const setCompanyName = useUIStore((state) => state.setCompanyName);
  const uiMode = useUIStore((state) => state.uiMode);
  const setUIMode = useUIStore((state) => state.setUIMode);
  const darkMode = useUIStore((state) => state.darkMode);
  const setDarkMode = useUIStore((state) => state.setDarkMode);
  const [isEditingCompany, setIsEditingCompany] = useState(false);
  const [draftCompanyName, setDraftCompanyName] = useState(companyName);
  const { settings: orgSettings, save: saveOrgSettings, orgId, isClaimed, isMember, claim } = useOrgSettings();
  const [draftGstin, setDraftGstin] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupDone, setSetupDone] = useState<{ projects: number; docs: number } | null>(null);
  // Load the saved GSTIN once it arrives from Firestore.
  React.useEffect(() => {
    setDraftGstin(orgSettings.gstin || "");
  }, [orgSettings.gstin]);

  return (
    <div className="min-h-screen p-8 md:p-12 lg:p-24 overflow-x-hidden relative">
      <div className="w-full max-w-[1400px] mx-auto space-y-10">
        <header className="mb-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-[34px] font-bold tracking-tight text-ink mb-2 leading-tight">
              Preferences
            </h2>
            <p className="text-[15px] text-ink-muted font-medium leading-relaxed max-w-2xl">
              Manage your global configuration and systemic parameters.
            </p>
          </div>
          <button
            onClick={onBack}
            className="p-4 bg-surface border border-divider rounded-2xl hover:bg-panel apple-transition shadow-sm flex items-center gap-2 font-bold text-ink"
          >
            <ArrowLeftRight className="w-5 h-5 text-ink-muted" />
            Back to Portfolio
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Navigation / Categories */}
          <div className="space-y-2 flex-col flex overflow-y-auto">
            {[
              {
                id: "organization",
                label: "Default Organization",
                icon: LayoutDashboard,
              },
              { id: "team", label: "Team", icon: Users },
              { id: "telegram", label: "Telegram Bot", icon: TelegramLogo },
              ...(SUPER_ADMIN_EMAILS.includes((currentUser?.email || "").toLowerCase())
                ? [{ id: "operator", label: "Operator", icon: Shield }]
                : []),
              { id: "appearance", label: "Appearance", icon: Monitor },
              { id: "privacy", label: "Privacy & Data", icon: LockKey },
              {
                id: "enterprise",
                label: "Identity & Authorization",
                icon: Shield,
              },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as SettingsSection)}
                className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl apple-transition font-semibold text-[15px] ${
                  activeTab === item.id
                    ? "bg-surface text-ink shadow-sm ring-1 ring-onyx/5"
                    : "text-ink-muted hover:text-ink hover:bg-surface/40"
                }`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="md:col-span-2 space-y-6">
            {activeTab === "enterprise" && (
              <EnterpriseAuthView
                onBack={() => {}}
                currentUser={currentUser}
                viewMode="enterprise"
              />
            )}

            {activeTab === "team" && <TeamPanel />}

            {activeTab === "privacy" && <PrivacyPanel currentUser={currentUser} />}

            {activeTab === "telegram" && (
              <section className="soft-card p-8 squircle-24">
                <h3 className="text-xl font-bold text-ink mb-1">Telegram Bot</h3>
                <p className="text-ink-muted text-sm mb-6">
                  Connect your Telegram to file daily logs, scan invoices, and get updates from your phone.
                </p>
                <TelegramIntegration currentUser={currentUser} />
              </section>
            )}

            {activeTab === "operator" &&
              SUPER_ADMIN_EMAILS.includes((currentUser?.email || "").toLowerCase()) && (
                <OperatorPanel />
              )}

            {activeTab === "organization" && (
              <section className="soft-card p-8 squircle-24">
                <h3 className="text-xl font-bold text-ink mb-6">
                  Default Organization
                </h3>

                {!orgId && !setupDone && (
                  <div className="mb-6 p-5 rounded-2xl border border-primary/40 bg-primary/10">
                    <div className="flex items-start gap-3">
                      <Shield className="w-5 h-5 text-[#B85F3B] shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="font-bold text-ink">Set up your organization</div>
                        <p className="text-sm text-ink-muted mt-1">
                          Your data isn't linked to an organization yet, so it can't be
                          secured per-tenant. This one-time step creates your organization,
                          moves a copy of your existing data under it, and makes you the
                          Owner. Your current data is left untouched as a backup.
                        </p>
                        {setupError && (
                          <p className="text-sm text-danger mt-2">{setupError}</p>
                        )}
                        <button
                          onClick={async () => {
                            setSettingUp(true);
                            setSetupError(null);
                            try {
                              const res = await callSetupOrganization(companyName || undefined);
                              setSetupDone({ projects: res.projects, docs: res.docs });
                            } catch (e: any) {
                              setSetupError(e?.message || "Couldn't set up the organization.");
                            } finally {
                              setSettingUp(false);
                            }
                          }}
                          disabled={settingUp}
                          className="mt-3 px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-[#B85F3B] transition-colors disabled:opacity-50"
                        >
                          {settingUp ? "Setting up… (may take a minute)" : "Set up organization & migrate data"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {setupDone && (
                  <div className="mb-6 p-5 rounded-2xl border border-success/30 bg-success/10">
                    <div className="flex items-start gap-3">
                      <Shield className="w-5 h-5 text-success shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="font-bold text-ink">Organization created</div>
                        <p className="text-sm text-ink-muted mt-1">
                          Migrated {setupDone.projects} project(s) ({setupDone.docs} records) and
                          made you the Owner. Final step: run the <b>“Deploy Firestore Rules”</b> action
                          on GitHub to switch on tenant isolation. You may need to reload the app.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {orgId && !isClaimed && (
                  <div className="mb-6 p-5 rounded-2xl border border-primary/40 bg-primary/10">
                    <div className="flex items-start gap-3">
                      <Shield className="w-5 h-5 text-[#B85F3B] shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="font-bold text-ink">Secure this organization</div>
                        <p className="text-sm text-ink-muted mt-1">
                          Claim ownership so only your team can access this organization's
                          data. Do this once, then deploy the updated security rules.
                        </p>
                        {claimError && (
                          <p className="text-sm text-danger mt-2">{claimError}</p>
                        )}
                        <button
                          onClick={async () => {
                            setClaiming(true);
                            setClaimError(null);
                            try {
                              await claim();
                            } catch (e: any) {
                              setClaimError(e?.message || "Couldn't claim the organization.");
                            } finally {
                              setClaiming(false);
                            }
                          }}
                          disabled={claiming}
                          className="mt-3 px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-[#B85F3B] transition-colors disabled:opacity-50"
                        >
                          {claiming ? "Claiming…" : "Claim organization"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {orgId && isClaimed && (
                  <div className="mb-6 p-4 rounded-2xl border border-success/30 bg-success/10 flex items-center gap-3">
                    <Shield className="w-5 h-5 text-success shrink-0" />
                    <span className="text-sm font-semibold text-ink">
                      {isMember
                        ? "Organization secured — access is limited to its members."
                        : "This organization is owned by another account."}
                    </span>
                  </div>
                )}

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-ink mb-2">
                      Company Name
                    </label>
                    {isEditingCompany ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          className="w-full bg-surface border border-[#C8D1D3] px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-ink"
                          placeholder="Enter company name"
                          value={draftCompanyName}
                          onChange={(e) => setDraftCompanyName(e.target.value)}
                        />
                        <button
                          onClick={() => {
                            setCompanyName(draftCompanyName);
                            setIsEditingCompany(false);
                          }}
                          className="px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-[#B85F3B] transition-colors"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between bg-surface border border-[#C8D1D3] px-4 py-3 rounded-xl">
                        <span className="text-ink font-semibold">
                          {companyName || "No Company Name Set"}
                        </span>
                        <button
                          onClick={() => {
                            setDraftCompanyName(companyName);
                            setIsEditingCompany(true);
                          }}
                          className="text-ink-muted hover:text-primary transition-colors flex items-center gap-2 text-sm font-bold"
                        >
                          <Edit2 className="w-4 h-4" /> Edit
                        </button>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-ink mb-2">
                      Company GSTIN
                    </label>
                    <input
                      type="text"
                      value={draftGstin}
                      onChange={(e) => setDraftGstin(e.target.value.toUpperCase())}
                      maxLength={15}
                      className="w-full bg-surface border border-[#C8D1D3] px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-ink font-mono"
                      placeholder="e.g. 29ABCDE1234F1Z5"
                    />
                    <p className="text-[10px] text-ink-muted mt-1.5">
                      Used to validate vendor invoices and split CGST/SGST vs IGST.
                      {draftGstin.length >= 2 && ` State code: ${draftGstin.slice(0, 2)}.`}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-ink mb-2">
                      Base Currency
                    </label>
                    <select className="w-full bg-surface border border-[#C8D1D3] px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-ink appearance-none">
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                    </select>
                  </div>
                  <div className="pt-4 border-t border-surface-dark/5">
                    <button
                      onClick={async (e) => {
                        const target = e.currentTarget;
                        const originalText = target.innerHTML;
                        try {
                          await saveOrgSettings({ gstin: draftGstin });
                          target.innerHTML = "Saved!";
                        } catch {
                          target.innerHTML = "Save failed";
                        }
                        setTimeout(() => {
                          target.innerHTML = originalText;
                        }, 2000);
                      }}
                      className="bg-primary text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-[#B85F3B] transition-colors apple-transition active:scale-95"
                    >
                      <Save className="w-5 h-5" /> Save Configuration
                    </button>
                  </div>
                </div>
              </section>
            )}

            {activeTab === "appearance" && (
              <section className="soft-card p-8 squircle-24">
                <h3 className="text-xl font-bold text-ink mb-6 flex items-center gap-2">
                  <Monitor className="w-6 h-6 text-primary" /> Appearance
                </h3>
                <div className="space-y-8">
                  <div>
                    <h4 className="font-bold text-ink mb-4">UI Work Mode</h4>
                    <div className="flex gap-4">
                      <button
                        onClick={() => setUIMode("executive")}
                        className={`flex-1 p-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
                          uiMode === "executive"
                            ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                            : "border-divider bg-panel hover:bg-surface"
                        }`}
                      >
                        <LayoutDashboard className="w-6 h-6 text-ink-muted" />
                        <span className="font-semibold text-ink">
                          Executive Mode
                        </span>
                        <span className="text-xs text-ink-muted text-center leading-tight">
                          Spacious layout for analytics and oversight.
                        </span>
                      </button>
                      <button
                        onClick={() => setUIMode("site")}
                        className={`flex-1 p-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
                          uiMode === "site"
                            ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                            : "border-divider bg-panel hover:bg-surface"
                        }`}
                      >
                        <Monitor className="w-6 h-6 text-ink-muted" />
                        <span className="font-semibold text-ink">
                          Site Mode
                        </span>
                        <span className="text-xs text-ink-muted text-center leading-tight">
                          Compact, high-density UI for field operations.
                        </span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-ink mb-4">Display Mode</h4>
                    <div className="flex gap-4">
                      <button
                        onClick={() => setDarkMode(false)}
                        className={`flex-1 p-4 rounded-xl border flex items-center justify-center gap-3 transition-all ${
                          !darkMode
                            ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                            : "border-divider bg-panel hover:bg-surface"
                        }`}
                      >
                        <div className="w-5 h-5 rounded-full border border-divider bg-surface shadow-inner"></div>
                        <span className="font-semibold text-ink">
                          Light Mode
                        </span>
                      </button>
                      <button
                        onClick={() => setDarkMode(true)}
                        className={`flex-1 p-4 rounded-xl border flex items-center justify-center gap-3 transition-all ${
                          darkMode
                            ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                            : "border-divider bg-panel hover:bg-surface"
                        }`}
                      >
                        <div className="w-5 h-5 rounded-full border border-[#465D6E] bg-surface-dark shadow-inner"></div>
                        <span className="font-semibold text-ink">
                          Dark Mode
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            
            

          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
