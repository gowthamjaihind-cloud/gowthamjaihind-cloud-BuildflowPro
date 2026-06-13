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
