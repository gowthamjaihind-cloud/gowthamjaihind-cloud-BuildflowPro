import { getFunctions, httpsCallable } from "firebase/functions";
import { getApp } from "firebase/app";

/**
 * Where the callables live. MUST match REGION in functions/src/callable.ts:
 * getFunctions(app) with no region silently targets us-central1, so a mismatch
 * does not fail the build or the deploy — every callable just starts returning
 * "not found" at runtime. TelegramBotStatus.test.ts asserts the two agree.
 */
export const FUNCTIONS_REGION = "asia-southeast1";

// Helper to reliably get the functions instance (assumes getApp() is ready)
const getFunctionsInstance = () => getFunctions(getApp(), FUNCTIONS_REGION);

// Projects
export const callDeleteProject = async (projectId: string) => {
  const fn = httpsCallable<{ projectId: string }, { success: boolean, message: string }>(getFunctionsInstance(), 'deleteProject');
  return fn({ projectId });
};

export const callBulkUpdateTasks = async (projectId: string, taskIds: string[], updates: any) => {
  const fn = httpsCallable<{ projectId: string, taskIds: string[], updates: any }, { success: boolean, updatedCount: number }>(getFunctionsInstance(), 'bulkUpdateTasks');
  return fn({ projectId, taskIds, updates });
};

// Approvals
export const callProcessApproval = async (approvalId: string, action: 'APPROVED' | 'REJECTED', comments?: string) => {
  const fn = httpsCallable<{ approvalId: string, action: 'APPROVED' | 'REJECTED', comments?: string }, { success: boolean, result: any }>(getFunctionsInstance(), 'processApproval');
  return fn({ approvalId, action, comments });
};

// AI Workflows
export const callProcessCostAnalysisData = async (projectId: string) => {
  const fn = httpsCallable<{ projectId: string }, { success: boolean, insights: string }>(getFunctionsInstance(), 'processCostAnalysisData');
  return fn({ projectId });
};

export interface ProjectInsightsResult {
  insights: {
    costVariance: string;
    scheduleSlippage: string;
    executiveDigest: string;
    siteReport: string;
  };
  generatedAt: string;
  model: string;
}

// Sends a compact, already-aggregated project brief to the server-side Gemini
// call and returns the four insight sections. Keeping aggregation on the client
// avoids re-deriving cost/schedule maths on the backend and keeps the API key
// server-side.
export const callGenerateProjectInsights = async (brief: any) => {
  const fn = httpsCallable<{ brief: any }, ProjectInsightsResult>(getFunctionsInstance(), 'generateProjectInsights');
  const res = await fn({ brief });
  return res.data;
};

export interface ExtractedInvoice {
  bill: any;                 // draft VendorBill (see types.VendorBill)
  flags: string[];           // discrepancy messages
  confidence: number;
  candidatePOs: { id: string; poNumber: string; vendorId: string }[];
}

// Sends a scanned GST invoice (image/PDF, base64) to the server-side Gemini
// vision reader; returns a draft bill matched to a PO with discrepancy flags.
export const callExtractVendorInvoice = async (args: {
  orgId?: string; projectId: string; fileBase64: string; mimeType: string;
}) => {
  const fn = httpsCallable<typeof args, ExtractedInvoice>(getFunctionsInstance(), 'extractVendorInvoice');
  const res = await fn(args);
  return res.data;
};

export interface SetupOrgResult {
  orgId: string;
  alreadyLinked: boolean;
  projects: number;
  docs: number;
}

// One-time admin migration: creates the organization (seeding the caller as
// Owner), copies legacy projects/* data under organizations/{orgId}/, and links
// the caller's account. Legacy data is left intact as a backup.
export const callSetupOrganization = async (companyName?: string) => {
  // The migration can take a while on large datasets; the httpsCallable default
  // client timeout is 70s, so raise it to match the function's 540s budget.
  const fn = httpsCallable<{ companyName?: string }, SetupOrgResult>(
    getFunctionsInstance(),
    'setupOrganization',
    { timeout: 540000 },
  );
  const res = await fn({ companyName });
  return res.data;
};

