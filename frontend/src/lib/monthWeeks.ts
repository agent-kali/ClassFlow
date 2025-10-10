/**
 * Month-based week system utilities
 * Weeks start on Monday and are numbered within each month (1st, 2nd, 3rd, 4th, 5th week)
 */

export interface MonthWeek {
  weekNumber: number; // 1, 2, 3, 4, or 5 within the month
  startDate: Date;
  endDate: Date;
  month: number; // 1-12
  year: number;
  displayName: string; // "Week 1 (Jan 2-8)"
}

export interface MonthWeekRange {
  month: number;
  year: number;
  weeks: MonthWeek[];
}

/**
 * Get the first Monday of a month (or the 1st if it's already Monday)
 */
export function getFirstMondayOfMonth(year: number, month: number): Date {
  const firstDay = new Date(year, month - 1, 1);
  const dayOfWeek = firstDay.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // If it's Sunday (0), start from Monday (2nd)
  // If it's Monday (1), start from 1st
  // Otherwise, find the next Monday
  if (dayOfWeek === 0) {
    return new Date(year, month - 1, 2); // Sunday -> Monday (2nd)
  } else if (dayOfWeek === 1) {
    return new Date(year, month - 1, 1); // Monday -> Monday (1st)
  } else {
    // Tuesday-Saturday: find next Monday
    const daysUntilMonday = (8 - dayOfWeek) % 7;
    return new Date(year, month - 1, 1 + daysUntilMonday);
  }
}

/**
 * Get all weeks for a given month
 */
export function getWeeksForMonth(year: number, month: number): MonthWeek[] {
  const weeks: MonthWeek[] = [];
  const firstMonday = getFirstMondayOfMonth(year, month);
  
  let currentWeekStart = new Date(firstMonday);
  let weekNumber = 1;
  
  // Continue until we're past the month
  while (currentWeekStart.getMonth() === month - 1) {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6); // Sunday
    
    // Only include weeks that have at least one day in the current month
    if (currentWeekStart.getMonth() === month - 1 || weekEnd.getMonth() === month - 1) {
      const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'short' });
      const startDay = currentWeekStart.getDate();
      const endDay = weekEnd.getDate();
      
      weeks.push({
        weekNumber,
        startDate: new Date(currentWeekStart),
        endDate: new Date(weekEnd),
        month,
        year,
        displayName: `Week ${weekNumber} (${monthName} ${startDay}-${endDay})`
      });
    }
    
    // Move to next week
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    weekNumber++;
  }
  
  return weeks;
}

/**
 * Find which week a specific date belongs to within a month
 */
export function getWeekForDate(date: Date): MonthWeek | null {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const weeks = getWeeksForMonth(year, month);
  
  for (const week of weeks) {
    if (date >= week.startDate && date <= week.endDate) {
      return week;
    }
  }
  
  return null;
}

/**
 * Get week by week number within a month
 */
export function getWeekByNumber(year: number, month: number, weekNumber: number): MonthWeek | null {
  const weeks = getWeeksForMonth(year, month);
  return weeks.find(w => w.weekNumber === weekNumber) || null;
}

/**
 * Get current month and week
 */
export function getCurrentMonthWeek(): { month: number; year: number; weekNumber: number } {
  const now = new Date();
  const week = getWeekForDate(now);
  
  if (week) {
    return {
      month: week.month,
      year: week.year,
      weekNumber: week.weekNumber
    };
  }
  
  // Fallback to current month, week 1
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    weekNumber: 1
  };
}

/**
 * Convert month/week to a unique identifier for database storage
 */
export function monthWeekToId(year: number, month: number, weekNumber: number): string {
  return `${year}-${month.toString().padStart(2, '0')}-${weekNumber}`;
}

/**
 * Parse month/week ID back to components
 */
export function monthWeekFromId(id: string): { year: number; month: number; weekNumber: number } | null {
  const parts = id.split('-');
  if (parts.length !== 3) return null;
  
  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]);
  const weekNumber = parseInt(parts[2]);
  
  if (isNaN(year) || isNaN(month) || isNaN(weekNumber)) return null;
  
  return { year, month, weekNumber };
}

/**
 * Get month name and year display
 */
export function getMonthYearDisplay(year: number, month: number): string {
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Get available weeks for a month (for dropdowns)
 */
export function getAvailableWeeks(year: number, month: number): Array<{ value: number; label: string }> {
  const weeks = getWeeksForMonth(year, month);
  return weeks.map(week => ({
    value: week.weekNumber,
    label: week.displayName
  }));
}

/**
 * Check if a date falls within a specific month week
 */
export function isDateInMonthWeek(date: Date, year: number, month: number, weekNumber: number): boolean {
  const week = getWeekByNumber(year, month, weekNumber);
  if (!week) return false;
  
  return date >= week.startDate && date <= week.endDate;
}

/**
 * Get next/previous month with year rollover
 */
export function getAdjacentMonth(year: number, month: number, direction: 'next' | 'prev'): { year: number; month: number } {
  if (direction === 'next') {
    if (month === 12) {
      return { year: year + 1, month: 1 };
    } else {
      return { year, month: month + 1 };
    }
  } else {
    if (month === 1) {
      return { year: year - 1, month: 12 };
    } else {
      return { year, month: month - 1 };
    }
  }
}

