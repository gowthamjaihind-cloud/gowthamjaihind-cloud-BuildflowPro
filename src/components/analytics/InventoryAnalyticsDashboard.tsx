import React, { useState, useMemo } from "react";
import { useProjectDataQuery } from "../../hooks/queries";
import { InventoryItem } from "../../types";
import { useUIStore } from "../../store";
import { useTranslation } from "../../i18n";
import { Package, Warning } from "@phosphor-icons/react";
import { inr, inrCompact, StatTile, RankedBars } from "./shared";

type ViewId = "stock" | "consumption" | "low";

export const InventoryAnalyticsDashboard: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { t } = useTranslation();
  const dark = useUIStore((s) => s.darkMode);
  const { data: items = [] } = useProjectDataQuery<InventoryItem>(projectId, "inventory");
  const [view, setView] = useState<ViewId>("stock");
  const bar = dark ? "#2A86C4" : "#0F79B8";

  const { stockValue, itemsCount, lowCount, consumedValue, stockRows, consRows, lowRows } = useMemo(() => {
    let stockValue = 0, consumedValue = 0, lowCount = 0;
    const stockRows: { name: string; value: number }[] = [];
    const consRows: { name: string; value: number }[] = [];
    const lowRows: InventoryItem[] = [];
    for (const it of items as InventoryItem[]) {
      const cost = it.unitCost || it.avgUnitCost || 0;
      const sv = (it.quantity || 0) * cost;
      const cv = (it.consumed || 0) * cost;
      stockValue += sv; consumedValue += cv;
      if (sv > 0) stockRows.push({ name: it.name, value: Math.round(sv) });
      if (cv > 0) consRows.push({ name: it.name, value: Math.round(cv) });
      if ((it.minThreshold || 0) > 0 && (it.quantity || 0) <= it.minThreshold) { lowCount++; lowRows.push(it); }
    }
    stockRows.sort((a, b) => b.value - a.value);
    consRows.sort((a, b) => b.value - a.value);
    return {
      stockValue, itemsCount: (items as InventoryItem[]).length, lowCount, consumedValue,
      stockRows: stockRows.slice(0, 10), consRows: consRows.slice(0, 10), lowRows,
    };
  }, [items]);

  if ((items as InventoryItem[]).length === 0) {
    return (
      <div className="soft-card rounded-2xl p-10 text-center text-ink-muted">
        <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-bold">{t("an.noInventory")}</p>
      </div>
    );
  }

  const views: { id: ViewId; label: string }[] = [
    { id: "stock", label: t("an.viewStockValue") },
    { id: "consumption", label: t("an.viewConsumption") },
    { id: "low", label: t("an.viewLowStock") },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-primary/10 text-primary rounded-xl"><Package weight="fill" className="w-5 h-5" /></div>
        <div>
          <h3 className="text-lg font-black text-ink tracking-tight">{t("an.inventoryTitle")}</h3>
          <p className="text-xs text-ink-muted font-medium">{t("an.inventorySubtitle")}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatTile label={t("an.stockValue")} value={inr(stockValue)} />
        <StatTile label={t("an.items")} value={String(itemsCount)} />
        <StatTile label={t("an.consumedValue")} value={inr(consumedValue)} />
        <StatTile label={t("an.lowStock")} value={String(lowCount)} tone={lowCount > 0 ? "danger" : "success"} />
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
        {views.map((v) => (
          <button key={v.id} onClick={() => setView(v.id)}
            className={`px-3.5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest whitespace-nowrap apple-transition shrink-0 ${
              view === v.id ? "bg-primary text-white shadow-sm" : "bg-panel border border-divider text-ink-muted hover:text-ink"}`}>
            {v.label}
          </button>
        ))}
      </div>

      <div className="soft-card rounded-2xl p-4 md:p-6 space-y-4">
        {view === "stock" && (
          <>
            <h4 className="text-xs font-black uppercase tracking-widest text-ink-muted">{t("an.stockValueTitle")}</h4>
            {stockRows.length ? <RankedBars rows={stockRows} color={bar} format={inrCompact} /> : <Empty t={t} />}
          </>
        )}
        {view === "consumption" && (
          <>
            <h4 className="text-xs font-black uppercase tracking-widest text-ink-muted">{t("an.consumptionTitle")}</h4>
            {consRows.length ? <RankedBars rows={consRows} color={bar} format={inrCompact} /> : <Empty t={t} />}
          </>
        )}
        {view === "low" && (
          <>
            <h4 className="text-xs font-black uppercase tracking-widest text-ink-muted">{t("an.lowStockTitle")}</h4>
            {lowRows.length ? (
              <div className="space-y-2">
                {lowRows.map((it) => (
                  <div key={it.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-danger/8">
                    <Warning className="w-4 h-4 text-danger shrink-0" />
                    <span className="flex-1 text-sm font-bold text-ink truncate">{it.name}</span>
                    <span className="text-xs font-mono font-bold text-danger">{it.quantity} / {it.minThreshold} {it.unit}</span>
                  </div>
                ))}
              </div>
            ) : <div className="py-6 text-center text-ink-muted text-sm font-bold">{t("an.allStocked")}</div>}
          </>
        )}
      </div>
    </div>
  );
};

const Empty: React.FC<{ t: any }> = ({ t }) => (
  <div className="py-6 text-center text-ink-muted text-sm font-bold">{t("an.noInventory")}</div>
);
