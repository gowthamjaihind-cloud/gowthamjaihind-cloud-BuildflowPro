// Fixtures for demo mode: one believable Madurai project, mid-build.
//
// Numbers are internally consistent — task budgets roll up to the project
// budget, goods receipts match their purchase orders, and issued material
// matches what the daily logs consumed — so every screen agrees with every
// other one. An inconsistent demo is worse than no demo.

const DAY = 86400000;
// Dates are resolved lazily inside d(). A top-level `new Date()` would make the
// whole module side-effectful, and the bundler would then refuse to drop it
// from a non-demo build — which is the entire point of the __DEMO__ gate.
const d = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * DAY).toISOString().split("T")[0];

export const DEMO_ORG_ID = "demo-org";
export const DEMO_PROJECT_ID = "demo-project";

export const demoUser = {
  uid: "demo-user",
  email: "demo@sitetru.com",
  displayName: "Demo Owner",
  role: "Owner" as const,
  currentOrgId: DEMO_ORG_ID,
  orgIds: [DEMO_ORG_ID],
  photoURL: undefined,
  legal: { termsVersion: "2026-08-25", acceptedAt: "2026-08-26T00:00:00.000Z" },
};

export const demoProjects = [
  {
    id: DEMO_PROJECT_ID,
    orgId: DEMO_ORG_ID,
    name: "Ramkumar Residence, Othakadai",
    description: "G+2 residential building · 3,200 sq ft · Madurai",
    status: "Active",
    startDate: d(-150),
    endDate: d(135),
    ownerId: demoUser.uid,
    strictDataEntry: true,
  },
  {
    id: "demo-project-2",
    orgId: DEMO_ORG_ID,
    name: "Anna Nagar Commercial Block",
    description: "Ground + 3 retail and office block",
    status: "Active",
    startDate: d(-60),
    endDate: d(400),
    ownerId: demoUser.uid,
  },
  {
    id: "demo-project-3",
    orgId: DEMO_ORG_ID,
    name: "Thirunagar Villa",
    description: "Independent villa with landscaping",
    status: "Planning",
    startDate: d(20),
    endDate: d(320),
    ownerId: demoUser.uid,
  },
];

// --- WBS -------------------------------------------------------------------
// A summary per phase, with leaf tasks carrying the budget and progress.
const phase = (id: string, name: string, start: number, end: number, progress: number) => ({
  id, projectId: DEMO_PROJECT_ID, parentId: null, name, type: "Summary" as const,
  startDate: d(start), endDate: d(end), duration: end - start + 1, progress,
  status: progress >= 100 ? "Completed" : progress > 0 ? "In Progress" : "Pending",
  dependencies: [], phase: name,
});
const leaf = (
  id: string, parentId: string, phaseName: string, name: string,
  start: number, end: number, progress: number,
  budget: number, actual: number,
) => ({
  id, projectId: DEMO_PROJECT_ID, parentId, name, type: "Task" as const,
  startDate: d(start), endDate: d(end), duration: end - start + 1, progress,
  status: progress >= 100 ? "Completed" : progress > 0 ? "In Progress" : "Pending",
  dependencies: [], phase: phaseName,
  budgetedCost: budget, actualCost: actual,
  plannedMaterialCost: Math.round(budget * 0.62), actualMaterialCost: Math.round(actual * 0.62),
  plannedLaborCost: Math.round(budget * 0.31), actualLaborCost: Math.round(actual * 0.31),
  plannedOtherCost: Math.round(budget * 0.07), actualOtherCost: Math.round(actual * 0.07),
});

