import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export type ScheduleViewMode = 'day' | 'week' | 'month';

interface ScheduleViewSwitcherProps {
  activeView: ScheduleViewMode;
  prepareParams?: (targetView: ScheduleViewMode, params: URLSearchParams) => void;
}

const viewOptions: Array<{ value: ScheduleViewMode; label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

const ScheduleViewSwitcher: React.FC<ScheduleViewSwitcherProps> = ({ activeView, prepareParams }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const switchView = (targetView: ScheduleViewMode) => {
    if (targetView === activeView) return;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('view', targetView);
    prepareParams?.(targetView, nextParams);

    navigate({
      pathname: '/',
      search: `?${nextParams.toString()}`,
    });
  };

  return (
    <div className="flex rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5">
      {viewOptions.map((option) => {
        const isActive = option.value === activeView;

        return (
          <button
            key={option.value}
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              isActive
                ? 'bg-accent-500 text-white font-semibold'
                : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04] font-medium'
            }`}
            onClick={() => switchView(option.value)}
            disabled={isActive}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

export default ScheduleViewSwitcher;