// Self-serve: a signed-in user creates their own organization. Free/trial link
// them immediately; a pay-now org is created unlinked (needsPayment) until the
// Razorpay payment activates and links it.
export const callCreateOrganization = async (args: { companyName: string; plan?: string; startTrial?: boolean }) => {
  const fn = httpsCallable<typeof args, { orgId: string; plan: string; subscriptionStatus: string; needsPayment: boolean }>(
    getFunctionsInstance(), 'createOrganization');
  const res = await fn(args);
  return res.data;
};

// Owner/Admin mints an invite code for a teammate (shared as …/?invite=CODE).
export const callCreateInvite = async (args: { email?: string; role: string }) => {
  const fn = httpsCallable<typeof args, { code: string; orgId: string; role: string; email: string | null; emailed: boolean; emailError: string | null }>(
    getFunctionsInstance(), 'createInvite');
  const res = await fn(args);
  return res.data;
};

// A signed-in user redeems an invite code to join an org.
export const callAcceptInvite = async (code: string) => {
  const fn = httpsCallable<{ code: string }, { orgId: string; role: string; orgName: string }>(
    getFunctionsInstance(), 'acceptInvite');
  const res = await fn({ code });
  return res.data;
};

// Super-admin: provision a new customer org (30-day trial) + owner invite.
export const callProvisionOrganization = async (args: { companyName: string; ownerEmail?: string }) => {
  const fn = httpsCallable<typeof args, { orgId: string; code: string; trialEndsAt: number; emailed: boolean; emailError: string | null }>(
    getFunctionsInstance(), 'provisionOrganization');
  const res = await fn(args);
  return res.data;
};

// Super-admin: configure the Resend email service (stores key server-side).
export const callSetEmailConfig = async (args: { apiKey: string; fromEmail: string; fromName?: string }) => {
  const fn = httpsCallable<typeof args, { ok: boolean }>(getFunctionsInstance(), 'setEmailConfig');
  const res = await fn(args);
  return res.data;
};

export const callGetEmailConfigStatus = async () => {
  const fn = httpsCallable<{}, { configured: boolean; fromEmail: string; fromName: string }>(
    getFunctionsInstance(), 'getEmailConfigStatus');
  const res = await fn({});
  return res.data;
};

// Super-admin: set an org's subscription (activate / extend_trial / expire / internal).
export const callSetSubscription = async (args: { orgId: string; action: string; months?: number }) => {
  const fn = httpsCallable<typeof args, any>(getFunctionsInstance(), 'setSubscription');
  const res = await fn(args);
  return res.data;
};

// Super-admin: place an org on a project-based plan (free/starter/growth/business/enterprise).
// force overrides the downgrade guard (target plan's cap < the org's project count).
export const callSetOrgPlan = async (args: { orgId: string; plan: string; months?: number; force?: boolean }) => {
  const fn = httpsCallable<typeof args, any>(getFunctionsInstance(), 'setOrgPlan');
  const res = await fn(args);
  return res.data;
};

export interface OrgUsage {
  plan: string | null;
  subscriptionStatus: string | null;
  companyName: string | null;
  /** The EFFECTIVE project cap: the plan's own cap plus any live slot window. */
  includedProjects: number | null;
  projectCount: number;
  overageProjects: number;
  overageCost: number;
  aiUsed: number;
  /** The cap actually enforced — per-project where the plan sets one. */
  aiQuota: number | null;
  aiScansPerProject: number | null;

  // Subscription lifecycle (functions/src/subscription.ts).
  lifecycle: {
    status: string | null;
    label: string;
    endsAt: number | null;
    daysLeft: number | null;
    attention: boolean;
  };
  currentPeriodEnd: number | null;
  graceEndsAt: number | null;
  trialEndsAt: number | null;
  renewalNoticeSent: { days?: number; periodEnd?: number; at?: number } | null;

