import React, { useState, useEffect, useMemo } from "react";
import { exportToCSV, exportToPDF } from "../utils/exportUtils";
import { useTranslation } from "../i18n";
import { demoRequested } from "../demo";
import {
  demoCollections,
} from "@demo";
import {
  listMasterVendors,
  saveMasterVendor,
  findDuplicates,
  toProjectVendor,
  MasterVendor,
} from "../services/masterVendorService";
import { PurchaseOrderTab } from "./purchase/PurchaseOrderTab";
import { GoodsReceiptTab } from "./purchase/GoodsReceiptTab";
import { MaterialReceiptForm } from "./purchase/MaterialReceiptForm";
import { ScanInvoice } from "./purchase/ScanInvoice";
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
  GoodsReceiptNote,
  VendorBill,
} from "../types";
import {
  Truck,
  Plus,
  MagnifyingGlass as Search,
  CurrencyInr as IndianRupee,
  Trash as Trash2,
  PencilSimple as Edit2,
  X,
  BookmarkSimple,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  ClockCounterClockwise as History,
  CheckCircle as CheckCircle2,
  WarningCircle as AlertCircle,
  Calendar,
  Package,
  CaretRight as ChevronRight,
  Funnel as Filter,
  DownloadSimple as Download,
  Sparkle,
  FloppyDisk as Save,
  Users,
  Phone,
  EnvelopeSimple as Mail,
  MapPin,
  HandCoins,
  Wallet,
} from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import { useUIStore, useAuthStore } from "../store";
import { useBreakpoint } from "../hooks/useBreakpoint";
// Removed unused import

interface ProcurementViewProps {
  projectId: string;
}

type Tab =
  | "purchase_orders"
  | "goods_receipt"
  | "bills"
  | "receipts"
  | "ledger"
  | "vendors";

