import React, { useState } from "react";
import {
  CurrencyInr,
  Users,
  Truck,
  Package,
  ChartBar,
  Sparkle,
} from "@phosphor-icons/react";
import { useTranslation } from "../../i18n";
import { CostAnalyticsDashboard } from "./CostAnalyticsDashboard";
import { LaborAnalyticsDashboard } from "./LaborAnalyticsDashboard";

interface AnalyticsTabsProps {
  projectId: string;
}

type ModuleId = "cost" | "labor" | "procurement" | "inventory" | "progress";

/**
 * Tabbed visual-analytics surface. Cost is fully implemented as the first
 * module; the rest are placeholders that follow the same pattern and will be
 * filled in next. Reused on both the Dashboard tab and the AI Insights tab.
 */
export const AnalyticsTabs: React.FC<AnalyticsTabsProps> = ({ projectId }) => {
  const { t } = useTranslation();
  const [active, setActive] = useState<ModuleId>("cost");

  const modules: { id: ModuleId; label: string; icon: React.ElementType; ready: boolean }[] = [
    { id: "cost", label: t("an.moduleCost"), icon: CurrencyInr, ready: true },
    { id: "labor", label: t("an.moduleLabor"), icon: Users, ready: true },
    { id: "procurement", label: t("an.moduleProcurement"), icon: Truck, ready: false },
    { id: "inventory", label: t("an.moduleInventory"), icon: Package, ready: false },
    { id: "progress", label: t("an.moduleProgress"), icon: ChartBar, ready: false },
  ];

  return (
    <div className="space-y-5">
      {/* Module tab bar */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
        {modules.map((m) => (
          <button
            key={m.id}
            onClick={() => setActive(m.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest whitespace-nowrap apple-transition shrink-0 ${
              active === m.id
                ? "bg-primary text-white shadow-md shadow-primary/20"
                : "bg-panel border border-divider text-ink-muted hover:text-ink"
            }`}
          >
            <m.icon className="w-4 h-4" weight={active === m.id ? "fill" : "regular"} />
            {m.label}
          </button>
        ))}
      </div>

      {active === "cost" && <CostAnalyticsDashboard projectId={projectId} />}
      {active === "labor" && <LaborAnalyticsDashboard projectId={projectId} />}

      {active !== "cost" && active !== "labor" && (
        <div className="soft-card rounded-2xl p-12 text-center text-ink-muted">
          <Sparkle className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-bold">
            {modules.find((m) => m.id === active)?.label} — {t("an.comingSoon")}
          </p>
        </div>
      )}
    </div>
  );
};
