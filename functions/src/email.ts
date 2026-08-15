import { db } from "./db";

// Public app URL used to build invite links in server-sent emails.
export const APP_URL = "https://jewel-ledger.web.app";

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
