import { getFunctions, httpsCallable } from "firebase/functions";
import { getApp } from "firebase/app";

// Helper to reliably get the functions instance (assumes getApp() is ready)
const getFunctionsInstance = () => getFunctions(getApp());

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
export const callSetOrgPlan = async (args: { orgId: string; plan: string; months?: number }) => {
  const fn = httpsCallable<typeof args, any>(getFunctionsInstance(), 'setOrgPlan');
  const res = await fn(args);
  return res.data;
};

export interface OrgUsage {
  plan: string | null;
  subscriptionStatus: string | null;
  companyName: string | null;
  includedProjects: number | null;
  projectCount: number;
  overageProjects: number;
  overageCost: number;
  aiUsed: number;
  aiQuota: number | null;
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
