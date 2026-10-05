import { db } from "./db";

// Public app URL used to build invite links in server-sent emails.
// Points at the branded custom domain; the app also stays reachable at
// jewel-ledger.web.app (Firebase Hosting serves both).
export const APP_URL = "https://sitetru.com";

interface EmailConfig { apiKey: string; fromEmail: string; fromName: string; }

// Email config (Resend API key + from address) is stored in a single
// Admin-only Firestore doc so the operator can set it from the UI without a
// redeploy. Clients can't read it (rules deny; Cloud Functions use Admin SDK).
export async function getEmailConfig(): Promise<EmailConfig | null> {
  const snap = await db.doc("app_config/email").get();
  const d: any = snap.exists ? snap.data() : null;
  if (!d?.apiKey || !d?.fromEmail) return null;
  return { apiKey: d.apiKey, fromEmail: d.fromEmail, fromName: d.fromName || "Sitetru" };
}

// Sends an invite email via Resend. No-ops (sent:false) when there's no
// recipient or email isn't configured yet, so callers degrade to the
// copy-the-link flow instead of failing.
export async function sendInviteEmail(opts: {
  to?: string | null; orgName: string; role: string; link: string; inviterName?: string;
}): Promise<{ sent: boolean; error?: string }> {
  if (!opts.to) return { sent: false, error: "no recipient email" };
  const cfg = await getEmailConfig();
  if (!cfg) return { sent: false, error: "email not configured" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${cfg.fromName} <${cfg.fromEmail}>`,
        to: [opts.to],
        subject: `You're invited to join ${opts.orgName}`,
        html: inviteHtml(opts),
      }),
    });
    if (!res.ok) {
      const b = await res.text().catch(() => "");
      return { sent: false, error: `resend ${res.status}: ${b.slice(0, 180)}` };
    }
    return { sent: true };
  } catch (e: any) {
    return { sent: false, error: String(e) };
  }
}

// Welcome email sent when a user creates their own organization (self-serve).
// No-ops when there's no recipient or email isn't configured yet.
export async function sendWelcomeEmail(opts: {
  to?: string | null; name?: string; companyName: string; link: string;
}): Promise<{ sent: boolean; error?: string }> {
  if (!opts.to) return { sent: false, error: "no recipient email" };
  const cfg = await getEmailConfig();
  if (!cfg) return { sent: false, error: "email not configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${cfg.fromName} <${cfg.fromEmail}>`,
        to: [opts.to],
        subject: `Welcome to Sitetru — ${opts.companyName} is ready`,
        html: welcomeHtml(opts),
      }),
    });
    if (!res.ok) {
      const b = await res.text().catch(() => "");
      return { sent: false, error: `resend ${res.status}: ${b.slice(0, 180)}` };
    }
    return { sent: true };
  } catch (e: any) {
    return { sent: false, error: String(e) };
  }
}

/**
 * Renewal notice, sent before a paid period ends and again once it has lapsed.
 *
 * Best-effort like the others: no recipient or no Resend key means sent:false
 * and the caller carries on. A notice that fails to send must never stop the
 * lifecycle job, but it also must not be mistaken for one that went out -- the
 * caller only records the notice when this returns sent:true.
 */
