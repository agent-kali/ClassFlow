export type TimedLesson = {
  id: string;
  title: string;
  startMinutes: number;
  endMinutes: number;
  room: string;
  campus: string;
  teachers: string[];
};

export type PositionedLesson = TimedLesson & {
  top: number;
  height: number;
  left: string;
  width: string;
};

export const toMinutes = (timeStr: string): number => {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

export const formatTime = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

export const computeDayBounds = (lessons: TimedLesson[]): { start: number; end: number } => {
  if (lessons.length === 0) return { start: 16 * 60, end: 21 * 60 + 30 }; // Default 16:00-21:30
  
  const starts = lessons.map(l => l.startMinutes);
  const ends = lessons.map(l => l.endMinutes);
  const minStart = Math.min(...starts);
  const maxEnd = Math.max(...ends);
  
  // Add 30min padding but constrain to reasonable bounds
  return {
    start: Math.max(16 * 60, minStart - 30), // No earlier than 16:00
    end: Math.min(21 * 60 + 30, maxEnd + 30)  // No later than 21:30
  };
};

// Layout a single day of lessons with non-overlapping horizontal lanes.
// Algorithm: sweep-line over start times, assign the first available lane
// (column) whose previous event ended before the current start. We group
// contiguous overlaps into a "cluster" and then give all events in that
// cluster the same width = 100% / maxConcurrentLanes.
export const layoutDay = (
  lessons: TimedLesson[],
  dayStart: number,
  pxPerMinute: number
): PositionedLesson[] => {
  if (lessons.length === 0) return [];

  const sorted = [...lessons].sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    return a.endMinutes - b.endMinutes;
  });

  // lanes[i] = endMinutes of the event occupying lane i, or -1 if free
  let lanes: number[] = [];

  type ClusterItem = { lesson: TimedLesson; lane: number; top: number; height: number };
  let clusterItems: ClusterItem[] = [];
  let clusterMaxLanes = 0;

  const result: PositionedLesson[] = [];

  const freeLanesUpTo = (minute: number) => {
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] !== -1 && lanes[i] <= minute) lanes[i] = -1;
    }
  };

  const occupiedCount = () => lanes.filter((v) => v !== -1).length;

  const flushCluster = () => {
    if (clusterItems.length === 0) return;
    const widthPct = 100 / Math.max(1, clusterMaxLanes);
    const gapPx = 8; // visual horizontal gap between parallel lanes
    for (const ci of clusterItems) {
      result.push({
        ...ci.lesson,
        top: ci.top,
        height: ci.height,
        left: `calc(${ci.lane * widthPct}% + ${ci.lane * gapPx}px)`,
        width: `calc(${widthPct}% - ${gapPx}px)`,
      });
    }
    // reset for next cluster
    clusterItems = [];
    clusterMaxLanes = 0;
    lanes = [];
  };

  for (let idx = 0; idx < sorted.length; idx++) {
    const ev = sorted[idx];

    // 1) Free any lanes that have finished before this event starts
    freeLanesUpTo(ev.startMinutes);

    // 2) Assign the first free lane (or create a new one)
    let lane = lanes.findIndex((end) => end === -1);
    if (lane === -1) {
      lane = lanes.length;
      lanes.push(ev.endMinutes);
    } else {
      lanes[lane] = ev.endMinutes;
    }

    clusterMaxLanes = Math.max(clusterMaxLanes, occupiedCount());

    const top = (ev.startMinutes - dayStart) * pxPerMinute;
    const height = (ev.endMinutes - ev.startMinutes) * pxPerMinute;
    clusterItems.push({ lesson: ev, lane, top, height });

    // 3) Look ahead: if next event starts after all current lanes end,
    // the cluster ends and we can finalize widths for this cluster.
    const nextStart = idx + 1 < sorted.length ? sorted[idx + 1].startMinutes : Number.POSITIVE_INFINITY;
    freeLanesUpTo(nextStart);
    if (occupiedCount() === 0) {
      flushCluster();
    }
  }

  // Final flush for any remaining items
  flushCluster();

  return result;
};

export const generateTimeMarkers = (
  dayStart: number,
  dayEnd: number,
  pxPerMinute: number,
  intervalMinutes = 30
): Array<{ minutes: number; label: string; top: number }> => {
  const markers = [];
  
  // Round start to nearest interval
  const startInterval = Math.floor(dayStart / intervalMinutes) * intervalMinutes;
  
  for (let minutes = startInterval; minutes <= dayEnd; minutes += intervalMinutes) {
    if (minutes >= dayStart) {
      markers.push({
        minutes,
        label: formatTime(minutes),
        top: (minutes - dayStart) * pxPerMinute
      });
    }
  }
  
  return markers;
};

// Grid placement utilities for CSS Grid layout
export const SLOT_MIN = 30;

const m = (hhmm: string): number => {
  const [h, mm] = hhmm.split(":").map(Number);
  return h * 60 + mm;
};

/**
 * Calculate grid placement for a lesson.
 * - start anchored DOWN to slot boundary (floor)
 * - end pushed UP to next boundary (ceil) so the card spans till the visible border
 * - headerRows: how many non-slot rows у тебя над сеткой (обычно 1)
 */
export function getGridPlacement(
  startHHMM: string,
  endHHMM: string,
  dayStartHHMM: string,
  slotMin = SLOT_MIN,
  headerRows = 1
) {
  const startSlots = Math.floor((m(startHHMM) - m(dayStartHHMM)) / slotMin);
  const endSlots   = Math.ceil((m(endHHMM)   - m(dayStartHHMM)) / slotMin);

  const rowStart = headerRows + 1 + startSlots; // +1 — потому что первая строка слота = 1
  const rowEnd = headerRows + 1 + endSlots; // end должен включать конечный слот
  const rowSpan = Math.max(1, endSlots - startSlots + 1); // inclusive of ending slot

  return { rowStart, rowSpan };
}

/** total number of slot-rows between dayStart..dayEnd (exclusive of the last boundary) */
export function getRowCount(dayStartHHMM: string, dayEndHHMM: string, slotMin = SLOT_MIN) {
  return Math.ceil((m(dayEndHHMM) - m(dayStartHHMM)) / slotMin);
}