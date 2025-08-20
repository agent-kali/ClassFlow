import React from 'react';
import { api } from '../api/client';
import type { LessonOut, Teacher } from '../api/types';
import LessonCard from './LessonCard';
import { Link, useNavigate, useLocation } from 'react-router-dom';

const dayOptions = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayOrder: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

type Filters = {
  week?: number;
  day?: string;
  campus?: string;
  grouped?: boolean;
};

function Badge({ children, color = 'indigo', size = 'xs' }: { children: React.ReactNode; color?: 'indigo' | 'emerald' | 'sky' | 'rose' | 'amber'; size?: 'xs' | 'md' }) {
  const map: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    sky: 'bg-sky-50 text-sky-700 ring-sky-200',
    rose: 'bg-rose-50 text-rose-700 ring-rose-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  };
  const sizeCls = size === 'md' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs';
  return (
    <span
      tabIndex={0}
      className={`inline-flex items-center rounded-md font-medium ring-1 ring-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange-600 ${sizeCls} ${map[color]}`}
    >
      {children}
    </span>
  );
}

export const TeacherTimeline: React.FC = () => {
  const [teachers, setTeachers] = React.useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = React.useState<number | undefined>(() => {
    const saved = localStorage.getItem('selectedTeacherId');
    return saved ? Number(saved) : undefined;
  });
  const [week, setWeek] = React.useState<number | undefined>(1);
  const [day, setDay] = React.useState<string>('Mon');
  const [campus, setCampus] = React.useState<string | undefined>(undefined);
  const [grouped, setGrouped] = React.useState<boolean>(true);
  const [lessons, setLessons] = React.useState<LessonOut[] | null>(null);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [weekly, setWeekly] = React.useState<LessonOut[] | null>(null);
  const [scrolled, setScrolled] = React.useState<boolean>(false);
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  React.useEffect(() => {
    api
      .listTeachers()
      .then((list) => {
        setTeachers(list);
        if (selectedTeacherId === undefined) {
          const dan = list.find((t) => t.name.toLowerCase().includes('daniel'));
          if (dan) setSelectedTeacherId(dan.teacher_id);
        }
      })
      .catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const campusColor = (campus?: string): 'indigo' | 'emerald' | 'sky' | 'rose' | 'amber' => {
    if (!campus) return 'indigo';
    if (campus.startsWith('E1')) return 'emerald';
    if (campus.startsWith('E2')) return 'sky';
    return 'indigo';
  };

  const campusBar = (campus?: string): string => {
    if (!campus) return 'bg-indigo-500';
    if (campus.startsWith('E1')) return 'bg-emerald-500';
    if (campus.startsWith('E2')) return 'bg-sky-500';
    return 'bg-indigo-500';
  };

  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const todayDay = (): string => {
    const idx = new Date().getDay(); // 0 Sun .. 6 Sat
    return dayOptions[(idx + 6) % 7]; // shift so Mon=0
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
    const out: LessonOut[] = [];
    for (const l of lessons) {
      // Deduplicate by week|day|start|end|class|campus (ignore room differences)
      const key = [l.week, l.day, l.start_time, l.end_time, l.class_code, l.campus_name].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(l);
    }
    out.sort((a, b) => {
      if (a.week !== b.week) return a.week - b.week;
      const da = dayOrder[a.day] ?? 0;
      const db = dayOrder[b.day] ?? 0;
      if (da !== db) return da - db;
      return toMinutes(a.start_time) - toMinutes(b.start_time);
    });
    return out;
  }, [lessons]);

  // Day -> number of lessons map for the current week
  const dayCounts = React.useMemo(() => {
    const counts: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    (weekly || []).forEach((l) => {
      counts[l.day] = (counts[l.day] || 0) + 1;
    });
    return counts;
  }, [weekly]);

  // Group lessons by day for sticky headers
  const lessonsByDay = React.useMemo(() => {
    const groups: Record<string, LessonOut[]> = {};
    for (const l of displayLessons) {
      (groups[l.day] ||= []).push(l);
    }
    Object.values(groups).forEach((arr) => arr.sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time)));
    return Object.entries(groups).sort((a, b) => (dayOrder[a[0]] ?? 0) - (dayOrder[b[0]] ?? 0));
  }, [displayLessons]);

  return (
    <div className="min-h-screen">
      {/* Row 1: App bar */}
      <div className={`elevated-on-scroll ${scrolled ? 'is-scrolled' : ''} sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur`} style={{ height: 'var(--app-bar-height)' }}>
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold text-gray-900">E‑Home Schedule</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-md bg-brand-orange-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-orange-700"
              onClick={() => setDay(todayDay())}
              title="Jump to today"
            >
              Today
            </button>
            <button
              onClick={load}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              disabled={selectedTeacherId === undefined || loading}
              aria-busy={loading}
            >
              {loading ? 'Loading…' : 'Reload'}
            </button>
            <button
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
        </div>
      </div>

      {/* Row 2: Filter bar */}
      <div className="sticky z-40 border-b border-gray-200 bg-white/95 backdrop-blur" style={{ top: 'var(--app-bar-height)', height: 'var(--filter-bar-height)' }}>
        <div className="mx-auto flex h-full max-w-6xl items-center gap-4 overflow-x-auto px-4 sm:px-6">
          {/* Teacher selector (pill with initials) */}
          <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">
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
              className="bg-transparent text-sm text-gray-800 focus:outline-none"
              value={selectedTeacherId ?? ''}
              onChange={(e) => setSelectedTeacherId(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">Teacher…</option>
              {teachers.map((t) => (
                <option key={t.teacher_id} value={t.teacher_id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Week segmented 1–5 with arrows */}
          <div className="flex items-center gap-2">
            <button
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm hover:bg-gray-50"
              onClick={() => setWeek((w) => (w && w > 1 ? w - 1 : 1))}
              aria-label="Previous week"
            >
              ‹
            </button>
            <div className="isolate flex overflow-hidden rounded-md border border-gray-300">
              {[1, 2, 3, 4, 5].map((w) => (
                <button
                  key={w}
                  className={`w-10 px-0 py-1.5 text-sm font-medium ${week === w ? 'bg-brand-orange-700 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  aria-pressed={week === w}
                  onClick={() => setWeek(w)}
                >
                  {w}
                </button>
              ))}
            </div>
            <button
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm hover:bg-gray-50"
              onClick={() => setWeek((w) => (w ? Math.min(w + 1, 5) : 1))}
              aria-label="Next week"
            >
              ›
            </button>
          </div>

          {/* Campus pills */}
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
                  className={`rounded-full px-3 py-1.5 text-sm ${active ? 'bg-brand-orange-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  onClick={() => setCampus(c.value)}
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          {/* Day segmented control */}
          <div className="ml-auto flex items-center gap-0 overflow-x-auto rounded-md border border-gray-300">
            {dayOptions.map((d) => {
              const empty = (dayCounts[d] || 0) === 0;
              const active = day === d;
              return (
                <button
                  key={d}
                  className={`w-12 px-0 py-1.5 text-sm font-medium ${
                    active ? 'bg-brand-orange-700 text-white' : empty ? 'bg-white text-gray-400' : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
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

      {/* Content */}
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {error && (
          <div className="mb-4 flex items-start justify-between rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <span>{error}</span>
            <button className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-500" onClick={load}>Retry</button>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (!displayLessons || displayLessons.length === 0) && (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-2 h-4 w-1/3 rounded bg-gray-200"></div>
                <div className="h-4 w-1/2 rounded bg-gray-200"></div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && selectedTeacherId !== undefined && displayLessons.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">No lessons</div>
        )}

        {/* Timeline grouped by day with sticky headers */}
        {displayLessons.length > 0 && (
          <div className="space-y-6">
            {lessonsByDay.map(([dayLabel, items]) => (
              <section key={dayLabel}>
                <div
                  className="sticky z-10 -mx-4 border-b border-gray-200 bg-gray-50/80 px-4 py-2 text-sm font-semibold text-gray-700 backdrop-blur sm:mx-0 sm:rounded-t-md"
                  style={{ top: 'calc(var(--app-bar-height) + var(--filter-bar-height))' }}
                >
                  {dayLabel}
                </div>
                <div className="space-y-3 pt-2">
                  {items.map((l, idx) => (
                    <LessonCard
                      key={`${l.week}-${l.day}-${l.start_time}-${idx}`}
                      title={l.co_teachers && l.co_teachers.length ? `${l.co_teachers.join(' - ')} - ${l.class_code}` : l.class_code}
                      start={l.start_time}
                      end={l.end_time}
                      room={l.room || 'TBD'}
                      campus={l.campus_name}
                      teachers={[l.teacher_name, ...(l.co_teachers || [])]}
                      isNow={isNowSlot(l)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherTimeline;


