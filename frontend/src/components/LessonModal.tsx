import React, { useState, useEffect, useCallback } from 'react';
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

  // Load data on mount
  useEffect(() => {
    if (isOpen) {
      loadTeachers();
      loadClasses();
      loadWeeksForMonth(formData.year, formData.month);
    }
  }, [isOpen]);

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

    // Filter co-teachers (Vietnamese teachers - not foreign)
    const filteredCT = teachers.filter(t => 
      t.name.toLowerCase().includes(searchTerm.co_teacher.toLowerCase()) &&
      t.is_active &&
      !Boolean((t as any).is_foreign)
    );
    setFilteredCoTeachers(filteredCT);

    const filteredC = classes.filter(c => 
      (c.code_new?.toLowerCase().includes(searchTerm.class.toLowerCase()) ||
       c.name?.toLowerCase().includes(searchTerm.class.toLowerCase())) && c.is_active
    );
    setFilteredClasses(filteredC);
  }, [teachers, classes, searchTerm]);

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
    const dayIndex = DAYS.indexOf(formData.day);
    // Find the first occurrence of that day in the selected week
    const firstDayOfMonth = new Date(formData.year, formData.month - 1, 1);
    const monthWeeks = getMonthWeeks(formData.year, formData.month);
    const targetWeek = monthWeeks.find(w => w.weekNumber === formData.week_number);
    
    if (targetWeek && dayIndex !== -1) {
      const date = new Date(targetWeek.startDate);
      date.setDate(date.getDate() + dayIndex);
      if (date.getMonth() === formData.month - 1) {
        return date.toISOString().split('T')[0];
      }
    }
    return '';
  };

  const setDateFromString = (dateString: string) => {
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

  if (!isOpen) return null;

  const selectedTeacher = teachers.find(t => t.teacher_id.toString() === formData.teacher_id);
  const selectedCoTeacher = teachers.find(t => t.teacher_id.toString() === formData.co_teacher_id);
  const selectedClass = classes.find(c => c.class_id.toString() === formData.class_id);
  const selectedDate = getDateFromParts();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center px-3 py-6">
        {/* Backdrop */}
        <div 
          className="modal-backdrop"
          onClick={onClose}
        />
        
        {/* Modal */}
        <div className="modal-surface w-full max-w-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-gradient-to-r from-orange-50 to-white">
            <div>
              <h3 className="text-lg font-semibold text-white">
                {lesson ? '✏️ Edit Lesson' : '✨ Schedule a New Lesson'}
              </h3>
              <p className="text-sm text-white/50 mt-0.5">
                {lesson ? 'Update lesson details' : 'Fill in the details to create a lesson'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white/40 hover:text-white/60 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-6">
            {/* Status Messages */}
            {error && (
              <div className="bg-red-500/[0.08] border-l-4 border-red-400 rounded-r-lg p-3">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="font-medium text-sm text-red-300">Oops!</p>
                    <p className="text-sm text-red-400 mt-0.5">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {checkingConflicts && (
              <div className="bg-blue-50 border-l-4 border-blue-400 rounded-r-lg p-3">
                <div className="flex items-center">
                  <svg className="animate-spin h-5 w-5 text-blue-500 mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-sm text-blue-700">Checking for conflicts...</span>
                </div>
              </div>
            )}

            {conflicts.length > 0 && !checkingConflicts && (
              <div className="bg-red-500/[0.08] border-l-4 border-red-400 rounded-r-lg p-3">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <h4 className="font-medium text-sm text-red-300 mb-1.5">⚠️ Scheduling Conflict</h4>
                    <ul className="text-sm text-red-400 space-y-1">
                      {conflicts.map((conflict, index) => (
                        <li key={index} className="flex items-start">
                          <span className="mr-2">•</span>
                          <span>{conflict.message}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {conflicts.length === 0 && !checkingConflicts && formData.teacher_id && formData.class_id && formData.start_time && formData.end_time && formData.room && formData.day && (
              <div className="bg-green-500/[0.08] border-l-4 border-green-400 rounded-r-lg p-3">
                <div className="flex items-center">
                  <svg className="w-5 h-5 text-green-500 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-medium text-green-400">✅ All clear! Ready to schedule</span>
                </div>
              </div>
            )}

            {/* Mad Libs Style Sentence Builder */}
            <div className="bg-gradient-to-br from-gray-50 to-white border-2 border-white/[0.06] rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-white/70">
                <span className="text-base">Schedule a lesson for</span>
                <div className="relative inline-block">
                  {selectedClass && searchTerm.class === '' ? (
                    <button
                      type="button"
                      onClick={() => setSearchTerm(prev => ({ ...prev, class: selectedClass.code_new || '' }))}
                      className="inline-flex items-center px-3 py-1.5 bg-accent-500/15 hover:bg-orange-200 text-accent-300 rounded-lg font-semibold text-base transition-colors border-2 border-orange-300"
                    >
                      {selectedClass.code_new || selectedClass.name}
                      <svg className="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  ) : (
                    <>
                      <input
                        type="text"
                        placeholder="type to search..."
                        value={searchTerm.class}
                        onChange={(e) => handleSearchChange('class', e.target.value)}
                        onFocus={() => searchTerm.class === '' && setSearchTerm(prev => ({ ...prev, class: ' ' }))}
                        className="px-3 py-1.5 w-48 bg-surface text-white/70 border-2 border-dashed border-white/[0.08] rounded-lg text-base focus:border-accent-500/40 focus:outline-none transition-colors"
                      />
                      {searchTerm.class.trim() !== '' && (
                        <div className="absolute z-10 mt-2 w-72 dropdown-panel shadow-card">
                          {filteredClasses.map(cls => (
                            <button
                              key={cls.class_id}
                              type="button"
                              onClick={() => {
                                handleInputChange('class_id', cls.class_id.toString());
                                setSearchTerm(prev => ({ ...prev, class: '' }));
                              }}
                              className={`flex w-full items-start px-4 py-2.5 text-sm ${
                                formData.class_id === cls.class_id.toString()
                                  ? 'bg-accent-500 text-white'
                                  : 'hover:bg-accent-500/[0.06] text-white/70'
                              }`}
                            >
                              <div className="flex flex-col items-start">
                                <span className="font-semibold">{cls.code_new || cls.name}</span>
                                <span className="text-xs opacity-75">{cls.name}</span>
                              </div>
                            </button>
                          ))}
                          {filteredClasses.length === 0 && (
                            <div className="px-4 py-3 text-sm text-white/50">No classes found</div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-white/70">
                <span className="text-base">with</span>
                <div className="relative inline-block">
                  {selectedTeacher && searchTerm.teacher === '' ? (
                    <button
                      type="button"
                      onClick={() => setSearchTerm(prev => ({ ...prev, teacher: selectedTeacher.name }))}
                      className="inline-flex items-center px-3 py-1.5 bg-blue-500/15 hover:bg-blue-200 text-blue-700 rounded-lg font-semibold text-base transition-colors border-2 border-blue-300"
                    >
                      👨‍🏫 {selectedTeacher.name}
                      <svg className="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  ) : (
                    <>
                      <input
                        type="text"
                        placeholder="type to search..."
                        value={searchTerm.teacher}
                        onChange={(e) => handleSearchChange('teacher', e.target.value)}
                        onFocus={() => searchTerm.teacher === '' && setSearchTerm(prev => ({ ...prev, teacher: ' ' }))}
                        className="px-3 py-1.5 w-48 bg-surface text-white/70 border-2 border-dashed border-white/[0.08] rounded-lg text-base focus:border-blue-400 focus:outline-none transition-colors"
                      />
                      {searchTerm.teacher.trim() !== '' && (
                        <div className="absolute z-10 mt-2 w-64 dropdown-panel shadow-card">
                          {filteredTeachers.map(teacher => (
                            <button
                              key={teacher.teacher_id}
                              type="button"
                              onClick={() => {
                                handleInputChange('teacher_id', teacher.teacher_id.toString());
                                setSearchTerm(prev => ({ ...prev, teacher: '' }));
                              }}
                              className={`flex w-full items-center justify-between px-4 py-2.5 text-sm ${
                                formData.teacher_id === teacher.teacher_id.toString()
                                  ? 'bg-blue-500 text-white'
                                  : 'hover:bg-blue-50 text-white/70'
                              }`}
                            >
                              <span className="font-medium">{teacher.name}</span>
                              {formData.teacher_id === teacher.teacher_id.toString() && (
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
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
                {selectedCoTeacher && searchTerm.co_teacher === '' ? (
                  <>
                    <span className="text-base">&</span>
                    <button
                      type="button"
                      onClick={() => setSearchTerm(prev => ({ ...prev, co_teacher: selectedCoTeacher.name }))}
                      className="inline-flex items-center px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg font-semibold text-base transition-colors border-2 border-purple-300"
                    >
                      👥 {selectedCoTeacher.name}
                      <svg className="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </>
                ) : searchTerm.co_teacher !== '' ? (
                  <>
                    <span className="text-base">&</span>
                    <div className="relative inline-block">
                      <input
                        type="text"
                        placeholder="co-teacher..."
                        value={searchTerm.co_teacher}
                        onChange={(e) => handleSearchChange('co_teacher', e.target.value)}
                        className="px-3 py-1.5 w-40 bg-surface text-white/70 border-2 border-dashed border-white/[0.08] rounded-lg text-base focus:border-purple-400 focus:outline-none transition-colors"
                      />
                      {searchTerm.co_teacher.trim() !== '' && (
                        <div className="absolute z-10 mt-2 w-64 dropdown-panel shadow-card">
                          {filteredCoTeachers.map(teacher => (
                            <button
                              key={teacher.teacher_id}
                              type="button"
                              onClick={() => {
                                handleInputChange('co_teacher_id', teacher.teacher_id.toString());
                                setSearchTerm(prev => ({ ...prev, co_teacher: '' }));
                              }}
                              className={`flex w-full items-center px-4 py-2.5 text-sm ${
                                formData.co_teacher_id === teacher.teacher_id.toString()
                                  ? 'bg-purple-600/[0.08]0 text-white'
                                  : 'hover:bg-purple-600/[0.08] text-white/70'
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
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSearchTerm(prev => ({ ...prev, co_teacher: ' ' }))}
                    className="text-sm text-white/40 hover:text-white/60 underline transition-colors"
                  >
                    + co-teacher
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-white/70">
                <span className="text-base">in room</span>
                <div className="relative inline-block">
                  <select
                    value={formData.room}
                    onChange={(e) => handleInputChange('room', e.target.value)}
                    className={`inline-flex px-3 py-1.5 pr-8 rounded-lg font-semibold text-base border-2 transition-colors appearance-none cursor-pointer ${
                      formData.room
                        ? 'bg-teal-100 text-teal-700 border-teal-300'
                        : 'bg-surface text-white/40 border-dashed border-white/[0.08]'
                    }`}
                  >
                    <option value="">select room</option>
                    {rooms.map(room => (
                      <option key={room} value={room}>{room}</option>
                    ))}
                  </select>
                  <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                {selectedDate && (
                  <>
                    <span className="text-base">on</span>
                    <span className="px-3 py-1.5 bg-pink-100 text-pink-700 border-2 border-pink-300 rounded-lg font-semibold text-base">
                      📅 {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { 
                        weekday: 'short', 
                        month: 'short', 
                        day: 'numeric'
                      })}
                    </span>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-white/70">
                <span className="text-base">from</span>
                <input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => handleInputChange('start_time', e.target.value)}
                  min="17:00"
                  max="20:30"
                  className={`inline-flex px-3 py-1.5 rounded-lg font-semibold text-base border-2 transition-colors cursor-pointer ${
                    formData.start_time
                      ? 'bg-green-500/15 text-green-400 border-green-300'
                      : 'bg-surface text-white/40 border-dashed border-white/[0.08]'
                  }`}
                  required
                />
                <span className="text-base">to</span>
                <input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => handleInputChange('end_time', e.target.value)}
                  min="17:00"
                  max="20:30"
                  className={`inline-flex px-3 py-1.5 rounded-lg font-semibold text-base border-2 transition-colors cursor-pointer ${
                    formData.end_time
                      ? 'bg-green-500/15 text-green-400 border-green-300'
                      : 'bg-surface text-white/40 border-dashed border-white/[0.08]'
                  }`}
                  required
                />
                <span className="text-xs text-white/50">(17:00 - 20:30 only)</span>
              </div>

              {/* Visual Summary */}
              {(selectedClass || selectedTeacher || formData.room || formData.start_time) && (
                <div className="mt-4 pt-4 border-t border-white/[0.06]">
                  <div className="flex items-start">
                    <svg className="w-5 h-5 text-white/40 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <div className="text-sm text-white/60 space-y-1">
                      <p className="font-medium text-white/70">Quick Summary:</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                        <div className="flex items-center">
                          <span className="w-16 text-white/50">Date:</span>
                          <span className="font-medium text-white">
                            {selectedDate ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { 
                              weekday: 'short', 
                              month: 'short', 
                              day: 'numeric',
                              year: 'numeric'
                            }) : formData.day}
                          </span>
                        </div>
                        {selectedClass && (
                          <div className="flex items-center">
                            <span className="w-16 text-white/50">Class:</span>
                            <span className="font-medium text-white">{selectedClass.code_new || selectedClass.name}</span>
                          </div>
                        )}
                        {selectedTeacher && (
                          <div className="flex items-center">
                            <span className="w-16 text-white/50">Teacher:</span>
                            <span className="font-medium text-white">{selectedTeacher.name}</span>
                          </div>
                        )}
                        {selectedCoTeacher && (
                          <div className="flex items-center">
                            <span className="w-16 text-white/50">Co-teach:</span>
                            <span className="font-medium text-white">{selectedCoTeacher.name}</span>
                          </div>
                        )}
                        {formData.room && (
                          <div className="flex items-center">
                            <span className="w-16 text-white/50">Room:</span>
                            <span className="font-medium text-white">{formData.room}</span>
                          </div>
                        )}
                        {(formData.start_time || formData.end_time) && (
                          <div className="flex items-center">
                            <span className="w-16 text-white/50">Time:</span>
                            <span className="font-medium text-white">
                              {formData.start_time || '--:--'} - {formData.end_time || '--:--'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Collapsible Advanced Section */}
            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer text-sm text-white/60 hover:text-white transition-colors py-2 px-3 rounded-lg hover:bg-base">
                <span className="flex items-center">
                  <svg className="w-4 h-4 mr-2 group-open:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Additional options
                </span>
                <span className="text-xs text-white/40">Notes, etc.</span>
              </summary>
              <div className="mt-3 space-y-3 pl-6">
                <div>
                  <label className="flex items-center text-sm font-medium text-white/70 mb-1.5">
                    <svg className="w-4 h-4 mr-2 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                    Notes (Optional)
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-white/[0.08] rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500 resize-none text-sm"
                    placeholder="Any additional information about this lesson..."
                  />
                </div>
              </div>
            </details>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-white/[0.06]">
              <div className="text-xs text-white/50">
                {formData.teacher_id && formData.class_id && formData.room && formData.start_time && formData.end_time ? (
                  <span className="flex items-center text-green-600">
                    <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    All required fields filled
                  </span>
                ) : (
                  <span>Please fill in all required fields</span>
                )}
              </div>
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 text-sm font-medium text-white/70 bg-surface border-2 border-white/[0.08] rounded-lg hover:bg-base hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-500 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || loading || conflicts.length > 0}
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-orange-600 to-orange-500 border border-transparent rounded-lg hover:from-orange-700 hover:to-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:from-gray-400 disabled:to-gray-400 transition-all shadow-glass hover:shadow-md"
                >
                  {isSaving || loading ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </span>
                  ) : (
                    <span className="flex items-center">
                      {lesson ? '💾 Update Lesson' : '✨ Create Lesson'}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
