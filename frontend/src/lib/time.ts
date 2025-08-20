export const toMinutes = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export const minutesToSlotIndex = (minutes: number, startMinutes: number, slotMinutes: number): number => {
  return Math.floor((minutes - startMinutes) / slotMinutes);
};

export const range = (start: number, end: number, step = 1): number[] => {
  const out: number[] = [];
  for (let v = start; v <= end; v += step) out.push(v);
  return out;
};

export const dayOrder: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

// Academic calendar helpers
// Anchor Week 1 to the Monday of the first academic week
// Example: 2025-08-04 (Mon) per the provided Excel
export const ACADEMIC_START = new Date('2025-08-04T00:00:00');

export const getWeekStart = (week: number): Date => {
  const start = new Date(ACADEMIC_START);
  start.setDate(ACADEMIC_START.getDate() + (Math.max(1, week) - 1) * 7);
  start.setHours(0, 0, 0, 0);
  return start;
};


