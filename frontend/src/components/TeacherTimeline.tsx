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
        const selectedStillExists = selectedTeacherId !== undefined &&
          list.some((teacher) => teacher.teacher_id === selectedTeacherId);

        if (!selectedStillExists) {
          const preferredTeacher =
            list.find((teacher) => teacher.name === 'Mr Daniel') ||
            list.find((teacher) => teacher.name.startsWith('[Demo]')) ||
            list[0];

          if (preferredTeacher) {
            setSelectedTeacherId(preferredTeacher.teacher_id);
          } else {
            setSelectedTeacherId(undefined);
          }
        }
      })
      .catch((e) => setError(String(e)));
  }, [selectedTeacherId]);

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

    const weekStart = getWeekStart(week);
    const targetDate = week && week >= 7 ? addDays(weekStart, 1) : weekStart;
    const weekInfo = getWeekForDate(targetDate);

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
  }, [selectedTeacherId, week, day, campus, grouped, anchorLoaded]);

  React.useEffect(() => {
    if (selectedTeacherId === undefined) return;
    if (!anchorLoaded || week === undefined) return;

    const weekStart = getWeekStart(week);
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
  }, [selectedTeacherId, week, campus, grouped, anchorLoaded]);

  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const todayDay = (): string => {
    const idx = new Date().getDay();
    return dayOptions[(idx + 6) % 7];
  };

  const getWeekDateRange = (weekNum: number): string => {
    const weekStart = getWeekStart(weekNum);
    const weekEnd = addDays(weekStart, 6);
    return `${format(weekStart, 'dd/MM')} - ${format(weekEnd, 'dd/MM')}`;
  };

  const getDayDate = (weekNum: number | undefined, dayName: string): string => {
    if (weekNum === undefined || !anchorLoaded) {
      const today = new Date();
      const dayOfWeek = today.getDay();
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
    return format(dayDate, 'do MMM');
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

  const displayLessons = React.useMemo(() => {
    if (!lessons) return [] as LessonOut[];
    const seen = new Set<string>();
    let out: LessonOut[] = [];
    for (const l of lessons) {
      const key = [l.week, l.day, l.start_time, l.end_time, l.class_code, l.campus_name].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(l);
    }
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

  const dayCounts = React.useMemo(() => {
    const counts: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    let weeklyLessons = weekly || [];
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

  const containerClass = "page-container page-container-xl";

  return (
    <div className="min-h-screen bg-base overflow-x-hidden">
      {/* Teacher-only header (branding + user info only — actions live in the nav bar below) */}
      {isTeacherUser && (
        <div className="sticky top-0 z-50 glass-nav">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold text-white font-display">ClassFlow</h1>
              <div className="flex items-center gap-3">
                {auth.getUser() && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white/60">{auth.getUser()?.username}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-accent-500/15 text-accent-300">
                      {auth.getUser()?.role}
                    </span>
                  </div>
                )}
                <button
                  onClick={handleLogout}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  title="Sign out"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Container */}
      <div className="border-b border-white/[0.06] bg-surface">
        <div className={`${containerClass} py-4 lg:py-6 space-y-4 lg:space-y-5`}>
          {/* Title row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-white font-display">Schedule</h2>
            <div className="flex items-center gap-3">
              {/* Action controls */}
              <div className="flex items-center gap-1.5">
                <button
                  className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white bg-accent-600 hover:bg-accent-700 transition-colors"
                  onClick={() => setDay(todayDay())}
                >
                  Today
                </button>
                <button
                  className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-white/60 hover:text-white/90 hover:bg-white/[0.06] transition-colors"
                  onClick={load}
                  disabled={loading || selectedTeacherId === undefined}
                >
                  {loading ? 'Loading…' : 'Reload'}
                </button>
              </div>

              {/* View navigation segmented control */}
              <div className="flex rounded-lg border border-white/[0.06] bg-base/60 p-0.5">
                <button
                  className="rounded-md px-3 py-1.5 text-sm font-semibold bg-white/[0.06] text-white/90 transition-colors"
                  disabled
                >
                  Day
                </button>
                <button
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.04] transition-colors"
                  onClick={() => {
                    const params = new URLSearchParams();
                    if (selectedTeacherId) params.set('teacher', String(selectedTeacherId));
                    if (week) params.set('week', String(week));
                    navigate(`/week?${params.toString()}`);
                  }}
                >
                  Week
                </button>
                <button
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.04] transition-colors"
                  onClick={() => {
                    const params = new URLSearchParams();
                    if (selectedTeacherId) params.set('teacher', String(selectedTeacherId));
                    navigate(`/month?${params.toString()}`);
                  }}
                >
                  Month
                </button>
              </div>
            </div>
          </div>

          {/* Teacher selector + campus pills */}
          <div className="rounded-2xl border border-white/[0.06] bg-elevated px-3 py-3 lg:px-5 lg:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 lg:gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                {(() => {
                  const name = teachers.find((t) => t.teacher_id === selectedTeacherId)?.name || '?';
                  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
                })()}
              </div>
              <select
                className="w-full sm:min-w-[180px] rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white focus:border-accent-500 focus:outline-none"
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
                return (
                  <button
                    key={c.label}
                    className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-all flex-shrink-0
                      ${active
                        ? 'border-accent-500/40 bg-accent-500/15 text-accent-300 shadow-sm'
                        : c.value === 'E1'
                          ? 'border-blue-500/20 text-blue-400/60 hover:bg-blue-500/10 hover:text-blue-400'
                          : c.value === 'E2'
                            ? 'border-emerald-500/20 text-emerald-400/60 hover:bg-emerald-500/10 hover:text-emerald-400'
                            : 'border-white/[0.08] text-white/40 hover:text-white/70 hover:border-white/[0.12]'
                      }`}
                    onClick={() => setCampus(c.value)}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Week navigator */}
          <div className="flex items-center justify-center gap-3">
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] text-white/40 hover:text-white/80 hover:border-white/[0.15] hover:bg-white/[0.04] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={() => setWeek((w) => {
                if (w === undefined) return getWeekNumber(new Date());
                return w > 1 ? w - 1 : 1;
              })}
              disabled={!anchorLoaded}
              aria-label="Previous week"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="rounded-full border border-white/[0.08] bg-white/[0.04] px-5 py-1.5 text-sm font-semibold text-white/80 font-mono">
              {anchorLoaded && week !== undefined && monthWeekInfo
                ? <>Week {monthWeekInfo.weekNumber} | {getWeekDateRange(week)}</>
                : 'Loading current week…'}
            </div>
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] text-white/40 hover:text-white/80 hover:border-white/[0.15] hover:bg-white/[0.04] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={() => setWeek((w) => {
                if (w === undefined) return getWeekNumber(new Date());
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

          {/* Day tabs */}
          <div className="rounded-2xl border border-white/[0.06] bg-elevated px-2 py-2 lg:px-3 lg:py-3">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
              {dayOptions.map((d) => {
                const empty = (dayCounts[d] || 0) === 0;
                const active = day === d;
                const isToday = d === todayDay();
                return (
                  <button
                    key={d}
                    className={`flex-shrink-0 min-w-[60px] px-3 py-2 text-sm font-semibold rounded-lg border transition-all
                      ${active
                        ? 'border-accent-500/40 bg-accent-500/15 text-accent-300 shadow-sm'
                        : isToday
                          ? 'border-accent-500/20 bg-accent-500/[0.06] text-accent-400/80'
                          : empty
                            ? 'border-transparent bg-transparent text-white/20 cursor-not-allowed'
                            : 'border-transparent text-white/50 hover:bg-white/[0.04] hover:text-white/80'
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

      {/* Content */}
      <div className={`${containerClass} py-4`}>
        {/* Error toast */}
        {error && (
          <div className="mb-3 rounded-xl border border-red-500/20 bg-red-500/[0.08] p-3">
            <div className="flex items-start gap-2">
              <div className="text-red-400 text-sm mt-0.5">⚠</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-red-300">Error loading schedule</div>
                <div className="text-xs text-red-400/70">{error}</div>
              </div>
              <button
                className="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors flex-shrink-0"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}
                onClick={load}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (!displayLessons || displayLessons.length === 0) && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl border border-white/[0.06] bg-elevated px-4 py-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="h-5 w-20 skeleton" />
                    <div className="h-4 w-24 skeleton" />
                  </div>
                  <div className="h-6 w-14 skeleton" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && selectedTeacherId !== undefined && displayLessons.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.15)' }}>
              <svg className="w-8 h-8 text-accent-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="text-base font-bold text-white/80 mb-1">No lessons on {day}</div>
            <div className="text-sm text-white/40">Select another day to view schedule</div>
          </div>
        )}

        {/* Day Header */}
        {displayLessons.length > 0 && (
          <div className="mb-4">
            <div className="border-b border-accent-500/20 pb-3">
              <div className="flex items-baseline gap-3 mb-2">
                <div className="text-lg font-bold text-white font-display">{day}</div>
                <div className="text-sm font-semibold text-white/40">{getDayDate(week, day)}</div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="font-semibold text-white/50">{displayLessons.length} lesson{displayLessons.length !== 1 ? 's' : ''}</span>
                <span className="h-3 w-px bg-white/10" aria-hidden="true" />
                <span className="text-accent-400 font-semibold">
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
              const cleanClassCode = l.class_code || 'Unknown Class';
              const coTeachersFromArray = (l.co_teachers || [])
                .filter(name => name && typeof name === 'string')
                .filter(name => !name.includes('\n') && name !== l.teacher_name)
                .filter(name => name.length < 50 && name.length > 1);

              const directCoTeacher = l.co_teacher_name && l.co_teacher_name !== l.teacher_name
                ? l.co_teacher_name
                : null;

              const allCoTeachers = [...coTeachersFromArray];
              if (directCoTeacher && !allCoTeachers.includes(directCoTeacher)) {
                allCoTeachers.push(directCoTeacher);
              }

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
                    ...allCoTeachers.map(name => ({ name, is_primary: false }))
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