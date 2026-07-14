import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  useSaveDailyLog,
  useDailyLogsQuery,
  getTenantPath,
  useUpdateDailyLog,
} from "../hooks/useDailyLogs";
import { useProjectData } from "../hooks/useProjectData";
import { DailyLogEntry, InventoryItem, LaborRateCard, Task } from "../types";
import {
  X,
  Calendar,
  Plus,
  Trash2,
  CheckCircle2,
  Mic,
  Camera,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { useTasksQuery } from "../hooks/queries";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuthStore } from "../store";
import { compressImage } from "../utils/imageCompressor";

interface DailyLogEntryScreenProps {
  projectId: string;
  taskId?: string | null;
  editLog?: DailyLogEntry | null;
  onClose: () => void;
}

export const DailyLogEntryScreen: React.FC<DailyLogEntryScreenProps> = ({
  projectId,
  taskId,
  editLog,
  initialDate,
  onClose,
}) => {
  const [selectedTaskId, setSelectedTaskId] = useState<string>(
    editLog?.taskId || taskId || "",
  );
  const [workDate, setWorkDate] = useState<string>(
    editLog?.workDate || initialDate ||
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
        new Date(),
      ),
  );
  const [progressPercent, setProgressPercent] = useState<number>(
    editLog?.progressPercent || 0,
  );
  const [markComplete, setMarkComplete] = useState<boolean>(
    editLog?.markComplete || false,
  );
  const [materials, setMaterials] = useState<DailyLogEntry["materials"]>(
    editLog?.materials || [],
  );
  const [labour, setLabour] = useState<DailyLogEntry["labour"]>(
    editLog?.labour || [],
  );
  const [note, setNote] = useState<string>(editLog?.note || "");
  // For edits, we'll just track new photos and existing photos separately
  const [existingPhotos, setExistingPhotos] = useState<string[]>(
    editLog?.photoUrls || [],
  );
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoThumbnails, setPhotoThumbnails] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const user = useAuthStore((state) => state.user);

  const { data: rawTasks = [] } = useTasksQuery(projectId);
  const tasks = rawTasks.filter(
    (t) => t.type !== "Summary" && !t.isSystemGenerated,
  );
  const currentTask = tasks.find((t) => t.id === selectedTaskId);

  const { data: existingLogs = [] } = useDailyLogsQuery(
    projectId,
    selectedTaskId,
  );

  const latestLog = [...existingLogs].sort((a, b) => {
    if (a.workDate !== b.workDate) return b.workDate.localeCompare(a.workDate);
    return b.createdAt.localeCompare(a.createdAt);
  })[0];

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files) as File[];
      const newThumbnails = files.map((f) => URL.createObjectURL(f));
      setPhotos([...photos, ...files]);
      setPhotoThumbnails([...photoThumbnails, ...newThumbnails]);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
    setPhotoThumbnails(photoThumbnails.filter((_, i) => i !== index));
  };

  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition)
      return alert("Speech recognition not supported in this browser.");

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + " ";
        }
      }
      if (finalTranscript) {
        setNote(
          (prev) =>
            prev +
            (prev.endsWith(" ") || prev === "" ? "" : " ") +
            finalTranscript,
        );
      }
    };

    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);

    recognition.start();
    setIsRecording(true);
  };

  const { data: globalInventory = [] } = useProjectData<InventoryItem>(
    projectId,
    "inventory",
  );
  const { data: rateCards = [] } = useProjectData<LaborRateCard>(
    projectId,
    "labor_rate_cards",
  );

  const saveMutation = useSaveDailyLog(projectId);
  const updateMutation = useUpdateDailyLog(projectId);

  // Initialize progress with last known progress
  React.useEffect(() => {
    if (latestLog && progressPercent === 0 && !markComplete && !editLog) {
      setProgressPercent(latestLog.progressPercent);
    }
  }, [latestLog, editLog]);

  const handleAddMaterial = () => {
    setMaterials([
      ...materials,
      { materialId: "", name: "", quantity: 0, unit: "" },
    ]);
  };

  const updateMaterial = (index: number, field: string, value: any) => {
    const newItems = [...materials];
    if (field === "materialId") {
      const invItem = globalInventory.find((i) => i.id === value);
      newItems[index] = {
        ...newItems[index],
        materialId: value,
        name: invItem?.name || "",
        unit: invItem?.unit || "",
      };
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    setMaterials(newItems);
  };

  const handleAddLabor = () => {
    setLabour([...labour, { roleId: "", roleName: "", headcount: 0 }]);
  };

  const updateLabor = (index: number, field: string, value: any) => {
    const newItems = [...labour];
    if (field === "roleId") {
      const role = rateCards.find((r) => r.id === value);
      newItems[index] = {
        ...newItems[index],
        roleId: value,
        roleName: role?.role || "",
      };
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    setLabour(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskId) return;

    try {
      const payload = {
        taskId: selectedTaskId,
        projectId,
        workDate,
        progressPercent: markComplete ? 100 : progressPercent,
        markComplete,
        materials: materials.filter((m) => m.materialId && m.quantity > 0),
        labour: labour.filter((l) => l.roleId && l.headcount > 0),
        note,
      };

      let currentLogId = "";

      if (editLog) {
        currentLogId = editLog.id;
        await updateMutation.mutateAsync({
          id: editLog.id,
          updates: { ...payload },
          oldLog: editLog,
        });
      } else {
        const newLog = await saveMutation.mutateAsync(payload);
        currentLogId = newLog.id;
      }

      onClose();

      // 2. Async upload
      if (photos.length > 0 && user) {
        const tenantPathLogs = getTenantPath(user, projectId, `dailyLogs`);
        if (!tenantPathLogs) return;

        const storage = getStorage();
        const urls: string[] = [];

        for (let i = 0; i < photos.length; i++) {
          try {
            const file = photos[i];
            const compressed = await compressImage(file, 1600, 0.7);
            const name = `photo_${Date.now()}_${i}.jpg`;
            const sRef = storageRef(
              storage,
              `${tenantPathLogs}/${currentLogId}/${name}`,
            );

            await uploadBytes(sRef, compressed);
            const url = await getDownloadURL(sRef);
            urls.push(url);
          } catch (error) {
            console.error("Photo upload failed", error);
            // Flag failure without losing text entry
          }
        }

        if (urls.length > 0) {
          const logRef = doc(db, tenantPathLogs, currentLogId);
          await updateDoc(logRef, {
            photoUrls:
              editLog && existingPhotos ? [...existingPhotos, ...urls] : urls,
          });
        }
      }
    } catch (err) {
      console.error(err);
      alert("Failed to save daily log.");
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-[200]"
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
        className="fixed inset-x-0 bottom-0 z-[201] max-h-[95vh] h-full md:h-auto bg-surface md:rounded-t-[40px] flex flex-col shadow-2xl overflow-hidden max-w-3xl mx-auto"
      >
        <div className="flex justify-between items-center p-6 border-b border-divider bg-surface sticky top-0 z-10 shrink-0">
          <div>
            <h2 className="text-xl font-black text-ink tracking-tight mb-1">
              {editLog ? "Edit Log Entry" : "Log Today's Work"}
            </h2>
            <p className="text-[10px] font-bold text-ink-muted uppercase tracking-widest">
              {editLog ? "Modify historical record" : "Single Source of Truth"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-3 bg-panel hover:bg-divider rounded-full transition text-ink cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto w-full">
          <form
            id="daily-log-form"
            onSubmit={handleSubmit}
            className="p-6 md:p-8 space-y-8 w-full max-w-full"
          >
            {!taskId && (
              <div className="space-y-2">
                <label className="text-xs font-black text-ink-muted uppercase tracking-widest">
                  Select Task
                </label>
                <select
                  required
                  value={selectedTaskId}
                  onChange={(e) => setSelectedTaskId(e.target.value)}
                  className="w-full bg-panel p-4 rounded-xl border border-divider text-sm font-bold text-ink outline-none focus:ring-2 focus:ring-[#F3E8D2]0"
                >
                  <option value="">-- Choose Task --</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (wbs: {t.phase})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {taskId && currentTask && (
              <div className="bg-[#F3E8D2] p-4 rounded-xl border border-[#F3E8D2]">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#F3E8D2]0 block mb-1">
                  Logging for Task
                </span>
                <span className="text-sm font-bold text-[#8a5d16] block">
                  {currentTask.name}
                </span>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-black text-ink-muted uppercase tracking-widest flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Work Date
              </label>
              <input
                type="date"
                required
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                className="w-full bg-panel p-4 rounded-xl border border-divider text-sm font-bold text-ink outline-none focus:ring-2 focus:ring-[#F3E8D2]0 font-mono"
              />
              <p className="text-[10px] text-ink-muted font-bold ml-1">
                The date the work was actually performed on site.
              </p>
            </div>

            <div className="bg-panel rounded-2xl p-6 border border-divider space-y-6">
              <div className="flex justify-between items-end mb-2">
                <label className="text-xs font-black text-ink-muted uppercase tracking-widest">
                  Cumulative Progress
                </label>
                <span className="text-xl font-black text-[#A3711C] font-mono">
                  {markComplete ? 100 : progressPercent}%
                </span>
              </div>

              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={markComplete ? 100 : progressPercent}
                onChange={(e) => setProgressPercent(parseInt(e.target.value))}
                disabled={markComplete}
                className="w-full h-2 bg-divider rounded-lg appearance-none cursor-pointer accent-[#A3711C] disabled:opacity-50"
              />
              {latestLog && (
                <p className="text-[10px] text-ink-muted font-bold text-right italic">
                  was {latestLog.progressPercent}% on {latestLog.workDate}
                </p>
              )}

              <div className="pt-4 border-t border-divider flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-ink block">
                    Mark as Complete
                  </span>
                  <span className="text-[10px] text-ink-muted font-bold">
                    100% done, finished on this date.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMarkComplete(!markComplete)}
                  className={`w-14 h-8 rounded-full flex items-center transition-colors px-1 ${markComplete ? "bg-emerald-500 justify-end" : "bg-divider justify-start"}`}
                >
                  <div className="w-6 h-6 bg-surface rounded-full shadow-sm" />
                </button>
              </div>
            </div>

            {/* Materials */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-ink-muted uppercase tracking-widest">
                  Materials Consumed
                </label>
                <button
                  type="button"
                  onClick={handleAddMaterial}
                  className="text-[#A3711C] text-xs font-bold hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Material
                </button>
              </div>
              {materials.map((m, i) => (
                <div key={i} className="flex gap-2">
                  <select
                    value={m.materialId}
                    onChange={(e) =>
                      updateMaterial(i, "materialId", e.target.value)
                    }
                    className="flex-[2] bg-panel p-3 rounded-lg border border-divider text-xs font-bold text-ink outline-none"
                  >
                    <option value="">Select Material...</option>
                    {globalInventory.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.name} ({inv.unit})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="Qty"
                    min="0.1"
                    step="0.1"
                    value={m.quantity || ""}
                    onChange={(e) =>
                      updateMaterial(i, "quantity", parseFloat(e.target.value))
                    }
                    className="flex-1 w-20 bg-panel p-3 rounded-lg border border-divider text-xs font-bold text-ink outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setMaterials(materials.filter((_, idx) => idx !== i))
                    }
                    className="p-3 text-red-500 bg-red-50 rounded-lg shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Labor */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-ink-muted uppercase tracking-widest">
                  Labor Deployed
                </label>
                <button
                  type="button"
                  onClick={handleAddLabor}
                  className="text-[#A3711C] text-xs font-bold hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Labor
                </button>
              </div>
              {labour.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <select
                    value={l.roleId}
                    onChange={(e) => updateLabor(i, "roleId", e.target.value)}
                    className="flex-[2] bg-panel p-3 rounded-lg border border-divider text-xs font-bold text-ink outline-none"
                  >
                    <option value="">Select Role...</option>
                    {rateCards.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.role}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="Count"
                    min="1"
                    step="1"
                    value={l.headcount || ""}
                    onChange={(e) =>
                      updateLabor(i, "headcount", parseInt(e.target.value))
                    }
                    className="flex-1 w-20 bg-panel p-3 rounded-lg border border-divider text-xs font-bold text-ink outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setLabour(labour.filter((_, idx) => idx !== i))
                    }
                    className="p-3 text-red-500 bg-red-50 rounded-lg shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="space-y-2 relative">
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-black text-ink-muted uppercase tracking-widest">
                  Note (Optional)
                </label>
                <button
                  type="button"
                  onClick={toggleRecording}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-bold transition-colors ${
                    isRecording
                      ? "bg-red-50 text-red-600 animate-pulse"
                      : "bg-panel text-ink-muted hover:bg-divider"
                  }`}
                >
                  <Mic className="w-3.5 h-3.5" />
                  {isRecording ? "Recording..." : "Dictate"}
                </button>
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="w-full bg-panel p-4 rounded-xl border border-divider text-sm font-bold text-ink outline-none focus:ring-2 focus:ring-[#F3E8D2]0 resize-none"
                placeholder="Any issues, delays, or general remarks?"
              />
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-xs font-black text-ink-muted uppercase tracking-widest">
                  Site Photos
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-panel hover:bg-divider text-ink px-4 py-2 rounded-xl text-[10px] md:text-xs font-bold flex items-center gap-2 apple-transition border border-divider shadow-sm"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Capture / Upload
                </button>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handlePhotoSelect}
                />
              </div>

              {photoThumbnails.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {photoThumbnails.map((thumb, idx) => (
                    <div
                      key={idx}
                      className="relative aspect-square rounded-xl bg-panel border border-divider group overflow-hidden shadow-sm"
                    >
                      <img
                        src={thumb}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-red-600 text-white rounded-lg backdrop-blur-md transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Safe area block for mobile scrolling */}
            <div className="h-12 border-none"></div>
          </form>
        </div>

        <div className="p-6 bg-surface border-t border-divider shrink-0">
          <button
            form="daily-log-form"
            type="submit"
            disabled={saveMutation.isPending || !selectedTaskId}
            className="w-full bg-[#A3711C] text-white rounded-2xl py-4 text-sm font-bold shadow-lg hover:bg-[#8a5d16] active:scale-95 transition flex justify-center items-center gap-2 disabled:opacity-50"
          >
            {saveMutation.isPending ? (
              "Saving..."
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" /> Submit Log
              </>
            )}
          </button>
        </div>
      </motion.div>
    </>
  );
};
