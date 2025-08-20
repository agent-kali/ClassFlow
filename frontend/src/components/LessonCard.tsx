import React from "react";

type LessonCardProps = {
  title: string;
  start: string;      // "18:30"
  end: string;        // "20:30"
  room?: string;      // "E1-201"
  campus?: string;    // "E1" | "E2"
  teachers?: string[]; // ["Mr Daniel", "Ms Nguyễn Ngọc"]
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
  
  // Teachers line - separate main teacher from VN co-teacher
  const mainTeacher = teachers[0];
  const vnTeacher = teachers.length > 1 ? teachers.slice(1).join(' • ') : undefined;

  // Campus styling
  const barColor = campus === "E2" ? "bg-sky-500" : "bg-emerald-500";
  const campusPillClass = campus === "E2" 
    ? "bg-sky-100 text-sky-700 border-sky-200" 
    : "bg-emerald-100 text-emerald-700 border-emerald-200";

  return (
    <div
      className={[
        "lesson-card h-full w-full rounded-xl border border-slate-200/70 bg-white shadow-sm",
        "relative overflow-hidden min-w-0",      // hard stop any overflow
        density === 'tight' ? "p-1.5" : "p-2",  // adaptive padding
        "flex flex-col",                         // flex layout for content
        isNow ? "ring-2 ring-orange-400 bg-orange-50/30" : "",
        "hover:shadow-md hover:-translate-y-px transition-all duration-200", // gentle elevation
      ].join(" ")}
      aria-label={`${title}. ${start}–${end}. Room ${room}. ${mainTeacher || ''}`}
    >
      {/* Left campus color bar */}
      <div className={`absolute left-0 top-0 h-full w-1 ${barColor}`} />

      {/* Always show: class code and time */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0 flex-1">
          <div 
            className="font-semibold text-slate-900 text-sm leading-tight truncate" 
            title={title}
          >
            {title}
          </div>
          <div className="tabular-nums text-xs text-slate-600 mt-0.5">
            {start} — {end}
          </div>
        </div>
        
        {/* Room pill - always show if available */}
        {room && (
          <div className="shrink-0 rounded-md bg-white border border-slate-200 px-1.5 py-0.5 text-xs text-slate-700">
            {room}
          </div>
        )}
      </div>

      {/* Adaptive content based on density */}
      {density !== 'tight' && (
        <div className="flex-1 min-h-0">
          {/* Teacher info - show in normal/relaxed */}
          {mainTeacher && (
            <div className="text-xs text-slate-500 truncate mb-1" title={mainTeacher}>
              {mainTeacher}
            </div>
          )}
          
          {/* VN co-teacher - show only in relaxed */}
          {density === 'relaxed' && vnTeacher && (
            <div className="text-xs text-slate-400 truncate mb-1" title={vnTeacher}>
              {vnTeacher}
            </div>
          )}
        </div>
      )}

      {/* Bottom row - campus pill (show in normal/relaxed) */}
      {density !== 'tight' && (
        <div className="flex items-center justify-between gap-2 mt-auto">
          <div 
            className={`rounded-full border px-1.5 py-0.5 text-xs ${campusPillClass}`}
          >
            {campus}
          </div>
          
          {/* Duration indicator - show only in relaxed */}
          {density === 'relaxed' && (
            <div className="text-xs text-slate-400 tabular-nums">
              {duration}m
            </div>
          )}
        </div>
      )}
    </div>
  );
}