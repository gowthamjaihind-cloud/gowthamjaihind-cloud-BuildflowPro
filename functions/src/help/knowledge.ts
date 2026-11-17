import { PLANS, OVERAGE_RATE } from "../plans";

/**
 * The in-app help assistant's knowledge: what Sitetru does, where things
 * are, and how billing works. Prices and limits are read from the plan
 * catalogue (plans.ts), never typed here, so the assistant cannot quote a
 * price the app does not charge. Pure: no Firestore, no clock.
 */

const inr = (n: number | null) => (n === null ? "custom" : `₹${n.toLocaleString("en-IN")}`);
const lim = (n: number | null) => (n === null ? "unlimited" : String(n));

export function knowledge(): string {
  const s = PLANS.starter;
  const b = PLANS.business;
  return `
# Sitetru: construction project management for Indian contractors

## Where things are (web app / phone app)
- Portfolio (home): all projects; "+" creates a project. Settings is the gear icon.
- Inside a project, tabs: Dashboard, Project Insights (AI cost analysis), WBS (the schedule and tasks), Daily Logs, Labour & Billing, Inventory, Procurement (purchase orders, goods receipts, vendor bills, vendor ledger), Consumption History, Cost Management, Client Estimates (estimates and client payments), Reports (progress report with PDF download), Document Vault.
- Daily Logs: pick a task, set cumulative progress %, add materials used, labour headcount by role, equipment hours, photos and a note. A second log for the same task on the same day shows a warning ("Already logged") but can still be saved.
- Document Vault: uploaded documents, plus every daily-log photo listed under "Progress Photos" (those are managed from Daily Logs).
- Purchase orders: line items with HSN/SAC code and GST rate; CGST+SGST or IGST is chosen from the vendor's GSTIN state versus your company's. Printable PO with your letterhead (Settings > Organization: logo, address, GSTIN, PAN, terms).
- Scan Invoice (Procurement > Bills): AI reads a vendor bill photo or PDF into a draft bill, matched to the vendor and an open PO; you review and post it.
- A scanned bill (in the app or sent to the Telegram bot) waits in Bills as "Pending review". It reaches Goods Receipt, inventory and the vendor's balance only when you press "Review & Post" and link it to an approved purchase order (a Draft PO must be approved first). Choosing the PO links the bill's lines to the PO's lines automatically; any line can be linked by hand in the box under it. If there is no PO for that purchase yet, create and approve one, then post the bill.
- From the Telegram bot: send the bill (photo or PDF). After reading it, the bot shows which items go against which PO line and offers "Post bill + goods receipt" (Owner, Admin, Project Manager, Project Director, Site Engineer). If no approved PO matched, it offers the vendor's open POs to choose from, or (for an Owner or Admin) "Approve PO-… and use it" for a Draft. Posting from the bot records exactly what Review & Post in the app records.
- Approving purchase orders: Owner and Admin only, in the app (open the PO, Approve Order) or in the bot: /approve lists the Drafts with Approve and PDF buttons; after creating a PO in the bot an Owner or Admin gets "Approve now". In Help > Do it for me, ask "pending approvals" or "approve PO 12".
- Deleting a bill: the bin icon in Bills (Owner, Admin, Project Manager, Project Director; whoever captured a bill can delete it while it is still pending). Deleting a posted bill also undoes its goods receipt: quantities come off inventory and the PO, and the amount comes off the vendor balance and project cost. Deleting a goods receipt that came from a bill sends that bill back to "Pending review".
- HSN and GST: Settings > Master data > Materials > "Check HSN & GST" fills missing HSN codes and corrects old GST rates (e.g. cement is 18% since 22 Sep 2025, not 28%) from Sitetru's checked list of common materials; AI suggests codes for the rest, marked for checking. Nothing changes until you tick and apply, and applying updates every project's copy of the material. Typing a new material's name fills its HSN/GST from the same list.
- Share with client: on a project's Dashboard, Owners, Admins and Project Managers make a link the client opens without signing in. Each link chooses what it shows: progress and schedule, site photos, daily work updates, payment summary, optionally number of workers. Notes, costs, rates, materials and vendor details are never shown. A link can be switched off for good; make a new one if needed.
- Settings tabs: Organization, Projects & Billing, Team (invite members, roles), Master data, Telegram Bot, Appearance, Privacy.
- Roles: Owner, Admin, Project Manager, Site Engineer and others. Owners/Admins manage billing and team; site engineers mostly log work.

## Telegram bot (@Bvprojectbot)
- Connect yourself: Settings > Telegram Bot > Connect Telegram, then tap Start in Telegram. That code connects the bot as YOU: never let someone else scan it.
- Connect a team member (Owners/Admins): Settings > Team > "Send Telegram link" under their name, then send it to them (Copy, WhatsApp or Share). They tap it and press Start, and the bot is connected as them. The link works once and does not expire; "Revoke" cancels an unused link, "New link" replaces it, and "Unlink" disconnects a member's Telegram at once. The member must first be invited and have joined the workspace.
- Commands: /log (log work with buttons), /today (today's logs), /projects (switch project), /plan (today's plan), /language, /cancel, /help, /unlink.
- Typing work in plain words also works, e.g. "Footing 45% done, 20 bags cement, 4 masons". Site shorthand is understood (MC/FC = male/female helper, "no." = numbers). The bot shows what it understood; nothing is saved until Save is pressed. One message can cover several tasks; they are shown one at a time.
- Photos sent on their own: the AI sorts them. Site photos are added to a task's log for the day (the bot asks which task, or uses the task named in the caption). Bills (photo or PDF) are read into a draft vendor bill. Other documents (drawings, permits, reports) are saved to the Document Vault.
- Typing a progress figure lower than the current one asks for confirmation first.
- The bot is in English and Tamil (/language).

## "Do it for me" (Help > Do it for me)
- Type or record a voice note asking for something to be done in the open project. It can: prepare a purchase order ("Order 100 bags of cement from ABC Traders, deliver Friday"), record a client payment ("Client paid 2 lakh by UPI today"), add a vendor or a material, log today's work, or answer a question from the project's data ("How much 12mm steel is left?", "Which orders are still pending?", "How much has the client paid?").
- Payments to vendors: say "Paid ABC Traders 1.45 lakh by UPI on 4/11, ref 4471" (bot or Do it for me; dates are day first). The preview shows the amount owed before and after; Confirm records it in the vendor's ledger exactly like Procurement > Vendors > Record payment. Owner, Admin, Project Manager, Project Director only. Money received from the client is a client payment, which is different.
- Bills read with the wrong vendor: the vendor is the seller who issued the bill; if the reader returns your own company (the "Bill to" party), it is corrected automatically.
- Rates including GST: say "325 a bag including GST" (in the bot or Do it for me) and the PO gets the rate before tax (325 / 1.18 = 275.42) with the GST shown separately; the preview shows the working. In the PO form, type the all-in figure in "Rate incl. GST" and the rate before tax is filled in.
- Steel by count: say "12mm 150 nos" (or "100 rods of 16mm"). The app converts to weight with the standard formula, bars of 12 m at d²/162 kg per metre, rounded to the nearest 10 kg (150 nos of 12mm = 1,600 kg), shows the working in the preview, and puts the count in the PO notes for the vendor. The material must be the bar of that size, stocked in kg or MT.
- On a purchase order, a material with no HSN, or an old GST rate, gets the HSN/GST from Sitetru's checked list, else an AI suggestion marked "please check"; the preview says which, and Confirm saves it to the material.
- It always shows a preview first; nothing is saved until you press Confirm (a preview expires after 30 minutes). A purchase order can also be opened with "Edit in form" to change it before creating. Orders are created as Drafts with the next PO number, GST worked out as in the form. Vendors and materials must already exist for a PO (add them first, which "Do it for me" can also do).
- Who can do what (checked on the server, before the preview and again on Confirm): purchase orders, client payments, new vendors and new materials: Owner, Admin, Project Manager, Project Director. Daily logs: those roles plus Site Engineer. Questions about stock and progress: anyone who can see the project; questions about payments and orders: the manager roles only. Everyone also needs write access to the project for changes, and nothing can be changed while a project is read-only (billing).
- The same works in the Telegram bot: type the request or send a voice note. For a purchase order the bot sends a PDF preview of the PO to open in Telegram, with Confirm and Cancel buttons; after Confirm it sends the numbered PO as a PDF. Work reports typed in the bot still go to the daily-log flow.
- Each request counts as one AI use (a work report typed here counts one more, for reading it into logs).

## Plans and prices (India, prices in rupees, per month unless yearly)
- Starter: ${inr(s.monthly)} per project per month (${inr(s.annual)} per project per year). Includes ${lim(s.includedProjects)} project; each further project is ${inr(OVERAGE_RATE)}/month. Up to ${lim(s.userLimit)} users. ${lim(s.aiScansPerProject)} AI reads per project per month.
- Business: ${inr(b.monthly)}/month or ${inr(b.annual)}/year. Includes ${lim(b.includedProjects)} projects, then ${inr(OVERAGE_RATE)} per extra project per month. Up to ${lim(b.userLimit)} users. ${lim(b.aiScansPerProject)} AI reads per project per month. Priority support.
- Enterprise: custom price; unlimited projects, users and AI. Contact sales.
- New workspaces get a 14-day free trial on Starter. When it ends, subscribe to keep using the app; nothing is deleted.
- Payment is by Razorpay subscription (UPI AutoPay, card, net banking), renewing automatically each period.

## Extra projects (beyond the plan)
- Each extra project is its own ${inr(OVERAGE_RATE)}/month subscription, bought when creating a project past the plan's limit. It is tied to that project, by name, in Settings > Projects & Billing, and can be cancelled there.
- If an extra project's subscription ends, that project becomes read-only (locked): nothing is deleted; it no longer counts toward the limit; "Subscribe again" unlocks it.
- An extra project cannot be bought while the plan still has room. After an upgrade that gives room, unneeded extra-project subscriptions are stopped automatically.

## Changing or ending a plan
- Upgrade: Settings > Manage plan; takes effect at once through checkout.
- Downgrade: scheduled for the end of the paid period. Projects beyond the smaller plan's limit (newest first) become read-only unless each gets its own ${inr(OVERAGE_RATE)} subscription.
- Cancel: the plan runs to the end of the paid period, then stops. A cancellation replaces any scheduled downgrade; to downgrade instead, resume the plan first.
- A missed renewal: the workspace becomes "past due" with a 7-day grace period (with email notices), then access is paused until payment. Data is kept.

## Billing records
- Settings > Projects & Billing: the plan and its status, what is due next and when, every project and how it is paid for, payment history with receipts (from Razorpay) and a CSV download.

## AI allowance
- AI features (typed bot logs, bill reading, insights) count against a monthly allowance that scales with the number of projects. A failed read is not counted. When it runs out, AI features pause until next month or an upgrade.

## Support
- For anything the assistant cannot answer, refunds, or account changes, email support (the "Contact us" address in the app).
`.trim();
}

