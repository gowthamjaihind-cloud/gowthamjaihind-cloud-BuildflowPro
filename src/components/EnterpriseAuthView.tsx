import React, { useState, useEffect } from "react";
import { UserProfile, UserRole, Project } from "../types";
import {
  db,
  collection,
  getDocs, getDoc,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  writeBatch,
  deleteDoc,
} from "../firebase";
import { deleteField } from "firebase/firestore";
import {
  ShieldCheck,
  Users,
  Barricade as Construction,
  ArrowLeft,
  CircleNotch as Loader2,
  FloppyDisk as Save,
  Trash as Trash2,
  PencilSimple as Edit2,
  ShieldWarning as ShieldAlert,
  X,
  ChatText as MessageSquare,
  PaperPlaneTilt as Send,
  CheckCircle as CheckCircle2,
} from "@phosphor-icons/react";
import { motion } from "motion/react";
import { handleFirestoreError, OperationType } from "../firebase";
import { useL } from "../i18n";
import { toast } from "../lib/feedback";

interface EnterpriseAuthViewProps {
  onBack: () => void;
  currentUser: UserProfile;
}

export const EnterpriseAuthView: React.FC<EnterpriseAuthViewProps> = ({
  onBack,
  currentUser,
}) => {
  const L = useL();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<UserRole>("Viewer");
  
  const [editingProjectAccess, setEditingProjectAccess] = useState<
    Record<string, "read" | "write" | "none">
  >({});
  
  const [showLinkCode, setShowLinkCode] = useState<{code: string, displayCode: string, email: string} | null>(null);

  const unlinkBot = async (uid: string) => {
    try {
      await updateDoc(doc(db, "users", uid), {
        telegramChatId: deleteField(),
        telegramLinkedAt: deleteField()
      });
    } catch (err: any) {
      console.error("Error unlinking:", err);
      toast.error(L("Failed to unlink bot","போட்டை இணைப்பு நீக்க முடியவில்லை"));
    }
  };

  const generateLinkCode = async (uid: string, email: string) => {
    try {
      const q = query(
        collection(db, "bot_link_codes"),
        where("userId", "==", uid),
        where("used", "==", false)
      );
      const snap = await getDocs(q);
      const now = Date.now();
      
      let foundCode = null;

      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.expiresAt > now) {
          foundCode = docSnap.id;
        }
      });

      if (foundCode) {
        const rawCode = foundCode.replace("-", "");
        const displayCode = `${rawCode.slice(0,4)}-${rawCode.slice(4,8)}`;
        setShowLinkCode({code: rawCode, displayCode, email});
        return;
      }
      
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let randomString = "";
      for (let i = 0; i < 8; i++) {
        randomString += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const rawCode = randomString;
      const displayCode = `${rawCode.slice(0,4)}-${rawCode.slice(4,8)}`;
      
      await setDoc(doc(db, "bot_link_codes", rawCode), {
        userId: uid,
        email,
        createdAt: now,
        expiresAt: now + 15 * 60 * 1000,
        used: false
      });
      
      setShowLinkCode({code: rawCode, displayCode, email});
    } catch (e) {
      console.error(e);
    }
  };
  
  const roles: UserRole[] = [
    "Owner",
    "Admin",
    "Project Manager",
    "Site Engineer",
    "Stakeholder",
    "Viewer",
  ];

  useEffect(() => {
    if (currentUser?.role !== "Admin" && currentUser?.role !== "Owner") {
      setLoading(false);
      return;
    }

    const orgId = currentUser?.currentOrgId;
    if (!orgId) {
      // No org context — show nothing rather than leaking every org's users.
      setUsers([]);
      setProjects([]);
      setLoading(false);
      return;
    }

    // Members of THIS org only. We read the org's members map (realtime) and
    // fetch each member's profile by id. Per-id reads keep us within the
    // locked-down users rule (self-or-same-org) — no global users query.
    const unsubscribeUsers = onSnapshot(
      doc(db, "organizations", orgId),
      async (orgSnap) => {
        const members: Record<string, any> = (orgSnap.data()?.members) || {};
        const uids = Object.keys(members);
        const profiles = await Promise.all(
          uids.map(async (uid) => {
            try {
              const s = await getDoc(doc(db, "users", uid));
              return s.exists() ? ({ uid, ...s.data() } as UserProfile) : null;
            } catch {
              return null;
            }
          }),
        );
        const valid = profiles.filter((u): u is UserProfile => {
          if (!u || !u.email || typeof u.email !== "string" || u.email.trim() === "") return false;
          const lowerEmail = u.email.toLowerCase().trim();
          if (lowerEmail.includes("anonymous")) return false;
          if (lowerEmail.includes("telegram-bot") || lowerEmail.includes("telegrambot")) return false;
          if (lowerEmail.endsWith("@system") || lowerEmail.includes("bot@")) return false;
          if (!lowerEmail.includes("@")) return false;
          return true;
        });
        setUsers(valid);
        setLoading(false);
      },
      (err: any) => {
        console.error("Error listening to org members:", err);
        setLoading(false);
      }
    );

    // Also fetch this org's projects (for per-project access assignment).
    const unsubscribeProjects = onSnapshot(
      collection(db, `organizations/${orgId}/projects`),
      (snap) => {
        setProjects(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Project),
        );
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "projects");
      },
    );

    return () => {
      unsubscribeUsers();
      unsubscribeProjects();
    };
  }, [currentUser?.role, currentUser?.currentOrgId]);

  const handleUpdateRole = async (userId: string) => {
    if (currentUser.role !== "Admin" && currentUser.role !== "Owner") {
      return;
    }

    try {
      await updateDoc(doc(db, "users", userId), {
        role: editingRole,
        projectAccess: editingProjectAccess,
              });
      setUsers(
        users.map((u) =>
          u.uid === userId
            ? {
                ...u,
                role: editingRole,
                projectAccess: editingProjectAccess,
                              }
            : u,
        ),
      );
      setEditingUserId(null);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
    }
  };


  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {currentUser.role !== "Admin" && currentUser.role !== "Owner" && (
        <div className="bg-danger/8 border border-danger/30 p-6 rounded-3xl flex items-start gap-4">
          <ShieldAlert className="w-8 h-8 text-danger mt-1" />
          <div>
            <h3 className="text-lg font-bold text-[#7F1D1D]">
              {L("Restricted Access","கட்டுப்படுத்தப்பட்ட அணுகல்")}
            </h3>
            <p className="text-danger font-medium">
              {L("You must be an Enterprise Admin or Owner to modify roles. You are currently viewing in read-only mode.","பங்குகளை மாற்ற நீங்கள் Enterprise நிர்வாகி அல்லது உரிமையாளராக இருக்க வேண்டும். நீங்கள் தற்போது படிக்க-மட்டும் பயன்முறையில் பார்க்கிறீர்கள்.")}
            </p>
          </div>
        </div>
      )}
      <div className="bg-surface rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.03)] border border-divider overflow-hidden">
        <div className="p-8 border-b border-divider flex items-center justify-between bg-panel/50">
          <h2 className="text-xl font-bold flex items-center gap-3">
            <Users className="w-6 h-6 text-primary" /> {L("Identity & Authorization","அடையாளம் & அங்கீகாரம்")}
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-divider text-ink-muted text-[10px] uppercase tracking-widest font-black">
                <th className="px-8 py-6">{L("User Email / Identity","பயனர் மின்னஞ்சல் / அடையாளம்")}</th>
                <th className="px-8 py-6">{L("Platform Role","இயங்குதள பங்கு")}</th>
                <th className="px-8 py-6">{L("Projects Access","செயல்திட்ட அணுகல்")}</th>
                <th className="px-8 py-6 text-right">{L("Actions","செயல்கள்")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider/60">
              {users.map((u) => (
                <tr key={u.uid} className="hover:bg-panel/50 transition-colors">
                  <td className="px-8 py-6">
                    <div className="font-bold text-ink text-sm">{u.email}</div>
                    <div className="mt-2 flex items-center gap-2">
                      {u.telegramChatId ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-success bg-success/10 px-2.5 py-1 rounded-md border border-success/20 flex items-center gap-1 font-bold text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5" /> {L("Telegram Linked","டெலிகிராம் இணைக்கப்பட்டது")}
                          </span>
                          <button
                            onClick={() => unlinkBot(u.uid)}
                            disabled={currentUser.role !== "Admin" && currentUser.role !== "Owner"}
                            className="text-xs font-semibold text-danger hover:text-danger bg-danger/8 hover:bg-danger/15 px-2 py-1 rounded-md transition-colors disabled:opacity-50"
                            title={L("Unlink Telegram Bot","டெலிகிராம் போட்டை இணைப்பு நீக்கு")}
                          >
                            {L("Unlink","இணைப்பு நீக்கு")}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-ink-muted bg-panel px-2.5 py-1 rounded-md border border-divider text-xs font-bold">
                            {L("Telegram Not Linked","டெலிகிராம் இணைக்கப்படவில்லை")}
                          </span>
                          <button
                            onClick={() => generateLinkCode(u.uid, u.email)}
                            disabled={currentUser.role !== "Admin" && currentUser.role !== "Owner"}
                            className="text-xs font-bold text-primary hover:bg-primary/10 px-2 py-1 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
                            title={L("Generate Telegram Link Code","டெலிகிராம் இணைப்புக் குறியீட்டை உருவாக்கு")}
                          >
                            <Send className="w-3.5 h-3.5" /> {L("Link Bot","போட்டை இணை")}
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    {editingUserId === u.uid ? (
                      <select
                        className="bg-surface border border-divider text-sm font-bold rounded-lg px-3 py-2 w-40 outline-none focus:border-primary"
                        value={editingRole}
                        onChange={(e) => setEditingRole(e.target.value as UserRole)}
                      >
                        {roles.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex items-center gap-2 text-sm font-bold">
                        {u.role === "Owner" ? (
                          <span className="text-[#324755] bg-[#324755]/10 px-3 py-1.5 rounded-lg border border-[#324755]/20 flex items-center gap-1.5 w-fit">
                            <ShieldCheck className="w-4 h-4" /> {L("Owner","உரிமையாளர்")}
                          </span>
                        ) : u.role === "Admin" ? (
                          <span className="text-primary bg-primary/10 px-3 py-1.5 rounded-lg border border-primary/20 flex items-center gap-1.5 w-fit">
                            <ShieldCheck className="w-4 h-4" /> {L("Admin","நிர்வாகி")}
                          </span>
                        ) : u.role === "Project Manager" ? (
                          <span className="text-[#56778E] bg-[#56778E]/10 px-3 py-1.5 rounded-lg border border-[#56778E]/20 flex items-center gap-1.5 w-fit">
                            <Users className="w-4 h-4" /> {L("Manager","மேலாளர்")}
                          </span>
                        ) : u.role === "Site Engineer" ? (
                          <span className="text-success bg-success/10 px-3 py-1.5 rounded-lg border border-success/20 flex items-center gap-1.5 w-fit">
                            <Construction className="w-4 h-4" /> {L("Engineer","பொறியாளர்")}
                          </span>
                        ) : (
                          <span className="text-ink-muted bg-panel px-3 py-1.5 rounded-lg border border-divider w-fit">
                            {u.role || L("Viewer","பார்வையாளர்")}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex flex-col gap-2 text-[13px] text-ink-muted font-medium">
                      {editingUserId === u.uid && editingRole !== "Admin" && editingRole !== "Owner" ? (
                        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                          {projects.map((p) => (
                            <div
                              key={p.id}
                              className="flex items-center justify-between gap-4"
                            >
                              <span className="truncate max-w-[120px] text-ink">
                                {p.name}
                              </span>
                              <select
                                className="bg-surface border text-xs font-bold border-divider text-ink rounded-lg px-2 py-1 outline-none"
                                value={editingProjectAccess[p.id] || "none"}
                                onChange={(e) =>
                                  setEditingProjectAccess({
                                    ...editingProjectAccess,
                                    [p.id]: e.target.value as
                                      | "read"
                                      | "write"
                                      | "none",
                                  })
                                }
                              >
                                <option value="none">{L("None","எதுவுமில்லை")}</option>
                                <option value="read">{L("Read Only","படிக்க மட்டும்")}</option>
                                <option value="write">{L("Read / Write","படிக்க / எழுத")}</option>
                              </select>
                            </div>
                          ))}
                        </div>
                      ) : u.role === "Admin" || u.role === "Owner" ? (
                        <span className="text-success font-bold">
                          {L("Universal Access","உலகளாவிய அணுகல்")}
                        </span>
                      ) : (
                        <div className="space-y-1">
                          {projects.filter(
                            (p) =>
                              u.projectAccess &&
                              u.projectAccess[p.id] &&
                              u.projectAccess[p.id] !== "none",
                          ).length > 0 ? (
                            projects
                              .filter(
                                (p) =>
                                  u.projectAccess &&
                                  u.projectAccess[p.id] &&
                                  u.projectAccess[p.id] !== "none",
                              )
                              .map((p) => (
                                <div
                                  key={p.id}
                                  className="flex justify-between w-48"
                                >
                                  <span className="truncate">{p.name}</span>
                                  <span
                                    className={`font-bold ${u.projectAccess![p.id] === "write" ? "text-primary" : "text-ink-muted"}`}
                                  >
                                    {u.projectAccess![p.id] === "write"
                                      ? L("R/W","ப/எ")
                                      : L("Read","படி")}
                                  </span>
                                </div>
                              ))
                          ) : (
                            <span>{L("Global Role Applied","பொது பங்கு பயன்படுத்தப்பட்டது")}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right">
                    {editingUserId === u.uid ? (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleUpdateRole(u.uid)}
                          className="p-2 bg-success text-white rounded-xl hover:bg-success transition-colors"
                          title={L("Save Role","பங்கைச் சேமி")}
                        >
                          <Save className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingUserId(null)}
                          className="p-2 bg-divider text-ink rounded-xl hover:bg-fossil transition-colors"
                          title={L("Cancel","ரத்து")}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingUserId(u.uid);
                          setEditingRole(u.role);
                          const accessMap: Record<
                            string,
                            "read" | "write" | "none"
                          > = {};
                          projects.forEach((p) => {
                            accessMap[p.id] = u.projectAccess?.[p.id] || "none";
                          });
                          setEditingProjectAccess(accessMap);
                                                  }}
                        disabled={currentUser.role !== "Admin" && currentUser.role !== "Owner"}
                        className="p-2 text-primary hover:bg-primary/10 rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={L("Edit Role","பங்கைத் திருத்து")}
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      

      {showLinkCode && (
        <div className="fixed inset-0 bg-onyx/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-md rounded-3xl p-8 border border-divider shadow-2xl relative">
            <button
              onClick={() => setShowLinkCode(null)}
              className="absolute right-6 top-6 p-2 bg-panel rounded-full hover:bg-divider transition-colors"
            >
              <X className="w-5 h-5 text-ink-muted" />
            </button>
            <h2 className="text-2xl font-black text-ink mb-2">{L("Telegram Link Code","டெலிகிராம் இணைப்புக் குறியீடு")}</h2>
            <p className="text-ink-muted font-medium mb-6">
              {L("Link code for","இணைப்புக் குறியீடு")} <b>{showLinkCode.email}</b>
            </p>
            <div className="bg-panel rounded-2xl p-6 mb-6 text-center border border-divider">
              <p className="text-sm font-bold text-ink-muted mb-3 uppercase tracking-wider">{L("Ask them to send:","அவர்களை அனுப்பச் சொல்லுங்கள்:")}</p>
              <code className="text-3xl font-black text-primary bg-primary/10 px-4 py-2 rounded-xl">
                /link {showLinkCode.displayCode}
              </code>
            </div>
            <p className="text-center text-sm font-medium text-[#C0653F] bg-primary/10 py-3 rounded-xl">
              {L("Expires in 15 minutes.","15 நிமிடங்களில் காலாவதியாகும்.")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
