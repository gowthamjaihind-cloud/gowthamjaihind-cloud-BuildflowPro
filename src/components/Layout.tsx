import React, { useState } from "react";
import {
  LayoutDashboard,
  ListTree,
  Package,
  IndianRupee,
  FileText,
  Menu,
  X,
  Construction,
  Users,
  Truck,
  ClipboardCheck,
  ArrowLeftRight,
  MoreHorizontal,
  Plus,
  HardHat,
  TestTube,
  Calculator,
  CheckCircle2
} from "lucide-react";
import { BotStatusIndicator } from "./BotStatusIndicator";
import { SyncStatus } from "./SyncStatus";
import { useAuthStore, useUIStore, useProjectStore } from "../store";

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);

  const user = useAuthStore((state) => state.user);
  const activeTab = useUIStore((state) => state.activeTab);
  const setActiveTab = useUIStore((state) => state.setActiveTab);
  const uiMode = useUIStore((state) => state.uiMode);

  const activeProject = useProjectStore((state) => state.activeProject);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);
  const updateProjectStatus = useProjectStore(
    (state) => state.updateProjectStatus,
  );

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "wbs", label: "WBS", icon: ListTree },
    { id: "dailylogs", label: "Daily Logs", icon: CheckCircle2 },
    { id: "labor", label: "Labor & Billing", icon: Users },
    { id: "inventory", label: "Inventory", icon: Package },
    { id: "procurement", label: "Procurement", icon: Truck },
    { id: "consumption", label: "Consumption History", icon: ClipboardCheck },
    { id: "costs", label: "Cost Management", icon: IndianRupee },
    { id: "estimates", label: "Client Estimates", icon: Calculator },
    { id: "reports", label: "Reports", icon: FileText },
    { id: "documents", label: "Document Vault", icon: FileText },
  ];

  // Mobile Bottom Nav items (first 4 items + More)
  const bottomNavItems = menuItems.slice(0, 4);

  const SidebarContent = ({ showLabels = true }) => (
    <div className="flex flex-col h-full">
      <div className={`p-6 md:p-10 flex items-center gap-4 shrink-0 transition-all duration-500 ${uiMode === 'site' ? 'hidden sm:flex' : ''}`}>
        <div className="bg-primary p-2 md:p-3 rounded-[12px] md:rounded-[16px] shadow-2xl shadow-[#007AFF]/30 flex items-center justify-center">
          <Construction
            className="w-5 h-5 md:w-6 md:h-6 text-white"
            strokeWidth={2}
          />
        </div>
        {showLabels && (
          <span className="font-display font-bold text-2xl md:text-3xl tracking-tighter text-ink">
            BuildFlow
          </span>
        )}
      </div>

      <nav className={`flex-1 space-y-1.5 md:space-y-2 overflow-y-auto mt-2 md:mt-6 scrollbar-hide ${uiMode === 'site' ? 'pt-8' : ''} ${showLabels ? 'px-4 md:px-6' : 'px-2 md:px-3'}`}>
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setActiveTab(item.id);
              setIsMobileMenuOpen(false);
            }}
            className={`flex items-center apple-transition group ${
              showLabels
                ? "w-full gap-4 md:gap-5 px-4 md:px-5 py-3 md:py-4"
                : "w-12 h-12 md:w-14 md:h-14 mx-auto justify-center"
            } rounded-[14px] md:rounded-[18px] ${
              activeTab === item.id
                ? "bg-primary text-white shadow-xl shadow-[#007AFF]/20 ring-1 ring-primary/50"
                : "text-ink-muted hover:text-ink hover:bg-surface/40"
            } ${uiMode === 'site' ? (showLabels ? '!py-3 !rounded-lg' : '!rounded-lg') : ''}`}
          >
            <item.icon
              className={`w-5 h-5 md:w-6 md:h-6 shrink-0 apple-transition transform ${activeTab === item.id ? "text-white" : "group-hover:text-primary"}`}
              strokeWidth={1.5}
            />
            {showLabels && (
              <span className={`font-semibold text-[15px] md:text-[17px] tracking-tight truncate ${uiMode === 'site' ? '!text-sm' : ''}`}>
                {item.label}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="p-6 md:p-8 shrink-0 mt-auto">
        <div className={`apple-glass rounded-[16px] md:rounded-[24px] p-4 md:p-6 ${uiMode === 'site' ? '!bg-transparent !p-2 !shadow-none' : ''}`}>
          {user && showLabels && (
            <div className="flex items-center gap-3 md:gap-4">
              <div className="relative">
                <img
                  src={
                    user.photoURL ||
                    `https://ui-avatars.com/api/?name=${user.displayName}`
                  }
                  className={`w-10 h-10 md:w-12 md:h-12 rounded-[12px] md:rounded-[16px] object-cover shadow-2xl ${uiMode === 'site' ? '!rounded-full' : ''}`}
                  alt=""
                />
                <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 md:w-4 md:h-4 bg-[#34C759] border-2 border-white rounded-full shadow-sm" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate text-ink text-[15px] md:text-[17px] tracking-tight">
                  {user.displayName}
                </div>
                <div className="text-[11px] md:text-[13px] font-medium text-ink-muted uppercase tracking-widest mt-0.5">
                  {user.role}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className={`h-[100dvh] bg-panel sm:min-h-screen flex text-ink font-sans relative overflow-hidden sm:p-4 md:p-6 gap-0 sm:gap-4 lg:gap-6 ${uiMode === 'site' ? '!p-0 !gap-0 !bg-white' : ''}`}>
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex apple-glass rounded-[32px] transition-all duration-700 ease-[cubic-bezier(0.2,0,0,1)] flex-col shadow-2xl relative z-20 ${isSidebarOpen ? "w-[280px] xl:w-80" : "w-24 overflow-hidden"} ${uiMode === 'site' ? '!rounded-none !shadow-none border-r border-[#E5E5EA] !bg-surface' : ''}`}
      >
        <SidebarContent showLabels={isSidebarOpen} />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-md z-[100] lg:hidden animate-in fade-in duration-300"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Drawer (Only for More menu) */}
      <aside
        className={`fixed inset-y-0 left-0 w-72 bg-page/95 backdrop-blur-2xl z-[101] flex flex-col shadow-2xl transition-all duration-500 ease-[cubic-bezier(0.2,0,0,1)] transform lg:hidden ${
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent showLabels={true} />
      </aside>

      {/* Main Content */}
      <main className={`flex-1 flex flex-col min-w-0 h-full sm:h-[calc(100vh-32px)] md:h-[calc(100vh-48px)] ${uiMode === 'site' ? '!h-[100dvh] pb-16 lg:pb-0' : ''}`}>
        {/* Top Bar Navigation */}
        <header className={`bg-surface/80 sm:bg-transparent sm:apple-glass border-b border-black/5 sm:border-0 rounded-none sm:rounded-[24px] px-4 py-3 sm:px-6 sm:py-4 lg:px-8 lg:py-5 flex items-center justify-between z-20 shrink-0 ${uiMode === 'site' ? '!rounded-none !bg-white !border-b !border-[#E5E5EA] !py-3' : ''}`}>
          <div className="flex items-center gap-3 sm:gap-5">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={`hidden lg:block p-2 sm:p-3 hover:bg-surface/40 rounded-[10px] sm:rounded-[12px] apple-transition active:scale-95 ${uiMode === 'site' ? '!p-2' : ''}`}
            >
              {isSidebarOpen ? (
                <X className="w-5 h-5 sm:w-6 sm:h-6 text-ink-muted" />
              ) : (
                <Menu className="w-5 h-5 sm:w-6 sm:h-6 text-ink-muted" />
              )}
            </button>
            <div className={`hidden sm:block h-6 w-px bg-surface/30 mx-1 lg:mx-2 ${uiMode === 'site' ? '!bg-[#E5E5EA]' : ''}`} />
            <div className="min-w-0 flex items-center gap-3 sm:gap-4">
              <div>
                <h1 className={`font-bold text-lg sm:text-xl tracking-tight text-ink truncate ${uiMode === 'site' ? '!text-lg' : ''}`}>
                  {activeProject?.name || "Portfolio"}
                </h1>
                <div className="hidden sm:block text-[10px] font-black text-primary uppercase tracking-widest mt-0.5">
                  {uiMode === 'site' ? "Site Mode Live" : "Control Center"}
                </div>
              </div>
              {activeProject?.status && (
                <div className="hidden sm:block">
                  <select
                    value={activeProject.status}
                    onChange={(e) =>
                      updateProjectStatus(activeProject.id, e.target.value)
                    }
                    className="text-[11px] sm:text-xs font-bold bg-surface/50 border border-white/20 text-ink rounded-md sm:rounded-lg px-2 py-1 sm:px-3 sm:py-1.5 outline-none apple-transition hover:bg-surface focus:bg-surface"
                  >
                    <option value="Planning">Planning</option>
                    <option value="Active">Active</option>
                    <option value="On Hold">On Hold</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <BotStatusIndicator />
            <div className="hidden md:flex">
              <SyncStatus />
            </div>
            <button
              onClick={() => setActiveProject(null)}
              className="flex items-center justify-center w-9 h-9 sm:w-auto sm:px-3 sm:py-2 md:px-4 md:py-2.5 sm:gap-2 rounded-full sm:rounded-[12px] md:rounded-[14px] apple-transition active:scale-95 border border-black/5 bg-black/5 sm:bg-surface/40 sm:hover:bg-surface text-ink-muted sm:hover:text-ink sm:border-white/60 shadow-none sm:shadow-sm"
              title="Switch Project"
            >
              <ArrowLeftRight
                className="w-4 h-4 sm:w-5 sm:h-5"
                strokeWidth={2}
              />
              <span className="hidden sm:inline-block font-bold text-[13px] md:text-[14px] tracking-tight">
                Switch
              </span>
            </button>
          </div>
        </header>

        {/* Dynamic Content Surface */}
        <div className="flex-1 overflow-y-auto scroll-smooth pb-20 sm:pb-4 px-3 sm:px-0 mt-3 sm:mt-4 lg:mt-6 -mx-3 sm:mx-0">
          <div className="space-y-4 sm:space-y-6 lg:space-y-10 px-3 sm:px-0">
            {children}
          </div>
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className={`fixed lg:hidden bottom-0 left-0 right-0 bg-surface/90 backdrop-blur-xl border-t border-black/5 pb-[env(safe-area-inset-bottom)] pt-2 px-2 z-[60] flex justify-around items-center ${uiMode === 'site' ? '!bg-white !border-[#E5E5EA]' : ''}`}>
          {bottomNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className="flex flex-col items-center justify-center w-16 h-12 relative gap-1"
            >
              <item.icon
                className={`w-5 h-5 sm:w-6 sm:h-6 ${activeTab === item.id ? "text-primary" : "text-ink-muted"}`}
                strokeWidth={activeTab === item.id ? 2.5 : 1.5}
              />
              <span
                className={`text-[10px] font-medium leading-none ${activeTab === item.id ? "text-primary" : "text-ink-muted"}`}
              >
                {item.label.split(" ")[0]}
              </span>
            </button>
          ))}
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="flex flex-col items-center justify-center w-16 h-12 relative gap-1"
          >
            <MoreHorizontal
              className="w-5 h-5 sm:w-6 sm:h-6 text-ink-muted"
              strokeWidth={1.5}
            />
            <span className="text-[10px] font-medium leading-none text-ink-muted">
              More
            </span>
          </button>
        </nav>

        {/* Site Mode Global FAB (Mobile Only) */}
        {uiMode === 'site' && (
          <div className="fixed bottom-24 right-4 z-[70] lg:hidden flex flex-col items-end gap-3">
            {isFabOpen && (
              <div className="flex flex-col gap-3 animate-in slide-in-from-bottom-5">
                <button 
                  onClick={() => { setActiveTab('dailylogs'); setIsFabOpen(false); }}
                  className="bg-white border shadow-lg rounded-full px-4 py-3 flex items-center gap-3 text-sm font-bold text-ink"
                >
                  <ClipboardCheck className="w-5 h-5 text-primary" />
                  New DPR Entry
                </button>
              </div>
            )}
            <button
              onClick={() => setIsFabOpen(!isFabOpen)}
              className={`w-14 h-14 rounded-full flex items-center justify-center shadow-xl shadow-primary/30 text-white transition-transform ${isFabOpen ? 'bg-ink rotate-45' : 'bg-primary'}`}
            >
              <Plus className="w-7 h-7" />
            </button>
          </div>
        )}
      </main>
    </div>
  );
};
