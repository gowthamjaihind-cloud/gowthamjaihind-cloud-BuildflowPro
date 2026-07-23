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
  Construction,
  ArrowLeft,
  Loader2,
  Save,
  Trash2,
  Edit2,
  ShieldAlert,
  X,
  MessageSquare,
  Send,
  CheckCircle2,
} from "lucide-react";
import { motion } from "motion/react";
import { handleFirestoreError, OperationType } from "../firebase";

interface EnterpriseAuthViewProps {
  onBack: () => void;
  currentUser: UserProfile;
}

export const EnterpriseAuthView: React.FC<EnterpriseAuthViewProps> = ({
  onBack,
  currentUser,
}) => {
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
      alert("Failed to unlink bot");
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

    // Real-time listener for users
    const unsubscribeUsers = onSnapshot(
      collection(db, "users"),
      (uSnap) => {
        const all = uSnap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile);
        const valid = all.filter((u) => {
          if (!u.email || typeof u.email !== "string" || u.email.trim() === "") return false;
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
        console.error("Error listening to users:", err);
        setLoading(false);
      }
    );

    // Also fetch projects to assign access
    const unsubscribeProjects = onSnapshot(
      collection(db, "projects"),
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
  }, [currentUser?.role]);

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
        <div className="bg-rose-50 border border-rose-200 p-6 rounded-3xl flex items-start gap-4">
          <ShieldAlert className="w-8 h-8 text-rose-500 mt-1" />
          <div>
            <h3 className="text-lg font-bold text-rose-900">
              Restricted Access
            </h3>
            <p className="text-rose-700 font-medium">
              You must be an Enterprise Admin or Owner to modify roles. You are currently
              viewing in read-only mode.
            </p>
          </div>
        </div>
      )}
      <div className="bg-surface rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.03)] border border-divider overflow-hidden">
        <div className="p-8 border-b border-divider flex items-center justify-between bg-panel/50">
          <h2 className="text-xl font-bold flex items-center gap-3">
            <Users className="w-6 h-6 text-primary" /> Identity & Authorization
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-divider text-ink-muted text-[11px] uppercase tracking-widest font-black">
                <th className="px-8 py-6">User Email / Identity</th>
                <th className="px-8 py-6">Platform Role</th>
                <th className="px-8 py-6">Projects Access</th>
                <th className="px-8 py-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.uid} className="hover:bg-panel/50 transition-colors">
                  <td className="px-8 py-6">
                    <div className="font-bold text-ink text-sm">{u.email}</div>
                    <div className="mt-2 flex items-center gap-2">
                      {u.telegramChatId ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[#34C759] bg-[#34C759]/10 px-2.5 py-1 rounded-md border border-[#34C759]/20 flex items-center gap-1 font-bold text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Telegram Linked
                          </span>
                          <button
                            onClick={() => unlinkBot(u.uid)}
                            disabled={currentUser.role !== "Admin" && currentUser.role !== "Owner"}
                            className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded-md transition-colors disabled:opacity-50"
                            title="Unlink Telegram Bot"
                          >
                            Unlink
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-ink-muted bg-panel px-2.5 py-1 rounded-md border border-divider text-xs font-bold">
                            Telegram Not Linked
                          </span>
                          <button
                            onClick={() => generateLinkCode(u.uid, u.email)}
                            disabled={currentUser.role !== "Admin" && currentUser.role !== "Owner"}
                            className="text-xs font-bold text-primary hover:bg-primary/10 px-2 py-1 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
                            title="Generate Telegram Link Code"
                          >
                            <Send className="w-3.5 h-3.5" /> Link Bot
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
                          <span className="text-[#8E44AD] bg-[#8E44AD]/10 px-3 py-1.5 rounded-lg border border-[#8E44AD]/20 flex items-center gap-1.5 w-fit">
                            <ShieldCheck className="w-4 h-4" /> Owner
                          </span>
                        ) : u.role === "Admin" ? (
                          <span className="text-[#A3711C] bg-[#A3711C]/10 px-3 py-1.5 rounded-lg border border-[#A3711C]/20 flex items-center gap-1.5 w-fit">
                            <ShieldCheck className="w-4 h-4" /> Admin
                          </span>
                        ) : u.role === "Project Manager" ? (
                          <span className="text-[#0088CC] bg-[#0088CC]/10 px-3 py-1.5 rounded-lg border border-[#0088CC]/20 flex items-center gap-1.5 w-fit">
                            <Users className="w-4 h-4" /> Manager
                          </span>
                        ) : u.role === "Site Engineer" ? (
                          <span className="text-[#34C759] bg-[#34C759]/10 px-3 py-1.5 rounded-lg border border-[#34C759]/20 flex items-center gap-1.5 w-fit">
                            <Construction className="w-4 h-4" /> Engineer
                          </span>
                        ) : (
                          <span className="text-ink-muted bg-panel px-3 py-1.5 rounded-lg border border-divider w-fit">
                            {u.role || "Viewer"}
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
                                <option value="none">None</option>
                                <option value="read">Read Only</option>
                                <option value="write">Read / Write</option>
                              </select>
                            </div>
                          ))}
                        </div>
                      ) : u.role === "Admin" || u.role === "Owner" ? (
                        <span className="text-[#34C759] font-bold">
                          Universal Access
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
                                    className={`font-bold ${u.projectAccess![p.id] === "write" ? "text-[#A3711C]" : "text-ink-muted"}`}
                                  >
                                    {u.projectAccess![p.id] === "write"
                                      ? "R/W"
                                      : "Read"}
                                  </span>
                                </div>
                              ))
                          ) : (
                            <span>Global Role Applied</span>
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
                          className="p-2 bg-[#34C759] text-white rounded-xl hover:bg-[#28A745] transition-colors"
                          title="Save Role"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingUserId(null)}
                          className="p-2 bg-divider text-ink rounded-xl hover:bg-slate-300 transition-colors"
                          title="Cancel"
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
                        title="Edit Role"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-md rounded-3xl p-8 border border-divider shadow-2xl relative">
            <button
              onClick={() => setShowLinkCode(null)}
              className="absolute right-6 top-6 p-2 bg-panel rounded-full hover:bg-divider transition-colors"
            >
              <X className="w-5 h-5 text-ink-muted" />
            </button>
            <h2 className="text-2xl font-black text-ink mb-2">Telegram Link Code</h2>
            <p className="text-ink-muted font-medium mb-6">
              Link code for <b>{showLinkCode.email}</b>
            </p>
            <div className="bg-panel rounded-2xl p-6 mb-6 text-center border border-divider">
              <p className="text-sm font-bold text-ink-muted mb-3 uppercase tracking-wider">Ask them to send:</p>
              <code className="text-3xl font-black text-primary bg-primary/10 px-4 py-2 rounded-xl">
                /link {showLinkCode.displayCode}
              </code>
            </div>
            <p className="text-center text-sm font-medium text-amber-600 bg-amber-50 py-3 rounded-xl">
              Expires in 15 minutes.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
