import React, { useState, useMemo, useRef } from 'react';
import { ScheduleTask } from '../../hooks/useScheduleData';
import { addDays, eachDayOfInterval, format, differenceInDays, startOfDay, isBefore, isAfter, isToday } from 'date-fns';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';

interface Props {
  tasks: ScheduleTask[];
  onTaskClick?: (task: ScheduleTask) => void;
}

export const MiniGantt: React.FC<Props> = ({ tasks, onTaskClick }) => {
  const today = startOfDay(new Date());
  
  const [windowStart, setWindowStart] = useState(() => {
    if (tasks && tasks.length > 0) {
      const earliest = new Date(Math.min(...tasks.map(t => t.startDate.getTime())));
      if (isBefore(earliest, today)) {
        return addDays(startOfDay(earliest), -1);
      }
    }
    return addDays(today, -3);
  });
  
  const windowDays = 14;
  const windowEnd = addDays(windowStart, windowDays - 1);

  const days = useMemo(() => eachDayOfInterval({ start: windowStart, end: windowEnd }), [windowStart, windowEnd]);

  const visibleTasks = useMemo(() => {
    return tasks.filter(task => {
      const taskStart = startOfDay(task.startDate);
      const taskEnd = startOfDay(task.endDate);
      return !isAfter(taskStart, windowEnd) && !isBefore(taskEnd, windowStart);
    }).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }, [tasks, windowStart, windowEnd]);

  const shiftWindow = (daysToAdd: number) => {
    setWindowStart(prev => addDays(prev, daysToAdd));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current !== null) {
      const touchEndX = e.changedTouches[0].clientX;
      const deltaX = touchStartX.current - touchEndX;
      
      if (Math.abs(deltaX) > 50) {
        if (deltaX > 0) shiftWindow(7);
        else shiftWindow(-7);
      }
      touchStartX.current = null;
    }
  };

  const touchStartX = useRef<number | null>(null);

  const getBarStyles = (task: ScheduleTask) => {
    const taskStart = startOfDay(task.startDate);
    const taskEnd = startOfDay(task.endDate);
    
    const startOffsetDays = differenceInDays(taskStart, windowStart);
    const durationDays = differenceInDays(taskEnd, taskStart) + 1;

    // Clamp coordinates
    const leftRaw = startOffsetDays;
    const rightRaw = leftRaw + durationDays;

    const left = Math.max(0, leftRaw);
    const right = Math.min(windowDays, rightRaw);
    const width = Math.max(0, right - left);
    // Width percentage relative to the 14 columns
    const leftPct = (left / windowDays) * 100;
    const widthPct = (width / windowDays) * 100;

    let bgClass = '';
    let borderClass = '';
    let textClass = 'text-[var(--ink)]';
    
    switch (task.status) {
      case 'done':
        bgClass = 'bg-[var(--ok)]/20';
        borderClass = 'border border-[var(--ok)]/50';
        textClass = 'text-[var(--ok)]';
        break;
      case 'in_progress':
        bgClass = 'bg-[var(--acc)]/20';
        borderClass = 'border border-[var(--acc)]/50';
        textClass = 'text-[var(--acc)]';
        break;
      case 'blocked':
        bgClass = 'bg-transparent';
        borderClass = 'border border-[var(--risk)]';
        textClass = 'text-[var(--risk)]';
        break;
      case 'scheduled': default:
        bgClass = 'bg-transparent';
        borderClass = 'border border-dashed border-[var(--faint)]';
        textClass = 'text-[var(--muted)]';
    }

    return {
      style: { left: `${leftPct}%`, width: `${widthPct}%` },
      bgClass, borderClass, textClass,
      clippedLeft: leftRaw < 0,
      clippedRight: rightRaw > windowDays
    };
  };

  return (
    <div className="flex flex-col w-full bg-[var(--bg)] overflow-hidden select-none h-full">
      <div className="flex items-center justify-between p-4 border-b border-[var(--edge)]">
        <button onClick={() => shiftWindow(-7)} className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--edge)] active:bg-[var(--glass)] text-[var(--ink)]">
          <CaretLeft weight="bold" className="w-5 h-5" />
        </button>
        <span className="text-[13px] font-bold text-[var(--ink)]">
          {format(windowStart, 'MMM dd')} – {format(windowEnd, 'MMM dd')}
        </span>
        <button onClick={() => shiftWindow(7)} className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--edge)] active:bg-[var(--glass)] text-[var(--ink)]">
          <CaretRight weight="bold" className="w-5 h-5" />
        </button>
      </div>

      <div 
        className="flex-1 relative overflow-y-auto overflow-x-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex border-b border-[var(--edge)] bg-[var(--glass)] sticky top-0 z-20">
          <div className="w-[96px] shrink-0 border-r border-transparent p-2 z-30" />
          <div className="flex flex-1">
            {days.map((day, i) => {
              const td = isToday(day);
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-center py-2 h-10 border-r border-[var(--edge)] shrink-0 last:border-r-0 min-w-0">
                  <span className={`text-[10px] font-mono leading-none ${td ? 'text-[var(--acc)]' : 'text-[var(--faint)]'}`}>
                    {format(day, 'E')[0]}
                  </span>
                  <span className={`text-[11px] font-bold mt-0.5 leading-none ${td ? 'text-[var(--ink)] bg-[var(--acc)] px-1 rounded-sm' : 'text-[var(--muted)]'}`}>
                    {format(day, 'd')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative">
          <div className="absolute top-0 bottom-0 left-[96px] right-0 flex pointer-events-none z-0">
            {days.map((day, i) => (
              <div key={i} className="flex-1 border-r border-[var(--edge)] min-w-0 relative">
                {isToday(day) && (
                  <div className="absolute left-[50%] top-0 bottom-0 w-[2px] bg-[var(--acc)]/50 -translate-x-1/2 z-0" />
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col relative z-10 w-full pt-2 pb-32">
            {visibleTasks.map(task => {
              const { style, bgClass, borderClass, textClass, clippedLeft, clippedRight } = getBarStyles(task);
              return (
                <div key={task.id} className="relative flex h-[42px] items-center w-full group">
                  <div className="w-[96px] shrink-0 h-full flex items-center px-2 z-20 sticky left-0 bg-gradient-to-r from-[var(--bg)] via-[var(--bg)] to-transparent pointer-events-none text-ellipsis overflow-hidden">
                    <span className="text-[11px] font-bold text-[var(--ink)] drop-shadow-md truncate max-w-full">
                      {task.title}
                    </span>
                  </div>
                  <div className="flex-1 relative h-full flex items-center pr-2 shrink-0 min-w-0">
                    <div 
                      onClick={() => onTaskClick?.(task)}
                      className={`absolute h-[24px] rounded-[7px] flex items-center px-2 cursor-pointer transition-transform active:scale-[0.98] ${bgClass} ${borderClass} ${clippedLeft ? 'rounded-l-none border-l-0' : ''} ${clippedRight ? 'rounded-r-none border-r-0' : ''}`}
                      style={style}
                    >
                      {task.status === 'in_progress' ? (
                        <span className={`text-[9px] font-bold ${textClass} truncate`}>{Math.round(task.progress)}%</span>
                      ) : task.status === 'blocked' ? (
                        <span className={`text-[9px] font-bold ${textClass} truncate uppercase tracking-wider`}>BLOCKED</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      <div className="p-3 bg-[var(--bg)] text-center text-[10px] text-[var(--faint)] uppercase tracking-widest font-bold">
        ↔ swipe sideways · task names stay pinned
      </div>
    </div>
  );
};
