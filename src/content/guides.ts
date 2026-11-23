/**
 * The module-by-module video guides, in the order a new user meets them.
 *
 * Each guide is recorded from the real app (sample data) by
 * marketing/walkthrough/record.mjs from marketing/films/guides/<id>.script.mjs,
 * then encoded for the web into public/media/guides/<id>.mp4 with a poster
 * <id>.jpg beside it. guides.test.ts checks every entry has its script, its
 * video and its poster, so the list on the site can never point at a missing
 * file. `seconds` is the measured length of the encoded video.
 */
export interface Guide {
  id: string;
  title: string;
  description: string;
  seconds: number;
}

/**
 * Off until every guide is recorded and published (publish.mjs). While false,
 * the landing section, its nav link and the Help tab are not shown, so a
 * half-finished set never reaches sitetru.com.
 */
export const GUIDES_READY = true;

export const GUIDES: Guide[] = [
  { id: "getting-started", title: "Getting started", description: "Find your way round: projects, the menu, and switching jobs.", seconds: 44 },
  { id: "dashboard", title: "Dashboard", description: "How the job is doing today: progress, budget, the schedule, and sharing with your client.", seconds: 53 },
  { id: "wbs", title: "WBS: planning the work", description: "Break the job into phases and tasks, with dates and budgets, and log work against them.", seconds: 43 },
  { id: "daily-logs", title: "Daily Logs and the Telegram bot", description: "Record each day's progress, labour and material, from the app or from Telegram.", seconds: 40 },
  { id: "labour", title: "Labour & Billing", description: "Rates for each labour role and contractor, and running account bills.", seconds: 39 },
  { id: "inventory", title: "Inventory and the stock card", description: "Stock on site, reconciliation, and each material's history.", seconds: 37 },
  { id: "procurement", title: "Procurement", description: "Purchase orders with GST, goods receipts, bill scanning and vendor accounts.", seconds: 57 },
  { id: "consumption", title: "Consumption History", description: "Every material and labour entry used on the job, searchable and exportable.", seconds: 34 },
  { id: "cost", title: "Cost Management", description: "Budget against actual for every task, direct costs, and the project cash book.", seconds: 52 },
  { id: "insights", title: "Project Insights", description: "Analytics on cost, labour and progress, with a plain-language digest.", seconds: 35 },
  { id: "estimates", title: "Client Estimates", description: "Estimates for your client, with margin and GST.", seconds: 30 },
  { id: "reports", title: "Progress Reports", description: "Daily, weekly and monthly progress reports, ready to send.", seconds: 30 },
  { id: "vault", title: "Document Vault", description: "Drawings, approvals and bills, kept with the project.", seconds: 29 },
];

export const guideVideo = (id: string) => `/media/guides/${id}.mp4`;
export const guidePoster = (id: string) => `/media/guides/${id}.jpg`;

/** "0:48" */
export const fmtLength = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