export async function sendRenewalEmail(opts: {
  to?: string | null;
  companyName: string;
  link: string;
  /** Days until the period ends; 0 or less once it has already lapsed. */
  daysLeft: number;
  /** Days of access left in grace, when the period has already lapsed. */
  graceDaysLeft?: number;
  amount?: string;
}): Promise<{ sent: boolean; error?: string }> {
  if (!opts.to) return { sent: false, error: "no recipient email" };
  const cfg = await getEmailConfig();
  if (!cfg) return { sent: false, error: "email not configured" };

  const lapsed = opts.daysLeft <= 0;
  const subject = lapsed
    ? `Action needed — ${opts.companyName}'s Sitetru plan has lapsed`
    : opts.daysLeft === 1
      ? `${opts.companyName}'s Sitetru plan renews tomorrow`
      : `${opts.companyName}'s Sitetru plan renews in ${opts.daysLeft} days`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${cfg.fromName} <${cfg.fromEmail}>`,
        to: [opts.to],
        subject,
        html: renewalHtml({ ...opts, lapsed }),
      }),
    });
    if (!res.ok) {
      const b = await res.text().catch(() => "");
      return { sent: false, error: `resend ${res.status}: ${b.slice(0, 180)}` };
    }
    return { sent: true };
  } catch (e: any) {
    return { sent: false, error: String(e) };
  }
}

/**
 * Project-slot notice: the window is closing, or has closed.
 *
 * Sent because slots expiring silently is worse than slots not expiring. The
 * copy leads with what has NOT happened -- nothing deleted, nothing hidden --
 * because that is the first thing a contractor will want to know.
 */
export async function sendSlotNoticeEmail(opts: {
  to?: string | null;
  companyName: string;
  link: string;
  slots: number;
  kind: "expiring" | "lapsed";
  daysLeft?: number;
}): Promise<{ sent: boolean; error?: string }> {
  if (!opts.to) return { sent: false, error: "no recipient email" };
  const cfg = await getEmailConfig();
  if (!cfg) return { sent: false, error: "email not configured" };

  const n = opts.slots;
  const plural = n === 1 ? "project slot" : "project slots";
  const subject =
    opts.kind === "lapsed"
      ? `${opts.companyName}: your ${n} extra ${plural} have ended`
      : `${opts.companyName}: ${n} extra ${plural} renew in ${opts.daysLeft ?? SLOT_NOTICE_WARN_DAYS} days`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${cfg.fromName} <${cfg.fromEmail}>`,
        to: [opts.to],
        subject,
        html: slotNoticeHtml(opts),
      }),
    });
    if (!res.ok) {
      const b = await res.text().catch(() => "");
      return { sent: false, error: `resend ${res.status}: ${b.slice(0, 180)}` };
    }
    return { sent: true };
  } catch (e: any) {
    return { sent: false, error: String(e) };
  }
}

/** Only used for the email's default wording; the real value lives in subscription.ts. */
const SLOT_NOTICE_WARN_DAYS = 3;

function slotNoticeHtml(o: {
  companyName: string;
  link: string;
  slots: number;
  kind: "expiring" | "lapsed";
  daysLeft?: number;
}): string {
  const n = o.slots;
  const plural = n === 1 ? "slot" : "slots";
  const headline = o.kind === "lapsed" ? `Your extra project ${plural} have ended` : `Your extra project ${plural} renew soon`;
  const body =
    o.kind === "lapsed"
      ? `The ${n} extra project ${plural} on <b>${escapeHtml(o.companyName)}</b> have reached the end of their month.
         <b>Nothing has been deleted and nothing is hidden</b> — every project, log and photo is exactly where it was.
         You just can't add a new project beyond your plan's limit until you top up again.`
      : `The ${n} extra project ${plural} on <b>${escapeHtml(o.companyName)}</b> reach the end of their month in
         ${o.daysLeft ?? SLOT_NOTICE_WARN_DAYS} days. Top up to keep the headroom — nothing is deleted either way,
         you simply won't be able to add a new project past your plan's limit.`;
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border:1px solid #e6e8eb;border-radius:20px;padding:32px;">
      <div style="font-size:12px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#8a94a6;">Sitetru</div>
      <h1 style="font-size:22px;color:#1f2937;margin:12px 0 8px;">${headline}</h1>
      <p style="font-size:15px;color:#4b5563;line-height:1.6;margin:0 0 20px;">${body}</p>
      <a href="${o.link}" style="display:inline-block;background:#D97D54;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:12px;">Open Sitetru</a>
      <p style="font-size:12px;color:#8a94a6;margin:24px 0 0;line-height:1.6;">
        Extra projects are ₹99 each per month. Reply to this email if you'd rather we sorted it out with you directly.
      </p>
    </div>
    <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:16px;">Truth, reported from site.</p>
  </div></body></html>`;
}

function renewalHtml(o: {
  companyName: string;
  link: string;
  daysLeft: number;
  graceDaysLeft?: number;
  amount?: string;
  lapsed: boolean;
}): string {
  const grace = o.graceDaysLeft ?? 0;
  const headline = o.lapsed
    ? "Your plan has lapsed"
    : o.daysLeft === 1
      ? "Your plan renews tomorrow"
      : `Your plan renews in ${o.daysLeft} days`;
  const body = o.lapsed
    ? `<b>${escapeHtml(o.companyName)}</b>'s paid period has ended. Everything still works for the next
       ${grace} day${grace === 1 ? "" : "s"} — your projects, logs and photos are untouched. Renew before then
       and nothing changes.`
    : `<b>${escapeHtml(o.companyName)}</b>'s plan${o.amount ? ` (${escapeHtml(o.amount)})` : ""} is due for renewal.
       Renew from Settings and your team carries on without a break.`;
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border:1px solid #e6e8eb;border-radius:20px;padding:32px;">
      <div style="font-size:12px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#8a94a6;">Sitetru</div>
      <h1 style="font-size:22px;color:#1f2937;margin:12px 0 8px;">${headline}</h1>
      <p style="font-size:15px;color:#4b5563;line-height:1.6;margin:0 0 20px;">${body}</p>
      <a href="${o.link}" style="display:inline-block;background:#D97D54;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:12px;">Renew now</a>
      <p style="font-size:12px;color:#8a94a6;margin:24px 0 0;line-height:1.6;">
        Nothing is ever deleted when a plan lapses. Reply to this email if you'd rather sort it out with us directly.
      </p>
    </div>
    <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:16px;">Truth, reported from site.</p>
  </div></body></html>`;
}

