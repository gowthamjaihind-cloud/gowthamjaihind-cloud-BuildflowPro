import * as admin from "firebase-admin";

admin.initializeApp();
// Firestore access goes through ./db, which binds to the app's named database
// and applies its own settings. Never call admin.firestore() directly.

export * from "./projects";
export * from "./approvals";
export * from "./notifications";
export * from "./audit";
export * from "./ai";
export * from "./dailyLogs";
export * from "./goodsReceipt";
export * from "./telegram";
export * from "./setupOrg";
export * from "./createOrg";
export * from "./invites";
export * from "./billing";
export * from "./dataRights";
export * from "./razorpay";
export * from "./cleanup";
