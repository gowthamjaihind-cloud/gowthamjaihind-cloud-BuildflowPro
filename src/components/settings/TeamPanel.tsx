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

const INVITABLE_ROLES = ["Admin", "Project Manager", "Site Engineer", "Stakeholder", "Viewer"];

interface MemberRow { uid: string; role: string; name?: string; email?: string; }

export const TeamPanel: React.FC = () => {
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
      setError(e?.message || "Couldn't create the invite.");
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
        <h3 className="text-xl font-bold text-ink mb-2">Team</h3>
        <p className="text-ink-muted text-sm">
          Set up your organization first (Default Organization tab) to manage team members.
        </p>
      </section>
    );
  }

  return (
    <section className="soft-card p-8 squircle-24 space-y-8">
      <div>
        <h3 className="text-xl font-bold text-ink mb-1">Team</h3>
        <p className="text-ink-muted text-sm">People who can access this organization.</p>
      </div>

      {/* Members */}
      <div className="border border-divider rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-panel text-ink-muted text-[10px] uppercase tracking-widest font-bold">
            <tr>
              <th className="p-3 text-left">Member</th>
              <th className="p-3 text-right">Role</th>
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
              <tr><td colSpan={2} className="p-4 text-center text-ink-muted text-sm">Loading members…</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Invite */}
      {canInvite ? (
        <div className="border-t border-divider pt-6">
          <div className="font-bold text-ink mb-3 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" /> Invite a teammate
          </div>
          {error && (
            <div className="mb-3 p-3 bg-[#EF4444]/8 text-[#B91C1C] rounded-xl border border-[#EF4444]/20 flex items-start gap-2 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" /> <p>{error}</p>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@email.com (optional)"
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
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create invite"}
            </button>
          </div>

          {invite && (
            <div className="mt-4 p-4 rounded-2xl border border-[#059669]/30 bg-[#059669]/10">
              <div className="flex items-center gap-2 font-bold text-ink mb-2">
                <CheckCircle weight="fill" className="w-5 h-5 text-[#059669]" /> Invite ready
              </div>
              <p className="text-sm text-ink-muted mb-3">
                {invite.emailed
                  ? <span className="text-[#047857] font-semibold">✓ Emailed the invite directly. </span>
                  : null}
                Share this link (or the code <b className="font-mono">{invite.code}</b>). It joins them
                as <b>{role}</b> and expires in 14 days.
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
                  {copied ? <><CheckCircle className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-muted border-t border-divider pt-6">
          Only an Owner or Admin can invite teammates.
        </p>
      )}
    </section>
  );
};