function welcomeHtml(o: { name?: string; companyName: string; link: string }): string {
  const hi = o.name ? `Hi ${escapeHtml(o.name)},` : "Hi,";
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border:1px solid #e6e8eb;border-radius:20px;padding:32px;">
      <div style="font-size:12px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#8a94a6;">Sitetru</div>
      <h1 style="font-size:22px;color:#1f2937;margin:12px 0 8px;">${hi} welcome to Sitetru</h1>
      <p style="font-size:15px;color:#4b5563;line-height:1.6;margin:0 0 20px;">
        Your workspace <b>${escapeHtml(o.companyName)}</b> is ready. Create your first project, invite your team, and start logging from site over Telegram.
      </p>
      <a href="${o.link}" style="display:inline-block;background:#D97D54;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:12px;">Open Sitetru</a>
      <p style="font-size:12px;color:#8a94a6;margin:24px 0 0;line-height:1.6;">
        Need a hand getting set up? Just reply to this email.
      </p>
    </div>
    <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:16px;">Truth, reported from site.</p>
  </div></body></html>`;
}

function inviteHtml(o: { orgName: string; role: string; link: string; inviterName?: string }): string {
  const who = o.inviterName ? `${o.inviterName} has invited you` : "You've been invited";
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border:1px solid #e6e8eb;border-radius:20px;padding:32px;">
      <div style="font-size:12px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#8a94a6;">Sitetru</div>
      <h1 style="font-size:22px;color:#1f2937;margin:12px 0 8px;">${who} to join <span style="color:#B85F3B;">${escapeHtml(o.orgName)}</span></h1>
      <p style="font-size:15px;color:#4b5563;line-height:1.6;margin:0 0 24px;">
        You've been added as <b>${escapeHtml(o.role)}</b>. Tap the button below, sign in, and you'll join the organization automatically.
      </p>
      <a href="${o.link}" style="display:inline-block;background:#D97D54;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:12px;">Accept invitation</a>
      <p style="font-size:12px;color:#8a94a6;margin:24px 0 0;line-height:1.6;">
        Or paste this link into your browser:<br><span style="color:#6b7280;word-break:break-all;">${o.link}</span>
      </p>
    </div>
    <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:16px;">This invitation link expires in 14 days.</p>
  </div></body></html>`;
}

function escapeHtml(s: string): string {
  return String(s || "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}
