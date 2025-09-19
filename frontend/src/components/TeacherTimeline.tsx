import React from 'react';
import { api, auth } from '../api/client';
import type { LessonOut, Teacher } from '../api/types';
import LessonCard from './LessonCard';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { format, addDays } from 'date-fns';
import { getWeekStart, setAcademicAnchor } from '../lib/time';

const dayOptions = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayOrder: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

type Filters = {
  week?: number;
  day?: string;
  campus?: string;
  grouped?: boolean;
};

export const TeacherTimeline: React.FC = () => {
  const [teachers, setTeachers] = React.useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = React.useState<number | undefined>(() => {
    const saved = localStorage.getItem('selectedTeacherId');
    return saved ? Number(saved) : undefined;
  });
  const [week, setWeek] = React.useState<number | undefined>(3);
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
      .then(({ anchor_date }) => setAcademicAnchor(anchor_date))
      .catch((err) => console.warn('Failed to fetch calendar anchor:', err));
  }, []);

  async function load() {
    if (selectedTeacherId === undefined) return;
    setLoading(true);
    setError(null);
    setLessons(null);
    const filters: Filters = { week, day, campus, grouped };
    try {
      const data = await api.getTeacherSchedule(selectedTeacherId, filters);
      setLessons(data);
    } catch (e: any) {
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
  }, [selectedTeacherId, week, day, campus, grouped]);

  // Fetch weekly overview (for day badges/state) whenever teacher/week changes
  React.useEffect(() => {
    if (selectedTeacherId === undefined) return;
    api
      .getTeacherSchedule(selectedTeacherId, { week, campus, grouped })
      .then(setWeekly)
      .catch(() => setWeekly(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeacherId, week, campus, grouped]);

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

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      {/* Header */}
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
                  Week
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

      {/* Teacher Selector */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3 rounded-full border border-gray-300 bg-white px-4 py-2 max-w-sm">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-700 flex-shrink-0">
              {(() => {
                const name = teachers.find((t) => t.teacher_id === selectedTeacherId)?.name || '?';
                const initials = name
                  .split(' ')
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase();
                return initials;
              })()}
            </div>
            <select
              className="bg-transparent text-sm text-gray-800 focus:outline-none flex-1 min-w-0"
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
        </div>
      </div>

      {/* Week Navigation */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-4 py-2">
          <div className="flex items-center justify-center gap-4">
            <button
              className="rounded-full border border-gray-300 bg-white p-1.5 text-gray-600 hover:bg-gray-50 transition-colors"
              onClick={() => setWeek((w) => (w && w > 3 ? w - 1 : 3))}
              aria-label="Previous week"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="text-center">
              <div className="text-base font-semibold text-gray-900">
                Week {week} ({getWeekDateRange(week || 1)})
              </div>
            </div>
            <button
              className="rounded-full border border-gray-300 bg-white p-1.5 text-gray-600 hover:bg-gray-50 transition-colors"
              onClick={() => setWeek((w) => (w ? Math.min(w + 1, 5) : 3))}
              aria-label="Next week"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Day Selector */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-4 py-1">
          <div className="flex items-center justify-center">
            <div className="flex items-center rounded-lg border border-gray-300 overflow-hidden w-full max-w-sm">
              {dayOptions.map((d, index) => {
                const empty = (dayCounts[d] || 0) === 0;
                const active = day === d;
                const isToday = d === todayDay();
                return (
                  <button
                    key={d}
                    className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
                      active 
                        ? 'bg-orange-600 text-white' 
                        : isToday
                          ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                          : empty 
                            ? 'bg-white text-gray-400' 
                            : 'bg-white text-gray-700 hover:bg-gray-50'
                    } ${index > 0 ? 'border-l border-gray-300' : ''}`}
                    title={empty ? 'No lessons (day off)' : ''}
                    aria-pressed={active}
                    onClick={() => setDay(d)}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Campus Filter */}
      <div className="bg-white border-b border-gray-100">
        <div className="px-4 py-2">
          <div className="flex items-center justify-center gap-3">
            <div className="text-sm font-medium text-gray-600">
              Campus:
            </div>
            <div className="flex items-center gap-2">
              {[
                { label: 'All', value: undefined },
                { label: 'E1', value: 'E1' },
                { label: 'E2', value: 'E2' },
              ].map((c) => {
                const active = campus === c.value || (c.value === undefined && campus === undefined);
                return (
                  <button
                    key={c.label}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors bg-white ${
                      active 
                        ? 'border-2 border-gray-800 text-gray-800' 
                        : c.value === 'E1'
                          ? 'border-2 border-blue-500 text-blue-500 hover:bg-blue-50'
                          : c.value === 'E2'
                            ? 'border-2 border-green-500 text-green-500 hover:bg-green-50'
                            : 'border-2 border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => setCampus(c.value)}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4 pb-8">
        {error && (
          <div className="mb-4 flex items-start justify-between rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <span>{error}</span>
            <button className="rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-500 transition-colors" onClick={load}>Retry</button>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (!displayLessons || displayLessons.length === 0) && (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-2 h-4 w-1/3 rounded bg-gray-200"></div>
                <div className="h-4 w-1/2 rounded bg-gray-200"></div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && selectedTeacherId !== undefined && displayLessons.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <div className="text-gray-400 text-lg mb-2">📅</div>
            <div className="text-sm text-gray-600">No lessons scheduled for {day}</div>
          </div>
        )}

        {/* Day Header */}
        {displayLessons.length > 0 && (
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{day}</h2>
            <div className="text-sm text-gray-500">{displayLessons.length} lesson{displayLessons.length !== 1 ? 's' : ''}</div>
          </div>
        )}

        {/* Lessons List */}
        {displayLessons.length > 0 && (
          <div className="space-y-3">
            {displayLessons.map((l, idx) => {
              // Clean up class code by removing malformed parts
              const cleanClassCode = l.class_code
                .split('\n')[0] // Take only the first line
                .replace(/^\d+\s*/, '') // Remove leading numbers
                .trim();
              
              // Clean up co-teachers by filtering out malformed names
              const cleanCoTeachers = (l.co_teachers || [])
                .filter(name => !name.includes('\n') && name !== l.teacher_name)
                .filter(name => name.length < 50); // Filter out obviously malformed long names
              
              // Campus name is now correct from backend
              const campusName = l.campus_name;
              
              return (
                <LessonCard
                  key={`${l.week}-${l.day}-${l.start_time}-${idx}`}
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