export const demoTasks = [
  phase("p1", "Substructure", -150, -96, 100),
  leaf("t1", "p1", "Substructure", "Excavation for footings", -150, -142, 100, 185000, 191500),
  leaf("t2", "p1", "Substructure", "PCC bed & footing reinforcement", -141, -128, 100, 462000, 458000),
  leaf("t3", "p1", "Substructure", "Footing concreting", -127, -120, 100, 610000, 624000),
  leaf("t4", "p1", "Substructure", "Plinth beam & backfilling", -119, -96, 100, 528000, 512000),

  phase("p2", "Ground floor", -95, -34, 100),
  leaf("t5", "p2", "Ground floor", "Column reinforcement & shuttering", -95, -84, 100, 395000, 402000),
  leaf("t6", "p2", "Ground floor", "Column concreting", -83, -78, 100, 288000, 285000),
  leaf("t7", "p2", "Ground floor", "Brickwork / blockwork", -77, -58, 100, 640000, 668000),
  leaf("t8", "p2", "Ground floor", "First floor slab", -57, -34, 100, 892000, 905000),

  phase("p3", "First floor", -33, 22, 72),
  leaf("t9", "p3", "First floor", "Column reinforcement & shuttering", -33, -22, 100, 395000, 388000),
  leaf("t10", "p3", "First floor", "Column concreting", -21, -16, 100, 288000, 292000),
  leaf("t11", "p3", "First floor", "Brickwork / blockwork", -15, 4, 65, 640000, 431000),
  leaf("t12", "p3", "First floor", "Second floor slab", 5, 22, 0, 892000, 0),

  phase("p4", "Second floor", 23, 74, 0),
  leaf("t13", "p4", "Second floor", "Column reinforcement & shuttering", 23, 34, 0, 395000, 0),
  leaf("t14", "p4", "Second floor", "Brickwork / blockwork", 35, 54, 0, 640000, 0),
  leaf("t15", "p4", "Second floor", "Roof slab", 55, 74, 0, 892000, 0),

  phase("p5", "MEP — first fix", -10, 48, 34),
  leaf("t16", "p5", "MEP — first fix", "Electrical conduiting", -10, 12, 55, 245000, 138000),
  leaf("t17", "p5", "MEP — first fix", "Plumbing — water supply", 13, 30, 20, 198000, 41000),
  leaf("t18", "p5", "MEP — first fix", "Drainage & sewage", 31, 48, 0, 176000, 0),

  phase("p6", "Finishing", 40, 120, 0),
  leaf("t19", "p6", "Finishing", "Internal plastering", 40, 62, 0, 585000, 0),
  leaf("t20", "p6", "Finishing", "Flooring — vitrified tiles", 63, 88, 0, 742000, 0),
  leaf("t21", "p6", "Finishing", "Painting — internal & external", 89, 120, 0, 468000, 0),

  phase("p7", "Handover", 121, 135, 0),
  leaf("t22", "p7", "Handover", "Snagging & rectification", 121, 130, 0, 85000, 0),
  leaf("t23", "p7", "Handover", "EB connection & handover", 131, 135, 0, 120000, 0),
];

// --- Parties ---------------------------------------------------------------
export const demoVendors = [
  { id: "v1", projectId: DEMO_PROJECT_ID, name: "Lakshmi Steels", type: "Material", contactPerson: "R. Senthil", phone: "+91 98420 11223", gstin: "33AABCL1234M1Z5", address: "Melur Road, Madurai", outstandingBalance: 284500 },
  { id: "v2", projectId: DEMO_PROJECT_ID, name: "Sri Balaji Cements", type: "Material", contactPerson: "M. Karthik", phone: "+91 94430 55671", gstin: "33AAFCS9876P1ZQ", address: "Anna Nagar, Madurai", outstandingBalance: 96200 },
  { id: "v3", projectId: DEMO_PROJECT_ID, name: "Murugan Blue Metals", type: "Material", contactPerson: "S. Pandi", phone: "+91 99445 78210", address: "Othakadai, Madurai", outstandingBalance: 0 },
  { id: "v4", projectId: DEMO_PROJECT_ID, name: "Selvam Labour Contractor", type: "Labor", contactPerson: "K. Selvam", phone: "+91 90031 44526", address: "Thirunagar, Madurai", outstandingBalance: 142000 },
  { id: "v5", projectId: DEMO_PROJECT_ID, name: "Vinayaga Electricals", type: "Both", contactPerson: "A. Ganesh", phone: "+91 98651 33907", gstin: "33AACFV5432N1Z8", address: "K.K. Nagar, Madurai", outstandingBalance: 38400 },
];

