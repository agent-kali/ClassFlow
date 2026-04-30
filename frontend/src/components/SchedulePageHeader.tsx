import React from 'react';
import ScheduleViewSwitcher, { type ScheduleViewMode } from './ScheduleViewSwitcher';

type SchedulePageHeaderProps = {
  activeView: ScheduleViewMode;
  onToday: () => void;
  onReload: () => void;
  isReloading?: boolean;
  canReload?: boolean;
  canAddLesson?: boolean;
  onAddLesson?: () => void;
  prepareViewParams?: (targetView: ScheduleViewMode, params: URLSearchParams) => void;
};

const SchedulePageHeader: React.FC<SchedulePageHeaderProps> = ({
  activeView,
  onToday,
  onReload,
  isReloading = false,
  canReload = true,
  canAddLesson = false,
  onAddLesson,
  prepareViewParams,
}) => {
  return (
    <div className="border-b border-white/[0.06] bg-surface">
      <div className="px-4 lg:px-6 py-4 lg:py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-white font-display">Schedule</h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="rounded-lg border border-white/[0.08] bg-transparent px-3 py-1.5 text-sm font-medium text-white/70 hover:bg-white/[0.06] hover:text-white transition-colors"
                onClick={onToday}
              >
                Today
              </button>
              <button
                type="button"
                className="rounded-lg border border-white/[0.08] bg-transparent w-8 h-8 flex items-center justify-center text-white/50 hover:bg-white/[0.06] hover:text-white/90 transition-colors disabled:opacity-40"
                onClick={onReload}
                disabled={isReloading || !canReload}
                aria-label="Reload"
                title="Reload"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M20.016 4.66v4.993" />
                </svg>
              </button>
            </div>

            <ScheduleViewSwitcher activeView={activeView} prepareParams={prepareViewParams} />

            {canAddLesson && onAddLesson && (
              <button
                type="button"
                onClick={onAddLesson}
                className="inline-flex items-center justify-center rounded-lg border border-accent-400/30 bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-accent-950/20 transition-all hover:bg-accent-400 hover:shadow-accent-500/20 active:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-400/60 focus:ring-offset-2 focus:ring-offset-surface"
              >
                + Add Lesson
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SchedulePageHeader;
