import React from 'react';
import { api } from '@/api/client';
import type { LessonOut } from '@/api/types';
import { getWeekStart } from '@/lib/time';
import WeekGridLite from '@/components/WeekGridLite';
import { useSearchParams, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon } from '@heroicons/react/24/outline';

export const WeekView: React.FC = () => {
  const [lessons, setLessons] = React.useState<LessonOut[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [params] = useSearchParams();
  const teacherId = Number(params.get('teacher') || '1');
  const week = Number(params.get('week') || '1');
  const grouped = true;

  React.useEffect(() => {
    api.getTeacherSchedule(teacherId, { week, grouped })
      .then(setLessons)
      .catch((e) => setError(String(e)));
  }, [teacherId, week, grouped]);

  const weekStart = React.useMemo(() => getWeekStart(week), [week]);

  const weekEnd = React.useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(weekStart.getDate() + 6);
    return end;
  }, [weekStart]);

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newWeek = direction === 'prev' ? week - 1 : week + 1;
    const newParams = new URLSearchParams(params);
    newParams.set('week', String(Math.max(1, Math.min(52, newWeek))));
    window.location.search = newParams.toString();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left: Back to Day */}
            <div className="flex items-center space-x-4">
              <Link 
                to="/" 
                className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-orange-500 focus:ring-offset-2"
              >
                <CalendarIcon className="w-4 h-4 mr-2" />
                Day View
              </Link>
            </div>

            {/* Center: Week Navigation */}
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigateWeek('prev')}
                disabled={week <= 1}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeftIcon className="w-5 h-5" />
              </button>
              
              <div className="text-center">
                <h1 className="text-lg font-semibold text-gray-900">
                  {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
                </h1>
                <p className="text-sm text-gray-500">Week {week}</p>
              </div>
              
              <button
                onClick={() => navigateWeek('next')}
                disabled={week >= 52}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRightIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Right: Teacher Info */}
            <div className="flex items-center space-x-3">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">Teacher #{teacherId}</p>
                <p className="text-xs text-gray-500">Weekly Schedule</p>
              </div>
              <div className="w-8 h-8 bg-brand-orange-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-brand-orange-700">T{teacherId}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error loading schedule</h3>
                <p className="mt-1 text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Calendar Container */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <WeekGridLite
          lessons={lessons}
          weekStart={weekStart}
        />
      </div>
    </div>
  );
};

export default WeekView;


