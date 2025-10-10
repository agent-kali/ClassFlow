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
    <div className="w-full overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/70 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {weekdays.map((day) => (
          <div key={day} className="px-3 py-2 text-center sm:px-4 sm:py-3">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 divide-y divide-gray-100 sm:grid-cols-7 sm:divide-x sm:divide-y-0">
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
      className={`group relative flex min-h-[140px] flex-col border-b border-gray-100 bg-gradient-to-br p-2 transition-colors sm:min-h-[180px] sm:border-b-0 sm:border-r ${
        isToday
          ? "from-orange-50 via-white to-white ring-2 ring-offset-2 ring-orange-400"
          : isCurrentMonth
            ? "from-white via-white to-gray-50"
            : "from-gray-50 via-white to-white opacity-70"
      } ${isWeekend ? "bg-opacity-95" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div className={`text-sm font-semibold ${isCurrentMonth ? "text-gray-900" : "text-gray-400"}`}>
          {dayLabel}
        </div>

        {isEditMode && onAddLesson && isCurrentMonth && (
          <button
            type="button"
            onClick={() => onAddLesson(new Date(date))}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-200 text-orange-500 shadow transition-all duration-200 hover:bg-orange-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto"
            title="Add lesson"
          >
            <PlusIcon className="h-4 w-4" />
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
          <div className="rounded-lg border border-dashed border-orange-300 bg-orange-50/80 px-2 py-1 text-xs font-medium text-orange-700">
            +{extraCount} more
          </div>
        )}

        {!lessons.length && !isEditMode && (
          <div className="mt-auto rounded-lg border border-dashed border-gray-200 bg-white/60 px-2 py-3 text-center text-xs text-gray-400">
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
    <div className="group relative overflow-hidden rounded-xl border border-gray-100 bg-white/95 shadow-sm transition hover:border-orange-200 hover:shadow-md">
      <button
        type="button"
        onClick={() => onLessonEdit?.(lesson)}
        className="flex w-full flex-col items-start gap-1 px-3 py-2 text-left focus:outline-none"
      >
        <div className="flex w-full items-center justify-between text-xs font-semibold text-gray-500">
          <span className="tabular-nums text-gray-700">
            {lesson.start_time?.slice(0, 5)} – {lesson.end_time?.slice(0, 5)}
          </span>
          {campus && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-600">
              {campus}
            </span>
          )}
        </div>
        <div className="text-sm font-semibold text-gray-900">
          {lesson.class_code ?? "Unnamed"}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 text-[11px] text-gray-500">
          {lesson.room && (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-gray-600">
              {lesson.room}
            </span>
          )}
          {showTeacherName && teacher && (
            <span className="flex items-center gap-1 text-gray-600">
              <EllipsisHorizontalIcon className="h-3 w-3" />
              {teacher}
            </span>
          )}
        </div>
      </button>

      {isEditMode && (
        <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
          {onLessonEdit && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onLessonEdit(lesson);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-orange-600 shadow ring-1 ring-orange-200 hover:bg-orange-50 hover:text-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
              title="Edit lesson"
            >
              <PencilSquareIcon className="h-4 w-4" />
            </button>
          )}
          {onLessonDelete && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onLessonDelete(lesson);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-red-600 shadow ring-1 ring-red-200 hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
              title="Delete lesson"
            >
              <TrashIcon className="h-4 w-4" />
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
    if (!week) return null;
    const base = new Date(week.startDate);
    base.setHours(0, 0, 0, 0);
    return addDays(base, dayIndex);
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
  const index = DAY_NAME_MAP[day];
  return typeof index === "number" ? index : null;
}


