import React from 'react';
import { api } from '../api/client';
import type { LessonOut, Teacher } from '../api/types';

const dayOptions = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
  return <span className={`inline-flex items-center rounded-md font-medium ring-1 ring-inset ${sizeCls} ${map[color]}`}>{children}</span>;
}

export const TeacherTimeline: React.FC = () => {
  const [teachers, setTeachers] = React.useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = React.useState<number | undefined>(() => {
    const saved = localStorage.getItem('selectedTeacherId');
    return saved ? Number(saved) : undefined;
  });
  const [week, setWeek] = React.useState<number | undefined>(1);
  const [day, setDay] = React.useState<string>('Mon');
  const [grouped, setGrouped] = React.useState<boolean>(true);
  const [lessons, setLessons] = React.useState<LessonOut[] | null>(null);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [weekly, setWeekly] = React.useState<LessonOut[] | null>(null);

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
    const filters: Filters = { week, day, grouped };
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
  }, [selectedTeacherId, week, day, grouped]);

  // Fetch weekly overview (for day badges/state) whenever teacher/week changes
  React.useEffect(() => {
    if (selectedTeacherId === undefined) return;
    api
      .getTeacherSchedule(selectedTeacherId, { week, grouped })
      .then(setWeekly)
      .catch(() => setWeekly(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeacherId, week, grouped]);

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

  // Ensure unique + sorted
  const displayLessons = React.useMemo(() => {
    if (!lessons) return [] as LessonOut[];
    const seen = new Set<string>();
    const out: LessonOut[] = [];
    for (const l of lessons) {
      const key = [l.week, l.day, l.start_time, l.end_time, l.class_code, l.campus_name, l.room].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(l);
    }
    out.sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));
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

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-xs text-gray-600">Teacher</label>
            <select
              className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              value={selectedTeacherId ?? ''}
              onChange={(e) => setSelectedTeacherId(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">Select teacher…</option>
              {teachers.map((t) => (
                <option key={t.teacher_id} value={t.teacher_id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600">Week</label>
            <div className="mt-1 flex items-center gap-2">
              <button
                className="rounded-md border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50"
                onClick={() => setWeek((w) => (w && w > 1 ? w - 1 : 1))}
              >
                −
              </button>
              <input
                type="number"
                min={1}
                className="w-20 rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={week ?? ''}
                placeholder="1"
                onChange={(e) => setWeek(e.target.value ? Number(e.target.value) : undefined)}
              />
              <button
                className="rounded-md border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50"
                onClick={() => setWeek((w) => (w ? w + 1 : 1))}
              >
                +
              </button>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2 overflow-x-auto rounded-md bg-gray-50 p-1 text-sm">
            {dayOptions.map((d) => {
              const empty = (dayCounts[d] || 0) === 0;
              const active = day === d;
              const base = 'whitespace-nowrap rounded-md px-3 py-1';
              const style = active
                ? 'bg-indigo-600 text-white'
                : empty
                ? 'text-gray-400'
                : 'text-gray-700 hover:bg-white';
              return (
                <button
                  key={d}
                  className={`${base} ${style}`}
                  title={empty ? 'No lessons (day off)' : ''}
                  onClick={() => setDay(d)}
                >
                  {d}
                </button>
              );
            })}
            <button
              className="ml-1 whitespace-nowrap rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-white"
              onClick={() => setDay(todayDay())}
              title="Jump to today"
            >
              Today
            </button>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" className="h-4 w-4" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
            Group sessions
          </label>
          <button
            onClick={load}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            disabled={selectedTeacherId === undefined || loading}
          >
            {loading ? 'Loading…' : 'Reload'}
          </button>
        </div>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* List of sessions */}
      {displayLessons && displayLessons.length > 0 ? (
        <div className="space-y-3">
          {displayLessons.map((l, idx) => (
            <div
              key={`${l.week}-${l.day}-${l.start_time}-${idx}`}
              className={`flex items-center justify-between rounded-2xl border ${
                isNowSlot(l) ? 'border-indigo-300 ring-2 ring-indigo-200' : 'border-gray-200'
              } bg-white p-5 shadow-sm`}
            >
              <div className="flex items-center gap-3">
                <div className={`h-8 w-1 rounded-full ${campusBar(l.campus_name)}`} />
                <Badge color={campusColor(l.campus_name)} size="md">{l.campus_name}</Badge>
                <Badge color="amber" size="md">{l.room || 'TBD'}</Badge>
                <div className="text-lg font-semibold text-gray-900 tabular-nums">
                  {l.start_time}–{l.end_time}
                </div>
                <div className="text-base text-gray-800">
                  {l.class_code}
                  {l.co_teachers && l.co_teachers.length ? (
                    <span className="text-gray-600"> — {l.co_teachers.join(', ')}</span>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                {l.co_teachers && l.co_teachers.length > 0 && (
                  <span title={`Co-teachers: ${l.co_teachers.join(', ')}`}>
                    Co: {l.co_teachers.join(', ')}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
          {selectedTeacherId !== undefined ? 'No lessons found for current filters.' : 'Choose a teacher to load schedule.'}
        </div>
      )}
    </div>
  );
};

export default TeacherTimeline;


