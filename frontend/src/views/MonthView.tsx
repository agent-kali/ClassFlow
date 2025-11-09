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
    <div className="min-h-screen bg-gray-50">
      <div
        className={`sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm transition-all duration-500 ease-out ${
          isHeaderVisible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 sm:py-0 sm:h-12">
            <div className="flex items-center space-x-2 sm:space-x-4">
              {canEdit ? (
                <div className="relative" ref={teacherSelectorRef}>
                  <button
                    onClick={() => setIsTeacherPaletteOpen((prev) => !prev)}
                    className="inline-flex items-center gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:border-orange-400 hover:text-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 transition-all"
                  >
                    <div className="flex flex-col items-start leading-tight min-w-0">
                      <span className="text-xs uppercase tracking-wide text-gray-400">Teacher</span>
                      <span className="font-semibold text-gray-900 truncate max-w-[120px] sm:max-w-none">
                        {showAllTeachers ? "All Teachers" : currentTeacherName}
                      </span>
                    </div>
                    <span className="flex h-6 w-6 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-orange-100 text-orange-600 font-semibold text-xs sm:text-sm flex-shrink-0">
                      {showAllTeachers ? "ALL" : `T${teacherId}`}
                    </span>
                    <ChevronDownIcon
                      className={`h-3 w-3 sm:h-4 sm:w-4 transition-transform flex-shrink-0 ${
                        isTeacherPaletteOpen ? "rotate-180 text-orange-500" : "text-gray-400"
                      }`}
                    />
                  </button>

                  {isTeacherPaletteOpen && (
                    <div className="absolute left-0 mt-3 w-[340px] max-w-[85vw] rounded-2xl border border-gray-200 bg-white p-4 shadow-xl ring-1 ring-black/5">
                      <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                        <div className="flex items-center gap-2">
                          <SparklesIcon className="h-5 w-5 text-orange-500" />
                          <div>
                            <p className="text-sm font-semibold text-gray-900">Choose your teacher</p>
                            <p className="text-xs text-gray-500">Split by foreign and Vietnamese guides for clarity</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setIsTeacherPaletteOpen(false)}
                          className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          aria-label="Close teacher selector"
                        >
                          <XCircleIcon className="h-5 w-5" />
                        </button>
                      </div>

                      <div className="relative mt-3">
                        <input
                          type="text"
                          value={teacherSearch}
                          onChange={(e) => setTeacherSearch(e.target.value)}
                          placeholder="Search teacher name..."
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-3 pr-3 text-sm text-gray-700 placeholder-gray-400 focus:border-orange-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-100"
                        />
                      </div>

                      <div className="mt-4 space-y-4 max-h-[360px] overflow-y-auto pr-1">
                        <Section
                          title="Foreign teachers"
                          icon={<GlobeAltIcon className="h-4 w-4" />}
                          accent="orange"
                          count={segmentedTeachers.foreign.length}
                        />
                        <div className="grid grid-cols-1 gap-1">
                          <button
                            onClick={() => {
                              handleTeacherChange("all");
                              setIsTeacherPaletteOpen(false);
                            }}
                            className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
                              showAllTeachers
                                ? "bg-orange-500 text-white shadow-sm"
                                : "text-gray-600 hover:bg-orange-50 hover:text-orange-600"
                            }`}
                          >
                            <span className="flex items-center gap-2 font-semibold">
                              <UserGroupIcon className="h-4 w-4" />
                              All Teachers
                            </span>
                            <span className="text-xs uppercase tracking-wide">Overview</span>
                          </button>
                          {segmentedTeachers.foreign.length === 0 && (
                            <EmptyState search={teacherSearch} label="foreign teachers" />
                          )}
                          {segmentedTeachers.foreign.map((teacher) => {
                            const isActive = !showAllTeachers && teacher.teacher_id === teacherId;
                            return (
                              <TeacherOption
                                key={teacher.teacher_id}
                                teacher={teacher}
                                isActive={isActive}
                                onSelect={() => {
                                  handleTeacherChange(teacher.teacher_id);
                                  setIsTeacherPaletteOpen(false);
                                }}
                                badge={{ icon: <FlagIcon className="h-4 w-4" />, label: "Foreign" }}
                                accent="orange"
                              />
                            );
                          })}
                        </div>

                        <Section
                          title="Cover Foreign Teachers"
                          icon={<UserGroupIcon className="h-4 w-4" />}
                          accent="purple"
                          count={segmentedTeachers.cover.length}
                        />
                        <div className="grid grid-cols-1 gap-1 pb-1">
                          {segmentedTeachers.cover.length === 0 && (
                            <EmptyState search={teacherSearch} label="cover teachers" />
                          )}
                          {segmentedTeachers.cover.map((teacher) => {
                            const isActive = !showAllTeachers && teacher.teacher_id === teacherId;
                            return (
                              <TeacherOption
                                key={teacher.teacher_id}
                                teacher={teacher}
                                isActive={isActive}
                                onSelect={() => {
                                  handleTeacherChange(teacher.teacher_id);
                                  setIsTeacherPaletteOpen(false);
                                }}
                                badge={{ icon: <UserGroupIcon className="h-4 w-4" />, label: "Cover" }}
                                accent="purple"
                              />
                            );
                          })}
                        </div>

                        <Section
                          title="Vietnamese teachers"
                          icon={<FlagIcon className="h-4 w-4" />}
                          accent="emerald"
                          count={segmentedTeachers.vietnamese.length}
                        />
                        <div className="grid grid-cols-1 gap-1 pb-1">
                          {segmentedTeachers.vietnamese.length === 0 && (
                            <EmptyState search={teacherSearch} label="Vietnamese teachers" />
                          )}
                          {segmentedTeachers.vietnamese.map((teacher) => {
                            const isActive = !showAllTeachers && teacher.teacher_id === teacherId;
                            return (
                              <TeacherOption
                                key={teacher.teacher_id}
                                teacher={teacher}
                                isActive={isActive}
                                onSelect={() => {
                                  handleTeacherChange(teacher.teacher_id);
                                  setIsTeacherPaletteOpen(false);
                                }}
                                badge={{ icon: <FlagIcon className="h-4 w-4" />, label: "Viet" }}
                                accent="emerald"
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="flex flex-col items-start leading-tight">
                    <span className="text-xs uppercase tracking-wide text-gray-400">Your Schedule</span>
                    <span className="font-semibold text-gray-900">{currentTeacherName}</span>
                  </div>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-semibold">
                    T{auth.getUser()?.teacher_id || teacherId}
                  </span>
                </div>
              )}

              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="inline-flex items-center p-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 transition-colors"
                >
                  <Bars3Icon className="w-5 h-5" />
                </button>

                {isMenuOpen && (
                  <div className="absolute left-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <div className="py-1">
                      <Link
                        to="/"
                        className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        <CalendarIcon className="w-4 h-4 mr-3" />
                        Day View
                      </Link>
                      <Link
                        to="/week"
                        className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        <CalendarIcon className="w-4 h-4 mr-3" />
                        Week View
                      </Link>
                      <button
                        type="button"
                        className="flex w-full cursor-default items-center px-4 py-2 text-sm font-semibold text-orange-500"
                      >
                        <CalendarIcon className="w-4 h-4 mr-3" />
                        Month View
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between sm:justify-end space-x-2 sm:space-x-3">
              {canEdit && (
                <button
                  onClick={toggleEditMode}
                  className={`inline-flex items-center gap-1 sm:gap-2 rounded-lg border px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold transition-colors ${
                    isEditMode
                      ? "border-orange-500 bg-orange-500 text-white hover:bg-orange-600"
                      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <PencilSquareIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">{isEditMode ? "Exit Edit Mode" : "Edit Mode"}</span>
                  <span className="sm:hidden">{isEditMode ? "Exit" : "Edit"}</span>
                </button>
              )}
              <div className="text-right min-w-0 flex-1 sm:flex-none">
                <p className="text-xs sm:text-sm font-semibold text-gray-900 truncate">
                  {showAllTeachers ? "All Teachers" : currentTeacherName}
                </p>
                <p className="text-xs text-gray-500 font-medium">Monthly Schedule</p>
              </div>
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-xs sm:text-sm font-semibold text-orange-700">
                  {showAllTeachers ? "ALL" : `T${teacherId}`}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center py-3 sm:py-0 sm:h-12 border-t border-gray-100">
            <div className="flex items-center space-x-3 sm:space-x-6">
              <button
                onClick={() => navigateMonth("prev")}
                className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeftIcon className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              <div className="text-center min-w-0 flex-1">
                <h1 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                  {format(viewDate, "MMMM yyyy")}
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 font-medium">
                  {monthWeeks.length} week{monthWeeks.length === 1 ? "" : "s"}
                </p>
              </div>

              <button
                onClick={() => navigateMonth("next")}
                className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronRightIcon className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error loading schedule</h3>
                <p className="mt-1 text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-2 sm:px-4 lg:px-8 py-3 sm:py-6">
        {isEditMode && canEdit && (
          <div className="mb-3 sm:mb-4 flex items-start gap-2 sm:gap-3 rounded-lg border border-orange-200 bg-orange-50 px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-orange-800">
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
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-red-200 bg-red-50 text-red-700"
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
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Delete Lesson</h3>
            <p className="mt-2 text-sm text-gray-600">
              Are you sure you want to delete the lesson <span className="font-semibold">{lessonToDelete.class_code}</span> with
              {" "}
              {lessonToDelete.teacher_name} on {lessonToDelete.day} at {lessonToDelete.start_time}?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
      ? "bg-orange-50 text-orange-600"
      : accent === "purple"
        ? "bg-purple-50 text-purple-600"
        : "bg-emerald-50 text-emerald-600";

  return (
    <div className="flex items-center justify-between text-xs uppercase tracking-wider text-gray-400">
      <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ${accentClass}`}>
        {icon}
        {title}
      </div>
      <span className="text-gray-300">{count}</span>
    </div>
  );
}

function EmptyState({ search, label }: { search: string; label: string }) {
  return (
    <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400">
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
  let accentClass = "text-gray-700 hover:bg-gray-50 hover:text-gray-900";
  if (accent === "orange") {
    accentClass = isActive ? "bg-orange-500 text-white shadow-sm" : "text-gray-700 hover:bg-orange-50 hover:text-orange-600";
  } else if (accent === "purple") {
    accentClass = isActive ? "bg-purple-500 text-white shadow-sm" : "text-gray-700 hover:bg-purple-50 hover:text-purple-600";
  } else if (accent === "emerald") {
    accentClass = isActive ? "bg-emerald-500 text-white shadow-sm" : "text-gray-700 hover:bg-emerald-50 hover:text-emerald-600";
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