export interface HelpContext {
  role?: string;
  companyName?: string;
  plan?: string;
  status?: string;
  trialEndsAt?: string;
  paidUntil?: string;
  graceEndsAt?: string;
  cancelAtPeriodEnd?: boolean;
  pendingDowngrade?: { plan: string; on: string } | null;
  includedProjects?: number | null;
  projectCount?: number;
  lockedProjects?: string[];
  extraProjectSubs?: number;
  aiUsedThisMonth?: number;
  aiAllowance?: number | null;
  telegramLinked?: boolean;
}

export interface HelpMessage {
  role: "user" | "assistant";
  text: string;
}

/** The conversation as sent by the browser, checked: the last 12 turns, each clipped. */
export function cleanHistory(raw: unknown): HelpMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string" && m.text.trim())
    .slice(-12)
    .map((m: any) => ({ role: m.role, text: String(m.text).slice(0, m.role === "user" ? 1000 : 2000) }));
}

export interface CheckLine { label: string; status: string; detail: string; fix?: string }

/** Names of the fix buttons the app shows next to a check (src/lib/diagnostics.ts). */
const FIX_BUTTONS: Record<string, string> = {
  update: "Update the app",
  reconnect: "Sign in again",
  clearCache: "Clear saved data",
  openBilling: "Open Projects & Billing",
  recheckBilling: "Re-check payment",
  openTelegram: "Open Telegram settings",
  goOnline: "(connect to the internet)",
};

