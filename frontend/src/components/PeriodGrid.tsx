import React from "react";
import type { LessonOut } from "@/api/types";
import { toMinutes, getGridPlacement, SLOT_MIN, formatTime } from "@/lib/layout";
import { format } from "date-fns";
import { PlusIcon, PencilSquareIcon, TrashIcon } from "@heroicons/react/24/solid";

type PeriodGridProps = {
  weekStartISO: string; // Monday 00:00 of the shown week
  lessons: LessonOut[];
  dayStart: string; // e.g., "17:00"
  dayEnd: string; // e.g., "21:00"
  periodMinutes?: number; // default 30
  selectedDay?: number; // 0 = Monday, 1 = Tuesday, etc.
  isEditMode?: boolean;
  onSlotClick?: (day: string, time: string) => void;
  onLessonEdit?: (lesson: LessonOut) => void;
  onLessonDelete?: (lesson: LessonOut) => void;
};

const DAYS: Array<"Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun"> = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];

function dayLabel(weekStartISO: string, dow: number): { label: string; date: string } {
  const start = new Date(weekStartISO);
  const d = new Date(start);
  d.setDate(start.getDate() + dow);
  return {
    label: DAYS[dow].toUpperCase(),
    date: format(d, "MMM d"),
  };
}

export default function PeriodGrid({
  weekStartISO,
  lessons,
  dayStart,
  dayEnd,
  periodMinutes = SLOT_MIN,
  selectedDay = 0,
  isEditMode = false,
  onSlotClick,
  onLessonEdit,
  onLessonDelete,
}: PeriodGridProps) {
  // 1) Build the period rows
  const startMin = toMinutes(dayStart);
  const endMin = toMinutes(dayEnd);
  // Generate periods array including all slots from startMin to endMin (inclusive)
  const periods = React.useMemo(() => {
    const slots: number[] = [];
    for (let m = startMin; m <= endMin; m += periodMinutes) {
      slots.push(m);
    }
    return slots;
  }, [startMin, endMin, periodMinutes]);
  
  // slotCount is number of actual 30-min slots (boundaries - 1)
  const slotCount = Math.max(0, periods.length - 1);

  // 2) Group by day using the stable lesson.day field
  const byDay: Record<number, LessonOut[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const l of lessons) {
    const idx = Math.max(0, DAYS.indexOf(l.day as any));
    byDay[idx].push(l);
  }

  return (
    <div className="w-full overflow-x-auto overflow-y-auto bg-surface rounded-lg shadow-glass border border-white/[0.06]">
      <div
        className="grid relative min-w-max"
        style={{
          gridTemplateColumns: `80px repeat(7, minmax(200px, 1fr))`,
          gridTemplateRows: `60px repeat(${slotCount}, 80px)`,
        }}
      >
        {/* Top-left empty header cell */}
        <div className="sticky top-0 z-30 bg-base border-b border-white/[0.06]" />

        {/* Day headers */}
        {DAYS.map((_, d) => (
          <DayHeader key={d} dow={d} weekStartISO={weekStartISO} selectedDay={selectedDay} />
        ))}

        {/* Time rail */}
        <div 
          className="sticky left-0 col-start-1 row-start-2 row-span-full z-30 bg-base border-r border-white/[0.08]"
          style={{ position: 'sticky', left: 0 }}
        >
          {periods.slice(0, -1).map((min, i) => (
            <div key={i} className="h-[80px] flex items-center justify-center px-2 border-b border-white/[0.06]">
              <span className="text-white/70 font-semibold tabular-nums text-xs">{formatTime(min)}</span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        {DAYS.map((dayCode, d) => {
          const dayLessons = byDay[d].sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));
          
          // Check if this is today
          const today = new Date();
          const dayDate = new Date(weekStartISO);
          dayDate.setDate(dayDate.getDate() + d);
          const isToday = today.toDateString() === dayDate.toDateString();
          
          // Check if this is weekend
          const isWeekend = d === 5 || d === 6; // Saturday or Sunday
          
          // Calculate lanes for all lessons in this day
          const lessonsWithLanes = dayLessons.map((lesson, idx) => {
            // headerRows = 1 because grid has header row at row 1
            const { rowStart, rowSpan } = getGridPlacement(lesson.start_time, lesson.end_time, dayStart, periodMinutes, 1);
            const startMin = toMinutes(lesson.start_time);
            const endMin = toMinutes(lesson.end_time);
            
            return {
              ...lesson,
              rowStart,
              rowSpan,
              startMin,
              endMin,
              originalIndex: idx
            };
          });
          
          // Assign lanes using a more robust algorithm
          const lanes: Array<{ endTime: number; lessonIndex: number }> = [];
          const lessonsWithLaneAssignment = lessonsWithLanes.map(lesson => {
            // Clean up finished lessons from lanes
            for (let i = 0; i < lanes.length; i++) {
              if (lanes[i].endTime <= lesson.startMin) {
                lanes[i] = { endTime: -1, lessonIndex: -1 };
              }
            }
            
            // Find first available lane
            let lane = lanes.findIndex(lane => lane.endTime === -1);
            if (lane === -1) {
              lane = lanes.length;
              lanes.push({ endTime: lesson.endMin, lessonIndex: lesson.originalIndex });
            } else {
              lanes[lane] = { endTime: lesson.endMin, lessonIndex: lesson.originalIndex };
            }
            
            return {
              ...lesson,
              lane,
              totalLanes: Math.max(1, lanes.filter(l => l.endTime > lesson.startMin).length)
            };
          });
          
          return (
            <div
              key={d}
              className={`relative col-start-[auto] row-start-2 row-span-full border-r border-white/[0.06] transition-colors group ${
                isToday 
                  ? 'bg-brand-orange/5' 
                  : isWeekend 
                    ? 'bg-base/30' 
                    : 'hover:bg-base/50'
              }`}
              style={{ gridTemplateRows: `repeat(${slotCount}, 80px)` }}
            >
              {/* background separators */}
              <ColumnBackground periodCount={slotCount} />
              
              {/* foreground overlay with hour/half-hour lines */}
              <TimeOverlay periodCount={slotCount} periodMinutes={periodMinutes} />

              {/* slot action overlays for edit mode */}
              {isEditMode && onSlotClick && (
                <div className="absolute inset-0 pointer-events-none">
                  {Array.from({ length: slotCount }).map((_, slotIndex) => {
                    const slotMinutes = startMin + slotIndex * periodMinutes;
                    const slotTime = formatTime(slotMinutes);
                    const topPosition = slotIndex * 80 + 40; // center of slot (80px height)
                    const isOccupied = lessonsWithLaneAssignment.some((lesson) => {
                      // rowStart accounts for header row (row 1) + slot offset
                      // Convert from 1-based grid row to 0-based slot index
                      // rowStart = headerRows(1) + 1 + startSlots, so startSlots = rowStart - 2
                      const lessonStartSlot = lesson.rowStart - 2;
                      const lessonEndSlot = lessonStartSlot + lesson.rowSpan;
                      return slotIndex >= lessonStartSlot && slotIndex < lessonEndSlot;
                    });

                    if (isOccupied) {
                      return null;
                    }

                    return (
                      <button
                        key={`${DAYS[d]}-${slotIndex}`}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSlotClick(dayCode, slotTime);
                        }}
                        className="pointer-events-auto absolute left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-90 focus:opacity-100 transition-opacity"
                        style={{ top: `${topPosition}px` }}
                        title={`Add lesson at ${slotTime}`}
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-500 text-white shadow-card hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2">
                          <PlusIcon className="h-4 w-4" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* lessons with proper lane assignment */}
              {lessonsWithLaneAssignment.map((lesson) => {
                const gap = 2; // 2px gap between overlapping lessons
                const availableWidth = 100 - (gap * (lesson.totalLanes - 1));
                const laneWidth = `${availableWidth / lesson.totalLanes}%`;
                const laneLeft = `${(lesson.lane * (availableWidth / lesson.totalLanes + gap))}%`;
                
                return (
                  <div
                    key={lesson.originalIndex}
                    className="absolute pointer-events-auto z-10 p-1"
                    style={{
                      left: laneLeft,
                      width: laneWidth,
                      height: `${lesson.rowSpan * 80 - 8}px`,
                      top: `${(lesson.rowStart - 1) * 80 + 4}px`,
                    }}
                  >
                    <LessonCell
                      lesson={lesson}
                      isEditMode={isEditMode}
                      onEdit={onLessonEdit ? () => onLessonEdit(lesson) : undefined}
                      onDelete={onLessonDelete ? () => onLessonDelete(lesson) : undefined}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayHeader({ dow, weekStartISO, selectedDay }: { dow: number; weekStartISO: string; selectedDay?: number }) {
  const { label, date } = dayLabel(weekStartISO, dow);
  
  // Check if this is today
  const today = new Date();
  const dayDate = new Date(weekStartISO);
  dayDate.setDate(dayDate.getDate() + dow);
  const isToday = today.toDateString() === dayDate.toDateString();
  
  // Check if this is weekend
  const isWeekend = dow === 5 || dow === 6; // Saturday or Sunday
  
  return (
    <div className="sticky top-0 z-30 bg-base border-b border-white/[0.06]">
      <div className={`h-12 w-full flex flex-col items-center justify-center transition-colors ${
        isToday 
          ? 'bg-brand-orange/10 text-brand-orange border-b-2 border-brand-orange' 
          : isWeekend
            ? 'text-white/50 bg-base/50'
            : 'text-white/60 hover:bg-elevated/50'
      }`}>
        <div className={`text-sm font-semibold uppercase tracking-wide ${
          isToday ? 'text-brand-orange' : ''
        }`}>
          {label}
        </div>
        <div className={`text-xs font-medium ${
          isToday ? 'text-brand-orange/80' : ''
        }`}>
          {date}
        </div>
      </div>
    </div>
  );
}

function ColumnBackground({ periodCount }: { periodCount: number }) {
  return (
    <div className="absolute inset-0 -z-10 grid" style={{ gridTemplateRows: `repeat(${periodCount}, 80px)` }}>
      {Array.from({ length: periodCount }).map((_, i) => (
        <div
          key={i}
          className={i % 2 === 0 ? "border-b border-white/[0.06]" : "border-b border-dashed border-white/[0.04]"}
        />
      ))}
    </div>
  );
}

function TimeOverlay({ periodCount, periodMinutes }: { periodCount: number; periodMinutes: number }) {
  return (
    <div className="absolute inset-0 z-5 grid pointer-events-none" style={{ gridTemplateRows: `repeat(${periodCount}, 80px)` }}>
      {Array.from({ length: periodCount }).map((_, i) => (
        <div
          key={i}
          className={`${
            i % 2 === 0 
              ? "border-b-2 border-white/[0.08]" // Full hour lines - stronger
              : "border-b border-dashed border-white/[0.06]" // Half hour lines - lighter
          }`}
        />
      ))}
    </div>
  );
}

function LessonCell({
  lesson,
  isEditMode,
  onEdit,
  onDelete,
}: {
  lesson: LessonOut;
  isEditMode?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const campus = lesson.campus_name ?? (lesson as any).campus;
  const coTeachers = Array.isArray(lesson.co_teachers) ? lesson.co_teachers.join(" • ") : (lesson as any).viet_teacher;
  
  // Campus color system: E1 → blue, E2 → green (matching day view)
  const isE1 = campus?.toUpperCase().startsWith('E1');
  const isE2 = campus?.toUpperCase().startsWith('E2');
  const campusBorderColor = isE2 ? 'border-campus-e2' : 'border-campus-e1';
  const campusTextColor = isE2 ? 'text-campus-e2' : 'text-campus-e1';
  const campusBgColor = isE2 ? 'bg-campus-e2/10' : 'bg-campus-e1/10';
  
  return (
    <div className="h-full w-full bg-surface border border-white/[0.06] rounded-lg shadow-glass p-2 flex flex-col gap-1 hover:shadow-md transition-all duration-200 m-1 relative">
      {isEditMode && (onEdit || onDelete) && (
        <div className="absolute top-1 right-1 flex items-center gap-1 z-20">
          {onEdit && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEdit();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-surface/90 text-accent-400 shadow ring-1 ring-orange-200 hover:bg-accent-500/[0.06] hover:text-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-500"
              title="Edit lesson"
            >
              <PencilSquareIcon className="h-4 w-4" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-surface/90 text-red-400 shadow ring-1 ring-red-200 hover:bg-red-500/[0.08] hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-red-500"
              title="Delete lesson"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      
      {/* Campus/Event indicator */}
      <div className="flex items-center gap-1 pr-8">
        {campus && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${campusBgColor} ${campusTextColor} ${campusBorderColor} border`}>
            {campus}
          </span>
        )}
        {lesson.room && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-elevated text-white/70 border border-white/[0.06]">
            {lesson.room}
          </span>
        )}
      </div>
      
      {/* Time range */}
      <div className="text-sm text-white tabular-nums font-semibold">
        {lesson.start_time} — {lesson.end_time}
      </div>

      {/* Class + primary teacher */}
      <div className="text-[15px] font-semibold text-white truncate">
        {lesson.class_code}
      </div>

      {/* Co-teachers (VN) */}
      {coTeachers && (
        <div className="text-xs text-white/60 truncate" title={coTeachers}>
          VN: {coTeachers}
        </div>
      )}
    </div>
  );
}


