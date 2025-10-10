import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { api } from '../api/client';
import type { LessonOut, Teacher, LessonUpdate } from '../api/types';
import { format, addDays } from 'date-fns';
import { getWeekStart, setAcademicAnchor } from '../lib/time';

interface DragDropCalendarProps {
  week: number;
  onWeekChange: (week: number) => void;
}

interface DraggedLesson {
  lesson: LessonOut;
  originalSlot: { day: string; time: string };
}

interface DropZone {
  day: string;
  time: string;
  isValid: boolean;
  conflicts: string[];
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIME_SLOTS = [
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30'
];

const CAMPUS_OPTIONS = ['All', 'E1', 'E2'];
const MIN_WEEK = 1;
const MAX_WEEK = 5;

const DragDropCalendar: React.FC<DragDropCalendarProps> = ({ week, onWeekChange }) => {
  const [lessons, setLessons] = useState<LessonOut[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<number | undefined>(() => {
    const saved = localStorage.getItem('visualEditorTeacherId');
    return saved ? Number(saved) : undefined;
  });
  const [selectedCampus, setSelectedCampus] = useState<string>(() => {
    return localStorage.getItem('visualEditorCampus') || CAMPUS_OPTIONS[0];
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [draggedLesson, setDraggedLesson] = useState<DraggedLesson | null>(null);
  const [dropZone, setDropZone] = useState<DropZone | null>(null);
  const [weekStart, setWeekStart] = useState<Date>(new Date());
  const [isDragging, setIsDragging] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef<number | null>(null);
  const [isRestoringScroll, setIsRestoringScroll] = useState(false);

  // Fetch teachers
  useEffect(() => {
    const fetchTeachers = async () => {
      try {
        const teacherList = await api.listTeachers();
        setTeachers(teacherList);
        if (!selectedTeacherId && teacherList.length > 0) {
          setSelectedTeacherId(teacherList[0].teacher_id);
        }
      } catch (err) {
        console.error('Failed to fetch teachers:', err);
      }
    };

    fetchTeachers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist selections
  useEffect(() => {
    if (selectedTeacherId !== undefined) {
      localStorage.setItem('visualEditorTeacherId', String(selectedTeacherId));
    }
  }, [selectedTeacherId]);

  useEffect(() => {
    localStorage.setItem('visualEditorCampus', selectedCampus);
  }, [selectedCampus]);

  // Fetch lessons when filters change
  useEffect(() => {
    let isCancelled = false;

    const fetchData = async () => {
      if (!selectedTeacherId) {
        if (!isCancelled) {
          setLessons([]);
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setError('');

        const { anchor_date } = await api.getAnchor();
        if (isCancelled) return;
        setAcademicAnchor(anchor_date);

        const start = getWeekStart(week);
        if (isCancelled) return;
        setWeekStart(start);

        const lessonData = await api.getTeacherSchedule(selectedTeacherId, {
          week,
          campus: selectedCampus === 'All' ? undefined : selectedCampus
        });
        if (!isCancelled) {
          setLessons(lessonData);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load data');
          setLessons([]);
        }
      } finally {
        if (!isCancelled) {
          // Defer loading flag change to next frame to avoid layout shift
          requestAnimationFrame(() => {
            if (!isCancelled) {
              setLoading(false);
            }
          });
        }
      }
    };

    fetchData();

    return () => {
      isCancelled = true;
    };
  }, [week, selectedTeacherId, selectedCampus]);

  // Restore scroll position after week change
  useLayoutEffect(() => {
    if (isRestoringScroll && !loading && scrollPositionRef.current !== null) {
      const position = scrollPositionRef.current;
      scrollPositionRef.current = null;
      requestAnimationFrame(() => {
        window.scrollTo({ top: position, left: 0, behavior: 'auto' });
        setIsRestoringScroll(false);
      });
    }
  }, [isRestoringScroll, loading]);

  const getLessonsForSlot = (day: string, time: string): LessonOut[] => {
    const dayMapping: Record<string, string> = {
      Monday: 'Mon',
      Tuesday: 'Tue',
      Wednesday: 'Wed',
      Thursday: 'Thu',
      Friday: 'Fri',
      Saturday: 'Sat',
      Sunday: 'Sun'
    };

    const dbDay = dayMapping[day] || day;
    return lessons.filter((lesson) => lesson.day === dbDay && lesson.start_time === time);
  };

  const handleDragStart = (e: React.DragEvent, lesson: LessonOut) => {
    setIsDragging(true);
    setDraggedLesson({
      lesson,
      originalSlot: { day: lesson.day, time: lesson.start_time }
    });
    e.dataTransfer.setData('application/json', JSON.stringify(lesson));
    e.dataTransfer.effectAllowed = 'move';
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setIsDragging(false);
    setDraggedLesson(null);
    setDropZone(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  };

  const handleDragOver = (e: React.DragEvent, day: string, time: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (draggedLesson) {
      const isOriginalSlot =
        draggedLesson.originalSlot.day === day &&
        draggedLesson.originalSlot.time === time;

      if (!isOriginalSlot) {
        const existingLessons = getLessonsForSlot(day, time);
        const conflicts: string[] = [];

        const teacherConflict = existingLessons.find(
          (l) => l.teacher_name === draggedLesson.lesson.teacher_name
        );
        if (teacherConflict) {
          conflicts.push(`Teacher ${draggedLesson.lesson.teacher_name} already has a lesson`);
        }

        const roomConflict = existingLessons.find(
          (l) => l.room === draggedLesson.lesson.room && l.room
        );
        if (roomConflict) {
          conflicts.push(`Room ${draggedLesson.lesson.room} is already booked`);
        }

        setDropZone({ day, time, isValid: conflicts.length === 0, conflicts });
      } else {
        setDropZone({ day, time, isValid: true, conflicts: [] });
      }
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!gridRef.current?.contains(e.relatedTarget as Node)) {
      setDropZone(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, day: string, time: string) => {
    e.preventDefault();

    if (!draggedLesson || !dropZone?.isValid) {
      return;
    }

    const { lesson } = draggedLesson;
    if (lesson.day === day && lesson.start_time === time) {
      return;
    }

    try {
      const startMinutes =
        parseInt(time.split(':')[0], 10) * 60 + parseInt(time.split(':')[1], 10);
      const endMinutes = startMinutes + lesson.duration_minutes;
      const endHours = Math.floor(endMinutes / 60);
      const endMins = endMinutes % 60;
      const endTime = `${endHours.toString().padStart(2, '0')}:${endMins
        .toString()
        .padStart(2, '0')}`;

      const updateData: LessonUpdate = {
        day,
        start_time: time,
        end_time: endTime
      };

      if (lesson.id) {
        await api.updateLesson(lesson.id, updateData);
        setLessons((prevLessons) =>
          prevLessons.map((l) =>
            l.id === lesson.id
              ? { ...l, day, start_time: time, end_time: endTime }
              : l
          )
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move lesson');
      const lessonData = await api.getTeacherSchedule(selectedTeacherId!, {
        week,
        campus: selectedCampus === 'All' ? undefined : selectedCampus
      });
      setLessons(lessonData);
    }

    setDropZone(null);
  };

  const renderLessonCard = (lesson: LessonOut) => (
    <div
      key={`${lesson.id}-${lesson.day}-${lesson.start_time}`}
      className={`lesson-card bg-white border-l-4 border-blue-500 shadow-sm rounded p-2 mb-1 cursor-move transition-all duration-200 hover:shadow-md ${
        isDragging ? 'pointer-events-none' : ''
      }`}
      draggable
      onDragStart={(e) => handleDragStart(e, lesson)}
      onDragEnd={handleDragEnd}
    >
      <div className="text-xs font-medium text-gray-900 truncate">{lesson.class_code}</div>
      <div className="text-xs text-gray-600 truncate">{lesson.teacher_name}</div>
      <div className="text-xs text-gray-500">
        {lesson.start_time} - {lesson.end_time}
      </div>
      {lesson.room && (
        <div className="text-xs text-gray-500 truncate">📍 {lesson.room}</div>
      )}
    </div>
  );

  const renderTimeSlot = (day: string, time: string) => {
    const slotLessons = getLessonsForSlot(day, time);
    const isDropTarget = dropZone?.day === day && dropZone?.time === time;
    const isValidDrop = dropZone?.isValid;

    return (
      <div
        key={`${day}-${time}`}
        className={`time-slot min-h-16 border border-gray-200 p-1 transition-all duration-200 ${
          isDropTarget
            ? isValidDrop
              ? 'bg-green-100 border-green-400 border-2'
              : 'bg-red-100 border-red-400 border-2'
            : 'hover:bg-gray-50'
        }`}
        onDragOver={(e) => handleDragOver(e, day, time)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, day, time)}
      >
        {slotLessons.map(renderLessonCard)}
        {isDropTarget && !isValidDrop && dropZone?.conflicts && (
          <div className="absolute z-10 bg-red-600 text-white text-xs p-2 rounded shadow-lg pointer-events-none">
            {dropZone.conflicts.map((conflict, idx) => (
              <div key={idx}>{conflict}</div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const handleWeekChange = (delta: number) => {
    const nextWeek = Math.max(MIN_WEEK, Math.min(MAX_WEEK, week + delta));
    onWeekChange(nextWeek);
  };

  const handleWeekButtonClick = (e: React.MouseEvent, delta: number) => {
    e.preventDefault();
    e.stopPropagation();

    scrollPositionRef.current = window.scrollY;
    setIsRestoringScroll(true);

    handleWeekChange(delta);
  };

  return (
    <div className="drag-drop-calendar relative">
      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 backdrop-blur-sm">
          <div className="animate-spin rounded-full h-24 w-24 border-b-2 border-indigo-500"></div>
        </div>
      )}
      <div className="space-y-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Teacher
            </label>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-xs font-bold text-gray-700">
                {(() => {
                  const name = teachers.find((t) => t.teacher_id === selectedTeacherId)?.name || '?';
                  return name
                    .split(' ')
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();
                })()}
              </div>
              <select
                className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={selectedTeacherId ?? ''}
                onChange={(e) => setSelectedTeacherId(e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">Select Teacher…</option>
                {teachers.map((t) => (
                  <option key={t.teacher_id} value={t.teacher_id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Campus</label>
            <div className="flex items-center gap-2">
              {CAMPUS_OPTIONS.map((campus) => {
                const active = selectedCampus === campus;
                return (
                  <button
                    key={campus}
                    onClick={() => setSelectedCampus(campus)}
                    className={`px-4 py-2 rounded-md text-sm font-medium border transition ${
                      active
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-white border-gray-300 text-gray-700 hover:border-indigo-400 hover:text-indigo-600'
                    }`}
                  >
                    {campus === 'All' ? 'All Campuses' : campus}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {selectedTeacherId && (
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <button
                onClick={(e) => handleWeekButtonClick(e, -1)}
                onMouseDown={(e) => e.preventDefault()}
                disabled={week <= MIN_WEEK}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  week <= MIN_WEEK
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                }`}
                type="button"
                style={{ outline: 'none' }}
              >
                ← Previous
              </button>
              <h2 className="text-xl font-bold">
                Week {week} ({format(weekStart, 'MMM d')} - {format(addDays(weekStart, 6), 'MMM d, yyyy')})
              </h2>
              <button
                onClick={(e) => handleWeekButtonClick(e, 1)}
                onMouseDown={(e) => e.preventDefault()}
                disabled={week >= MAX_WEEK}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  week >= MAX_WEEK
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                }`}
                type="button"
                style={{ outline: 'none' }}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {!selectedTeacherId && (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <div className="text-gray-500 text-lg">
            👆 Please select a teacher to view and edit their schedule
          </div>
        </div>
      )}

      {selectedTeacherId && error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {selectedTeacherId && !error && (
        <>
          <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded mb-4">
            <div className="flex items-center">
              <div className="text-sm">
                <strong>Drag & Drop:</strong> Click and drag lesson cards to move them to different time slots. Invalid drops will be highlighted in red.
              </div>
            </div>
          </div>

          <div
            ref={gridRef}
            className="calendar-grid bg-white rounded-lg shadow-sm border overflow-hidden"
            style={{
              display: 'grid',
              gridTemplateColumns: '80px repeat(7, 1fr)',
              gridTemplateRows: 'auto repeat(' + TIME_SLOTS.length + ', minmax(64px, auto))'
            }}
          >
            <div className="bg-gray-50 border-b font-medium text-sm p-2">Time</div>
            {DAYS.map((day, index) => {
              const dayDate = addDays(weekStart, index);
              return (
                <div
                  key={day}
                  className="bg-gray-50 border-b border-l font-medium text-sm p-2 text-center"
                >
                  <div>{day}</div>
                  <div className="text-xs text-gray-600 mt-1">{format(dayDate, 'MMM d')}</div>
                </div>
              );
            })}

            {TIME_SLOTS.map((time) => (
              <React.Fragment key={time}>
                <div className="bg-gray-50 border-b border-r text-xs p-2 font-medium text-gray-600">
                  {time}
                </div>
                {DAYS.map((day) => renderTimeSlot(day, time))}
              </React.Fragment>
            ))}
          </div>

          <div className="mt-4 text-xs text-gray-600">
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <div className="w-4 h-4 bg-green-100 border-green-400 border-2 rounded mr-2"></div>
                Valid drop zone
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-red-100 border-red-400 border-2 rounded mr-2"></div>
                Invalid drop zone (conflicts)
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DragDropCalendar;
