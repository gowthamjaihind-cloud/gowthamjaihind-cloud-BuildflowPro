export interface Project {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  status: "Planning" | "Active" | "On Hold" | "Completed";
  ownerId: string;
  imageUrl?: string;
  strictDataEntry?: boolean;
  orgId?: string;
}

export type UserRole =
  | "Owner"
  | "Admin"
  | "Project Manager"
  | "Site Engineer"
  | "Stakeholder"
  | "Viewer";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  botPin?: string;
  telegramChatId?: number;
  telegramLinkedAt?: number;
  photoURL?: string;
  projectAccess?: Record<string, "read" | "write" | "none">;
  currentOrgId?: string; // Appended for multi-tenant SaaS architecture
  preferences?: {
    mobileScheduleView?: 'timeline' | 'minigantt';
  };
}

export type DependencyType = "FS" | "SS" | "FF" | "SF";

export interface TaskDependency {
  id: string; // target task id
  type: DependencyType;
  lag: number; // in days, positive for lag, negative for lead
}

export interface MaterialAllocation {
  inventoryItemId: string;
  name: string;
  quantity: number;
  unit: string;
}

export interface ResourceAllocation {
  resourceId: string;
  name: string;
  quantity: number;
  unit: string;
  costPerUnit: number;
}

export interface LaborAllocation {
  role: string;
  quantity: number;
  unit: "Shift" | "Day" | "Hour";
  rate?: number;
}

export interface Task {
  id: string;
  projectId: string;
  parentId?: string;
  name: string;
  startDate: string;
  endDate: string;
  duration: number;
  progress: number;
  dependencies: string[]; // Legacy field for simple FS
  advancedDependencies?: TaskDependency[];
  assignedTo?: string;
  type: "Milestone" | "Task" | "Summary";
  status?: "Pending" | "In Progress" | "Completed" | "Delayed" | "On Hold";

  // WBS
  phase?: string;
  location?: string;

  // Timeline actuals
  actualStartDate?: string;
  actualEndDate?: string;
  freeFloat?: number;


  // Activity Codes/Tags
  activityCodes?: string[];

  // CPM Fields
  earlyStart?: string;
  earlyFinish?: string;
  lateStart?: string;
  lateFinish?: string;
  totalFloat?: number;
  isCritical?: boolean;

  // Resource & Cost Management
  resources?: ResourceAllocation[];
  materialAllocations?: MaterialAllocation[];
  laborAllocations?: LaborAllocation[];
  budgetedCost?: number;
  actualCost?: number;
  isChangeOrder?: boolean;

  // Detailed Cost Breakdown
  plannedMaterialCost?: number;
  actualMaterialCost?: number;
  plannedLaborCost?: number;
  actualLaborCost?: number;
  plannedOtherCost?: number;
  actualOtherCost?: number;
  lastProgressUpdate?: string;
  lastPhotos?: string[];
  activeRoles?: string[];
  lastRemarks?: string;
  isSystemGenerated?: boolean;
}

export interface InventoryItem {
  id: string;
  projectId: string;
  materialId: string;
  name: string;
  category: string;
  code?: string;
  groupCode?: string;
  quantity: number;
  consumed?: number;
  unit: string;
  unitCost: number;
  minThreshold: number;
  avgUnitCost?: number;
}

export interface Vendor {
  id: string;
  projectId: string;
  name: string;
  type: "Material" | "Labor" | "Both";
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  outstandingBalance: number;
}

export interface Supplier extends Vendor {}

export interface LaborRateCard {
  id: string;
  projectId: string;
  vendorId: string;
  role: string;
  rate: number;
  unit: "Shift" | "Day" | "Hour";
}

export type POStatus = "Draft" | "Approved" | "Partially Received" | "Closed";

export interface POLineItem {
  itemId: string;        // inventory item id (for materials)
  materialId: string;
  name: string;
  orderedQty: number;    // quantity ordered
  unit: string;
  rate: number;          // agreed unit rate (prefilled, editable)
  amount: number;        // orderedQty * rate
  receivedQty?: number;  // filled by GRN in Step 2; default 0
}

/** Flat extra charges on a PO beyond material line items (freight etc.). */
export interface POCharges {
  loading?: number;
  transport?: number;
  other?: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;          // human-friendly, auto-generated e.g. PO-2026-0001
  projectId: string;
  vendorId: string;
  vendorName: string;
  status: POStatus;
  orderDate: string;         // dd-mm-yyyy storage consistent with app
  expectedDeliveryDate?: string;
  lineItems: POLineItem[];
  // Loading / transport / other charges. Added on top of the material lines;
  // billed to the vendor ledger on the first goods receipt against this PO.
  charges?: POCharges;
  totalAmount: number;       // material line amounts + charges
  notes?: string;
  createdByUid: string;
  createdByName: string;
  approvedByUid?: string;
  approvedByName?: string;
  approvedAt?: string;
  createdAt: string;
}

