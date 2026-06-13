import React, { useState } from "react";
import {
  RefreshCw,
  Layout,
  Shield,
  Bell,
  ChevronRight,
  Settings,
  Info,
  CreditCard,
  Users,
  LogOut,
  ArrowLeftRight,
  Trash2,
  Send,
  LayoutDashboard,
  Save,
  Monitor,
  Edit2,
} from "lucide-react";
import { Project, UserProfile } from "../types";
import { EnterpriseAuthView } from "./EnterpriseAuthView";
import { useUIStore } from "../store";

interface SettingsViewProps {
  onBack: () => void;
  currentUser: UserProfile;
}

type SettingsSection =
  | "organization"
  | "enterprise"
  | "security"
  | "notifications"
  | "billing"
  | "team"
  | "appearance";

export const SettingsView: React.FC<SettingsViewProps> = ({
  onBack,
  currentUser,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsSection>("organization");
  const companyName = useUIStore((state) => state.companyName);
  const setCompanyName = useUIStore((state) => state.setCompanyName);
  const [isEditingCompany, setIsEditingCompany] = useState(false);
  const [draftCompanyName, setDraftCompanyName] = useState(companyName);

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
              { id: "appearance", label: "Appearance", icon: Monitor },
              {
                id: "enterprise",
                label: "Identity & Authorization",
                icon: Shield,
              },
              { id: "security", label: "Security", icon: Shield },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as SettingsSection)}
                className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl apple-transition font-semibold text-[15px] ${
                  activeTab === item.id
                    ? "bg-surface text-ink shadow-sm ring-1 ring-black/5"
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

            {activeTab === "organization" && (
              <section className="apple-glass p-8 squircle-24">
                <h3 className="text-xl font-bold text-ink mb-6">
                  Default Organization
                </h3>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-ink mb-2">
                      Company Name
                    </label>
                    {isEditingCompany ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          className="w-full bg-surface border border-[#E5E5EA] px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-ink"
                          placeholder="Enter company name"
                          value={draftCompanyName}
                          onChange={(e) => setDraftCompanyName(e.target.value)}
                        />
                        <button
                          onClick={() => {
                            setCompanyName(draftCompanyName);
                            setIsEditingCompany(false);
                          }}
                          className="px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-[#0056B3] transition-colors"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between bg-surface border border-[#E5E5EA] px-4 py-3 rounded-xl">
                        <span className="text-ink font-semibold">{companyName || "No Company Name Set"}</span>
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
                      Registration ID / GST
                    </label>
                    <input
                      type="text"
                      className="w-full bg-surface border border-[#E5E5EA] px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-ink"
                      placeholder="e.g. 29ABCDE1234F1Z5"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-ink mb-2">
                      Base Currency
                    </label>
                    <select className="w-full bg-surface border border-[#E5E5EA] px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-ink appearance-none">
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                    </select>
                  </div>
                  <div className="pt-4 border-t border-surface-dark/5">
                    <button 
                      onClick={(e) => {
                        const target = e.currentTarget;
                        const originalText = target.innerHTML;
                        target.innerHTML = "Saved!";
                        setTimeout(() => {
                           target.innerHTML = originalText;
                        }, 2000);
                      }}
                      className="bg-primary text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-[#0056B3] transition-colors apple-transition active:scale-95"
                    >
                      <Save className="w-5 h-5" /> Save Configuration
                    </button>
                  </div>
                </div>
              </section>
            )}

            {activeTab === "appearance" && (
              <section className="apple-glass p-8 squircle-24">
                <h3 className="text-xl font-bold text-ink mb-6 flex items-center gap-2">
                  <Monitor className="w-6 h-6 text-primary" /> Appearance
                </h3>
                <div className="space-y-8">
                  <div>
                    <h4 className="font-bold text-ink mb-4">UI Work Mode</h4>
                    <div className="flex gap-4">
                      <button
                        onClick={() => useUIStore.getState().setUIMode('executive')}
                        className={`flex-1 p-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
                          useUIStore.getState().uiMode === 'executive'
                            ? "border-primary ring-2 ring-primary/20 bg-surface"
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
                        onClick={() => useUIStore.getState().setUIMode('site')}
                        className={`flex-1 p-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
                          useUIStore.getState().uiMode === 'site'
                            ? "border-primary ring-2 ring-primary/20 bg-surface"
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
                    <h4 className="font-bold text-ink mb-4">Color Scheme</h4>
                    <div className="flex flex-wrap gap-4">
                      {[
                        { id: "default", color: "#007AFF", label: "Default" },
                        { id: "mint", color: "#34C759", label: "Mint" },
                        { id: "sunset", color: "#FF9500", label: "Sunset" },
                        { id: "lavender", color: "#AF52DE", label: "Lavender" },
                        { id: "rose", color: "#FF2D55", label: "Rose" },
                      ].map((scheme) => (
                        <button
                          key={scheme.id}
                          onClick={() =>
                            useUIStore.getState().setColorScheme(scheme.id)
                          }
                          className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                            useUIStore.getState().colorScheme === scheme.id
                              ? "border-primary ring-2 ring-primary/20 bg-surface"
                              : "border-divider bg-panel hover:bg-surface"
                          }`}
                        >
                          <div
                            className="w-8 h-8 rounded-full shadow-sm"
                            style={{ backgroundColor: scheme.color }}
                          ></div>
                          <span className="text-xs font-semibold text-ink">
                            {scheme.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-ink mb-4">Display Mode</h4>
                    <div className="flex gap-4">
                      <button
                        onClick={() => useUIStore.getState().setDarkMode(false)}
                        className={`flex-1 p-4 rounded-xl border flex items-center justify-center gap-3 transition-all ${
                          !useUIStore.getState().darkMode
                            ? "border-primary ring-2 ring-primary/20 bg-surface"
                            : "border-divider bg-panel hover:bg-surface"
                        }`}
                      >
                        <div className="w-5 h-5 rounded-full border border-divider bg-surface shadow-inner"></div>
                        <span className="font-semibold text-ink">
                          Light Mode
                        </span>
                      </button>
                      <button
                        onClick={() => useUIStore.getState().setDarkMode(true)}
                        className={`flex-1 p-4 rounded-xl border flex items-center justify-center gap-3 transition-all ${
                          useUIStore.getState().darkMode
                            ? "border-primary ring-2 ring-primary/20 bg-surface"
                            : "border-divider bg-panel hover:bg-surface"
                        }`}
                      >
                        <div className="w-5 h-5 rounded-full border border-slate-700 bg-slate-900 shadow-inner"></div>
                        <span className="font-semibold text-ink">
                          Dark Mode
                        </span>
                      </button>
                    </div>
                  </div>


                </div>
              </section>
            )}

            {activeTab === "security" && (
              <section className="apple-glass p-8 squircle-24">
                <h3 className="text-xl font-bold text-ink mb-6 flex items-center gap-2">
                  <Shield className="w-6 h-6 text-[#5856D6]" /> Security
                  Protocols
                </h3>
                <div className="space-y-6">
                  <div className="bg-surface p-6 rounded-[20px] flex items-center justify-between shadow-sm border border-divider">
                    <div>
                      <div className="font-bold text-ink">
                        Two-Factor Authentication (2FA)
                      </div>
                      <div className="text-sm text-ink-muted">
                        Require 2FA for all administrative accounts
                      </div>
                    </div>
                    <div className="w-12 h-6 bg-[#34C759] rounded-full relative cursor-pointer">
                      <div className="absolute right-1 top-1 w-4 h-4 bg-surface rounded-full"></div>
                    </div>
                  </div>
                  <div className="bg-surface p-6 rounded-[20px] flex items-center justify-between shadow-sm border border-divider">
                    <div>
                      <div className="font-bold text-ink">Session Timeout</div>
                      <div className="text-sm text-ink-muted">
                        Automatically log out inactive users
                      </div>
                    </div>
                    <select className="bg-panel border border-divider px-3 py-1.5 rounded-lg text-sm font-medium">
                      <option>15 Minutes</option>
                      <option>1 Hour</option>
                      <option>4 Hours</option>
                    </select>
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