// --- Stock -----------------------------------------------------------------
export const demoInventory = [
  { id: "i1", projectId: DEMO_PROJECT_ID, materialId: "CEM-OPC53", name: "OPC 53 Grade Cement", category: "Material", code: "CEM-OPC53", quantity: 2280, consumed: 1860, unit: "Bag", unitCost: 412, avgUnitCost: 408.75, minThreshold: 150 },
  { id: "i2", projectId: DEMO_PROJECT_ID, materialId: "STL-TMT12", name: "TMT Bar 12mm", category: "Material", code: "STL-TMT12", quantity: 22.02, consumed: 18.6, unit: "MT", unitCost: 64290, avgUnitCost: 64150, minThreshold: 2 },
  { id: "i3", projectId: DEMO_PROJECT_ID, materialId: "STL-TMT16", name: "TMT Bar 16mm", category: "Material", code: "STL-TMT16", quantity: 14.5, consumed: 12.4, unit: "MT", unitCost: 63800, avgUnitCost: 63920, minThreshold: 2 },
  { id: "i4", projectId: DEMO_PROJECT_ID, materialId: "AGG-MSAND", name: "M-Sand", category: "Material", code: "AGG-MSAND", quantity: 398, consumed: 312, unit: "Unit", unitCost: 2450, avgUnitCost: 2410, minThreshold: 40 },
  { id: "i5", projectId: DEMO_PROJECT_ID, materialId: "AGG-20MM", name: "20mm Blue Metal", category: "Material", code: "AGG-20MM", quantity: 242, consumed: 208, unit: "Unit", unitCost: 1980, avgUnitCost: 1965, minThreshold: 30 },
  { id: "i6", projectId: DEMO_PROJECT_ID, materialId: "BLK-AAC", name: "AAC Block 600x200x150", category: "Material", code: "BLK-AAC", quantity: 4760, consumed: 4120, unit: "Nos", unitCost: 62, avgUnitCost: 61.5, minThreshold: 400 },
  { id: "i7", projectId: DEMO_PROJECT_ID, materialId: "ELE-CON25", name: "PVC Conduit 25mm", category: "Consumable", code: "ELE-CON25", quantity: 600, consumed: 420, unit: "Nos", unitCost: 96, avgUnitCost: 94.2, minThreshold: 100 },
];

// --- Purchase orders & receipts --------------------------------------------
export const demoPurchaseOrders = [
  { id: "po1", poNumber: "PO-2026-0018", projectId: DEMO_PROJECT_ID, vendorId: "v1", vendorName: "Lakshmi Steels", status: "Partially Received", orderDate: d(-24), expectedDeliveryDate: d(-18), totalAmount: 706190, createdByUid: demoUser.uid, createdByName: demoUser.displayName,
    lineItems: [ { itemId: "i2", materialId: "STL-TMT12", name: "TMT Bar 12mm", orderedQty: 8, unit: "MT", rate: 64290, amount: 514320, receivedQty: 6 }, { itemId: "i3", materialId: "STL-TMT16", name: "TMT Bar 16mm", orderedQty: 3, unit: "MT", rate: 63800, amount: 191400, receivedQty: 3 } ],
    charges: { transport: 470, loading: 0, other: 0 } },
  { id: "po2", poNumber: "PO-2026-0019", projectId: DEMO_PROJECT_ID, vendorId: "v2", vendorName: "Sri Balaji Cements", status: "Closed", orderDate: d(-16), expectedDeliveryDate: d(-14), totalAmount: 247200, createdByUid: demoUser.uid, createdByName: demoUser.displayName,
    lineItems: [ { itemId: "i1", materialId: "CEM-OPC53", name: "OPC 53 Grade Cement", orderedQty: 600, unit: "Bag", rate: 412, amount: 247200, receivedQty: 600 } ] },
  { id: "po3", poNumber: "PO-2026-0020", projectId: DEMO_PROJECT_ID, vendorId: "v3", vendorName: "Murugan Blue Metals", status: "Approved", orderDate: d(-4), expectedDeliveryDate: d(2), totalAmount: 145600, createdByUid: demoUser.uid, createdByName: demoUser.displayName,
    lineItems: [ { itemId: "i4", materialId: "AGG-MSAND", name: "M-Sand", orderedQty: 40, unit: "Unit", rate: 2450, amount: 98000, receivedQty: 0 }, { itemId: "i5", materialId: "AGG-20MM", name: "20mm Blue Metal", orderedQty: 24, unit: "Unit", rate: 1980, amount: 47520, receivedQty: 0 } ] },
  { id: "po4", poNumber: "PO-2026-0021", projectId: DEMO_PROJECT_ID, vendorId: "v5", vendorName: "Vinayaga Electricals", status: "Draft", orderDate: d(-1), totalAmount: 38400, createdByUid: demoUser.uid, createdByName: demoUser.displayName,
    lineItems: [ { itemId: "i7", materialId: "ELE-CON25", name: "PVC Conduit 25mm", orderedQty: 400, unit: "Nos", rate: 96, amount: 38400, receivedQty: 0 } ] },
];

