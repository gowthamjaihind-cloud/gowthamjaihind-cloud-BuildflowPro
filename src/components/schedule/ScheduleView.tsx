import React, { useState, useEffect, useRef } from 'react';
import { useScheduleData, ScheduleTask } from '../../hooks/useScheduleData';
import { VerticalTimeline } from './VerticalTimeline';
import { MiniGantt } from './MiniGantt';
import { GanttChart } from '../GanttChart';
import { useAuthStore } from '../../store';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useIsDesktop } from '../../hooks/useBreakpoint';

import { DependencyType } from '../../types';

export const ScheduleView: React.FC<{ 
  projectId: string;
  tasks: ScheduleTask[];
  loading?: boolean;
  onAddDependency?: (fromId: string, toId: string, type: DependencyType) => Promise<void>;
  onTaskUpdate?: (task: any) => Promise<void>;
}> = ({ projectId, tasks, loading, onAddDependency, onTaskUpdate }) => {
  const isDesktop = useIsDesktop();
  const user = useAuthStore(state => state.user);

  const defaultPref = user?.preferences?.mobileScheduleView || 'timeline';
  const [mobileView, setMobileView] = useState<'timeline' | 'minigantt'>(defaultPref);
  const mobileViewRef = useRef(mobileView);

  useEffect(() => {
    if (user?.preferences?.mobileScheduleView) {
      setMobileView(user.preferences.mobileScheduleView);
    }
  }, [user?.preferences?.mobileScheduleView]);

  const savePreference = (view: 'timeline' | 'minigantt') => {
    setMobileView(view);
    mobileViewRef.current = view;

    if (!user) return;
    
    // Simple debounce to prevent rapid writes
    setTimeout(() => {
      if (mobileViewRef.current !== view) return; // overridden
      
      const userRef = doc(db, 'users', user.uid);
      setDoc(userRef, { preferences: { mobileScheduleView: view } }, { merge: true }).catch(err => {
         console.warn("Silent: Failed to save view preference", err);
      });
    }, 1000);
  };

  if (loading) {
    return (
      <div className="schedule-theme w-full h-[400px] bg-[var(--bg)] rounded-t-[24px] overflow-hidden flex flex-col p-4 space-y-6">
        <div className="flex justify-center mb-4">
          <div className="w-48 h-8 bg-[var(--edge)] rounded-full animate-pulse" />
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="flex gap-4 w-full">
            <div className="w-12 h-4 bg-[var(--edge)] rounded animate-pulse" />
            <div className="flex-1 h-20 bg-[var(--glass)] rounded-2xl animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="schedule-theme flex flex-col w-full h-[300px] border border-dashed border-[var(--edge)] bg-[var(--bg)] rounded-[24px] items-center justify-center shadow-xl">
        <p className="text-[var(--muted)] text-sm mb-4">No tasks found for this project.</p>
        <button className="px-6 py-2 bg-[var(--acc)] text-[var(--bg)] font-bold rounded-full hover:bg-[var(--ink)] transition-colors">
          Add your first task
        </button>
      </div>
    );
  }

  if (isDesktop) {
    const desktopTasks = tasks.map(t => t.rawTask);
    return (
      <div className="w-full">
         <GanttChart tasks={desktopTasks} onAddDependency={onAddDependency} onTaskUpdate={onTaskUpdate} />
      </div>
    );
  }

  return (
    <div className="schedule-theme flex flex-col w-full min-h-[500px] h-[75vh] bg-[var(--bg)] rounded-t-[24px] overflow-hidden shadow-2xl pb-16">
      <div className="flex items-center justify-center p-3 border-b border-[var(--glass)] bg-[var(--edge)] shrink-0">
        <div className="flex bg-[var(--glass)] rounded-full p-1 border border-[var(--edge)]" role="tablist">
          <button
            role="tab"
            aria-selected={mobileView === 'timeline'}
            className={`inline-flex items-center justify-center min-h-[40px] sm:min-h-[32px] px-6 py-1.5 rounded-full text-xs font-bold transition-all ${
              mobileView === 'timeline' 
                ? 'bg-[var(--acc)] text-[var(--bg)] shadow-md' 
                : 'text-[var(--muted)]'
            }`}
            onClick={() => savePreference('timeline')}
          >
            Timeline
          </button>
          <button
            role="tab"
            aria-selected={mobileView === 'minigantt'}
            className={`inline-flex items-center justify-center min-h-[40px] sm:min-h-[32px] px-6 py-1.5 rounded-full text-xs font-bold transition-all ${
              mobileView === 'minigantt' 
                ? 'bg-[var(--acc)] text-[var(--bg)] shadow-md' 
                : 'text-[var(--muted)]'
            }`}
            onClick={() => savePreference('minigantt')}
          >
            Gantt
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 transition-opacity duration-300 ${mobileView === 'timeline' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
          <VerticalTimeline tasks={tasks} />
        </div>
        <div className={`absolute inset-0 transition-opacity duration-300 ${mobileView === 'minigantt' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
          <MiniGantt tasks={tasks} />
        </div>
      </div>
    </div>
  );
};