export interface GoodsReceiptNote {
  id: string;
  grnNumber: string;
  projectId: string;
  poId: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  receiptDate: string;
  challanNumber?: string;
  lineItems: GRNLineItem[];
  // PO loading/transport/other charges applied on this receipt (only the
  // first receipt against a PO carries them, to avoid double-counting).
  charges?: POCharges;
  ledgerId?: string;
  costEntryId?: string;
  materialIds?: string[];
  photoUrls?: string[];
  notes?: string;
  // Set when this GRN was created alongside a GST vendor bill (invoice reader).
  // When present, the Bill posts the vendor payable — the GRN does not post its
  // own rate×qty credit, to avoid double-counting.
  billId?: string;
  // "legacy-inclusive" = pre-GST-switchover rows whose rates already include tax
  // (never re-valued). "gst-itemized" = new rows costed ex-GST with input credit.
  taxMode?: TaxMode;
  createdByUid: string;
  createdByName: string;
  createdAt: string;
}

export interface GRNLineItem {
  poLineRef: string;
  materialId: string;
  name: string;
  orderedQty: number;
  receivedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  unit: string;
  // Ex-GST unit rate captured from the vendor bill (gst-itemized GRNs only).
  // Inventory is valued at this rate when present; legacy/manual GRNs omit it
  // and fall back to the PO rate.
  rate?: number;
}

export interface ReceiptLineItem {
  itemId: string;
  materialId: string;
  name: string;
  quantity: number;
  unitRate: number;
  totalPrice: number;
  poLineRef?: string;
}

export interface MaterialReceipt {
  id: string;
  projectId: string;
  supplierId: string;
  supplierName: string;
  receiptDate: string;
  invoiceNumber: string;
  totalAmount: number;
  notes?: string;
  items: ReceiptLineItem[];
  ledgerId?: string;
  costEntryId?: string;
  poId?: string;
  poNumber?: string;
  grnIds?: string[];
  grnNumbers?: string[];
  matchStatus?: "Fully Matched" | "Has Discrepancies" | "Unlinked";
}

// Costing convention for a receipt/bill.
//  - "legacy-inclusive": pre-switchover rows entered with tax-inclusive rates;
//    cost = rate × qty (includes GST). Never re-valued.
//  - "gst-itemized": new GST bills; material cost = taxable value (ex-GST),
//    input GST tracked separately, vendor payable = tax-inclusive total.
export type TaxMode = "legacy-inclusive" | "gst-itemized";

// A single GST invoice line, as read from the vendor's bill.
export interface VendorBillLineItem {
  poLineRef?: string;     // matched PO line (POLineItem.itemId), if any
  materialId?: string;    // matched inventory item, if any
  name: string;
  hsn?: string;           // HSN/SAC code
  qty: number;
  unit: string;
  rate: number;           // per-unit taxable rate (ex-GST)
  taxableValue: number;   // qty × rate (ex-GST)
  gstRate: number;        // e.g. 5, 12, 18, 28
  cgst: number;
  sgst: number;
  igst: number;
  lineTotal: number;      // taxableValue + cgst + sgst + igst
}

// A GST vendor invoice/bill — the financial document, matched to a PO/GRN. The
// GRN records physical quantities; the Bill records money + tax.
export interface VendorBill {
  id: string;
  projectId: string;
  vendorId: string;
  vendorName: string;
  vendorGSTIN?: string;
  invoiceNumber: string;
  invoiceDate: string;
  poId?: string;
  poNumber?: string;
  grnIds?: string[];
  lineItems: VendorBillLineItem[];
  charges?: POCharges;          // freight/loading/other from the invoice
  subtotalTaxable: number;      // Σ taxableValue
  totalCGST: number;
  totalSGST: number;
  totalIGST: number;
  roundOff?: number;
  grandTotal: number;           // subtotalTaxable + taxes + charges ± roundOff
  taxMode: TaxMode;             // "gst-itemized" for reader-created bills
  matchStatus?: "Fully Matched" | "Has Discrepancies" | "Unlinked";
  // "pending_review" = captured (e.g. via Telegram) but not yet posted;
  // "posted" = GRN + ledger written. Absent is treated as posted (web flow).
  status?: "pending_review" | "posted";
  flags?: string[];             // discrepancy notes carried from extraction
  sourceFileUrl?: string;       // the scanned invoice image/PDF, for audit
  extractionConfidence?: number;
  ledgerId?: string;            // the vendor-ledger CREDIT this bill posted
  createdVia?: "web" | "telegram";
  createdByUid: string;
  createdByName: string;
  createdAt: string;
}

// Company/tax identity, stored on the organization doc so both the web app and
// server-side functions can read it (drives GSTIN validation and the
// CGST/SGST-vs-IGST split by comparing state codes).
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired"
  | "internal"; // operator/grandfathered orgs — never gated

export interface OrgSettings {
  companyName?: string;
  gstin?: string;
  stateCode?: string; // GST state code, e.g. "29" (Karnataka)
  // Billing lifecycle (see functions/src/billing.ts + useOrgAccess). Orgs with
  // no status are grandfathered (treated as always-on).
  subscriptionStatus?: SubscriptionStatus;
  plan?: string;
  trialEndsAt?: number;        // epoch ms; while trialing, access ends here
  currentPeriodEnd?: number;   // epoch ms; paid period end (for active subs)
}