export const ProcurementView: React.FC<ProcurementViewProps> = ({
  projectId,
}) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const basePath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;
  const isAdminOrOwner = user?.role === "Admin" || user?.role === "Owner";
  const breakpoint = useBreakpoint();

  const [activeTab, setActiveTab] = useState<Tab>("purchase_orders");
  const [showScanInvoice, setShowScanInvoice] = useState(false);
  const [bills, setBills] = useState<VendorBill[]>([]);
  const [reviewBill, setReviewBill] = useState<VendorBill | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [receipts, setReceipts] = useState<MaterialReceipt[]>([]);
  const [ledger, setLedger] = useState<VendorLedgerEntry[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [grns, setGrns] = useState<GoodsReceiptNote[]>([]);

  // Modals
  const [isAddingVendor, setIsAddingVendor] = useState(false);
  // ---- Organisation vendor master (definitions shared across projects) ----
  // Picking a master COPIES it into this project's suppliers, so every existing
  // ledger, PO and GRN path keeps working on the project document as before.
  const [masters, setMasters] = useState<MasterVendor[]>([]);
  const [showMasterPicker, setShowMasterPicker] = useState(false);
  const [masterBusy, setMasterBusy] = useState(false);
  useEffect(() => {
    listMasterVendors().then(setMasters);
  }, []);

  const addFromMaster = async (master: MasterVendor) => {
    const already = (vendors || []).find(
      (v: any) => v.masterVendorId === master.id ||
        (v.name || "").trim().toLowerCase() === master.name.trim().toLowerCase(),
    );
    if (already) {
      alert(`"${master.name}" is already a party on this project.`);
      return;
    }
    setMasterBusy(true);
    try {
      await addDoc(collection(db, `${basePath}/suppliers`), toProjectVendor(master, projectId));
      setShowMasterPicker(false);
    } catch (err) {
      console.error("Add from master failed", err);
      alert("Couldn't add that party to the project. Please try again.");
    } finally {
      setMasterBusy(false);
    }
  };

  // Bulk lift: every party on this project that isn't in the master yet — the
  // path for a project whose parties are already entered.
  const promoteAllVendors = async () => {
    const missing = (vendors || []).filter(
      (v: any) => findDuplicates(v, masters).length === 0,
    );
    if (!missing.length) {
      alert("Every party on this project is already in your master list.");
      return;
    }
    if (!window.confirm(
      `Save ${missing.length} part${missing.length === 1 ? "y" : "ies"} to your organisation master?\n\n` +
      missing.slice(0, 12).map((v: any) => `• ${v.name}`).join("\n") +
      (missing.length > 12 ? `\n…and ${missing.length - 12} more` : "") +
      `\n\nOnly contact details are shared — balances and ledgers stay with this project. Parties already in the master are skipped.`,
    )) return;
    setMasterBusy(true);
    let ok = 0;
    const failed: string[] = [];
    try {
      for (const v of missing) {
        try {
          await saveMasterVendor({
            name: v.name,
            type: v.type || "Material",
            gstin: (v as any).gstin || "",
            contactPerson: v.contactPerson || "",
            email: v.email || "",
            phone: v.phone || "",
            address: v.address || "",
          });
          ok++;
        } catch { failed.push(v.name); }
      }
      setMasters(await listMasterVendors());
      alert(
        failed.length
          ? `Saved ${ok}. Couldn't save ${failed.length}: ${failed.slice(0, 5).join(", ")}${failed.length > 5 ? "…" : ""}`
          : `Saved ${ok} part${ok === 1 ? "y" : "ies"} to your master list.`,
      );
    } finally { setMasterBusy(false); }
  };

  // Promote a project party up to the organisation master so other projects
  // can reuse it. Only the definition travels — never the balance.
  const promoteToMaster = async (v: any) => {
    const dupes = findDuplicates(v, masters);
    if (dupes.length) {
      if (!window.confirm(
        `"${dupes[0].name}" already looks like the same party in your master list.\n\nSave "${v.name}" anyway as a separate entry?`,
      )) return;
    } else if (!window.confirm(
      `Save "${v.name}" to your organisation master?\n\nOnly the contact details are shared — the balance and ledger stay with this project.`,
    )) return;
    setMasterBusy(true);
    try {
      await saveMasterVendor({
        name: v.name,
        type: v.type || "Material",
        gstin: v.gstin || "",
        contactPerson: v.contactPerson || "",
        email: v.email || "",
        phone: v.phone || "",
        address: v.address || "",
      });
      setMasters(await listMasterVendors());
      alert(`"${v.name}" is now available on every project in your organisation.`);
    } catch (err: any) {
      console.error("Promote to master failed", err);
      alert(
        err?.code === "permission-denied"
          ? "Only an Owner, Admin or Manager can update the organisation master."
          : "Couldn't save to the master list. Please try again.",
      );
    } finally {
      setMasterBusy(false);
    }
  };

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

  // Opening balance is not stored — it's whatever part of the vendor's outstanding
  // balance the ledger doesn't explain. We edit it here and translate it back into
  // outstandingBalance on save.
  const [openingBalanceInput, setOpeningBalanceInput] = useState(0);

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
    // This screen subscribes to Firestore directly rather than going through
    // the shared query layer, so demo mode has to be handled here too.
    if (__DEMO__ && demoRequested()) {
      setVendors((demoCollections.suppliers || []) as any);
      setReceipts((demoCollections.receipts || []) as any);
      setLedger((demoCollections.ledger || []) as any);
      setInventory((demoCollections.inventory || []) as any);
      setPurchaseOrders((demoCollections.purchase_orders || []) as any);
      setGrns((demoCollections.goodsReceiptNotes || []) as any);
      return;
    }
    const vendorsPath = `${basePath}/suppliers`;
    const receiptsPath = `${basePath}/receipts`;
    const ledgerPath = `${basePath}/ledger`;
    const inventoryPath = `${basePath}/inventory`;
    const poPath = `${basePath}/purchase_orders`;
    const grnPath = `${basePath}/goodsReceiptNotes`;

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
        console.log("Fetched ledger:", snapshot.docs.map((d) => d.data())); setLedger(
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
        setPurchaseOrders(
          snapshot.docs.map((doc) => doc.data() as PurchaseOrder),
        );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, poPath),
    );

    const unsubGRNs = onSnapshot(
      query(collection(db, grnPath)),
      (snapshot) => {
        setGrns(snapshot.docs.map((doc) => doc.data() as GoodsReceiptNote));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, grnPath),
    );

    const billsPath = `${basePath}/vendor_bills`;
    const unsubBills = onSnapshot(
      query(collection(db, billsPath)),
      (snapshot) => {
        setBills(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as VendorBill));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, billsPath),
    );

    return () => {
      unsubVendors();
      unsubReceipts();
      unsubLedger();
      unsubInventory();
      unsubPOs();
      unsubGRNs();
      unsubBills();
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
            `${basePath}/receipts/${selectedReceipt.id}`,
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
          const itemRef = doc(db, `${basePath}/inventory/${itemId}`);
          const snap = await transaction.get(itemRef);
          inventoryItemDocs[itemId] = snap;
          if (snap.exists()) {
            inventoryState[itemId] = snap.data() as InventoryItem;
          }
        }

        const vendorRef = doc(
          db,
          `${basePath}/suppliers/${newReceipt.supplierId}`,
        );
        const vendorDoc = await transaction.get(vendorRef);
        if (!vendorDoc.exists()) throw new Error("Vendor not found");

        let oldVendorDoc = null;
        if (oldData && oldData.supplierId !== newReceipt.supplierId) {
          const oldVendorRef = doc(
            db,
            `${basePath}/suppliers/${oldData.supplierId}`,
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
            ? doc(db, `${basePath}/receipts/${selectedReceipt.id}`)
            : doc(collection(db, `${basePath}/receipts`));

        const ledgerRef =
          isEditingReceipt && selectedReceipt && selectedReceipt.ledgerId
            ? doc(
                db,
                `${basePath}/ledger/${selectedReceipt.ledgerId}`,
              )
            : doc(collection(db, `${basePath}/ledger`));

        const costRef = (isEditingReceipt && selectedReceipt && (selectedReceipt as any).costEntryId) 
            ? doc(db, `${basePath}/costs`, (selectedReceipt as any).costEntryId) 
            : doc(collection(db, `${basePath}/costs`));

        transaction.set(receiptRef, {
          ...newReceipt,
          items: validItems,
          projectId,
          supplierName: vendorData.name,
          totalAmount,
          id: receiptRef.id,
          ledgerId: ledgerRef.id,
          costEntryId: costRef.id,
        });

        transaction.set(costRef, {
          id: costRef.id,
          projectId,
          date: new Date(newReceipt.receiptDate || "").toISOString(),
          category: "Material",
          type: "Actual",
          amount: totalAmount,
          description: `Material Inward - Invoice: ${newReceipt.invoiceNumber} (${vendorData.name})`,
          taskId: "",
          isAccrual: true
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
          `${basePath}/receipts/${receiptId}`,
        );
        const receiptSnapshot = await transaction.get(receiptRef);
        if (!receiptSnapshot.exists()) return;
        const receiptData = receiptSnapshot.data() as MaterialReceipt;

        const vendorRef = doc(
          db,
          `${basePath}/suppliers/${receiptData.supplierId}`,
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
            doc(db, `${basePath}/ledger/${receiptData.ledgerId}`),
          );
        if ((receiptData as any).costEntryId)
          transaction.delete(
            doc(db, `${basePath}/costs/${(receiptData as any).costEntryId}`),
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
            `${basePath}/ledger/${editingPaymentId}`,
          );
          const ledgerDoc = await transaction.get(ledgerRef);
          if (!ledgerDoc.exists()) return;
          const oldData = ledgerDoc.data() as VendorLedgerEntry;

          const vendorRef = doc(
            db,
            `${basePath}/suppliers/${newPayment.supplierId}`,
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
            `${basePath}/suppliers/${newPayment.supplierId}`,
          );
          const vendorDoc = await transaction.get(vendorRef);
          if (!vendorDoc.exists()) return;

          const ledgerRef = doc(collection(db, `${basePath}/ledger`));

          let overrideFields = {};
          if (newPayment.receiptId) {
            const rcpt = receipts.find((r) => r.id === newPayment.receiptId);
            if (rcpt && rcpt.matchStatus === "Has Discrepancies") {
              overrideFields = {
                overriddenBy:
                  user?.displayName || user?.email || user?.uid || "Admin",
                overrideReason:
                  newPayment.overrideReason || "Discrepancy accepted",
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
            ...overrideFields,
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
        const ledgerRef = doc(db, `${basePath}/ledger/${entryId}`);
        const ledgerDoc = await transaction.get(ledgerRef);
        if (!ledgerDoc.exists()) return;
        const data = ledgerDoc.data() as VendorLedgerEntry;

        const vendorRef = doc(
          db,
          `${basePath}/suppliers/${data.vendorId}`,
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

  const getExportData = () => {
    let dataToExport: (string | number)[][] = [];
    let title = "";
    let baseFileName = "";
    let headers: string[] = [];

    const dateSuffix = new Date().toISOString().split("T")[0];

    if (activeTab === "vendors") {
      title = "Vendors & Partners Registry";
      baseFileName = `vendors_${dateSuffix}`;
      headers = [
        "Name",
        "Type",
        "Contact",
        "Email",
        "Phone",
        "Address",
        "Outstanding Balance (₹)",
      ];
      dataToExport = vendors.map((v) => [
        v.name,
        v.type,
        v.contactPerson || "-",
        v.email || "-",
        v.phone || "-",
        v.address || "-",
        getVendorBalance(v.id),
      ]);
    } else if (activeTab === "receipts") {
      title = "Material Receipts Register";
      baseFileName = `material_receipts_${dateSuffix}`;
      headers = ["Date", "Vendor", "Invoice Number", "Items", "Total Amount (₹)"];
      dataToExport = receipts.map((r) => [
        r.receiptDate,
        r.supplierName,
        r.invoiceNumber,
        r.items.map((i) => `${i.name} (Qty: ${i.quantity})`).join("; "),
        r.totalAmount,
      ]);
    } else if (activeTab === "ledger") {
      const filteredLedger = selectedVendor
        ? ledger.filter((e) => e.vendorId === selectedVendor.id)
        : ledger;
      title = selectedVendor ? `Vendor Ledger - ${selectedVendor.name}` : "General Vendor Ledger";
      baseFileName = selectedVendor
        ? `ledger_${selectedVendor.name.replace(/\s+/g, "_")}_${dateSuffix}`
        : `ledger_all_${dateSuffix}`;
      headers = ["Date", "Vendor", "Type", "Description", "Amount (₹)"];
      dataToExport = filteredLedger.map((e) => [
        new Date(e.date).toLocaleDateString("en-IN"),
        vendors.find((v) => v.id === e.vendorId)?.name || "Unknown",
        e.type,
        e.description,
        e.amount,
      ]);
    }

    return { headers, dataToExport, title, baseFileName };
  };

  const handleExportCSV = () => {
    const { headers, dataToExport, baseFileName } = getExportData();
    if (dataToExport.length === 0) return;
    exportToCSV(baseFileName, headers, dataToExport);
  };

  const handleExportPDF = () => {
    const { headers, dataToExport, title, baseFileName } = getExportData();
    if (dataToExport.length === 0) return;
    const formattedRows = dataToExport.map((row) =>
      row.map((val) => typeof val === "number" ? `₹${val.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : val)
    );
    exportToPDF(title, `Project ID: ${projectId}`, headers, formattedRows, baseFileName);
  };

  // Net of the vendor's ledger rows (credits - debits) — the same figure the
  // ledger view subtracts from outstandingBalance to display opening balance.
  const netStatementFor = (vendorId?: string) => {
    if (!vendorId) return 0;
    return ledger
      .filter((e) => e.vendorId === vendorId)
      .reduce(
        (acc, e) => acc + (e.type === "CREDIT" ? e.amount : -e.amount),
        0,
      );
  };

  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEditingVendor && selectedVendor) {
        // Store opening balance + what the ledger already accounts for, so the
        // ledger view renders exactly the opening balance that was entered.
        await updateDoc(
          doc(db, `${basePath}/suppliers/${selectedVendor.id}`),
          {
            ...newVendor,
            outstandingBalance:
              openingBalanceInput + netStatementFor(selectedVendor.id),
          },
        );
      } else {
        // A brand-new vendor has no ledger history, so it starts at its opening balance.
        await addDoc(collection(db, `${basePath}/suppliers`), {
          ...newVendor,
          projectId,
          outstandingBalance: openingBalanceInput,
        });
      }
      setIsAddingVendor(false);
      setIsEditingVendor(false);
      setSelectedVendor(null);
      setOpeningBalanceInput(0);
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
      await deleteDoc(doc(db, `${basePath}/suppliers/${vendorId}`));
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

  const renderBills = () => {
    const posted = bills.filter((b) => b.status !== "pending_review");
    const pending = bills.filter((b) => b.status === "pending_review");
    const inr = (n: number) => `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
    const inputGST = posted.reduce(
      (a, b) => a + (b.totalCGST || 0) + (b.totalSGST || 0) + (b.totalIGST || 0),
      0,
    );
    const totalPayable = posted.reduce((a, b) => a + (b.grandTotal || 0), 0);
    const sorted = [...bills].sort((a, b) => (a.status === "pending_review" ? -1 : 1) - (b.status === "pending_review" ? -1 : 1));

    const statusBadge = (b: VendorBill) => {
      if (b.status === "pending_review")
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-primary/15 text-[#B85F3B]">Pending review</span>;
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-success/15 text-success">Posted</span>;
    };
    const matchBadge = (m?: string) => {
      const map: any = {
        "Fully Matched": "bg-success/12 text-success",
        "Has Discrepancies": "bg-primary/12 text-[#C0653F]",
        Unlinked: "bg-danger/10 text-danger",
      };
      return m ? <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${map[m] || "bg-panel text-ink-muted"}`}>{m}</span> : null;
    };

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="soft-card p-5 squircle-24">
            <div className="text-[10px] font-black uppercase tracking-widest text-ink-muted mb-1">Input GST (ITC)</div>
            <div className="text-2xl font-black text-ink">{inr(inputGST)}</div>
            <div className="text-[10px] text-ink-muted mt-1">Claimable credit across posted bills</div>
          </div>
          <div className="soft-card p-5 squircle-24">
            <div className="text-[10px] font-black uppercase tracking-widest text-ink-muted mb-1">Billed (incl-GST)</div>
            <div className="text-2xl font-black text-ink">{inr(totalPayable)}</div>
            <div className="text-[10px] text-ink-muted mt-1">{posted.length} posted bill{posted.length === 1 ? "" : "s"}</div>
          </div>
          <div className="soft-card p-5 squircle-24">
            <div className="text-[10px] font-black uppercase tracking-widest text-ink-muted mb-1">Pending review</div>
            <div className="text-2xl font-black text-ink">{pending.length}</div>
            <div className="text-[10px] text-ink-muted mt-1">Scanned, awaiting confirm</div>
          </div>
        </div>

        <div className="bg-surface rounded-2xl border border-divider overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[720px]">
              <thead>
                <tr className="bg-panel border-b border-divider text-[10px] font-bold text-ink-muted uppercase tracking-widest">
                  <th className="p-4">Invoice</th>
                  <th className="p-4">Vendor</th>
                  <th className="p-4">PO</th>
                  <th className="p-4 text-right">Grand total</th>
                  <th className="p-4">Match</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-ink-muted text-sm">No vendor bills yet. Use <b>Scan Invoice</b> or send an invoice photo to the Telegram bot.</td></tr>
                ) : sorted.map((b) => (
                  <tr key={b.id} className="border-b border-divider/50">
                    <td className="p-4">
                      <div className="font-mono text-xs font-bold text-ink">{b.invoiceNumber || "—"}</div>
                      <div className="text-[10px] text-ink-muted">{b.invoiceDate || ""}{b.createdVia === "telegram" ? " · via Telegram" : ""}</div>
                    </td>
                    <td className="p-4 text-sm font-semibold text-ink">{b.vendorName || "—"}</td>
                    <td className="p-4 text-xs font-mono text-ink-muted">{b.poNumber || "—"}</td>
                    <td className="p-4 text-right text-sm font-mono font-medium">{inr(b.grandTotal)}</td>
                    <td className="p-4">{matchBadge(b.matchStatus)}</td>
                    <td className="p-4">{statusBadge(b)}</td>
                    <td className="p-4 text-right">
                      {b.status === "pending_review" ? (
                        <button
                          onClick={() => setReviewBill(b)}
                          className="px-3 py-1.5 bg-[#6E8CA0] text-white text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-[#5C7889]"
                        >
                          Review &amp; Post
                        </button>
                      ) : (
                        <span className="text-[10px] text-ink-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
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
              {t("views.activeVendors")}
            </h2>
            <p className="text-ink-muted font-bold text-[10px] md:text-sm tracking-tight uppercase tracking-[0.1em]">
              Vendor ecosystem and tracking.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button
            onClick={() => {
              setIsEditingVendor(false);
              setSelectedVendor(null);
              setOpeningBalanceInput(0);
              setIsAddingVendor(true);
            }}
            className="w-full sm:w-auto bg-surface-dark text-white px-5 md:px-8 py-3 md:py-3.5 rounded-xl md:rounded-2xl font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-[#3A4F5F] apple-transition shadow-lg shadow-drab/10 text-[10px]"
          >
            <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />{" "}
            <span>Add Party</span>
          </button>
          <button
            onClick={() => setShowMasterPicker(true)}
            className="w-full sm:w-auto bg-panel border border-divider text-ink px-5 md:px-6 py-3 md:py-3.5 rounded-xl md:rounded-2xl font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-surface apple-transition text-[10px]"
            title="Reuse a party already saved for your organisation"
          >
            <span>From master{masters.length ? ` (${masters.length})` : ""}</span>
          </button>
          <button
            onClick={promoteAllVendors}
            disabled={masterBusy || !vendors.length}
            className="w-full sm:w-auto bg-panel border border-divider text-ink px-5 md:px-6 py-3 md:py-3.5 rounded-xl md:rounded-2xl font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-surface apple-transition text-[10px] disabled:opacity-40"
            title="Add this project's parties to your organisation master"
          >
            <BookmarkSimple className="w-3.5 h-3.5" /> <span>Save to master</span>
          </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-surface border p-6 rounded-2xl shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm font-semibold text-ink-muted">
                  Total Payments Made
                </p>
                <h3 className="text-3xl font-black text-success mt-1">
                  ₹
                  {totalPayments.toLocaleString("en-IN", {
                    maximumFractionDigits: 0,
                  })}
                </h3>
              </div>
              <div className="bg-success/20 p-3 rounded-xl text-success">
                <HandCoins className="w-6 h-6" />
              </div>
            </div>
          </div>

          <div className="bg-surface border p-6 rounded-2xl shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm font-semibold text-ink-muted">
                  Total Outstanding Balance
                </p>
                <h3 className="text-3xl font-black text-danger mt-1">
                  ₹
                  {totalOutstanding.toLocaleString("en-IN", {
                    maximumFractionDigits: 0,
                  })}
                </h3>
              </div>
              <div className="bg-danger/15 p-3 rounded-xl text-danger">
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
              className="bg-surface p-5 md:p-6 rounded-2xl border border-divider/40 shadow-sm hover:shadow-xl apple-transition group relative overflow-hidden"
            >
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-6 md:mb-10">
                  <div className="bg-surface-dark p-2.5 md:p-4 rounded-xl md:rounded-2xl shadow-lg shadow-drab/5 group-hover:bg-primary apple-transition">
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
                          setOpeningBalanceInput(
                            (vendor.outstandingBalance || 0) -
                              netStatementFor(vendor.id),
                          );
                          setSelectedVendor(vendor);
                          setIsEditingVendor(true);
                          setIsAddingVendor(true);
                        }}
                        className="p-1.5 md:p-2 text-ink-muted hover:text-rust-strong apple-transition"
                      >
                        <Edit2 className="w-3.5 h-3.5 md:w-5 md:h-5" />
                      </button>
                      <button
                        onClick={() => promoteToMaster(vendor)}
                        disabled={masterBusy}
                        className={`p-1.5 md:p-2 apple-transition disabled:opacity-40 ${
                          (vendor as any).masterVendorId
                            ? "text-primary"
                            : "text-ink-muted hover:text-primary"
                        }`}
                        title={
                          (vendor as any).masterVendorId
                            ? "Linked to your organisation master"
                            : "Save this party to your organisation master"
                        }
                      >
                        <BookmarkSimple className="w-3.5 h-3.5 md:w-5 md:h-5" />
                      </button>
                      <button
                        onClick={() => setIsDeletingVendor(vendor.id)}
                        className="p-1.5 md:p-2 text-ink-muted hover:text-danger apple-transition"
                      >
                        <Trash2 className="w-3.5 h-3.5 md:w-5 md:h-5" />
                      </button>
                    </div>
                    <div className="text-right">
                      <p className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.3em] text-ink-muted">
                        Outstanding
                      </p>
                      <p
                        className={`text-lg md:text-xl font-black tracking-tighter ${getVendorBalance(vendor.id) > 0 ? "text-danger" : "text-success"}`}
                      >
                        ₹
                        {getVendorBalance(vendor.id).toLocaleString("en-IN", {
                          maximumFractionDigits: 0,
                        })}
                      </p>
                      <div className="mt-2">
                        <p className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.3em] text-ink-muted">
                          Payments Made
                        </p>
                        <p className="text-sm md:text-base font-bold text-success">
                          ₹
                          {ledger
                            .filter(
                              (l) =>
                                l.vendorId === vendor.id && l.type === "DEBIT",
                            )
                            .reduce((acc, l) => acc + (l.amount || 0), 0)
                            .toLocaleString("en-IN", {
                              maximumFractionDigits: 0,
                            })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 md:gap-3 mb-1">
                  <h3 className="text-base md:text-xl font-black text-ink tracking-tight group-hover:text-rust-strong apple-transition truncate">
                    {vendor.name}
                  </h3>
                </div>
                <p className="text-[10px] md:text-xs font-bold text-ink-muted mb-4 uppercase tracking-widest leading-none shrink-0">
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
                        setNewPayment({
                          ...newPayment,
                          supplierId: vendor.id,
                          receiptId: "",
                          overrideReason: "",
                        });
                        setIsAddingPayment(true);
                      }}
                      className="flex-[1.5] bg-surface-dark text-white py-2.5 md:py-3.5 rounded-lg md:rounded-2xl text-[8px] md:text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-[#3A4F5F] apple-transition shadow-md shadow-drab/5"
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
            {t("views.materialReceipts")}
          </h2>
          <p className="text-ink-muted font-bold text-xs md:text-sm tracking-tight uppercase tracking-[0.1em]">
            Inward orchestration record.
          </p>
        </div>
        <button
          onClick={() => {
            setSelectedReceipt(null);
            setNewReceipt({
              supplierId: "",
              receiptDate: new Date().toISOString().split("T")[0],
              vehicleNumber: "",
              challanNumber: "",
              items: [],
              status: "pending",
              poId: "",
              grnId: "",
            });
            setIsEditingReceipt(false);
            setIsAddingReceipt(true);
          }}
          className="w-full sm:w-auto bg-primary text-surface px-6 py-3 rounded-xl font-bold hover:bg-primary/90 transition-colors flex items-center justify-center shadow-lg shadow-primary/20"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Receipt
        </button>
      </div>

      <div className="bg-surface rounded-2xl shadow-sm border border-divider/40 overflow-hidden">
        {breakpoint === "desktop" ? (
          <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full text-left min-w-[700px] md:min-w-[800px]">
              <thead>
                <tr className="bg-surface-dark text-white/75 border-b border-white/10">
                  <th className="px-6 md:px-10 py-4 md:py-6 text-[10px] md:text-[10px] font-bold uppercase tracking-[0.3em] text-white/30 italic">
                    Timeline
                  </th>
                  <th className="px-6 md:px-10 py-4 md:py-6 text-[10px] md:text-[10px] font-bold uppercase tracking-[0.3em] text-white/80">
                    Vendor
                  </th>
                  <th className="px-6 md:px-10 py-4 md:py-6 text-[10px] md:text-[10px] font-bold uppercase tracking-[0.3em] text-white/30 italic">
                    Reference
                  </th>
                  <th className="px-6 md:px-10 py-4 md:py-6 text-[10px] md:text-[10px] font-bold uppercase tracking-[0.3em] text-white/80">
                    Items
                  </th>
                  <th className="px-6 md:px-10 py-4 md:py-6 text-[10px] md:text-[10px] font-bold uppercase tracking-[0.3em] text-white/80 text-right">
                    Total
                  </th>
                  {isAdminOrOwner && (
                    <th className="px-6 md:px-10 py-4 md:py-6 text-[10px] md:text-[10px] font-bold uppercase tracking-[0.3em] text-white/30 text-right">
                      Ops
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-divider/40">
                {receipts.map((receipt) => (
                  <tr
                    key={receipt.id}
                    className="group hover:bg-panel/50 apple-transition"
                  >
                    <td className="px-6 md:px-10 py-5 md:py-8 font-mono text-[10px] md:text-[10px] font-bold text-ink-muted group-hover:text-ink apple-transition">
                      {receipt.receiptDate}
                    </td>
                    <td className="px-6 md:px-10 py-5 md:py-8">
                      <div className="font-bold text-ink tracking-tight text-base md:text-lg leading-none mb-1 truncate max-w-[150px]">
                        {receipt.supplierName}
                      </div>
                      {receipt.poNumber && (
                        <div className="text-[8px] md:text-[10px] font-black text-rust-strong uppercase tracking-widest mt-1">
                          PO: {receipt.poNumber}
                        </div>
                      )}
                    </td>
                    <td className="px-6 md:px-10 py-5 md:py-8">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] md:text-[10px] font-bold text-rust-strong bg-[#F7E4DB]/50 px-2 md:px-3 py-1 md:py-1.5 rounded-full border border-[#F7E4DB]/50 shadow-sm">
                          {receipt.invoiceNumber}
                        </span>
                        {receipt.matchStatus === "Fully Matched" && (
                          <span className="font-bold text-[8px] md:text-[10px] uppercase tracking-widest text-success bg-success/12 px-2 py-1 rounded-full">
                            Matched
                          </span>
                        )}
                        {receipt.matchStatus === "Has Discrepancies" && (
                          <span className="font-bold text-[8px] md:text-[10px] uppercase tracking-widest text-[#C0653F] bg-primary/10 px-2 py-1 rounded-full border border-primary/30">
                            Discrepancy
                          </span>
                        )}
                        {receipt.matchStatus === "Unlinked" && (
                          <span className="font-bold text-[8px] md:text-[10px] uppercase tracking-widest text-ink-muted bg-page px-2 py-1 rounded-full">
                            Unlinked
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 md:px-10 py-5 md:py-8">
                      <div className="flex flex-wrap gap-1.5 md:gap-2 max-w-[200px] md:max-w-[300px]">
                        {receipt.items.map((item, idx) => (
                          <span
                            key={idx}
                            className="bg-panel border border-divider px-2 md:px-3 py-1 md:py-1.5 rounded-xl text-[8px] md:text-[10px] font-bold text-ink-muted uppercase tracking-tight whitespace-nowrap"
                          >
                            {item.name} × {item.quantity}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 md:px-10 py-5 md:py-8 text-right">
                      <div className="text-base md:text-lg font-bold text-ink tracking-tighter font-mono leading-none">
                        ₹
                        {receipt.totalAmount.toLocaleString("en-IN", {
                          maximumFractionDigits: 0,
                        })}
                      </div>
                      <div className="text-[8px] md:text-[10px] font-bold text-ink-muted uppercase tracking-widest mt-1.5 md:mt-2 tracking-[0.1em]">
                        Value
                      </div>
                    </td>
                    {isAdminOrOwner && (
                      <td className="px-6 md:px-10 py-5 md:py-8 text-right">
                        <div className="flex justify-end gap-1.5 md:gap-2 transition-opacity scale-90 group-hover:scale-100">
                          <button
                            onClick={() => {
                              setSelectedReceipt(receipt);
                              setNewReceipt(receipt);
                              setIsEditingReceipt(true);
                              setIsAddingReceipt(true);
                            }}
                            className="p-2.5 md:p-3 bg-[#F7E4DB] border border-[#F0C6B2] shadow-sm rounded-xl text-primary hover:bg-[#F0D5C7] hover:text-primary active:scale-90 apple-transition"
                          >
                            <Edit2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                          </button>
                          <button
                            onClick={() => setIsDeletingReceipt(receipt.id)}
                            className="p-2.5 md:p-3 bg-danger/8 border border-danger/20 shadow-sm rounded-xl text-danger hover:bg-danger/15 hover:text-danger active:scale-90 apple-transition"
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
        ) : (
          <div className="flex flex-col gap-2 p-4 bg-panel/30">
            {receipts.map((receipt) => (
              <div key={receipt.id} className="bg-surface p-4 rounded-2xl border border-divider/40 shadow-sm flex flex-col">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="font-bold text-ink text-sm tracking-tight leading-none mb-1">
                      {receipt.supplierName}
                    </div>
                    {receipt.poNumber && (
                      <div className="text-[10px] font-black text-rust-strong uppercase tracking-widest mt-1">
                        PO: {receipt.poNumber}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {receipt.matchStatus === "Fully Matched" && (
                      <span className="font-bold text-[10px] uppercase tracking-widest text-success bg-success/12 px-2 py-1 rounded-full">
                        Matched
                      </span>
                    )}
                    {receipt.matchStatus === "Has Discrepancies" && (
                      <span className="font-bold text-[10px] uppercase tracking-widest text-[#C0653F] bg-primary/10 px-2 py-1 rounded-full border border-primary/30">
                        Discrepancy
                      </span>
                    )}
                    {receipt.matchStatus === "Unlinked" && (
                      <span className="font-bold text-[10px] uppercase tracking-widest text-ink-muted bg-page px-2 py-1 rounded-full">
                        Unlinked
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between mb-4 pb-4 border-b border-divider/60">
                  <div>
                    <div className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mb-1 tracking-[0.1em]">
                      Date & Ref
                    </div>
                    <div className="font-mono text-[10px] font-bold text-ink-muted">
                      {receipt.receiptDate}
                    </div>
                    <div className="mt-1">
                      <span className="font-mono text-[10px] font-bold text-rust-strong bg-[#F7E4DB]/50 px-2 py-1 rounded-full border border-[#F7E4DB]/50 shadow-sm">
                        {receipt.invoiceNumber}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mb-1 tracking-[0.1em]">
                      Value
                    </div>
                    <div className="text-lg font-bold text-ink tracking-tighter font-mono leading-none">
                      ₹
                      {receipt.totalAmount.toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mb-2 tracking-[0.1em]">
                    Items
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {receipt.items.map((item, idx) => (
                      <span
                        key={idx}
                        className="bg-panel border border-divider px-2 py-1 rounded-xl text-[10px] font-bold text-ink-muted uppercase tracking-tight whitespace-nowrap"
                      >
                        {item.name} × {item.quantity}
                      </span>
                    ))}
                  </div>
                </div>

                {isAdminOrOwner && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setSelectedReceipt(receipt);
                        setNewReceipt(receipt);
                        setIsEditingReceipt(true);
                        setIsAddingReceipt(true);
                      }}
                      className="flex-1 py-2 bg-[#F7E4DB] border border-[#F0C6B2] shadow-sm rounded-xl text-primary hover:bg-[#F0D5C7] hover:text-primary active:scale-90 apple-transition flex items-center justify-center font-bold text-xs uppercase tracking-widest"
                    >
                      <Edit2 className="w-4 h-4 mr-1.5" /> Edit
                    </button>
                    <button
                      onClick={() => setIsDeletingReceipt(receipt.id)}
                      className="flex-1 py-2 bg-danger/8 border border-danger/20 shadow-sm rounded-full text-danger hover:bg-danger/15 hover:text-danger active:scale-90 apple-transition flex items-center justify-center font-bold text-xs uppercase tracking-widest"
                    >
                      <Trash2 className="w-4 h-4 mr-1.5" /> Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderLedger = () => {
    const filteredLedger = selectedVendor
      ? ledger.filter((e) => e.vendorId === selectedVendor.id)
      : ledger;

    // Sort ledger by date ASC
    const sortedLedger = [...filteredLedger].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

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
      ? selectedVendor.outstandingBalance || 0
      : vendors.reduce((acc, v) => acc + (v.outstandingBalance || 0), 0);

    const netStatementBalance = totals.credit - totals.debit;
    const openingBalance = currentTotalOutstanding - netStatementBalance;

    return (
      <div className="space-y-6 md:space-y-10">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex flex-wrap items-center gap-3 md:gap-6">
            <h2 className="text-2xl md:text-3xl font-black text-ink tracking-tight">
              {t("views.vendorLedger")}
            </h2>
            {selectedVendor && (
              <div className="flex items-center gap-3 md:gap-4 bg-surface-dark text-white px-4 md:px-6 py-1.5 md:py-2 rounded-xl md:rounded-2xl text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] shadow-xl">
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

        <div className="bg-surface rounded-2xl shadow-sm border border-divider/40 overflow-hidden">
          {breakpoint === "desktop" ? (
            <div className="overflow-x-auto scrollbar-hide">
              <table className="w-full text-left min-w-[700px] md:min-w-[800px]">
                <thead>
                  <tr className="bg-surface-dark text-white/75 border-b border-white/10">
                    <th className="px-6 md:px-10 py-4 md:py-6 text-[10px] md:text-[10px] font-bold uppercase tracking-[0.3em] text-white/30 italic">
                      Timeline
                    </th>
                    <th className="px-6 md:px-10 py-4 md:py-6 text-[10px] md:text-[10px] font-bold uppercase tracking-[0.3em] text-white/80">
                      Entity Partner
                    </th>
                    <th className="px-6 md:px-10 py-4 md:py-6 text-[10px] md:text-[10px] font-bold uppercase tracking-[0.3em] text-white/80">
                      Designation
                    </th>
                    <th className="px-6 md:px-10 py-4 md:py-6 text-[10px] md:text-[10px] font-bold uppercase tracking-[0.3em] text-white/80 text-right">
                      CR (+)
                    </th>
                    <th className="px-6 md:px-10 py-4 md:py-6 text-[10px] md:text-[10px] font-bold uppercase tracking-[0.3em] text-white/80 text-right">
                      DR (-)
                    </th>
                    {isAdminOrOwner && (
                      <th className="px-6 md:px-10 py-4 md:py-6 text-[10px] md:text-[10px] font-bold uppercase tracking-[0.3em] text-white/30 text-right">
                        Ops
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider/40">
                  <tr className="bg-slate-50/50">
                    <td className="px-6 md:px-10 py-5 md:py-8 font-mono text-[10px] md:text-[10px] font-bold text-ink-muted">
                      -
                    </td>
                    <td className="px-6 md:px-10 py-5 md:py-8 text-ink-muted text-sm md:text-base font-bold">
                      {selectedVendor ? selectedVendor.name : "All Vendors"}
                    </td>
                    <td className="px-6 md:px-10 py-5 md:py-8 text-ink-muted text-xs font-bold tracking-widest uppercase">
                      OPENING BALANCE
                    </td>
                    <td className="px-6 md:px-10 py-5 md:py-8 text-right font-bold text-ink text-base md:text-lg font-mono">
                      {openingBalance >= 0
                        ? `₹${openingBalance.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
                        : "-"}
                    </td>
                    <td className="px-6 md:px-10 py-5 md:py-8 text-right font-bold text-rust-strong text-base md:text-lg font-mono">
                      {openingBalance < 0
                        ? `₹${Math.abs(openingBalance).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
                        : "-"}
                    </td>
                    {isAdminOrOwner && (
                      <td className="px-6 md:px-10 py-5 md:py-8 text-right"></td>
                    )}
                  </tr>
                  {sortedLedger.map((entry) => (
                    <tr
                      key={entry.id}
                      className="group hover:bg-panel/50 apple-transition"
                    >
                      <td className="px-6 md:px-10 py-5 md:py-8 font-mono text-[10px] md:text-[10px] font-bold text-ink-muted group-hover:text-ink apple-transition">
                        {new Date(entry.date).toLocaleDateString()}
                      </td>
                      <td className="px-6 md:px-10 py-5 md:py-8">
                        <div className="font-bold text-ink text-sm md:text-base tracking-tight leading-none mb-1 truncate max-w-[150px]">
                          {vendors.find((v) => v.id === entry.vendorId)?.name ||
                            "Unknown Partner"}
                        </div>
                        <div
                          className={`text-[8px] md:text-[10px] font-black uppercase tracking-widest ${
                            entry.isChangeOrder
                              ? "text-rust-strong"
                              : "text-rust-strong/50"
                          }`}
                        >
                          {entry.referenceType === "GRN"
                            ? "MATERIAL INVOICE"
                            : entry.referenceType === "LABOR_DEPLOYMENT"
                              ? entry.isChangeOrder
                                ? "CHANGE ORDER LABOR"
                                : "LABOR"
                              : entry.referenceType || "OFS"}
                        </div>
                      </td>
                      <td className="px-6 md:px-10 py-5 md:py-8">
                        <div className="text-[10px] md:text-xs font-medium text-ink-muted tracking-tight leading-relaxed max-w-[200px] md:max-w-[300px] line-clamp-2">
                          {entry.description}
                        </div>
                        {entry.overrideReason && (
                          <div className="text-[8px] md:text-[10px] font-bold text-[#C0653F] mt-1 uppercase tracking-widest border border-amber-200/50 bg-primary/10 px-1.5 py-0.5 rounded-full inline-block">
                            ⚠️ Override: {entry.overrideReason}
                          </div>
                        )}
                      </td>
                      <td className="px-6 md:px-10 py-5 md:py-8 text-right font-bold text-ink text-base md:text-lg font-mono tracking-tighter">
                        {entry.type === "CREDIT"
                          ? `₹${entry.amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
                          : "-"}
                      </td>
                      <td className="px-6 md:px-10 py-5 md:py-8 text-right font-bold text-rust-strong text-base md:text-lg font-mono tracking-tighter">
                        {entry.type === "DEBIT"
                          ? `₹${entry.amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
                          : "-"}
                      </td>
                      {isAdminOrOwner && (
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
                                className="p-2.5 md:p-3 bg-[#F7E4DB] border border-[#F0C6B2] shadow-sm rounded-xl text-primary hover:bg-[#F0D5C7] hover:text-primary active:scale-90 apple-transition"
                              >
                                <Edit2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteLedgerEntry(entry.id)}
                                className="p-2.5 md:p-3 bg-danger/8 border border-danger/20 shadow-sm rounded-xl text-danger hover:bg-danger/15 hover:text-danger active:scale-90 apple-transition"
                              >
                                <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                              </button>
                            </div>
                          ) : entry.referenceType === "GRN" ? (
                            <div className="flex justify-end gap-1.5 md:gap-2">
                              <button
                                onClick={() => {
                                  const receiptToEdit = receipts.find(
                                    (r) => r.id === entry.referenceId,
                                  );
                                  if (receiptToEdit) {
                                    setSelectedReceipt(receiptToEdit);
                                    setNewReceipt(receiptToEdit);
                                    setIsEditingReceipt(true);
                                    setIsAddingReceipt(true);
                                  }
                                }}
                                className="p-2.5 md:p-3 bg-[#F7E4DB] border border-[#F0C6B2] shadow-sm rounded-xl text-primary hover:bg-[#F0D5C7] hover:text-primary active:scale-90 apple-transition"
                              >
                                <Edit2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                              </button>
                              <button
                                onClick={() =>
                                  setIsDeletingReceipt(entry.referenceId || null)
                                }
                                className="p-2.5 md:p-3 bg-danger/8 border border-danger/20 shadow-sm rounded-xl text-danger hover:bg-danger/15 hover:text-danger active:scale-90 apple-transition"
                              >
                                <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-1.5 md:gap-2">
                              <button
                                onClick={() => handleDeleteLedgerEntry(entry.id)}
                                className="p-2.5 md:p-3 bg-danger/8 border border-danger/20 shadow-sm rounded-xl text-danger hover:bg-danger/15 hover:text-danger active:scale-90 apple-transition"
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
                <tfoot className="bg-surface-dark border-t border-white/5">
                  <tr className="font-black text-sm">
                    <td
                      colSpan={3}
                      className="px-6 md:px-10 py-6 md:py-10 text-right uppercase tracking-[0.4em] text-white/20 text-[10px] md:text-[10px]"
                    >
                      Outstanding Statement Balance
                    </td>
                    <td
                      colSpan={!isAdminOrOwner ? 2 : 3}
                      className="px-6 md:px-10 py-6 md:py-10 text-right text-2xl md:text-4xl text-white font-black tracking-tighter font-mono"
                    >
                      ₹
                      {currentTotalOutstanding.toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="flex flex-col gap-2 p-4 bg-panel/30">
              <div className="bg-surface-dark p-4 rounded-2xl shadow-sm flex flex-col mb-2">
                <div className="flex justify-between items-start mb-3">
                  <div className="font-bold text-white text-sm tracking-tight leading-none mb-1">
                    {selectedVendor ? selectedVendor.name : "All Vendors"}
                  </div>
                  <div className="text-[10px] font-black text-white/70 uppercase tracking-widest bg-onyx/40 px-2 py-1 rounded-lg">
                    OPENING BALANCE
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <div className="text-[8px] font-bold text-white/40 uppercase tracking-widest mb-1 tracking-[0.1em]">
                      CR (+)
                    </div>
                    <div className="text-lg font-bold text-success tracking-tighter font-mono leading-none">
                      {openingBalance >= 0
                        ? `₹${openingBalance.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
                        : "-"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[8px] font-bold text-white/40 uppercase tracking-widest mb-1 tracking-[0.1em]">
                      DR (-)
                    </div>
                    <div className="text-lg font-bold text-rust-strong tracking-tighter font-mono leading-none">
                      {openingBalance < 0
                        ? `₹${Math.abs(openingBalance).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
                        : "-"}
                    </div>
                  </div>
                </div>
              </div>

              {sortedLedger.map((entry) => (
                <div key={entry.id} className="bg-surface p-4 rounded-2xl border border-divider/40 shadow-sm flex flex-col">
                  <div className="flex justify-between items-start mb-3 pb-3 border-b border-divider/60">
                    <div>
                      <div className="font-bold text-ink text-sm tracking-tight leading-none mb-1">
                        {vendors.find((v) => v.id === entry.vendorId)?.name || "Unknown Partner"}
                      </div>
                      <div className="text-[10px] font-black text-rust-strong uppercase tracking-widest mt-1">
                        {entry.referenceType === "GRN"
                          ? "MATERIAL INVOICE"
                          : entry.referenceType === "LABOR_DEPLOYMENT"
                            ? entry.isChangeOrder
                              ? "CHANGE ORDER LABOR"
                              : "LABOR"
                            : entry.referenceType || "OFS"}
                      </div>
                    </div>
                    <div className="font-mono text-[10px] font-bold text-ink-muted">
                      {new Date(entry.date).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="text-xs font-medium text-ink-muted tracking-tight leading-relaxed">
                      {entry.description}
                    </div>
                    {entry.overrideReason && (
                      <div className="text-[10px] font-bold text-[#C0653F] mt-2 uppercase tracking-widest border border-amber-200/50 bg-primary/10 px-2 py-1 rounded-full inline-block">
                        ⚠️ Override: {entry.overrideReason}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mb-4 bg-panel/50 p-3 rounded-xl border border-divider">
                    <div className="flex-1 border-r border-divider">
                      <div className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mb-1 tracking-[0.1em]">
                        CR (+)
                      </div>
                      <div className="text-base font-bold text-ink tracking-tighter font-mono leading-none">
                        {entry.type === "CREDIT"
                          ? `₹${entry.amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
                          : "-"}
                      </div>
                    </div>
                    <div className="flex-1 text-right">
                      <div className="text-[8px] font-bold text-ink-muted uppercase tracking-widest mb-1 tracking-[0.1em]">
                        DR (-)
                      </div>
                      <div className="text-base font-bold text-rust-strong tracking-tighter font-mono leading-none">
                        {entry.type === "DEBIT"
                          ? `₹${entry.amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
                          : "-"}
                      </div>
                    </div>
                  </div>

                  {isAdminOrOwner && (
                    <div className="flex gap-2">
                      {entry.referenceType === "PAYMENT" ? (
                        <>
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
                            className="flex-1 py-2 bg-[#F7E4DB] border border-[#F0C6B2] shadow-sm rounded-xl text-primary hover:bg-[#F0D5C7] hover:text-primary active:scale-90 apple-transition flex items-center justify-center font-bold text-xs uppercase tracking-widest"
                          >
                            <Edit2 className="w-4 h-4 mr-1.5" /> Edit
                          </button>
                          <button
                            onClick={() => handleDeleteLedgerEntry(entry.id)}
                            className="flex-1 py-2 bg-danger/8 border border-danger/20 shadow-sm rounded-full text-danger hover:bg-danger/15 hover:text-danger active:scale-90 apple-transition flex items-center justify-center font-bold text-xs uppercase tracking-widest"
                          >
                            <Trash2 className="w-4 h-4 mr-1.5" /> Delete
                          </button>
                        </>
                      ) : entry.referenceType === "GRN" ? (
                        <>
                          <button
                            onClick={() => {
                              const receiptToEdit = receipts.find(
                                (r) => r.id === entry.referenceId,
                              );
                              if (receiptToEdit) {
                                setSelectedReceipt(receiptToEdit);
                                setNewReceipt(receiptToEdit);
                                setIsEditingReceipt(true);
                                setIsAddingReceipt(true);
                              }
                            }}
                            className="flex-1 py-2 bg-[#F7E4DB] border border-[#F0C6B2] shadow-sm rounded-xl text-primary hover:bg-[#F0D5C7] hover:text-primary active:scale-90 apple-transition flex items-center justify-center font-bold text-xs uppercase tracking-widest"
                          >
                            <Edit2 className="w-4 h-4 mr-1.5" /> Edit
                          </button>
                          <button
                            onClick={() =>
                              setIsDeletingReceipt(entry.referenceId || null)
                            }
                            className="flex-1 py-2 bg-danger/8 border border-danger/20 shadow-sm rounded-full text-danger hover:bg-danger/15 hover:text-danger active:scale-90 apple-transition flex items-center justify-center font-bold text-xs uppercase tracking-widest"
                          >
                            <Trash2 className="w-4 h-4 mr-1.5" /> Delete
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleDeleteLedgerEntry(entry.id)}
                          className="w-full py-2 bg-danger/8 border border-danger/20 shadow-sm rounded-full text-danger hover:bg-danger/15 hover:text-danger active:scale-90 apple-transition flex items-center justify-center font-bold text-xs uppercase tracking-widest"
                        >
                          <Trash2 className="w-4 h-4 mr-1.5" /> Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}

              <div className="mt-2 bg-surface-dark p-4 rounded-2xl shadow-sm flex flex-col items-end justify-center">
                <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1 tracking-[0.2em]">
                  Outstanding Statement Balance
                </div>
                <div className="text-2xl font-black text-white tracking-tighter font-mono leading-none">
                  ₹
                  {currentTotalOutstanding.toLocaleString("en-IN", {
                    maximumFractionDigits: 0,
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 md:space-y-12 pb-24 md:pb-32">
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 md:gap-8 bg-panel p-4 md:p-6 rounded-2xl border border-divider shadow-sm">
        <div className="flex gap-2 bg-panel/50 p-1 md:p-1.5 rounded-xl md:rounded-2xl w-full md:w-auto md:min-w-0 md:flex-1 overflow-x-auto scrollbar-hide ring-1 ring-slate-200/50">
          {(
            [
              "purchase_orders",
              "goods_receipt",
              "bills",
              "receipts",
              "ledger",
              "vendors",
            ] as Tab[]
          ).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 md:flex-none px-4 md:px-8 py-2 md:py-2.5 rounded-lg md:rounded-xl text-[10px] md:text-[10px] font-bold uppercase tracking-[0.15em] md:tracking-[0.2em] apple-transition whitespace-nowrap ${activeTab === tab ? "bg-surface shadow-sm text-rust-strong ring-1 ring-divider" : "text-ink-muted hover:text-ink/80"}`}
            >
              {tab === "purchase_orders"
                ? "Purchase Orders"
                : tab === "goods_receipt"
                  ? "Goods Receipt"
                  : tab === "bills"
                    ? "Bills"
                    : tab === "receipts"
                      ? "Receipts"
                      : tab === "ledger"
                        ? "Ledger"
                        : "Vendors"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto md:shrink-0">
          <div className="hidden sm:flex flex-1 md:flex-none items-center justify-center gap-2 px-4 py-2 bg-[#F7E4DB] rounded-lg md:rounded-2xl">
            <Users className="w-3.5 h-3.5 text-rust-strong" />
            <span className="text-[10px] md:text-[10px] font-black text-rust-strong uppercase tracking-widest">
              {vendors.length} Partners
            </span>
          </div>
        <div className="flex items-center gap-2 w-full md:w-auto md:shrink-0">
          <button
            onClick={() => setShowScanInvoice(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-1.5 bg-[#6E8CA0] text-white px-3 md:px-4 py-2 md:py-2.5 rounded-lg md:rounded-xl text-[10px] md:text-[10px] font-bold uppercase tracking-[0.15em] hover:bg-[#5C7889] apple-transition shadow-sm"
          >
            <Sparkle weight="fill" className="w-3.5 h-3.5" /> Scan Invoice
          </button>
          <button
            onClick={handleExportCSV}
            className="flex-1 md:flex-none flex items-center justify-center gap-1.5 bg-panel text-ink px-3 md:px-4 py-2 md:py-2.5 rounded-lg md:rounded-xl text-[10px] md:text-[10px] font-bold uppercase tracking-[0.15em] hover:bg-divider apple-transition border border-divider"
          >
            <Download className="w-3.5 h-3.5" /> {t("common.exportCsv")}
          </button>
          <button
            onClick={handleExportPDF}
            className="flex-1 md:flex-none flex items-center justify-center gap-1.5 bg-[#C0653F] text-white px-3 md:px-4 py-2 md:py-2.5 rounded-lg md:rounded-xl text-[10px] md:text-[10px] font-bold uppercase tracking-[0.15em] hover:bg-[#A0522F] apple-transition shadow-sm"
          >
            <Download className="w-3.5 h-3.5" /> {t("common.exportPdf")}
          </button>
        </div>
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
          {activeTab === "purchase_orders" && (
            <PurchaseOrderTab projectId={projectId} />
          )}
          {activeTab === "goods_receipt" && (
            <GoodsReceiptTab projectId={projectId} />
          )}
          {activeTab === "bills" && renderBills()}
          {activeTab === "vendors" && renderVendors()}
          {activeTab === "receipts" && renderReceipts()}
          {activeTab === "ledger" && renderLedger()}
        </motion.div>
      </AnimatePresence>

      {showScanInvoice && (
        <ScanInvoice
          projectId={projectId}
          onClose={() => setShowScanInvoice(false)}
        />
      )}

      {reviewBill && (
        <ScanInvoice
          projectId={projectId}
          initialBill={reviewBill}
          onClose={() => setReviewBill(null)}
          onPosted={() => setReviewBill(null)}
        />
      )}

      {/* Modals with responsive widths */}
      <AnimatePresence>
        {showMasterPicker && (
          <div className="fixed inset-0 bg-onyx/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
            <div className="bg-surface w-full max-w-lg rounded-[28px] overflow-hidden flex flex-col max-h-[80vh] shadow-2xl">
              <div className="p-6 border-b border-divider flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-ink tracking-tight">Add from master</h3>
                  <p className="text-xs text-ink-muted mt-1">
                    Parties saved for your organisation. Adding one copies its details here —
                    the balance and ledger start fresh on this project.
                  </p>
                </div>
                <button
                  onClick={() => setShowMasterPicker(false)}
                  className="p-2 hover:bg-divider rounded-full text-ink shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {masters.length === 0 ? (
                  <p className="text-sm text-ink-muted text-center py-10">
                    No parties saved yet. Use the bookmark icon on any party to add it to your master list.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {masters.map((m) => {
                      const used = (vendors || []).some(
                        (v: any) => v.masterVendorId === m.id ||
                          (v.name || "").trim().toLowerCase() === m.name.trim().toLowerCase(),
                      );
                      return (
                        <button
                          key={m.id}
                          onClick={() => !used && addFromMaster(m)}
                          disabled={used || masterBusy}
                          className={`text-left p-4 rounded-2xl border apple-transition ${
                            used
                              ? "border-divider bg-panel opacity-55 cursor-not-allowed"
                              : "border-divider bg-panel hover:bg-surface"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-bold text-ink text-sm">{m.name}</p>
                            <span className="text-[9px] font-black uppercase tracking-wider text-ink-muted shrink-0">
                              {used ? "Already added" : m.type}
                            </span>
                          </div>
                          <p className="text-[12px] text-ink-muted mt-0.5">
                            {[m.phone, m.gstin, m.address].filter(Boolean).join(" · ") || "No contact details"}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {isAddingVendor && (
          <div className="fixed inset-0 bg-onyx/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-surface rounded-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="bg-surface-dark p-5 md:p-6 text-white flex justify-between items-center">
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
                className="p-5 md:p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-ink-muted ml-1">
                      Entity Name
                    </label>
                    <input
                      required
                      placeholder="E.g. United Steel Corp"
                      className="w-full bg-panel p-4 rounded-xl font-bold border-2 border-transparent focus:border-primary outline-none"
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
                      className="w-full bg-panel p-4 rounded-xl font-bold appearance-none border-2 border-transparent focus:border-primary outline-none"
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
                      className="w-full bg-panel p-4 rounded-xl font-bold border-2 border-transparent focus:border-primary outline-none"
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
                      className="w-full bg-panel p-4 rounded-xl font-bold border-2 border-transparent focus:border-primary outline-none"
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
                      className="w-full bg-panel p-4 rounded-xl font-bold border-2 border-transparent focus:border-primary outline-none"
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
                      className="w-full bg-panel p-4 rounded-xl font-bold border-2 border-transparent focus:border-primary outline-none resize-none"
                      value={newVendor.address}
                      onChange={(e) =>
                        setNewVendor({ ...newVendor, address: e.target.value })
                      }
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-ink-muted ml-1">
                      Opening Balance (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0"
                      className="w-full bg-panel p-4 rounded-xl font-bold font-mono border-2 border-transparent focus:border-primary outline-none"
                      value={openingBalanceInput}
                      onChange={(e) =>
                        setOpeningBalanceInput(parseFloat(e.target.value) || 0)
                      }
                    />
                    <p className="text-[10px] text-ink-muted ml-1 leading-relaxed">
                      Balance carried forward before any receipts or payments
                      recorded here. Positive means you owe the party.
                    </p>
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full bg-primary text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-[#F7E4DB] hover:bg-[#B85F3B] apple-transition mt-4"
                >
                  {isEditingVendor ? "Update Profile" : "Register Party"}
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {isDeletingVendor != null && (
          <div className="fixed inset-0 bg-onyx/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-surface rounded-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-6 text-center space-y-4">
                <div className="w-12 h-12 bg-danger/15 rounded-full flex items-center justify-center mx-auto">
                  <Trash2 className="w-6 h-6 text-danger" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-ink">Delete Party?</h3>
                  <p className="text-sm text-ink-muted mt-1">
                    Are you sure you want to delete this vendor? This action
                    cannot be undone.
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
                    className="flex-1 py-3 bg-danger hover:bg-danger text-white rounded-xl font-bold transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {isDeletingReceipt != null && (
          <div className="fixed inset-0 bg-onyx/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-surface rounded-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-6 text-center space-y-4">
                <div className="w-12 h-12 bg-danger/15 rounded-full flex items-center justify-center mx-auto">
                  <Trash2 className="w-6 h-6 text-danger" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-ink">
                    Delete Receipt?
                  </h3>
                  <p className="text-sm text-ink-muted mt-1">
                    Are you sure you want to delete this material receipt? This
                    will revert the warehouse inventory and vendor ledger.
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
                    className="flex-1 py-3 bg-danger hover:bg-danger text-white rounded-xl font-bold transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {isAddingPayment && (
          <div className="fixed inset-0 bg-onyx/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-surface rounded-2xl w-full max-w-md overflow-hidden"
            >
              <div className="bg-success p-5 md:p-6 text-white flex justify-between items-center">
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
              <form
                onSubmit={handleAddPayment}
                className="p-5 md:p-6 space-y-4"
              >
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
                    className="w-full bg-panel p-4 rounded-xl font-black text-xl text-success"
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
                      const rcpt = receipts.find((r) => r.id === rcptId);
                      setNewPayment({
                        ...newPayment,
                        receiptId: rcptId,
                        amount: rcpt ? rcpt.totalAmount : newPayment.amount,
                      });
                    }}
                  >
                    <option value="">No Invoice (Advance/General)</option>
                    {receipts
                      .filter((r) => r.supplierId === newPayment.supplierId)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.invoiceNumber} - ₹
                          {r.totalAmount.toLocaleString("en-IN")} (
                          {r.matchStatus || "Unlinked"})
                        </option>
                      ))}
                  </select>
                </div>

                {(() => {
                  const selectedRcpt = receipts.find(
                    (r) => r.id === newPayment.receiptId,
                  );
                  if (
                    selectedRcpt &&
                    selectedRcpt.matchStatus === "Has Discrepancies"
                  ) {
                    return (
                      <div className="space-y-1 bg-primary/10 p-4 rounded-xl border border-primary/30">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[#A0522F] ml-1">
                          Discrepancy Override Reason
                        </label>
                        <input
                          required
                          placeholder="Why are we paying this despite the discrepancy?"
                          className="w-full bg-white p-3 rounded-xl font-bold border border-primary/40 placeholder:text-[#F0C6B2]"
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
                  className="w-full bg-success text-white py-4 rounded-xl font-black uppercase tracking-widest"
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