export function buildHelpPrompt(context: HelpContext, history: HelpMessage[], checks: CheckLine[] = []): string {
  const diag = checks.length
    ? `\nDIAGNOSIS RESULTS (just run on this user's device and workspace):\n${checks
        .map((c) => `- [${c.status}] ${c.label}: ${c.detail}${c.fix && FIX_BUTTONS[c.fix] ? ` (button: "${FIX_BUTTONS[c.fix]}")` : ""}`)
        .join("\n")}\nWhen these are present, the user is reporting a problem: explain the most likely cause from them in plain words, and tell them which button to press, by its exact name. If every check is ok, say so, suggest the usual steps from the knowledge (fully close and reopen the app; check the internet), and offer "Send to support". Do not blame anything the checks do not show.\n`
    : "";
  const ctx = Object.entries(context)
    .filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `- ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
    .join("\n");
  const convo = history.map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.text}`).join("\n\n");
  return `You are Sitetru's in-app help assistant. You answer questions about using the Sitetru app, its Telegram bot, billing and plans, and this workspace's own plan and usage.

Rules:
- Use ONLY the knowledge and the workspace facts below. If the answer is not there, say you are not sure and suggest contacting support. Never invent features, prices, dates or steps.
- You cannot change anything: you cannot cancel, refund, upgrade, unlock or edit data. Explain where in the app the user can do it, or that support can.
- For this workspace's plan, dates and usage, use the WORKSPACE FACTS. Dates there are already in the user's timezone.
- Do not discuss other customers, internal systems, code, API keys or secrets. Politely decline anything unrelated to Sitetru.
- Answer in the language the user writes in. Be brief and practical: short steps with the exact menu names, at most about 120 words unless the user asks for more. Plain text; you may use "1." steps and **bold** for menu names.

KNOWLEDGE:
${knowledge()}

WORKSPACE FACTS (this user only):
${ctx || "- (not available)"}
${diag}
CONVERSATION:
${convo}

ASSISTANT:`;
}
