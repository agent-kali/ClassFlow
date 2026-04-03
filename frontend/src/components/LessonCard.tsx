import React from "react";

type Teacher = {
  name: string;
  is_primary: boolean;
};

type LessonCardProps = {
  title: string;
  start: string;
  end: string;
  room?: string;
  campus?: string;
  teachers?: Teacher[];
  durationMin?: number;
  isNow?: boolean;
};

const calculateDuration = (startHHMM: string, endHHMM: string): number => {
  const [startH, startM] = startHHMM.split(':').map(Number);
  const [endH, endM] = endHHMM.split(':').map(Number);
  return (endH * 60 + endM) - (startH * 60 + startM);
};

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
  const duration = durationMin ?? calculateDuration(start, end);
  const density = getDensity(duration);

  // Campus color system (dark mode)
  const isE2 = campus?.toUpperCase().startsWith('E2');
  const barColor = isE2 ? 'bg-emerald-500' : 'bg-blue-500';
  const campusBg = isE2 ? 'bg-emerald-500/10' : 'bg-blue-500/10';
  const campusBorder = isE2 ? 'border-emerald-500/25' : 'border-blue-500/25';
  const campusText = isE2 ? 'text-emerald-400' : 'text-blue-400';
  const roomBg = isE2 ? 'bg-emerald-500/[0.08]' : 'bg-blue-500/[0.08]';

  const primaryTeacher = teachers.find(t => t.is_primary);
  const coTeachers = teachers.filter(t => !t.is_primary);

  return (
    <div
      className={[
        "lesson-card relative rounded-2xl border",
        "px-4 py-4 w-full",
        isNow
          ? "border-accent-500/30 bg-accent-500/[0.06] ring-1 ring-accent-500/20"
          : "border-white/[0.06] bg-elevated hover:border-white/[0.10]",
      ].filter(Boolean).join(" ")}
      aria-label={`${title ? title + '. ' : ''}${start}–${end}${room ? `. Room ${room}` : ''}`}
    >
      {/* Color bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl ${barColor}`} />

      <div className="flex items-start gap-4">
        {/* Left — Time & Teacher */}
        <div className="flex flex-col items-start min-w-[120px]">
          <div className="tabular-nums text-lg font-bold text-white font-mono tracking-tight">
            {start} — {end}
          </div>
          <div className="mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-sm"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: 'white',
            }}>
            {duration}m
          </div>

          {/* Teacher */}
          <div className="mt-3 space-y-1">
            {primaryTeacher && (
              <div className="text-sm font-semibold text-white/90 break-words">
                {primaryTeacher.name}
              </div>
            )}
            {coTeachers.length > 0 && (
              <div className="text-xs text-white/40 break-words">
                VN: {coTeachers.map(t => t.name).join(', ')}
              </div>
            )}
          </div>
        </div>

        {/* Middle — Course & Campus */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {title && (
                <div className="text-base font-medium text-white/70 break-words">
                  {title}
                </div>
              )}
            </div>

            {/* Campus Badge */}
            {campus && (
              <div className={`hidden sm:inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold ${campusBorder} ${campusBg} ${campusText}`}>
                <span className="uppercase tracking-wide">{campus}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right — Room Badge */}
        {room && (
          <div className={`flex flex-col items-center justify-center rounded-xl border ${campusBorder} ${roomBg} px-4 py-3 text-center shrink-0 min-w-[80px]`}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1">
              Room
            </div>
            <div className="text-sm font-bold text-white/90 break-all leading-tight">
              {room}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}