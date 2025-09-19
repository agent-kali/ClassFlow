import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { Teacher, ClassInfo, LessonOut, LessonCreate, ConflictCheck } from '../api/types';

interface LessonFormData {
  teacher_id: number;
  class_id: number;
  week: number;
  day: string;
  start_time: string;
  end_time: string;
  room: string;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
  '20:00', '20:30', '21:00', '21:30'
];

const ScheduleManager: React.FC = () => {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [lessons, setLessons] = useState<LessonOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [selectedDay, setSelectedDay] = useState('');
  const [conflicts, setConflicts] = useState<string[]>([]);

  const [formData, setFormData] = useState<LessonFormData>({
    teacher_id: 0,
    class_id: 0,
    week: 1,
    day: 'Monday',
    start_time: '09:00',
    end_time: '09:30',
    room: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedWeek || selectedDay) {
      loadLessons();
    }
  }, [selectedWeek, selectedDay]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [teachersData, classesData] = await Promise.all([
        api.listTeachers(),
        api.listClasses(),
      ]);
      setTeachers(teachersData);
      setClasses(classesData);
      await loadLessons();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadLessons = async () => {
    try {
      const filter = {
        week: selectedWeek || undefined,
        day: selectedDay || undefined,
      };
      const lessonData = await api.listLessons(filter);
      setLessons(lessonData);
    } catch (err) {
      console.error('Failed to load lessons:', err);
    }
  };

  const checkConflicts = (newLesson: LessonFormData): string[] => {
    const conflicts: string[] = [];
    
    // Check teacher conflicts
    const teacherConflicts = lessons.filter(lesson =>
      lesson.teacher_name === teachers.find(t => t.teacher_id === newLesson.teacher_id)?.name &&
      lesson.week === newLesson.week &&
      lesson.day === newLesson.day &&
      ((lesson.start_time <= newLesson.start_time && lesson.end_time > newLesson.start_time) ||
       (lesson.start_time < newLesson.end_time && lesson.end_time >= newLesson.end_time) ||
       (newLesson.start_time <= lesson.start_time && newLesson.end_time > lesson.start_time))
    );
    
    if (teacherConflicts.length > 0) {
      const teacher = teachers.find(t => t.teacher_id === newLesson.teacher_id);
      conflicts.push(`Teacher ${teacher?.name} has a conflict at this time`);
    }

    // Check room conflicts
    if (newLesson.room) {
      const roomConflicts = lessons.filter(lesson =>
        lesson.room === newLesson.room &&
        lesson.week === newLesson.week &&
        lesson.day === newLesson.day &&
        ((lesson.start_time <= newLesson.start_time && lesson.end_time > newLesson.start_time) ||
         (lesson.start_time < newLesson.end_time && lesson.end_time >= newLesson.end_time) ||
         (newLesson.start_time <= lesson.start_time && newLesson.end_time > lesson.start_time))
      );
      
      if (roomConflicts.length > 0) {
        conflicts.push(`Room ${newLesson.room} is already booked at this time`);
      }
    }

    return conflicts;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // First check for conflicts using the API
      const lessonData: LessonCreate = {
        teacher_id: formData.teacher_id,
        class_id: formData.class_id,
        week: formData.week,
        day: formData.day,
        start_time: formData.start_time,
        end_time: formData.end_time,
        room: formData.room || null,
      };

      const conflictCheck = await api.checkLessonConflicts(lessonData);
      setConflicts(conflictCheck.conflicts);
      
      if (!conflictCheck.can_create) {
        return; // Don't submit if there are conflicts
      }

      // Create the lesson
      await api.createLesson(lessonData);
      await loadLessons();
      resetForm();
      setError(''); // Clear any previous errors
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create lesson');
    }
  };

  const resetForm = () => {
    setFormData({
      teacher_id: 0,
      class_id: 0,
      week: 1,
      day: 'Monday',
      start_time: '09:00',
      end_time: '09:30',
      room: '',
    });
    setShowCreateForm(false);
    setConflicts([]);
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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Schedule Manager</h1>
          <button
            onClick={() => setShowCreateForm(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            Add Lesson
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white shadow rounded-lg p-4 mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Week</label>
              <select
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(Number(e.target.value))}
              >
                {[...Array(52)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>Week {i + 1}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Day</label>
              <select
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
              >
                <option value="">All Days</option>
                {DAYS.map(day => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Lesson Creation Form */}
        {showCreateForm && (
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Add New Lesson</h2>
            
            {conflicts.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded mb-4">
                <h3 className="font-medium">Scheduling Conflicts:</h3>
                <ul className="list-disc list-inside">
                  {conflicts.map((conflict, index) => (
                    <li key={index}>{conflict}</li>
                  ))}
                </ul>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Teacher</label>
                  <select
                    required
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={formData.teacher_id}
                    onChange={(e) => setFormData({...formData, teacher_id: Number(e.target.value)})}
                  >
                    <option value={0}>Select Teacher</option>
                    {teachers.map(teacher => (
                      <option key={teacher.teacher_id} value={teacher.teacher_id}>
                        {teacher.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Class</label>
                  <select
                    required
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={formData.class_id}
                    onChange={(e) => setFormData({...formData, class_id: Number(e.target.value)})}
                  >
                    <option value={0}>Select Class</option>
                    {classes.map(cls => (
                      <option key={cls.class_id} value={cls.class_id}>
                        {cls.code_new || cls.code_old} - {cls.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Room</label>
                  <input
                    type="text"
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={formData.room}
                    onChange={(e) => setFormData({...formData, room: e.target.value})}
                    placeholder="e.g., A101"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Week</label>
                  <select
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={formData.week}
                    onChange={(e) => setFormData({...formData, week: Number(e.target.value)})}
                  >
                    {[...Array(52)].map((_, i) => (
                      <option key={i + 1} value={i + 1}>Week {i + 1}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Day</label>
                  <select
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={formData.day}
                    onChange={(e) => setFormData({...formData, day: e.target.value})}
                  >
                    {DAYS.map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Start Time</label>
                    <select
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      value={formData.start_time}
                      onChange={(e) => setFormData({...formData, start_time: e.target.value})}
                    >
                      {TIME_SLOTS.map(time => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">End Time</label>
                    <select
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      value={formData.end_time}
                      onChange={(e) => setFormData({...formData, end_time: e.target.value})}
                    >
                      {TIME_SLOTS.map(time => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={conflicts.length > 0}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Create Lesson
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Current Lessons Display */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-5 sm:p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Current Schedule {selectedWeek && `- Week ${selectedWeek}`} {selectedDay && `- ${selectedDay}`}
            </h2>
            
            {lessons.length === 0 ? (
              <p className="text-gray-500">No lessons found for the selected filters.</p>
            ) : (
              <div className="space-y-4">
                {lessons.map((lesson, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-sm font-medium text-gray-900">
                          {lesson.class_code} - {lesson.teacher_name}
                        </h3>
                        <p className="text-sm text-gray-600">
                          Week {lesson.week}, {lesson.day}
                        </p>
                        <p className="text-sm text-gray-600">
                          {formatTime(lesson.start_time)} - {formatTime(lesson.end_time)}
                        </p>
                        {lesson.room && (
                          <p className="text-sm text-gray-600">Room: {lesson.room}</p>
                        )}
                      </div>
                      <div className="flex space-x-2">
                        <button className="text-indigo-600 hover:text-indigo-900 text-sm">
                          Edit
                        </button>
                        {lesson.id && (
                          <button 
                            onClick={() => handleDelete(lesson.id!)}
                            className="text-red-600 hover:text-red-900 text-sm"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScheduleManager;
