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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation Header */}
      <div className={`sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm transition-all duration-500 ease-out ${
        isHeaderVisible 
          ? 'translate-y-0 opacity-100' 
          : '-translate-y-full opacity-0'
      }`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* First Row: Navigation and Teacher Info */}
          <div className="flex items-center justify-between h-12">
            {/* Left: Teacher Selector - Only for managers and admins */}
            <div className="flex items-center space-x-4">
              {canEdit ? (
                <div className="relative" ref={teacherSelectorRef}>
                  <button
                    onClick={() => setIsTeacherPaletteOpen((prev) => !prev)}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:border-orange-400 hover:text-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 transition-all"
                  >
                    <div className="flex flex-col items-start leading-tight">
                      <span className="text-xs uppercase tracking-wide text-gray-400">Teacher</span>
                      <span className="font-semibold text-gray-900">
                        {showAllTeachers ? 'All Teachers' : currentTeacherName}
                      </span>
                    </div>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-orange-600 font-semibold">
                      {showAllTeachers ? 'ALL' : `T${teacherId}`}
                    </span>
                    <ChevronDownIcon className={`h-4 w-4 transition-transform ${isTeacherPaletteOpen ? 'rotate-180 text-orange-500' : 'text-gray-400'}`} />
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
                      <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                      <input
                        type="text"
                        value={teacherSearch}
                        onChange={(e) => setTeacherSearch(e.target.value)}
                        placeholder="Search teacher name..."
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-10 pr-3 text-sm text-gray-700 placeholder-gray-400 focus:border-orange-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-100"
                      />
                    </div>

                    <div className="mt-4 space-y-4 max-h-[360px] overflow-y-auto pr-1">
                      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-gray-400">
                        <div className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-orange-600">
                          <GlobeAltIcon className="h-4 w-4" />
                          Foreign teachers
                        </div>
                        <span className="text-gray-300">{segmentedTeachers.foreign.length}</span>
                      </div>
                      <div className="grid grid-cols-1 gap-1">
                        <button
                          onClick={() => {
                            handleTeacherChange('all');
                            setIsTeacherPaletteOpen(false);
                          }}
                          className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition ${showAllTeachers ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600 hover:bg-orange-50 hover:text-orange-600'}`}
                        >
                          <span className="flex items-center gap-2 font-semibold">
                            <UserGroupIcon className="h-4 w-4" />
                            All Teachers
                          </span>
                          <span className="text-xs uppercase tracking-wide">Overview</span>
                        </button>
                        {segmentedTeachers.foreign.length === 0 && (
                          <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400">
                            {teacherSearch
                              ? 'No foreign teachers match your search.'
                              : 'Foreign teacher list coming soon.'}
                          </p>
                        )}
                        {segmentedTeachers.foreign.map((teacher) => {
                          const isActive = !showAllTeachers && teacher.teacher_id === teacherId;
                          return (
                            <button
                              key={teacher.teacher_id}
                              onClick={() => {
                                handleTeacherChange(teacher.teacher_id);
                                setIsTeacherPaletteOpen(false);
                              }}
                              className={`flex items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${isActive ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-700 hover:bg-orange-50 hover:text-orange-600'}`}
                            >
                              <span className="font-medium">{teacher.name}</span>
                              <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide">
                                <FlagIcon className="h-4 w-4" />
                                Foreign
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-gray-400 pt-2">
                        <div className="inline-flex items-center gap-2 rounded-full bg-purple-50 px-3 py-1 text-purple-600">
                          <UserGroupIcon className="h-4 w-4" />
                          Cover Foreign Teachers
                        </div>
                        <span className="text-gray-300">{segmentedTeachers.cover.length}</span>
                      </div>
                      <div className="grid grid-cols-1 gap-1 pb-1">
                        {segmentedTeachers.cover.length === 0 && (
                          <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400">
                            {teacherSearch
                              ? 'No cover teachers match your search.'
                              : 'Cover teacher list coming soon.'}
                          </p>
                        )}
                        {segmentedTeachers.cover.map((teacher) => {
                          const isActive = !showAllTeachers && teacher.teacher_id === teacherId;
                          return (
                            <button
                              key={teacher.teacher_id}
                              onClick={() => {
                                handleTeacherChange(teacher.teacher_id);
                                setIsTeacherPaletteOpen(false);
                              }}
                              className={`flex items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${isActive ? 'bg-purple-500 text-white shadow-sm' : 'text-gray-700 hover:bg-purple-50 hover:text-purple-600'}`}
                            >
                              <span className="font-medium">{teacher.name}</span>
                              <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide">
                                <UserGroupIcon className="h-4 w-4" />
                                Cover
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-gray-400 pt-2">
                        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-emerald-600">
                          <FlagIcon className="h-4 w-4" />
                          Vietnamese teachers
                        </div>
                        <span className="text-gray-300">{segmentedTeachers.vietnamese.length}</span>
                      </div>
                      <div className="grid grid-cols-1 gap-1 pb-1">
                        {segmentedTeachers.vietnamese.length === 0 && (
                          <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400">
                            {teacherSearch
                              ? 'No Vietnamese teachers match your search.'
                              : 'Vietnamese teacher list coming soon.'}
                          </p>
                        )}
                        {segmentedTeachers.vietnamese.map((teacher) => {
                          const isActive = !showAllTeachers && teacher.teacher_id === teacherId;
                          return (
                            <button
                              key={teacher.teacher_id}
                              onClick={() => {
                                handleTeacherChange(teacher.teacher_id);
                                setIsTeacherPaletteOpen(false);
                              }}
                              className={`flex items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${isActive ? 'bg-emerald-500 text-white shadow-sm' : 'text-gray-700 hover:bg-emerald-50 hover:text-emerald-600'}`}
                            >
                              <span className="font-medium">{teacher.name}</span>
                              <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide">
                                <FlagIcon className="h-4 w-4" />
                                Viet
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
                </div>
              ) : (
                /* For teachers: Show read-only teacher info without selector */
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
                
                {/* Dropdown Menu */}
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
                        to="/month"
                        className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        <CalendarIcon className="w-4 h-4 mr-3" />
                        Month View
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Teacher Info */}
            <div className="flex items-center space-x-3">
              {canEdit && (
                <button
                  onClick={toggleEditMode}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                    isEditMode
                      ? 'border-orange-500 bg-orange-500 text-white hover:bg-orange-600'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <PencilSquareIcon className="h-4 w-4" />
                  {isEditMode ? 'Exit Edit Mode' : 'Edit Mode'}
                </button>
              )}
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">
                  {showAllTeachers ? 'All Teachers' : currentTeacherName}
                </p>
                <p className="text-xs text-gray-500 font-medium">Weekly Schedule</p>
              </div>
              <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-semibold text-orange-700">
                  {showAllTeachers ? 'ALL' : `T${teacherId}`}
                </span>
              </div>
            </div>
          </div>

          {/* Second Row: Week Navigation */}
          <div className="flex items-center justify-center h-12 border-t border-gray-100">
            <div className="flex items-center space-x-6">
              <button
                onClick={() => navigateWeek('prev')}
                disabled={false}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeftIcon className="w-5 h-5" />
              </button>
              
              <div className="text-center min-w-0 flex-1">
                <h1 className="text-lg font-semibold text-gray-900 truncate">
                  {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
                </h1>
                <p className="text-sm text-gray-500 font-medium">
                  {(() => {
                    const monthWeek = weekInfo?.weekNumber;
                    const monthLabel = format(weekStart, 'MMM yyyy');
                    if (monthWeek) return `Week ${monthWeek} (${monthLabel})`;
                    return monthLabel;
                  })()}
                </p>
              </div>
              
              <button
                onClick={() => navigateWeek('next')}
                disabled={false}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRightIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>


      {/* Error State */}
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

      {/* Calendar Container */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        {isEditMode && canEdit && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
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
                ? 'border-green-200 bg-green-50 text-green-800'
                : 'border-red-200 bg-red-50 text-red-700'
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

        {(() => {
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
            return (
              <PeriodGrid
                weekStartISO={weekStart.toISOString()}
                lessons={lessons}
                dayStart={fallbackStart}
                dayEnd={fallbackEnd}
                isEditMode={isEditMode && canEdit}
                onSlotClick={handleSlotClick}
                onLessonEdit={handleLessonEdit}
                onLessonDelete={handleLessonDelete}
              />
            );
          }

          let minStart = Infinity;
          let maxEnd = -Infinity;
          for (const l of lessons) {
            if (l.start_time) minStart = Math.min(minStart, toMinutes(l.start_time));
            if (l.end_time) maxEnd = Math.max(maxEnd, toMinutes(l.end_time));
          }
          if (!isFinite(minStart) || !isFinite(maxEnd)) {
            minStart = toMinutes(fallbackStart);
            maxEnd = toMinutes(fallbackEnd);
          }
          // add a small padding window
          minStart = Math.max(0, minStart - 30);
          maxEnd = Math.min(23 * 60 + 59, maxEnd + 30);

          const computedStart = toHHMM(minStart);
          const computedEnd = toHHMM(maxEnd);

          return (
            <PeriodGrid
              weekStartISO={weekStart.toISOString()}
              lessons={lessons}
              dayStart={computedStart}
              dayEnd={computedEnd}
              isEditMode={isEditMode && canEdit}
              onSlotClick={handleSlotClick}
              onLessonEdit={handleLessonEdit}
              onLessonDelete={handleLessonDelete}
            />
          );
        })()}
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
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Delete Lesson</h3>
            <p className="mt-2 text-sm text-gray-600">
              Are you sure you want to delete the lesson
              {' '}<span className="font-semibold">{lessonToDelete.class_code}</span>{' '}
              with {lessonToDelete.teacher_name} on {lessonToDelete.day} at {lessonToDelete.start_time}?
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