  // Seats (functions/src/seats.ts).
  seatsUsed: number;
  userLimit: number | null;

  // Wrong-plan and soft-cap flags (functions/src/plans.ts planAdvice).
  advice: {
    cheaper: string | null;
    currentCost: number;
    cheaperCost: number;
    savings: number;
    overSoftCap: boolean;
  };
  businessSoftCap: number;

  // Project slots. planIncluded is the plan's own cap, so the difference from
  // includedProjects is the slot window.
  planIncluded: number | null;
  activeSlots: number;
  purchasedSlots: number;
  slotsExpireAt: number | null;
  slotNoticeSent: { kind?: string; expireAt?: number; at?: number } | null;
}

// Super-admin: read an org's live usage vs plan (the safety-cap view).
export const callGetOrgUsage = async (orgId: string) => {
  const fn = httpsCallable<{ orgId: string }, OrgUsage>(getFunctionsInstance(), 'getOrgUsage');
  const res = await fn({ orgId });
  return res.data;
};

// ---- Razorpay (test-mode billing) ----

// Super-admin: store the Razorpay keys (server-side, Admin-only doc).
export const callSetRazorpayConfig = async (args: { keyId: string; keySecret: string; webhookSecret?: string }) => {
  const fn = httpsCallable<typeof args, { ok: boolean }>(getFunctionsInstance(), 'setRazorpayConfig');
  const res = await fn(args);
  return res.data;
};

export const callGetRazorpayConfigStatus = async () => {
  const fn = httpsCallable<{}, { configured: boolean; keyId: string; hasWebhookSecret: boolean; mode: string }>(
    getFunctionsInstance(), 'getRazorpayConfigStatus');
  const res = await fn({});
  return res.data;
};

// ---- GST (seller-side tax) ----
//
// The rate stays 0 until a GSTIN is stored, because charging GST before you are
// registered is collecting tax you have no right to. Setting the GSTIN here is
// what switches 18% on at checkout -- no redeploy.
// Public: the GST rate checkout applies, for pricing copy. No GSTIN, no auth.
export const callGetCheckoutTaxRate = async () => {
  const fn = httpsCallable<Record<string, never>, { ratePct: number }>(
    getFunctionsInstance(), 'getCheckoutTaxRate');
  return (await fn({})).data;
};

export const callSetTaxConfig = async (args: { gstin: string; ratePct?: number }) => {
  const fn = httpsCallable<typeof args, { ok: boolean; gstin: string; ratePct: number }>(
    getFunctionsInstance(), 'setTaxConfig');
  return (await fn(args)).data;
};

export const callGetTaxConfigStatus = async () => {
  const fn = httpsCallable<Record<string, never>, { configured: boolean; gstin: string; ratePct: number }>(
    getFunctionsInstance(), 'getTaxConfigStatus');
  return (await fn({})).data;
};

// Owner/Admin: create a server-priced Razorpay order for a plan + period.
// orgId is optional — used by the signup pay-now flow (org not yet linked).
export const callCreateRazorpayOrder = async (args: { plan: string; period: 'monthly' | 'annual'; orgId?: string }) => {
  const fn = httpsCallable<typeof args, { orderId: string; amount: number; currency: string; keyId: string }>(
    getFunctionsInstance(), 'createRazorpayOrder');
  const res = await fn(args);
  return res.data;
};

// Owner/Admin on a paid plan: create a server-priced order for N extra project
// slots (₹99 each). Payment raises the org's included-project cap.
export const callCreateSlotOrder = async (args: { quantity: number; orgId?: string }) => {
  const fn = httpsCallable<typeof args, { orderId: string; amount: number; currency: string; keyId: string }>(
    getFunctionsInstance(), 'createSlotOrder');
  const res = await fn(args);
  return res.data;
};

// Verify a completed payment (backup to the webhook) — activates the plan.
export const callVerifyRazorpayPayment = async (args: {
  razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string;
}) => {
  const fn = httpsCallable<typeof args, { ok: boolean }>(getFunctionsInstance(), 'verifyRazorpayPayment');
  const res = await fn(args);
  return res.data;
};

