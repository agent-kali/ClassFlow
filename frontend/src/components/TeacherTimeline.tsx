import React from 'react';
import { api, auth } from '../api/client';
import type { LessonOut, Teacher } from '../api/types';
import LessonCard from './LessonCard';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { format, addDays } from 'date-fns';
import { getWeekStart, setAcademicAnchor, getWeekNumber } from '../lib/time';
import { getWeekForDate } from '../lib/monthWeeks';

const dayOptions = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayOrder: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

type Filters = {
  week?: number;
  day?: string;
  campus?: string;
  grouped?: boolean;
  // Month-based week parameters
  month?: number;
  year?: number;
  week_number?: number;
};

export const TeacherTimeline: React.FC = () => {
  const [teachers, setTeachers] = React.useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = React.useState<number | undefined>(() => {
    const saved = localStorage.getItem('selectedTeacherId');
    return saved ? Number(saved) : undefined;
  });
  const [week, setWeek] = React.useState<number | undefined>(undefined);
  const [anchorLoaded, setAnchorLoaded] = React.useState<boolean>(false);
  const [day, setDay] = React.useState<string>('Mon');
  const [campus, setCampus] = React.useState<string | undefined>(undefined);
  const [grouped, setGrouped] = React.useState<boolean>(true);
  const [lessons, setLessons] = React.useState<LessonOut[] | null>(null);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [weekly, setWeekly] = React.useState<LessonOut[] | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    api.logout();
    navigate('/login');
  };

  React.useEffect(() => {
    api
      .listTeachers()
      .then((list) => {
        setTeachers(list);
        if (selectedTeacherId === undefined) {
          const dan = list.find((t) => t.name === 'Mr Daniel');
          if (dan) setSelectedTeacherId(dan.teacher_id);
        }
      })
      .catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch calendar anchor once
  React.useEffect(() => {
    api.getAnchor()
      .then(({ anchor_date }) => {
        setAcademicAnchor(anchor_date);
        setAnchorLoaded(true);
        setWeek(getWeekNumber(new Date()));
      })
      .catch((err) => {
        console.warn('Failed to fetch calendar anchor:', err);
        setAnchorLoaded(true);
        setWeek(getWeekNumber(new Date()));
      });
  }, []);

  async function load() {
    if (selectedTeacherId === undefined) return;
    if (!anchorLoaded || week === undefined) return;
    setLoading(true);
    setError(null);
    setLessons(null);
    
    // For extended weeks (beyond academic period), use month-based parameters
    const weekStart = getWeekStart(week);
    // For week 7+ (Oct 13-19), we need to look at the Monday, not the Sunday
    const targetDate = week && week >= 7 ? addDays(weekStart, 1) : weekStart;
    const weekInfo = getWeekForDate(targetDate);
    
    console.log('TeacherTimeline debug:', { 
      week, 
      weekStart: weekStart.toISOString(), 
      targetDate: targetDate.toISOString(),
      weekStartMonth: weekStart.getMonth() + 1,
      weekStartYear: weekStart.getFullYear(),
      weekInfo: weekInfo ? {
        weekNumber: weekInfo.weekNumber,
        month: weekInfo.month,
        year: weekInfo.year,
        startDate: weekInfo.startDate,
        endDate: weekInfo.endDate
      } : null
    });
    
    // For Week 7, let's also test what the database should return
    if (week === 7 && weekInfo) {
      console.log('🔍 Week 7 Debug - Database should have lessons for:', {
        month: weekInfo.month,
        year: weekInfo.year,
        week_number: weekInfo.weekNumber
      });
    }
    
    const filters: Filters = weekInfo ? {
      month: weekInfo.month,
      year: weekInfo.year,
      week_number: weekInfo.weekNumber,
      day,
      campus,
      grouped
    } : {
      week,
      day,
      campus,
      grouped
    };
    
    console.log('TeacherTimeline API params:', { 
      week, 
      weekInfo: weekInfo ? {
        weekNumber: weekInfo.weekNumber,
        month: weekInfo.month,
        year: weekInfo.year
      } : null, 
      filters: {
        month: filters.month,
        year: filters.year,
        week_number: filters.week_number,
        week: filters.week,
        day: filters.day,
        campus: filters.campus,
        grouped: filters.grouped
      }
    });
    
    try {
      const data = await api.getTeacherSchedule(selectedTeacherId, filters);
      console.log('API response for week', week, ':', data);
      setLessons(data);
    } catch (e: any) {
      console.error('API error for week', week, ':', e);
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (selectedTeacherId !== undefined) {
      localStorage.setItem('selectedTeacherId', String(selectedTeacherId));
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeacherId, week, day, campus, grouped, anchorLoaded]);

  // Fetch weekly overview (for day badges/state) whenever teacher/week changes
  React.useEffect(() => {
    if (selectedTeacherId === undefined) return;
    if (!anchorLoaded || week === undefined) return;
    
    // For extended weeks (beyond academic period), use month-based parameters
    const weekStart = getWeekStart(week);
    // For week 7+ (Oct 13-19), we need to look at the Monday, not the Sunday
    const targetDate = week >= 7 ? addDays(weekStart, 1) : weekStart;
    const weekInfo = getWeekForDate(targetDate);
    
    const overviewFilters = weekInfo ? {
      month: weekInfo.month,
      year: weekInfo.year,
      week_number: weekInfo.weekNumber,
      campus,
      grouped
    } : {
      week,
      campus,
      grouped
    };
    
    api
      .getTeacherSchedule(selectedTeacherId, overviewFilters)
      .then(setWeekly)
      .catch(() => setWeekly(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeacherId, week, campus, grouped, anchorLoaded]);

  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const todayDay = (): string => {
    const idx = new Date().getDay(); // 0 Sun .. 6 Sat
    return dayOptions[(idx + 6) % 7]; // shift so Mon=0
  };

  const getWeekDateRange = (weekNum: number): string => {
    // Use the academic calendar anchor from the API
    const weekStart = getWeekStart(weekNum);
    const weekEnd = addDays(weekStart, 6);
    return `${format(weekStart, 'dd/MM')} - ${format(weekEnd, 'dd/MM')}`;
  };

  const getDayDate = (weekNum: number | undefined, dayName: string): string => {
    if (weekNum === undefined || !anchorLoaded) {
      // Fallback: use current calendar week based on today's date
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0 = Sunday
      const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(today);
      monday.setDate(today.getDate() + daysToMonday);
      const dayIndex = dayOptions.indexOf(dayName);
      const dayDate = addDays(monday, dayIndex);
      return format(dayDate, 'do MMM');
    }
    const weekStart = getWeekStart(weekNum);
    const dayIndex = dayOptions.indexOf(dayName);
    const dayDate = addDays(weekStart, dayIndex);
    return format(dayDate, 'do MMM'); // e.g., "13th Oct"
  };

  const monthWeekInfo = React.useMemo(() => {
    if (!anchorLoaded || week === undefined) return null;
    const weekStart = getWeekStart(week);
    const targetDate = week >= 7 ? addDays(weekStart, 1) : weekStart;
    return getWeekForDate(targetDate);
  }, [anchorLoaded, week]);

  const isNowSlot = (l: LessonOut) => {
    if (day !== todayDay()) return false;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return toMinutes(l.start_time) <= nowMin && nowMin < toMinutes(l.end_time);
  };

  // Ensure unique + sorted (week -> day -> start_time)
  const displayLessons = React.useMemo(() => {
    if (!lessons) return [] as LessonOut[];
    const seen = new Set<string>();
    let out: LessonOut[] = [];
    for (const l of lessons) {
      // Deduplicate by week|day|start|end|class|campus (ignore room differences)
      const key = [l.week, l.day, l.start_time, l.end_time, l.class_code, l.campus_name].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(l);
    }
    
    // Apply campus filter
    if (campus) {
      out = out.filter(l => l.campus_name === campus);
    }
    
    out.sort((a, b) => {
      if (a.week !== b.week) return a.week - b.week;
      const da = dayOrder[a.day] ?? 0;
      const db = dayOrder[b.day] ?? 0;
      if (da !== db) return da - db;
      return toMinutes(a.start_time) - toMinutes(b.start_time);
    });
    return out;
  }, [lessons, campus]);

  // Day -> number of lessons map for the current week
  const dayCounts = React.useMemo(() => {
    const counts: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    let weeklyLessons = weekly || [];
    
    // Apply campus filter to weekly lessons too
    if (campus) {
      weeklyLessons = weeklyLessons.filter(l => l.campus_name === campus);
    }
    
    weeklyLessons.forEach((l) => {
      counts[l.day] = (counts[l.day] || 0) + 1;
    });
    return counts;
  }, [weekly, campus]);

  const currentUser = auth.getUser();
  const isTeacherUser = currentUser?.role === 'teacher';

  const desktopContainer = "w-full max-w-5xl mx-auto px-4 lg:w-[70%] lg:px-0";
  const mobileContainer = "w-full px-3 sm:px-4";

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      {/* Header - Only show for teacher users */}
      {isTeacherUser && (
        <div className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-semibold text-gray-900">E‑Home Schedule</h1>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 transition-colors"
                    onClick={() => setDay(todayDay())}
                    title="Jump to today"
                  >
                    Today
                  </button>
                  <button
                    onClick={load}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    disabled={selectedTeacherId === undefined || loading}
                    aria-busy={loading}
                  >
                    {loading ? 'Loading…' : 'Reload'}
                  </button>
                  <button
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => {
                      const params = new URLSearchParams();
                      if (selectedTeacherId) params.set('teacher', String(selectedTeacherId));
                      if (week) params.set('week', String(week));
                      navigate(`/week?${params.toString()}`);
                    }}
                  >
                    Week grid
                  </button>
                </div>

                {/* User info and logout */}
                <div className="flex items-center gap-3 pl-3 border-l border-gray-200">
                  {auth.getUser() && (
                    <div className="text-gray-700 text-sm">
                      <span className="font-medium">{auth.getUser()?.username}</span>
                      <span className="ml-2 px-2 py-1 bg-gray-200 text-gray-800 rounded text-xs uppercase">
                        {auth.getUser()?.role}
                      </span>
                    </div>
                  )}
                  <button
                    onClick={handleLogout}
                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors shadow-md"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    
      {/* Navigation Container - responsive layout */}
      <div className="bg-white border-b border-gray-200">
        <div className={`${mobileContainer} lg:${desktopContainer} py-4 lg:py-6 space-y-4 lg:space-y-5`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-gray-900">E-Home Schedule</h2>
            <div className="flex items-center gap-2">
              <button
                className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 transition hover:border-orange-300 hover:text-orange-600"
                onClick={() => setDay(todayDay())}
              >
                Today
              </button>
              <button
                className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 transition hover:border-orange-300 hover:text-orange-600"
                onClick={load}
                disabled={loading || selectedTeacherId === undefined}
              >
                {loading ? 'Loading…' : 'Reload'}
              </button>
                  <button
                    className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 transition hover:border-orange-300 hover:text-orange-600"
                    onClick={() => {
                      const params = new URLSearchParams();
                      if (selectedTeacherId) params.set('teacher', String(selectedTeacherId));
                      if (week) params.set('week', String(week));
                      navigate(`/week?${params.toString()}`);
                    }}
                  >
                    Week grid
                  </button>
                  <button
                    className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 transition hover:border-orange-300 hover:text-orange-600"
                    onClick={() => {
                      const params = new URLSearchParams();
                      if (selectedTeacherId) params.set('teacher', String(selectedTeacherId));
                      navigate(`/month?${params.toString()}`);
                    }}
                  >
                    Month view
                  </button>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl lg:rounded-3xl shadow-sm px-3 py-3 lg:px-5 lg:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 lg:gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-xs font-bold text-gray-700">
                {(() => {
                  const name = teachers.find((t) => t.teacher_id === selectedTeacherId)?.name || '?';
                  return name
                    .split(' ')
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();
                })()}
              </div>
              <select
                className="w-full sm:min-w-[180px] rounded-full border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900 focus:border-orange-300 focus:outline-none focus:ring-0"
                value={selectedTeacherId ?? ''}
                onChange={(e) => setSelectedTeacherId(e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">Select Teacher…</option>
                {teachers.map((t) => (
                  <option key={t.teacher_id} value={t.teacher_id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {[
                { label: 'All', value: undefined },
                { label: 'E1', value: 'E1' },
                { label: 'E2', value: 'E2' },
              ].map((c) => {
                const active = campus === c.value || (c.value === undefined && campus === undefined);
                const base = 'rounded-full border px-3 py-1.5 text-sm font-semibold transition flex-shrink-0';
                const inactiveColors =
                  c.value === 'E1'
                    ? 'border-blue-200 text-blue-600 hover:bg-blue-50'
                    : c.value === 'E2'
                      ? 'border-green-200 text-green-600 hover:bg-green-50'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:text-gray-900';
                return (
                  <button
                    key={c.label}
                    className={`${base} ${active ? 'border-orange-500 bg-orange-500 text-white shadow-sm' : inactiveColors}`}
                    onClick={() => setCampus(c.value)}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition hover:border-orange-300 hover:text-orange-600 disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => setWeek((w) => {
                if (w === undefined) {
                  return getWeekNumber(new Date());
                }
                return w > 1 ? w - 1 : 1;
              })}
              disabled={!anchorLoaded}
              aria-label="Previous week"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="rounded-full border border-gray-200 bg-white px-5 py-1.5 text-sm font-semibold text-gray-800">
              {anchorLoaded && week !== undefined && monthWeekInfo
                ? (
                  <>
                    Week {monthWeekInfo.weekNumber} | {getWeekDateRange(week)}
                  </>
                )
                : 'Loading current week…'}
            </div>
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition hover:border-orange-300 hover:text-orange-600 disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => setWeek((w) => {
                if (w === undefined) {
                  return getWeekNumber(new Date());
                }
                return w + 1;
              })}
              disabled={!anchorLoaded}
              aria-label="Next week"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl lg:rounded-3xl shadow-sm px-2 py-2 lg:px-3 lg:py-3">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
              {dayOptions.map((d) => {
                const empty = (dayCounts[d] || 0) === 0;
                const active = day === d;
                const isToday = d === todayDay();
                return (
                  <button
                    key={d}
                    className={`flex-shrink-0 min-w-[60px] px-3 py-2 text-sm font-semibold rounded-lg border transition ${
                      active
                        ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                        : isToday
                          ? 'border-orange-200 bg-orange-50 text-orange-700'
                          : empty
                            ? 'border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:text-gray-900'
                    }`}
                    title={empty ? 'No lessons' : `${dayCounts[d] || 0} lesson${dayCounts[d] !== 1 ? 's' : ''}`}
                    aria-pressed={active}
                    onClick={() => setDay(d)}
                    disabled={empty}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Content - Responsive layout */}
      <div className={`${mobileContainer} lg:${desktopContainer} py-4`}>

        {error && (
          <div className="mb-3 rounded-lg bg-red-50 border border-red-200 p-2.5">
            <div className="flex items-start gap-2">
              <div className="text-red-500 text-sm mt-0.5">⚠️</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-red-800">Error loading schedule</div>
                <div className="text-xs text-red-600">{error}</div>
              </div>
              <button 
                className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 transition-colors flex-shrink-0" 
                onClick={load}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (!displayLessons || displayLessons.length === 0) && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="animate-pulse rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-16 rounded bg-gray-200"></div>
                    <div className="h-3 w-20 rounded bg-gray-200"></div>
                  </div>
                  <div className="h-5 w-12 rounded bg-gray-200"></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && selectedTeacherId !== undefined && displayLessons.length === 0 && (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-2 border border-orange-100">
              <span className="text-lg">📅</span>
            </div>
            <div className="text-sm font-bold text-gray-900 mb-0.5">No lessons on {day}</div>
            <div className="text-xs text-gray-500">Select another day to view schedule</div>
          </div>
        )}

        {/* Day Header */}
        {displayLessons.length > 0 && (
          <div className="mb-4">
            <div className="border-b border-orange-200 pb-3">
              <div className="flex items-baseline gap-3 mb-2">
                <div className="text-lg font-semibold text-gray-900">{day}</div>
                <div className="text-sm font-semibold text-gray-500">{getDayDate(week, day)}</div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="font-semibold text-gray-500">{displayLessons.length} lesson{displayLessons.length !== 1 ? 's' : ''}</span>
                <span className="h-3 w-px bg-gray-300" aria-hidden="true" />
                <span className="text-orange-600 font-semibold">
                  Week {monthWeekInfo ? monthWeekInfo.weekNumber : '…'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Lessons List */}
        {displayLessons.length > 0 && (
          <div className="space-y-3">
            {displayLessons.map((l, idx) => {
              // Use class_code and clean it up
              const cleanClassCode = l.class_code || 'Unknown Class';
              
              // Clean up co-teachers by filtering out malformed names
              const coTeachersFromArray = (l.co_teachers || [])
                .filter(name => name && typeof name === 'string')
                .filter(name => !name.includes('\n') && name !== l.teacher_name)
                .filter(name => name.length < 50 && name.length > 1);
              
              // Also include the direct co-teacher name from the lesson record
              const directCoTeacher = l.co_teacher_name && l.co_teacher_name !== l.teacher_name 
                ? l.co_teacher_name 
                : null;
              
              // Combine both sources and remove duplicates
              const allCoTeachers = [...coTeachersFromArray];
              if (directCoTeacher && !allCoTeachers.includes(directCoTeacher)) {
                allCoTeachers.push(directCoTeacher);
              }
              
              const cleanCoTeachers = allCoTeachers;
              
              // Debug co-teacher data for Week 7
              if (week === 7 && (cleanCoTeachers.length > 0 || directCoTeacher)) {
                console.log('🔍 Co-teacher debug for lesson:', {
                  class_code: l.class_code,
                  teacher_name: l.teacher_name,
                  co_teacher_name: l.co_teacher_name,
                  co_teachers: l.co_teachers,
                  directCoTeacher,
                  cleanCoTeachers
                });
              }
              
              // Campus name is now correct from backend
              const campusName = l.campus_name;
              
              const keyParts = [l.week_number ?? l.week ?? 'wk', l.day, l.start_time, idx].join('-');

              return (
                <LessonCard
                  key={keyParts}
                  title={cleanClassCode}
                  start={l.start_time}
                  end={l.end_time}
                  room={l.room || 'TBD'}
                  campus={campusName}
                  teachers={[
                    { name: l.teacher_name, is_primary: true },
                    ...cleanCoTeachers.map(name => ({ name, is_primary: false }))
                  ]}
                  isNow={isNowSlot(l)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherTimeline;