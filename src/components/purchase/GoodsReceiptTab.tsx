import React, { useState } from "react";
import { useProjectData } from "../../hooks/useProjectData";
import { GoodsReceiptNote } from "../../types";
import { Search } from "lucide-react";
import { GoodsReceiptDetails } from "./GoodsReceiptDetails";

interface GoodsReceiptTabProps {
  projectId: string;
}

export const GoodsReceiptTab: React.FC<GoodsReceiptTabProps> = ({ projectId }) => {
  const { data: grns = [], isLoading } = useProjectData<GoodsReceiptNote>(projectId, "goodsReceiptNotes", "createdAt", "desc");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGRN, setSelectedGRN] = useState<GoodsReceiptNote | null>(null);

  if (isLoading) {
    return <div className="p-8 text-center text-ink-muted">Loading goods receipt notes...</div>;
  }

  const filteredGRNs = grns.filter(g => 
    g.grnNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
    g.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
    g.vendorName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="relative flex-1 md:w-64">
           <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
           <input
             type="text"
             placeholder="Search GRNs..."
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
             className="w-full pl-9 pr-4 py-2 bg-surface text-ink text-sm rounded-xl border border-divider focus:border-[#A3711C] focus:ring-1 focus:ring-[#A3711C] transition-colors"
           />
        </div>
      </div>

      <div className="bg-surface rounded-2xl border border-divider overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
             <thead>
                <tr className="bg-panel border-b border-divider">
                  <th className="p-4 text-[10px] font-bold text-ink-muted uppercase tracking-widest whitespace-nowrap">GRN Number</th>
                  <th className="p-4 text-[10px] font-bold text-ink-muted uppercase tracking-widest whitespace-nowrap">Date</th>
                  <th className="p-4 text-[10px] font-bold text-ink-muted uppercase tracking-widest whitespace-nowrap">PO Number</th>
                  <th className="p-4 text-[10px] font-bold text-ink-muted uppercase tracking-widest whitespace-nowrap">Vendor</th>
                  <th className="p-4 text-[10px] font-bold text-ink-muted uppercase tracking-widest whitespace-nowrap">Recorded By</th>
                </tr>
             </thead>
             <tbody>
                {filteredGRNs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-ink-muted text-sm border-b border-divider/50">
                      No GRNs found.
                    </td>
                  </tr>
                ) : (
                  filteredGRNs.map(grn => (
                    <tr 
                      key={grn.id} 
                      onClick={() => setSelectedGRN(grn)}
                      className="border-b border-divider/50 hover:bg-[#F3E8D2]/30 transition cursor-pointer group"
                    >
                      <td className="p-4 align-middle">
                        <div className="font-mono text-xs font-bold text-ink group-hover:text-[#A3711C] transition-colors">
                          {grn.grnNumber}
                        </div>
                      </td>
                      <td className="p-4 align-middle text-sm text-ink-muted">
                        {grn.receiptDate}
                      </td>
                      <td className="p-4 align-middle text-sm text-ink-muted font-mono font-medium">
                        {grn.poNumber}
                      </td>
                      <td className="p-4 align-middle">
                        <div className="text-sm font-semibold text-ink">{grn.vendorName}</div>
                      </td>
                      <td className="p-4 align-middle">
                        <div className="text-sm text-ink-muted">{grn.createdByName}</div>
                      </td>
                    </tr>
                  ))
                )}
             </tbody>
          </table>
        </div>
      </div>

      {selectedGRN && (
        <GoodsReceiptDetails 
           grn={selectedGRN}
           projectId={projectId}
           onClose={() => setSelectedGRN(null)}
        />
      )}
    </div>
  );
};