export const demoGRNs = [
  { id: "g1", grnNumber: "GRN-2026-0031", projectId: DEMO_PROJECT_ID, poId: "po1", poNumber: "PO-2026-0018", vendorId: "v1", vendorName: "Lakshmi Steels", receiptDate: d(-18), challanNumber: "DC-10294", totalAmount: 577140, createdByUid: demoUser.uid, createdByName: demoUser.displayName,
    lineItems: [ { poLineRef: "i2", materialId: "STL-TMT12", name: "TMT Bar 12mm", orderedQty: 8, receivedQty: 6, acceptedQty: 6, rejectedQty: 0, unit: "MT" }, { poLineRef: "i3", materialId: "STL-TMT16", name: "TMT Bar 16mm", orderedQty: 3, receivedQty: 3, acceptedQty: 3, rejectedQty: 0, unit: "MT" } ] },
  { id: "g2", grnNumber: "GRN-2026-0032", projectId: DEMO_PROJECT_ID, poId: "po2", poNumber: "PO-2026-0019", vendorId: "v2", vendorName: "Sri Balaji Cements", receiptDate: d(-14), challanNumber: "SBC-8871", totalAmount: 247200, createdByUid: demoUser.uid, createdByName: demoUser.displayName,
    lineItems: [ { poLineRef: "i1", materialId: "CEM-OPC53", name: "OPC 53 Grade Cement", orderedQty: 600, receivedQty: 600, acceptedQty: 596, rejectedQty: 4, unit: "Bag" } ] },
];

// --- Field activity --------------------------------------------------------
export const demoLaborRates = [
  { id: "lr1", projectId: DEMO_PROJECT_ID, vendorId: "v4", role: "Mason", rate: 950, unit: "Shift" },
  { id: "lr2", projectId: DEMO_PROJECT_ID, vendorId: "v4", role: "Helper", rate: 650, unit: "Shift" },
  { id: "lr3", projectId: DEMO_PROJECT_ID, vendorId: "v4", role: "Bar Bender", rate: 1050, unit: "Shift" },
  { id: "lr4", projectId: DEMO_PROJECT_ID, vendorId: "v5", role: "Electrician", rate: 1100, unit: "Shift" },
];

const dayLog = (n: number, taskId: string, pct: number, mason: number, helper: number, bender: number) => ({
  id: `dl${n}`, projectId: DEMO_PROJECT_ID, taskId, workDate: d(-n),
  progressPercent: pct, notes: "", createdAt: `${d(-n)}T09:00:00.000Z`,
  labour: [
    { roleId: "lr1", roleName: "Mason", headcount: mason },
    { roleId: "lr2", roleName: "Helper", headcount: helper },
    ...(bender ? [{ roleId: "lr3", roleName: "Bar Bender", headcount: bender }] : []),
  ],
  materials: [],
});

export const demoDailyLogs = [
  dayLog(1, "t11", 65, 8, 14, 0), dayLog(2, "t11", 61, 8, 12, 0), dayLog(3, "t16", 55, 4, 6, 0),
  dayLog(4, "t11", 57, 9, 15, 0), dayLog(5, "t11", 52, 8, 13, 0), dayLog(6, "t16", 48, 4, 5, 0),
  dayLog(8, "t11", 44, 7, 12, 0), dayLog(9, "t11", 39, 8, 14, 0), dayLog(10, "t16", 36, 3, 6, 0),
  dayLog(12, "t11", 31, 8, 13, 0), dayLog(13, "t11", 26, 9, 15, 2), dayLog(15, "t10", 100, 6, 10, 4),
  dayLog(18, "t10", 78, 6, 11, 5), dayLog(20, "t9", 100, 7, 12, 6), dayLog(24, "t9", 64, 7, 13, 6),
];

