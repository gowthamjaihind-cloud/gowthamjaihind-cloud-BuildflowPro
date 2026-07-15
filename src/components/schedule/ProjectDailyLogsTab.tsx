import React, { useState, useMemo } from "react";
import {
  useProjectDailyLogsQuery,
  useDeleteDailyLog,
  canEditOrDeleteLog,
} from "../../hooks/useDailyLogs";
import { useTasksQuery } from "../../hooks/queries";
import { DailyLogEntry } from "../../types";
import { aggregateLogs } from "../../utils/reportUtils";
import { format } from "date-fns";
import {
  Calendar,
  Users,
  Box,
  CheckCircle2,
  Edit2,
  Trash2,
} from "lucide-react";
import { DailyLogEntryScreen } from "../DailyLogEntryScreen";
import { useAuthStore } from "../../store";

interface ProjectDailyLogsTabProps {
  projectId: string;
}

export const ProjectDailyLogsTab: React.FC<ProjectDailyLogsTabProps> = ({
  projectId,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }))
      .toISOString()
      .split("T")[0],
  );

  const [logToEdit, setLogToEdit] = useState<DailyLogEntry | null>(null);
  const [logToDelete, setLogToDelete] = useState<DailyLogEntry | null>(null);
  const [logModalOpen, setLogModalOpen] = useState(false);

  const { data: logs = [], isLoading } = useProjectDailyLogsQuery(
    projectId,
    selectedDate,
  );
  const { data: tasks = [] } = useTasksQuery(projectId);
  const user = useAuthStore((state) => state.user);
  const deleteMutation = useDeleteDailyLog(projectId);

  const handleDelete = async () => {
    if (!logToDelete) return;
    try {
      await deleteMutation.mutateAsync({
        id: logToDelete.id,
        oldLog: logToDelete,
      });
      setLogToDelete(null);
    } catch (e) {
      console.error(e);
      alert("Failed to delete log");
    }
  };

  const { totalLabor, materialsRollup } = useMemo(
    () => aggregateLogs(logs),
    [logs],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-surface/70 backdrop-blur-xl p-6 rounded-[32px] border border-white/20 shadow-[0_10px_40px_rgba(0,0,0,0.03)] gap-6">
        <div>
          <h2 className="text-2xl font-black text-ink tracking-tight leading-none mb-1">
            Daily Progress
          </h2>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">
            Site-wide Activity Logs
          </p>
        </div>

        <div className="flex items-center gap-4 bg-panel px-4 py-2 rounded-2xl border border-divider">
          <label className="text-xs font-black uppercase tracking-widest text-ink-muted flex items-center gap-1.5 cursor-pointer">
            <Calendar className="w-4 h-4" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-none text-ink font-bold focus:ring-0 cursor-pointer outline-none w-32 min-h-[44px]"
            />
          </label>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center p-12 text-ink-muted font-bold text-sm animate-pulse">
          Loading logs...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            {logs.length === 0 ? (
              <div className="bg-panel border border-dashed border-divider rounded-3xl p-12 text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-surface rounded-full flex items-center justify-center mb-4 text-ink-muted shadow-sm">
                  <Calendar className="w-8 h-8" />
                </div>
                <p className="text-ink-muted font-bold mb-4">
                  No activities logged for{" "}
                  {format(new Date(selectedDate), "MMM d, yyyy")}.
                </p>
                <button
                  onClick={() => setLogModalOpen(true)}
                  className="bg-primary text-white rounded-xl px-6 py-3 text-sm font-bold shadow-lg hover:bg-primary/80 active:scale-95 transition"
                >
                  Log Work Now
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center px-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-ink-muted">
                    Tasks Logged Today
                  </span>
                  <button
                    onClick={() => setLogModalOpen(true)}
                    className="text-[10px] font-bold text-primary uppercase tracking-widest hover:underline bg-[#F3E8D2] px-3 py-2 rounded-md"
                  >
                    Log Another
                  </button>
                </div>
                {logs.map((log, index) => (
                  <div
                    key={`${log.id}-${index}`}
                    className="bg-surface rounded-2xl p-5 border border-divider shadow-sm relative overflow-hidden"
                  >
                    {log.markComplete ? (
                      <div className="absolute top-0 right-0 border-b-[32px] border-l-[32px] border-b-transparent border-l-emerald-500 w-0 h-0" />
                    ) : null}
                    <div className="flex justify-between items-start mb-3">
                      <div className="pr-4">
                        <span className="text-sm font-black text-ink block truncate">
                          {tasks.find((t) => t.id === log.taskId)?.name ||
                            `Task ${log.taskId}`}
                        </span>
                        <span className="text-[10px] font-bold text-ink-muted uppercase tracking-widest flex items-center gap-1 mt-0.5">
                          by {log.createdByName}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xl font-black text-primary font-mono tracking-tighter leading-none">
                          {log.progressPercent}%
                        </span>
                        <span className="text-[8px] font-bold text-ink-muted uppercase tracking-widest block text-right mt-1">
                          Cum. Progress
                        </span>
                      </div>
                    </div>
                    {(log.materials.length > 0 || log.labour.length > 0) && (
                      <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-divider/50">
                        {log.materials.length > 0 && (
                          <div>
                            <span className="text-[9px] font-bold text-ink-muted uppercase tracking-widest flex items-center gap-1 mb-1.5 opacity-70">
                              <Box className="w-3 h-3" /> Materials
                            </span>
                            <ul className="space-y-1 text-xs">
                              {log.materials.map((m, i) => (
                                <li
                                  key={i}
                                  className="flex justify-between text-ink/80"
                                >
                                  <span className="truncate pr-2 font-medium">
                                    {m.name}
                                  </span>
                                  <span className="font-mono font-bold">
                                    {m.quantity} {m.unit}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {log.labour.length > 0 && (
                          <div>
                            <span className="text-[9px] font-bold text-ink-muted uppercase tracking-widest flex items-center gap-1 mb-1.5 opacity-70">
                              <Users className="w-3 h-3" /> Labor
                            </span>
                            <ul className="space-y-1 text-xs">
                              {log.labour.map((l, i) => (
                                <li
                                  key={i}
                                  className="flex justify-between text-ink/80"
                                >
                                  <span className="truncate pr-2 font-medium">
                                    {l.roleName}
                                  </span>
                                  <span className="font-mono font-bold">
                                    {l.headcount}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {log.note && (
                      <div className="mt-4 pt-4 border-t border-divider/50">
                        <p className="text-xs text-ink/90 font-medium italic">
                          "{log.note}"
                        </p>
                      </div>
                    )}

                    {log.photoUrls && log.photoUrls.length > 0 && (
                      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                        {log.photoUrls.map((url, i) => (
                          <img
                            key={i}
                            src={url}
                            alt={`Log photo ${i}`}
                            className="h-16 w-16 md:h-20 md:w-20 object-cover rounded-lg border border-divider shadow-sm shrink-0"
                          />
                        ))}
                      </div>
                    )}

                    {canEditOrDeleteLog(user, log) && (
                      <div className="mt-4 pt-3 flex items-center justify-end gap-2 border-t border-divider/50">
                        <button
                          onClick={() => setLogToEdit(log)}
                          className="text-xs font-bold text-ink-muted hover:text-primary flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-[#F3E8D2] transition"
                        >
                          <Edit2 className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button
                          onClick={() => setLogToDelete(log)}
                          className="text-xs font-bold text-ink-muted hover:text-red-500 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-red-50 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-surface rounded-3xl p-6 border border-divider shadow-[0_10px_40px_rgba(0,0,0,0.03)] border-t-4 border-t-primary">
              <span className="text-[10px] font-black uppercase tracking-widest text-ink-muted block pb-4 mb-4 border-b border-divider">
                Site-wide Rollup
              </span>

              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-bold text-ink-muted">
                    Total Workforce
                  </span>
                </div>
                <span className="text-3xl font-black text-ink font-mono tracking-tight">
                  {totalLabor}
                </span>
                <span className="text-xs font-bold text-ink-muted uppercase tracking-widest ml-2 block mt-1">
                  Deployed
                </span>
              </div>

              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-[#F3E8D2] text-primary flex items-center justify-center shrink-0">
                    <Box className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-bold text-ink-muted">
                    Materials Consumed
                  </span>
                </div>
                {materialsRollup.length === 0 ? (
                  <span className="text-xs text-ink-muted font-medium italic block">
                    No materials logged today.
                  </span>
                ) : (
                  <ul className="space-y-2">
                    {materialsRollup.map((m, i) => (
                      <li
                        key={i}
                        className="flex justify-between border-b border-divider/50 pb-2 last:border-0 last:pb-0"
                      >
                        <span className="text-xs font-bold text-ink/80 truncate pr-2">
                          {m.name}
                        </span>
                        <span className="text-xs font-mono font-bold text-ink shrink-0">
                          {m.count}{" "}
                          <span className="text-[9px] text-ink-muted uppercase">
                            {m.unit}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {logModalOpen && (
        <DailyLogEntryScreen
          projectId={projectId}
          taskId={null}
          initialDate={selectedDate}
          onClose={() => setLogModalOpen(false)}
        />
      )}

      {logToEdit && (
        <DailyLogEntryScreen
          projectId={projectId}
          taskId={logToEdit.taskId}
          editLog={logToEdit}
          onClose={() => setLogToEdit(null)}
        />
      )}

      {logToDelete && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-sm rounded-[32px] p-8 shadow-2xl relative">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6 mx-auto">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-center text-ink mb-2">
              Delete Log Entry?
            </h3>
            <p className="text-sm font-medium text-ink-muted text-center mb-8">
              This will update the task's progress, dates, and material/labour
              rollups. This action cannot be undone.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setLogToDelete(null)}
                className="py-3.5 px-6 rounded-2xl font-bold bg-panel hover:bg-divider text-ink transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="py-3.5 px-6 rounded-2xl font-bold bg-red-500 hover:bg-red-600 text-white transition shadow-[0_4px_20px_rgba(239,68,68,0.3)] cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
