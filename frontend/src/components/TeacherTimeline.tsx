import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, auth } from '../api/client';
import type { LessonCreate, LessonOut, LessonUpdate, Teacher } from '../api/types';
import LessonCard from './LessonCard';
import LessonModal from './LessonModal';
import SchedulePageHeader from './SchedulePageHeader';
import { type ScheduleViewMode } from './ScheduleViewSwitcher';
import SidebarLayout from './SidebarLayout';
import SidebarSection from './SidebarSection';
import { format, addDays } from 'date-fns';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { getInitials } from '../lib/avatar';
import { getWeekStart, setAcademicAnchor, getWeekNumber } from '../lib/time';
import { getWeekForDate } from '../lib/monthWeeks';
import {
  dayOptions,
  formatScheduleDate,
  getDateForWeekDay,
  getScheduleDay,
  parseScheduleDate,
  setScheduleDateParam,
  type ScheduleDay,
} from '../lib/scheduleDate';

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

type FeedbackState = {
  type: 'success' | 'error';
  message: string;
};

export const TeacherTimeline: React.FC = () => {
  const currentUser = auth.getUser();
  const canEdit = React.useMemo(() => auth.hasAnyRole(['manager', 'admin']), []);
  const [params, setParams] = useSearchParams();
  const selectedTeacherStorageKey = currentUser
    ? `selectedTeacherId:${currentUser.username}`
    : 'selectedTeacherId';
  const [teachers, setTeachers] = React.useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = React.useState<number | undefined>(() => {
    const saved = localStorage.getItem(selectedTeacherStorageKey);
    return saved ? Number(saved) : undefined;
  });
  const [week, setWeek] = React.useState<number | undefined>(undefined);
  const [anchorLoaded, setAnchorLoaded] = React.useState<boolean>(false);
  const [day, setDay] = React.useState<ScheduleDay>('Mon');
  const [campus, setCampus] = React.useState<string | undefined>(undefined);
  const [grouped, setGrouped] = React.useState<boolean>(true);
  const [lessons, setLessons] = React.useState<LessonOut[] | null>(null);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [weekly, setWeekly] = React.useState<LessonOut[] | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState<boolean>(false);
  const [isSaving, setIsSaving] = React.useState<boolean>(false);
  const [feedback, setFeedback] = React.useState<FeedbackState | null>(null);

  const teacherIdsKey = React.useMemo(
    () => teachers.map((t) => t.teacher_id).join(','),
    [teachers],
  );

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
  }, [selectedTeacherStorageKey, selectedTeacherId]);

  React.useEffect(() => {
    api.getAnchor()
      .then(({ anchor_date }) => {
        setAcademicAnchor(anchor_date);
        setAnchorLoaded(true);
        const legacyWeek = Number(params.get('week'));
        const selectedDate = parseScheduleDate(params.get('date')) ||
          (Number.isFinite(legacyWeek) && legacyWeek >= 1 ? getWeekStart(legacyWeek) : new Date());

        setWeek(getWeekNumber(selectedDate));
        setDay(getScheduleDay(selectedDate));

        if (!parseScheduleDate(params.get('date'))) {
          const nextParams = new URLSearchParams(params);
          setScheduleDateParam(nextParams, selectedDate);
          setParams(nextParams, { replace: true });
        }
      })
      .catch((err) => {
        console.warn('Failed to fetch calendar anchor:', err);
        setAnchorLoaded(true);
        const selectedDate = parseScheduleDate(params.get('date')) || new Date();
        setWeek(getWeekNumber(selectedDate));
        setDay(getScheduleDay(selectedDate));

        if (!parseScheduleDate(params.get('date'))) {
          const nextParams = new URLSearchParams(params);
          setScheduleDateParam(nextParams, selectedDate);
          setParams(nextParams, { replace: true });
        }
      });
  }, []);

  React.useEffect(() => {
    if (!anchorLoaded) return;

    const selectedDate = parseScheduleDate(params.get('date'));
    if (!selectedDate) return;

    const nextWeek = getWeekNumber(selectedDate);
    const nextDay = getScheduleDay(selectedDate);

    if (week !== nextWeek) setWeek(nextWeek);
    if (day !== nextDay) setDay(nextDay);
  }, [anchorLoaded, day, params, week]);

  async function load() {
    if (selectedTeacherId === undefined) return;
    if (!anchorLoaded || week === undefined) return;
    if (!teachers.some((teacher) => teacher.teacher_id === selectedTeacherId)) return;
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
      localStorage.setItem(selectedTeacherStorageKey, String(selectedTeacherId));
      load();
    }
  }, [selectedTeacherId, week, day, campus, grouped, anchorLoaded, teacherIdsKey, selectedTeacherStorageKey]);

  const loadWeeklyOverview = React.useCallback(() => {
    if (selectedTeacherId === undefined) return;
    if (!anchorLoaded || week === undefined) return;
    if (!teachers.some((teacher) => teacher.teacher_id === selectedTeacherId)) return;

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
  }, [anchorLoaded, campus, grouped, selectedTeacherId, teachers, week]);

  React.useEffect(() => {
    loadWeeklyOverview();
  }, [loadWeeklyOverview]);

  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const todayDay = (): ScheduleDay => getScheduleDay(new Date());

  const updateSelectedDate = React.useCallback((date: Date) => {
    const nextParams = new URLSearchParams(params);
    setScheduleDateParam(nextParams, date);
    if (selectedTeacherId) nextParams.set('teacher', String(selectedTeacherId));
    setParams(nextParams, { replace: true });
  }, [params, selectedTeacherId, setParams]);

  const selectWeek = React.useCallback((nextWeek: number) => {
    const effectiveWeek = Math.max(1, nextWeek);
    setWeek(effectiveWeek);
    updateSelectedDate(getDateForWeekDay(effectiveWeek, day));
  }, [day, updateSelectedDate]);

  const selectDay = React.useCallback((nextDay: ScheduleDay) => {
    setDay(nextDay);
    if (week !== undefined) {
      updateSelectedDate(getDateForWeekDay(week, nextDay));
    }
  }, [updateSelectedDate, week]);

  const selectToday = React.useCallback(() => {
    const today = new Date();
    setWeek(getWeekNumber(today));
    setDay(getScheduleDay(today));
    updateSelectedDate(today);
  }, [updateSelectedDate]);

  const getWeekDateRange = (weekNum: number): string => {
    const weekStart = getWeekStart(weekNum);
    const weekEnd = addDays(weekStart, 6);
    return `${format(weekStart, 'dd/MM')} - ${format(weekEnd, 'dd/MM')}`;
  };

  const getDayDate = (weekNum: number | undefined, dayName: ScheduleDay): string => {
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

  const totalTeachingMinutes = React.useMemo(() => {
    return displayLessons.reduce((sum, l) => {
      return sum + (toMinutes(l.end_time) - toMinutes(l.start_time));
    }, 0);
  }, [displayLessons]);

  const nextLessonTime = React.useMemo(() => {
    if (day !== todayDay()) return null;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const upcoming = displayLessons.find(l => toMinutes(l.start_time) > nowMin);
    return upcoming ? upcoming.start_time.slice(0, 5) : null;
  }, [displayLessons, day]);

  const formatHours = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  const prepareViewParams = React.useCallback((_targetView: ScheduleViewMode, params: URLSearchParams) => {
    if (selectedTeacherId) params.set('teacher', String(selectedTeacherId));
    const selectedDate = week !== undefined
      ? getDateForWeekDay(week, day)
      : parseScheduleDate(params.get('date')) || new Date();
    params.set('date', formatScheduleDate(selectedDate));
    params.delete('week');
    params.delete('month');
    params.delete('year');
  }, [day, selectedTeacherId, week]);

  const dayNameMap: Record<string, string> = {
    Mon: 'Monday',
    Tue: 'Tuesday',
    Wed: 'Wednesday',
    Thu: 'Thursday',
    Fri: 'Friday',
    Sat: 'Saturday',
    Sun: 'Sunday',
  };
  const selectedTeacherName = teachers.find((t) => t.teacher_id === selectedTeacherId)?.name;

  const openCreateModal = () => {
    if (!canEdit) return;
    setFeedback(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const handleSaveLesson = async (payload: LessonCreate | LessonUpdate) => {
    try {
      setIsSaving(true);
      await api.createLesson(payload as LessonCreate);
      setFeedback({ type: 'success', message: 'Lesson created successfully.' });
      closeModal();
      await load();
      loadWeeklyOverview();
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to create lesson.' });
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  /* ─── Sidebar ─── */
  const sidebarContent = (
    <>
      {/* Teacher selector */}
      <SidebarSection label="Teacher">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            {getInitials(selectedTeacherName)}
          </div>
          <div className="relative min-w-0 flex-1">
            <select
              className="w-full appearance-none bg-transparent py-1.5 pl-0 pr-7 text-sm font-semibold text-white focus:outline-none truncate cursor-pointer"
              value={selectedTeacherId ?? ''}
              onChange={(e) => setSelectedTeacherId(e.target.value ? Number(e.target.value) : undefined)}
              title={selectedTeacherName || 'Select Teacher'}
            >
              <option value="">Select Teacher…</option>
              {teachers.map((t) => (
                <option key={t.teacher_id} value={t.teacher_id}>
                  {t.name}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
          </div>
        </div>
      </SidebarSection>

      {/* Campus filter */}
      <SidebarSection label="Campus">
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { label: 'All', value: undefined },
            { label: 'E1', value: 'E1' },
            { label: 'E2', value: 'E2' },
          ].map((c) => {
            const active = campus === c.value || (c.value === undefined && campus === undefined);
            return (
              <button
                key={c.label}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-all
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
      </SidebarSection>

      {/* Week navigator */}
      <SidebarSection label="Week">
        <div className="flex items-center justify-between gap-2">
          <button
            className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/[0.08] text-white/40 hover:text-white/80 hover:border-white/[0.15] hover:bg-white/[0.04] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            onClick={() => selectWeek(week === undefined ? getWeekNumber(new Date()) : week - 1)}
            disabled={!anchorLoaded}
            aria-label="Previous week"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="text-center min-w-0">
            <div className="text-sm font-semibold text-white/80 font-mono truncate">
              {anchorLoaded && week !== undefined && monthWeekInfo
                ? <>Week {monthWeekInfo.weekNumber}</>
                : '…'}
            </div>
            <div className="text-[11px] text-white/40 truncate">
              {anchorLoaded && week !== undefined ? getWeekDateRange(week) : ''}
            </div>
          </div>
          <button
            className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/[0.08] text-white/40 hover:text-white/80 hover:border-white/[0.15] hover:bg-white/[0.04] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            onClick={() => selectWeek(week === undefined ? getWeekNumber(new Date()) : week + 1)}
            disabled={!anchorLoaded}
            aria-label="Next week"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </SidebarSection>

      {/* Vertical day list */}
      <SidebarSection label="Days">
        <div className="space-y-1">
          {dayOptions.map((d) => {
            const count = dayCounts[d] || 0;
            const active = day === d;
            const isToday = d === todayDay();
            const empty = count === 0;

            return (
              <button
                key={d}
                onClick={() => selectDay(d)}
                className={`w-full flex cursor-default items-center justify-between px-3 py-2 rounded-lg text-sm transition-all
                  ${active
                    ? 'bg-accent-500/15 text-accent-300 border border-accent-500/30'
                    : isToday
                      ? 'bg-accent-500/[0.06] text-accent-400 border border-transparent'
                      : empty
                        ? 'text-white/15 opacity-50 border border-transparent'
                        : 'text-white/60 hover:bg-white/[0.04] hover:text-white/80 border border-transparent'
                  }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isToday && <div className="w-1.5 h-1.5 rounded-full bg-accent-400 flex-shrink-0" />}
                  <span className="font-semibold">{d}</span>
                  <span className="text-[11px] text-white/30 truncate">{getDayDate(week, d)}</span>
                </div>
                {count > 0 && (
                  <span className={`text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0
                    ${active ? 'bg-accent-500/30 text-accent-300' : 'bg-white/[0.06] text-white/40'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </SidebarSection>

      {/* Divider */}
      <div className="border-t border-white/[0.06]" />

      {/* Day summary */}
      <SidebarSection label="Day Summary">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40">Lessons</span>
            <span className="text-sm font-semibold text-white/80">{displayLessons.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40">Teaching time</span>
            <span className="text-sm font-semibold text-white/80">{formatHours(totalTeachingMinutes)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40">Next lesson</span>
            <span className="text-sm font-semibold text-white/80">{nextLessonTime || '—'}</span>
          </div>
        </div>
      </SidebarSection>
    </>
  );

  return (
    <SidebarLayout sidebar={sidebarContent}>
      <SchedulePageHeader
        activeView="day"
        onToday={selectToday}
        onReload={load}
        isReloading={loading}
        canReload={selectedTeacherId !== undefined}
        canAddLesson={canEdit}
        onAddLesson={openCreateModal}
        prepareViewParams={prepareViewParams}
      />

      {/* Lessons content */}
      <div className="px-4 lg:px-6 py-4">
        <div className="max-w-3xl">
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

        {feedback && (
          <div
            className={`mb-3 rounded-xl border p-3 text-sm ${
              feedback.type === 'success'
                ? 'border-green-500/20 bg-green-500/[0.08] text-green-300'
                : 'border-red-500/20 bg-red-500/[0.08] text-red-400'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="flex-1">{feedback.message}</span>
              <button type="button" className="text-xs font-medium underline" onClick={() => setFeedback(null)}>
                Dismiss
              </button>
            </div>
          </div>
        )}

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

        {!loading && selectedTeacherId !== undefined && displayLessons.length === 0 && (
          <div className="rounded-2xl border border-white/[0.06] bg-elevated px-6 py-12 text-center shadow-card">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.15)' }}>
              <svg className="w-8 h-8 text-accent-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="text-base font-bold text-white/80 mb-1">No lessons on {day}</div>
            <div className="text-sm text-white/40">
              {canEdit ? 'Add the first lesson for this day.' : 'Select another day to view schedule'}
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={openCreateModal}
                className="mt-5 inline-flex items-center justify-center rounded-lg border border-accent-400/30 bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-accent-950/20 transition-all hover:bg-accent-400 hover:shadow-accent-500/20 active:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-400/60 focus:ring-offset-2 focus:ring-offset-elevated"
              >
                + Add Lesson
              </button>
            )}
          </div>
        )}

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

      {canEdit && (
        <LessonModal
          isOpen={isModalOpen}
          onClose={closeModal}
          onSave={handleSaveLesson}
          defaultTeacherId={selectedTeacherId}
          defaultWeek={monthWeekInfo?.weekNumber ?? week ?? 1}
          defaultDay={dayNameMap[day] ?? day}
          defaultMonth={monthWeekInfo?.month}
          defaultYear={monthWeekInfo?.year}
          defaultWeekNumber={monthWeekInfo?.weekNumber}
          isSaving={isSaving}
        />
      )}
    </SidebarLayout>
  );
};

export default TeacherTimeline;