export const demoMaterialIssues = [
  { id: "mi1", projectId: DEMO_PROJECT_ID, taskId: "t11", issueDate: d(-2), totalCost: 47355, remarks: "Blockwork — first floor", items: [ { itemId: "i6", materialId: "BLK-AAC", name: "AAC Block 600x200x150", quantity: 770, unitCost: 61.5, totalPrice: 47355 } ] },
  { id: "mi2", projectId: DEMO_PROJECT_ID, taskId: "t11", issueDate: d(-5), totalCost: 61312, remarks: "Blockwork — first floor", items: [ { itemId: "i1", materialId: "CEM-OPC53", name: "OPC 53 Grade Cement", quantity: 150, unitCost: 408.75, totalPrice: 61312 } ] },
  { id: "mi3", projectId: DEMO_PROJECT_ID, taskId: "t8", issueDate: d(-40), totalCost: 192450, remarks: "First floor slab", items: [ { itemId: "i2", materialId: "STL-TMT12", name: "TMT Bar 12mm", quantity: 3, unitCost: 64150, totalPrice: 192450 } ] },
];

export const demoCosts = [
  // Actual spend is derived from these entries (plus issues and labour logs),
  // not from a task's actualCost field — so the completed phases need real
  // entries or the dashboard reads "43% built, 6% spent", which no contractor
  // would believe.
  { id: "c1", projectId: DEMO_PROJECT_ID, taskId: "t1", description: "Excavation — JCB hire & disposal", amount: 191500, type: "Actual", category: "Other", date: d(-146) },
  { id: "c2", projectId: DEMO_PROJECT_ID, taskId: "t2", description: "Footing steel & shuttering", amount: 458000, type: "Actual", category: "Material", date: d(-134) },
  { id: "c3", projectId: DEMO_PROJECT_ID, taskId: "t3", description: "Footing concreting — M25 RMC", amount: 624000, type: "Actual", category: "Material", date: d(-124) },
  { id: "c4", projectId: DEMO_PROJECT_ID, taskId: "t4", description: "Plinth beam & backfilling", amount: 512000, type: "Actual", category: "Material", date: d(-102) },
  { id: "c5", projectId: DEMO_PROJECT_ID, taskId: "t5", description: "GF columns — steel & shuttering", amount: 402000, type: "Actual", category: "Material", date: d(-88) },
  { id: "c6", projectId: DEMO_PROJECT_ID, taskId: "t6", description: "GF column concreting", amount: 285000, type: "Actual", category: "Material", date: d(-80) },
  { id: "c7", projectId: DEMO_PROJECT_ID, taskId: "t7", description: "GF blockwork — blocks & mortar", amount: 668000, type: "Actual", category: "Material", date: d(-62) },
  { id: "c8", projectId: DEMO_PROJECT_ID, taskId: "t8", description: "First floor slab — RMC & steel", amount: 905000, type: "Actual", category: "Material", date: d(-38) },
  { id: "c9", projectId: DEMO_PROJECT_ID, taskId: "t8", description: "Concrete pump hire", amount: 28000, type: "Actual", category: "Other", date: d(-38) },
  { id: "c10", projectId: DEMO_PROJECT_ID, taskId: "t9", description: "FF columns — steel & shuttering", amount: 388000, type: "Actual", category: "Material", date: d(-26) },
  { id: "c11", projectId: DEMO_PROJECT_ID, taskId: "t10", description: "FF column concreting", amount: 292000, type: "Actual", category: "Material", date: d(-18) },
  { id: "c12", projectId: DEMO_PROJECT_ID, taskId: "t11", description: "Scaffolding hire — first floor", amount: 34000, type: "Actual", category: "Other", date: d(-7) },
  { id: "c13", projectId: DEMO_PROJECT_ID, taskId: "t16", description: "Electrician advance", amount: 45000, type: "Actual", category: "Labor", date: d(-9) },
];

