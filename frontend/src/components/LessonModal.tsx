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
  const [searchTerm, setSearchTerm] = useState({ teacher: '', class: '' });
  const [filteredTeachers, setFilteredTeachers] = useState<TeacherOut[]>([]);
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
    // Clear existing conflicts immediately when form changes
    setConflicts([]);
    
    // Debounce the actual API call
    const timeoutId = setTimeout(() => {
      checkConflicts(formData);
    }, 300); // Reduced debounce time for more responsive feedback

    return () => clearTimeout(timeoutId);
  }, [formData, checkConflicts]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(''); // Clear error when user makes changes
    
    // Clear search terms when selecting
    if (field === 'teacher_id') {
      setSearchTerm(prev => ({ ...prev, teacher: '' }));
    }
    if (field === 'class_id') {
      setSearchTerm(prev => ({ ...prev, class: '' }));
    }
  };

  const handleSearchChange = (type: 'teacher' | 'class', value: string) => {
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
    
    if (conflicts.length > 0) {
      setError('Please resolve conflicts before saving');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const lessonData = {
        teacher_id: parseInt(formData.teacher_id),
        class_id: parseInt(formData.class_id),
        room: formData.room,
        start_time: formData.start_time,
        end_time: formData.end_time,
        day: formData.day,
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={onClose}
        />
        
        {/* Modal */}
        <div className="relative w-full max-w-2xl bg-white rounded-lg shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              {lesson ? 'Edit Lesson' : 'Add New Lesson'}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Error message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-red-400 mt-0.5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h4 className="text-sm font-medium text-red-800">Error</h4>
                    <p className="mt-1 text-sm text-red-700">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Real-time Conflict Checking Status */}
            {checkingConflicts && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-sm text-blue-700">Checking for conflicts...</span>
                </div>
              </div>
            )}

            {/* Conflict warnings */}
            {conflicts.length > 0 && !checkingConflicts && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-red-400 mt-0.5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h4 className="text-sm font-medium text-red-800">⚠️ Scheduling Conflicts Detected</h4>
                    <ul className="mt-2 text-sm text-red-700 space-y-1">
                      {conflicts.map((conflict, index) => (
                        <li key={index} className="flex items-start">
                          <span className="text-red-500 mr-2">•</span>
                          <span>{conflict.message}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 text-xs text-red-600">
                      💡 <strong>Tip:</strong> Resolve these conflicts before saving the lesson.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Success indicator when no conflicts */}
            {conflicts.length === 0 && !checkingConflicts && formData.teacher_id && formData.class_id && formData.start_time && formData.end_time && formData.room && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center">
                  <svg className="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-green-700">✅ No conflicts detected - lesson can be scheduled</span>
                </div>
              </div>
            )}

            {/* Teacher Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Teacher *
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search teachers..."
                  value={searchTerm.teacher}
                  onChange={(e) => handleSearchChange('teacher', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors ${
                    conflicts.some(c => c.field === 'teacher') 
                      ? 'border-red-500 bg-red-50' 
                      : formData.teacher_id 
                        ? 'border-orange-300 bg-orange-50 text-orange-900' 
                        : 'border-gray-300 bg-white hover:border-orange-200'
                  }`}
                />
                {searchTerm.teacher && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                    {filteredTeachers.map(teacher => (
                      <button
                        key={teacher.teacher_id}
                        type="button"
                        onClick={() => handleInputChange('teacher_id', teacher.teacher_id.toString())}
                        className="w-full px-3 py-2 text-left hover:bg-orange-50 hover:text-orange-900 focus:bg-orange-50 focus:text-orange-900 focus:outline-none transition-colors"
                      >
                        {teacher.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {formData.teacher_id && (
                <div className="mt-2 text-sm text-gray-600">
                  Selected: {teachers.find(t => t.teacher_id.toString() === formData.teacher_id)?.name}
                </div>
              )}
            </div>

            {/* Class Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Class *
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search classes..."
                  value={searchTerm.class}
                  onChange={(e) => handleSearchChange('class', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors ${
                    conflicts.some(c => c.field === 'class') 
                      ? 'border-red-500 bg-red-50' 
                      : formData.class_id 
                        ? 'border-orange-300 bg-orange-50 text-orange-900' 
                        : 'border-gray-300 bg-white hover:border-orange-200'
                  }`}
                />
                {searchTerm.class && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                    {filteredClasses.map(cls => (
                      <button
                        key={cls.class_id}
                        type="button"
                        onClick={() => handleInputChange('class_id', cls.class_id.toString())}
                        className="w-full px-3 py-2 text-left hover:bg-orange-50 hover:text-orange-900 focus:bg-orange-50 focus:text-orange-900 focus:outline-none transition-colors"
                      >
                        {cls.code_new} - {cls.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {formData.class_id && (
                <div className="mt-2 text-sm text-gray-600">
                  Selected: {classes.find(c => c.class_id.toString() === formData.class_id)?.code_new} - {classes.find(c => c.class_id.toString() === formData.class_id)?.name}
                </div>
              )}
            </div>

            {/* Room Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Room *
              </label>
              <select
                value={formData.room}
                onChange={(e) => handleInputChange('room', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors ${
                  conflicts.some(c => c.field === 'room') 
                    ? 'border-red-500 bg-red-50' 
                    : formData.room 
                      ? 'border-orange-300 bg-orange-50 text-orange-900' 
                      : 'border-gray-300 bg-white hover:border-orange-200'
                }`}
                required
              >
                <option value="" className="text-gray-500">Select a room...</option>
                {rooms.map(room => (
                  <option key={room} value={room} className="text-gray-900">{room}</option>
                ))}
              </select>
            </div>

            {/* Time Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Start Time *
                </label>
                <input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => handleInputChange('start_time', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors ${
                    formData.start_time 
                      ? 'border-orange-300 bg-orange-50 text-orange-900' 
                      : 'border-gray-300 bg-white hover:border-orange-200'
                  }`}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  End Time *
                </label>
                <input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => handleInputChange('end_time', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors ${
                    formData.end_time 
                      ? 'border-orange-300 bg-orange-50 text-orange-900' 
                      : 'border-gray-300 bg-white hover:border-orange-200'
                  }`}
                  required
                />
              </div>
            </div>

            {/* Day Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Day *
              </label>
              <select
                value={formData.day}
                onChange={(e) => handleInputChange('day', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors ${
                  formData.day 
                    ? 'border-orange-300 bg-orange-50 text-orange-900' 
                    : 'border-gray-300 bg-white hover:border-orange-200'
                }`}
                required
              >
                {DAYS.map(day => (
                  <option key={day} value={day} className="text-gray-900">{day}</option>
                ))}
              </select>
            </div>

            {/* Month/Year/Week Selection */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Month *
                </label>
                <select
                  value={formData.month}
                  onChange={(e) => handleInputChange('month', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors ${
                    formData.month 
                      ? 'border-orange-300 bg-orange-50 text-orange-900' 
                      : 'border-gray-300 bg-white hover:border-orange-200'
                  }`}
                  required
                >
                  {[...Array(12)].map((_, i) => (
                    <option key={i + 1} value={i + 1} className="text-gray-900">
                      {new Date(formData.year, i, 1).toLocaleDateString('en-US', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Year *
                </label>
                <select
                  value={formData.year}
                  onChange={(e) => handleInputChange('year', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors ${
                    formData.year 
                      ? 'border-orange-300 bg-orange-50 text-orange-900' 
                      : 'border-gray-300 bg-white hover:border-orange-200'
                  }`}
                  required
                >
                  {[...Array(3)].map((_, i) => {
                    const year = new Date().getFullYear() - 1 + i;
                    return (
                      <option key={year} value={year} className="text-gray-900">{year}</option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Week *
                </label>
                <select
                  value={formData.week_number}
                  onChange={(e) => handleInputChange('week_number', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors ${
                    formData.week_number 
                      ? 'border-orange-300 bg-orange-50 text-orange-900' 
                      : 'border-gray-300 bg-white hover:border-orange-200'
                  }`}
                  required
                >
                  {availableWeeks.map(week => (
                    <option key={week.value} value={week.value} className="text-gray-900">
                      {week.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes (Optional)
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                rows={3}
                className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors ${
                  formData.notes 
                    ? 'border-orange-300 bg-orange-50 text-orange-900' 
                    : 'border-gray-300 bg-white hover:border-orange-200'
                }`}
                placeholder="Add any additional notes..."
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || loading || conflicts.length > 0}
                className="px-4 py-2 text-sm font-medium text-white bg-orange-600 border border-transparent rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving || loading ? 'Saving...' : (lesson ? 'Update Lesson' : 'Add Lesson')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
