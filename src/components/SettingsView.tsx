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
import { PlanSummary } from "./settings/PlanSummary";
import { TelegramIntegration } from "./TelegramIntegration";
import { useTranslation, useL } from "../i18n";

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
  const { t } = useTranslation();
  const L = useL();
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
              {t("settings.title")}
            </h2>
            <p className="text-[15px] text-ink-muted font-medium leading-relaxed max-w-2xl">
              {t("settings.subtitle")}
            </p>
          </div>
          <button
            onClick={onBack}
            className="p-4 bg-surface border border-divider rounded-2xl hover:bg-panel apple-transition shadow-sm flex items-center gap-2 font-bold text-ink"
          >
            <ArrowLeftRight className="w-5 h-5 text-ink-muted" />
            {t("settings.back")}
          </button>
        </header>

        {/* Plan + usage, always visible above every settings tab. */}
        <PlanSummary />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Navigation / Categories */}
          <div className="space-y-2 flex-col flex overflow-y-auto">
            {[
              {
                id: "organization",
                label: t("settings.tabOrganization"),
                icon: LayoutDashboard,
              },
              { id: "team", label: t("settings.tabTeam"), icon: Users },
              { id: "telegram", label: t("settings.tabTelegram"), icon: TelegramLogo },
              ...(SUPER_ADMIN_EMAILS.includes((currentUser?.email || "").toLowerCase())
                ? [{ id: "operator", label: t("settings.tabOperator"), icon: Shield }]
                : []),
              { id: "appearance", label: t("settings.tabAppearance"), icon: Monitor },
              { id: "privacy", label: t("settings.tabPrivacy"), icon: LockKey },
              {
                id: "enterprise",
                label: t("settings.tabEnterprise"),
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
                <h3 className="text-xl font-bold text-ink mb-1">{t("settings.tabTelegram")}</h3>
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
                  {L("Default Organization","இயல்புநிலை நிறுவனம்")}
                </h3>

                {!orgId && !setupDone && (
                  <div className="mb-6 p-5 rounded-2xl border border-primary/40 bg-primary/10">
                    <div className="flex items-start gap-3">
                      <Shield className="w-5 h-5 text-[#B85F3B] shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="font-bold text-ink">{L("Set up your organization","உங்கள் நிறுவனத்தை அமைக்கவும்")}</div>
                        <p className="text-sm text-ink-muted mt-1">
                          {L("Your data isn't linked to an organization yet, so it can't be secured per-tenant. This one-time step creates your organization, moves a copy of your existing data under it, and makes you the Owner. Your current data is left untouched as a backup.","உங்கள் தரவு இன்னும் ஒரு நிறுவனத்துடன் இணைக்கப்படவில்லை, எனவே அதை பாதுகாக்க முடியாது. இந்த ஒரு-முறை படி உங்கள் நிறுவனத்தை உருவாக்கி, உங்கள் தற்போதைய தரவின் நகலை அதன் கீழ் நகர்த்தி, உங்களை உரிமையாளராக்குகிறது. உங்கள் தற்போதைய தரவு காப்புப்பிரதியாக அப்படியே விடப்படும்.")}
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
                              setSetupError(e?.message || L("Couldn't set up the organization.","நிறுவனத்தை அமைக்க முடியவில்லை."));
                            } finally {
                              setSettingUp(false);
                            }
                          }}
                          disabled={settingUp}
                          className="mt-3 px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-[#B85F3B] transition-colors disabled:opacity-50"
                        >
                          {settingUp ? L("Setting up… (may take a minute)","அமைக்கிறது… (ஒரு நிமிடம் ஆகலாம்)") : L("Set up organization & migrate data","நிறுவனத்தை அமைத்து தரவை நகர்த்து")}
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
                        <div className="font-bold text-ink">{L("Organization created","நிறுவனம் உருவாக்கப்பட்டது")}</div>
                        <p className="text-sm text-ink-muted mt-1">
                          {L("Migrated", "நகர்த்தப்பட்டது")} {setupDone.projects} {L("project(s) (", "செயல்திட்டம் (")}{setupDone.docs} {L("records) and made you the Owner. Final step: run the", "பதிவுகள்) மற்றும் உங்களை உரிமையாளராக்கியது. இறுதிப் படி: குத்தகைதாரர் தனிமைப்படுத்தலை இயக்க GitHub இல்")} <b>“Deploy Firestore Rules”</b> {L("action on GitHub to switch on tenant isolation. You may need to reload the app.", "செயலை இயக்கவும். பயன்பாட்டை மீண்டும் ஏற்ற வேண்டியிருக்கலாம்.")}
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
                        <div className="font-bold text-ink">{L("Secure this organization","இந்த நிறுவனத்தைப் பாதுகாக்கவும்")}</div>
                        <p className="text-sm text-ink-muted mt-1">
                          {L("Claim ownership so only your team can access this organization's data. Do this once, then deploy the updated security rules.","உங்கள் அணி மட்டுமே இந்த நிறுவனத்தின் தரவை அணுகும்படி உரிமையைக் கோரவும். இதை ஒருமுறை செய்து, பின்னர் புதுப்பிக்கப்பட்ட பாதுகாப்பு விதிகளைப் பயன்படுத்தவும்.")}
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
                              setClaimError(e?.message || L("Couldn't claim the organization.","நிறுவனத்தைக் கோர முடியவில்லை."));
                            } finally {
                              setClaiming(false);
                            }
                          }}
                          disabled={claiming}
                          className="mt-3 px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-[#B85F3B] transition-colors disabled:opacity-50"
                        >
                          {claiming ? L("Claiming…","கோருகிறது…") : L("Claim organization","நிறுவனத்தைக் கோரு")}
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
                        ? L("Organization secured — access is limited to its members.","நிறுவனம் பாதுகாக்கப்பட்டது — அணுகல் அதன் உறுப்பினர்களுக்கு மட்டுமே.")
                        : L("This organization is owned by another account.","இந்த நிறுவனம் மற்றொரு கணக்கால் சொந்தமானது.")}
                    </span>
                  </div>
                )}

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-ink mb-2">
                      {L("Company Name","நிறுவனப் பெயர்")}
                    </label>
                    {isEditingCompany ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          className="w-full bg-surface border border-[#C8D1D3] px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-ink"
                          placeholder={t("settings.enterCompanyName")}
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
                          {L("Save","சேமி")}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between bg-surface border border-[#C8D1D3] px-4 py-3 rounded-xl">
                        <span className="text-ink font-semibold">
                          {companyName || L("No Company Name Set","நிறுவனப் பெயர் அமைக்கப்படவில்லை")}
                        </span>
                        <button
                          onClick={() => {
                            setDraftCompanyName(companyName);
                            setIsEditingCompany(true);
                          }}
                          className="text-ink-muted hover:text-primary transition-colors flex items-center gap-2 text-sm font-bold"
                        >
                          <Edit2 className="w-4 h-4" /> {L("Edit","திருத்து")}
                        </button>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-ink mb-2">
                      {L("Company GSTIN","நிறுவன GSTIN")}
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
                      {L("Used to validate vendor invoices and split CGST/SGST vs IGST.","சப்ளையர் விலைப்பட்டியல்களைச் சரிபார்க்கவும், CGST/SGST vs IGST ஐப் பிரிக்கவும் பயன்படுகிறது.")}
                      {draftGstin.length >= 2 && ` ${L("State code","மாநிலக் குறியீடு")}: ${draftGstin.slice(0, 2)}.`}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-ink mb-2">
                      {L("Base Currency","அடிப்படை நாணயம்")}
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
                          target.innerHTML = L("Saved!","சேமிக்கப்பட்டது!");
                        } catch {
                          target.innerHTML = L("Save failed","சேமிப்பு தோல்வி");
                        }
                        setTimeout(() => {
                          target.innerHTML = originalText;
                        }, 2000);
                      }}
                      className="bg-primary text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-[#B85F3B] transition-colors apple-transition active:scale-95"
                    >
                      <Save className="w-5 h-5" /> {L("Save Configuration","அமைப்பைச் சேமி")}
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
                    <h4 className="font-bold text-ink mb-4">{t("settings.uiWorkMode")}</h4>
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
                    <h4 className="font-bold text-ink mb-4">{t("settings.displayMode")}</h4>
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
