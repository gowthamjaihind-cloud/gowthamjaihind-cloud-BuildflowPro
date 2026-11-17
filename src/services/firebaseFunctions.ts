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

// Owner/Admin: start a RECURRING subscription for the plan fee. The returned
// subscriptionId opens Razorpay checkout in mandate mode; every later charge
// then happens without the customer, and webhooks keep the org in step.
export const callCreateSubscription = async (args: { plan: string; period: "monthly" | "annual"; orgId?: string }) => {
  const fn = httpsCallable<typeof args, {
    subscriptionId: string; shortUrl: string | null; keyId: string; plan: string; period: string;
  }>(getFunctionsInstance(), 'createSubscription');
  return (await fn(args)).data;
};

// Owner/Admin: ask the server to confirm a subscription payment with Razorpay
// directly. The webhook normally does this; it can be late or lost.
export const callConfirmSubscription = async (args: { subscriptionId?: string; orgId?: string } = {}) => {
  const fn = httpsCallable<typeof args, { active: boolean }>(getFunctionsInstance(), 'confirmSubscription');
  return (await fn(args)).data;
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

// Extra project slots as a RECURRING subscription (₹99 each a month), separate
// from the plan's. See functions/src/slotSubs.ts for why it is separate.
export const callCreateSlotSubscription = async (args: { quantity: number; orgId?: string; projectId?: string }) => {
  const fn = httpsCallable<typeof args, { subscriptionId: string; keyId: string; quantity: number; amount: number }>(
    getFunctionsInstance(), 'createSlotSubscription');
  const res = await fn(args);
  return res.data;
};

// Stop one slot subscription at the end of the month already paid for.
export const callCancelSlotSubscription = async (args: { subscriptionId: string }) => {
  const fn = httpsCallable<typeof args, { canceled: boolean; effectiveAt: number | null }>(
    getFunctionsInstance(), 'cancelSlotSubscription');
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

/** One payment actually taken: a subscription charge or an older one-off order. */
export interface BillingPayment {
  id: string;
  source: "order" | "subscription";
  kind: "plan" | "slots";
  plan: string | null;
  period: string | null;
  quantity: number | null;
  /** Projects an extra-project payment was for (as they stand today). */
  projectIds: string[];
  /** Rupees charged, tax included. */
  amount: number;
  tax: number | null;
  paidAt: number | null;
  periodStart: number | null;
  periodEnd: number | null;
  paymentId: string | null;
  /** Razorpay's receipt page for this payment. */
  receiptUrl: string | null;
  listAmount: number | null;
  credit: number | null;
  subscriptionId?: string;
}

/** A subscription as Razorpay holds it right now. */
export interface BillingSubscription {
  id: string;
  kind: "plan" | "slots";
  plan: string | null;
  period: string | null;
  quantity: number;
  projectIds: string[];
  status: string;
  currentStart: number | null;
  currentEnd: number | null;
  nextChargeAt: number | null;
  paidCount: number;
}

export interface BillingHistory {
  orgId: string;
  rows: BillingHistoryRow[];
  payments: BillingPayment[];
  subscriptions: BillingSubscription[];
  /** False when the payment provider could not be reached for everything. */
  complete: boolean;
}

// Owner/Admin: what this workspace has actually been charged.
export const callGetBillingHistory = async () => {
  const fn = httpsCallable<{}, BillingHistory>(
    getFunctionsInstance(), 'getBillingHistory');
  return (await fn({})).data;
};

/** What Telegram reports about the bot's connection (operator only). */
export interface TelegramDiagnostics {
  tokenOk: boolean;
  botUsername: string | null;
  webhookUrl: string | null;
  expectedUrl: string;
  urlMatches: boolean;
  pendingUpdates: number;
  lastErrorAt: number | null;
  lastErrorMessage: string | null;
  secretConfigured: boolean;
  problems: string[];
  /** Why the bot's AI work failed recently, newest first. */
  recentErrors?: Array<{ at: number; kind: string; code: string; reason: string }>;
}

export const callTelegramDiagnostics = async () =>
  (await httpsCallable<{}, TelegramDiagnostics>(getFunctionsInstance(), 'telegramDiagnostics')({})).data;

// Registers this app's webhook with Telegram again, using the current secret.
export const callTelegramReconnect = async () =>
  (await httpsCallable<{}, TelegramDiagnostics>(getFunctionsInstance(), 'telegramReconnect')({})).data;

/** One model's answer to the operator's AI self-test. */
export interface AiProbe { status: number | string; seconds: number; sample: string }
export interface AiSelfTest {
  keySet: boolean;
  project?: { tasks: number; materials: number; roles: number; equipment: number } | null;
  promptChars?: number;
  results: Array<{ model: string; tiny: AiProbe; real: AiProbe | null }>;
}

export const callTelegramAiSelfTest = async (text?: string) =>
  (await httpsCallable<{ text?: string }, AiSelfTest>(getFunctionsInstance(), 'telegramAiSelfTest', { timeout: 200_000 })({ text })).data;

// ── Client share links (functions/src/clientShare) ───────────────────────────
export interface ClientShareSections { progress: boolean; photos: boolean; updates: boolean; payments: boolean }
export interface ClientShare {
  token: string;
  label: string;
  sections: ClientShareSections;
  showHeadcount: boolean;
  revoked: boolean;
  createdAt: string | null;
  lastViewedAt: string | null;
  views: number;
}
export const callCreateClientShare = async (args: { orgId?: string; projectId: string; label?: string; sections: ClientShareSections; showHeadcount: boolean }) =>
  (await httpsCallable<typeof args, ClientShare>(getFunctionsInstance(), "createClientShare")(args)).data;
export const callListClientShares = async (args: { orgId?: string; projectId: string }) =>
  (await httpsCallable<typeof args, ClientShare[]>(getFunctionsInstance(), "listClientShares")(args)).data;
export const callUpdateClientShare = async (args: { token: string; sections?: ClientShareSections; showHeadcount?: boolean; label?: string; revoked?: boolean }) =>
  (await httpsCallable<typeof args, ClientShare>(getFunctionsInstance(), "updateClientShare")(args)).data;

// ── In-app help assistant (functions/src/help) ───────────────────────────────
export interface HelpTurn { role: "user" | "assistant"; text: string }
export interface HelpCheck { id: string; label: string; status: "ok" | "warn" | "fail" | "info"; detail: string; fix?: string }
export const callHelpDiagnose = async (args: { orgId?: string }) =>
  (await httpsCallable<typeof args, { checks: HelpCheck[] }>(getFunctionsInstance(), "helpDiagnose")(args)).data;
export const callReportProblem = async (args: { orgId?: string; description: string; checks: HelpCheck[]; errors: string[]; device: string; page?: string }) =>
  (await httpsCallable<typeof args, { reportId: string }>(getFunctionsInstance(), "reportProblem")(args)).data;
export const callListSupportReports = async () =>
  (await httpsCallable<Record<string, never>, any[]>(getFunctionsInstance(), "listSupportReports")({})).data;
export const callHelpChat = async (args: { orgId?: string; messages: HelpTurn[]; checks?: HelpCheck[] }) =>
  (await httpsCallable<typeof args, { answer: string }>(getFunctionsInstance(), "helpChat", { timeout: 70_000 })(args)).data;

// ── Team members' Telegram (functions/src/telegram/teamLinks) ───────────────
export type TeamTelegramStatus = Record<string, { linked: boolean; linkedAt?: number; pendingSince?: number }>;
export const callListTeamTelegram = async (orgId: string) =>
  (await httpsCallable<{ orgId: string }, TeamTelegramStatus>(getFunctionsInstance(), "listTeamTelegram")({ orgId })).data;
export const callCreateMemberTelegramLink = async (orgId: string, memberUid: string) =>
  (await httpsCallable<{ orgId: string; memberUid: string }, { link: string }>(getFunctionsInstance(), "createMemberTelegramLink")({ orgId, memberUid })).data;
export const callRevokeMemberTelegramLink = async (orgId: string, memberUid: string) =>
  (await httpsCallable<{ orgId: string; memberUid: string }, { revoked: number }>(getFunctionsInstance(), "revokeMemberTelegramLink")({ orgId, memberUid })).data;
export const callUnlinkMemberTelegram = async (orgId: string, memberUid: string) =>
  (await httpsCallable<{ orgId: string; memberUid: string }, { unlinked: boolean }>(getFunctionsInstance(), "unlinkMemberTelegram")({ orgId, memberUid })).data;

// ── "Do it for me" (functions/src/actions): the same engine the bot uses ────
export interface CommandPoDraft {
  vendorId: string;
  vendorName: string;
  expectedDeliveryDate: string;
  notes: string;
  items: { itemId: string; materialId: string; name: string; unit: string; orderedQty: number; rate: number; hsn: string; gstRate: number; rateFromRequest: boolean }[];
}
export type ActionPending =
  | { kind: "po"; draft: CommandPoDraft; unmatched: string[]; missingVendor: boolean }
  | { kind: "payment" | "vendor" | "material" | "logs"; [k: string]: unknown };
export type ActionPrepared =
  | { type: "denied" | "answer" | "other"; transcript: string; message: string }
  | { type: "log"; transcript: string }
  | { type: "pending"; transcript: string; id: string; kind: ActionPending["kind"]; lines: string[]; blockers: string[]; pending: ActionPending };
export const callActionPrepare = async (args: { orgId?: string; projectId: string; text?: string; audioBase64?: string; mimeType?: string }) =>
  (await httpsCallable<typeof args, ActionPrepared>(getFunctionsInstance(), "actionPrepare", { timeout: 130_000 })(args)).data;
export const callActionConfirm = async (id: string) =>
  (await httpsCallable<{ id: string }, { message: string; poId?: string; poNumber?: string; projectId: string; orgId: string }>(getFunctionsInstance(), "actionConfirm", { timeout: 60_000 })({ id })).data;
export interface TaxSuggestion { name: string; hsn: string; gstRate: number; source: "list" | "ai" }
export const callTaxCodeSuggestions = async (orgId: string, names: string[]) =>
  (await httpsCallable<{ orgId: string; names: string[] }, { suggestions: TaxSuggestion[] }>(getFunctionsInstance(), "taxCodeSuggestions", { timeout: 100_000 })({ orgId, names })).data;
export const callApplyTaxCodes = async (orgId: string, updates: { masterId: string; hsn: string; gstRate: number }[]) =>
  (await httpsCallable<{ orgId: string; updates: typeof updates }, { masters: number; inventoryItems: number }>(getFunctionsInstance(), "applyTaxCodes", { timeout: 130_000 })({ orgId, updates })).data;
export const callActionCancel = async (id: string) =>
  (await httpsCallable<{ id: string }, { ok: boolean }>(getFunctionsInstance(), "actionCancel")({ id })).data;
