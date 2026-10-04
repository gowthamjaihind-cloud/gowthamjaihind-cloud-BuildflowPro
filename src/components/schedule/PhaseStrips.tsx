import React from 'react';
import { Phase } from '../../hooks/useScheduleData';
import { format } from 'date-fns';
import { EmptyState } from "../EmptyState";

interface Props {
  phases: Phase[];
  onNavigate?: () => void;
}

export const PhaseStrips: React.FC<Props> = ({ phases, onNavigate }) => {
  if (phases.length === 0) {
    return (
      <div
        className="soft-card-interactive rounded-[24px] w-full cursor-pointer"
        onClick={onNavigate}
      >
        <EmptyState
          title={"Phase Timeline"}
          body={"No phases to display yet. Add tasks to see Phase scheduling."}
        />
      </div>
    );
  }

  return (
    <div 
      className="soft-card-interactive rounded-[24px] p-6 hover:bg-surface-dark/5 w-full"
      onClick={onNavigate}
    >
      <h3 className="text-ink font-bold text-sm mb-6 uppercase tracking-widest">{"Phase Timeline"}</h3>
      <div className="flex flex-col space-y-6">
        {phases.map(phase => {
          const isDone = phase.progress >= 100;
          return (
            <div key={phase.id} className="flex flex-col space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-ink font-bold text-sm tracking-tight">{phase.name}</span>
                <span className="text-ink-muted font-mono text-[10px] font-bold">
                  {format(phase.startDate, 'MMM')} – {format(phase.endDate, 'MMM')} · {Math.round(phase.progress)}%
                </span>
              </div>
              
              <div className="h-[9px] bg-surface-dark/10 rounded-full overflow-hidden w-full">
                <div 
                  className={`h-full transition-all duration-500 ease-out ${isDone ? 'bg-primary' : 'bg-primary/80'}`} 
                  style={{ width: `${Math.max(2, Math.min(100, phase.progress))}%` }} 
                />
              </div>

              <div className="flex items-center justify-between pt-0.5">
                <span className="text-[10px] text-ink-muted font-bold uppercase tracking-widest">{phase.unitsLabel}</span>
                <span className={`text-[10px] font-bold ${phase.scheduleHealth === 'behind' ? 'text-danger' : 'text-primary'}`}>
                  {phase.healthLabel}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
