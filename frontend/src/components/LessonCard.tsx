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
  
  // Campus color system: E1 → blue, E2 → green
  const isE1 = campus?.toUpperCase().startsWith('E1');
  const isE2 = campus?.toUpperCase().startsWith('E2');
  const campusBorderColor = isE2 ? 'border-green-500' : 'border-blue-500';
  const campusBgColor = isE2 ? 'bg-green-50' : 'bg-blue-50';
  const campusTextColor = isE2 ? 'text-green-600' : 'text-blue-600';
  const barColor = isE2 ? 'bg-green-500' : 'bg-blue-500';

  // Teacher separation: primary vs co-teachers
  const primaryTeacher = teachers.find(t => t.is_primary);
  const coTeachers = teachers.filter(t => !t.is_primary);

  return (
    <div
      className={[
        "relative bg-white border border-gray-200 rounded-2xl shadow-sm",
        "px-4 py-4 w-full",
        "transition-all duration-200 hover:shadow-md hover:border-orange-200",
        isNow ? "ring-2 ring-orange-200 border-orange-300 bg-orange-50/70" : "",
      ].filter(Boolean).join(" ")}
      aria-label={`${title ? title + '. ' : ''}${start}–${end}${room ? `. Room ${room}` : ''}`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl ${barColor}`} />

      <div className="flex items-start gap-4">
        {/* Left Column - Time & Teacher */}
        <div className="flex flex-col items-start min-w-[120px]">
          <div className="tabular-nums text-lg font-bold text-gray-900">
            {start} — {end}
          </div>
          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-orange-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm">
            {duration}m
          </div>
          
          {/* Teacher Info */}
          <div className="mt-3 space-y-1">
            {primaryTeacher && (
              <div className="text-sm font-semibold text-gray-900 break-words">
                {primaryTeacher.name}
              </div>
            )}
            {coTeachers.length > 0 && (
              <div className="text-xs text-gray-500 break-words">
                VN: {coTeachers.map(t => t.name).join(', ')}
              </div>
            )}
          </div>
        </div>

        {/* Middle Column - Course & Campus */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {title && (
                <div className="text-base font-medium text-gray-700 break-words">
                  {title}
                </div>
              )}
            </div>

            {/* Campus Badge - Hidden on mobile */}
            {campus && (
              <div className={`hidden sm:inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border-2 px-3 py-1.5 text-xs font-bold ${campusBorderColor} ${campusBgColor} ${campusTextColor}`}>
                <span className="uppercase tracking-wide">{campus}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Room Badge */}
        {room && (
          <div className={`flex flex-col items-center justify-center rounded-xl border-2 ${campusBorderColor} ${campusBgColor} px-4 py-3 text-center shrink-0 min-w-[80px]`}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-600 mb-1">
              Room
            </div>
            <div className="text-sm font-bold text-gray-900 break-all leading-tight">
              {room}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}