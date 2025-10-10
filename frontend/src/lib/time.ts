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
// Updated to September 2025 per current schedule
// Default anchor, but allow override via URL (?anchor=YYYY-MM-DD)
let cachedAnchor: Date | null = null;
export const setAcademicAnchor = (isoDate: string) => {
  cachedAnchor = new Date(`${isoDate}T00:00:00`);
};
export const getAcademicAnchor = (): Date => {
  if (cachedAnchor) return cachedAnchor;
  // Fallback default if not set - updated to September 1st, 2025
  return new Date('2025-09-01T00:00:00');
};

export const getWeekStart = (week: number): Date => {
  const anchor = getAcademicAnchor();
  const start = new Date(anchor);
  start.setDate(anchor.getDate() + (week - 1) * 7);
  start.setHours(0, 0, 0, 0);
  return start;
};

export const getWeekNumber = (date: Date): number => {
  const anchor = getAcademicAnchor();
  const diffTime = date.getTime() - anchor.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
};


