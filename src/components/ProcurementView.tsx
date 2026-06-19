import React, { useState, useEffect, useMemo } from "react";
import { PurchaseOrderTab } from "./purchase/PurchaseOrderTab";
import { GoodsReceiptTab } from "./purchase/GoodsReceiptTab";
import { MaterialReceiptForm } from "./purchase/MaterialReceiptForm";
import {
  db,
  collection,
  onSnapshot,
  query,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
  handleFirestoreError,
  OperationType,
  runTransaction,
  where,
  orderBy,
} from "../firebase";
import {
  Vendor,
  MaterialReceipt,
  VendorLedgerEntry,
  InventoryItem,
  PurchaseOrder,
  GoodsReceiptNote
} from "../types";
import {
  Truck,
  Plus,
  Search,
  IndianRupee,
  Trash2,
  Edit2,
  X,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  History,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Package,
  ChevronRight,
  Filter,
  Download,
  Save,
  Users,
  Phone,
  Mail,
  MapPin,
  HandCoins,
  Wallet,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useUIStore, useAuthStore } from "../store";
// Removed unused import

interface ProcurementViewProps {
  projectId: string;
}

type Tab = "purchase_orders" | "goods_receipt" | "receipts" | "ledger" | "vendors";

export const ProcurementView: React.FC<ProcurementViewProps> = ({
  projectId,
}) => {
  const strictDataEntry = true;
  const { user } = useAuthStore();
  const isAdminOrOwner = user?.role === "Admin" || user?.role === "Owner";

  const [activeTab, setActiveTab] = useState<Tab>("purchase_orders");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [receipts, setReceipts] = useState<MaterialReceipt[]>([]);
  const [ledger, setLedger] = useState<VendorLedgerEntry[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [grns, setGrns] = useState<GoodsReceiptNote[]>([]);

  // Modals
  const [isAddingVendor, setIsAddingVendor] = useState(false);
  const [isEditingVendor, setIsEditingVendor] = useState(false);
  const [isAddingReceipt, setIsAddingReceipt] = useState(false);
  const [isAddingPayment, setIsAddingPayment] = useState(false);
  const [isQuickAddingMaterial, setIsQuickAddingMaterial] = useState(false);
  const [isEditingReceipt, setIsEditingReceipt] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [selectedReceipt, setSelectedReceipt] =
    useState<MaterialReceipt | null>(null);
  const [isDeletingVendor, setIsDeletingVendor] = useState<string | null>(null);
  const [isDeletingReceipt, setIsDeletingReceipt] = useState<string | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);

  // Form States
  const [newVendor, setNewVendor] = useState<Partial<Vendor>>({
    name: "",
    type: "Material",
    contactPerson: "",
    email: "",
    phone: "",
    address: "",
    outstandingBalance: 0,
  });

  const [newQuickMaterial, setNewQuickMaterial] = useState<
    Partial<InventoryItem>
  >({
    name: "",
    materialId: "",
    category: "Material",
    unit: "units",
    unitCost: 0,
    minThreshold: 10,
  });

  const [newReceipt, setNewReceipt] = useState<Partial<MaterialReceipt>>({
    supplierId: "",
    receiptDate: new Date().toISOString().split("T")[0],
    invoiceNumber: "",
    notes: "",
    items: [],
  });

  const [newPayment, setNewPayment] = useState({
    supplierId: "",
    amount: 0,
    date: new Date().toISOString().split("T")[0],
    description: "",
    receiptId: "",
    overrideReason: "",
  });

  useEffect(() => {
    const vendorsPath = `projects/${projectId}/suppliers`;
    const receiptsPath = `projects/${projectId}/receipts`;
    const ledgerPath = `projects/${projectId}/ledger`;
    const inventoryPath = `projects/${projectId}/inventory`;
    const poPath = `projects/${projectId}/purchase_orders`;
    const grnPath = `projects/${projectId}/goodsReceiptNotes`;

    const unsubVendors = onSnapshot(
      query(collection(db, vendorsPath)),
      (snapshot) => {
        setVendors(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Vendor),
        );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, vendorsPath),
    );

    const unsubReceipts = onSnapshot(
      query(collection(db, receiptsPath), orderBy("receiptDate", "desc")),
      (snapshot) => {
        setReceipts(
          snapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as MaterialReceipt,
          ),
        );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, receiptsPath),
    );

    const unsubLedger = onSnapshot(
      query(collection(db, ledgerPath), orderBy("date", "desc")),
      (snapshot) => {
        setLedger(
          snapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as VendorLedgerEntry,
          ),
        );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, ledgerPath),
    );

    const unsubInventory = onSnapshot(
      query(collection(db, inventoryPath)),
      (snapshot) => {
        setInventory(
          snapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as InventoryItem,
          ),
        );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, inventoryPath),
    );

    const unsubPOs = onSnapshot(
      query(collection(db, poPath)),
      (snapshot) => {
        setPurchaseOrders(snapshot.docs.map(doc => doc.data() as PurchaseOrder));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, poPath)
    );

    const unsubGRNs = onSnapshot(
      query(collection(db, grnPath)),
      (snapshot) => {
        setGrns(snapshot.docs.map(doc => doc.data() as GoodsReceiptNote));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, grnPath)
    );

    return () => {
      unsubVendors();
      unsubReceipts();
      unsubLedger();
      unsubInventory();
      unsubPOs();
      unsubGRNs();
    };
  }, [projectId]);

  const handleAddReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReceipt.supplierId) return;

    const validItems = (newReceipt.items || []).filter(
      (item) => item.itemId && item.quantity > 0,
    );
    if (validItems.length === 0) return;

    const vendor = vendors.find((v) => v.id === newReceipt.supplierId);
    if (!vendor) return;

    const totalAmount = validItems.reduce(
      (sum, item) => sum + item.totalPrice,
      0,
    );

    try {
      await runTransaction(db, async (transaction) => {
        let oldData: MaterialReceipt | null = null;
        if (isEditingReceipt && selectedReceipt) {
          const oldReceiptRef = doc(
            db,
            `projects/${projectId}/receipts/${selectedReceipt.id}`,
          );
          const oldReceiptDoc = await transaction.get(oldReceiptRef);
          if (oldReceiptDoc.exists())
            oldData = oldReceiptDoc.data() as MaterialReceipt;
        }

        const itemIdsToRead = new Set<string>();
        if (oldData)
          oldData.items
            .filter((i) => i.itemId)
            .forEach((item) => itemIdsToRead.add(item.itemId));
        validItems.forEach((item) => itemIdsToRead.add(item.itemId));

        const inventoryItemDocs: { [id: string]: any } = {};
        const inventoryState: { [id: string]: InventoryItem } = {};
        for (const itemId of Array.from(itemIdsToRead)) {
          const itemRef = doc(db, `projects/${projectId}/inventory/${itemId}`);
          const snap = await transaction.get(itemRef);
          inventoryItemDocs[itemId] = snap;
          if (snap.exists()) {
            inventoryState[itemId] = snap.data() as InventoryItem;
          }
        }

        const vendorRef = doc(
          db,
          `projects/${projectId}/suppliers/${newReceipt.supplierId}`,
        );
        const vendorDoc = await transaction.get(vendorRef);
        if (!vendorDoc.exists()) throw new Error("Vendor not found");

        let oldVendorDoc = null;
        if (oldData && oldData.supplierId !== newReceipt.supplierId) {
          const oldVendorRef = doc(
            db,
            `projects/${projectId}/suppliers/${oldData.supplierId}`,
          );
          oldVendorDoc = await transaction.get(oldVendorRef);
        }

        let currentVendorBalance =
          (vendorDoc.data() as Vendor).outstandingBalance || 0;

        if (oldData) {
          const ovDoc = oldVendorDoc || vendorDoc;
          if (ovDoc && ovDoc.exists()) {
            const ovData = ovDoc.data() as Vendor;
            const revBalance =
              (ovData.outstandingBalance || 0) - oldData.totalAmount;
            transaction.update(ovDoc.ref, { outstandingBalance: revBalance });
            if (ovDoc.id === vendorDoc.id) currentVendorBalance = revBalance;
          }
        }

        const vendorData = vendorDoc.data() as Vendor;
        const receiptRef =
          isEditingReceipt && selectedReceipt
            ? doc(db, `projects/${projectId}/receipts/${selectedReceipt.id}`)
            : doc(collection(db, `projects/${projectId}/receipts`));

        const ledgerRef =
          isEditingReceipt && selectedReceipt && selectedReceipt.ledgerId
            ? doc(
                db,
                `projects/${projectId}/ledger/${selectedReceipt.ledgerId}`,
              )
            : doc(collection(db, `projects/${projectId}/ledger`));

        transaction.set(receiptRef, {
          ...newReceipt,
          items: validItems,
          projectId,
          supplierName: vendorData.name,
          totalAmount,
          id: receiptRef.id,
          ledgerId: ledgerRef.id,
        });

        transaction.set(ledgerRef, {
          projectId,
          vendorId: vendorDoc.id,
          date: new Date(newReceipt.receiptDate || "").toISOString(),
          type: "CREDIT",
          amount: totalAmount,
          referenceType: "GRN",
          referenceId: receiptRef.id,
          description: `Material Inward - Invoice: ${newReceipt.invoiceNumber}`,
        });

        transaction.update(vendorRef, {
          outstandingBalance: currentVendorBalance + totalAmount,
        });
      });

      setIsAddingReceipt(false);
      setIsEditingReceipt(false);
      setNewReceipt({
        supplierId: "",
        receiptDate: new Date().toISOString().split("T")[0],
        invoiceNumber: "",
        notes: "",
        items: [],
      });
    } catch (error) {
      console.error("Receipt save failed:", error);
    }
  };

  const handleDeleteReceipt = async (receiptId: string) => {
    if (!receiptId || isDeleting) return;
    setIsDeleting(true);
    try {
      await runTransaction(db, async (transaction) => {
        const receiptRef = doc(
          db,
          `projects/${projectId}/receipts/${receiptId}`,
        );
        const receiptSnapshot = await transaction.get(receiptRef);
        if (!receiptSnapshot.exists()) return;
        const receiptData = receiptSnapshot.data() as MaterialReceipt;

        const vendorRef = doc(
          db,
          `projects/${projectId}/suppliers/${receiptData.supplierId}`,
        );
        const vendorSnapshot = await transaction.get(vendorRef);

        // --- WRITES ---
        if (vendorSnapshot.exists()) {
          transaction.update(vendorRef, {
            outstandingBalance:
              (vendorSnapshot.data().outstandingBalance || 0) -
              receiptData.totalAmount,
          });
        }

        transaction.delete(receiptRef);
        if (receiptData.ledgerId)
          transaction.delete(
            doc(db, `projects/${projectId}/ledger/${receiptData.ledgerId}`),
          );
      });
      setIsDeletingReceipt(null);
    } catch (error) {
      console.error("Delete Receipt Failed:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdminOrOwner) return;
    if (!newPayment.supplierId || newPayment.amount <= 0) return;
    try {
      if (editingPaymentId) {
        await runTransaction(db, async (transaction) => {
          const ledgerRef = doc(
            db,
            `projects/${projectId}/ledger/${editingPaymentId}`,
          );
          const ledgerDoc = await transaction.get(ledgerRef);
          if (!ledgerDoc.exists()) return;
          const oldData = ledgerDoc.data() as VendorLedgerEntry;

          const vendorRef = doc(
            db,
            `projects/${projectId}/suppliers/${newPayment.supplierId}`,
          );
          const vendorDoc = await transaction.get(vendorRef);
          if (!vendorDoc.exists()) return;

          // Reverse old amount
          const intermediateBalance =
            (vendorDoc.data().outstandingBalance || 0) + oldData.amount;
          // Apply new amount
          transaction.update(vendorRef, {
            outstandingBalance: intermediateBalance - newPayment.amount,
          });

          transaction.update(ledgerRef, {
            vendorId: newPayment.supplierId,
            date: new Date(newPayment.date).toISOString(),
            amount: newPayment.amount,
            description: newPayment.description || "Payment to Vendor",
          });
        });
      } else {
        await runTransaction(db, async (transaction) => {
          const vendorRef = doc(
            db,
            `projects/${projectId}/suppliers/${newPayment.supplierId}`,
          );
          const vendorDoc = await transaction.get(vendorRef);
          if (!vendorDoc.exists()) return;

          const ledgerRef = doc(collection(db, `projects/${projectId}/ledger`));
          
          let overrideFields = {};
          if (newPayment.receiptId) {
             const rcpt = receipts.find(r => r.id === newPayment.receiptId);
             if (rcpt && rcpt.matchStatus === "Has Discrepancies") {
                overrideFields = {
                   overriddenBy: user?.displayName || user?.email || user?.uid || "Admin",
                   overrideReason: newPayment.overrideReason || "Discrepancy accepted"
                };
             }
          }

          transaction.set(ledgerRef, {
            projectId,
            vendorId: newPayment.supplierId,
            date: new Date(newPayment.date).toISOString(),
            type: "DEBIT",
            amount: newPayment.amount,
            referenceType: "PAYMENT",
            referenceId: newPayment.receiptId || undefined,
            description: newPayment.description || "Payment to Vendor",
            ...overrideFields
          });

          transaction.update(vendorRef, {
            outstandingBalance:
              (vendorDoc.data().outstandingBalance || 0) - newPayment.amount,
          });
        });
      }
      setIsAddingPayment(false);
      setEditingPaymentId(null);
      setNewPayment({
        supplierId: "",
        amount: 0,
        date: new Date().toISOString().split("T")[0],
        description: "",
      });
    } catch (error) {
      console.error("Payment Failed:", error);
    }
  };

  const handleDeleteLedgerEntry = async (entryId: string) => {
    if (!entryId || isDeleting) return;
    setIsDeleting(true);
    try {
      await runTransaction(db, async (transaction) => {
        const ledgerRef = doc(db, `projects/${projectId}/ledger/${entryId}`);
        const ledgerDoc = await transaction.get(ledgerRef);
        if (!ledgerDoc.exists()) return;
        const data = ledgerDoc.data() as VendorLedgerEntry;

        const vendorRef = doc(
          db,
          `projects/${projectId}/suppliers/${data.vendorId}`,
        );
        const vendorDoc = await transaction.get(vendorRef);
        if (vendorDoc.exists()) {
          const currentBalance = vendorDoc.data().outstandingBalance || 0;
          const newBalance =
            data.type === "CREDIT"
              ? currentBalance - data.amount
              : currentBalance + data.amount;
          transaction.update(vendorRef, { outstandingBalance: newBalance });
        }
        transaction.delete(ledgerRef);
      });
    } catch (error) {
      console.error("Delete Ledger Entry Failed:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportReport = () => {
    let dataToExport = [];
    let fileName = "";
    let headers = [];

    if (activeTab === "vendors") {
      fileName = `vendors_${new Date().toISOString().split("T")[0]}.csv`;
      headers = [
        "Name",
        "Type",
        "Contact",
        "Email",
        "Phone",
        "Address",
        "Outstanding Balance",
      ];
      dataToExport = vendors.map((v) => [
        v.name,
        v.type,
        v.contactPerson || "-",
        v.email || "-",
        v.phone || "-",
        v.address || "-",
        getVendorBalance(v.id).toFixed(2),
      ]);
    } else if (activeTab === "receipts") {
      fileName = `material_receipts_${new Date().toISOString().split("T")[0]}.csv`;
      headers = ["Date", "Vendor", "Invoice Number", "Items", "Total Amount"];
      dataToExport = receipts.map((r) => [
        r.receiptDate,
        r.supplierName,
        r.invoiceNumber,
        r.items.map((i) => `${i.name} (Qty: ${i.quantity})`).join("; "),
        r.totalAmount.toFixed(2),
      ]);
    } else if (activeTab === "ledger") {
      const filteredLedger = selectedVendor
        ? ledger.filter((e) => e.vendorId === selectedVendor.id)
        : ledger;
      fileName = selectedVendor
        ? `ledger_${selectedVendor.name}_${new Date().toISOString().split("T")[0]}.csv`
        : `ledger_all_${new Date().toISOString().split("T")[0]}.csv`;
      headers = ["Date", "Vendor", "Type", "Description", "Amount"];
      dataToExport = filteredLedger.map((e) => [
        new Date(e.date).toLocaleDateString(),
        vendors.find((v) => v.id === e.vendorId)?.name || "Unknown",
        e.type,
        e.description,
        e.amount.toFixed(2),
      ]);
    }

    if (dataToExport.length === 0) return;

    const csvRows = [
      headers.join(","),
      ...dataToExport.map((row) =>
        row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","),
      ),
    ];

    const blob = new Blob([csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEditingVendor && selectedVendor) {
        await updateDoc(
          doc(db, `projects/${projectId}/suppliers/${selectedVendor.id}`),
          { ...newVendor },
        );
      } else {
        await addDoc(collection(db, `projects/${projectId}/suppliers`), {
          ...newVendor,
          projectId,
          outstandingBalance: 0,
        });
      }
      setIsAddingVendor(false);
      setIsEditingVendor(false);
      setSelectedVendor(null);
      setNewVendor({
        name: "",
        type: "Material",
        contactPerson: "",
        email: "",
        phone: "",
        address: "",
        outstandingBalance: 0,
      });
    } catch (error) {
      console.error("Save Vendor Failed:", error);
    }
  };

  const handleDeleteVendor = async (vendorId: string) => {
    if (!vendorId || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, `projects/${projectId}/suppliers/${vendorId}`));
      setIsDeletingVendor(null);
    } catch (error) {
      console.error("Delete Vendor Failed:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const getVendorBalance = (vId: string) => {
    const v = vendors.find((v) => v.id === vId);
    return v ? v.outstandingBalance || 0 : 0;
  };

  const renderVendors = () => {
    const totalOutstanding = vendors.reduce(
      (acc, v) => acc + getVendorBalance(v.id),
      0,
    );
    const totalPayments = ledger
      .filter((l) => l.type === "DEBIT")
      .reduce((acc, l) => acc + (l.amount || 0), 0);

    return (
    <div className="space-y-6 md:space-y-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl md:text-3xl font-black text-ink tracking-tight">
            Active Vendors
          </h2>
          <p className="text-ink-muted font-bold text-[10px] md:text-sm tracking-tight uppercase tracking-[0.1em]">
            Vendor ecosystem and tracking.
          </p>
        </div>
        <button
          onClick={() => setIsAddingVendor(true)}
          className="w-full sm:w-auto bg-slate-900 text-white px-5 md:px-8 py-3 md:py-3.5 rounded-xl md:rounded-2xl font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-slate-800 apple-transition shadow-lg shadow-slate-200 text-[10px]"
        >
          <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" /> <span>Add Party</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface border p-6 rounded-2xl shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-semibold text-ink-muted">Total Payments Made</p>
              <h3 className="text-3xl font-black text-emerald-600 mt-1">₹{totalPayments.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</h3>
            </div>
            <div className="bg-emerald-100 p-3 rounded-xl text-emerald-600">
              <HandCoins className="w-6 h-6" />
            </div>
          </div>
        </div>
        
        <div className="bg-surface border p-6 rounded-2xl shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-semibold text-ink-muted">Total Outstanding Balance</p>
              <h3 className="text-3xl font-black text-rose-600 mt-1">₹{totalOutstanding.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</h3>
            </div>
            <div className="bg-rose-100 p-3 rounded-xl text-rose-600">
              <Wallet className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
        {vendors.map((vendor) => (
          <motion.div
            layout
            key={vendor.id}
            className="bg-surface p-5 md:p-8 rounded-2xl md:rounded-[40px] border border-slate-50 shadow-sm hover:shadow-xl apple-transition group relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-24 md:w-32 h-24 md:h-32 bg-panel rounded-full -mr-12 md:-mr-16 -mt-12 md:-mt-16 group-hover:bg-indigo-50 apple-transition" />
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-6 md:mb-10">
                <div className="bg-slate-900 p-2.5 md:p-4 rounded-xl md:rounded-2xl shadow-lg shadow-slate-100 group-hover:bg-indigo-600 apple-transition">
                  {vendor.type === "Labor" ? (
                    <Users className="w-4 h-4 md:w-6 md:h-6 text-white/90" />
                  ) : (
                    <Truck className="w-4 h-4 md:w-6 md:h-6 text-white/90" />
                  )}
                </div>
                <div className="flex flex-col items-end">
                  <div className="flex gap-1 md:gap-2 mb-2 md:mb-4">
                    <button
                      onClick={() => {
                        setNewVendor({
                          name: vendor.name,
                          type: vendor.type,
                          contactPerson: vendor.contactPerson || "",
                          email: vendor.email || "",
                          phone: vendor.phone || "",
                          address: vendor.address || "",
                          outstandingBalance: vendor.outstandingBalance,
                        });
                        setSelectedVendor(vendor);
                        setIsEditingVendor(true);
                        setIsAddingVendor(true);
                      }}
                      className="p-1.5 md:p-2 text-ink-muted hover:text-indigo-500 apple-transition"
                    >
                      <Edit2 className="w-3.5 h-3.5 md:w-5 md:h-5" />
                    </button>
                    <button
                      onClick={() => setIsDeletingVendor(vendor.id)}
                      className="p-1.5 md:p-2 text-ink-muted hover:text-red-500 apple-transition"
                    >
                      <Trash2 className="w-3.5 h-3.5 md:w-5 md:h-5" />
                    </button>
                  </div>
                  <div className="text-right">
                    <p className="text-[7px] md:text-[9px] font-black uppercase tracking-[0.3em] text-ink-muted">
                      Outstanding
                    </p>
                    <p
                      className={`text-lg md:text-xl font-black tracking-tighter ${getVendorBalance(vendor.id) > 0 ? "text-red-500" : "text-emerald-500"}`}
                    >
                      ₹{getVendorBalance(vendor.id).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </p>
                    <div className="mt-2">
                       <p className="text-[7px] md:text-[9px] font-black uppercase tracking-[0.3em] text-ink-muted">
                         Payments Made
                       </p>
                       <p className="text-sm md:text-base font-bold text-emerald-600">
                         ₹{ledger
                           .filter(
                             (l) => l.vendorId === vendor.id && l.type === "DEBIT",
                           )
                           .reduce((acc, l) => acc + (l.amount || 0), 0)
                           .toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                       </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 md:gap-3 mb-1">
                <h3 className="text-base md:text-xl font-black text-ink tracking-tight group-hover:text-indigo-600 apple-transition truncate">
                  {vendor.name}
                </h3>
              </div>
              <p className="text-[9px] md:text-xs font-bold text-ink-muted mb-4 uppercase tracking-widest leading-none shrink-0">
                {vendor.type}
              </p>

              <div className="space-y-2 md:space-y-3 mb-5 md:mb-6">
                {vendor.phone && (
                  <div className="flex items-center gap-2 text-[10px] font-bold text-ink-muted">
                    <Phone className="w-3 h-3 md:w-3.5 md:h-3.5 text-ink-muted" />
                    {vendor.phone}
                  </div>
                )}
                {vendor.email && (
                  <div className="flex items-center gap-2 text-[10px] font-bold text-ink-muted">
                    <Mail className="w-3 h-3 md:w-3.5 md:h-3.5 text-ink-muted" />
                    <span className="truncate">{vendor.email}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                {isAdminOrOwner && (
                  <button
                    onClick={() => {
                      setNewPayment({ ...newPayment, supplierId: vendor.id, receiptId: "", overrideReason: "" });
                      setIsAddingPayment(true);
                    }}
                    className="flex-[1.5] bg-slate-900 text-white py-2.5 md:py-3.5 rounded-lg md:rounded-2xl text-[8px] md:text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-slate-800 apple-transition shadow-md shadow-slate-100"
                  >
                    Payment
                  </button>
                )}
                <button
                  onClick={() => {
                    setActiveTab("ledger");
                    setSelectedVendor(vendor);
                  }}
                  className="flex-1 bg-panel text-ink-muted py-2.5 md:py-3.5 rounded-lg md:rounded-2xl text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] hover:bg-panel apple-transition border border-divider"
                >
                  Ledger
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

  const renderReceipts = () => (
    <div className="space-y-6 md:space-y-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-ink tracking-tight">
            Material Receipts
          </h2>
          <p className="text-ink-muted font-bold text-xs md:text-sm tracking-tight uppercase tracking-[0.1em]">
            Inward orchestration record.
          </p>
        </div>
      </div>

      <div className="bg-surface rounded-[24px] md:rounded-[40px] shadow-[0_10px_40px_rgba(0,0,0,0.02)] md:shadow-[0_20px_60px_rgba(0,0,0,0.03)] border border-slate-50 overflow-hidden">
        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-left min-w-[700px] md:min-w-[800px]">
            <thead>
              <tr className="bg-slate-900 text-white/40 border-b border-white/5">
                <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.3em] text-white/30 italic">
                  Timeline
                </th>
                <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.3em] text-white/80">
                  Vendor
                </th>
                <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.3em] text-white/30 italic">
                  Reference
                </th>
                <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.3em] text-white/80">
                  Items
                </th>
                <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.3em] text-white/80 text-right">
                  Total
                </th>
                {!strictDataEntry && (
                  <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.3em] text-white/30 text-right">
                    Ops
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {receipts.map((receipt) => (
                <tr
                  key={receipt.id}
                  className="group hover:bg-panel/50 apple-transition"
                >
                  <td className="px-6 md:px-10 py-5 md:py-8 font-mono text-[9px] md:text-[10px] font-bold text-ink-muted group-hover:text-ink apple-transition">
                    {receipt.receiptDate}
                  </td>
                  <td className="px-6 md:px-10 py-5 md:py-8">
                    <div className="font-bold text-ink tracking-tight text-base md:text-lg leading-none mb-1 truncate max-w-[150px]">
                      {receipt.supplierName}
                    </div>
                    {receipt.poNumber && (
                       <div className="text-[8px] md:text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-1">
                         PO: {receipt.poNumber}
                       </div>
                    )}
                  </td>
                  <td className="px-6 md:px-10 py-5 md:py-8">
                    <div className="flex items-center gap-2">
                       <span className="font-mono text-[9px] md:text-[10px] font-bold text-indigo-600 bg-indigo-50/50 px-2 md:px-3 py-1 md:py-1.5 rounded-xl border border-indigo-100/50 shadow-sm">
                         {receipt.invoiceNumber}
                       </span>
                       {receipt.matchStatus === "Fully Matched" && <span className="font-bold text-[8px] md:text-[9px] uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">Matched</span>}
                       {receipt.matchStatus === "Has Discrepancies" && <span className="font-bold text-[8px] md:text-[9px] uppercase tracking-widest text-amber-600 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">Discrepancy</span>}
                       {receipt.matchStatus === "Unlinked" && <span className="font-bold text-[8px] md:text-[9px] uppercase tracking-widest text-slate-500 bg-slate-50 px-2 py-1 rounded-lg">Unlinked</span>}
                    </div>
                  </td>
                  <td className="px-6 md:px-10 py-5 md:py-8">
                    <div className="flex flex-wrap gap-1.5 md:gap-2 max-w-[200px] md:max-w-[300px]">
                      {receipt.items.map((item, idx) => (
                        <span
                          key={idx}
                          className="bg-panel border border-divider px-2 md:px-3 py-1 md:py-1.5 rounded-xl text-[8px] md:text-[9px] font-bold text-ink-muted uppercase tracking-tight whitespace-nowrap"
                        >
                          {item.name} × {item.quantity}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 md:px-10 py-5 md:py-8 text-right">
                    <div className="text-base md:text-lg font-bold text-ink tracking-tighter font-mono leading-none">
                      ₹{receipt.totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </div>
                    <div className="text-[8px] md:text-[9px] font-bold text-ink-muted uppercase tracking-widest mt-1.5 md:mt-2 tracking-[0.1em]">
                      Value
                    </div>
                  </td>
                  {!strictDataEntry && (
                    <td className="px-6 md:px-10 py-5 md:py-8 text-right">
                      <div className="flex justify-end gap-1.5 md:gap-2 opacity-0 group-hover:opacity-100 apple-transition scale-90 group-hover:scale-100">
                        <button
                          onClick={() => {
                            setSelectedReceipt(receipt);
                            setNewReceipt(receipt);
                            setIsEditingReceipt(true);
                            setIsAddingReceipt(true);
                          }}
                          className="p-2.5 md:p-3 bg-blue-50 border border-blue-100 shadow-sm rounded-xl text-blue-600 hover:bg-blue-100 hover:text-blue-700 active:scale-90 apple-transition"
                        >
                          <Edit2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        </button>
                        <button
                          onClick={() => setIsDeletingReceipt(receipt.id)}
                          className="p-2.5 md:p-3 bg-red-50 border border-red-100 shadow-sm rounded-xl text-red-600 hover:bg-red-100 hover:text-red-700 active:scale-90 apple-transition"
                        >
                          <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderLedger = () => {
    const filteredLedger = selectedVendor
      ? ledger.filter((e) => e.vendorId === selectedVendor.id)
      : ledger;
      
    // Sort ledger by date ASC
    const sortedLedger = [...filteredLedger].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const totals = sortedLedger.reduce(
      (acc, curr) => {
        if (curr.type === "CREDIT") acc.credit += curr.amount;
        else acc.debit += curr.amount;
        return acc;
      },
      { credit: 0, debit: 0 },
    );

    // Calculate the implied total opening balance based on the current outstanding balance vs statement sum
    const currentTotalOutstanding = selectedVendor
      ? (selectedVendor.outstandingBalance || 0)
      : vendors.reduce((acc, v) => acc + (v.outstandingBalance || 0), 0);
      
    const netStatementBalance = totals.credit - totals.debit;
    const openingBalance = currentTotalOutstanding - netStatementBalance;

    return (
      <div className="space-y-6 md:space-y-10">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex flex-wrap items-center gap-3 md:gap-6">
            <h2 className="text-2xl md:text-3xl font-black text-ink tracking-tight">
              Vendor Ledger
            </h2>
            {selectedVendor && (
              <div className="flex items-center gap-3 md:gap-4 bg-slate-900 text-white px-4 md:px-6 py-1.5 md:py-2 rounded-xl md:rounded-2xl text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] shadow-xl">
                <Users className="w-3.5 h-3.5 md:w-4 md:h-4 opacity-50" />
                <span className="truncate max-w-[100px] md:max-w-none">
                  {selectedVendor.name}
                </span>
                <button
                  onClick={() => setSelectedVendor(null)}
                  className="p-1 hover:bg-surface/10 rounded-lg apple-transition"
                >
                  <X className="w-3.5 h-3.5 md:w-4 md:h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="bg-surface rounded-[24px] md:rounded-[40px] shadow-[0_10px_40px_rgba(0,0,0,0.02)] md:shadow-[0_20px_60px_rgba(0,0,0,0.03)] border border-slate-50 overflow-hidden">
          <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full text-left min-w-[700px] md:min-w-[800px]">
              <thead>
                <tr className="bg-slate-900 text-white/40 border-b border-white/5">
                  <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.3em] text-white/30 italic">
                    Timeline
                  </th>
                  <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.3em] text-white/80">
                    Entity Partner
                  </th>
                  <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.3em] text-white/80">
                    Designation
                  </th>
                  <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.3em] text-white/80 text-right">
                    CR (+)
                  </th>
                  <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.3em] text-white/80 text-right">
                    DR (-)
                  </th>
                  {!strictDataEntry && (
                    <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.3em] text-white/30 text-right">
                      Ops
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                <tr className="bg-slate-50/50">
                  <td className="px-6 md:px-10 py-5 md:py-8 font-mono text-[9px] md:text-[10px] font-bold text-ink-muted">
                    -
                  </td>
                  <td className="px-6 md:px-10 py-5 md:py-8 text-ink-muted text-sm md:text-base font-bold">
                    {selectedVendor ? selectedVendor.name : "All Vendors"}
                  </td>
                  <td className="px-6 md:px-10 py-5 md:py-8 text-ink-muted text-xs font-bold tracking-widest uppercase">
                    OPENING BALANCE
                  </td>
                  <td className="px-6 md:px-10 py-5 md:py-8 text-right font-bold text-ink text-base md:text-lg font-mono">
                    {openingBalance >= 0 ? `₹${openingBalance.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "-"}
                  </td>
                  <td className="px-6 md:px-10 py-5 md:py-8 text-right font-bold text-indigo-600 text-base md:text-lg font-mono">
                    {openingBalance < 0 ? `₹${Math.abs(openingBalance).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "-"}
                  </td>
                  {!strictDataEntry && <td className="px-6 md:px-10 py-5 md:py-8 text-right"></td>}
                </tr>
                {sortedLedger.map((entry) => (
                  <tr
                    key={entry.id}
                    className="group hover:bg-panel/50 apple-transition"
                  >
                    <td className="px-6 md:px-10 py-5 md:py-8 font-mono text-[9px] md:text-[10px] font-bold text-ink-muted group-hover:text-ink apple-transition">
                      {new Date(entry.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 md:px-10 py-5 md:py-8">
                      <div className="font-bold text-ink text-sm md:text-base tracking-tight leading-none mb-1 truncate max-w-[150px]">
                        {vendors.find((v) => v.id === entry.vendorId)?.name ||
                          "Unknown Partner"}
                      </div>
                      <div className="text-[8px] md:text-[10px] font-black text-indigo-500/50 uppercase tracking-widest">
                        {entry.referenceType === "GRN" ? "MATERIAL INVOICE" : (entry.referenceType || "OFS")}
                      </div>
                    </td>
                    <td className="px-6 md:px-10 py-5 md:py-8">
                      <div className="text-[11px] md:text-xs font-medium text-ink-muted tracking-tight leading-relaxed max-w-[200px] md:max-w-[300px] line-clamp-2">
                        {entry.description}
                      </div>
                      {entry.overrideReason && (
                        <div className="text-[8px] md:text-[9px] font-bold text-amber-600 mt-1 uppercase tracking-widest border border-amber-200/50 bg-amber-50 px-1.5 py-0.5 rounded-md inline-block">
                          ⚠️ Override: {entry.overrideReason}
                        </div>
                      )}
                    </td>
                    <td className="px-6 md:px-10 py-5 md:py-8 text-right font-bold text-ink text-base md:text-lg font-mono tracking-tighter">
                      {entry.type === "CREDIT"
                        ? `₹${entry.amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
                        : "-"}
                    </td>
                    <td className="px-6 md:px-10 py-5 md:py-8 text-right font-bold text-indigo-600 text-base md:text-lg font-mono tracking-tighter">
                      {entry.type === "DEBIT"
                        ? `₹${entry.amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
                        : "-"}
                    </td>
                    {!strictDataEntry && (
                      <td className="px-6 md:px-10 py-5 md:py-8 text-right">
                        {entry.referenceType === "PAYMENT" ? (
                          <div className="flex justify-end gap-1.5 md:gap-2">
                            <button
                              onClick={() => {
                                setNewPayment({
                                  supplierId: entry.vendorId,
                                  amount: entry.amount,
                                  date: new Date(entry.date)
                                    .toISOString()
                                    .split("T")[0],
                                  description: entry.description,
                                });
                                setEditingPaymentId(entry.id);
                                setIsAddingPayment(true);
                              }}
                              className="p-2.5 md:p-3 bg-blue-50 border border-blue-100 shadow-sm rounded-xl text-blue-600 hover:bg-blue-100 hover:text-blue-700 active:scale-90 apple-transition"
                            >
                              <Edit2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteLedgerEntry(entry.id)}
                              className="p-2.5 md:p-3 bg-red-50 border border-red-100 shadow-sm rounded-xl text-red-600 hover:bg-red-100 hover:text-red-700 active:scale-90 apple-transition"
                            >
                              <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                            </button>
                          </div>
                        ) : entry.referenceType === "GRN" ? (
                          <div className="flex justify-end gap-1.5 md:gap-2">
                            <button
                              onClick={() => {
                                const receiptToEdit = receipts.find((r) => r.id === entry.referenceId);
                                if (receiptToEdit) {
                                  setSelectedReceipt(receiptToEdit);
                                  setNewReceipt(receiptToEdit);
                                  setIsEditingReceipt(true);
                                  setIsAddingReceipt(true);
                                }
                              }}
                              className="p-2.5 md:p-3 bg-blue-50 border border-blue-100 shadow-sm rounded-xl text-blue-600 hover:bg-blue-100 hover:text-blue-700 active:scale-90 apple-transition"
                            >
                              <Edit2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                            </button>
                            <button
                              onClick={() => setIsDeletingReceipt(entry.referenceId || null)}
                              className="p-2.5 md:p-3 bg-red-50 border border-red-100 shadow-sm rounded-xl text-red-600 hover:bg-red-100 hover:text-red-700 active:scale-90 apple-transition"
                            >
                              <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1.5 md:gap-2">
                            <button
                              onClick={() => handleDeleteLedgerEntry(entry.id)}
                              className="p-2.5 md:p-3 bg-red-50 border border-red-100 shadow-sm rounded-xl text-red-600 hover:bg-red-100 hover:text-red-700 active:scale-90 apple-transition"
                            >
                              <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900 border-t border-white/5">
                <tr className="font-black text-sm">
                  <td
                    colSpan={3}
                    className="px-6 md:px-10 py-6 md:py-10 text-right uppercase tracking-[0.4em] text-white/20 text-[9px] md:text-[11px]"
                  >
                    Outstanding Statement Balance
                  </td>
                  <td
                    colSpan={strictDataEntry ? 2 : 3}
                    className="px-6 md:px-10 py-6 md:py-10 text-right text-2xl md:text-4xl text-white font-black tracking-tighter font-mono"
                  >
                    ₹{currentTotalOutstanding.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 md:space-y-12 pb-24 md:pb-32">
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 md:gap-8 bg-surface/70 backdrop-blur-xl p-4 md:p-6 rounded-[24px] md:rounded-[32px] border border-white shadow-sm">
        <div className="flex gap-2 bg-panel/50 p-1 md:p-1.5 rounded-xl md:rounded-2xl w-full md:w-fit overflow-x-auto scrollbar-hide ring-1 ring-slate-200/50">
          {(["purchase_orders", "goods_receipt", "receipts", "ledger", "vendors"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 md:flex-none px-4 md:px-8 py-2 md:py-2.5 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-bold uppercase tracking-[0.15em] md:tracking-[0.2em] apple-transition whitespace-nowrap ${activeTab === tab ? "bg-surface shadow-sm text-indigo-600 ring-1 ring-slate-200" : "text-ink-muted hover:text-ink/80"}`}
            >
              {tab === "purchase_orders" ? "Purchase Orders" : tab === "goods_receipt" ? "Goods Receipt" : tab === "receipts" ? "Receipts" : tab === "ledger" ? "Ledger" : "Vendors"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="hidden sm:flex flex-1 md:flex-none items-center justify-center gap-2 px-4 py-2 bg-indigo-50 rounded-lg md:rounded-2xl">
            <Users className="w-3.5 h-3.5 text-indigo-600" />
            <span className="text-[9px] md:text-[10px] font-black text-indigo-600 uppercase tracking-widest">
              {vendors.length} Partners
            </span>
          </div>
          <button
            onClick={handleExportReport}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-panel text-ink px-4 md:px-6 py-2 md:py-2.5 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-divider apple-transition border border-divider"
          >
            <Download className="w-3.5 h-3.5 md:w-4 md:h-4" /> Export
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "purchase_orders" && <PurchaseOrderTab projectId={projectId} />}
          {activeTab === "goods_receipt" && <GoodsReceiptTab projectId={projectId} />}
          {activeTab === "vendors" && renderVendors()}
          {activeTab === "receipts" && renderReceipts()}
          {activeTab === "ledger" && renderLedger()}
        </motion.div>
      </AnimatePresence>

      {/* Modals with responsive widths */}
      <AnimatePresence>
        {isAddingVendor && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-surface rounded-[32px] w-full max-w-lg overflow-hidden"
            >
              <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black">
                    {isEditingVendor ? "Edit Party" : "Add Party"}
                  </h3>
                  <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-1">
                    Vendor Master Profile
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingVendor(false);
                    setIsEditingVendor(false);
                    setSelectedVendor(null);
                    setNewVendor({
                      name: "",
                      type: "Material",
                      contactPerson: "",
                      email: "",
                      phone: "",
                      address: "",
                      outstandingBalance: 0,
                    });
                  }}
                  className="p-2 hover:bg-surface/10 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form
                onSubmit={handleAddVendor}
                className="p-8 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-ink-muted ml-1">
                      Entity Name
                    </label>
                    <input
                      required
                      placeholder="E.g. United Steel Corp"
                      className="w-full bg-panel p-4 rounded-xl font-bold border-2 border-transparent focus:border-indigo-500 outline-none"
                      value={newVendor.name}
                      onChange={(e) =>
                        setNewVendor({ ...newVendor, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-ink-muted ml-1">
                      Vendor Category
                    </label>
                    <select
                      className="w-full bg-panel p-4 rounded-xl font-bold appearance-none border-2 border-transparent focus:border-indigo-500 outline-none"
                      value={newVendor.type}
                      onChange={(e) =>
                        setNewVendor({
                          ...newVendor,
                          type: e.target.value as any,
                        })
                      }
                    >
                      <option value="Material">Material</option>
                      <option value="Labor">Labor</option>
                      <option value="Both">Both</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-ink-muted ml-1">
                      Contact Person
                    </label>
                    <input
                      placeholder="Name"
                      className="w-full bg-panel p-4 rounded-xl font-bold border-2 border-transparent focus:border-indigo-500 outline-none"
                      value={newVendor.contactPerson}
                      onChange={(e) =>
                        setNewVendor({
                          ...newVendor,
                          contactPerson: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-ink-muted ml-1">
                      Email ID
                    </label>
                    <input
                      type="email"
                      placeholder="vendor@info.com"
                      className="w-full bg-panel p-4 rounded-xl font-bold border-2 border-transparent focus:border-indigo-500 outline-none"
                      value={newVendor.email}
                      onChange={(e) =>
                        setNewVendor({ ...newVendor, email: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-ink-muted ml-1">
                      Phone Number
                    </label>
                    <input
                      placeholder="+91 00000 00000"
                      className="w-full bg-panel p-4 rounded-xl font-bold border-2 border-transparent focus:border-indigo-500 outline-none"
                      value={newVendor.phone}
                      onChange={(e) =>
                        setNewVendor({ ...newVendor, phone: e.target.value })
                      }
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-ink-muted ml-1">
                      Business Address
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Full address"
                      className="w-full bg-panel p-4 rounded-xl font-bold border-2 border-transparent focus:border-indigo-500 outline-none resize-none"
                      value={newVendor.address}
                      onChange={(e) =>
                        setNewVendor({ ...newVendor, address: e.target.value })
                      }
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 apple-transition mt-4"
                >
                  {isEditingVendor ? "Update Profile" : "Register Party"}
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {isDeletingVendor != null && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-surface rounded-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-6 text-center space-y-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-ink">
                    Delete Party?
                  </h3>
                  <p className="text-sm text-ink-muted mt-1">
                    Are you sure you want to delete this vendor? This
                    action cannot be undone.
                  </p>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setIsDeletingVendor(null)}
                    className="flex-1 py-3 bg-panel hover:bg-divider rounded-xl font-bold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDeleteVendor(isDeletingVendor)}
                    disabled={isDeleting}
                    className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {isDeletingReceipt != null && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-surface rounded-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-6 text-center space-y-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-ink">
                    Delete Receipt?
                  </h3>
                  <p className="text-sm text-ink-muted mt-1">
                    Are you sure you want to delete this material receipt? 
                    This will revert the warehouse inventory and vendor ledger.
                  </p>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setIsDeletingReceipt(null)}
                    disabled={isDeleting}
                    className="flex-1 py-3 bg-panel hover:bg-divider rounded-xl font-bold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDeleteReceipt(isDeletingReceipt)}
                    disabled={isDeleting}
                    className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {isAddingPayment && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-surface rounded-[32px] w-full max-w-md overflow-hidden"
            >
              <div className="bg-emerald-600 p-8 text-white flex justify-between items-center">
                <h3 className="text-xl font-black">
                  {editingPaymentId ? "Edit Payment" : "Record Payment"}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingPayment(false);
                    setEditingPaymentId(null);
                  }}
                  className="p-2 hover:bg-surface/10 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleAddPayment} className="p-8 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted ml-1">
                    Vendor
                  </label>
                  <select
                    required
                    className="w-full bg-panel p-4 rounded-xl font-bold appearance-none"
                    value={newPayment.supplierId}
                    onChange={(e) =>
                      setNewPayment({
                        ...newPayment,
                        supplierId: e.target.value,
                      })
                    }
                  >
                    <option value="">Select Vendor</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted ml-1">
                    Amount (₹)
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="Amount (₹)"
                    className="w-full bg-panel p-4 rounded-xl font-black text-xl text-emerald-600"
                    value={newPayment.amount || ""}
                    onChange={(e) =>
                      setNewPayment({
                        ...newPayment,
                        amount: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted ml-1">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    className="w-full bg-panel p-4 rounded-xl font-bold"
                    value={newPayment.date}
                    onChange={(e) =>
                      setNewPayment({ ...newPayment, date: e.target.value })
                    }
                  />
                </div>
                
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted ml-1">
                    Invoice (Optional)
                  </label>
                  <select
                    className="w-full bg-panel p-4 rounded-xl font-bold appearance-none"
                    value={newPayment.receiptId}
                    onChange={(e) => {
                       const rcptId = e.target.value;
                       const rcpt = receipts.find(r => r.id === rcptId);
                       setNewPayment({
                         ...newPayment,
                         receiptId: rcptId,
                         amount: rcpt ? rcpt.totalAmount : newPayment.amount
                       });
                    }}
                  >
                    <option value="">No Invoice (Advance/General)</option>
                    {receipts.filter(r => r.supplierId === newPayment.supplierId).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.invoiceNumber} - ₹{r.totalAmount.toLocaleString("en-IN")} ({r.matchStatus || "Unlinked"})
                      </option>
                    ))}
                  </select>
                </div>
                
                {(() => {
                   const selectedRcpt = receipts.find(r => r.id === newPayment.receiptId);
                   if (selectedRcpt && selectedRcpt.matchStatus === "Has Discrepancies") {
                      return (
                        <div className="space-y-1 bg-amber-50 p-4 rounded-xl border border-amber-200">
                          <label className="text-[10px] font-black uppercase tracking-widest text-amber-700 ml-1">
                            Discrepancy Override Reason
                          </label>
                          <input
                            required
                            placeholder="Why are we paying this despite the discrepancy?"
                            className="w-full bg-white p-3 rounded-xl font-bold border border-amber-300 placeholder:text-amber-300"
                            value={newPayment.overrideReason}
                            onChange={(e) =>
                              setNewPayment({
                                ...newPayment,
                                overrideReason: e.target.value,
                              })
                            }
                          />
                        </div>
                      );
                   }
                   return null;
                })()}

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted ml-1">
                    Notes
                  </label>
                  <input
                    placeholder="Short Note"
                    className="w-full bg-panel p-4 rounded-xl font-bold"
                    value={newPayment.description}
                    onChange={(e) =>
                      setNewPayment({
                        ...newPayment,
                        description: e.target.value,
                      })
                    }
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-emerald-600 text-white py-4 rounded-xl font-black uppercase tracking-widest"
                >
                  {editingPaymentId ? "Update Payment" : "Post Payment"}
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {isAddingReceipt && (
          <MaterialReceiptForm
            projectId={projectId}
            vendors={vendors}
            inventory={inventory}
            allPOs={purchaseOrders}
            allGRNs={grns}
            existingReceipt={isEditingReceipt ? selectedReceipt : null}
            onClose={() => {
              setIsAddingReceipt(false);
              setIsEditingReceipt(false);
              setSelectedReceipt(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
