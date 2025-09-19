import React from "react";

type Teacher = {
  name: string;
  is_primary: boolean;
};

type LessonCardProps = {
  title: string;
  start: string;      // "18:30"
  end: string;        // "20:30"
  room?: string;      // "E1-201"
  campus?: string;    // "E1" | "E2"
  teachers?: Teacher[]; // Updated to support Teacher objects with is_primary flag
  durationMin?: number; // 30 | 60 | 90 | 120... (optional, will compute from start/end)
  isNow?: boolean;
};

// Calculate duration in minutes from time strings
const calculateDuration = (startHHMM: string, endHHMM: string): number => {
  const [startH, startM] = startHHMM.split(':').map(Number);
  const [endH, endM] = endHHMM.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  return endMinutes - startMinutes;
};

// Map duration to density level
const getDensity = (durationMin: number): 'tight' | 'normal' | 'relaxed' => {
  if (durationMin <= 30) return 'tight';
  if (durationMin <= 60) return 'normal';
  return 'relaxed';
};

export default function LessonCard({
  title,
  start,
  end,
  room,
  campus = "E1",
  teachers = [],
  durationMin,
  isNow = false,
}: LessonCardProps) {
  // Calculate duration if not provided
  const duration = durationMin ?? calculateDuration(start, end);
  const density = getDensity(duration);
  
  // Campus color system: E1 → blue, E2 → teal (no brand orange on cards)
  const isE1 = campus?.toUpperCase().startsWith('E1');
  const isE2 = campus?.toUpperCase().startsWith('E2');
  const campusBorderColor = isE2 ? 'border-campus-e2' : 'border-campus-e1';
  const campusTextColor = isE2 ? 'text-campus-e2' : 'text-campus-e1';
  const barColor = isE2 ? 'bg-campus-e2' : 'bg-campus-e1';

  // Teacher separation: primary vs co-teachers
  const primaryTeacher = teachers.find(t => t.is_primary);
  const coTeachers = teachers.filter(t => !t.is_primary);

  return (
    <div
      className={[
        "relative bg-surface-bg border border-hairline rounded-[16px] shadow-2",
        "hover:shadow-hover hover:-translate-y-0.5 transition-all duration-150",
        "overflow-hidden min-w-0 flex flex-col h-full w-full",
        density === 'tight' ? "p-3" : density === 'normal' ? "p-4" : "p-4",
        isNow ? "bg-orange-50/20" : "",
      ].join(" ")}
      aria-label={`${title ? title + '. ' : ''}${start}–${end}${room ? `. Room ${room}` : ''}`}
    >
      {/* Left campus color accent stripe */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${barColor}`} />

      <div className="flex items-center gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          {/* Time - 14px, 600 weight - FIRST */}
          <div className="tabular-nums text-sm font-semibold text-text-primary mb-1">
            {start} — {end}
          </div>

          {/* Vietnamese Co-teacher(s) - 11px, 500 weight - SECOND */}
          {coTeachers.length > 0 && (
            <div className="text-[11px] font-medium text-text-secondary leading-tight mb-1 tracking-wide">
              VN: {coTeachers.map(t => t.name).join(', ')}
            </div>
          )}

          {/* Title (class name) - 15px, 600-700 weight - THIRD */}
          {title && (
            <div className="text-[15px] font-semibold text-text-primary leading-tight">
              {title}
            </div>
          )}
        </div>

        {/* Room address block - more compact */}
        {room && (
          <div className={`shrink-0 rounded-[12px] bg-surface-bg border ${campusBorderColor} px-2.5 py-2 text-center min-w-[70px] shadow-1`}>
            {/* "ROOM" label - 10px, uppercase, medium, gray */}
            <div className="text-[10px] font-medium text-text-secondary uppercase tracking-[0.02em] mb-0.5">
              Room
            </div>
            {/* Address value - 14px, bold, near-black */}
            <div className="text-[14px] font-bold text-text-primary leading-tight">
              {room}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}