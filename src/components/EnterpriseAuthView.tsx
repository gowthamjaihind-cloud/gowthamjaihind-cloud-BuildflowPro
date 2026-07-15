import React, { useState, useEffect } from "react";
import { UserProfile, UserRole, Project } from "../types";
import {
  db,
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  query,
  onSnapshot,
  writeBatch,
  deleteDoc,
} from "../firebase";
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
  
  const roles: UserRole[] = [
    "Owner",
    "Admin",
    "Project Manager",
    "Site Engineer",
    "Stakeholder",
    "Viewer",
  ];

  useEffect(() => {
    // We only fetch if they are an admin or we want to show it disabled
    const fetchUsers = async () => {
      try {
        const uSnap = await getDocs(collection(db, "users"));
        setUsers(
          uSnap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile),
        );
      } catch (err: any) {
        console.error(err);
        if (err.message?.includes("Missing or insufficient permissions")) {
          console.error("You do not have permission to view users.");
        } else {
          handleFirestoreError(err, OperationType.LIST, "users");
        }
      } finally {
        setLoading(false);
      }
    };

    // Also fetch projects to assign access
    const unsubscribe = onSnapshot(
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

    
    fetchUsers();
    return () => {
      unsubscribe();
          };
  }, []);

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

  const handleGenerateLinkCode = async (u: UserProfile) => {
    if (currentUser.role !== "Admin" && currentUser.role !== "Owner") return;

    // Cryptographically secure. Unambiguous alphabet (no 0/O, no 1/I/L).
    const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const code = Array.from(bytes)
      .map((b) => ALPHABET[b % ALPHABET.length])
      .join("");

    try {
      await setDoc(doc(db, "bot_link_codes", code), {
        email: u.email,
        userId: u.uid,
        createdAt: Date.now(),
        expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
        used: false,
        createdByUid: currentUser.uid,
      });
      window.alert(
        `One-time link code for ${u.displayName || u.email}:\n\n${code}\n\n` +
        `They must send:  /link ${code}\n\n` +
        `Expires in 15 minutes. Single use. It will not be shown again.`
      );
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, "bot_link_codes");
    }
  };

  const handleUnlinkTelegram = async (u: UserProfile) => {
    if (currentUser.role !== "Admin" && currentUser.role !== "Owner") return;
    try {
      await updateDoc(doc(db, "users", u.uid), {
        telegramChatId: null,
        telegramLinkedAt: null,
      });
      setUsers(users.map(user => user.uid === u.uid ? { ...user, telegramChatId: undefined, telegramLinkedAt: undefined } : user));
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, "users");
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

      <div className="flex gap-8 mb-8">
        <div className="flex-1 bg-surface p-8 rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.03)] border border-divider flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-[#0088CC]/10 text-[#0088CC] rounded-2xl">
              <Send className="w-8 h-8" />
            </div>
            <div>
              <div className="font-bold text-xl text-ink">
                Telegram Integration
              </div>
              <div className="text-sm text-ink-muted mt-1">
                Manage bot configuration and global alerts
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs font-black uppercase tracking-widest text-[#0088CC] bg-[#0088CC]/10 px-3 py-1.5 rounded-lg">
              Active
            </span>
            <button className="bg-panel text-ink/80 px-6 py-3 rounded-2xl font-bold text-sm tracking-wide hover:bg-divider transition-colors">
              Configure Bot
            </button>
          </div>
        </div>
      </div>

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
                <th className="px-8 py-6">User Identity</th>
                <th className="px-8 py-6">Platform Role</th>
                <th className="px-8 py-6">Telegram Link</th>
                <th className="px-8 py-6">Projects Access</th>
                <th className="px-8 py-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.uid} className="hover:bg-panel/50 transition-colors">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      {u.photoURL ? (
                        <img
                          src={u.photoURL}
                          alt=""
                          className="w-10 h-10 rounded-full bg-divider"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                          {u.displayName.charAt(0)}
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-ink">
                          {u.displayName}
                        </div>
                        <div className="text-[13px] text-ink-muted">
                          {u.email}
                        </div>
                      </div>
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
                    {u.telegramChatId ? (
                      <div className="flex flex-col gap-1">
                        <span className="font-mono text-sm tracking-widest text-[#34C759] bg-[#34C759]/10 px-3 py-1.5 rounded-lg border border-[#34C759]/20 w-fit">
                          Linked
                        </span>
                        { (currentUser.role === "Admin" || currentUser.role === "Owner") && (
                          <button onClick={() => handleUnlinkTelegram(u)} className="text-xs text-rose-500 hover:underline w-fit">Unlink</button>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <span className="text-ink-muted italic text-sm">
                          Not linked
                        </span>
                        { (currentUser.role === "Admin" || currentUser.role === "Owner") && (
                          <button onClick={() => handleGenerateLinkCode(u)} className="text-xs text-primary font-bold hover:underline w-fit">Generate Code</button>
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

      
    </div>
  );
};
