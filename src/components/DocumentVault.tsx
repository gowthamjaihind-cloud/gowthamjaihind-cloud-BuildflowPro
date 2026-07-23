import React, { useState, useEffect, useRef } from "react";
import {
  db,
  collection,
  onSnapshot,
  query,
  addDoc,
  auth,
  handleFirestoreError,
  OperationType,
  updateDoc,
  doc,
} from "../firebase";
import { ProjectDocument, Task } from "../types";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { compressImage } from "../utils/imageCompressor";
import { useAuthStore } from "../store";
import {
  FileText,
  UploadSimple as Upload,
  MagnifyingGlass as Search,
  Funnel as Filter,
  ArrowSquareOut as ExternalLink,
  Shield,
  Link as LinkIcon,
  X,
  File,
  Paperclip,
  Camera,
  CheckSquare,
  Square,
  Trash as Trash2,
  DownloadSimple as Download,
  ShieldCheck,
} from "@phosphor-icons/react";

interface DocumentVaultProps {
  projectId: string;
}

export const DocumentVault: React.FC<DocumentVaultProps> = ({ projectId }) => {

  const user = useAuthStore((state) => state.user);
  const basePath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;
  const isAdminOrOwner = user?.role === "Admin" || user?.role === "Owner";

  const [docs, setDocs] = useState<ProjectDocument[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<"List" | "Gallery">("List");
  const [filterTaskId, setFilterTaskId] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [newDoc, setNewDoc] = useState<Partial<ProjectDocument>>({
    name: "",
    type: "PDF",
    accessLevel: "Internal",
    url: "",
    taskId: "",
    category: "Progress Photos",
    tags: [],
  });
  const [tagInput, setTagInput] = useState("");
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  const categories = [
    "Progress Photos",
    "Group Photos",
    "Safety & Compliance",
    "Quality & Inspections",
    "Structural Drawings",
    "Architectural Drawings",
    "Invoices & Receipts",
    "Legal & Permits",
    "Reports",
    "Others",
  ];

  useEffect(() => {
    const path = `${basePath}/documents`;
    const q = query(collection(db, path));
    const unsubDocs = onSnapshot(
      q,
      (snapshot) => {
        setDocs(
          snapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as ProjectDocument,
          ),
        );
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      },
    );

    const tasksPath = `${basePath}/tasks`;
    const unsubTasks = onSnapshot(
      query(collection(db, tasksPath)),
      (snapshot) => {
        setTasks(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Task),
        );
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, tasksPath);
      },
    );

    return () => {
      unsubDocs();
      unsubTasks();
    };
  }, [projectId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Auto-populate name and type
      const extension = file.name.split(".").pop()?.toUpperCase() || "PDF";
      setNewDoc((prev) => ({
        ...prev,
        name: file.name.split(".").slice(0, -1).join("."),
        type:
          extension === "PDF"
            ? "PDF"
            : extension === "DWG"
              ? "DWG (CAD)"
              : ["DOC", "DOCX"].includes(extension)
                ? "DOCX"
                : ["XLS", "XLSX"].includes(extension)
                  ? "XLSX"
                  : ["JPG", "JPEG", "PNG", "WEBP"].includes(extension)
                    ? "Image"
                    : "PDF",
      }));
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    const path = `${basePath}/documents`;

    setIsUploadingFile(true);

    try {
      let finalUrl = newDoc.url;
      let storagePath = "";

      if (selectedFile) {
        const sRef = storageRef(
          getStorage(),
          `${basePath}/documents/${Date.now()}_${selectedFile.name}`,
        );
        storagePath = sRef.fullPath;
        if (newDoc.type === "Image") {
          const compressed = await compressImage(selectedFile);
          await uploadBytes(sRef, compressed);
        } else {
          await uploadBytes(sRef, selectedFile);
        }
        finalUrl = await getDownloadURL(sRef);
      }

      if (!finalUrl) {
        throw new Error("No file selected or external URL provided.");
      }

      await addDoc(collection(db, path), {
        ...newDoc,
        url: finalUrl,
        storagePath,
        projectId,
        uploadedBy: auth.currentUser.uid,
        uploadedAt: new Date().toISOString(),
      });
      setIsUploadingFile(false);
      setIsUploading(false);
      setSelectedFile(null);
      setTagInput("");
      setNewDoc({
        name: "",
        type: "PDF",
        accessLevel: "Internal",
        url: "",
        taskId: "",
        category: "Progress Photos",
        tags: [],
      });
    } catch (error) {
      setIsUploadingFile(false);
      console.error("Upload failed", error);
      alert("Failed to upload document. Please try again.");
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const handleUpdateTaskLink = async (docId: string, taskId: string) => {
    const path = `${basePath}/documents/${docId}`;
    try {
      await updateDoc(doc(db, path), { taskId });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const filteredDocs = docs.filter((d) => {
    if (d.deleted === true) return false;
    const matchesSearch =
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.tags &&
        d.tags.some((t) => t.toLowerCase().includes(searchTerm.toLowerCase())));
    const matchesTask = !filterTaskId || d.taskId === filterTaskId;
    const matchesCategory = !filterCategory || d.category === filterCategory;
    const matchesType = viewMode === "Gallery" ? d.type === "Image" : true;
    return matchesSearch && matchesTask && matchesCategory && matchesType;
  });

  const toggleSelect = (id: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    if (selectedDocIds.length === filteredDocs.length) {
      setSelectedDocIds([]);
    } else {
      setSelectedDocIds(filteredDocs.map((d) => d.id));
    }
  };

  const handleBulkDelete = async () => {
    if (!isAdminOrOwner) return;
    if (
      !window.confirm(
        `Are you sure you want to delete ${selectedDocIds.length} documents?`,
      )
    )
      return;
    setIsBulkUpdating(true);
    try {
      for (const id of selectedDocIds) {
        const docToDelete = docs.find((d) => d.id === id);
        if (docToDelete?.storagePath) {
          try {
            await deleteObject(
              storageRef(getStorage(), docToDelete.storagePath),
            );
          } catch (storageError) {
            console.error(
              `Failed to delete storage object ${docToDelete.storagePath}`,
              storageError,
            );
            // Non-fatal if object already gone
          }
        }
        const path = `${basePath}/documents/${id}`;
        await updateDoc(doc(db, path), { deleted: true });
      }
      setSelectedDocIds([]);
    } catch (error) {
      console.error("Bulk delete failed", error);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleBulkUpdateAccess = async (
    level: "Public" | "Internal" | "Confidential",
  ) => {
    if (!isAdminOrOwner) return;
    setIsBulkUpdating(true);
    try {
      for (const id of selectedDocIds) {
        const path = `${basePath}/documents/${id}`;
        await updateDoc(doc(db, path), { accessLevel: level });
      }
      setSelectedDocIds([]);
    } catch (error) {
      console.error("Bulk access update failed", error);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleBulkDownload = () => {
    selectedDocIds.forEach((id) => {
      const d = docs.find((doc) => doc.id === id);
      if (d?.url) window.open(d.url, "_blank");
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-surface/50 backdrop-blur-xl p-5 md:p-6 rounded-2xl border border-white shadow-sm gap-6">
        <h2 className="text-xl md:text-2xl font-black flex items-center gap-3 md:gap-4 text-ink tracking-tight">
          <div className="p-2.5 md:p-3 bg-primary text-white rounded-2xl shadow-lg shadow-[#F7E4DB]">
            <FileText className="w-5 h-5 md:w-6 md:h-6" />
          </div>
          Digital Project Vault
        </h2>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="bg-[#6E8CA0]/10 p-1 rounded-xl flex flex-1 md:flex-none">
            <button
              onClick={() => setViewMode("List")}
              className={`flex-1 md:px-4 py-2 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === "List" ? "bg-surface text-primary shadow-sm" : "text-ink-muted"}`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode("Gallery")}
              className={`flex-1 md:px-4 py-2 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === "Gallery" ? "bg-surface text-primary shadow-sm" : "text-ink-muted"}`}
            >
              Gallery
            </button>
          </div>
          <button
            onClick={() => setIsUploading(true)}
            className="flex-1 md:flex-none bg-primary text-white px-6 py-3 rounded-xl font-black uppercase tracking-widest text-[9px] md:text-[10px] flex items-center justify-center gap-2 hover:bg-primary/80 apple-transition shadow-xl shadow-primary/20"
          >
            <Upload className="w-4 h-4" /> Upload
          </button>
        </div>
      </div>

      {selectedDocIds.length > 0 && (
        <div className="fixed bottom-[calc(80px+env(safe-area-inset-bottom))] md:bottom-10 left-1/2 -translate-x-1/2 z-50 bg-surface-dark text-white rounded-3xl p-4 md:p-6 shadow-2xl flex flex-col md:flex-row items-center gap-6 animate-in slide-in-from-bottom-10 w-[90%] md:w-auto">
          <div className="flex items-center gap-4">
            <div className="bg-[#D97D54] text-white w-10 h-10 rounded-2xl flex items-center justify-center font-black">
              {selectedDocIds.length}
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">
                Selected Assets
              </p>
              <p className="text-[8px] text-ink-muted font-bold uppercase tracking-tight">
                Bulk actions available
              </p>
            </div>
          </div>

          <div className="h-px md:h-10 w-full md:w-px bg-[#3A4F5F]" />

          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkDownload}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#3A4F5F] hover:bg-[#465D6E] rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors"
            >
              <Download size={14} /> Download Set
            </button>
            {isAdminOrOwner && (
              <>
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-900/40 hover:bg-red-900/60 text-[#F87171] rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors"
                >
                  <Trash2 size={14} /> Delete
                </button>
                <div className="relative group">
                  <button className="flex items-center gap-2 px-4 py-2.5 bg-[#3A4F5F] hover:bg-[#465D6E] rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors">
                    <ShieldCheck size={14} /> Access Level
                  </button>
                  <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block bg-[#3A4F5F] rounded-2xl p-2 border border-[#465D6E] shadow-2xl min-w-[160px]">
                    {(["Public", "Internal", "Confidential"] as const).map(
                      (level) => (
                        <button
                          key={level}
                          onClick={() => handleBulkUpdateAccess(level)}
                          className="w-full text-left px-4 py-2 hover:bg-[#465D6E] rounded-xl text-[9px] font-black uppercase tracking-widest text-ink-muted hover:text-white transition-colors"
                        >
                          Set to {level}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              </>
            )}
            <button
              onClick={() => setSelectedDocIds([])}
              className="px-6 py-2.5 text-ink-muted hover:text-white transition-colors text-[9px] font-black uppercase tracking-widest"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4 no-print">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
          <input
            className="w-full pl-11 pr-4 py-3 bg-surface border border-divider rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none font-bold text-ink shadow-sm transition-all text-xs md:text-sm"
            placeholder="Search documents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
          <select
            className="w-full pl-11 pr-4 py-3 bg-surface border border-divider rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none font-bold text-ink shadow-sm transition-all appearance-none text-[10px] md:text-xs uppercase tracking-widest"
            value={filterTaskId}
            onChange={(e) => setFilterTaskId(e.target.value)}
          >
            <option value="">All Tasks</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="relative">
          <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
          <select
            className="w-full pl-11 pr-4 py-3 bg-surface border border-divider rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none font-bold text-ink shadow-sm transition-all appearance-none text-[10px] md:text-xs uppercase tracking-widest"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isUploading && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleUpload}
            className="bg-surface w-full max-w-2xl p-5 md:p-6 rounded-2xl border shadow-2xl grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 relative my-auto max-h-[95vh] overflow-y-auto custom-scrollbar"
          >
            <button
              type="button"
              onClick={() => {
                setIsUploading(false);
                setSelectedFile(null);
              }}
              className="absolute top-4 right-4 md:top-6 md:right-6 text-ink-muted hover:text-ink bg-panel p-2 rounded-full transition-colors z-10"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="md:col-span-2 mb-2">
              <h3 className="text-2xl font-black text-ink tracking-tight">
                Upload New Document
              </h3>
              <p className="text-ink-muted text-sm">
                Select a file from your device or provide an external link.
              </p>
            </div>

            <div className="md:col-span-2">
              <input
                type="file"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileChange}
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-4 border-dashed rounded-2xl p-5 transition-all cursor-pointer flex flex-col items-center justify-center gap-3 ${
                  selectedFile
                    ? "border-[#34D399]/40 bg-emerald-50/30"
                    : "border-divider hover:border-[#F7E4DB] hover:bg-panel"
                }`}
              >
                <div
                  className={`p-4 rounded-3xl ${selectedFile ? "bg-[#34D399]/20 text-[#059669]" : "bg-[#F7E4DB] text-[#D97D54]"}`}
                >
                  {selectedFile ? (
                    <File className="w-8 h-8" />
                  ) : (
                    <Upload className="w-8 h-8" />
                  )}
                </div>
                {selectedFile ? (
                  <div className="text-center">
                    <p className="font-black text-ink">{selectedFile.name}</p>
                    <p className="text-[10px] text-ink-muted uppercase tracking-widest font-bold">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • Ready
                      to upload
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="font-black text-ink">
                      Choose a file from device
                    </p>
                    <p className="text-xs text-ink-muted font-medium">
                      Drag and drop or click to browse
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="md:col-span-2 space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                Category & Organisation
              </label>
              <select
                className="w-full border-2 border-divider rounded-2xl p-3 focus:ring-2 focus:ring-[#D97D54] outline-none font-bold text-ink"
                value={newDoc.category}
                onChange={(e) =>
                  setNewDoc({ ...newDoc, category: e.target.value })
                }
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <p className="text-[9px] text-ink-muted font-medium tracking-tight">
                Categorizing group photos helps in quick retrieval during
                audits.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                Document Name
              </label>
              <input
                required
                className="w-full border-2 border-divider rounded-2xl p-3 focus:ring-2 focus:ring-[#D97D54] outline-none font-bold text-ink/80"
                value={newDoc.name}
                placeholder="Financial Audit 2024"
                onChange={(e) => setNewDoc({ ...newDoc, name: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                Related WBS Task
              </label>
              <select
                className="w-full border-2 border-divider rounded-2xl p-3 focus:ring-2 focus:ring-[#D97D54] outline-none font-bold text-ink"
                value={newDoc.taskId}
                onChange={(e) =>
                  setNewDoc({ ...newDoc, taskId: e.target.value })
                }
              >
                <option value="">No Link</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                Document Type
              </label>
              <select
                className="w-full border-2 border-divider rounded-2xl p-3 focus:ring-2 focus:ring-[#D97D54] outline-none font-bold text-ink"
                value={newDoc.type}
                onChange={(e) => setNewDoc({ ...newDoc, type: e.target.value })}
              >
                <option>PDF</option>
                <option>DWG (CAD)</option>
                <option>DOCX</option>
                <option>XLSX</option>
                <option>Image</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                Access Level
              </label>
              <select
                className="w-full border-2 border-divider rounded-2xl p-3 focus:ring-2 focus:ring-[#D97D54] outline-none font-bold text-ink"
                value={newDoc.accessLevel}
                onChange={(e) =>
                  setNewDoc({ ...newDoc, accessLevel: e.target.value as any })
                }
              >
                <option>Public</option>
                <option>Internal</option>
                <option>Confidential</option>
              </select>
            </div>
            {!selectedFile && (
              <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                  External URL (Fallback)
                </label>
                <div className="relative">
                  <Paperclip className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
                  <input
                    className="w-full pl-11 pr-4 py-3 border-2 border-divider rounded-2xl focus:ring-2 focus:ring-[#D97D54] outline-none font-mono text-xs text-ink-muted"
                    placeholder="https://storage.google.com/..."
                    value={newDoc.url}
                    onChange={(e) =>
                      setNewDoc({ ...newDoc, url: e.target.value })
                    }
                  />
                </div>
              </div>
            )}
            <div className="md:col-span-2 space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                Search Tags (Comma separated)
              </label>
              <input
                className="w-full border-2 border-divider rounded-2xl p-3 focus:ring-2 focus:ring-[#D97D54] outline-none font-bold text-ink"
                value={tagInput}
                placeholder="Team, Lunch, Safety, VIP Visit"
                onChange={(e) => {
                  setTagInput(e.target.value);
                  setNewDoc({
                    ...newDoc,
                    tags: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter((t) => t),
                  });
                }}
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-3 pt-6 border-t font-black text-xs tracking-widest uppercase">
              <button
                type="button"
                onClick={() => {
                  setIsUploading(false);
                  setSelectedFile(null);
                }}
                disabled={isUploadingFile}
                className="px-8 py-4 rounded-2xl text-ink-muted hover:bg-panel transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUploadingFile}
                className="bg-[#D97D54] text-white px-12 py-4 rounded-2xl hover:bg-[#B85F3B] shadow-xl shadow-[#F7E4DB] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploadingFile ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Uploading...
                  </span>
                ) : (
                  <>
                    <Upload className="w-4 h-4" /> Start Upload
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {viewMode === "List" ? (
        <div className="bg-surface rounded-2xl border shadow-sm border-divider overflow-x-auto scroller-hide">
          <table className="w-full text-left min-w-[900px]">
            <thead>
              <tr className="bg-panel border-b">
                <th className="px-8 py-5 w-12">
                  <button
                    onClick={toggleSelectAll}
                    className="text-ink-muted hover:text-[#D97D54] transition-colors"
                  >
                    {selectedDocIds.length === filteredDocs.length &&
                    filteredDocs.length > 0 ? (
                      <CheckSquare className="w-5 h-5 text-[#D97D54]" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>
                </th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-ink-muted">
                  Document Name
                </th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-ink-muted">
                  Linked WBS Task
                </th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-ink-muted">
                  Type
                </th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-ink-muted">
                  Access
                </th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-ink-muted">
                  Category
                </th>
                <th className="px-8 py-5 text-right text-[10px] font-black uppercase tracking-widest text-ink-muted">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider/60">
              {filteredDocs.map((docItem) => {
                const task = tasks.find((t) => t.id === docItem.taskId);
                const isSelected = selectedDocIds.includes(docItem.id);
                return (
                  <tr
                    key={docItem.id}
                    className={`hover:bg-panel transition-colors group ${isSelected ? "bg-[#F7E4DB]/50" : ""}`}
                  >
                    <td className="px-8 py-6">
                      <button
                        onClick={() => toggleSelect(docItem.id)}
                        className={`transition-colors ${isSelected ? "text-[#D97D54]" : "text-ink-muted group-hover:text-ink-muted"}`}
                      >
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-[#F7E4DB] text-[#D97D54] rounded-2xl group-hover:bg-[#F7E4DB] transition-colors">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="font-black text-ink block">
                            {docItem.name}
                          </span>
                          <span className="text-[10px] text-ink-muted font-bold uppercase tracking-wider">
                            {new Date(docItem.uploadedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                        <LinkIcon
                          className={`w-3.5 h-3.5 ${task ? "text-[#D97D54]" : "text-ink-muted"}`}
                        />
                        <select
                          className="bg-transparent border-none text-xs font-bold text-ink focus:ring-0 cursor-pointer hover:text-[#D97D54]"
                          value={docItem.taskId || ""}
                          onChange={(e) =>
                            handleUpdateTaskLink(docItem.id, e.target.value)
                          }
                        >
                          <option value="">No Task Linked</option>
                          {tasks.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className="px-3 py-1 bg-panel text-ink rounded-full text-[10px] font-black tracking-widest uppercase border">
                        {docItem.type}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2 text-xs font-bold">
                        <Shield
                          className={`w-4 h-4 ${
                            docItem.accessLevel === "Confidential"
                              ? "text-[#EF4444]"
                              : docItem.accessLevel === "Internal"
                                ? "text-[#D97D54]"
                                : "text-[#10B981]"
                          }`}
                        />
                        <span className="text-ink-muted">
                          {docItem.accessLevel}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className="text-xs font-bold text-ink bg-panel px-2 py-1 rounded-lg border border-divider">
                        {docItem.category || "Uncategorized"}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <a
                        href={docItem.url || "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 bg-surface-dark text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#D97D54] transition-all"
                      >
                        View File <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                  </tr>
                );
              })}
              {filteredDocs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <p className="text-[10px] font-black text-ink-muted uppercase tracking-widest">
                      No documents found matching search criteria
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {filteredDocs
            .filter((d) => d.type === "Image")
            .map((photo) => {
              const isSelected = selectedDocIds.includes(photo.id);
              return (
                <div
                  key={photo.id}
                  className={`group relative aspect-square rounded-2xl overflow-hidden border transition-all cursor-pointer ${
                    isSelected
                      ? "border-[#D97D54] shadow-xl ring-4 ring-[#D97D54]/10"
                      : "border-divider bg-panel shadow-sm hover:shadow-xl hover:shadow-[#F7E4DB]"
                  }`}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey) {
                      toggleSelect(photo.id);
                    } else {
                      window.open(photo.url, "_blank");
                    }
                  }}
                >
                  <img
                    src={photo.url}
                    alt={photo.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />

                  <div
                    className={`absolute top-4 left-4 z-20 transition-all ${isSelected ? "opacity-100" : "opacity-100"}`}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(photo.id);
                      }}
                      className={`p-2 rounded-xl backdrop-blur-md shadow-lg transition-all ${
                        isSelected
                          ? "bg-[#D97D54] text-white"
                          : "bg-surface/90 text-ink-muted hover:text-[#D97D54]"
                      }`}
                    >
                      {isSelected ? (
                        <CheckSquare size={16} />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>
                  </div>

                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent transition-opacity p-6 flex flex-col justify-end">
                    <p className="text-white font-black text-[10px] uppercase tracking-widest mb-1 truncate">
                      {photo.name}
                    </p>
                    <p className="text-white/60 text-[8px] font-bold uppercase tracking-wider mb-2">
                      {tasks.find((t) => t.id === photo.taskId)?.name ||
                        "Unlinked Photo"}
                    </p>
                    {photo.tags && photo.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {photo.tags.map((tag, i) => (
                          <span
                            key={i}
                            className="text-[7px] px-1.5 py-0.5 bg-[#D97D54] text-white rounded font-bold uppercase tracking-tighter"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="absolute top-4 right-4 bg-surface/90 backdrop-blur p-2 rounded-xl transition-opacity">
                    <ExternalLink size={14} className="text-ink" />
                  </div>
                </div>
              );
            })}
          {filteredDocs.filter((d) => d.type === "Image").length === 0 && (
            <div className="col-span-full py-32 flex flex-col items-center justify-center bg-panel/50 rounded-2xl border-2 border-dashed border-divider">
              <Camera size={48} className="text-ink-muted mb-4" />
              <p className="text-[10px] font-black text-ink-muted uppercase tracking-widest">
                No site photos found in the vault
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
