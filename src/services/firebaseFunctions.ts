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