export interface LaborLogLineItem {
  taskId: string;
  taskName?: string;
  role: string;
  headcount: number;
  shifts: number;
  rate: number;
  cost: number;
}

export interface DailyLaborLog {
  id: string;
  projectId: string;
  vendorId: string;
  vendorName?: string;
  date: string;
  isAccrual?: boolean;
  totalCost: number;
  status: "Draft" | "Submitted" | "Approved";
  items: LaborLogLineItem[];
  ledgerId?: string;
  costEntryId?: string;
}

export interface VendorLedgerEntry {
  id: string;
  projectId: string;
  vendorId: string;
  date: string;
  type: "CREDIT" | "DEBIT";
  amount: number;
  referenceType:
    | "GRN"
    | "BILL"
    | "PAYMENT"
    | "RETURN"
    | "LABOR_DEPLOYMENT"
    | "GRN_REVERSAL"
    | "LABOR_REVERSAL";
  referenceId?: string;
  description: string;
  overriddenBy?: string;
  overrideReason?: string;
  // Set on LABOR_DEPLOYMENT entries that come from a change-order RA bill, so
  // the vendor ledger can show and total change-order labor separately.
  isChangeOrder?: boolean;
}

export interface SupplierLedgerEntry extends VendorLedgerEntry {}

export interface MaterialIssueLine {
  itemId: string;
  materialId?: string; // Material Code/ID
  name: string;
  quantity: number;
  unitCost: number;
  totalPrice: number;
}

export interface MaterialIssue {
  id: string;
  projectId: string;
  taskId: string;
  taskName?: string;
  issueDate: string;
  totalCost: number;
  items: MaterialIssueLine[];
  remarks?: string;
  phase?: string;
  location?: string;
}

export interface RABill {
  id: string;
  projectId: string;
  vendorId: string;
  vendorName: string;
  billDate: string;
  billNumber: string;
  grossAmount: number;
  deductions: number;
  netAmount: number;
  status: "Draft" | "Certified" | "Paid";
  logIds: string[];
  // Change-order labor is certified on its own RA bill so the vendor can be
  // paid for it separately from base-contract labor.
  isChangeOrder?: boolean;
}

export interface CostEntry {
  id: string;
  projectId: string;
  taskId?: string;
  description: string;
  amount: number;
  type: "Budget" | "Actual";
  category: string;
  date: string;
  isAccrual?: boolean;
}

export interface ProjectDocument {
  id: string;
  projectId: string;
  taskId?: string;
  name: string;
  type: string;
  url: string;
  storagePath?: string;
  uploadedBy: string;
  uploadedAt: string;
  accessLevel: "Public" | "Internal" | "Confidential";
  category?: string;
  tags?: string[];
  deleted?: boolean;
}

export interface EstimateLineItem {
  id: string;
  taskId?: string;
  taskName: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  totalAmount: number;
  isChangeOrder?: boolean;
}

export interface ClientEstimate {
  id: string;
  projectId: string;
  estimateNumber: string;
  dateCreated: string;
  dateValidUntil: string;
  status: "Draft" | "Sent to Client" | "Approved" | "Rejected";
  items: EstimateLineItem[];
  subTotal: number;
  taxAmount: number;
  totalAmount: number;
  taxRatePercent?: number;
  snapshotBudgeted?: number;
  snapshotDate?: string;
  clientNotes?: string;
  internalNotes?: string;
}

export interface AuditLog {
  id: string;
  reportId: string;
  projectId: string;
  userId: string;
  userEmail: string;
  timestamp: string;
  action: "UPDATE" | "CREATE" | "DELETE";
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
}

export interface ClientPayment {
  id: string;
  projectId: string;
  date: string;
  amount: number;
  referenceNumber: string;
  description: string;
  paymentMethod?: string;
}

export interface DailyLogEntry {
  id: string;
  taskId: string;
  projectId: string;
  workDate: any; // Using any or specific type to hold firestore Timestamp
  createdAt: any; 
  createdByUid: string;
  createdByName: string;
  progressPercent: number;
  markComplete: boolean;
  materials: { materialId: string; name: string; quantity: number; unit: string }[];
  labour: { roleId: string; roleName: string; headcount: number }[];
  equipment?: {
    equipmentId: string;
    name: string;
    ownership?: string; // "Owned" | "Rented" at time of logging
    unit: "hours" | "days";
    quantity: number;
    rate?: number; // snapshot of the applicable master rate at log time
    cost?: number; // quantity * rate, snapshot for display
  }[];
  note?: string;
  photoUrls?: string[];
}

// Reusable equipment master, managed per project and picked from in daily logs.
// Rates are optional so an item can exist before its cost is known; usage is
// costed by the rate that matches the logged unit (hours vs days).
export interface EquipmentItem {
  id: string;
  name: string;
  ownership: "Owned" | "Rented";
  hourlyRate?: number;
  dailyRate?: number;
}
