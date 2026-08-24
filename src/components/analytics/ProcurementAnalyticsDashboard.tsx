import React, { useState, useMemo } from "react";
import { useProjectDataQuery } from "../../hooks/queries";
import { PurchaseOrder } from "../../types";
import { useUIStore } from "../../store";
import { useTranslation } from "../../i18n";
import { Truck } from "@phosphor-icons/react";
import { inr, inrCompact, StatTile, RankedBars } from "./shared";

type ViewId = "byVendor" | "byStatus";

const poTotal = (po: PurchaseOrder) => {
  const lines = (po.lineItems || []).reduce((s, l) => s + (l.amount || 0), 0);
  const ch = po.charges ? (po.charges.loading || 0) + (po.charges.transport || 0) + (po.charges.other || 0) : 0;
  return lines + ch;
};

export const ProcurementAnalyticsDashboard: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { t } = useTranslation();
  const dark = useUIStore((s) => s.darkMode);
  const { data: pos = [] } = useProjectDataQuery<PurchaseOrder>(projectId, "purchase_orders");
  const [view, setView] = useState<ViewId>("byVendor");
  const bar = dark ? "#2A86C4" : "#0F79B8";

  const { totalValue, count, vendors, open, byVendor, byStatus } = useMemo(() => {
    const vendorAgg = new Map<string, number>();
    const statusAgg = new Map<string, number>();
    let totalValue = 0, open = 0;
    for (const po of pos as PurchaseOrder[]) {
      const v = poTotal(po);
      totalValue += v;
      if (po.status !== "Closed") open++;
      vendorAgg.set(po.vendorName || "—", (vendorAgg.get(po.vendorName || "—") || 0) + v);
      statusAgg.set(po.status || "Draft", (statusAgg.get(po.status || "Draft") || 0) + v);
    }
    const byVendor = Array.from(vendorAgg.entries()).map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value).slice(0, 10);
    const byStatus = Array.from(statusAgg.entries()).map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
    return { totalValue, count: (pos as PurchaseOrder[]).length, vendors: vendorAgg.size, open, byVendor, byStatus };
  }, [pos]);

  if ((pos as PurchaseOrder[]).length === 0) {
    return (
      <div className="soft-card rounded-2xl p-10 text-center text-ink-muted">
        <Truck className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-bold">{t("an.noProcurement")}</p>
      </div>
    );
  }

  const views: { id: ViewId; label: string }[] = [
    { id: "byVendor", label: t("an.viewByVendor") },
    { id: "byStatus", label: t("an.viewByStatus") },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-primary/10 text-primary rounded-xl"><Truck weight="fill" className="w-5 h-5" /></div>
        <div>
          <h3 className="text-lg font-black text-ink tracking-tight">{t("an.procurementTitle")}</h3>
          <p className="text-xs text-ink-muted font-medium">{t("an.procurementSubtitle")}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatTile label={t("an.poValue")} value={inr(totalValue)} />
        <StatTile label={t("an.orders")} value={String(count)} />
        <StatTile label={t("an.vendorsCount")} value={String(vendors)} />
        <StatTile label={t("an.openPos")} value={String(open)} tone={open > 0 ? "default" : "success"} />
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
        {view === "byVendor" ? (
          <>
            <h4 className="text-xs font-black uppercase tracking-widest text-ink-muted">{t("an.byVendorTitle")}</h4>
            <RankedBars rows={byVendor} color={bar} format={inrCompact} />
          </>
        ) : (
          <>
            <h4 className="text-xs font-black uppercase tracking-widest text-ink-muted">{t("an.poByStatusTitle")}</h4>
            <RankedBars rows={byStatus} color={bar} format={inrCompact} />
          </>
        )}
      </div>
    </div>
  );
};