export const demoLedger = [
  { id: "l1", projectId: DEMO_PROJECT_ID, vendorId: "v1", date: d(-18), type: "CREDIT", amount: 577140, referenceType: "GRN", referenceId: "g1", description: "GRN-2026-0031 · PO-2026-0018" },
  { id: "l2", projectId: DEMO_PROJECT_ID, vendorId: "v1", date: d(-9), type: "DEBIT", amount: 292640, referenceType: "PAYMENT", description: "NEFT payment" },
  { id: "l3", projectId: DEMO_PROJECT_ID, vendorId: "v2", date: d(-14), type: "CREDIT", amount: 247200, referenceType: "GRN", referenceId: "g2", description: "GRN-2026-0032 · PO-2026-0019" },
  { id: "l4", projectId: DEMO_PROJECT_ID, vendorId: "v2", date: d(-6), type: "DEBIT", amount: 151000, referenceType: "PAYMENT", description: "Cheque 004512" },
];

// --- Client estimates & documents ------------------------------------------
export const demoEstimates = [
  {
    id: "e1", projectId: DEMO_PROJECT_ID, estimateNumber: "EST-2026-004",
    dateCreated: d(-118), dateValidUntil: d(-88), status: "Approved",
    subTotal: 10850000, taxRatePercent: 18, taxAmount: 1953000, totalAmount: 12803000,
    clientNotes: "Rates hold for 30 days. Excludes compound wall and landscaping.",
    items: [
      { id: "ei1", taskId: "p1", taskName: "Substructure", description: "Excavation, PCC, footings and plinth beam", quantity: 1, unit: "LS", rate: 1785000, totalAmount: 1785000 },
      { id: "ei2", taskId: "p2", taskName: "Ground floor", description: "RCC frame, blockwork and first floor slab", quantity: 3200, unit: "Sq ft", rate: 690, totalAmount: 2208000 },
      { id: "ei3", taskId: "p3", taskName: "First floor", description: "RCC frame, blockwork and second floor slab", quantity: 3200, unit: "Sq ft", rate: 690, totalAmount: 2208000 },
      { id: "ei4", taskId: "p4", taskName: "Second floor", description: "RCC frame, blockwork and roof slab", quantity: 3200, unit: "Sq ft", rate: 602, totalAmount: 1926400 },
      { id: "ei5", taskId: "p5", taskName: "MEP — first fix", description: "Electrical conduiting, plumbing and drainage", quantity: 1, unit: "LS", rate: 619000, totalAmount: 619000 },
      { id: "ei6", taskId: "p6", taskName: "Finishing", description: "Plastering, flooring, painting and joinery", quantity: 1, unit: "LS", rate: 1795000, totalAmount: 1795000 },
      { id: "ei7", taskId: "p7", taskName: "Handover", description: "Snagging, cleaning and statutory connections", quantity: 1, unit: "LS", rate: 308600, totalAmount: 308600 },
    ],
  },
  {
    id: "e2", projectId: DEMO_PROJECT_ID, estimateNumber: "EST-2026-011",
    dateCreated: d(-12), dateValidUntil: d(18), status: "Sent to Client",
    subTotal: 486000, taxRatePercent: 18, taxAmount: 87480, totalAmount: 573480,
    clientNotes: "Change order — upgraded flooring and additional bathroom on first floor.",
    items: [
      { id: "ei8", taskId: "t20", taskName: "Flooring — vitrified tiles", description: "Upgrade to 800x800 double-charge vitrified", quantity: 1600, unit: "Sq ft", rate: 185, totalAmount: 296000, isChangeOrder: true },
      { id: "ei9", taskId: "t17", taskName: "Plumbing — water supply", description: "Additional bathroom — first floor", quantity: 1, unit: "LS", rate: 190000, totalAmount: 190000, isChangeOrder: true },
    ],
  },
];

