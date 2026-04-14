import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { LessonOut, LessonCreate, LessonUpdate, TeacherOut, MonthWeek, CurrentMonthWeek } from '../api/types';
import LessonModal from '../components/LessonModal';
import SidebarLayout from '../components/SidebarLayout';
import SidebarSection from '../components/SidebarSection';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const ScheduleManager: React.FC = () => {
  const [lessons, setLessons] = useState<LessonOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [editingLesson, setEditingLesson] = useState<LessonOut | null>(null);

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedWeekNumber, setSelectedWeekNumber] = useState(1);
  const [selectedDay, setSelectedDay] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState<number | null>(null);

  const [availableWeeks, setAvailableWeeks] = useState<MonthWeek[]>([]);
  const [currentMonthWeek, setCurrentMonthWeek] = useState<CurrentMonthWeek | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  const [bulkMode, setBulkMode] = useState(false);
  const [selectedLessons, setSelectedLessons] = useState<Set<number>>(new Set());
  const [teachers, setTeachers] = useState<TeacherOut[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [lessonsPerPage] = useState(10);
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
      setCurrentPage(1);
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
        month: selectedMonth,
        year: selectedYear,
        week_number: selectedWeekNumber,
        day: selectedDay || undefined,
        teacher_id: selectedTeacher || undefined,
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

  const handleAddLesson = () => { setEditingLesson(null); setShowModal(true); };
  const handleEditLesson = (lesson: LessonOut) => { setEditingLesson(lesson); setShowModal(true); };

  const handleSaveLesson = async (lessonData: LessonCreate | LessonUpdate) => {
    try {
      if (editingLesson) {
        await api.updateLesson(editingLesson.id!, lessonData as LessonUpdate);
      } else {
        await api.createLesson(lessonData as LessonCreate);
      }
      await loadLessons();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save lesson');
      throw err;
    }
  };

  const handleCloseModal = () => { setShowModal(false); setEditingLesson(null); };

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
    return new Date(`2000-01-01T${time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const formatDayDisplay = (day: string) => day && day.trim() ? day : 'TBD';

  const loadTeachers = async () => {
    try {
      const teacherData = await api.listTeachersDetailed();
      setTeachers(teacherData);
    } catch (err) {
      console.error('Failed to load teachers:', err);
    }
  };

  const toggleBulkMode = () => { setBulkMode(!bulkMode); setSelectedLessons(new Set()); };

  const toggleLessonSelection = (lessonId: number) => {
    const newSelection = new Set(selectedLessons);
    if (newSelection.has(lessonId)) newSelection.delete(lessonId);
    else newSelection.add(lessonId);
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
    if (!targetWeek || !parseInt(targetWeek)) { setError('Please enter a valid week number'); return; }
    try {
      setBulkLoading(true);
      await api.bulkCopyLessons({ lesson_ids: Array.from(selectedLessons), target_week: parseInt(targetWeek) });
      setError(''); await loadLessons(); setSelectedLessons(new Set());
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to copy lessons'); }
    finally { setBulkLoading(false); }
  };

  const handleBulkMove = async () => {
    const targetDay = prompt('Enter target day (Monday, Tuesday, etc.):');
    if (!targetDay || !DAYS.includes(targetDay)) { setError('Please enter a valid day'); return; }
    try {
      setBulkLoading(true);
      await api.bulkMoveLessons({ lesson_ids: Array.from(selectedLessons), target_day: targetDay, target_week: 0 });
      setError(''); await loadLessons(); setSelectedLessons(new Set());
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to move lessons'); }
    finally { setBulkLoading(false); }
  };

  const handleBulkAssign = async () => {
    const teacherId = prompt('Enter teacher ID:');
    if (!teacherId || !parseInt(teacherId)) { setError('Please enter a valid teacher ID'); return; }
    try {
      setBulkLoading(true);
      await api.bulkAssignTeacher({ lesson_ids: Array.from(selectedLessons), teacher_id: parseInt(teacherId) });
      setError(''); await loadLessons(); setSelectedLessons(new Set());
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to assign teacher'); }
    finally { setBulkLoading(false); }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedLessons.size} lessons?`)) return;
    try {
      setBulkLoading(true);
      await api.bulkDeleteLessons({ lesson_ids: Array.from(selectedLessons) });
      setError(''); await loadLessons(); setSelectedLessons(new Set());
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to delete lessons'); }
    finally { setBulkLoading(false); }
  };

  /* ─── Sidebar: filters stacked vertically ─── */
  const sidebarContent = (
    <>
      <SidebarSection label="Month">
        <select
          className="select-control w-full"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(Number(e.target.value))}
        >
          {[...Array(12)].map((_, i) => (
            <option key={i + 1} value={i + 1}>
              {new Date(selectedYear, i, 1).toLocaleDateString('en-US', { month: 'long' })}
            </option>
          ))}
        </select>
      </SidebarSection>

      <SidebarSection label="Year">
        <select
          className="select-control w-full"
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
        >
          {[...Array(3)].map((_, i) => {
            const yr = new Date().getFullYear() - 1 + i;
            return <option key={yr} value={yr}>{yr}</option>;
          })}
        </select>
      </SidebarSection>

      <SidebarSection label="Week">
        <select
          className="select-control w-full"
          value={selectedWeekNumber}
          onChange={(e) => setSelectedWeekNumber(Number(e.target.value))}
        >
          {availableWeeks.map(week => (
            <option key={week.week_number} value={week.week_number}>
              {week.display_name}
            </option>
          ))}
        </select>
      </SidebarSection>

      <SidebarSection label="Day">
        <select
          className="select-control w-full"
          value={selectedDay}
          onChange={(e) => setSelectedDay(e.target.value)}
        >
          <option value="">All Days</option>
          {DAYS.map(day => (
            <option key={day} value={day}>{day}</option>
          ))}
        </select>
      </SidebarSection>

      <SidebarSection label="Teacher">
        <select
          className="select-control w-full"
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
      </SidebarSection>
    </>
  );

  if (loading) {
    return (
      <SidebarLayout sidebar={sidebarContent}>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-accent-500"></div>
        </div>
      </SidebarLayout>
    );
  }

  return (
    <SidebarLayout sidebar={sidebarContent}>
      <div className="min-h-full">
        {/* Content header */}
        <div className="border-b border-white/[0.06] bg-surface px-4 lg:px-6 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-white font-display">Schedule Manager</h1>
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
        </div>

        <div className="px-4 lg:px-6 py-6">
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
                      if (allSelected) pageLessonIds.forEach(id => newSelection.delete(id));
                      else pageLessonIds.forEach(id => newSelection.add(id));
                      setSelectedLessons(newSelection);
                    }}
                    className="text-sm text-accent-400 hover:text-accent-300 underline"
                  >
                    Select Page
                  </button>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleBulkCopy} disabled={selectedLessons.size === 0 || bulkLoading}
                    className="px-3 py-1.5 text-sm bg-blue-600/80 hover:bg-blue-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg transition-colors">
                    Copy to Week
                  </button>
                  <button onClick={handleBulkMove} disabled={selectedLessons.size === 0 || bulkLoading}
                    className="px-3 py-1.5 text-sm bg-green-600/80 hover:bg-green-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg transition-colors">
                    Move to Day
                  </button>
                  <button onClick={handleBulkAssign} disabled={selectedLessons.size === 0 || bulkLoading}
                    className="px-3 py-1.5 text-sm bg-purple-600/80 hover:bg-purple-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg transition-colors">
                    Assign Teacher
                  </button>
                  <button onClick={handleBulkDelete} disabled={selectedLessons.size === 0 || bulkLoading}
                    className="px-3 py-1.5 text-sm bg-red-600/80 hover:bg-red-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg transition-colors">
                    Delete Selected
                  </button>
                </div>
              </div>
            </div>
          )}

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
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex-1 max-w-md flex gap-2">
                        <input
                          type="text"
                          placeholder="Search lessons by class, teacher, room, or day..."
                          value={searchTerm}
                          onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                          className="flex-1 px-3 py-2 border border-white/[0.08] rounded-md focus:ring-2 focus:ring-accent-500 focus:border-accent-500 transition-colors"
                        />
                        {searchTerm && (
                          <button
                            onClick={() => { setSearchTerm(''); setCurrentPage(1); }}
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

                  {totalPages > 1 && (
                    <div className="flex justify-center items-center mt-8 space-x-2">
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="px-3 py-2 text-sm font-medium text-white/50 bg-surface border border-white/[0.08] rounded-md hover:bg-base disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
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
    </SidebarLayout>
  );
};

export default ScheduleManager;
