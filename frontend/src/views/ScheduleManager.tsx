import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { LessonOut, LessonCreate, LessonUpdate, TeacherOut, MonthWeek, CurrentMonthWeek } from '../api/types';
import LessonModal from '../components/LessonModal';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const ScheduleManager: React.FC = () => {
  const [lessons, setLessons] = useState<LessonOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [editingLesson, setEditingLesson] = useState<LessonOut | null>(null);
  
  // Month-based week selection
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedWeekNumber, setSelectedWeekNumber] = useState(1);
  const [selectedDay, setSelectedDay] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState<number | null>(null);
  
  // Available weeks for current month
  const [availableWeeks, setAvailableWeeks] = useState<MonthWeek[]>([]);
  const [currentMonthWeek, setCurrentMonthWeek] = useState<CurrentMonthWeek | null>(null);
  
  // Legacy week support (for backward compatibility)
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  
  // Bulk mode state
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedLessons, setSelectedLessons] = useState<Set<number>>(new Set());
  const [teachers, setTeachers] = useState<TeacherOut[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [lessonsPerPage] = useState(10);
  
  // Search state
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadCurrentMonthWeek();
    loadTeachers();
  }, []);

  useEffect(() => {
    loadWeeksForMonth(selectedYear, selectedMonth);
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    if (selectedYear && selectedMonth && selectedWeekNumber) {
      loadLessons();
      setCurrentPage(1); // Reset to first page when filters change
    }
  }, [selectedYear, selectedMonth, selectedWeekNumber, selectedDay, selectedTeacher]);

  const loadCurrentMonthWeek = async () => {
    try {
      const current = await api.getCurrentMonthWeek();
      setCurrentMonthWeek(current);
      setSelectedYear(current.year);
      setSelectedMonth(current.month);
      setSelectedWeekNumber(current.week_number);
    } catch (err) {
      console.error('Failed to load current month week:', err);
    }
  };

  const loadWeeksForMonth = async (year: number, month: number) => {
    try {
      const weeks = await api.getWeeksForMonth(year, month);
      setAvailableWeeks(weeks);
      
      // If current week is not available in this month, select first week
      if (weeks.length > 0 && !weeks.find(w => w.week_number === selectedWeekNumber)) {
        setSelectedWeekNumber(weeks[0].week_number);
      }
    } catch (err) {
      console.error('Failed to load weeks for month:', err);
    }
  };

  const loadLessons = async () => {
    try {
      setLoading(true);
      const filter = {
        // Use month-based week filters
        month: selectedMonth,
        year: selectedYear,
        week_number: selectedWeekNumber,
        day: selectedDay || undefined,
        teacher_id: selectedTeacher || undefined,
        // Keep legacy week filter for backward compatibility
        week: selectedWeek,
      };
      
      const lessonData = await api.listLessons(filter);
      setLessons(lessonData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load lessons');
    } finally {
      setLoading(false);
    }
  };

  const handleAddLesson = () => {
    setEditingLesson(null);
    setShowModal(true);
  };

  const handleEditLesson = (lesson: LessonOut) => {
    setEditingLesson(lesson);
    setShowModal(true);
  };

  const handleSaveLesson = async (lessonData: LessonCreate | LessonUpdate) => {
    try {
      if (editingLesson) {
        // Update existing lesson
        await api.updateLesson(editingLesson.id!, lessonData as LessonUpdate);
      } else {
        // Create new lesson
        await api.createLesson(lessonData as LessonCreate);
      }
      await loadLessons();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save lesson');
      throw err; // Re-throw to prevent modal from closing
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingLesson(null);
  };

  const handleDelete = async (lessonId: number) => {
    if (!confirm('Are you sure you want to delete this lesson?')) return;
    
    try {
      await api.deleteLesson(lessonId);
      await loadLessons();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete lesson');
    }
  };

  const formatTime = (time: string) => {
    return new Date(`2000-01-01T${time}`).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Filter and pagination helpers
  const filteredLessons = lessons.filter(lesson => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      lesson.class_code.toLowerCase().includes(search) ||
      lesson.teacher_name.toLowerCase().includes(search) ||
      lesson.room?.toLowerCase().includes(search) ||
      lesson.day.toLowerCase().includes(search)
    );
  });

  const totalPages = Math.ceil(filteredLessons.length / lessonsPerPage);
  const startIndex = (currentPage - 1) * lessonsPerPage;
  const endIndex = startIndex + lessonsPerPage;
  const currentLessons = filteredLessons.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Scroll to top of lesson list
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Fix day display - show day name or "TBD" if empty
  const formatDayDisplay = (day: string) => {
    return day && day.trim() ? day : 'TBD';
  };

  // Bulk operation functions
  const loadTeachers = async () => {
    try {
      const teacherData = await api.listTeachersDetailed();
      setTeachers(teacherData);
    } catch (err) {
      console.error('Failed to load teachers:', err);
    }
  };

  const toggleBulkMode = () => {
    setBulkMode(!bulkMode);
    setSelectedLessons(new Set());
  };

  const toggleLessonSelection = (lessonId: number) => {
    const newSelection = new Set(selectedLessons);
    if (newSelection.has(lessonId)) {
      newSelection.delete(lessonId);
    } else {
      newSelection.add(lessonId);
    }
    setSelectedLessons(newSelection);
  };

  const selectAllLessons = () => {
    const availableLessons = filteredLessons.filter(l => l.id).map(l => l.id!);
    if (selectedLessons.size === availableLessons.length && availableLessons.length > 0) {
      setSelectedLessons(new Set());
    } else {
      setSelectedLessons(new Set(availableLessons));
    }
  };

  const handleBulkCopy = async () => {
    const targetWeek = prompt('Enter target week number:');
    if (!targetWeek || !parseInt(targetWeek)) {
      setError('Please enter a valid week number');
      return;
    }

    try {
      setBulkLoading(true);
      await api.bulkCopyLessons({
        lesson_ids: Array.from(selectedLessons),
        target_week: parseInt(targetWeek)
      });
      setError('');
      await loadLessons();
      setSelectedLessons(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy lessons');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkMove = async () => {
    const targetDay = prompt('Enter target day (Monday, Tuesday, etc.):');
    if (!targetDay || !DAYS.includes(targetDay)) {
      setError('Please enter a valid day');
      return;
    }

    try {
      setBulkLoading(true);
      await api.bulkMoveLessons({
        lesson_ids: Array.from(selectedLessons),
        target_day: targetDay,
        target_week: 0
      });
      setError('');
      await loadLessons();
      setSelectedLessons(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move lessons');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkAssign = async () => {
    const teacherId = prompt('Enter teacher ID:');
    if (!teacherId || !parseInt(teacherId)) {
      setError('Please enter a valid teacher ID');
      return;
    }

    try {
      setBulkLoading(true);
      await api.bulkAssignTeacher({
        lesson_ids: Array.from(selectedLessons),
        teacher_id: parseInt(teacherId)
      });
      setError('');
      await loadLessons();
      setSelectedLessons(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign teacher');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedLessons.size} lessons?`)) {
      return;
    }

    try {
      setBulkLoading(true);
      await api.bulkDeleteLessons({
        lesson_ids: Array.from(selectedLessons)
      });
      setError('');
      await loadLessons();
      setSelectedLessons(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete lessons');
    } finally {
      setBulkLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-accent-500"></div>
      </div>
    );
  }

  return (
    <div className="page-container page-container-xl py-6">
      <div className="py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-white">Schedule Manager</h1>
          <div className="flex gap-3">
            <button
              onClick={toggleBulkMode}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                bulkMode 
                  ? 'bg-accent-600 hover:bg-accent-700 text-white' 
                  : 'border border-white/[0.08] bg-white/[0.04] text-white/60 hover:text-white/90 hover:bg-white/[0.06]'
              }`}
            >
              {bulkMode ? 'Exit Bulk Mode' : 'Bulk Mode'}
            </button>
            <button
              onClick={handleAddLesson}
              className="bg-accent-600 hover:bg-accent-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-card transition-all"
            >
              Add Lesson
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/[0.08] border border-red-500/20 text-red-400 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Bulk Operations Toolbar */}
        {bulkMode && (
          <div className="bg-elevated border border-accent-500/20 rounded-2xl p-4 mb-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedLessons.size === filteredLessons.filter(l => l.id).length && filteredLessons.filter(l => l.id).length > 0}
                    onChange={selectAllLessons}
                    className="rounded border-white/[0.08] text-accent-400 focus:ring-accent-500"
                  />
                  <span className="text-sm font-medium text-white/70">
                    Select All ({selectedLessons.size} selected)
                  </span>
                </div>
                <button
                  onClick={() => {
                    const pageLessonIds = currentLessons.filter(l => l.id).map(l => l.id!);
                    const allSelected = pageLessonIds.every(id => selectedLessons.has(id));
                    const newSelection = new Set(selectedLessons);
                    
                    if (allSelected) {
                      pageLessonIds.forEach(id => newSelection.delete(id));
                    } else {
                      pageLessonIds.forEach(id => newSelection.add(id));
                    }
                    setSelectedLessons(newSelection);
                  }}
                  className="text-sm text-accent-400 hover:text-accent-300 underline"
                >
                  Select Page
                </button>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={handleBulkCopy}
                  disabled={selectedLessons.size === 0 || bulkLoading}
                  className="px-3 py-1.5 text-sm bg-blue-600/80 hover:bg-blue-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  Copy to Week
                </button>
                <button
                  onClick={handleBulkMove}
                  disabled={selectedLessons.size === 0 || bulkLoading}
                  className="px-3 py-1.5 text-sm bg-green-600/80 hover:bg-green-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  Move to Day
                </button>
                <button
                  onClick={handleBulkAssign}
                  disabled={selectedLessons.size === 0 || bulkLoading}
                  className="px-3 py-1.5 text-sm bg-purple-600/80 hover:bg-purple-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  Assign Teacher
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={selectedLessons.size === 0 || bulkLoading}
                  className="px-3 py-1.5 text-sm bg-red-600/80 hover:bg-red-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  Delete Selected
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="rounded-2xl border border-white/[0.06] bg-elevated p-5 mb-6">
          <h2 className="text-base font-semibold text-white/90 mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-white/40 mb-2">Month</label>
              <select
                className="select-control"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
              >
                {[...Array(12)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(selectedYear, i, 1).toLocaleDateString('en-US', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-white/40 mb-2">Year</label>
              <select
                className="select-control"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
              >
                {[...Array(3)].map((_, i) => {
                  const year = new Date().getFullYear() - 1 + i;
                  return <option key={year} value={year}>{year}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-white/40 mb-2">Week</label>
              <select
                className="select-control"
                value={selectedWeekNumber}
                onChange={(e) => setSelectedWeekNumber(Number(e.target.value))}
              >
                {availableWeeks.map(week => (
                  <option key={week.week_number} value={week.week_number}>
                    {week.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-white/40 mb-2">Day</label>
              <select
                className="select-control"
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
              >
                <option value="">All Days</option>
                {DAYS.map(day => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-white/40 mb-2">Teacher</label>
              <select
                className="select-control"
                value={selectedTeacher || ''}
                onChange={(e) => setSelectedTeacher(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">All Teachers</option>
                {teachers.map(teacher => (
                  <option key={teacher.teacher_id} value={teacher.teacher_id}>
                    {teacher.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Current Lessons Display */}
        <div className="bg-surface shadow-glass rounded-2xl border border-white/[0.04] overflow-hidden">
          <div className="px-4 py-5 sm:p-6">
            <h2 className="text-lg font-medium text-white mb-4">
              Current Schedule {selectedYear && selectedMonth && selectedWeekNumber && 
                `- ${new Date(selectedYear, selectedMonth - 1, 1).toLocaleDateString('en-US', { month: 'long' })} ${selectedYear} Week ${selectedWeekNumber}`} 
              {selectedDay && ` - ${selectedDay}`}
              {selectedTeacher && (() => {
                const teacher = teachers.find(t => t.teacher_id === selectedTeacher);
                return teacher ? ` - ${teacher.name}` : '';
              })()}
            </h2>
            
            {lessons.length === 0 ? (
              <p className="text-white/50">No lessons found for the selected filters.</p>
            ) : (
              <>
                {/* Search and Lesson Count */}
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex-1 max-w-md flex gap-2">
                      <input
                        type="text"
                        placeholder="Search lessons by class, teacher, room, or day..."
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          setCurrentPage(1); // Reset to first page when searching
                        }}
                        className="flex-1 px-3 py-2 border border-white/[0.08] rounded-md focus:ring-2 focus:ring-accent-500 focus:border-accent-500 transition-colors"
                      />
                      {searchTerm && (
                        <button
                          onClick={() => {
                            setSearchTerm('');
                            setCurrentPage(1);
                          }}
                          className="px-3 py-2 text-sm text-white/50 hover:text-white/70 border border-white/[0.08] rounded-md hover:bg-base transition-colors"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="text-sm text-white/50">
                      Page {currentPage} of {totalPages}
                    </div>
                  </div>
                  <p className="text-sm text-white/60">
                    Showing {startIndex + 1}-{Math.min(endIndex, filteredLessons.length)} of {filteredLessons.length} lessons
                    {searchTerm && ` (filtered from ${lessons.length} total)`}
                  </p>
                </div>

                {/* Lessons List */}
                <div className="space-y-4">
                  {currentLessons.map((lesson, index) => (
                    <div key={index} className={`border rounded-lg p-4 transition-colors ${
                      bulkMode && selectedLessons.has(lesson.id!) 
                        ? 'border-orange-300 bg-accent-500/[0.06]' 
                        : 'border-white/[0.06]'
                    }`}>
                      <div className="flex justify-between items-start">
                        <div className="flex items-start gap-3 flex-1">
                          {bulkMode && lesson.id && (
                            <input
                              type="checkbox"
                              checked={selectedLessons.has(lesson.id)}
                              onChange={() => toggleLessonSelection(lesson.id!)}
                              className="mt-1 rounded border-white/[0.08] text-accent-400 focus:ring-accent-500"
                            />
                          )}
                          <div className="flex-1">
                            <h3 className="text-sm font-medium text-white">
                              {lesson.class_code} - {lesson.teacher_name}
                            </h3>
                            <p className="text-sm text-white/60">
                              {lesson.month_week_display || `Week ${lesson.week}`}, {formatDayDisplay(lesson.day)}
                            </p>
                            <p className="text-sm text-white/60">
                              {formatTime(lesson.start_time)} - {formatTime(lesson.end_time)}
                            </p>
                            {lesson.room && (
                              <p className="text-sm text-white/60">Room: {lesson.room}</p>
                            )}
                          </div>
                        </div>
                        {!bulkMode && (
                          <div className="flex gap-1">
                            <button 
                              onClick={() => handleEditLesson(lesson)}
                              className="p-1.5 rounded-lg text-white/40 hover:text-accent-400 hover:bg-white/[0.04] transition-colors"
                              title="Edit"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                            </button>
                            {lesson.id && (
                              <button 
                                onClick={() => handleDelete(lesson.id!)}
                                className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                title="Delete"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex justify-center items-center mt-8 space-x-2">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="px-3 py-2 text-sm font-medium text-white/50 bg-surface border border-white/[0.08] rounded-md hover:bg-base disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    
                    {/* Page Numbers */}
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        onClick={() => handlePageChange(page)}
                        className={`px-3 py-2 text-sm font-medium rounded-md ${
                          page === currentPage
                            ? 'bg-accent-600 text-white'
                            : 'text-white/70 bg-surface border border-white/[0.08] hover:bg-base'
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                    
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="px-3 py-2 text-sm font-medium text-white/50 bg-surface border border-white/[0.08] rounded-md hover:bg-base disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Lesson Modal */}
        <LessonModal
          isOpen={showModal}
          onClose={handleCloseModal}
          onSave={handleSaveLesson}
          lesson={editingLesson}
          defaultWeek={selectedWeek || 1}
          defaultDay={selectedDay || 'Monday'}
          defaultMonth={selectedMonth}
          defaultYear={selectedYear}
          defaultWeekNumber={selectedWeekNumber}
        />
      </div>
    </div>
  );
};

export default ScheduleManager;