export const demoDocuments = [
  { id: "doc1", projectId: DEMO_PROJECT_ID, name: "Approved plan — Madurai Corporation.pdf", type: "application/pdf", url: "#", uploadedBy: "Demo Owner", uploadedAt: d(-152), accessLevel: "Internal", category: "Approvals", tags: ["sanction"] },
  { id: "doc2", projectId: DEMO_PROJECT_ID, name: "Soil investigation report.pdf", type: "application/pdf", url: "#", uploadedBy: "Demo Owner", uploadedAt: d(-155), accessLevel: "Internal", category: "Reports" },
  { id: "doc3", projectId: DEMO_PROJECT_ID, name: "Structural drawings — R2.pdf", type: "application/pdf", url: "#", uploadedBy: "Demo Owner", uploadedAt: d(-140), accessLevel: "Internal", category: "Drawings", tags: ["structural"] },
  { id: "doc4", projectId: DEMO_PROJECT_ID, name: "Client agreement — signed.pdf", type: "application/pdf", url: "#", uploadedBy: "Demo Owner", uploadedAt: d(-149), accessLevel: "Confidential", category: "Contracts" },
  { id: "doc5", projectId: DEMO_PROJECT_ID, name: "Cube test results — 28 day.pdf", type: "application/pdf", url: "#", uploadedBy: "Demo Owner", uploadedAt: d(-96), accessLevel: "Internal", category: "Quality" },
  { id: "doc6", projectId: DEMO_PROJECT_ID, name: "Site photos — first floor slab.zip", type: "application/zip", url: "#", uploadedBy: "Demo Owner", uploadedAt: d(-36), accessLevel: "Internal", category: "Photos" },
];

/** Collection name → fixture. Anything not listed renders as empty, which is fine. */
// Project Insights fixture. The panel reads the last generated result from
// Firestore, so without this the demo shows an empty state for one of the
// twelve modules. Written to match the demo project's actual numbers.
export const demoInsights = {
  generatedAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
  model: "demo",
  insights: {
    executiveDigest:
      "Ramkumar Residence is **43% built** with **50% of the budget drawn**, so spend is running a little ahead of progress but stays inside the sanctioned amount.\n\n" +
      "- Substructure and ground floor are closed out and paid for.\n" +
      "- First floor blockwork is the active front at 65%, with 22 workers on site yesterday.\n" +
      "- Labour is the one head running over: **₹9.06L spent against ₹3.34L planned**.\n" +
      "- Material is comfortably under at **₹48.35L against ₹66.72L planned**.",
    costVariance:
      "Total actual is **₹53.66L against a ₹1.08Cr budget**, leaving **₹54.0L** uncommitted.\n\n" +
      "- **Labour is over by ₹5.72L.** Blockwork has drawn more mason-days than estimated; the ground-floor slab also ran two extra shifts.\n" +
      "- **Material is under by ₹12.98L**, largely because second-floor steel has not been ordered yet — expect this gap to close.\n" +
      "- Cement landed at **₹412/bag against ₹408.75 average**, a small rise worth watching on the next order.",
    scheduleSlippage:
      "No task is past its end date today.\n\n" +
      "- First floor is tracking at **67%** against a Jul–Sep window.\n" +
      "- Second floor has not started and is scheduled Sep–Nov.\n" +
      "- Float on the blockwork chain is **0 days**, so any slip there moves the finish date directly.",
    siteReport:
      "**Site report — first floor**\n\n" +
      "- Blockwork advanced from 61% to **65%**.\n" +
      "- Deployed: **8 masons, 14 helpers**.\n" +
      "- Consumed: **770 AAC blocks**, 150 bags cement over the week.\n" +
      "- No safety incidents or stoppages reported.",
  },
};

export const demoCollections: Record<string, any[]> = {
  // useProjectCostTotals reads tasks through the generic query, not useTasksQuery.
  tasks: demoTasks,
  suppliers: demoVendors,
  inventory: demoInventory,
  purchase_orders: demoPurchaseOrders,
  goodsReceiptNotes: demoGRNs,
  costs: demoCosts,
  labor_rate_cards: demoLaborRates,
  ledger: demoLedger,
  dailyLogs: demoDailyLogs,
  material_issues: demoMaterialIssues,
  labor_logs: [],
  ra_bills: [],
  equipment: [],
  client_payments: [],
  receipts: [],
  estimates: demoEstimates,
  documents: demoDocuments,
};
