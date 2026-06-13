import React, { useState, useMemo } from "react";
import { motion } from "motion/react";
import { Plus, Search, FileText, FileCheck, FileX, Send, Download, Calculator, CheckCircle2, ChevronRight, CalculatorIcon, ArrowLeft, Trash2, Link } from "lucide-react";
import { ClientEstimate, EstimateLineItem, Task } from "../types";
import { useTasksQuery } from "../hooks/queries";

interface EstimateTrackerViewProps {
  projectId: string;
}

export const EstimateTrackerView: React.FC<EstimateTrackerViewProps> = ({ projectId }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  // Mock data for estimates
  const [estimates, setEstimates] = useState<ClientEstimate[]>([
    {
      id: "est-1",
      projectId,
      estimateNumber: "EST-001",
      dateCreated: new Date().toISOString().split("T")[0],
      dateValidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      status: "Sent to Client",
      subTotal: 150000,
      taxAmount: 27000,
      totalAmount: 177000,
      items: [
        {
          id: "item-1",
          taskName: "Foundation Setup",
          description: "Excavation and foundation laying",
          quantity: 1,
          unit: "Lump Sum",
          rate: 150000,
          totalAmount: 150000
        }
      ],
      clientNotes: "Initial estimate for foundation phase."
    }
  ]);

  const [newEstimate, setNewEstimate] = useState<Partial<ClientEstimate>>({
    estimateNumber: `EST-00${estimates.length + 1}`,
    dateCreated: new Date().toISOString().split("T")[0],
    dateValidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    status: "Draft",
    items: [],
    subTotal: 0,
    taxAmount: 0,
    totalAmount: 0,
  });

  const [selectedEstimateId, setSelectedEstimateId] = useState<string | null>(null);
  const selectedEstimate = estimates.find((e) => e.id === selectedEstimateId);

  // Sync state
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const { data: projectTasks = [] } = useTasksQuery(projectId);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  const handleCreate = () => {
    const newEst = { ...newEstimate, id: `est-${Date.now()}` } as ClientEstimate;
    setEstimates([newEst, ...estimates]);
    setIsCreateModalOpen(false);
    setSelectedEstimateId(newEst.id);
  };

  const getStatusColor = (status: ClientEstimate["status"]) => {
    switch (status) {
      case "Draft":
        return "bg-gray-100 text-gray-700 border-gray-200";
      case "Sent to Client":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "Approved":
        return "bg-green-100 text-green-700 border-green-200";
      case "Rejected":
        return "bg-red-100 text-red-700 border-red-200";
    }
  };

  const getStatusIcon = (status: ClientEstimate["status"]) => {
    switch (status) {
      case "Draft":
        return <FileText className="w-4 h-4" />;
      case "Sent to Client":
        return <Send className="w-4 h-4" />;
      case "Approved":
        return <FileCheck className="w-4 h-4" />;
      case "Rejected":
        return <FileX className="w-4 h-4" />;
    }
  };

  const updateSelectedEstimate = (updates: Partial<ClientEstimate>) => {
    if (!selectedEstimateId) return;
    setEstimates(estimates.map(e => e.id === selectedEstimateId ? { ...e, ...updates } : e));
  };

  const addLineItem = () => {
    if (!selectedEstimate) return;
    const newItem: EstimateLineItem = {
      id: `item-${Date.now()}`,
      taskName: "New Item",
      description: "",
      quantity: 1,
      unit: "Nos",
      rate: 0,
      totalAmount: 0
    };
    const items = [...selectedEstimate.items, newItem];
    const subTotal = items.reduce((sum, item) => sum + item.totalAmount, 0);
    const taxAmount = subTotal * 0.18; // assuming 18% tax
    updateSelectedEstimate({ items, subTotal, taxAmount, totalAmount: subTotal + taxAmount });
  };

  const updateLineItem = (itemId: string, field: keyof EstimateLineItem, value: any) => {
    if (!selectedEstimate) return;
    const items = selectedEstimate.items.map(item => {
      if (item.id === itemId) {
        const updated = { ...item, [field]: value };
        if (field === 'quantity' || field === 'rate') {
          updated.totalAmount = updated.quantity * updated.rate;
        }
        return updated;
      }
      return item;
    });
    const subTotal = items.reduce((sum, item) => sum + item.totalAmount, 0);
    const taxAmount = subTotal * 0.18;
    updateSelectedEstimate({ items, subTotal, taxAmount, totalAmount: subTotal + taxAmount });
  };

  const removeLineItem = (itemId: string) => {
    if (!selectedEstimate) return;
    const items = selectedEstimate.items.filter(item => item.id !== itemId);
    const subTotal = items.reduce((sum, item) => sum + item.totalAmount, 0);
    const taxAmount = subTotal * 0.18;
    updateSelectedEstimate({ items, subTotal, taxAmount, totalAmount: subTotal + taxAmount });
  };

  const handleSyncTasks = () => {
    if (!selectedEstimate) return;
    
    // Add selected tasks
    const newItems: EstimateLineItem[] = Array.from(selectedTaskIds).map((taskId) => {
      const task = projectTasks.find(t => t.id === taskId);
      return {
         id: `item-${Date.now()}-${taskId}`,
         taskId: taskId as string,
         taskName: task?.name || "Unknown Task",
         description: task?.assignedTo ? `Assigned to ${task.assignedTo}` : "",
         quantity: 1,
         unit: "Lump Sum",
         rate: task?.budgetedCost || 0,
         totalAmount: task?.budgetedCost || 0
      };
    });

    const items = [...selectedEstimate.items, ...newItems];
    const subTotal = items.reduce((sum, item) => sum + item.totalAmount, 0);
    const taxAmount = subTotal * 0.18;
    updateSelectedEstimate({ items, subTotal, taxAmount, totalAmount: subTotal + taxAmount });
    setIsSyncModalOpen(false);
    setSelectedTaskIds(new Set());
  };

  if (selectedEstimate) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSelectedEstimateId(null)}
            className="p-2 bg-surface border border-white/20 rounded-xl hover:bg-panel transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-ink" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-ink">Estimate {selectedEstimate.estimateNumber}</h2>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(selectedEstimate.status)}`}>
                {getStatusIcon(selectedEstimate.status)}
                {selectedEstimate.status}
              </span>
            </div>
            <p className="text-ink-muted text-sm mt-1">
              Created on {new Date(selectedEstimate.dateCreated).toLocaleDateString()} • Valid until {new Date(selectedEstimate.dateValidUntil).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-surface border border-white/20 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-ink">Line Items</h3>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setIsSyncModalOpen(true)}
                    className="bg-secondary/10 text-secondary hover:bg-secondary/20 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
                  >
                    <Link className="w-4 h-4" /> Sync WBS
                  </button>
                  <button 
                    onClick={addLineItem}
                    className="bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Add Item
                  </button>
                </div>
              </div>

              {selectedEstimate.items.length === 0 ? (
                 <div className="text-center py-8">
                   <CalculatorIcon className="w-10 h-10 text-ink-muted/30 mx-auto mb-3" />
                   <h3 className="text-sm font-bold text-ink-muted">No line items</h3>
                   <p className="text-xs text-ink-muted/60">Add items manually or sync from your WBS/Tasks list.</p>
                 </div>
              ) : (
                <div className="space-y-4">
                  {selectedEstimate.items.map(item => (
                    <div key={item.id} className="bg-panel border border-white/10 rounded-xl p-4 flex flex-col gap-3 group relative">
                       <button
                         onClick={() => removeLineItem(item.id)}
                         className="absolute top-4 right-4 text-ink-muted opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all pointer-events-none group-hover:pointer-events-auto"
                       >
                         <Trash2 className="w-4 h-4" />
                       </button>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-8">
                         <div>
                           <label className="text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-1 block">Task / Item Name</label>
                           <input
                             type="text"
                             value={item.taskName}
                             onChange={(e) => updateLineItem(item.id, 'taskName', e.target.value)}
                             className="w-full bg-surface border border-white/10 rounded-lg px-3 py-1.5 text-sm text-ink outline-none focus:border-primary/50"
                           />
                         </div>
                         <div>
                           <label className="text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-1 block">Description</label>
                           <input
                             type="text"
                             value={item.description}
                             onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                             className="w-full bg-surface border border-white/10 rounded-lg px-3 py-1.5 text-sm text-ink outline-none focus:border-primary/50"
                           />
                         </div>
                       </div>
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-3 border-t border-white/5 pt-3">
                         <div>
                           <label className="text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-1 block">Quantity</label>
                           <input
                             type="number"
                             value={item.quantity}
                             onChange={(e) => updateLineItem(item.id, 'quantity', parseFloat(e.target.value))}
                             className="w-full bg-surface border border-white/10 rounded-lg px-3 py-1.5 text-sm text-ink outline-none focus:border-primary/50"
                           />
                         </div>
                         <div>
                           <label className="text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-1 block">Unit</label>
                           <input
                             type="text"
                             value={item.unit}
                             onChange={(e) => updateLineItem(item.id, 'unit', e.target.value)}
                             className="w-full bg-surface border border-white/10 rounded-lg px-3 py-1.5 text-sm text-ink outline-none focus:border-primary/50"
                           />
                         </div>
                         <div>
                           <label className="text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-1 block">Rate (₹)</label>
                           <input
                             type="number"
                             value={item.rate}
                             onChange={(e) => updateLineItem(item.id, 'rate', parseFloat(e.target.value))}
                             className="w-full bg-surface border border-white/10 rounded-lg px-3 py-1.5 text-sm text-ink outline-none focus:border-primary/50"
                           />
                         </div>
                         <div>
                           <label className="text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-1 block">Total (₹)</label>
                           <div className="w-full bg-surface/50 border border-transparent rounded-lg px-3 py-1.5 text-sm text-ink font-bold">
                             {item.totalAmount.toLocaleString()}
                           </div>
                         </div>
                       </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-surface border border-white/20 rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="font-bold text-ink text-left">Summary</h3>
              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-ink-muted font-medium">Subtotal</span>
                  <span className="text-ink font-bold">₹{selectedEstimate.subTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-ink-muted font-medium">Tax Area (18%)</span>
                  <span className="text-ink font-bold">₹{selectedEstimate.taxAmount.toLocaleString()}</span>
                </div>
                <div className="border-t border-white/10 pt-3 flex justify-between items-center">
                  <span className="text-ink font-bold">Total Amount</span>
                  <span className="text-xl text-primary font-bold">₹{selectedEstimate.totalAmount.toLocaleString()}</span>
                </div>
              </div>
              <div className="border-t border-white/10 pt-4 space-y-2">
                {selectedEstimate.status === "Draft" && (
                  <button 
                    onClick={() => updateSelectedEstimate({ status: "Sent to Client" })}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 rounded-xl transition-colors shadow-lg shadow-blue-500/20"
                  >
                    Mark as Sent
                  </button>
                )}
                {selectedEstimate.status === "Sent to Client" && (
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => updateSelectedEstimate({ status: "Approved" })}
                      className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-2 rounded-xl transition-colors shadow-lg shadow-green-500/20"
                    >
                      Approve
                    </button>
                    <button 
                      onClick={() => updateSelectedEstimate({ status: "Rejected" })}
                      className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-2 rounded-xl transition-colors shadow-lg shadow-red-500/20"
                    >
                      Reject
                    </button>
                  </div>
                )}
                {selectedEstimate.status === "Approved" && (
                   <div className="bg-green-500/10 border border-green-500/20 text-green-700 text-center py-2 rounded-xl font-bold flex items-center justify-center gap-2">
                     <CheckCircle2 className="w-5 h-5" /> Client Approved
                   </div>
                )}
              </div>
            </div>
            
            <div className="bg-surface border border-white/20 rounded-2xl p-6 shadow-sm">
               <label className="text-xs font-bold text-ink-muted uppercase tracking-wider mb-2 block">Client Notes</label>
               <textarea
                 value={selectedEstimate.clientNotes || ""}
                 onChange={(e) => updateSelectedEstimate({ clientNotes: e.target.value })}
                 className="w-full bg-panel border-2 border-transparent rounded-xl px-4 py-2 text-sm text-ink font-medium focus:border-primary/50 outline-none min-h-[100px]"
                 placeholder="Terms, conditions, or scope summary..."
               />
            </div>
          </div>
        </div>

        {/* Sync Modal */}
        {isSyncModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="bg-surface w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden border border-white/20 flex flex-col max-h-[80vh]">
              <div className="bg-panel px-6 py-4 flex justify-between items-center border-b border-white/10 shrink-0">
                <h3 className="text-[17px] font-bold text-ink flex items-center gap-2">
                  <Link className="w-5 h-5 text-secondary" /> Sync Tasks to Estimate
                </h3>
                <button
                  onClick={() => setIsSyncModalOpen(false)}
                  className="text-ink-muted hover:text-ink transition-colors p-1"
                >
                  &times;
                </button>
              </div>
              <div className="p-4 overflow-y-auto grow">
                {projectTasks.length === 0 ? (
                  <div className="text-center py-8">
                     <FileText className="w-10 h-10 text-ink-muted/30 mx-auto mb-3" />
                     <h3 className="text-sm font-bold text-ink">No Tasks Found</h3>
                     <p className="text-xs text-ink-muted">Create tasks in the Work Breakdown logic first.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {projectTasks.map(task => {
                      // Don't show summary / milestones directly maybe, or do? Let's show all for now.
                      const isSelected = selectedTaskIds.has(task.id);
                      return (
                        <div 
                          key={task.id} 
                          className={`flex items-center gap-3 p-3 rounded-xl border ${isSelected ? 'bg-primary/5 border-primary/30' : 'bg-panel border-white/10 hover:border-white/20'} cursor-pointer transition-colors`}
                          onClick={() => {
                            const newSet = new Set(selectedTaskIds);
                            if (isSelected) newSet.delete(task.id);
                            else newSet.add(task.id);
                            setSelectedTaskIds(newSet);
                          }}
                        >
                          <div className={`w-5 h-5 rounded border flex items-center justify-center ${isSelected ? 'bg-primary border-primary text-white' : 'border-white/30'}`}>
                            {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-ink">{task.name}</p>
                            <p className="text-xs text-ink-muted/80">{task.type} • Budget: ₹{task.budgetedCost || 0}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              <div className="p-4 bg-panel border-t border-white/10 flex justify-end gap-3 shrink-0">
                <button
                  onClick={() => setIsSyncModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl font-bold text-ink-muted hover:text-ink hover:bg-surface transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSyncTasks}
                  disabled={selectedTaskIds.size === 0}
                  className="bg-primary text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" /> Import Selected ({selectedTaskIds.size})
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-ink">Client Estimates</h2>
          <p className="text-ink-muted text-sm mt-1">Track estimates and approvals with the client.</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-primary text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
        >
          <Plus className="w-5 h-5" /> New Estimate
        </button>
      </div>

      <div className="bg-surface rounded-2xl border apple-glass p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-3 bg-panel px-4 py-2.5 rounded-xl border-2 border-white/40 focus-within:border-primary/50 transition-colors shadow-inner">
          <Search className="w-5 h-5 text-ink-muted" />
          <input
            type="text"
            placeholder="Search estimates by number or status..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none flex-1 font-medium text-ink placeholder:text-ink-muted/50"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/20">
                <th className="text-left py-3 px-4 text-ink-muted font-bold text-[13px] uppercase tracking-wider">Number</th>
                <th className="text-left py-3 px-4 text-ink-muted font-bold text-[13px] uppercase tracking-wider">Date</th>
                <th className="text-left py-3 px-4 text-ink-muted font-bold text-[13px] uppercase tracking-wider">Status</th>
                <th className="text-right py-3 px-4 text-ink-muted font-bold text-[13px] uppercase tracking-wider">Subtotal</th>
                <th className="text-right py-3 px-4 text-ink-muted font-bold text-[13px] uppercase tracking-wider">Total</th>
                <th className="text-center py-3 px-4 text-ink-muted font-bold text-[13px] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {estimates
                .filter(e => e.estimateNumber.toLowerCase().includes(searchTerm.toLowerCase()) || e.status.toLowerCase().includes(searchTerm.toLowerCase()))
                .map((estimate) => (
                <tr 
                  key={estimate.id} 
                  className="hover:bg-panel/50 transition-colors group cursor-pointer"
                  onClick={() => setSelectedEstimateId(estimate.id)}
                >
                  <td className="py-4 px-4 font-bold text-ink">{estimate.estimateNumber}</td>
                  <td className="py-4 px-4 text-ink font-medium">{new Date(estimate.dateCreated).toLocaleDateString()}</td>
                  <td className="py-4 px-4">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(estimate.status)}`}>
                      {getStatusIcon(estimate.status)}
                      {estimate.status}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right text-ink font-medium">₹{estimate.subTotal.toLocaleString()}</td>
                  <td className="py-4 px-4 text-right text-ink font-bold">₹{estimate.totalAmount.toLocaleString()}</td>
                  <td className="py-4 px-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                       <button className="p-2 text-ink-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors">
                         <ChevronRight className="w-4 h-4" />
                       </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {estimates.length === 0 && (
             <div className="text-center py-12">
               <Calculator className="w-12 h-12 text-ink-muted/30 mx-auto mb-3" />
               <h3 className="text-lg font-bold text-ink">No Estimates Found</h3>
               <p className="text-ink-muted mb-4">Create your first client estimate to start tracking approvals.</p>
             </div>
          )}
        </div>
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-white/20">
            <div className="bg-panel px-6 py-4 flex justify-between items-center border-b border-white/10">
              <h3 className="text-[17px] font-bold text-ink flex items-center gap-2">
                <FileText className="w-5 h-5" /> New Client Estimate
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-ink-muted hover:text-ink transition-colors p-1"
              >
                &times;
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-ink-muted uppercase tracking-wider mb-1 block">Estimate Number</label>
                  <input
                    type="text"
                    value={newEstimate.estimateNumber}
                    readOnly
                    className="w-full bg-panel border-2 border-transparent rounded-xl px-4 py-2 text-ink font-medium outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-ink-muted uppercase tracking-wider mb-1 block">Date Valid Until</label>
                  <input
                    type="date"
                    value={newEstimate.dateValidUntil}
                    onChange={e => setNewEstimate({...newEstimate, dateValidUntil: e.target.value})}
                    className="w-full bg-panel border-2 border-transparent rounded-xl px-4 py-2 text-ink font-medium focus:border-primary/50 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-ink-muted uppercase tracking-wider mb-1 block">Client Notes</label>
                <textarea
                  value={newEstimate.clientNotes || ""}
                  onChange={e => setNewEstimate({...newEstimate, clientNotes: e.target.value})}
                  className="w-full bg-panel border-2 border-transparent rounded-xl px-4 py-2 text-ink font-medium focus:border-primary/50 outline-none min-h-[100px]"
                  placeholder="Terms, conditions, or scope summary..."
                />
              </div>
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                <p className="text-sm text-primary font-medium flex items-center gap-2">
                   <CalculatorIcon className="w-4 h-4" />
                   Line items can be synced from the WBS/Tasks list after creation.
                </p>
              </div>
            </div>
            <div className="p-4 bg-panel border-t border-white/10 flex justify-end gap-3">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="px-5 py-2.5 rounded-xl font-bold text-ink-muted hover:text-ink hover:bg-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="bg-primary text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors"
              >
                Create Estimate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

