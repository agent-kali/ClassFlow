import React from "react";
import type { LessonOut } from "@/api/types";
import { getWeeksForMonth } from "@/lib/monthWeeks";
import { getWeekStart } from "@/lib/time";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  EllipsisHorizontalIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/solid";

type MonthGridProps = {
  year: number;
  month: number; // 1-12
  lessons: LessonOut[];
  isEditMode?: boolean;
  onAddLesson?: (date: Date) => void;
  onLessonEdit?: (lesson: LessonOut) => void;
  onLessonDelete?: (lesson: LessonOut) => void;
  showTeacherName?: boolean;
};

type LessonWithDate = LessonOut & { __date?: Date | null };

const DAY_NAME_MAP: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
  Sunday: 6,
};

const DAY_ALIASES: Record<string, string> = {
  mon: "Mon",
  monday: "Monday",
  tue: "Tue",
  tuesday: "Tuesday",
  wed: "Wed",
  wednesday: "Wednesday",
  thu: "Thu",
  thursday: "Thursday",
  fri: "Fri",
  friday: "Friday",
  sat: "Sat",
  saturday: "Saturday",
  sun: "Sun",
  sunday: "Sunday",
};

const MAX_VISIBLE_LESSONS = 3;

export default function MonthGrid({
  year,
  month,
  lessons,
  isEditMode = false,
  onAddLesson,
  onLessonEdit,
  onLessonDelete,
  showTeacherName = false,
}: MonthGridProps) {
  const referenceDate = React.useMemo(() => new Date(year, month - 1, 1), [year, month]);

  const daysInView = React.useMemo(() => {
    const monthStart = startOfMonth(referenceDate);
    const monthEnd = endOfMonth(referenceDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [referenceDate]);

  const lessonMap = React.useMemo(() => {
    const map = new Map<string, LessonWithDate[]>();

  for (const lesson of lessons) {
    const lessonDate = resolveLessonDate(lesson);
      const key = lessonDate ? format(lessonDate, "yyyy-MM-dd") : undefined;
      if (!key) continue;

      if (!map.has(key)) {
        map.set(key, []);
      }

      map.get(key)!.push({ ...lesson, __date: lessonDate });
    }

    // Sort lessons in each day by start time
    for (const [, list] of map.entries()) {
      list.sort((a, b) => {
        const aTime = (a.start_time || "00:00").padEnd(5, "0");
        const bTime = (b.start_time || "00:00").padEnd(5, "0");
        return aTime.localeCompare(bTime);
      });
    }

    return map;
  }, [lessons]);

  return (
    <div className="w-full overflow-hidden rounded-3xl border border-white/[0.06] bg-surface shadow-glass">
      <div className="grid grid-cols-7 border-b border-white/[0.04] bg-base/70 text-xs font-semibold uppercase tracking-wide text-white/50">
        {weekdays.map((day) => (
          <div key={day} className="px-3 py-2 text-center sm:px-4 sm:py-3">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {daysInView.map((date) => {
          const key = format(date, "yyyy-MM-dd");
          const dayLessons = lessonMap.get(key) ?? [];
          const isCurrentMonth = isSameMonth(date, referenceDate);
          const today = new Date();
          const isToday = isSameDay(date, today);

          return (
            <DayCell
              key={key}
              date={date}
              lessons={dayLessons}
              isCurrentMonth={isCurrentMonth}
              isToday={isToday}
              isEditMode={isEditMode}
              showTeacherName={showTeacherName}
              onAddLesson={onAddLesson}
              onLessonEdit={onLessonEdit}
              onLessonDelete={onLessonDelete}
            />
          );
        })}
      </div>
    </div>
  );
}

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function DayCell({
  date,
  lessons,
  isCurrentMonth,
  isToday,
  isEditMode,
  onAddLesson,
  onLessonEdit,
  onLessonDelete,
  showTeacherName,
}: {
  date: Date;
  lessons: LessonWithDate[];
  isCurrentMonth: boolean;
  isToday: boolean;
  isEditMode: boolean;
  onAddLesson?: (date: Date) => void;
  onLessonEdit?: (lesson: LessonOut) => void;
  onLessonDelete?: (lesson: LessonOut) => void;
  showTeacherName: boolean;
}) {
  const visibleLessons = lessons.slice(0, MAX_VISIBLE_LESSONS);
  const extraCount = lessons.length - visibleLessons.length;

  const dayLabel = format(date, "d");
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;

  return (
    <div
      className={`group relative flex min-h-[120px] flex-col border-b border-r border-white/[0.04] p-1.5 sm:p-2 transition-colors sm:min-h-[180px] ${
        isToday
          ? "bg-accent-500/[0.06] ring-1 ring-inset ring-accent-500/20"
          : isCurrentMonth
            ? "bg-elevated/70 hover:bg-elevated"
            : "bg-base/60 opacity-60"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className={`text-xs sm:text-sm font-semibold ${isCurrentMonth ? "text-white" : "text-white/40"}`}>
          {dayLabel}
        </div>

        {isEditMode && onAddLesson && isCurrentMonth && (
          <button
            type="button"
            onClick={() => onAddLesson(new Date(date))}
            className="flex h-6 w-6 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-accent-500/20 text-accent-400 transition-all duration-200 hover:bg-accent-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-accent-500 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto"
            title="Add lesson"
          >
            <PlusIcon className="h-3 w-3 sm:h-4 sm:w-4" />
          </button>
        )}
      </div>

      <div className="mt-2 flex grow flex-col gap-2">
        {visibleLessons.map((lesson) => (
          <LessonChip
            key={`${lesson.id ?? lesson.class_code}-${lesson.start_time}-${lesson.teacher_name}`}
            lesson={lesson}
            showTeacherName={showTeacherName}
            isEditMode={isEditMode}
            onLessonEdit={onLessonEdit}
            onLessonDelete={onLessonDelete}
          />
        ))}

        {extraCount > 0 && (
          <div className="rounded-lg border border-dashed border-accent-500/30 bg-accent-500/[0.06] px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium text-accent-300">
            +{extraCount} more
          </div>
        )}

        {!lessons.length && !isEditMode && (
          <div className="mt-auto rounded-lg border border-dashed border-white/[0.06] bg-surface/60 px-1.5 sm:px-2 py-2 sm:py-3 text-center text-[10px] sm:text-xs text-white/40">
            No lessons
          </div>
        )}
      </div>
    </div>
  );
}

function LessonChip({
  lesson,
  showTeacherName,
  isEditMode,
  onLessonEdit,
  onLessonDelete,
}: {
  lesson: LessonOut;
  showTeacherName: boolean;
  isEditMode: boolean;
  onLessonEdit?: (lesson: LessonOut) => void;
  onLessonDelete?: (lesson: LessonOut) => void;
}) {
  const campus = lesson.campus_name ?? (lesson as any).campus ?? "";
  const teacher = lesson.teacher_name;

  return (
    <div className="group relative overflow-hidden rounded-lg sm:rounded-xl border border-white/[0.04] bg-surface/95 shadow-glass transition hover:border-accent-500/20 hover:shadow-md">
      <button
        type="button"
        onClick={() => onLessonEdit?.(lesson)}
        className="flex w-full flex-col items-start gap-0.5 sm:gap-1 px-2 sm:px-3 py-1.5 sm:py-2 text-left focus:outline-none"
      >
        <div className="flex w-full items-center justify-between text-[10px] sm:text-xs font-semibold text-white/50">
          <span className="tabular-nums text-white/70">
            {lesson.start_time?.slice(0, 5)} – {lesson.end_time?.slice(0, 5)}
          </span>
          {campus && (
            <span className="rounded-full bg-elevated px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] uppercase tracking-wide text-white/60">
              {campus}
            </span>
          )}
        </div>
        <div className="text-xs sm:text-sm font-semibold text-white truncate w-full">
          {lesson.class_code ?? "Unnamed"}
        </div>
        <div className="flex w-full flex-wrap items-center gap-1 sm:gap-2 text-[9px] sm:text-[11px] text-white/50">
          {lesson.room && (
            <span className="rounded-full border border-white/[0.06] bg-base px-1.5 sm:px-2 py-0.5 text-white/60">
              {lesson.room}
            </span>
          )}
          {showTeacherName && teacher && (
            <span className="flex items-center gap-1 text-white/60 truncate">
              <EllipsisHorizontalIcon className="h-2 w-2 sm:h-3 sm:w-3 flex-shrink-0" />
              <span className="truncate">{teacher}</span>
            </span>
          )}
        </div>
      </button>

      {isEditMode && (
        <div className="absolute right-1 sm:right-2 top-1 sm:top-2 flex items-center gap-0.5 sm:gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
          {onLessonEdit && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onLessonEdit(lesson);
              }}
              className="flex h-5 w-5 sm:h-7 sm:w-7 items-center justify-center rounded-full bg-surface/90 text-accent-400 shadow ring-1 ring-orange-200 hover:bg-accent-500/[0.06] hover:text-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-500"
              title="Edit lesson"
            >
              <PencilSquareIcon className="h-3 w-3 sm:h-4 sm:w-4" />
            </button>
          )}
          {onLessonDelete && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onLessonDelete(lesson);
              }}
              className="flex h-5 w-5 sm:h-7 sm:w-7 items-center justify-center rounded-full bg-surface/90 text-red-400 shadow ring-1 ring-red-200 hover:bg-red-500/[0.08] hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-red-500"
              title="Delete lesson"
            >
              <TrashIcon className="h-3 w-3 sm:h-4 sm:w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function resolveLessonDate(lesson: LessonOut): Date | null {
  const dayIndex = getDayIndex(lesson.day);
  if (dayIndex === null) return null;

  if (lesson.year && lesson.month && lesson.week_number) {
    const weeks = getWeeksForMonth(lesson.year, lesson.month);
    const week = weeks.find((w) => w.weekNumber === lesson.week_number);
    if (week) {
      const base = new Date(week.startDate);
      base.setHours(0, 0, 0, 0);
      return addDays(base, dayIndex);
    }
  }

  if (lesson.week) {
    const weekStart = getWeekStart(lesson.week);
    if (weekStart) {
      const base = new Date(weekStart);
      base.setHours(0, 0, 0, 0);
      return addDays(base, dayIndex);
    }
  }

  return null;
}

function getDayIndex(day: string | undefined): number | null {
  if (!day) return null;
  const directIndex = DAY_NAME_MAP[day];
  if (typeof directIndex === "number") {
    return directIndex;
  }

  const aliasKey = day.trim().toLowerCase();
  const normalized = DAY_ALIASES[aliasKey];
  if (normalized) {
    return DAY_NAME_MAP[normalized];
  }

  return null;
}


