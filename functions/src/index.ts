import * as admin from "firebase-admin";

admin.initializeApp();

export * from "./projects";
export * from "./approvals";
export * from "./notifications";
export * from "./audit";
export * from "./ai";
export * from "./dailyLogs";
export * from "./receipts";
