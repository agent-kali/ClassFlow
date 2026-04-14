import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { api, auth } from '@/api/client';
import type { LessonOut, LessonCreate, LessonUpdate, Teacher } from '@/api/types';
import { setAcademicAnchor, getWeekNumber, getWeekStart } from '@/lib/time';
import { getWeekForDate, getWeeksForMonth, getAdjacentMonth } from '@/lib/monthWeeks';
import PeriodGrid from '@/components/PeriodGrid';
import SidebarLayout from '@/components/SidebarLayout';
import SidebarSection from '@/components/SidebarSection';
import { useSearchParams, Link } from 'react-router-dom';
import { format, addDays } from 'date-fns';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  UserGroupIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import LessonModal from '@/components/LessonModal';

type SlotSelection = {
  day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  time: string;
};

type FeedbackState = {
  type: 'success' | 'error';
  message: string;
};

const MIN_WEEK = 1;

const DAYS: Array<"Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun"> = [
  "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
];

export const WeekView: React.FC = () => {
  const [lessons, setLessons] = useState<LessonOut[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedSlot, setSelectedSlot] = useState<SlotSelection | null>(null);
  const [editingLesson, setEditingLesson] = useState<LessonOut | null>(null);
  const [lessonToDelete, setLessonToDelete] = useState<LessonOut | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isTeacherPaletteOpen, setIsTeacherPaletteOpen] = useState<boolean>(false);
  const [teacherSearch, setTeacherSearch] = useState<string>('');
  const [params, setParams] = useSearchParams();
  const teacherParam = params.get('teacher');
  const teacherId = teacherParam ? Number(teacherParam) : undefined;
  const [weekNumber, setWeekNumberState] = useState<number | null>(null);
  const [anchorLoaded, setAnchorLoaded] = useState<boolean>(false);
  const grouped = true;
  const canEdit = useMemo(() => auth.hasAnyRole(['manager', 'admin']), []);
  const showAllTeachers = params.get('all') === 'true' && canEdit;
  const teacherSelectorRef = useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    api.getAnchor()
      .then(({ anchor_date }) => {
        setAcademicAnchor(anchor_date);
        setAnchorLoaded(true);
        setWeekNumberState(getWeekNumber(new Date()));
      })
      .catch(() => {
        setAnchorLoaded(true);
        setWeekNumberState(getWeekNumber(new Date()));
      });

    if (canEdit) {
      api.listTeachers().then(setTeachers).catch(() => {});
    }
  }, [canEdit]);

  React.useEffect(() => {
    if (!canEdit || showAllTeachers || teachers.length === 0) return;

    const selectedTeacher = teacherId !== undefined
      ? teachers.find((teacher) => teacher.teacher_id === teacherId)
      : undefined;

    if (selectedTeacher) return;

    const preferredTeacher =
      teachers.find((teacher) => teacher.name.startsWith('[Demo]')) ||
      teachers.find((teacher) => teacher.name === 'Mr Daniel') ||
      teachers[0];

    if (!preferredTeacher) return;

    const nextParams = new URLSearchParams(params);
    nextParams.set('teacher', String(preferredTeacher.teacher_id));
    nextParams.delete('all');
    setParams(nextParams, { replace: true });
  }, [canEdit, showAllTeachers, teachers, teacherId, params, setParams]);

  const fetchLessons = useCallback(() => {
    if (!anchorLoaded || weekNumber === null) return;

    const effectiveWeek = Math.max(MIN_WEEK, weekNumber);
    const weekStart = getWeekStart(effectiveWeek);
    const targetDate = effectiveWeek >= 7 ? addDays(weekStart, 1) : weekStart;
    const weekInfo = getWeekForDate(targetDate);

    const apiParams = weekInfo ? {
      month: weekInfo.month,
      year: weekInfo.year,
      week_number: weekInfo.weekNumber,
      grouped
    } : {
      week: effectiveWeek,
      grouped
    };

    if (!canEdit) {
      const currentUser = auth.getUser();
      const userTeacherId = currentUser?.teacher_id;

      if (userTeacherId) {
        api.getTeacherSchedule(userTeacherId, apiParams)
          .then((data) => { setLessons(data); setError(null); })
          .catch((e) => setError(String(e)));
      } else {
        setError('No teacher ID found for current user');
      }
      return;
    }

    if (teachers.length === 0) return;
    if (!showAllTeachers && (teacherId === undefined || !teachers.some((teacher) => teacher.teacher_id === teacherId))) return;

    const fetchPromise = showAllTeachers
      ? api.listLessons(apiParams)
      : api.getTeacherSchedule(teacherId as number, apiParams);

    fetchPromise
      .then((data) => {
        setLessons(data);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  }, [grouped, showAllTeachers, teacherId, weekNumber, canEdit, anchorLoaded, teachers]);

  React.useEffect(() => { fetchLessons(); }, [fetchLessons]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (isTeacherPaletteOpen && teacherSelectorRef.current && !teacherSelectorRef.current.contains(target)) {
        setIsTeacherPaletteOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isTeacherPaletteOpen]);

  React.useEffect(() => {
    if (!isTeacherPaletteOpen) { setTeacherSearch(''); return; }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsTeacherPaletteOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTeacherPaletteOpen]);

  const weekStart = React.useMemo(() => {
    if (weekNumber === null) {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(today);
      monday.setDate(today.getDate() + daysToMonday);
      monday.setHours(0, 0, 0, 0);
      return monday;
    }
    return getWeekStart(Math.max(MIN_WEEK, weekNumber));
  }, [weekNumber]);

  const weekInfo = React.useMemo(() => getWeekForDate(weekStart), [weekStart]);
  const weekEnd = React.useMemo(() => addDays(weekStart, 6), [weekStart]);

  const dayNameMap: Record<SlotSelection['day'], string> = {
    Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday',
    Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
  };

  const navigateWeek = useCallback((direction: 'prev' | 'next') => {
    setWeekNumberState((prev) => {
      if (prev === null) return getWeekNumber(new Date());
      const next = direction === 'prev' ? prev - 1 : prev + 1;
      return Math.max(MIN_WEEK, next);
    });
  }, []);

  const handleTeacherChange = (newTeacherId: number | 'all') => {
    const newParams = new URLSearchParams(params);
    if (newTeacherId === 'all') {
      newParams.set('all', 'true');
      newParams.delete('teacher');
    } else {
      newParams.set('teacher', String(newTeacherId));
      newParams.delete('all');
    }
    setParams(newParams, { replace: true });
  };

  const currentTeacher = teachers.find(t => t.teacher_id === teacherId);
  const currentTeacherName = React.useMemo(() => {
    if (!canEdit) {
      const currentUser = auth.getUser();
      return currentUser?.username || 'Your Schedule';
    }
    return currentTeacher ? currentTeacher.name : `Teacher #${teacherId}`;
  }, [canEdit, currentTeacher, teacherId]);

  const toggleEditMode = () => {
    if (!canEdit) return;
    setIsEditMode((prev) => !prev);
    setSelectedSlot(null);
    setEditingLesson(null);
    setLessonToDelete(null);
    setFeedback(null);
  };

  const computeEndTime = (startTime: string, minutes = 30) => {
    const [hour, minute] = startTime.split(':').map(Number);
    const total = hour * 60 + minute + minutes;
    const endHour = Math.floor(total / 60);
    const endMinute = total % 60;
    return `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
  };

  const segmentedTeachers = React.useMemo(() => {
    if (!teachers.length) return { foreign: [] as Teacher[], vietnamese: [] as Teacher[], cover: [] as Teacher[] };

    const filtered = teacherSearch
      ? teachers.filter((t) => t.name.toLowerCase().includes(teacherSearch.toLowerCase()))
      : teachers;

    const foreignTeacherNames = [
      'Ms Vicky', 'Ms Vic', 'Ms Emma', 'Mr Ivan', 'IVAN', 'Ms Michelle', 'MIchelle',
      'Ms Anastasia', 'Nas', 'Mr Daniel', 'Daniel', 'Ms Jessica', 'Jessica',
      'Mr Zakaria', 'Zakaria', 'Zak'
    ];

    const foreign = filtered.filter((t) =>
      t.is_foreign || foreignTeacherNames.some(name =>
        t.name.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(t.name.toLowerCase())
      )
    );

    const cover = filtered.filter((t) =>
      t.name.toLowerCase().includes('cover') || t.name.toLowerCase().includes('cover teacher')
    );

    const vietnamese = filtered.filter((t) =>
      !t.is_foreign &&
      !foreignTeacherNames.some(name =>
        t.name.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(t.name.toLowerCase())
      ) &&
      !t.name.toLowerCase().includes('cover')
    );

    return { foreign, vietnamese, cover };
  }, [teachers, teacherSearch]);

  const handleSlotClick = (day: SlotSelection['day'], time: string) => {
    if (!canEdit || !isEditMode) return;
    setSelectedSlot({ day, time });
    setEditingLesson(null);
    setIsModalOpen(true);
    setFeedback(null);
  };

  const handleLessonEdit = (lesson: LessonOut) => {
    if (!canEdit || !isEditMode) return;
    setEditingLesson(lesson);
    setSelectedSlot(null);
    setIsModalOpen(true);
    setFeedback(null);
  };

  const handleLessonDelete = (lesson: LessonOut) => {
    if (!canEdit || !isEditMode) return;
    setLessonToDelete(lesson);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedSlot(null);
    setEditingLesson(null);
  };

  const handleSaveLesson = async (payload: LessonCreate | LessonUpdate) => {
    try {
      setIsSaving(true);
      if (editingLesson?.id) {
        await api.updateLesson(editingLesson.id, payload as LessonUpdate);
        setFeedback({ type: 'success', message: 'Lesson updated successfully.' });
      } else {
        await api.createLesson(payload as LessonCreate);
        setFeedback({ type: 'success', message: 'Lesson created successfully.' });
      }
      closeModal();
      fetchLessons();
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save lesson.' });
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
      setFeedback({ type: 'success', message: 'Lesson deleted successfully.' });
      setLessonToDelete(null);
      fetchLessons();
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to delete lesson.' });
    } finally {
      setIsDeleting(false);
    }
  };

  const defaultTeacherId = !showAllTeachers ? currentTeacher?.teacher_id : undefined;
  const defaultStartTime = selectedSlot?.time;
  const defaultEndTime = selectedSlot && editingLesson === null ? computeEndTime(selectedSlot.time, 30) : undefined;
  const defaultDayName = selectedSlot ? dayNameMap[selectedSlot.day] : undefined;

  const timeWindow = React.useMemo(() => {
    const fallbackStart = '05:00';
    const fallbackEnd = '22:00';
    const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const toHHMM = (m: number) => {
      const hh = Math.max(0, Math.min(23, Math.floor(m / 60)));
      const mm = Math.max(0, Math.min(59, m % 60));
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    };
    if (!lessons || lessons.length === 0) return { dayStart: fallbackStart, dayEnd: fallbackEnd };
    let minStart = Infinity;
    let maxEnd = -Infinity;
    for (const l of lessons) {
      if (l.start_time) minStart = Math.min(minStart, toMinutes(l.start_time));
      if (l.end_time) maxEnd = Math.max(maxEnd, toMinutes(l.end_time));
    }
    if (!isFinite(minStart) || !isFinite(maxEnd)) return { dayStart: fallbackStart, dayEnd: fallbackEnd };
    minStart = Math.max(0, minStart - 30);
    maxEnd = Math.min(23 * 60 + 59, maxEnd + 30);
    return { dayStart: toHHMM(minStart), dayEnd: toHHMM(maxEnd) };
  }, [lessons]);

  /* ─── Teacher palette (shared between sidebar sections) ─── */
  const teacherPaletteDropdown = (
    <div className="space-y-1 max-h-[320px] overflow-y-auto">
      <button
        onClick={() => { handleTeacherChange('all'); setIsTeacherPaletteOpen(false); }}
        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${showAllTeachers ? 'bg-accent-500 text-white' : 'text-white/60 hover:bg-white/[0.04]'}`}
      >
        <UserGroupIcon className="h-4 w-4" />
        All Teachers
      </button>
      {segmentedTeachers.foreign.length > 0 && (
        <div className="pt-2 pb-1 px-1 text-[10px] uppercase tracking-wider text-white/30 font-semibold">Foreign</div>
      )}
      {segmentedTeachers.foreign.map((t) => (
        <button key={t.teacher_id} onClick={() => { handleTeacherChange(t.teacher_id); setIsTeacherPaletteOpen(false); }}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${!showAllTeachers && t.teacher_id === teacherId ? 'bg-accent-500 text-white' : 'text-white/60 hover:bg-white/[0.04]'}`}>
          <span className="font-medium">{t.name}</span>
        </button>
      ))}
      {segmentedTeachers.cover.length > 0 && (
        <div className="pt-2 pb-1 px-1 text-[10px] uppercase tracking-wider text-white/30 font-semibold">Cover</div>
      )}
      {segmentedTeachers.cover.map((t) => (
        <button key={t.teacher_id} onClick={() => { handleTeacherChange(t.teacher_id); setIsTeacherPaletteOpen(false); }}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${!showAllTeachers && t.teacher_id === teacherId ? 'bg-purple-600 text-white' : 'text-white/60 hover:bg-white/[0.04]'}`}>
          <span className="font-medium">{t.name}</span>
        </button>
      ))}
      {segmentedTeachers.vietnamese.length > 0 && (
        <div className="pt-2 pb-1 px-1 text-[10px] uppercase tracking-wider text-white/30 font-semibold">Vietnamese</div>
      )}
      {segmentedTeachers.vietnamese.map((t) => (
        <button key={t.teacher_id} onClick={() => { handleTeacherChange(t.teacher_id); setIsTeacherPaletteOpen(false); }}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${!showAllTeachers && t.teacher_id === teacherId ? 'bg-emerald-600 text-white' : 'text-white/60 hover:bg-white/[0.04]'}`}>
          <span className="font-medium">{t.name}</span>
        </button>
      ))}
    </div>
  );

  /* ─── Sidebar content ─── */
  const sidebarContent = (
    <>
      {/* Teacher selector */}
      {canEdit ? (
        <SidebarSection label="Teacher">
          <div ref={teacherSelectorRef}>
            <button
              onClick={() => setIsTeacherPaletteOpen((prev) => !prev)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-white/70 rounded-xl border border-white/[0.08] hover:border-accent-500/30 hover:text-white transition-all"
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                {showAllTeachers ? '\u221e' : (currentTeacherName?.[0] ?? 'T').toUpperCase()}
              </div>
              <span className="font-semibold text-white truncate flex-1 text-left">
                {showAllTeachers ? 'All Teachers' : currentTeacherName}
              </span>
              <ChevronDownIcon className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${isTeacherPaletteOpen ? 'rotate-180 text-accent-400' : 'text-white/40'}`} />
            </button>

            {isTeacherPaletteOpen && (
              <div className="mt-2 rounded-xl border border-white/[0.06] bg-elevated p-2.5 shadow-card">
                <div className="relative mb-2">
                  <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-white/40" />
                  <input
                    type="text"
                    value={teacherSearch}
                    onChange={(e) => setTeacherSearch(e.target.value)}
                    placeholder="Search…"
                    className="w-full rounded-lg border border-white/[0.06] bg-base py-1.5 pl-8 pr-3 text-sm text-white placeholder-white/30 focus:border-accent-500/40 focus:outline-none"
                    autoFocus
                  />
                </div>
                {teacherPaletteDropdown}
              </div>
            )}
          </div>
        </SidebarSection>
      ) : (
        <SidebarSection label="Teacher">
          <div className="px-1 text-sm font-semibold text-white/70">{currentTeacherName}</div>
        </SidebarSection>
      )}

      {/* Week navigation */}
      <SidebarSection label="Week">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => navigateWeek('prev')}
            className="p-1.5 text-white/40 hover:text-white/80 rounded-lg hover:bg-white/[0.04] transition-colors"
          >
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <div className="text-center min-w-0">
            <div className="text-sm font-semibold text-white truncate">
              {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d')}
            </div>
            <div className="text-[11px] text-white/40 font-medium">
              {weekInfo?.weekNumber ? `W${weekInfo.weekNumber}` : format(weekStart, 'yyyy')}
            </div>
          </div>
          <button
            onClick={() => navigateWeek('next')}
            className="p-1.5 text-white/40 hover:text-white/80 rounded-lg hover:bg-white/[0.04] transition-colors"
          >
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
      </SidebarSection>
    </>
  );

  return (
    <SidebarLayout sidebar={sidebarContent}>
      <div className="min-h-full bg-base">
        {/* Content header with edit toggle */}
        <div className="border-b border-white/[0.06] bg-surface px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white font-display">Week View</h2>
            {canEdit && (
              <button
                onClick={toggleEditMode}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isEditMode
                    ? 'border-accent-500 bg-accent-500 text-white'
                    : 'border-white/[0.08] text-white/50 hover:bg-white/[0.04] hover:text-white/80'
                }`}
              >
                <PencilSquareIcon className="h-3.5 w-3.5" />
                {isEditMode ? 'Editing' : 'Edit'}
              </button>
            )}
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="px-4 lg:px-6 pt-4">
            <div className="rounded-lg border border-red-500/20 bg-red-500/[0.08] p-4">
              <h3 className="text-sm font-medium text-red-300">Error loading schedule</h3>
              <p className="mt-1 text-sm text-red-400">{error}</p>
            </div>
          </div>
        )}

        {/* Calendar Container */}
        <div className="px-4 lg:px-6 py-4 lg:py-6">
          {isEditMode && canEdit && (
            <div className="mb-4 flex items-center gap-3 rounded-lg border border-accent-500/20 bg-accent-500/[0.06] px-4 py-3 text-sm text-accent-300">
              <PencilSquareIcon className="h-5 w-5" />
              <span>
                Edit mode active. Click <span className="font-semibold">+</span> to add a lesson, or use the edit/delete buttons on existing lessons.
              </span>
            </div>
          )}

          {feedback && (
            <div
              className={`mb-4 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
                feedback.type === 'success'
                  ? 'border-green-500/20 bg-green-500/[0.08] text-green-300'
                  : 'border-red-500/20 bg-red-500/[0.08] text-red-400'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircleIcon className="h-5 w-5" />
              ) : (
                <XCircleIcon className="h-5 w-5" />
              )}
              <span>{feedback.message}</span>
              <button type="button" className="ml-auto text-xs font-medium underline" onClick={() => setFeedback(null)}>
                Dismiss
              </button>
            </div>
          )}

          <PeriodGrid
            weekStartISO={weekStart.toISOString()}
            lessons={lessons}
            dayStart={timeWindow.dayStart}
            dayEnd={timeWindow.dayEnd}
            isEditMode={isEditMode && canEdit}
            onSlotClick={handleSlotClick}
            onLessonEdit={handleLessonEdit}
            onLessonDelete={handleLessonDelete}
          />
        </div>

        <LessonModal
          isOpen={isModalOpen}
          onClose={closeModal}
          onSave={handleSaveLesson}
          lesson={editingLesson}
          defaultWeek={weekInfo?.weekNumber ?? weekNumber ?? 1}
          defaultDay={defaultDayName || 'Monday'}
          defaultMonth={weekInfo?.month}
          defaultYear={weekInfo?.year}
          defaultWeekNumber={weekInfo?.weekNumber}
          defaultTeacherId={defaultTeacherId}
          defaultStartTime={defaultStartTime}
          defaultEndTime={defaultEndTime}
          isSaving={isSaving}
        />

        {lessonToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-card">
              <h3 className="text-lg font-semibold text-white">Delete Lesson</h3>
              <p className="mt-2 text-sm text-white/60">
                Are you sure you want to delete the lesson
                {' '}<span className="font-semibold">{lessonToDelete.class_code}</span>{' '}
                with {lessonToDelete.teacher_name} on {lessonToDelete.day} at {lessonToDelete.start_time}?
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
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SidebarLayout>
  );
};

export default WeekView;
