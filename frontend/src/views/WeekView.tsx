import React from 'react';
import { api } from '@/api/client';
import type { LessonOut } from '@/api/types';
import { getWeekStart, setAcademicAnchor } from '@/lib/time';
import PeriodGrid from '@/components/PeriodGrid';
import { useSearchParams, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon, Bars3Icon } from '@heroicons/react/24/outline';

const DAYS: Array<"Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun"> = [
  "Mon",
  "Tue", 
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];

export const WeekView: React.FC = () => {
  const [lessons, setLessons] = React.useState<LessonOut[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = React.useState<boolean>(false);
  const [isHeaderVisible, setIsHeaderVisible] = React.useState<boolean>(true);
  const [lastScrollY, setLastScrollY] = React.useState<number>(0);
  const [params] = useSearchParams();
  const teacherId = Number(params.get('teacher') || '1');
  const week = Number(params.get('week') || '1');
  const grouped = true;

  // Fetch calendar anchor once
  React.useEffect(() => {
    api.getAnchor()
      .then(({ anchor_date }) => setAcademicAnchor(anchor_date))
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    api.getTeacherSchedule(teacherId, { week, grouped })
      .then(setLessons)
      .catch((e) => setError(String(e)));
  }, [teacherId, week, grouped]);

  // Close menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isMenuOpen && !(event.target as Element).closest('.relative')) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  // Handle scroll-based header visibility
  React.useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      // Show header only when reaching the top (within 20px of top)
      if (currentScrollY < 20) {
        setIsHeaderVisible(true);
      } 
      // Hide header when scrolling down past 30px (much earlier to avoid covering Monday)
      else if (currentScrollY > lastScrollY && currentScrollY > 30) {
        setIsHeaderVisible(false);
      }
      // Don't show header when scrolling up - only when reaching top
      
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

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

  const viewMode: 'period' = 'period';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation Header */}
      <div className={`sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm transition-all duration-500 ease-out ${
        isHeaderVisible 
          ? 'translate-y-0 opacity-100' 
          : '-translate-y-full opacity-0'
      }`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* First Row: Navigation and Teacher Info */}
          <div className="flex items-center justify-between h-12">
            {/* Left: Burger Menu */}
            <div className="flex items-center space-x-4">
              <div className="relative">
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="inline-flex items-center p-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 transition-colors"
                >
                  <Bars3Icon className="w-5 h-5" />
                </button>
                
                {/* Dropdown Menu */}
                {isMenuOpen && (
                  <div className="absolute left-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <div className="py-1">
                      <Link
                        to="/"
                        className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        <CalendarIcon className="w-4 h-4 mr-3" />
                        Day View
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Teacher Info */}
            <div className="flex items-center space-x-3">
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">Teacher #{teacherId}</p>
                <p className="text-xs text-gray-500 font-medium">Weekly Schedule</p>
              </div>
              <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-semibold text-orange-700">T{teacherId}</span>
              </div>
            </div>
          </div>

          {/* Second Row: Week Navigation */}
          <div className="flex items-center justify-center h-12 border-t border-gray-100">
            <div className="flex items-center space-x-6">
              <button
                onClick={() => navigateWeek('prev')}
                disabled={week <= 1}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeftIcon className="w-5 h-5" />
              </button>
              
              <div className="text-center min-w-0 flex-1">
                <h1 className="text-lg font-semibold text-gray-900 truncate">
                  {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
                </h1>
                <p className="text-sm text-gray-500 font-medium">Week {week}</p>
              </div>
              
              <button
                onClick={() => navigateWeek('next')}
                disabled={week >= 52}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRightIcon className="w-5 h-5" />
              </button>
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
        <PeriodGrid
          weekStartISO={weekStart.toISOString()}
          lessons={lessons}
          dayStart="17:00"
          dayEnd="21:00"
        />
      </div>
    </div>
  );
};

export default WeekView;


