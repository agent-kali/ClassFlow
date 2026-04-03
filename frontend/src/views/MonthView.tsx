import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import {
  Bars3Icon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FlagIcon,
  GlobeAltIcon,
  PencilSquareIcon,
  SparklesIcon,
  UserGroupIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

import MonthGrid from "@/components/MonthGrid";
import LessonModal from "@/components/LessonModal";
import type { LessonOut, LessonCreate, LessonUpdate, Teacher } from "@/api/types";
import { api, auth } from "@/api/client";
import { getWeekForDate, getWeeksForMonth } from "@/lib/monthWeeks";
import { getWeekNumber, setAcademicAnchor } from "@/lib/time";

type FeedbackState = {
  type: "success" | "error";
  message: string;
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

export const MonthView: React.FC = () => {
  const [lessons, setLessons] = React.useState<LessonOut[]>([]);
  const [teachers, setTeachers] = React.useState<Teacher[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<FeedbackState | null>(null);
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = React.useState(true);
  const [lastScrollY, setLastScrollY] = React.useState(0);
  const [isTeacherPaletteOpen, setIsTeacherPaletteOpen] = React.useState(false);
  const [teacherSearch, setTeacherSearch] = React.useState("");
  const [isEditMode, setIsEditMode] = React.useState(false);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingLesson, setEditingLesson] = React.useState<LessonOut | null>(null);
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(null);
  const [lessonToDelete, setLessonToDelete] = React.useState<LessonOut | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [params, setParams] = useSearchParams();

  const teacherId = Number(params.get("teacher") || "1");
  const initialDate = React.useMemo(() => new Date(), []);
  const [viewDate, setViewDate] = React.useState<Date>(initialDate);

  const canEdit = React.useMemo(() => auth.hasAnyRole(["manager", "admin"]), []);
  const showAllTeachers = params.get("all") === "true" && canEdit;

  const teacherSelectorRef = React.useRef<HTMLDivElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  const month = viewDate.getMonth() + 1;
  const year = viewDate.getFullYear();

  React.useEffect(() => {
    api
      .getAnchor()
      .then(({ anchor_date }) => setAcademicAnchor(anchor_date))
      .catch(() => {});

    if (canEdit) {
      api
        .listTeachers()
        .then(setTeachers)
        .catch(() => {});
    }
  }, [canEdit]);

  const fetchLessons = React.useCallback(() => {
    const filters = {
      month,
      year,
      grouped: true,
    } as const;

    if (!canEdit) {
      const currentUser = auth.getUser();
      const userTeacherId = currentUser?.teacher_id;

      if (userTeacherId) {
        api
          .getTeacherSchedule(userTeacherId, filters)
          .then((data) => {
            setLessons(data);
            setError(null);
          })
          .catch((e) => setError(String(e)));
      } else {
        setError("No teacher ID found for current user");
      }
      return;
    }

    const fetchPromise = showAllTeachers
      ? api.listLessons({ ...filters })
      : api.getTeacherSchedule(teacherId, filters);

    fetchPromise
      .then((data) => {
        if (Array.isArray(data)) {
          (window as any).__LESSON_DATA__ = data;
        }
        setLessons(data);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  }, [canEdit, month, showAllTeachers, teacherId, year]);

  React.useEffect(() => {
    fetchLessons();
  }, [fetchLessons]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (isMenuOpen && menuRef.current && !menuRef.current.contains(target)) {
        setIsMenuOpen(false);
      }
      if (isTeacherPaletteOpen && teacherSelectorRef.current && !teacherSelectorRef.current.contains(target)) {
        setIsTeacherPaletteOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMenuOpen, isTeacherPaletteOpen]);

  React.useEffect(() => {
    if (!isTeacherPaletteOpen) {
      setTeacherSearch("");
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsTeacherPaletteOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isTeacherPaletteOpen]);

  React.useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY < 20) {
        setIsHeaderVisible(true);
      } else if (currentScrollY > lastScrollY && currentScrollY > 30) {
        setIsHeaderVisible(false);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  const navigateMonth = (direction: "prev" | "next") => {
    const newDate = new Date(viewDate);
    newDate.setMonth(newDate.getMonth() + (direction === "prev" ? -1 : 1));
    setViewDate(newDate);
  };

  const monthWeeks = React.useMemo(() => getWeeksForMonth(year, month), [month, year]);

  const handleTeacherChange = (newTeacherId: number | "all") => {
    const newParams = new URLSearchParams(params);
    if (newTeacherId === "all") {
      newParams.set("all", "true");
      newParams.delete("teacher");
    } else {
      newParams.set("teacher", String(newTeacherId));
      newParams.delete("all");
    }
    setParams(newParams, { replace: true });
  };

  const currentTeacher = teachers.find((t) => t.teacher_id === teacherId);
  const currentTeacherName = React.useMemo(() => {
    if (!canEdit) {
      const currentUser = auth.getUser();
      return currentUser?.username || "Your Schedule";
    }
    return currentTeacher ? currentTeacher.name : `Teacher #${teacherId}`;
  }, [canEdit, currentTeacher, teacherId]);

  const segmentedTeachers = React.useMemo(() => {
    if (!teachers.length) {
      return { foreign: [] as Teacher[], vietnamese: [] as Teacher[], cover: [] as Teacher[] };
    }

    const filtered = teacherSearch
      ? teachers.filter((t) => t.name.toLowerCase().includes(teacherSearch.toLowerCase()))
      : teachers;

    const foreignTeacherNames = [
      "Ms Vicky",
      "Ms Vic",
      "Ms Emma",
      "Mr Ivan",
      "IVAN",
      "Ms Michelle",
      "MIchelle",
      "Ms Anastasia",
      "Nas",
      "Mr Daniel",
      "Daniel",
      "Ms Jessica",
      "Jessica",
      "Mr Zakaria",
      "Zakaria",
      "Zak",
    ];

    const foreign = filtered.filter(
      (t) =>
        t.is_foreign ||
        foreignTeacherNames.some(
          (name) =>
            t.name.toLowerCase().includes(name.toLowerCase()) ||
            name.toLowerCase().includes(t.name.toLowerCase())
        )
    );

    const cover = filtered.filter(
      (t) => t.name.toLowerCase().includes("cover") || t.name.toLowerCase().includes("cover teacher")
    );

    const vietnamese = filtered.filter(
      (t) =>
        !t.is_foreign &&
        !foreignTeacherNames.some(
          (name) =>
            t.name.toLowerCase().includes(name.toLowerCase()) ||
            name.toLowerCase().includes(t.name.toLowerCase())
        ) &&
        !t.name.toLowerCase().includes("cover")
    );

    return { foreign, vietnamese, cover };
  }, [teachers, teacherSearch]);

  const openCreateModal = (date: Date) => {
    setSelectedDate(date);
    setEditingLesson(null);
    setIsModalOpen(true);
    setFeedback(null);
  };

  const handleLessonEdit = (lesson: LessonOut) => {
    if (!canEdit || !isEditMode) return;
    setEditingLesson(lesson);
    setSelectedDate(null);
    setIsModalOpen(true);
    setFeedback(null);
  };

  const handleLessonDelete = (lesson: LessonOut) => {
    if (!canEdit || !isEditMode) return;
    setLessonToDelete(lesson);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedDate(null);
    setEditingLesson(null);
  };

  const handleSaveLesson = async (payload: LessonCreate | LessonUpdate) => {
    try {
      setIsSaving(true);
      if (editingLesson?.id) {
        await api.updateLesson(editingLesson.id, payload as LessonUpdate);
        setFeedback({ type: "success", message: "Lesson updated successfully." });
      } else {
        await api.createLesson(payload as LessonCreate);
        setFeedback({ type: "success", message: "Lesson created successfully." });
      }
      closeModal();
      fetchLessons();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to save lesson.",
      });
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!lessonToDelete?.id) return;
    setIsDeleting(true);
    try {
      await api.deleteLesson(lessonToDelete.id);
      setFeedback({ type: "success", message: "Lesson deleted successfully." });
      setLessonToDelete(null);
      fetchLessons();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to delete lesson.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleEditMode = () => {
    if (!canEdit) return;
    setIsEditMode((prev) => !prev);
    setSelectedDate(null);
    setEditingLesson(null);
    setLessonToDelete(null);
    setFeedback(null);
  };

  const defaultTeacherId = !showAllTeachers ? currentTeacher?.teacher_id : undefined;

  const defaultModalContext = React.useMemo(() => {
    if (editingLesson) {
      const modalWeekInfo = editingLesson.week_number
        ? monthWeeks.find((w) => w.weekNumber === editingLesson.week_number)
        : getWeekForDate(new Date()) || null;

      return {
        defaultDay: editingLesson.day ?? "Monday",
        defaultWeek: editingLesson.week ?? getWeekNumber(new Date()),
        defaultMonth: editingLesson.month ?? month,
        defaultYear: editingLesson.year ?? year,
        defaultWeekNumber: editingLesson.week_number ?? modalWeekInfo?.weekNumber,
      };
    }

    if (!selectedDate) {
      const fallbackWeek = getWeekForDate(viewDate);
      return {
        defaultDay: "Monday",
        defaultWeek: fallbackWeek?.weekNumber ?? getWeekNumber(viewDate),
        defaultMonth: month,
        defaultYear: year,
        defaultWeekNumber: fallbackWeek?.weekNumber,
      };
    }

    const weekInfo = getWeekForDate(selectedDate) || getWeekForDate(viewDate);
    const defaultWeekNumber = weekInfo?.weekNumber ?? monthWeeks[0]?.weekNumber;
    const defaultWeek = weekInfo?.weekNumber ?? getWeekNumber(selectedDate);

    return {
      defaultDay: format(selectedDate, "EEEE"),
      defaultWeek,
      defaultMonth: selectedDate.getMonth() + 1,
      defaultYear: selectedDate.getFullYear(),
      defaultWeekNumber,
    };
  }, [editingLesson, month, monthWeeks, selectedDate, viewDate, year]);

  const isTeacherUser = !canEdit;

  return (
    <div className="min-h-screen bg-base">
      {/* Compact Toolbar */}
      <div className={`sticky top-0 z-40 glass-nav transition-all duration-500 ease-out ${
        isHeaderVisible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
      }`}>
        <div className="page-container page-container-full">
          <div className="flex items-center justify-between h-14 gap-4">
            {/* Left: Teacher Selector (compact) */}
            <div className="flex items-center gap-3 min-w-0">
              {canEdit ? (
                <div className="relative" ref={teacherSelectorRef}>
                  <button
                    onClick={() => setIsTeacherPaletteOpen((prev) => !prev)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white/70 rounded-lg border border-white/[0.08] hover:border-accent-500/30 hover:text-white transition-all"
                  >
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                      {showAllTeachers ? '\u221e' : (currentTeacherName?.[0] ?? 'T').toUpperCase()}
                    </div>
                    <span className="font-semibold text-white truncate max-w-[120px]">
                      {showAllTeachers ? "All" : currentTeacherName}
                    </span>
                    <ChevronDownIcon className={`h-3 w-3 transition-transform ${isTeacherPaletteOpen ? "rotate-180 text-accent-400" : "text-white/40"}`} />
                  </button>

                  {isTeacherPaletteOpen && (
                    <div className="absolute left-0 mt-2 w-[300px] max-w-[85vw] rounded-2xl border border-white/[0.06] bg-elevated p-3 shadow-card z-50">
                      <div className="relative mb-3">
                        <input
                          type="text"
                          value={teacherSearch}
                          onChange={(e) => setTeacherSearch(e.target.value)}
                          placeholder="Search teacher\u2026"
                          className="w-full rounded-lg border border-white/[0.06] bg-base py-2 pl-3 pr-3 text-sm text-white placeholder-white/30 focus:border-accent-500/40 focus:outline-none"
                          autoFocus
                        />
                      </div>
                      <div className="space-y-1 max-h-[320px] overflow-y-auto">
                        <button
                          onClick={() => { handleTeacherChange("all"); setIsTeacherPaletteOpen(false); }}
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${showAllTeachers ? "bg-accent-500 text-white" : "text-white/60 hover:bg-white/[0.04]"}`}
                        >
                          <UserGroupIcon className="h-4 w-4" />
                          All Teachers
                        </button>
                        {segmentedTeachers.foreign.length > 0 && (
                          <div className="pt-2 pb-1 px-1 text-[10px] uppercase tracking-wider text-white/30 font-semibold">Foreign</div>
                        )}
                        {segmentedTeachers.foreign.map((t) => (
                          <button key={t.teacher_id} onClick={() => { handleTeacherChange(t.teacher_id); setIsTeacherPaletteOpen(false); }}
                            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${!showAllTeachers && t.teacher_id === teacherId ? "bg-accent-500 text-white" : "text-white/60 hover:bg-white/[0.04]"}`}>
                            <span className="font-medium">{t.name}</span>
                          </button>
                        ))}
                        {segmentedTeachers.cover.length > 0 && (
                          <div className="pt-2 pb-1 px-1 text-[10px] uppercase tracking-wider text-white/30 font-semibold">Cover</div>
                        )}
                        {segmentedTeachers.cover.map((t) => (
                          <button key={t.teacher_id} onClick={() => { handleTeacherChange(t.teacher_id); setIsTeacherPaletteOpen(false); }}
                            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${!showAllTeachers && t.teacher_id === teacherId ? "bg-purple-600 text-white" : "text-white/60 hover:bg-white/[0.04]"}`}>
                            <span className="font-medium">{t.name}</span>
                          </button>
                        ))}
                        {segmentedTeachers.vietnamese.length > 0 && (
                          <div className="pt-2 pb-1 px-1 text-[10px] uppercase tracking-wider text-white/30 font-semibold">Vietnamese</div>
                        )}
                        {segmentedTeachers.vietnamese.map((t) => (
                          <button key={t.teacher_id} onClick={() => { handleTeacherChange(t.teacher_id); setIsTeacherPaletteOpen(false); }}
                            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${!showAllTeachers && t.teacher_id === teacherId ? "bg-emerald-600 text-white" : "text-white/60 hover:bg-white/[0.04]"}`}>
                            <span className="font-medium">{t.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-white/70">
                  <span className="font-semibold">{currentTeacherName}</span>
                </div>
              )}
            </div>

            {/* Center: Month Navigation */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigateMonth("prev")}
                className="p-1.5 text-white/40 hover:text-white/80 rounded-lg hover:bg-white/[0.04] transition-colors"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
              <div className="text-center">
                <div className="text-sm font-semibold text-white">
                  {format(viewDate, "MMMM yyyy")}
                </div>
                <div className="text-[11px] text-white/40 font-medium">
                  {monthWeeks.length} week{monthWeeks.length === 1 ? "" : "s"}
                </div>
              </div>
              <button
                onClick={() => navigateMonth("next")}
                className="p-1.5 text-white/40 hover:text-white/80 rounded-lg hover:bg-white/[0.04] transition-colors"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Right: Edit Mode */}
            <div className="flex items-center gap-2">
              {canEdit && (
                <button
                  onClick={toggleEditMode}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isEditMode
                      ? "border-accent-500 bg-accent-500 text-white"
                      : "border-white/[0.08] text-white/50 hover:bg-white/[0.04] hover:text-white/80"
                  }`}
                >
                  <PencilSquareIcon className="h-3.5 w-3.5" />
                  {isEditMode ? "Editing" : "Edit"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="page-container page-container-full pt-4">
          <div className="rounded-lg border border-red-500/20 bg-red-500/[0.08] p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-300">Error loading schedule</h3>
                <p className="mt-1 text-sm text-red-400">{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="page-container page-container-full py-3 sm:py-6">
        {isEditMode && canEdit && (
          <div className="mb-3 sm:mb-4 flex items-start gap-2 sm:gap-3 rounded-lg border border-accent-500/20 bg-accent-500/[0.06] px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-accent-300">
            <PencilSquareIcon className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 mt-0.5" />
            <span>
              Edit mode active. Click the <span className="font-semibold">+</span> button in any day to add a lesson,
              or use the edit/delete buttons on existing lessons.
            </span>
          </div>
        )}

        {feedback && (
          <div
            className={`mb-3 sm:mb-4 flex items-start gap-2 sm:gap-3 rounded-lg border px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm ${
              feedback.type === "success"
                ? "border-green-500/20 bg-green-500/[0.08] text-green-300"
                : "border-red-500/20 bg-red-500/[0.08] text-red-400"
            }`}
          >
            {feedback.type === "success" ? (
              <CheckCircleIcon className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircleIcon className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 mt-0.5" />
            )}
            <span className="flex-1">{feedback.message}</span>
            <button
              type="button"
              className="text-xs font-medium underline flex-shrink-0"
              onClick={() => setFeedback(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        <MonthGrid
          year={year}
          month={month}
          lessons={lessons}
          isEditMode={isEditMode && canEdit}
          onAddLesson={isEditMode && canEdit ? openCreateModal : undefined}
          onLessonEdit={isEditMode && canEdit ? handleLessonEdit : undefined}
          onLessonDelete={isEditMode && canEdit ? handleLessonDelete : undefined}
          showTeacherName={showAllTeachers}
        />
      </div>

      <LessonModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onSave={handleSaveLesson}
        lesson={editingLesson}
        defaultTeacherId={defaultTeacherId}
        defaultWeek={defaultModalContext.defaultWeek}
        defaultDay={defaultModalContext.defaultDay}
        defaultMonth={defaultModalContext.defaultMonth}
        defaultYear={defaultModalContext.defaultYear}
        defaultWeekNumber={defaultModalContext.defaultWeekNumber}
        isSaving={isSaving}
      />

      {lessonToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-card">
            <h3 className="text-lg font-semibold text-white">Delete Lesson</h3>
            <p className="mt-2 text-sm text-white/60">
              Are you sure you want to delete the lesson <span className="font-semibold">{lessonToDelete.class_code}</span> with
              {" "}
              {lessonToDelete.teacher_name} on {lessonToDelete.day} at {lessonToDelete.start_time}?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-md border border-white/[0.08] px-4 py-2 text-sm font-medium text-white/70 hover:bg-base"
                onClick={() => setLessonToDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-red-700 disabled:opacity-50"
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

type SectionProps = {
  title: string;
  icon: React.ReactNode;
  accent: "orange" | "purple" | "emerald";
  count: number;
};

function Section({ title, icon, accent, count }: SectionProps) {
  const accentClass =
    accent === "orange"
      ? "bg-accent-500/[0.06] text-accent-400"
      : accent === "purple"
        ? "bg-purple-600/[0.08] text-purple-400"
        : "bg-emerald-600/[0.08] text-emerald-400";

  return (
    <div className="flex items-center justify-between text-xs uppercase tracking-wider text-white/40">
      <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ${accentClass}`}>
        {icon}
        {title}
      </div>
      <span className="text-white/30">{count}</span>
    </div>
  );
}

function EmptyState({ search, label }: { search: string; label: string }) {
  return (
    <p className="rounded-lg border border-dashed border-white/[0.06] px-3 py-4 text-center text-xs text-white/40">
      {search ? `No ${label} match your search.` : `${label[0].toUpperCase()}${label.slice(1)} list coming soon.`}
    </p>
  );
}

type TeacherOptionProps = {
  teacher: Teacher;
  isActive: boolean;
  onSelect: () => void;
  badge: { icon: React.ReactNode; label: string };
  accent: "orange" | "purple" | "emerald";
};

function TeacherOption({ teacher, isActive, onSelect, badge, accent }: TeacherOptionProps) {
  const baseClass = "flex items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition";
  let accentClass = "text-white/70 hover:bg-base hover:text-white";
  if (accent === "orange") {
    accentClass = isActive ? "bg-accent-500 text-white shadow-glass" : "text-white/70 hover:bg-accent-500/[0.06] hover:text-accent-400";
  } else if (accent === "purple") {
    accentClass = isActive ? "bg-purple-600/[0.08]0 text-white shadow-glass" : "text-white/70 hover:bg-purple-600/[0.08] hover:text-purple-400";
  } else if (accent === "emerald") {
    accentClass = isActive ? "bg-emerald-600/[0.08]0 text-white shadow-glass" : "text-white/70 hover:bg-emerald-600/[0.08] hover:text-emerald-400";
  }

  return (
    <button key={teacher.teacher_id} onClick={onSelect} className={`${baseClass} ${accentClass}`}>
      <span className="font-medium">{teacher.name}</span>
      <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide">
        {badge.icon}
        {badge.label}
      </span>
    </button>
  );
}

export default MonthView;












