import React, { useMemo } from 'react';
import type { LessonOut } from '../api/types';
import { format } from 'date-fns';
import { toMinutes, formatTime, getGridPlacement, getRowCount, SLOT_MIN } from '../lib/layout';
import LessonCard from './LessonCard';

type Props = {
  lessons: LessonOut[];
  weekStart: Date;
};

const DAYS: Array<'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'> = [
  'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
];

// Helper function to extract clean class name
const getClassName = (title: string) => {
  if (title.includes('E-LEADERS') || title.includes('LEADERS')) {
    return title.includes('K4') ? 'E-LEADERS K4' : 
           title.includes('K5') ? 'E-LEADERS K5' : 'E-LEADERS';
  }
  if (title.includes('INTER')) {
    const match = title.match(/E\d INTER (\d+) ([A-Z]) (K\d)/);
    if (match) return `Intermediate Level ${match[1]} ${match[2]} ${match[3]}`;
  }
  return title;
};

function dedupeLessons(input: LessonOut[]): LessonOut[] {
  const seen = new Set<string>();
  const out: LessonOut[] = [];
  for (const l of input) {
    const key = [l.week, l.day, l.start_time, l.end_time, l.class_code, l.campus_name].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

export default function WeekGridLite({ lessons, weekStart }: Props) {
  // Process lessons and compute grid parameters
  const { gridLessons, timeSlots, gridRows, minStart: boundsStart, maxEnd: boundsEnd } = useMemo(() => {
    const deduped = dedupeLessons(lessons);
    
    // Group by day
    const grouped: Record<string, LessonOut[]> = {};
    DAYS.forEach(day => { grouped[day] = []; });
    deduped.forEach(l => {
      if (grouped[l.day]) grouped[l.day].push(l);
    });

    // Compute time bounds - use conservative defaults and round to slot boundaries
    const allStartMinutes = deduped.map(l => toMinutes(l.start_time));
    const allEndMinutes = deduped.map(l => toMinutes(l.end_time));
    
    let minStart = allStartMinutes.length > 0 ? Math.min(...allStartMinutes) : 17 * 60;
    let maxEnd = allEndMinutes.length > 0 ? Math.max(...allEndMinutes) : 21 * 60;
    
    // Default range 17:00-21:00, expand if needed
    minStart = Math.min(minStart, 17 * 60);
    maxEnd = Math.max(maxEnd, 21 * 60);
    
    // Round to slot boundaries
    minStart = Math.floor(minStart / SLOT_MIN) * SLOT_MIN;
    maxEnd = Math.ceil(maxEnd / SLOT_MIN) * SLOT_MIN;

    // Generate time slots using SLOT_MIN (exclude last boundary to match row count)
    const slots: Array<{ minutes: number; label: string; isHour: boolean }> = [];
    for (let m = minStart; m <= maxEnd; m += SLOT_MIN) {
      const isHour = m % 60 === 0;
      slots.push({
        minutes: m,
        label: formatTime(m),
        isHour
      });
    }

    // Convert lessons to grid format with overlap handling
    const gridData: Array<LessonOut & { 
      gridColumn: number; 
      gridRowStart: number; 
      gridRowEnd: number;
      rowSpan: number;
      lane: number;
      laneWidth: string;
      laneMargin: string;
    }> = [];
    
    DAYS.forEach((day, dayIndex) => {
      const dayLessons = grouped[day].sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));
      
      // Track active lanes (lesson end times)
      const lanes: number[] = [];
      
      dayLessons.forEach(l => {
        const startMin = toMinutes(l.start_time);
        const endMin = toMinutes(l.end_time);
        
        // Calculate grid positions (1-based)
        // Use getGridPlacement for proper grid alignment
        const dayStartTime = formatTime(minStart);
        const { rowStart, rowSpan } = getGridPlacement(l.start_time, l.end_time, dayStartTime, SLOT_MIN, 0);
        
        // Clean up finished lessons from lanes
        for (let i = 0; i < lanes.length; i++) {
          if (lanes[i] <= startMin) {
            lanes[i] = -1; // Mark as free
          }
        }
        
        // Find first available lane
        let lane = lanes.findIndex(endTime => endTime === -1);
        if (lane === -1) {
          lane = lanes.length;
          lanes.push(endMin);
        } else {
          lanes[lane] = endMin;
        }
        
        // Calculate width and positioning based on active lanes
        const activeLanes = lanes.filter(endTime => endTime > startMin).length;
        const totalLanes = Math.max(1, activeLanes);
        const laneWidthPercent = 100 / totalLanes;
        const laneWidth = `calc(${laneWidthPercent}% - 2px)`;
        const laneMargin = `${lane * laneWidthPercent}%`;
        
        gridData.push({
          ...l,
          gridColumn: dayIndex + 2, // +2 because column 1 is time rail
          gridRowStart: rowStart,
          gridRowEnd: rowStart + rowSpan,
          rowSpan: rowSpan,
          lane,
          laneWidth,
          laneMargin,
        });
      });
    });

    return {
      gridLessons: gridData,
      timeSlots: slots,
      gridRows: slots.length,
      minStart,
      maxEnd,
    };
  }, [lessons]);

  // Current time indicator
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  return (
    <div className="h-full overflow-hidden flex flex-col">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        <div className="week-grid-container">
          <div className="p-3 bg-gray-50 border-r border-gray-300 text-sm font-medium text-gray-700 text-center">
            Time
          </div>
          {DAYS.map((day, i) => {
            const date = new Date(weekStart);
            date.setDate(weekStart.getDate() + i);
            const isToday = format(new Date(), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd');
            
            return (
              <div
                key={day}
                className={`p-3 text-center border-r border-gray-200 transition-colors ${
                  isToday 
                    ? 'bg-orange-50 text-orange-900 border-orange-200' 
                    : 'bg-gray-50 text-gray-700'
                }`}
              >
                <div className={`text-sm ${
                  isToday ? 'font-bold text-orange-900' : 'font-semibold'
                }`}>
                  {day}
                </div>
                <div className={`text-xs ${
                  isToday ? 'text-orange-600 font-medium' : 'text-gray-500'
                }`}>
                  {format(date, 'MMM d')}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main grid */}
      <div className="flex-1 overflow-auto">
        <div 
          className="week-grid-container"
          style={{
            gridTemplateRows: `repeat(${gridRows}, var(--slot-h))`,
          }}
        >
          {/* Time rail */}
          <div className="time-rail">
            {timeSlots.map((slot, index) => (
              <div
                key={slot.minutes}
                className={`time-slot ${slot.isHour ? 'hour' : 'half'}`}
                style={{ gridRow: index + 1 }}
              >
                <span className={`tabular-nums ${slot.isHour ? 'font-semibold text-gray-900' : 'font-medium text-gray-500'}`}>
                  {slot.label}
                </span>
                {!slot.isHour && (
                  <div className="absolute right-0 top-1/2 w-2 h-px bg-gray-300 transform -translate-y-1/2" />
                )}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {DAYS.map((day, dayIndex) => {
            const date = new Date(weekStart);
            date.setDate(weekStart.getDate() + dayIndex);
            const isToday = format(new Date(), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd');
            
            return (
              <div
                key={day}
                className={`day-column ${isToday ? 'today' : ''}`}
                style={{ 
                  gridColumn: dayIndex + 2,
                  gridRow: '1 / -1'
                }}
              />
            );
          })}

          {/* Lesson cards positioned directly on grid */}
          {gridLessons.map((lesson) => {
            const date = new Date(weekStart);
            date.setDate(weekStart.getDate() + (lesson.gridColumn - 2));
            const isToday = format(new Date(), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd');
            const isNow = isToday && 
              currentMinutes >= toMinutes(lesson.start_time) && 
              currentMinutes <= toMinutes(lesson.end_time);
            
            return (
              <div
                key={`${lesson.day}-${lesson.start_time}-${lesson.end_time}-${lesson.class_code}`}
                className="min-h-0 overflow-hidden z-20"
                style={{
                  gridColumn: lesson.gridColumn,
                  gridRow: `${lesson.gridRowStart} / span ${lesson.rowSpan}`,
                  marginLeft: lesson.laneMargin,
                  width: lesson.laneWidth,
                }}
              >
                <LessonCard 
                  title={getClassName(lesson.class_code)}
                  start={lesson.start_time}
                  end={lesson.end_time}
                  room={lesson.room}
                  campus={lesson.campus_name}
                  teachers={[lesson.teacher_name, ...(lesson.co_teachers || [])].filter(Boolean)}
                  durationMin={lesson.duration_minutes}
                  isNow={isNow}
                />
              </div>
            );
          })}

          {/* Grid guides overlay - positioned only over slot area */}
          <div
            aria-hidden
            className="pointer-events-none absolute z-10"
            style={{
              // Position over the slot grid area only (exclude time rail)
              left: 'var(--time-rail-width)',
              right: 0,
              top: 0,
              bottom: 0,
              display: 'grid',
              gridTemplateRows: `repeat(${gridRows}, var(--slot-h))`,
              gridTemplateColumns: `repeat(7, 1fr)`, // 7 day columns
            }}
          >
            {/* Horizontal lines across all days */}
            {Array.from({ length: gridRows + 1 }).map((_, i) => {
              const isHour = i % 2 === 0; // every 60 minutes (2 slots of 30min each)
              return (
                <div
                  key={`h-${i}`}
                  className={`${
                    isHour 
                      ? 'border-t border-neutral-300/70' 
                      : 'border-t border-dashed border-neutral-200/70'
                  }`}
                  style={{ 
                    gridColumn: '1 / -1', // span all day columns
                    gridRow: `${i + 1} / ${i + 1}`,
                  }}
                />
              );
            })}

            {/* Vertical day separators */}
            {Array.from({ length: 8 }).map((_, i) => ( // 8 lines: before day1, between days, after day7
              <div
                key={`v-${i}`}
                className="border-l border-neutral-200/60"
                style={{ 
                  gridRow: '1 / -1', // span all rows
                  gridColumn: `${i + 1} / ${i + 1}`,
                }}
              />
            ))}
          </div>

          {/* Current time indicator */}
          {(() => {
            const now = new Date();
            const isAnyToday = DAYS.some((day, dayIndex) => {
              const date = new Date(weekStart);
              date.setDate(weekStart.getDate() + dayIndex);
              return format(now, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd');
            });
            
            if (!isAnyToday) return null;
            
            const firstSlot = boundsStart;
            const lastSlot = boundsEnd;
            
            // Only show within the explicit grid range
            if (currentMinutes < firstSlot || currentMinutes >= lastSlot) return null;
            
            const slotIndex = Math.floor((currentMinutes - firstSlot) / SLOT_MIN);
            const offsetWithinSlot = ((currentMinutes - firstSlot) % SLOT_MIN) / SLOT_MIN;
            
            return (
              <>
                {/* Time rail dot indicator */}
                <div
                  className="w-2 h-2 bg-red-500 rounded-full z-40 justify-self-center border border-white shadow-sm"
                  style={{
                    gridColumn: 1,
                    gridRow: slotIndex + 1,
                    alignSelf: 'start',
                    marginTop: `calc(${offsetWithinSlot} * var(--slot-h) - 4px)`,
                  }}
                />
                
                {/* Now line across all day columns */}
                <div
                  className="h-0.5 bg-red-500 z-30 col-span-7 mx-1 shadow-sm"
                  style={{
                    gridColumn: '2 / 9', // spans all 7 day columns
                    gridRow: slotIndex + 1,
                    alignSelf: 'start',
                    marginTop: `calc(${offsetWithinSlot} * var(--slot-h))`,
                  }}
                />
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}