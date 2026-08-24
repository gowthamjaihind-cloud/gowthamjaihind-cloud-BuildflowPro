import React from 'react';
import { Phase } from '../../hooks/useScheduleData';
import { format } from 'date-fns';
import { useL } from '../../i18n';

interface Props {
  phases: Phase[];
  onNavigate?: () => void;
}

export const PhaseStrips: React.FC<Props> = ({ phases, onNavigate }) => {
  const L = useL();
  if (phases.length === 0) {
    return (
      <div
        className="soft-card-interactive rounded-[24px] p-8 flex flex-col items-center justify-center text-center w-full"
        onClick={onNavigate}
      >
        <p className="text-ink font-bold text-sm">{L("Phase Timeline", "கட்ட காலவரிசை")}</p>
        <p className="text-ink-muted text-xs mt-2">{L("No phases to display yet. Add tasks to see Phase scheduling.", "காட்ட கட்டங்கள் இல்லை. கட்ட அட்டவணையைப் பார்க்க பணிகளைச் சேர்க்கவும்.")}</p>
      </div>
    );
  }

  return (
    <div 
      className="soft-card-interactive rounded-[24px] p-6 hover:bg-surface-dark/5 w-full"
      onClick={onNavigate}
    >
      <h3 className="text-ink font-bold text-sm mb-6 uppercase tracking-widest">{L("Phase Timeline", "கட்ட காலவரிசை")}</h3>
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
