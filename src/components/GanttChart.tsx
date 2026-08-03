import React, { useMemo, useState, useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useBreakpoint } from "../hooks/useBreakpoint";
import {
  format,
  differenceInDays,
  addDays,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  startOfWeek,
  endOfWeek,
  eachWeekOfInterval,
  eachMonthOfInterval,
} from "date-fns";
import { Task, DependencyType, TaskDependency } from "../types";
import { motion, AnimatePresence } from "motion/react";
import {
  MagnifyingGlassPlus as ZoomIn,
  MagnifyingGlassMinus as ZoomOut,
  Pulse as Activity,
  Flag,
  Tag,
  Funnel as Filter,
  Rows,
} from "@phosphor-icons/react";

type GroupBy = "hierarchy" | "phase" | "location" | "status" | "tag";

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "hierarchy", label: "Hierarchy" },
  { value: "phase", label: "Phase" },
  { value: "location", label: "Location" },
  { value: "status", label: "Status" },
  { value: "tag", label: "Tag" },
];

interface GanttChartProps {
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
  onAddDependency?: (
    fromId: string,
    toId: string,
    type: DependencyType,
  ) => void;
  onTaskUpdate?: (task: Task) => void;
}

type ZoomLevel = "day" | "week" | "month";

export const GanttChart: React.FC<GanttChartProps> = ({
  tasks,
  onTaskClick,
  onAddDependency,
  onTaskUpdate,
}) => {
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("day");
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [filterTag, setFilterTag] = useState<string>("");
  const [groupBy, setGroupBy] = useState<GroupBy>("hierarchy");

  // Dependency Linking State
  const [linkingFrom, setLinkingFrom] = useState<{
    taskId: string;
    x: number;
    y: number;
  } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const breakpoint = useBreakpoint();
  const containerRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const [hoveredTask, setHoveredTask] = useState<{
    task: Task;
    x: number;
    y: number;
  } | null>(null);

  const [dragState, setDragState] = useState<{
    taskId: string;
    type: "move" | "resizeStart" | "resizeEnd";
    initialX: number;
    initialStartDate: string;
    initialEndDate: string;
    currentDeltaDays: number;
  } | null>(null);

  useEffect(() => {
    const processMove = (clientX: number) => {
      if (!dragState) return;
      const scale = zoomLevel === "day" ? 1 : zoomLevel === "week" ? 7 : 30;
      const baseWidths = { day: 40, week: 100, month: 200 };
      const breakpointMultiplier =
        breakpoint === "mobile" ? 1 : breakpoint === "tablet" ? 1.15 : 1;
      const dayWidth = Math.round(baseWidths[zoomLevel] * breakpointMultiplier);

      let deltaX = clientX - dragState.initialX;
      let deltaDays = Math.round((deltaX / dayWidth) * scale);

      setDragState((prev) =>
        prev ? { ...prev, currentDeltaDays: deltaDays } : null,
      );
    };

    const handleGlobalMouseMove = (e: MouseEvent) => processMove(e.clientX);
    const handleGlobalTouchMove = (e: TouchEvent) =>
      processMove(e.touches[0].clientX);

    const processEnd = () => {
      if (dragState) {
        if (dragState.currentDeltaDays !== 0) {
          const task = tasks.find((t) => t.id === dragState.taskId);
          if (task && onTaskUpdate) {
            const newStart = addDays(
              new Date(dragState.initialStartDate),
              dragState.type === "resizeEnd" ? 0 : dragState.currentDeltaDays,
            );
            const newEnd = addDays(
              new Date(dragState.initialEndDate),
              dragState.type === "resizeStart" ? 0 : dragState.currentDeltaDays,
            );
            onTaskUpdate({
              ...task,
              startDate: newStart.toISOString().split("T")[0],
              endDate: newEnd.toISOString().split("T")[0],
            });
          }
        }
        setDragState(null);
      }
    };

    const handleGlobalMouseUp = () => processEnd();
    const handleGlobalTouchEnd = () => processEnd();

    if (dragState) {
      window.addEventListener("mousemove", handleGlobalMouseMove);
      window.addEventListener("mouseup", handleGlobalMouseUp);
      window.addEventListener("touchmove", handleGlobalTouchMove);
      window.addEventListener("touchend", handleGlobalTouchEnd);
      window.addEventListener("touchcancel", handleGlobalTouchEnd);
      return () => {
        window.removeEventListener("mousemove", handleGlobalMouseMove);
        window.removeEventListener("mouseup", handleGlobalMouseUp);
        window.removeEventListener("touchmove", handleGlobalTouchMove);
        window.removeEventListener("touchend", handleGlobalTouchEnd);
        window.removeEventListener("touchcancel", handleGlobalTouchEnd);
      };
    }
  }, [dragState, zoomLevel, tasks, onTaskUpdate, breakpoint]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (linkingFrom && rowsRef.current) {
      const rect = rowsRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left + rowsRef.current.scrollLeft,
        y: e.clientY - rect.top + rowsRef.current.scrollTop,
      });
    }
  };

  const handleMouseUp = () => {
    setLinkingFrom(null);
    setMousePos(null);
  };

  useEffect(() => {
    if (linkingFrom) {
      window.addEventListener("mouseup", handleMouseUp);
      return () => window.removeEventListener("mouseup", handleMouseUp);
    }
  }, [linkingFrom]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    tasks.forEach((t) => t.activityCodes?.forEach((tag) => tags.add(tag)));
    return Array.from(tags);
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const validBaseTasks = tasks.filter((t) => {
      if (!t.startDate || !t.endDate) return false;
      const start = new Date(t.startDate);
      const end = new Date(t.endDate);
      return !isNaN(start.getTime()) && !isNaN(end.getTime());
    });

    const baseTasks = filterTag
      ? validBaseTasks.filter((t) => t.activityCodes?.includes(filterTag))
      : validBaseTasks;

    if (filterTag) return baseTasks;

    // Build hierarchical flat list
    const flattened: Task[] = [];
    const seen = new Set<string>();

    const flatten = (parentId: string | null) => {
      const children = baseTasks
        .filter((t) => t.parentId === parentId)
        .sort(
          (a, b) =>
            new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
        );

      children.forEach((child) => {
        if (!seen.has(child.id)) {
          seen.add(child.id);
          flattened.push(child);
          flatten(child.id);
        }
      });
    };

    flatten(null);

    // Add any orphaned tasks
    baseTasks.forEach((t) => {
      if (!seen.has(t.id)) {
        flattened.push(t);
        seen.add(t.id);
      }
    });

    return flattened;
  }, [tasks, filterTag]);

  const { startDate, endDate, days, timeline } = useMemo(() => {
    if (filteredTasks.length === 0) {
      const today = new Date();
      return {
        startDate: today,
        endDate: addDays(today, 30),
        days: 30,
        timeline: eachDayOfInterval({ start: today, end: addDays(today, 30) }),
      };
    }

    const startDates = filteredTasks.map((t) => new Date(t.startDate));
    const endDates = filteredTasks.map((t) => new Date(t.endDate));

    const minStart = new Date(Math.min(...startDates.map((d) => d.getTime())));
    const maxEnd = new Date(Math.max(...endDates.map((d) => d.getTime())));

    let start = startOfMonth(minStart);
    let end = endOfMonth(addDays(maxEnd, 7));

    if (zoomLevel === "week") {
      start = startOfWeek(start);
      end = endOfWeek(end);
    } else if (zoomLevel === "month") {
      start = startOfMonth(start);
      end = endOfMonth(addDays(end, 30));
    }

    const timelineInterval =
      zoomLevel === "day"
        ? eachDayOfInterval({ start, end })
        : zoomLevel === "week"
          ? eachWeekOfInterval({ start, end })
          : eachMonthOfInterval({ start, end });

    return {
      startDate: start,
      endDate: end,
      days: differenceInDays(end, start) + 1,
      timeline: timelineInterval,
    };
  }, [filteredTasks, zoomLevel]);

  const baseWidths = { day: 40, week: 100, month: 200 };
  const breakpointMultiplier =
    breakpoint === "mobile" ? 1 : breakpoint === "tablet" ? 1.15 : 1;
  const dayWidth = Math.round(baseWidths[zoomLevel] * breakpointMultiplier);
  const nameColWidth =
    breakpoint === "mobile" ? 100 : breakpoint === "tablet" ? 200 : 250;

  // Rows shown in the chart. In "hierarchy" mode each row is a task (the WBS
  // parent→child order from filteredTasks). In any other mode the tasks are
  // re-bucketed by the chosen key and each bucket gets a group-header row.
  type Row =
    | { kind: "task"; task: Task }
    | { kind: "group"; key: string; label: string; count: number };

  const rows = useMemo<Row[]>(() => {
    if (groupBy === "hierarchy") {
      return filteredTasks.map((task) => ({ kind: "task", task }));
    }
    const keyOf = (t: Task) => {
      switch (groupBy) {
        case "phase":
          return t.phase || "Unassigned Phase";
        case "location":
          return t.location || "No Location";
        case "status":
          return t.status || "No Status";
        case "tag":
          return t.activityCodes?.[0] || "Untagged";
        default:
          return "";
      }
    };
    const groups = new Map<string, Task[]>();
    filteredTasks.forEach((t) => {
      const k = keyOf(t);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(t);
    });
    const result: Row[] = [];
    Array.from(groups.keys())
      .sort((a, b) => a.localeCompare(b))
      .forEach((k) => {
        const groupTasks = groups
          .get(k)!
          .sort(
            (a, b) =>
              new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
          );
        result.push({
          kind: "group",
          key: k,
          label: k,
          count: groupTasks.length,
        });
        groupTasks.forEach((task) => result.push({ kind: "task", task }));
      });
    return result;
  }, [filteredTasks, groupBy]);

  // Row index of each task within `rows` — used to position bars and the
  // dependency-arrow endpoints (every row, header or task, is 48px tall).
  const taskRowIndex = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => {
      if (r.kind === "task") m.set(r.task.id, i);
    });
    return m;
  }, [rows]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 48,
    overscan: 10,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row items-center justify-between bg-surface p-3 md:p-4 rounded-xl border shadow-sm gap-4">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="flex bg-panel p-1 rounded-lg w-full sm:w-auto">
            {(["day", "week", "month"] as ZoomLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => setZoomLevel(level)}
                className={`flex-1 sm:flex-none px-3 py-1.5 text-[10px] sm:text-xs font-bold rounded-md transition-all ${
                  zoomLevel === level
                    ? "bg-surface text-[#D97D54] shadow-sm"
                    : "text-ink-muted hover:text-ink/80"
                }`}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
          <div className="hidden sm:block h-4 w-px bg-divider mx-1" />
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => setShowCriticalPath(!showCriticalPath)}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${
                showCriticalPath
                  ? "bg-[#EF4444]/8 text-[#EF4444] border border-[#EF4444]/20"
                  : "bg-panel text-ink border border-divider"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span className="truncate">Critical Path</span>
            </button>
            <div className="flex-1 sm:flex-none flex items-center gap-2 bg-panel px-3 py-2 rounded-lg border">
              <Rows className="w-3.5 h-3.5 text-ink-muted shrink-0" />
              <select
                className="bg-transparent text-[10px] sm:text-xs font-bold outline-none w-full"
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                aria-label="Group tasks by"
              >
                {GROUP_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    Group: {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 sm:flex-none flex items-center gap-2 bg-panel px-3 py-2 rounded-lg border">
              <Filter className="w-3.5 h-3.5 text-ink-muted shrink-0" />
              <select
                className="bg-transparent text-[10px] sm:text-xs font-bold outline-none w-full"
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
              >
                <option value="">Tag Filter</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2 text-[10px] font-bold text-ink-muted uppercase tracking-wider">
          <ZoomOut className="w-3 h-3" />
          Zoom Navigation
          <ZoomIn className="w-3 h-3" />
        </div>
      </div>

      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        className="overflow-x-auto border rounded-xl bg-surface shadow-sm scrollbar-hide select-none"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div
          style={{ width: timeline.length * dayWidth + nameColWidth }}
          className="relative"
        >
          {/* Header */}
          <div className="flex border-b bg-panel sticky top-0 z-30">
            <div className="w-[100px] sm:w-[180px] lg:w-[250px] p-4 font-semibold border-r bg-panel sticky left-0 z-40">
              Task Name
            </div>
            <div className="flex">
              {timeline.map((date, i) => (
                <div
                  key={i}
                  className={`p-2 text-[10px] text-center border-r flex flex-col items-center justify-center ${
                    zoomLevel === "day" && [0, 6].includes(date.getDay())
                      ? "bg-panel"
                      : ""
                  }`}
                  style={{ width: dayWidth }}
                >
                  <span className="opacity-50 uppercase">
                    {zoomLevel === "day"
                      ? format(date, "EEE")
                      : zoomLevel === "week"
                        ? "Week"
                        : format(date, "MMM")}
                  </span>
                  <span className="font-bold">
                    {zoomLevel === "day"
                      ? format(date, "d")
                      : zoomLevel === "week"
                        ? format(date, "d")
                        : format(date, "yyyy")}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Rows */}
          <div
            className="relative"
            ref={rowsRef}
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {/* Dependency Lines */}
            <svg
              className="absolute inset-0 pointer-events-none z-0"
              style={{
                width: timeline.length * dayWidth + nameColWidth,
                height: rowVirtualizer.getTotalSize(),
              }}
            >
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="6"
                  markerHeight="4"
                  refX="6"
                  refY="2"
                  orient="auto"
                >
                  <path d="M0,0 L6,2 L0,4 Z" fill="#C8D1D3" />
                </marker>
                <marker
                  id="arrowhead-critical"
                  markerWidth="6"
                  markerHeight="4"
                  refX="6"
                  refY="2"
                  orient="auto"
                >
                  <path d="M0,0 L6,2 L0,4 Z" fill="#EF4444" />
                </marker>
                <marker
                  id="arrowhead-linking"
                  markerWidth="6"
                  markerHeight="4"
                  refX="6"
                  refY="2"
                  orient="auto"
                >
                  <path d="M0,0 L6,2 L0,4 Z" fill="#6E8CA0" />
                </marker>
              </defs>
              {filteredTasks.map((task) => {
                const taskIndex = taskRowIndex.get(task.id);
                if (taskIndex === undefined) return null;
                const deps =
                  task.advancedDependencies ||
                  (task.dependencies || []).map((id) => ({
                    id,
                    type: "FS" as DependencyType,
                    lag: 0,
                  }));

                return deps.map((dep, depIdx) => {
                  const depTask = tasks.find((t) => t.id === dep.id);
                  if (!depTask) return null;
                  const depIndex = taskRowIndex.get(depTask.id);
                  if (depIndex === undefined) return null;

                  const isCritical =
                    showCriticalPath && task.isCritical && depTask.isCritical;
                  const scale =
                    zoomLevel === "day" ? 1 : zoomLevel === "week" ? 7 : 30;

                  // Calculate coordinates based on dependency type
                  let x1, x2;
                  const depStart =
                    (differenceInDays(new Date(depTask.startDate), startDate) /
                      scale) *
                      dayWidth +
                    nameColWidth;
                  const depEnd =
                    (differenceInDays(new Date(depTask.endDate), startDate) /
                      scale +
                      1 / scale) *
                      dayWidth +
                    nameColWidth;
                  const taskStart =
                    (differenceInDays(new Date(task.startDate), startDate) /
                      scale) *
                      dayWidth +
                    nameColWidth;
                  const taskEnd =
                    (differenceInDays(new Date(task.endDate), startDate) /
                      scale +
                      1 / scale) *
                      dayWidth +
                    nameColWidth;

                  switch (dep.type) {
                    case "FS":
                      x1 = depEnd;
                      x2 = taskStart;
                      break;
                    case "SS":
                      x1 = depStart;
                      x2 = taskStart;
                      break;
                    case "FF":
                      x1 = depEnd;
                      x2 = taskEnd;
                      break;
                    case "SF":
                      x1 = depStart;
                      x2 = taskEnd;
                      break;
                    default:
                      x1 = depEnd;
                      x2 = taskStart;
                  }

                  const y1 = depIndex * 48 + 24;
                  const y2 = taskIndex * 48 + 24;

                  const midX = x1 + (x2 > x1 ? 20 : -20);
                  return (
                    <path
                      key={`dep-${dep.id}-${task.id}-${depIdx}`}
                      d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke={isCritical ? "#EF4444" : "#6E8CA0"}
                      strokeWidth={isCritical ? "2.5" : "1.5"}
                      strokeDasharray={dep.type !== "FS" ? "4 4" : "none"}
                      markerEnd={
                        isCritical
                          ? "url(#arrowhead-critical)"
                          : "url(#arrowhead)"
                      }
                      className="transition-all duration-300"
                    />
                  );
                });
              })}

              {/* Linking Preview Line */}
              {linkingFrom && mousePos && (
                <path
                  d={`M ${linkingFrom.x} ${linkingFrom.y} L ${mousePos.x} ${mousePos.y}`}
                  fill="none"
                  stroke="#6E8CA0"
                  strokeWidth="2"
                  strokeDasharray="4 2"
                  markerEnd="url(#arrowhead-linking)"
                />
              )}
            </svg>

            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];

              if (row.kind === "group") {
                return (
                  <div
                    key={`group-${row.key}`}
                    className="absolute top-0 left-0 flex items-center border-b border-divider bg-panel w-full z-[15]"
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className="sticky left-0 flex items-center gap-2.5 px-3 sm:px-4 h-full">
                      <Rows className="w-3.5 h-3.5 text-rust-strong shrink-0" />
                      <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-ink truncate">
                        {row.label}
                      </span>
                      <span className="text-[9px] font-bold text-ink-muted bg-surface border border-divider px-1.5 py-0.5 rounded-full shrink-0">
                        {row.count}
                      </span>
                    </div>
                  </div>
                );
              }

              const task = row.task;
              const taskStart = new Date(task.startDate);
              const taskEnd = new Date(task.endDate);
              const scale =
                zoomLevel === "day" ? 1 : zoomLevel === "week" ? 7 : 30;

              const isDraggingThis = dragState?.taskId === task.id;
              const currentDeltaDays = isDraggingThis
                ? dragState.currentDeltaDays
                : 0;

              const displayStart = addDays(
                taskStart,
                isDraggingThis && dragState.type !== "resizeEnd"
                  ? currentDeltaDays
                  : 0,
              );
              const displayEnd = addDays(
                taskEnd,
                isDraggingThis && dragState.type !== "resizeStart"
                  ? currentDeltaDays
                  : 0,
              );

              const left =
                (differenceInDays(displayStart, startDate) / scale) * dayWidth;
              const width =
                ((differenceInDays(displayEnd, displayStart) + 1) / scale) *
                dayWidth;
              const isCritical = showCriticalPath && task.isCritical;

              return (
                <div
                  key={task.id}
                  className="absolute top-0 left-0 flex border-b group hover:bg-panel transition-colors z-10 w-full"
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="w-[100px] sm:w-[180px] lg:w-[250px] p-2 sm:p-4 border-r text-[9px] sm:text-xs md:text-sm flex items-center gap-3 bg-surface group-hover:bg-panel sticky left-0 z-20 shadow-[4px_0_10px_-4px_rgba(0,0,0,0.05)] apple-transition h-full">
                    <div
                      className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full flex-shrink-0 ${
                        task.type === "Milestone"
                          ? "bg-gradient-to-br from-[#E1946F] to-[#D97D54] rotate-45 shadow-sm"
                          : task.type === "Summary"
                            ? "bg-[#465D6E] shadow-sm"
                            : isCritical
                              ? "bg-gradient-to-r from-[#EF4444] to-[#DC2626] shadow-[0_0_10px_rgba(239,68,68,0.4)]"
                              : "bg-[#D97D54] shadow-sm"
                      }`}
                    />
                    <div className="flex flex-col min-w-0">
                      <span
                        className={`truncate font-medium ${isCritical ? "text-[#EF4444] font-bold" : "text-ink"}`}
                      >
                        {task.name}
                      </span>
                      <span className="text-[9px] text-ink-muted truncate hidden sm:block">
                        {format(taskStart, "MMM d")} -{" "}
                        {format(taskEnd, "MMM d")}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 relative h-12">
                    {/* Grid Lines */}
                    <div className="absolute inset-0 flex pointer-events-none">
                      {timeline.map((_, i) => (
                        <div
                          key={i}
                          className="border-r h-full opacity-10"
                          style={{ width: dayWidth }}
                        />
                      ))}
                    </div>

                    {/* Task Bar */}
                    <div
                      className={`absolute top-2.5 h-7 rounded-lg flex items-center px-1.5 text-[10px] text-white font-medium overflow-visible shadow-sm hover:shadow-md transition-shadow group/bar ${isDraggingThis ? "opacity-70 ring-2 ring-[#D97D54] ring-offset-1" : ""} ${
                        task.type === "Milestone"
                          ? "bg-gradient-to-br from-[#E1946F] to-[#D97D54] w-7 !rounded-sm rotate-45 justify-center border-2 border-white cursor-pointer"
                          : task.type === "Summary"
                            ? "bg-[#465D6E] cursor-pointer"
                            : isCritical
                              ? "bg-gradient-to-r from-[#EF4444] to-[#DC2626] cursor-move"
                              : "bg-[#D97D54] cursor-move"
                      }`}
                      style={{
                        left: left,
                        width:
                          task.type === "Milestone" ? 28 : Math.max(width, 4),
                      }}
                      onMouseDown={(e) => {
                        if (task.type === "Summary") return;
                        e.stopPropagation();
                        setDragState({
                          taskId: task.id,
                          type: "move",
                          initialX: e.clientX,
                          initialStartDate: task.startDate,
                          initialEndDate: task.endDate,
                          currentDeltaDays: 0,
                        });
                      }}
                      onClick={(e) => {
                        // For touch devices, show popup on tap
                        if (breakpoint === "mobile") {
                          setHoveredTask({
                            task,
                            x: e.clientX,
                            y: e.clientY,
                          });
                          setTimeout(() => setHoveredTask(null), 3000);
                        }
                      }}
                      onMouseEnter={(e) => {
                        if (breakpoint !== "mobile") {
                          setHoveredTask({
                            task,
                            x: e.clientX,
                            y: e.clientY,
                          });
                        }
                      }}
                      onMouseMove={(e) => {
                        if (breakpoint !== "mobile") {
                          setHoveredTask({
                            task,
                            x: e.clientX,
                            y: e.clientY,
                          });
                        }
                      }}
                      onMouseLeave={() => setHoveredTask(null)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onTaskClick?.(task);
                      }}
                    >
                      {/* Linking Start Handle (Left Circle) */}
                      <div
                        className="absolute -left-3 top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-[#D97D54] rounded-full opacity-0 group-hover/bar:opacity-100 z-30 cursor-crosshair transition-opacity scale-75 hover:scale-100 shadow-sm"
                        title="Link to this task"
                        onMouseUp={(e) => {
                          if (linkingFrom && linkingFrom.taskId !== task.id) {
                            onAddDependency?.(
                              linkingFrom.taskId,
                              task.id,
                              "FS",
                            );
                            e.stopPropagation();
                          }
                        }}
                      />

                      {/* Resize Start Handle */}
                      {task.type !== "Milestone" && task.type !== "Summary" && (
                        <div
                          className="absolute left-0 top-0 bottom-0 w-3 md:w-4 hover:bg-white/30 z-20 cursor-ew-resize transition-colors rounded-l-lg"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragState({
                              taskId: task.id,
                              type: "resizeStart",
                              initialX: e.clientX,
                              initialStartDate: task.startDate,
                              initialEndDate: task.endDate,
                              currentDeltaDays: 0,
                            });
                          }}
                        />
                      )}

                      {/* Linking End Handle (Right Circle) */}
                      <div
                        className="absolute -right-3 top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-[#D97D54] rounded-full opacity-0 group-hover/bar:opacity-100 z-30 cursor-crosshair transition-opacity scale-75 hover:scale-100 shadow-sm"
                        title="Drag to link to another task"
                        onMouseDown={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const rowsRect =
                            rowsRef.current?.getBoundingClientRect();
                          if (rowsRect) {
                            setLinkingFrom({
                              taskId: task.id,
                              x:
                                rect.right -
                                rowsRect.left +
                                (rowsRef.current?.scrollLeft || 0),
                              y:
                                rect.top +
                                rect.height / 2 -
                                rowsRect.top +
                                (rowsRef.current?.scrollTop || 0),
                            });
                            setMousePos({
                              x:
                                rect.right -
                                rowsRect.left +
                                (rowsRef.current?.scrollLeft || 0),
                              y:
                                rect.top +
                                rect.height / 2 -
                                rowsRect.top +
                                (rowsRef.current?.scrollTop || 0),
                            });
                          }
                          e.stopPropagation();
                        }}
                      />

                      {/* Resize End Handle */}
                      {task.type !== "Milestone" && task.type !== "Summary" && (
                        <div
                          className="absolute right-0 top-0 bottom-0 w-3 md:w-4 hover:bg-white/30 z-20 cursor-ew-resize transition-colors rounded-r-lg"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragState({
                              taskId: task.id,
                              type: "resizeEnd",
                              initialX: e.clientX,
                              initialStartDate: task.startDate,
                              initialEndDate: task.endDate,
                              currentDeltaDays: 0,
                            });
                          }}
                        />
                      )}

                      {task.type === "Milestone" ? (
                        <div className="-rotate-45 flex items-center justify-center pointer-events-none">
                          <Flag className="w-3.5 h-3.5 text-white filter drop-shadow-sm" />
                        </div>
                      ) : (
                        <>
                          <div
                            className="absolute left-0 top-0 bottom-0 bg-onyx/20 backdrop-blur-[1px] transition-all pointer-events-none rounded-l-lg"
                            style={{ width: `${task.progress}%` }}
                          />
                          <div className="relative z-10 flex items-center justify-between w-full px-1 pointer-events-none overflow-hidden">
                            {width > 60 && (
                              <span className="truncate font-semibold drop-shadow-md">
                                {task.name}
                              </span>
                            )}
                            {width > 30 && (
                              <span className="ml-auto font-bold opacity-90 drop-shadow-md">
                                {task.progress}%
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tooltip */}
      <AnimatePresence>
        {hoveredTask && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={`fixed z-50 w-64 bg-onyx/95 backdrop-blur-md text-white rounded-xl shadow-2xl border border-divider p-4 ${breakpoint === "mobile" ? "pointer-events-auto" : "pointer-events-none"}`}
            style={{
              left: hoveredTask.x + 15,
              top: hoveredTask.y + 15,
            }}
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-bold text-sm leading-tight text-white">
                  {hoveredTask.task.name}
                </h4>
                {hoveredTask.task.type === "Milestone" ? (
                  <span className="shrink-0 inline-flex items-center justify-center bg-amber-500/20 text-[#F0C6B2] rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase">
                    Milestone
                  </span>
                ) : (
                  <span className="shrink-0 font-mono text-xs font-bold text-fossil">
                    {hoveredTask.task.progress}%
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-800/80 p-2 rounded-lg">
                  <div className="text-[9px] text-ink-muted/80 uppercase tracking-widest font-bold mb-1">
                    Start
                  </div>
                  <div className="font-medium text-fossil">
                    {format(
                      new Date(hoveredTask.task.startDate),
                      "MMM d, yyyy",
                    )}
                  </div>
                </div>
                <div className="bg-slate-800/80 p-2 rounded-lg">
                  <div className="text-[9px] text-ink-muted/80 uppercase tracking-widest font-bold mb-1">
                    End
                  </div>
                  <div className="font-medium text-fossil">
                    {format(new Date(hoveredTask.task.endDate), "MMM d, yyyy")}
                  </div>
                </div>
              </div>

              {hoveredTask.task.activityCodes &&
                hoveredTask.task.activityCodes.length > 0 && (
                  <div className="pt-1">
                    <div className="flex flex-wrap gap-1.5">
                      {hoveredTask.task.activityCodes.map((code) => (
                        <span
                          key={code}
                          className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#3A4F5F] border border-[#465D6E] text-[10px] text-fossil"
                        >
                          {code}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              {breakpoint === "mobile" && (
                <button
                  className="w-full mt-2 py-1.5 bg-[#D97D54] hover:bg-[#B85F3B] text-white text-xs font-bold rounded-lg pointer-events-auto"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHoveredTask(null);
                    onTaskClick?.(hoveredTask.task);
                  }}
                >
                  Edit Task
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