// Owner/Admin: schedule a downgrade to a lower plan, effective at the end of
// the current paid cycle. The org keeps its current plan until then.
export const callScheduleDowngrade = async (args: { targetPlan: string; orgId?: string }) => {
  const fn = httpsCallable<typeof args, { scheduled: boolean; targetPlan: string; effectiveAt: number }>(
    getFunctionsInstance(), 'scheduleDowngrade');
  const res = await fn(args);
  return res.data;
};

// Owner/Admin: cancel a scheduled downgrade — the org keeps its current plan.
export const callCancelScheduledPlanChange = async (args: { orgId?: string } = {}) => {
  const fn = httpsCallable<typeof args, { canceled: boolean }>(
    getFunctionsInstance(), 'cancelScheduledPlanChange');
  const res = await fn(args);
  return res.data;
};

// ---- Data-subject rights (export / erasure) ----

// Download a machine-readable copy of the caller's profile and (for Owners/
// Admins) their organization's data. Can take a while on large tenants.
export const callExportMyData = async () => {
  const fn = httpsCallable<{}, any>(getFunctionsInstance(), 'exportMyData', { timeout: 300000 });
  const res = await fn({});
  return res.data;
};

// Owner-only: permanently delete an organization and all of its data.
export const callDeleteOrganization = async (orgId: string) => {
  const fn = httpsCallable<{ orgId: string }, { ok: boolean; orgId: string; unlinkedMembers: number }>(
    getFunctionsInstance(), 'deleteOrganization', { timeout: 300000 });
  const res = await fn({ orgId });
  return res.data;
};

// Permanently delete the caller's own account (profile + auth) and their
// membership in every org (deleting any org where they are the sole member).
export const callDeleteMyAccount = async () => {
  const fn = httpsCallable<{}, { ok: boolean; authDeleted: boolean }>(
    getFunctionsInstance(), 'deleteMyAccount', { timeout: 300000 });
  const res = await fn({});
  return res.data;
};

// Bring the signed-in user's org membership into their ID token as a custom
// claim. Cloud Storage rules cannot read Firestore, so tenancy can only be
// checked there from a claim; this is what puts it in reach. Called on
// sign-in, and it backfills accounts that predate claims.
//
// Returns `changed`, because a new claim does not appear in the token the
// client is already holding — it has to be refreshed. See syncMyClaims in the
// functions codebase.
export const callSyncMyClaims = async () => {
  const fn = httpsCallable<Record<string, never>, { orgIds: string[]; changed: boolean }>(
    getFunctionsInstance(), 'syncMyClaims');
  const res = await fn({} as Record<string, never>);
  return res.data;
};

// Cancel at the end of the period already paid for (no refund, nothing deleted),
// and the undo for it.
export const callCancelSubscription = async () => {
  const fn = httpsCallable<{}, { canceled: boolean; effectiveAt: number | null }>(
    getFunctionsInstance(), 'cancelSubscription');
  return (await fn({})).data;
};

export const callResumeSubscription = async () => {
  const fn = httpsCallable<{}, { resumed: boolean }>(getFunctionsInstance(), 'resumeSubscription');
  return (await fn({})).data;
};

export interface BillingHistoryRow {
  orderId: string;
  kind: "plan" | "slots";
  plan: string | null;
  period: string | null;
  quantity: number | null;
  /** Rupees actually charged. */
  amount: number;
  /** List price before any proration credit, in rupees. */
  listAmount: number | null;
  /** Proration credit applied, in rupees. */
  credit: number | null;
  paidAt: string | null;
}

// Owner/Admin: what this workspace has actually been charged.
export const callGetBillingHistory = async () => {
  const fn = httpsCallable<{}, { orgId: string; rows: BillingHistoryRow[] }>(
    getFunctionsInstance(), 'getBillingHistory');
  return (await fn({})).data;
};
