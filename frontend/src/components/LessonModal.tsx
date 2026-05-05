import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronDownIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { api } from '../api/client';
import type { LessonCreate, LessonUpdate, TeacherOut, ClassOut, LessonOut } from '../api/types';

interface LessonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (lessonData: LessonCreate | LessonUpdate) => Promise<void>;
  lesson?: LessonOut | null; // For editing
  defaultWeek?: number;
  defaultDay?: string;
  // New month-based week props
  defaultMonth?: number;
  defaultYear?: number;
  defaultWeekNumber?: number;
  // Additional props for pre-filling
  defaultTeacherId?: number;
  defaultStartTime?: string;
  defaultEndTime?: string;
  isSaving?: boolean;
}

interface ConflictWarning {
  field: string;
  message: string;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIME_OPTIONS = Array.from({ length: 8 }, (_, index) => {
  const totalMinutes = 17 * 60 + index * 30;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
});

const DAY_SHORT_MAP: Record<string, string> = {
  monday: 'Mon',
  mon: 'Mon',
  tuesday: 'Tue',
  tue: 'Tue',
  wednesday: 'Wed',
  wed: 'Wed',
  thursday: 'Thu',
  thu: 'Thu',
  friday: 'Fri',
  fri: 'Fri',
  saturday: 'Sat',
  sat: 'Sat',
  sunday: 'Sun',
  sun: 'Sun',
};

const normalizeDay = (day: string): string => {
  const key = day.trim().toLowerCase();
  return DAY_SHORT_MAP[key] ?? day;
};

const toFullDayName = (day: string): string => {
  const shortDay = normalizeDay(day);
  return DAYS.find((fullDay) => normalizeDay(fullDay) === shortDay) ?? day;
};

const toISODate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (dateString: string): string => {
  if (!dateString) return 'Select date';

  return new Date(`${dateString}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
};

const getCalendarCells = (monthDate: Date) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const leadingDays = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [];

  for (let index = 0; index < leadingDays; index++) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(year, month, day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
};

export default function LessonModal({ 
  isOpen, 
  onClose, 
  onSave, 
  lesson, 
  defaultWeek = 1,
  defaultDay = 'Monday',
  defaultMonth,
  defaultYear,
  defaultWeekNumber,
  defaultTeacherId,
  defaultStartTime,
  defaultEndTime,
  isSaving = false
}: LessonModalProps) {
  const [formData, setFormData] = useState({
    teacher_id: defaultTeacherId?.toString() || '',
    co_teacher_id: '',
    class_id: '',
    room: '',
    start_time: defaultStartTime || '',
    end_time: defaultEndTime || '',
    day: defaultDay,
    week: defaultWeek,
    notes: '',
    // New month-based week fields
    month: defaultMonth || new Date().getMonth() + 1,
    year: defaultYear || new Date().getFullYear(),
    week_number: defaultWeekNumber || 1
  });

  const [teachers, setTeachers] = useState<TeacherOut[]>([]);
  const [classes, setClasses] = useState<ClassOut[]>([]);
  const [rooms] = useState(['E1-G1', 'E1-G2', 'E1-G3', 'E2-101', 'E2-102', 'E2-201', 'E2-202', 'E2-301', 'E2-302']);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [conflicts, setConflicts] = useState<ConflictWarning[]>([]);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [searchTerm, setSearchTerm] = useState({ teacher: '', co_teacher: '', class: '' });
  const [filteredTeachers, setFilteredTeachers] = useState<TeacherOut[]>([]);
  const [filteredCoTeachers, setFilteredCoTeachers] = useState<TeacherOut[]>([]);
  const [filteredClasses, setFilteredClasses] = useState<ClassOut[]>([]);
  const [availableWeeks, setAvailableWeeks] = useState<Array<{value: number, label: string}>>([]);
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  const [showAdditionalOptions, setShowAdditionalOptions] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [openTimePicker, setOpenTimePicker] = useState<'start_time' | 'end_time' | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(defaultYear || new Date().getFullYear(), (defaultMonth || new Date().getMonth() + 1) - 1, 1)
  );

  // Load data on mount
  useEffect(() => {
    if (isOpen) {
      loadTeachers();
      loadClasses();
      loadWeeksForMonth(formData.year, formData.month);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsClosing(false);
      return;
    }

    if (!shouldRender) return;

    setIsClosing(true);
    const timeoutId = window.setTimeout(() => {
      setShouldRender(false);
      setIsClosing(false);
    }, 200);

    return () => window.clearTimeout(timeoutId);
  }, [isOpen, shouldRender]);

  // Load weeks when month/year changes
  useEffect(() => {
    if (isOpen && formData.year && formData.month) {
      loadWeeksForMonth(formData.year, formData.month);
    }
  }, [formData.year, formData.month, isOpen]);

  // Filter teachers and classes based on search
  useEffect(() => {
    const filteredT = teachers.filter(t => 
      t.name.toLowerCase().includes(searchTerm.teacher.toLowerCase()) && t.is_active
    );
    setFilteredTeachers(filteredT);

    // Filter co-teachers (Vietnamese teachers - not foreign), excluding the primary teacher.
    const filteredCT = teachers.filter(t => 
      t.name.toLowerCase().includes(searchTerm.co_teacher.toLowerCase()) &&
      t.is_active &&
      !Boolean((t as any).is_foreign) &&
      t.teacher_id.toString() !== formData.teacher_id
    );
    setFilteredCoTeachers(filteredCT);

    const filteredC = classes.filter(c => 
      (c.code_new?.toLowerCase().includes(searchTerm.class.toLowerCase()) ||
       c.name?.toLowerCase().includes(searchTerm.class.toLowerCase())) && c.is_active
    );
    setFilteredClasses(filteredC);
  }, [teachers, classes, searchTerm, formData.teacher_id]);

  useEffect(() => {
    if (!formData.co_teacher_id) return;

    const coTeacherIsPrimary = formData.co_teacher_id === formData.teacher_id;
    const coTeacherIsAvailable = teachers.some((teacher) =>
      teacher.teacher_id.toString() === formData.co_teacher_id &&
      teacher.is_active &&
      !Boolean((teacher as any).is_foreign) &&
      teacher.teacher_id.toString() !== formData.teacher_id
    );

    if (coTeacherIsPrimary || !coTeacherIsAvailable) {
      setFormData(prev => ({ ...prev, co_teacher_id: '' }));
      setSearchTerm(prev => ({ ...prev, co_teacher: '' }));
    }
  }, [formData.co_teacher_id, formData.teacher_id, teachers]);

  // Pre-fill form for editing
  useEffect(() => {
    if (lesson && isOpen) {
      setFormData({
        teacher_id: lesson.teacher_id?.toString() || '',
        co_teacher_id: lesson.co_teacher_id?.toString() || '',
        class_id: lesson.class_id?.toString() || '',
        room: lesson.room || '',
        start_time: lesson.start_time || '',
        end_time: lesson.end_time || '',
        day: lesson.day || defaultDay,
        week: lesson.week || defaultWeek,
        notes: lesson.notes || '',
        month: lesson.month || defaultMonth || new Date().getMonth() + 1,
        year: lesson.year || defaultYear || new Date().getFullYear(),
        week_number: lesson.week_number || defaultWeekNumber || 1
      });
    } else if (isOpen) {
      // Reset form for new lesson
      setFormData({
        teacher_id: defaultTeacherId?.toString() || '',
        co_teacher_id: '',
        class_id: '',
        room: '',
        start_time: defaultStartTime || '',
        end_time: defaultEndTime || '',
        day: defaultDay,
        week: defaultWeek,
        notes: '',
        month: defaultMonth || new Date().getMonth() + 1,
        year: defaultYear || new Date().getFullYear(),
        week_number: defaultWeekNumber || 1
      });
    }
    setError('');
    setConflicts([]);
    setCheckingConflicts(false);
  }, [lesson, isOpen, defaultDay, defaultWeek]);

  // Pre-fill search terms after teachers and classes are loaded
  useEffect(() => {
    if (lesson && isOpen && teachers.length > 0 && classes.length > 0) {
      console.log('Pre-filling search terms for lesson:', lesson);
      console.log('Available teachers:', teachers.map(t => ({ id: t.teacher_id, name: t.name })));
      console.log('Available classes:', classes.map(c => ({ id: c.class_id, code_new: c.code_new, code_old: c.code_old })));
      
      const currentTeacher = teachers.find(t => t.teacher_id === lesson.teacher_id);
      const currentCoTeacher = teachers.find(t => t.teacher_id === lesson.co_teacher_id);
      const currentClass = classes.find(c => c.class_id === lesson.class_id);
      
      console.log('Found current teacher:', currentTeacher);
      console.log('Found current co-teacher:', currentCoTeacher);
      console.log('Found current class:', currentClass);
      
      setSearchTerm({
        teacher: '',
        co_teacher: '',
        class: ''
      });
    }
  }, [lesson, isOpen, teachers, classes]);

  const loadTeachers = async () => {
    try {
      const data = await api.listTeachersDetailed();
      setTeachers(data);
    } catch (error) {
      console.error('Failed to load teachers:', error);
    }
  };

  const loadClasses = async () => {
    try {
      const data = await api.listClassesDetailed();
      setClasses(data);
    } catch (error) {
      console.error('Failed to load classes:', error);
    }
  };

  const loadWeeksForMonth = async (year: number, month: number) => {
    try {
      const weeks = await api.getWeeksForMonth(year, month);
      setAvailableWeeks(weeks.map(week => ({
        value: week.week_number,
        label: week.display_name
      })));
    } catch (error) {
      console.error('Failed to load weeks for month:', error);
    }
  };

  // Real-time conflict checking with enhanced feedback
  const checkConflicts = useCallback(
    async (data: typeof formData) => {
      // Only check if we have the minimum required fields
      // Note: class_id can be 0, so we need to check for null/undefined specifically
      const hasRequiredFields = data.teacher_id && 
                               data.class_id !== '' && 
                               data.class_id !== null && 
                               data.class_id !== undefined && 
                               data.start_time && 
                               data.end_time && 
                               data.day && 
                               data.room;
      
      if (!hasRequiredFields) {
        setConflicts([]);
        setCheckingConflicts(false);
        return;
      }

      setCheckingConflicts(true);
      
      try {
        const conflictData = {
          teacher_id: parseInt(data.teacher_id),
          class_id: parseInt(data.class_id),
          room: data.room,
          start_time: data.start_time,
          end_time: data.end_time,
          day: data.day,
          week: data.week,
          // Include month-based week fields
          month: data.month,
          year: data.year,
          week_number: data.week_number
        };

        const result = await api.checkLessonConflicts(conflictData);
        
        const warnings: ConflictWarning[] = [];
        
        // Enhanced conflict messages with more details
        if (result.teacher_conflict) {
          const teacherName = teachers.find(t => t.teacher_id.toString() === data.teacher_id)?.name || 'Unknown Teacher';
          warnings.push({ 
            field: 'teacher', 
            message: `${teacherName} is already scheduled at this time. Consider selecting a different time slot or teacher.` 
          });
        }
        
        if (result.room_conflict) {
          warnings.push({ 
            field: 'room', 
            message: `Room ${data.room} is already booked at this time. Please choose a different room or time slot.` 
          });
        }

        // Add general conflict messages from the API
        if (result.conflicts && result.conflicts.length > 0) {
          result.conflicts.forEach(conflict => {
            warnings.push({ field: 'general', message: conflict });
          });
        }
        
        setConflicts(warnings);
      } catch (error) {
        console.error('Failed to check conflicts:', error);
        // Don't show error to user for conflict checking failures
        setConflicts([]);
      } finally {
        setCheckingConflicts(false);
      }
    },
    [teachers]
  );

  // Real-time conflict checking with debouncing
  useEffect(() => {
    // When opening for edit, don't show conflicts until user changes any field
    const isEditing = Boolean(lesson);
    const hasUserChanges =
      formData.teacher_id !== (lesson?.teacher_id?.toString() || '') ||
      formData.class_id !== (lesson?.class_id?.toString() || '') ||
      formData.room !== (lesson?.room || '') ||
      formData.start_time !== (lesson?.start_time || '') ||
      formData.end_time !== (lesson?.end_time || '') ||
      normalizeDay(formData.day) !== (lesson?.day || '') ||
      formData.month !== (lesson?.month || defaultMonth || new Date().getMonth() + 1) ||
      formData.year !== (lesson?.year || defaultYear || new Date().getFullYear()) ||
      formData.week_number !== (lesson?.week_number || defaultWeekNumber || 1);

    if (isEditing && !hasUserChanges) {
      setConflicts([]);
      return;
    }

    setConflicts([]);
    const timeoutId = setTimeout(() => {
      checkConflicts(formData);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [formData, checkConflicts, lesson, defaultMonth, defaultYear, defaultWeekNumber]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(''); // Clear error when user makes changes
    
    // Clear search terms when selecting
    if (field === 'teacher_id') {
      setSearchTerm(prev => ({ ...prev, teacher: '' }));
    }
    if (field === 'co_teacher_id') {
      setSearchTerm(prev => ({ ...prev, co_teacher: '' }));
    }
    if (field === 'class_id') {
      setSearchTerm(prev => ({ ...prev, class: '' }));
    }
  };

  const handleSearchChange = (type: 'teacher' | 'co_teacher' | 'class', value: string) => {
    setSearchTerm(prev => ({ ...prev, [type]: value }));
    setError(''); // Clear error when user starts typing
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.teacher_id || !formData.class_id || !formData.room || !formData.start_time || !formData.end_time) {
      setError('Please fill in all required fields');
      return;
    }

    // Validate time restrictions: 17:00 - 20:30 only
    const startTime = formData.start_time;
    const endTime = formData.end_time;
    
    if (startTime < '17:00' || startTime > '20:30') {
      setError('Start time must be between 17:00 (5:00 PM) and 20:30 (8:30 PM)');
      return;
    }
    
    if (endTime < '17:00' || endTime > '20:30') {
      setError('End time must be between 17:00 (5:00 PM) and 20:30 (8:30 PM)');
      return;
    }
    
    if (startTime >= endTime) {
      setError('End time must be after start time');
      return;
    }

    // If nothing changed, allow submit even if conflict checker flagged (it mirrors existing slot)
    const unchanged = lesson &&
      formData.teacher_id === (lesson.teacher_id?.toString() || '') &&
      formData.class_id === (lesson.class_id?.toString() || '') &&
      formData.room === (lesson.room || '') &&
      formData.start_time === (lesson.start_time || '') &&
      formData.end_time === (lesson.end_time || '') &&
      normalizeDay(formData.day) === (lesson.day || '') &&
      (formData.month ?? 0) === (lesson.month ?? 0) &&
      (formData.year ?? 0) === (lesson.year ?? 0) &&
      (formData.week_number ?? 0) === (lesson.week_number ?? 0);

    if (!unchanged && conflicts.length > 0) {
      setError('Please resolve conflicts before saving');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const lessonData = {
        teacher_id: parseInt(formData.teacher_id),
        co_teacher_id: formData.co_teacher_id ? parseInt(formData.co_teacher_id) : null,
        class_id: parseInt(formData.class_id),
        room: formData.room,
        start_time: formData.start_time,
        end_time: formData.end_time,
        day: normalizeDay(formData.day),
        week: formData.week,
        notes: formData.notes,
        // Include month-based week fields
        month: formData.month,
        year: formData.year,
        week_number: formData.week_number
      };

      await onSave(lessonData);
      onClose();
    } catch (error) {
      console.error('Failed to save lesson:', error);
      setError(error instanceof Error ? error.message : 'Failed to save lesson');
    } finally {
      setLoading(false);
    }
  };

  // Convert date parts to actual date and vice versa
  const getDateFromParts = () => {
    const dayIndex = DAYS.indexOf(toFullDayName(formData.day));
    // Find the first occurrence of that day in the selected week
    const firstDayOfMonth = new Date(formData.year, formData.month - 1, 1);
    const monthWeeks = getMonthWeeks(formData.year, formData.month);
    const targetWeek = monthWeeks.find(w => w.weekNumber === formData.week_number);
    
    if (targetWeek && dayIndex !== -1) {
      const date = new Date(`${targetWeek.startDate}T00:00:00`);
      date.setDate(date.getDate() + dayIndex);
      if (date.getMonth() === formData.month - 1) {
        return date.toISOString().split('T')[0];
      }
    }
    return '';
  };

  const setDateFromString = (dateString: string) => {
    if (!dateString) return;

    const date = new Date(dateString + 'T00:00:00');
    const day = DAYS[date.getDay() === 0 ? 6 : date.getDay() - 1]; // Adjust for Sunday
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    
    // Find which week this date belongs to
    const monthWeeks = getMonthWeeks(year, month);
    const targetWeek = monthWeeks.find(week => {
      const start = new Date(week.startDate);
      const end = new Date(week.endDate);
      return date >= start && date <= end;
    });

    setFormData(prev => ({
      ...prev,
      day,
      month,
      year,
      week_number: targetWeek?.weekNumber || 1
    }));
    setCalendarMonth(new Date(year, month - 1, 1));
    setIsDatePickerOpen(false);
  };

  // Helper to get month weeks
  const getMonthWeeks = (year: number, month: number) => {
    const weeks = [];
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    
    let currentWeekStart = new Date(firstDay);
    const dayOfWeek = currentWeekStart.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    currentWeekStart.setDate(currentWeekStart.getDate() - daysToMonday);
    
    let weekNumber = 1;
    
    while (currentWeekStart <= lastDay) {
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      
      weeks.push({
        weekNumber,
        startDate: currentWeekStart.toISOString().split('T')[0],
        endDate: weekEnd.toISOString().split('T')[0]
      });
      
      currentWeekStart = new Date(weekEnd);
      currentWeekStart.setDate(currentWeekStart.getDate() + 1);
      weekNumber++;
    }
    
    return weeks;
  };

  const requestClose = useCallback(() => {
    if (isClosing) return;

    setIsClosing(true);
    window.setTimeout(() => {
      onClose();
    }, 200);
  }, [isClosing, onClose]);

  useEffect(() => {
    if (!shouldRender) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        requestClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [requestClose, shouldRender]);

  if (!shouldRender) return null;

  const selectedTeacher = teachers.find(t => t.teacher_id.toString() === formData.teacher_id);
  const selectedCoTeacher = teachers.find(t => t.teacher_id.toString() === formData.co_teacher_id);
  const selectedClass = classes.find(c => c.class_id.toString() === formData.class_id);
  const eligibleCoTeachers = teachers.filter((teacher) =>
    teacher.is_active &&
    !Boolean((teacher as any).is_foreign)
  );
  const hasCoTeacherOptions = formData.teacher_id
    ? eligibleCoTeachers.some((teacher) => teacher.teacher_id.toString() !== formData.teacher_id)
    : eligibleCoTeachers.length > 1;
  const selectedDate = getDateFromParts();
  const contextDateLabel = selectedDate
    ? formatDisplayDate(selectedDate)
    : toFullDayName(formData.day);
  const calendarCells = getCalendarCells(calendarMonth);
  const calendarMonthLabel = calendarMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  const hasRequiredFields = Boolean(
    formData.teacher_id &&
    formData.class_id &&
    formData.room &&
    formData.start_time &&
    formData.end_time
  );
  const controlClass = "rounded-lg border border-white/[0.10] bg-white/[0.06] px-3 py-2 text-sm font-medium text-white/90 placeholder-white/70 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500";
  const pillClass = "inline-flex min-h-10 items-center rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-sm font-semibold text-white/90 transition hover:border-accent-500/50 hover:bg-white/[0.09] focus:outline-none focus:ring-2 focus:ring-accent-500";
  const dropdownClass = "absolute left-0 z-30 mt-2 max-h-60 overflow-auto rounded-xl border border-white/[0.10] bg-elevated shadow-card";
  const pickerButtonClass = `${controlClass} inline-flex min-h-10 items-center justify-between gap-2 text-left`;

  return (
    <div className="fixed bottom-0 left-0 right-0 top-[60px] z-50 lg:left-[260px]" role="dialog" aria-modal="true" aria-labelledby="lesson-drawer-title">
      <button
        type="button"
        aria-label="Close lesson drawer"
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ease-out ${isClosing ? 'opacity-0' : 'opacity-100'}`}
        onClick={requestClose}
      />

      <aside
        className={`absolute right-0 top-0 flex h-full w-full flex-col border-l border-white/[0.10] bg-surface shadow-2xl transition-transform duration-200 ease-out sm:w-[420px] ${
          isClosing ? 'translate-x-full' : 'translate-x-0'
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.10] px-5 py-4">
          <div>
            <h3 id="lesson-drawer-title" className="text-lg font-semibold text-white">
              {lesson ? 'Edit Lesson' : 'New Lesson'}
            </h3>
            <p className="mt-1 text-sm text-white/55">
              {lesson ? `Editing ${contextDateLabel}` : `Adding to ${contextDateLabel}`}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="rounded-lg p-2 text-white/50 transition hover:bg-white/[0.06] hover:text-white focus:outline-none focus:ring-2 focus:ring-accent-500"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
            {error && (
              <div className="rounded-xl border border-red-500/25 bg-red-500/[0.08] p-3">
                <div className="flex items-start gap-3">
                  <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-300" />
                  <div>
                    <p className="text-sm font-semibold text-red-200">Could not save lesson</p>
                    <p className="mt-0.5 text-sm text-red-300">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {checkingConflicts && (
              <div className="rounded-xl border border-accent-500/20 bg-accent-500/[0.08] p-3 text-sm text-accent-200">
                Checking for conflicts...
              </div>
            )}

            {conflicts.length > 0 && !checkingConflicts && (
              <div className="rounded-xl border border-red-500/25 bg-red-500/[0.08] p-3">
                <div className="flex items-start gap-3">
                  <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-300" />
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-red-200">Scheduling conflict</h4>
                    <ul className="mt-1 space-y-1 text-sm text-red-300">
                      {conflicts.map((conflict, index) => (
                        <li key={index}>{conflict.message}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {conflicts.length === 0 && !checkingConflicts && hasRequiredFields && (
              <div className="rounded-xl border border-green-500/20 bg-green-500/[0.08] px-3 py-2 text-sm font-medium text-green-300">
                All required fields are filled and no conflicts were found.
              </div>
            )}

            <div className="rounded-2xl border border-white/[0.10] bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center gap-2 text-base leading-10 text-white/70">
                <span>Schedule a lesson for</span>
                <div className="relative">
                  {selectedClass && searchTerm.class === '' ? (
                    <button
                      type="button"
                      onClick={() => setSearchTerm(prev => ({ ...prev, class: selectedClass.code_new || selectedClass.name || '' }))}
                      className={pillClass}
                    >
                      {selectedClass.code_new || selectedClass.name}
                      <ChevronDownIcon className="ml-2 h-4 w-4 text-white/50" />
                    </button>
                  ) : (
                    <>
                      <input
                        type="text"
                        placeholder="Search student"
                        value={searchTerm.class}
                        onChange={(e) => handleSearchChange('class', e.target.value)}
                        onFocus={() => searchTerm.class === '' && setSearchTerm(prev => ({ ...prev, class: ' ' }))}
                        className={`${controlClass} w-56`}
                      />
                      {searchTerm.class.trim() !== '' && (
                        <div className={`${dropdownClass} w-72`}>
                          {filteredClasses.map(cls => (
                            <button
                              key={cls.class_id}
                              type="button"
                              onClick={() => {
                                handleInputChange('class_id', cls.class_id.toString());
                                setSearchTerm(prev => ({ ...prev, class: '' }));
                              }}
                              className={`flex w-full flex-col items-start px-4 py-2.5 text-left text-sm transition ${
                                formData.class_id === cls.class_id.toString()
                                  ? 'bg-accent-500 text-white'
                                  : 'text-white/75 hover:bg-white/[0.06] hover:text-white'
                              }`}
                            >
                              <span className="font-semibold">{cls.code_new || cls.name}</span>
                              <span className="text-xs opacity-70">{cls.name}</span>
                            </button>
                          ))}
                          {filteredClasses.length === 0 && (
                            <div className="px-4 py-3 text-sm text-white/50">No students found</div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="inline-flex flex-wrap items-center gap-2 align-middle">
                  <span>with</span>
                  <div className="inline-flex flex-wrap items-center gap-2">
                    <div className="relative">
                      {selectedTeacher && searchTerm.teacher === '' ? (
                        <button
                          type="button"
                          onClick={() => setSearchTerm(prev => ({ ...prev, teacher: selectedTeacher.name }))}
                          className={pillClass}
                        >
                          {selectedTeacher.name}
                          <ChevronDownIcon className="ml-2 h-4 w-4 text-white/50" />
                        </button>
                      ) : (
                        <>
                          <input
                            type="text"
                            placeholder="Search teacher"
                            value={searchTerm.teacher}
                            onChange={(e) => handleSearchChange('teacher', e.target.value)}
                            onFocus={() => searchTerm.teacher === '' && setSearchTerm(prev => ({ ...prev, teacher: ' ' }))}
                            className={`${controlClass} w-52`}
                          />
                          {searchTerm.teacher.trim() !== '' && (
                            <div className={`${dropdownClass} w-64`}>
                              {filteredTeachers.map(teacher => (
                                <button
                                  key={teacher.teacher_id}
                                  type="button"
                                  onClick={() => {
                                    handleInputChange('teacher_id', teacher.teacher_id.toString());
                                    setSearchTerm(prev => ({ ...prev, teacher: '' }));
                                  }}
                                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition ${
                                    formData.teacher_id === teacher.teacher_id.toString()
                                      ? 'bg-accent-500 text-white'
                                      : 'text-white/75 hover:bg-white/[0.06] hover:text-white'
                                  }`}
                                >
                                  <span className="font-medium">{teacher.name}</span>
                                </button>
                              ))}
                              {filteredTeachers.length === 0 && (
                                <div className="px-4 py-3 text-sm text-white/50">No teachers found</div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {(selectedCoTeacher || searchTerm.co_teacher !== '') ? (
                      <div className="inline-flex flex-wrap items-center gap-2">
                        <span className="text-white/55">and</span>
                        <div className="relative">
                          {selectedCoTeacher && searchTerm.co_teacher === '' ? (
                            <button
                              type="button"
                              onClick={() => setSearchTerm(prev => ({ ...prev, co_teacher: selectedCoTeacher.name }))}
                              className={pillClass}
                            >
                              {selectedCoTeacher.name}
                              <ChevronDownIcon className="ml-2 h-4 w-4 text-white/50" />
                            </button>
                          ) : (
                            <>
                              <input
                                type="text"
                                placeholder="Co-teacher"
                                value={searchTerm.co_teacher}
                                onChange={(e) => handleSearchChange('co_teacher', e.target.value)}
                                className={`${controlClass} w-48`}
                              />
                              {searchTerm.co_teacher.trim() !== '' && (
                                <div className={`${dropdownClass} w-64`}>
                                  {filteredCoTeachers.map(teacher => (
                                    <button
                                      key={teacher.teacher_id}
                                      type="button"
                                      onClick={() => {
                                        handleInputChange('co_teacher_id', teacher.teacher_id.toString());
                                        setSearchTerm(prev => ({ ...prev, co_teacher: '' }));
                                      }}
                                      className={`flex w-full items-center px-4 py-2.5 text-left text-sm transition ${
                                        formData.co_teacher_id === teacher.teacher_id.toString()
                                          ? 'bg-accent-500 text-white'
                                          : 'text-white/75 hover:bg-white/[0.06] hover:text-white'
                                      }`}
                                    >
                                      <span className="font-medium">{teacher.name}</span>
                                    </button>
                                  ))}
                                  {filteredCoTeachers.length === 0 && (
                                    <div className="px-4 py-3 text-sm text-white/50">No co-teachers found</div>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ) : hasCoTeacherOptions ? (
                      <button
                        type="button"
                        onClick={() => setSearchTerm(prev => ({ ...prev, co_teacher: ' ' }))}
                        className="inline-flex items-center rounded-md px-1.5 py-1 text-xs font-semibold text-accent-300 underline underline-offset-4 transition hover:text-accent-300/80 focus:outline-none focus:ring-2 focus:ring-accent-500"
                      >
                        + co-teacher
                      </button>
                    ) : null}
                  </div>
                </div>

                <span>in room</span>
                <select
                  value={formData.room}
                  onChange={(e) => handleInputChange('room', e.target.value)}
                  className={`${controlClass} min-w-32 appearance-none pr-8`}
                >
                  <option value="">Select room</option>
                  {rooms.map(room => (
                    <option key={room} value={room}>{room}</option>
                  ))}
                </select>

                <span>on</span>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedDate) {
                        const date = new Date(`${selectedDate}T00:00:00`);
                        setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                      }
                      setIsDatePickerOpen((prev) => !prev);
                      setOpenTimePicker(null);
                    }}
                    className={`${pickerButtonClass} w-48`}
                  >
                    <span>{formatDisplayDate(selectedDate)}</span>
                    <ChevronDownIcon className={`h-4 w-4 text-white/50 transition-transform ${isDatePickerOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isDatePickerOpen && (
                    <div className="absolute left-0 z-40 mt-2 w-72 rounded-2xl border border-white/[0.10] bg-elevated p-3 shadow-card">
                      <div className="mb-3 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                          className="rounded-lg px-2 py-1 text-sm text-white/60 transition hover:bg-white/[0.06] hover:text-white"
                          aria-label="Previous month"
                        >
                          Prev
                        </button>
                        <div className="text-sm font-semibold text-white/85">{calendarMonthLabel}</div>
                        <button
                          type="button"
                          onClick={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                          className="rounded-lg px-2 py-1 text-sm text-white/60 transition hover:bg-white/[0.06] hover:text-white"
                          aria-label="Next month"
                        >
                          Next
                        </button>
                      </div>

                      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-white/35">
                        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
                          <div key={`${day}-${index}`} className="py-1">{day}</div>
                        ))}
                      </div>
                      <div className="mt-1 grid grid-cols-7 gap-1">
                        {calendarCells.map((date, index) => {
                          const dateValue = date ? toISODate(date) : '';
                          const isSelected = dateValue === selectedDate;

                          return date ? (
                            <button
                              key={dateValue}
                              type="button"
                              onClick={() => setDateFromString(dateValue)}
                              className={`flex h-8 items-center justify-center rounded-lg text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-accent-500 ${
                                isSelected
                                  ? 'bg-accent-500 text-white'
                                  : 'text-white/75 hover:bg-white/[0.06] hover:text-white'
                              }`}
                            >
                              {date.getDate()}
                            </button>
                          ) : (
                            <div key={`empty-${index}`} className="h-8" />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <span>from</span>
                <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenTimePicker((prev) => prev === 'start_time' ? null : 'start_time');
                        setIsDatePickerOpen(false);
                      }}
                      className={`${pickerButtonClass} w-full min-w-28`}
                    >
                      <span>{formData.start_time || '--:--'}</span>
                      <ChevronDownIcon className={`h-4 w-4 text-white/50 transition-transform ${openTimePicker === 'start_time' ? 'rotate-180' : ''}`} />
                    </button>
                    {openTimePicker === 'start_time' && (
                      <div className="absolute left-0 z-40 mt-2 max-h-56 w-full min-w-28 overflow-auto rounded-xl border border-white/[0.10] bg-elevated p-1 shadow-card">
                        {TIME_OPTIONS.map((time) => (
                          <button
                            key={`start-${time}`}
                            type="button"
                            onClick={() => {
                              handleInputChange('start_time', time);
                              setOpenTimePicker(null);
                            }}
                            className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                              formData.start_time === time
                                ? 'bg-accent-500 text-white'
                                : 'text-white/75 hover:bg-white/[0.06] hover:text-white'
                            }`}
                          >
                            {time}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenTimePicker((prev) => prev === 'end_time' ? null : 'end_time');
                        setIsDatePickerOpen(false);
                      }}
                      className={`${pickerButtonClass} w-full min-w-28`}
                    >
                      <span>{formData.end_time || '--:--'}</span>
                      <ChevronDownIcon className={`h-4 w-4 text-white/50 transition-transform ${openTimePicker === 'end_time' ? 'rotate-180' : ''}`} />
                    </button>
                    {openTimePicker === 'end_time' && (
                      <div className="absolute left-0 z-40 mt-2 max-h-56 w-full min-w-28 overflow-auto rounded-xl border border-white/[0.10] bg-elevated p-1 shadow-card">
                        {TIME_OPTIONS.map((time) => (
                          <button
                            key={`end-${time}`}
                            type="button"
                            onClick={() => {
                              handleInputChange('end_time', time);
                              setOpenTimePicker(null);
                            }}
                            className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                              formData.end_time === time
                                ? 'bg-accent-500 text-white'
                                : 'text-white/75 hover:bg-white/[0.06] hover:text-white'
                            }`}
                          >
                            {time}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-sm text-white/45">to finish between 17:00 and 20:30</span>
              </div>
            </div>

            {(selectedClass || selectedTeacher || selectedCoTeacher || formData.room || formData.start_time || formData.end_time) && (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/35">Summary</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt className="text-white/40">Date</dt>
                    <dd className="font-medium text-white/85">{contextDateLabel}</dd>
                  </div>
                  {selectedClass && (
                    <div>
                      <dt className="text-white/40">Student</dt>
                      <dd className="font-medium text-white/85">{selectedClass.code_new || selectedClass.name}</dd>
                    </div>
                  )}
                  {selectedTeacher && (
                    <div>
                      <dt className="text-white/40">Teacher</dt>
                      <dd className="font-medium text-white/85">{selectedTeacher.name}</dd>
                    </div>
                  )}
                  {selectedCoTeacher && (
                    <div>
                      <dt className="text-white/40">Co-teacher</dt>
                      <dd className="font-medium text-white/85">{selectedCoTeacher.name}</dd>
                    </div>
                  )}
                  {formData.room && (
                    <div>
                      <dt className="text-white/40">Room</dt>
                      <dd className="font-medium text-white/85">{formData.room}</dd>
                    </div>
                  )}
                  {(formData.start_time || formData.end_time) && (
                    <div>
                      <dt className="text-white/40">Time</dt>
                      <dd className="font-medium text-white/85">{formData.start_time || '--:--'} - {formData.end_time || '--:--'}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {showAdditionalOptions && (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                <label className="block text-sm font-medium text-white/75">
                  Notes
                  <textarea
                    value={formData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    rows={4}
                    className={`${controlClass} mt-2 min-h-[96px] w-full resize-none`}
                    placeholder="Any additional information about this lesson"
                  />
                </label>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 flex flex-col gap-3 border-t border-white/[0.10] bg-surface/95 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setShowAdditionalOptions((prev) => !prev)}
              className="inline-flex items-center gap-2 text-sm font-medium text-white/45 transition hover:text-white/75"
            >
              <ChevronDownIcon className={`h-4 w-4 transition-transform ${showAdditionalOptions ? 'rotate-180' : ''}`} />
              Additional options
            </button>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={requestClose}
                className="rounded-lg border border-white/[0.12] bg-transparent px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/[0.06] hover:text-white focus:outline-none focus:ring-2 focus:ring-accent-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || loading || conflicts.length > 0}
                className="rounded-lg border border-accent-400/30 bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-accent-950/20 transition hover:bg-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-400/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving || loading ? 'Saving...' : lesson ? 'Update Lesson' : 'Create Lesson'}
              </button>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}
