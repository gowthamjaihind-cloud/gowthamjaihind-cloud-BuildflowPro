import React, { useState } from "react";
import {
  useDailyLogsQuery,
  useDeleteDailyLog,
  canEditOrDeleteLog,
} from "../hooks/useDailyLogs";
import { format } from "date-fns";
import {
  Clock,
  Cube as Box,
  Users,
  Truck,
  ChatText as MessageSquare,
  PencilSimple as Edit2,
  Trash as Trash2,
} from "@phosphor-icons/react";
import { DailyLogEntryScreen } from "./DailyLogEntryScreen";
import { DailyLogEntry } from "../types";
import { useAuthStore } from "../store";
import { useTranslation } from "../i18n";
import { toast } from "../lib/feedback";

interface DailyLogHistoryProps {
  projectId: string;
  taskId: string;
}

export const DailyLogHistory: React.FC<DailyLogHistoryProps> = ({
  projectId,
  taskId,
}) => {
  const { t } = useTranslation();
  const { data: logs = [], isLoading } = useDailyLogsQuery(projectId, taskId);
  const [logToEdit, setLogToEdit] = useState<DailyLogEntry | null>(null);
  const [logToDelete, setLogToDelete] = useState<DailyLogEntry | null>(null);

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
      toast.error(t("dlh.failedDelete"));
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 text-center text-ink-muted animate-pulse">
        {t("dlh.loading")}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="p-8 text-center bg-panel border border-divider rounded-2xl">
        <p className="text-ink-muted text-sm font-bold">{t("dlh.noWork")}</p>
        <p className="text-[10px] text-ink-muted/70 mt-1">
          {t("dlh.noWorkHint")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {logs.map((log, index) => (
        <div
          key={`${log.id}-${index}`}
          className="bg-surface p-5 rounded-2xl border border-divider shadow-sm relative overflow-hidden"
        >
          {log.markComplete ? (
            <div
              className="absolute top-0 right-0 border-b-[32px] border-l-[32px] border-b-transparent border-l-emerald-500 w-0 h-0"
              title={t("dlh.markedComplete")}
            ></div>
          ) : null}

          <div className="flex justify-between items-start mb-3">
            <div>
              <span className="text-sm font-black text-ink block">
                {format(new Date(log.workDate), "MMM d, yyyy")}
              </span>
              <span className="text-[10px] font-bold text-ink-muted uppercase tracking-widest flex items-center gap-1 mt-0.5">
                {t("dlh.loggedBy", { name: log.createdByName })}
              </span>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-primary font-mono tracking-tighter leading-none">
                {log.progressPercent}%
              </span>
              <span className="text-[10px] font-bold text-ink-muted uppercase tracking-widest block text-right mt-1">
                {t("dlh.cumProgress")}
              </span>
            </div>
          </div>

          {(log.materials.length > 0 || log.labour.length > 0 || (log.equipment?.length ?? 0) > 0) && (
            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-divider/50">
              {log.materials.length > 0 && (
                <div>
                  <span className="text-[10px] font-bold text-ink-muted uppercase tracking-widest flex flex-wrap items-center gap-1 mb-1.5 opacity-70">
                    <Box className="w-3 h-3" /> {t("dlh.materials")}
                  </span>
                  <ul className="space-y-1">
                    {log.materials.map((m, i) => (
                      <li
                        key={i}
                        className="text-[10px] font-bold text-ink/80 flex justify-between"
                      >
                        <span className="truncate pr-2">{m.name}</span>
                        <span className="font-mono">
                          {m.quantity}{" "}
                          <span className="text-[10px] text-ink-muted">
                            {m.unit}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {log.labour.length > 0 && (
                <div>
                  <span className="text-[10px] font-bold text-ink-muted uppercase tracking-widest flex flex-wrap items-center gap-1 mb-1.5 opacity-70">
                    <Users className="w-3 h-3" /> {t("dlh.labor")}
                  </span>
                  <ul className="space-y-1">
                    {log.labour.map((l, i) => (
                      <li
                        key={i}
                        className="text-[10px] font-bold text-ink/80 flex justify-between"
                      >
                        <span className="truncate pr-2">{l.roleName}</span>
                        <span className="font-mono">{l.headcount}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(log.equipment?.length ?? 0) > 0 && (
                <div>
                  <span className="text-[10px] font-bold text-ink-muted uppercase tracking-widest flex flex-wrap items-center gap-1 mb-1.5 opacity-70">
                    <Truck className="w-3 h-3" /> {t("dlh.equipment")}
                  </span>
                  <ul className="space-y-1">
                    {log.equipment!.map((eq, i) => (
                      <li
                        key={i}
                        className="text-[10px] font-bold text-ink/80 flex justify-between"
                      >
                        <span className="truncate pr-2">{eq.name}</span>
                        <span className="font-mono whitespace-nowrap">
                          {eq.quantity}{" "}
                          <span className="text-[10px] text-ink-muted">
                            {eq.unit === "days" ? t("dlog.days") : t("dlog.hrs")}
                          </span>
                          {eq.cost ? (
                            <span className="text-ink-muted">
                              {" "}· ₹{eq.cost.toLocaleString("en-IN")}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {log.note && (
            <div className="mt-4 bg-amber-50/50 p-3 rounded-xl border border-primary/20 flex gap-2 items-start text-[#5E2F1B]">
              <MessageSquare className="w-4 h-4 shrink-0 mt-0.5 text-rust-strong opacity-60" />
              <p className="text-[10px] font-medium leading-relaxed italic">
                {log.note}
              </p>
            </div>
          )}

          {canEditOrDeleteLog(user, log) && (
            <div className="mt-4 pt-3 flex items-center justify-end gap-2 border-t border-divider/50">
              <button
                onClick={() => setLogToEdit(log)}
                className="text-xs font-bold text-ink-muted hover:text-primary flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-[#F7E4DB] transition"
              >
                <Edit2 className="w-3.5 h-3.5" /> {t("common.edit")}
              </button>
              <button
                onClick={() => setLogToDelete(log)}
                className="text-xs font-bold text-ink-muted hover:text-danger flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-danger/8 transition"
              >
                <Trash2 className="w-3.5 h-3.5" /> {t("common.delete")}
              </button>
            </div>
          )}
        </div>
      ))}

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
            <div className="w-16 h-16 bg-danger/8 text-danger rounded-full flex items-center justify-center mb-6 mx-auto">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-center text-ink mb-2">
              {t("dlh.deleteTitle")}
            </h3>
            <p className="text-sm font-medium text-ink-muted text-center mb-8">
              {t("dlh.deleteBody")}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setLogToDelete(null)}
                className="py-3.5 px-6 rounded-2xl font-bold bg-panel hover:bg-divider text-ink transition cursor-pointer"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleDelete}
                className="py-3.5 px-6 rounded-2xl font-bold bg-danger hover:bg-danger text-white transition shadow-[0_4px_20px_rgba(239,68,68,0.3)] cursor-pointer"
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
