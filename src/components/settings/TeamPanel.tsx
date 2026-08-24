import React, { useEffect, useState } from "react";
import {
  UserPlus,
  Copy,
  CheckCircle,
  CircleNotch as Loader2,
  WarningCircle as AlertCircle,
} from "@phosphor-icons/react";
import { db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { useOrgSettings } from "../../hooks/useOrgSettings";
import { useAuthStore } from "../../store";
import { callCreateInvite } from "../../services/firebaseFunctions";
import { useL } from "../../i18n";

const INVITABLE_ROLES = ["Admin", "Project Manager", "Site Engineer", "Stakeholder", "Viewer"];

interface MemberRow { uid: string; role: string; name?: string; email?: string; }

export const TeamPanel: React.FC = () => {
  const L = useL();
  const user = useAuthStore((s) => s.user);
  const { members, isClaimed } = useOrgSettings();
  const canInvite = !!(user && members && ["Owner", "Admin"].includes(members[user.uid]));

  const [rows, setRows] = useState<MemberRow[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Site Engineer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ code: string; link: string; emailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  // Resolve member uids -> names/emails for display.
  useEffect(() => {
    if (!members) return;
    let cancelled = false;
    (async () => {
      const entries = Object.entries(members);
      const resolved = await Promise.all(
        entries.map(async ([uid, r]) => {
          try {
            const snap = await getDoc(doc(db, "users", uid));
            const d: any = snap.exists() ? snap.data() : {};
            return { uid, role: String(r), name: d.displayName, email: d.email };
          } catch {
            return { uid, role: String(r) };
          }
        }),
      );
      if (!cancelled) setRows(resolved);
    })();
    return () => { cancelled = true; };
  }, [members]);

  const sendInvite = async () => {
    setBusy(true);
    setError(null);
    setInvite(null);
    setCopied(false);
    try {
      const res = await callCreateInvite({ email: email.trim() || undefined, role });
      const link = `${window.location.origin}/?invite=${res.code}`;
      setInvite({ code: res.code, link, emailed: res.emailed });
      setEmail("");
    } catch (e: any) {
      setError(e?.message || L("Couldn't create the invite.","அழைப்பை உருவாக்க முடியவில்லை."));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard may be blocked; the link is shown to copy manually */ }
  };

  if (!isClaimed) {
    return (
      <section className="soft-card p-8 squircle-24">
        <h3 className="text-xl font-bold text-ink mb-2">{L("Team","அணி")}</h3>
        <p className="text-ink-muted text-sm">
          {L("Set up your organization first (Default Organization tab) to manage team members.","அணி உறுப்பினர்களை நிர்வகிக்க முதலில் உங்கள் நிறுவனத்தை அமைக்கவும் (இயல்புநிலை நிறுவனம் தாவல்).")}
        </p>
      </section>
    );
  }

  return (
    <section className="soft-card p-8 squircle-24 space-y-8">
      <div>
        <h3 className="text-xl font-bold text-ink mb-1">{L("Team","அணி")}</h3>
        <p className="text-ink-muted text-sm">{L("People who can access this organization.","இந்த நிறுவனத்தை அணுகக்கூடிய நபர்கள்.")}</p>
      </div>

      {/* Members */}
      <div className="border border-divider rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-panel text-ink-muted text-[10px] uppercase tracking-widest font-bold">
            <tr>
              <th className="p-3 text-left">{L("Member","உறுப்பினர்")}</th>
              <th className="p-3 text-right">{L("Role","பங்கு")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.uid} className="border-t border-divider/50">
                <td className="p-3">
                  <div className="font-semibold text-ink">{m.name || m.email || m.uid}</div>
                  {m.email && m.name && <div className="text-xs text-ink-muted">{m.email}</div>}
                </td>
                <td className="p-3 text-right">
                  <span className="px-2.5 py-1 rounded-full bg-panel text-ink-muted text-xs font-bold">{m.role}</span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={2} className="p-4 text-center text-ink-muted text-sm">{L("Loading members…","உறுப்பினர்கள் ஏற்றுகிறது…")}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Invite */}
      {canInvite ? (
        <div className="border-t border-divider pt-6">
          <div className="font-bold text-ink mb-3 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" /> {L("Invite a teammate","ஒரு அணி உறுப்பினரை அழைக்கவும்")}
          </div>
          {error && (
            <div className="mb-3 p-3 bg-danger/8 text-danger rounded-xl border border-danger/20 flex items-start gap-2 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" /> <p>{error}</p>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={L("teammate@email.com (optional)","teammate@email.com (விருப்பம்)")}
              className="flex-1 bg-panel border border-divider px-4 py-3 rounded-xl text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="bg-panel border border-divider px-4 py-3 rounded-xl text-ink text-sm font-semibold"
            >
              {INVITABLE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button
              onClick={sendInvite}
              disabled={busy}
              className="px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-[#B85F3B] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : L("Create invite","அழைப்பை உருவாக்கு")}
            </button>
          </div>

          {invite && (
            <div className="mt-4 p-4 rounded-2xl border border-success/30 bg-success/10">
              <div className="flex items-center gap-2 font-bold text-ink mb-2">
                <CheckCircle weight="fill" className="w-5 h-5 text-success" /> {L("Invite ready","அழைப்பு தயார்")}
              </div>
              <p className="text-sm text-ink-muted mb-3">
                {invite.emailed
                  ? <span className="text-success font-semibold">{L("✓ Emailed the invite directly. ","✓ அழைப்பு நேரடியாக மின்னஞ்சல் செய்யப்பட்டது. ")}</span>
                  : null}
                {L("Share this link (or the code","இந்த லிங்கைப் பகிரவும் (அல்லது குறியீடு")} <b className="font-mono">{invite.code}</b>{L("). It joins them as","). இது அவர்களை")} <b>{role}</b> {L("and expires in 14 days.","ஆகச் சேர்க்கும், 14 நாட்களில் காலாவதியாகும்.")}
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={invite.link}
                  className="flex-1 bg-surface border border-divider px-3 py-2 rounded-lg text-xs font-mono text-ink truncate"
                />
                <button
                  onClick={copy}
                  className="px-4 py-2 bg-onyx text-white rounded-lg text-sm font-bold flex items-center gap-1.5 shrink-0"
                >
                  {copied ? <><CheckCircle className="w-4 h-4" /> {L("Copied","நகலெடுக்கப்பட்டது")}</> : <><Copy className="w-4 h-4" /> {L("Copy","நகலெடு")}</>}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-muted border-t border-divider pt-6">
          {L("Only an Owner or Admin can invite teammates.","உரிமையாளர் அல்லது நிர்வாகி மட்டுமே அணி உறுப்பினர்களை அழைக்க முடியும்.")}
        </p>
      )}
    </section>
  );
};
