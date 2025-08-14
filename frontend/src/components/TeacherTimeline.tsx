import React from 'react';
import { api } from '../api/client';
import type { LessonOut, Teacher } from '../api/types';

const dayOptions = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

type Filters = {
  week?: number;
  day?: string;
  campus?: string;
  grouped?: boolean;
};

export const TeacherTimeline: React.FC = () => {
  const [teachers, setTeachers] = React.useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = React.useState<number | undefined>(undefined);
  const [week, setWeek] = React.useState<number | undefined>(undefined);
  const [day, setDay] = React.useState<string>('Mon');
  const [grouped, setGrouped] = React.useState<boolean>(true);
  const [lessons, setLessons] = React.useState<LessonOut[] | null>(null);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    api
      .listTeachers()
      .then(setTeachers)
      .catch((e) => setError(String(e)));
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
    // auto-load when teacher is selected
    if (selectedTeacherId !== undefined) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeacherId, week, day, grouped]);

  // Determine timeline bounds
  const [minTime, maxTime] = React.useMemo(() => {
    if (!lessons || lessons.length === 0) return [8 * 60, 21 * 60];
    const mins = lessons.map((l) => toMinutes(l.start_time));
    const maxs = lessons.map((l) => toMinutes(l.end_time));
    const min = Math.min(...mins);
    const max = Math.max(...maxs);
    // pad by 30 minutes
    return [Math.max(0, min - 30), Math.min(24 * 60, max + 30)];
  }, [lessons]);

  const range = maxTime - minTime || 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-sm text-gray-600">Teacher</label>
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
          <label className="block text-sm text-gray-600">Week</label>
          <input
            type="number"
            min={1}
            className="mt-1 w-24 rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={week ?? ''}
            placeholder="e.g. 1"
            onChange={(e) => setWeek(e.target.value ? Number(e.target.value) : undefined)}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600">Day</label>
          <select
            className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          >
            {dayOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
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

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* Timeline */}
      {lessons && lessons.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              Showing {lessons.length} item(s) for {day} {week ? `(Week ${week})` : ''}
            </span>
            <span>
              Time range: {Math.floor(minTime / 60)}:{String(minTime % 60).padStart(2, '0')}–
              {Math.floor(maxTime / 60)}:{String(maxTime % 60).padStart(2, '0')}
            </span>
          </div>
          <div className="relative w-full rounded-lg border border-gray-200 bg-white p-4">
            <div className="relative h-24">
              {/* grid hours */}
              {Array.from({ length: Math.ceil((maxTime - minTime) / 60) + 1 }).map((_, idx) => {
                const minutes = minTime + idx * 60;
                const left = ((minutes - minTime) / range) * 100;
                const label = `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
                return (
                  <div key={idx} className="absolute top-0 h-full" style={{ left: `${left}%` }}>
                    <div className="h-full border-l border-gray-200" />
                    <div className="-translate-x-1/2 pt-1 text-[10px] text-gray-500">{label}</div>
                  </div>
                );
              })}

              {/* events */}
              {lessons.map((l, i) => {
                const start = toMinutes(l.start_time);
                const end = toMinutes(l.end_time);
                const left = ((start - minTime) / range) * 100;
                const width = ((end - start) / range) * 100;
                return (
                  <div
                    key={`${l.start_time}-${l.end_time}-${i}`}
                    className="absolute top-6 rounded-md bg-indigo-600/80 px-2 py-1 text-xs text-white"
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${l.start_time}–${l.end_time} ${l.class_code} (${l.campus_name}${l.room ? `, room ${l.room}` : ''})`}
                  >
                    <div className="truncate">
                      {l.start_time}–{l.end_time} • {l.class_code} • {l.campus_name}
                      {l.room ? ` • Room ${l.room}` : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
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


