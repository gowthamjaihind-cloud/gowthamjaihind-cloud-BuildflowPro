import React, { useMemo, useEffect, useRef } from 'react';
import { ScheduleTask } from '../../hooks/useScheduleData';
import { format, isToday, startOfDay, addDays, isWithinInterval } from 'date-fns';

interface Props {
  tasks: ScheduleTask[];
}

export const VerticalTimeline: React.FC<Props> = ({ tasks }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const groupedTasks = useMemo(() => {
    const today = startOfDay(new Date());

    const groups: Record<string, ScheduleTask[]> = {};

    tasks.forEach(task => {
      const start = startOfDay(task.startDate);
      let mappedDate = start;
      if (task.status === 'in_progress') {
        mappedDate = today;
      }

      const key = mappedDate.toISOString();
      if (!groups[key]) groups[key] = [];
      groups[key].push(task);
    });

    return Object.keys(groups)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
      .map(key => ({
        date: new Date(key),
        tasks: groups[key]
      }));
  }, [tasks]);

  useEffect(() => {
    if (containerRef.current) {
      const todayEl = containerRef.current.querySelector('[data-today="true"]');
      if (todayEl) {
        todayEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [groupedTasks]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done': return 'bg-[var(--ok)]';
      case 'in_progress': return 'bg-[var(--acc)] shadow-[0_0_8px_var(--acc)]';
      case 'blocked': return 'bg-[var(--risk)]';
      case 'scheduled': default: return 'border-[2px] border-[var(--edge)] bg-[var(--bg)]';
    }
  };

  const getStatusChip = (task: ScheduleTask) => {
    switch (task.status) {
      case 'done':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--ok)]/20 text-[var(--ok)]">Done</span>;
      case 'in_progress':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--acc)]/20 text-[var(--acc)]">In progress · {Math.round(task.progress)}%</span>;
      case 'blocked':
        if (task.blockedByPoId) {
          return (
            <button className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--risk)]/20 text-[var(--risk)]" onClick={() => alert(`Navigating to PO: ${task.blockedByPoId}`)}>
              Blocked · {task.blockedReason || 'PO pending'}
            </button>
          );
        }
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--risk)]/20 text-[var(--risk)]">Blocked</span>;
      case 'scheduled': default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold border border-[var(--edge)] text-[var(--muted)]">Scheduled</span>;
    }
  };

  if (groupedTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-[var(--muted)]">
        <p>No tasks scheduled in this time window.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 overflow-y-auto w-full h-full pb-32" ref={containerRef}>
      {groupedTasks.map((group) => {
        const isTodayGroup = isToday(group.date);
        
        return (
           <div key={group.date.toISOString()} data-today={isTodayGroup} className="flex flex-col">
             <div className="flex items-center gap-4 mb-4">
               <span className={`text-[10px] font-mono font-bold tracking-widest ${isTodayGroup ? 'text-[var(--acc)]' : 'text-[var(--muted)]'}`}>
                 {isTodayGroup ? `TODAY · ${format(group.date, 'MMM d').toUpperCase()}` : format(group.date, 'EEE · MMM d').toUpperCase()}
               </span>
               <div className="flex-1 h-px bg-[var(--edge)]" />
             </div>
             
             <div className="relative">
                <div className="absolute left-[5px] top-[24px] bottom-[-24px] w-[2px] bg-[var(--edge)] z-0" />
                
                <div className="flex flex-col space-y-4">
                  {group.tasks.map((task) => (
                    <div key={task.id} className="relative flex items-start z-10 pl-[24px]">
                       <div className="absolute left-0 top-[20px] -translate-y-1/2 flex items-center justify-center w-[12px] h-[12px] z-10 bg-[var(--bg)] rounded-full">
                         <div className={`w-[12px] h-[12px] rounded-full ${getStatusColor(task.status)}`} />
                       </div>
                       
                       <div className="flex-1 bg-[var(--glass)] border border-[var(--edge)] rounded-[18px] p-4 backdrop-blur-md">
                         <h4 className="font-bold text-[var(--ink)] text-sm mb-1">{task.title}</h4>
                         <p className="text-[11px] text-[var(--muted)] mb-2">{task.phaseId} · {task.assigneeName || 'Unassigned'}</p>
                         
                         {task.status === 'scheduled' && task.dependsOnTaskIds.length > 0 && (
                           <p className="text-[10px] text-[var(--faint)] mb-3">
                             Depends on: {task.dependsOnTaskIds.length} tasks
                           </p>
                         )}

                         {task.status === 'in_progress' && (
                           <div className="w-full bg-[var(--edge)] h-[5px] rounded-full mb-3 overflow-hidden">
                             <div className="h-full bg-[var(--acc)]" style={{ width: `${task.progress}%` }} />
                           </div>
                         )}

                         <div className="flex items-center mt-1">
                           {getStatusChip(task)}
                         </div>
                       </div>
                    </div>
                  ))}
                </div>
             </div>
           </div>
        )
      })}
    </div>
  );
};
