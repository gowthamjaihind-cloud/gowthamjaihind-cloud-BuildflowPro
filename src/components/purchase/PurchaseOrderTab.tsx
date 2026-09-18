import React, { useState } from "react";
import { useProjectData } from "../../hooks/useProjectData";
import { PurchaseOrder } from "../../types";
import {
  FileText,
  Plus,
  MagnifyingGlass as Search,
  Funnel as Filter,
} from "@phosphor-icons/react";
import { PurchaseOrderForm } from "./PurchaseOrderForm";
import { PurchaseOrderDetails } from "./PurchaseOrderDetails";
import { format } from "date-fns";
import { Receipt } from "@phosphor-icons/react";
import { EmptyState } from "../EmptyState";

import { useTranslation } from "../../i18n";
interface PurchaseOrderTabProps {
  projectId: string;
}

export const PurchaseOrderTab: React.FC<PurchaseOrderTabProps> = ({ projectId }) => {
  const { t } = useTranslation();
  const { data: pos = [], isLoading } = useProjectData<PurchaseOrder>(projectId, "purchase_orders", "createdAt", "desc");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null);

  if (isLoading) {
    return <div className="p-8 text-center text-ink-muted">Loading purchase orders...</div>;
  }

  const filteredPOs = pos.filter(po => {
    const matchesSearch = po.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          po.vendorName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "All" || po.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4 w-full md:w-auto">
           <div className="relative flex-1 md:w-64">
             <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
             <input
               type="text"
               placeholder="Search POs..."
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="w-full pl-9 pr-4 py-2 bg-surface text-ink text-sm rounded-xl border border-divider focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
             />
           </div>
           <select
             value={statusFilter}
             onChange={(e) => setStatusFilter(e.target.value)}
             className="px-4 py-2 bg-surface text-ink text-sm rounded-xl border border-divider focus:border-primary transition-colors appearance-none pr-8 cursor-pointer relative"
           >
             <option value="All">All Statuses</option>
             <option value="Draft">Draft</option>
             <option value="Approved">Approved</option>
             <option value="Partially Received">Partially Received</option>
             <option value="Closed">Closed</option>
           </select>
        </div>
        
        <button
          onClick={() => setIsFormOpen(true)}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-deep text-on-primary text-xs font-bold uppercase tracking-widest rounded-xl transition"
        >
          <Plus className="w-4 h-4" /> New PO
        </button>
      </div>

      <div className="bg-surface rounded-2xl border border-divider overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
             <thead>
                <tr className="bg-panel border-b border-divider">
                  <th className="p-4 text-[10px] font-bold text-ink-muted uppercase tracking-widest whitespace-nowrap">PO Number</th>
                  <th className="p-4 text-[10px] font-bold text-ink-muted uppercase tracking-widest whitespace-nowrap">{t("common.date")}</th>
                  <th className="p-4 text-[10px] font-bold text-ink-muted uppercase tracking-widest whitespace-nowrap">Vendor</th>
                  <th className="p-4 text-[10px] font-bold text-ink-muted uppercase tracking-widest text-right whitespace-nowrap">Amount</th>
                  <th className="p-4 text-[10px] font-bold text-ink-muted uppercase tracking-widest whitespace-nowrap">{t("common.status")}</th>
                </tr>
             </thead>
             <tbody>
                {pos.length === 0 ? (
                  <EmptyState
                    colSpan={5}
                    icon={Receipt}
                    title="No purchase orders yet"
                    body="Raise a PO to record what was ordered, from whom, and at what rate."
                  />
                ) : filteredPOs.length === 0 ? (
                  <EmptyState
                    colSpan={5}
                    icon={Receipt}
                    variant="filtered"
                    title="No orders match"
                    body="Nothing matches your search or status filter."
                    action={{
                      label: "Clear filters",
                      onClick: () => {
                        setSearchTerm("");
                        setStatusFilter("All");
                      },
                    }}
                  />
                ) : (
                  filteredPOs.map(po => (
                    <tr 
                      key={po.id} 
                      onClick={() => setSelectedPO(po)}
                      className="border-b border-divider/50 hover:bg-warning/12/30 transition cursor-pointer group"
                    >
                      <td className="p-4 align-middle">
                        <div className="font-mono text-xs font-bold text-ink group-hover:text-primary transition-colors">
                          {po.poNumber}
                        </div>
                      </td>
                      <td className="p-4 align-middle text-sm text-ink-muted">
                        {po.orderDate}
                      </td>
                      <td className="p-4 align-middle">
                        <div className="text-sm font-semibold text-ink">{po.vendorName}</div>
                      </td>
                      <td className="p-4 align-middle text-right text-sm font-mono font-medium">
                        ₹{po.totalAmount.toLocaleString("en-IN")}
                      </td>
                      <td className="p-4 align-middle">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                          po.status === 'Draft' ? 'bg-page text-ink-muted' :
                          po.status === 'Approved' ? 'bg-divider text-ink-muted' :
                          po.status === 'Partially Received' ? 'bg-primary/10 text-primary' :
                          'bg-success/12 text-success'
                        }`}>
                          {po.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
             </tbody>
          </table>
        </div>
      </div>

      {(isFormOpen || editingPO) && (
        <PurchaseOrderForm
           projectId={projectId}
           existingPO={editingPO}
           onClose={() => { setIsFormOpen(false); setEditingPO(null); }}
        />
      )}

      {selectedPO && (
        <PurchaseOrderDetails
           po={selectedPO}
           projectId={projectId}
           onClose={() => setSelectedPO(null)}
           onEdit={(po) => { setSelectedPO(null); setEditingPO(po); }}
        />
      )}
    </div>
  );
};
