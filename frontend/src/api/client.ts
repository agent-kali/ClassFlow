const DEFAULT_BASE_URL = 'http://localhost:8000';

const baseUrl =
  (typeof import.meta !== 'undefined' &&
    (import.meta as any).env &&
    (import.meta as any).env.VITE_API_BASE_URL) ||
  DEFAULT_BASE_URL;

function toQuery(params: Record<string, unknown>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, String(value));
  });
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export type ScheduleFilter = {
  week?: number;
  day?: string;
  campus?: string;
  grouped?: boolean;
};

import type { LessonOut, Teacher, ClassInfo } from './types';

export const api = {
  listTeachers: () => fetchJson<Teacher[]>('/teachers'),
  listClasses: () => fetchJson<ClassInfo[]>('/classes'),
  getTeacherSchedule: (teacherId: number, filter: ScheduleFilter = {}) =>
    fetchJson<LessonOut[]>(`/my/${teacherId}${toQuery(filter)}`),
  getClassSchedule: (classId: number, filter: ScheduleFilter = {}) =>
    fetchJson<LessonOut[]>(`/class/${classId}${toQuery(filter)}`),
};

export { baseUrl };



