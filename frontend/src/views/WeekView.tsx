import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { api, auth } from '@/api/client';
import type { LessonOut, LessonCreate, LessonUpdate, Teacher } from '@/api/types';
import { setAcademicAnchor, getWeekNumber, getWeekStart } from '@/lib/time';
import { getWeekForDate, getWeeksForMonth, getAdjacentMonth } from '@/lib/monthWeeks';
import PeriodGrid from '@/components/PeriodGrid';
import { useSearchParams, Link } from 'react-router-dom';
import { format, addDays } from 'date-fns';
import {
  Bars3Icon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FlagIcon,
  GlobeAltIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  SparklesIcon,
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
// Remove MAX_WEEK limit to allow navigation beyond current academic period

const DAYS: Array<"Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun"> = [
  "Mon",
  "Tue", 
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];

export const WeekView: React.FC = () => {
  const [lessons, setLessons] = useState<LessonOut[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState<boolean>(true);
  const [lastScrollY, setLastScrollY] = useState<number>(0);
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
  const teacherId = Number(params.get('teacher') || '1');
  const [weekNumber, setWeekNumberState] = useState<number | null>(null);
  const [anchorLoaded, setAnchorLoaded] = useState<boolean>(false);
  const grouped = true;
  const canEdit = useMemo(() => auth.hasAnyRole(['manager', 'admin']), []);
  const showAllTeachers = params.get('all') === 'true' && canEdit; // Only managers/admins can see all teachers
  const teacherSelectorRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Fetch calendar anchor and teachers once
  React.useEffect(() => {
    api.getAnchor()
      .then(({ anchor_date }) => {
        setAcademicAnchor(anchor_date);
        setAnchorLoaded(true);
        // Set current week number after anchor is loaded
        setWeekNumberState(getWeekNumber(new Date()));
      })
      .catch(() => {
        // Even if API fails, set anchor loaded to use fallback
        setAnchorLoaded(true);
        setWeekNumberState(getWeekNumber(new Date()));
      });
    
    // Load teachers for the selector (only for managers/admins)
    if (canEdit) {
    api.listTeachers()
      .then(setTeachers)
      .catch(() => {});
    }
  }, [canEdit]);

  const fetchLessons = useCallback(() => {
    // Don't fetch lessons until anchor is loaded and weekNumber is set
    if (!anchorLoaded || weekNumber === null) {
      return;
    }
    
    const effectiveWeek = Math.max(MIN_WEEK, weekNumber);
    
    // For extended weeks (beyond academic period), use month-based parameters
    const weekStart = getWeekStart(effectiveWeek);
    // For week 7 (Oct 13-19), we need to look at Oct 13, not Oct 12
    const targetDate = effectiveWeek >= 7 ? addDays(weekStart, 1) : weekStart;
    const weekInfo = getWeekForDate(targetDate);
    
    console.log('WeekView debug:', { 
      effectiveWeek, 
      weekStart: weekStart.toISOString(), 
      targetDate: targetDate.toISOString(),
      weekStartMonth: weekStart.getMonth() + 1,
      weekStartYear: weekStart.getFullYear(),
      weekInfo: weekInfo ? {
        weekNumber: weekInfo.weekNumber,
        month: weekInfo.month,
        year: weekInfo.year,
        startDate: weekInfo.startDate,
        endDate: weekInfo.endDate
      } : null
    });
    
    const apiParams = weekInfo ? {
      month: weekInfo.month,
      year: weekInfo.year,
      week_number: weekInfo.weekNumber,
      grouped
    } : {
      week: effectiveWeek,
      grouped
    };
    
    console.log('WeekView API params:', { effectiveWeek, weekInfo, apiParams });
    
    // For teachers: always fetch their own schedule, ignore URL parameters
    if (!canEdit) {
      // Get current user's teacher ID from auth
      const currentUser = auth.getUser();
      const userTeacherId = currentUser?.teacher_id;
      
      if (userTeacherId) {
        api.getTeacherSchedule(userTeacherId, apiParams)
          .then((data) => {
            setLessons(data);
            setError(null);
          })
          .catch((e) => setError(String(e)));
      } else {
        setError('No teacher ID found for current user');
      }
      return;
    }
    
    // For managers/admins: use the existing logic
    const fetchPromise = showAllTeachers
      ? api.listLessons(apiParams)
      : api.getTeacherSchedule(teacherId, apiParams);

    fetchPromise
      .then((data) => {
        setLessons(data);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  }, [grouped, showAllTeachers, teacherId, weekNumber, canEdit, anchorLoaded]);

  React.useEffect(() => {
    fetchLessons();
  }, [fetchLessons]);

  // Close menu when clicking outside
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

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen, isTeacherPaletteOpen]);

  React.useEffect(() => {
    if (!isTeacherPaletteOpen) {
      setTeacherSearch('');
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsTeacherPaletteOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTeacherPaletteOpen]);

  // Handle scroll-based header visibility
  React.useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      // Show header only when reaching the top (within 20px of top)
      if (currentScrollY < 20) {
        setIsHeaderVisible(true);
      } 
      // Hide header when scrolling down past 30px (much earlier to avoid covering Monday)
      else if (currentScrollY > lastScrollY && currentScrollY > 30) {
        setIsHeaderVisible(false);
      }
      // Don't show header when scrolling up - only when reaching top
      
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  const weekStart = React.useMemo(() => {
    if (weekNumber === null) {
      // Return Monday of current week as fallback until weekNumber is set
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // If Sunday, go back 6 days; otherwise go back to Monday
      const monday = new Date(today);
      monday.setDate(today.getDate() + daysToMonday);
      monday.setHours(0, 0, 0, 0);
      return monday;
    }
    const normalizedWeek = Math.max(MIN_WEEK, weekNumber);
    return getWeekStart(normalizedWeek);
  }, [weekNumber]);

  const weekInfo = React.useMemo(() => getWeekForDate(weekStart), [weekStart]);

  const dayNameMap: Record<SlotSelection['day'], string> = {
    Mon: 'Monday',
    Tue: 'Tuesday',
    Wed: 'Wednesday',
    Thu: 'Thursday',
    Fri: 'Friday',
    Sat: 'Saturday',
    Sun: 'Sunday',
  };

  const weekEnd = React.useMemo(() => addDays(weekStart, 6), [weekStart]);

  const navigateWeek = useCallback((direction: 'prev' | 'next') => {
    setWeekNumberState((prev) => {
      if (prev === null) {
        // If weekNumber is not set yet, initialize with current week
        return getWeekNumber(new Date());
      }
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
      // For teachers: get name from current user
      const currentUser = auth.getUser();
      return currentUser?.username || 'Your Schedule';
    }
    return currentTeacher ? currentTeacher.name : `Teacher #${teacherId}`;
  }, [canEdit, currentTeacher, teacherId]);

  const viewMode: 'period' = 'period';

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
    if (!teachers.length) {
      return { foreign: [] as Teacher[], vietnamese: [] as Teacher[], cover: [] as Teacher[] };
    }

    const filtered = teacherSearch
      ? teachers.filter((t) => t.name.toLowerCase().includes(teacherSearch.toLowerCase()))
      : teachers;

    // Define the specific foreign teachers list
    const foreignTeacherNames = [
      'Ms Vicky', 'Ms Vic', 'Ms Emma', 'Mr Ivan', 'IVAN', 'Ms Michelle', 'MIchelle', 
      'Ms Anastasia', 'Nas', 'Mr Daniel', 'Daniel', 'Ms Jessica', 'Jessica', 
      'Mr Zakaria', 'Zakaria', 'Zak'
    ];

    // Categorize teachers
    const foreign = filtered.filter((t) => 
      t.is_foreign || foreignTeacherNames.some(name => 
        t.name.toLowerCase().includes(name.toLowerCase()) || 
        name.toLowerCase().includes(t.name.toLowerCase())
      )
    );

    const cover = filtered.filter((t) => 
      t.name.toLowerCase().includes('cover') || 
      t.name.toLowerCase().includes('cover teacher')
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

  const openCreateModal = (day: SlotSelection['day'], time: string) => {
    setSelectedSlot({ day, time });
    setEditingLesson(null);
    setIsModalOpen(true);
    setFeedback(null);
  };

  const handleSlotClick = (day: SlotSelection['day'], time: string) => {
    if (!canEdit || !isEditMode) return;
    openCreateModal(day, time);
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

    const toMinutes = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    const toHHMM = (m: number) => {
      const hh = Math.max(0, Math.min(23, Math.floor(m / 60)));
      const mm = Math.max(0, Math.min(59, m % 60));
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    };

    if (!lessons || lessons.length === 0) {
      return { dayStart: fallbackStart, dayEnd: fallbackEnd };
    }

    let minStart = Infinity;
    let maxEnd = -Infinity;
    for (const l of lessons) {
      if (l.start_time) minStart = Math.min(minStart, toMinutes(l.start_time));
      if (l.end_time) maxEnd = Math.max(maxEnd, toMinutes(l.end_time));
    }
    if (!isFinite(minStart) || !isFinite(maxEnd)) {
      return { dayStart: fallbackStart, dayEnd: fallbackEnd };
    }

    minStart = Math.max(0, minStart - 30);
    maxEnd = Math.min(23 * 60 + 59, maxEnd + 30);

    return {
      dayStart: toHHMM(minStart),
      dayEnd: toHHMM(maxEnd),
    };
  }, [lessons]);

  return (
    <div className="min-h-screen bg-base">
      {/* Compact Toolbar */}
      <div className={`sticky top-0 z-40 glass-nav transition-all duration-500 ease-out ${
        isHeaderVisible 
          ? 'translate-y-0 opacity-100' 
          : '-translate-y-full opacity-0'
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
                      {showAllTeachers ? 'All' : currentTeacherName}
                    </span>
                    <ChevronDownIcon className={`h-3 w-3 transition-transform ${isTeacherPaletteOpen ? 'rotate-180 text-accent-400' : 'text-white/40'}`} />
                  </button>

                  {isTeacherPaletteOpen && (
                    <div className="absolute left-0 mt-2 w-[300px] max-w-[85vw] rounded-2xl border border-white/[0.06] bg-elevated p-3 shadow-card z-50">
                      <div className="relative mb-3">
                        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-white/40" />
                        <input
                          type="text"
                          value={teacherSearch}
                          onChange={(e) => setTeacherSearch(e.target.value)}
                          placeholder="Search teacher\u2026"
                          className="w-full rounded-lg border border-white/[0.06] bg-base py-2 pl-9 pr-3 text-sm text-white placeholder-white/30 focus:border-accent-500/40 focus:outline-none"
                          autoFocus
                        />
                      </div>
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
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-white/70">
                  <span className="font-semibold">{currentTeacherName}</span>
                </div>
              )}
            </div>

            {/* Center: Week Navigation */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigateWeek('prev')}
                className="p-1.5 text-white/40 hover:text-white/80 rounded-lg hover:bg-white/[0.04] transition-colors"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
              <div className="text-center">
                <div className="text-sm font-semibold text-white">
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

            {/* Right: Edit Mode */}
            <div className="flex items-center gap-2">
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
        </div>
      </div>


      {/* Error State */}
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

      {/* Calendar Container */}
      <div className="page-container page-container-full py-6">
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
            <button
              type="button"
              className="ml-auto text-xs font-medium underline"
              onClick={() => setFeedback(null)}
            >
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
  );
};

export default WeekView;


