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
  { id: "labour", title: "Labour & Billing", description: "Rates for each labour role and contractor, and running account bills.", seconds: 72 },
  { id: "inventory", title: "Inventory and the stock card", description: "Stock on site, reconciliation, and each material's history.", seconds: 37 },
  { id: "procurement", title: "Procurement", description: "Purchase orders with GST, goods receipts, bill scanning and vendor accounts.", seconds: 57 },
  { id: "consumption", title: "Consumption History", description: "Every material and labour entry used on the job, searchable and exportable.", seconds: 34 },
  { id: "cost", title: "Cost Management", description: "Budget against actual for every task, direct costs, and the project cash book.", seconds: 55 },
  { id: "insights", title: "Project Insights", description: "Analytics on cost, labour and progress, with a plain-language digest.", seconds: 35 },
  { id: "estimates", title: "Client Estimates", description: "Estimates for your client, with margin and GST.", seconds: 30 },
  { id: "reports", title: "Progress Reports", description: "Daily, weekly and monthly progress reports, ready to send.", seconds: 30 },
  { id: "vault", title: "Document Vault", description: "Drawings, approvals and bills, kept with the project.", seconds: 29 },
];

/** Heights the guides are encoded at (marketing/films/guides/publish.mjs). */
export type Rendition = 480 | 720 | 1080;
export const RENDITIONS: Rendition[] = [480, 720, 1080];

export const guideVideo = (id: string, r: Rendition = 720) => `/media/guides/${id}-${r}.mp4`;
/** JPEG poster, 1280 wide: the <video> poster and the fallback without WebP. */
export const guidePoster = (id: string) => `/media/guides/${id}.jpg`;
export const guidePosterWebp = (id: string, w: 640 | 1280) => `/media/guides/${id}-${w}.webp`;
export const guideCaptions = (id: string) => `/media/guides/${id}.vtt`;

export interface Viewing {
  /** CSS width of the player, in px. */
  width: number;
  devicePixelRatio: number;
  /** The screen's long side in CSS px (what full screen fills). */
  screenWidth: number;
  fullscreen: boolean;
  /** navigator.connection: Data Saver on, and the measured connection type. */
  saveData?: boolean;
  effectiveType?: string;
}

/**
 * Which encode to play. Phones get 480p (about half the 720p file, and a
 * phone shows the player under 600 px wide); tablets and the desktop page get
 * 720p; going full screen on a laptop or monitor steps up to 1080p so the
 * app's small text stays sharp. Data Saver or a 2G/3G connection always gets
 * 480p: on a site with one bar, a video that plays beats one that is sharp.
 */
export function guideRendition(v: Viewing): Rendition {
  if (v.saveData || /^(slow-2g|2g|3g)$/.test(v.effectiveType ?? "")) return 480;
  // A phone's screen is under 1,200 CSS px even on its side: 720p fills it.
  if (v.fullscreen) return v.screenWidth >= 1200 && v.screenWidth * Math.min(v.devicePixelRatio, 2) >= 1600 ? 1080 : 720;
  return v.width < 600 ? 480 : 720;
}

/** "0:48" */
export const fmtLength = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
