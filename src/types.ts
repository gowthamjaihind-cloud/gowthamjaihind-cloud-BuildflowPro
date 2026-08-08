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
