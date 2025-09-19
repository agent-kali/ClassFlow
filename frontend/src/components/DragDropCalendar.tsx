import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import type { LessonOut, Teacher, ClassInfo, LessonUpdate } from '../api/types';
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
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
  '20:00', '20:30', '21:00', '21:30'
];

const DragDropCalendar: React.FC<DragDropCalendarProps> = ({ week, onWeekChange }) => {
  const [lessons, setLessons] = useState<LessonOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [draggedLesson, setDraggedLesson] = useState<DraggedLesson | null>(null);
  const [dropZone, setDropZone] = useState<DropZone | null>(null);
  const [weekStart, setWeekStart] = useState<Date>(new Date());
  const [isDragging, setIsDragging] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // Fetch calendar anchor and lessons
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch calendar anchor
        const { anchor_date } = await api.getAnchor();
        setAcademicAnchor(anchor_date);
        
        // Calculate week start
        const start = getWeekStart(week);
        setWeekStart(start);
        
        // Fetch lessons for the week
        const lessonData = await api.listLessons({ week });
        setLessons(lessonData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [week]);

  // Get lessons for a specific day and time slot
  const getLessonsForSlot = (day: string, time: string): LessonOut[] => {
    return lessons.filter(lesson => 
      lesson.day === day && lesson.start_time === time
    );
  };

  // Handle drag start
  const handleDragStart = (e: React.DragEvent, lesson: LessonOut) => {
    setIsDragging(true);
    setDraggedLesson({
      lesson,
      originalSlot: { day: lesson.day, time: lesson.start_time }
    });
    
    // Store lesson data in drag event
    e.dataTransfer.setData('application/json', JSON.stringify(lesson));
    e.dataTransfer.effectAllowed = 'move';
    
    // Add drag image styling
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  // Handle drag end
  const handleDragEnd = (e: React.DragEvent) => {
    setIsDragging(false);
    setDraggedLesson(null);
    setDropZone(null);
    
    // Reset styling
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  };

  // Handle drag over (for drop zones)
  const handleDragOver = (e: React.DragEvent, day: string, time: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (draggedLesson) {
      // Check if this is a valid drop zone
      const isOriginalSlot = draggedLesson.originalSlot.day === day && 
                            draggedLesson.originalSlot.time === time;
      
      if (!isOriginalSlot) {
        // Check for conflicts (simplified - you could make API call here)
        const existingLessons = getLessonsForSlot(day, time);
        const conflicts: string[] = [];
        
        // Check teacher conflicts
        const teacherConflict = existingLessons.find(l => 
          l.teacher_name === draggedLesson.lesson.teacher_name
        );
        if (teacherConflict) {
          conflicts.push(`Teacher ${draggedLesson.lesson.teacher_name} already has a lesson`);
        }
        
        // Check room conflicts
        const roomConflict = existingLessons.find(l => 
          l.room === draggedLesson.lesson.room && l.room
        );
        if (roomConflict) {
          conflicts.push(`Room ${draggedLesson.lesson.room} is already booked`);
        }
        
        setDropZone({
          day,
          time,
          isValid: conflicts.length === 0,
          conflicts
        });
      } else {
        setDropZone({ day, time, isValid: true, conflicts: [] });
      }
    }
  };

  // Handle drag leave
  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear drop zone if we're leaving the grid entirely
    if (!gridRef.current?.contains(e.relatedTarget as Node)) {
      setDropZone(null);
    }
  };

  // Handle drop
  const handleDrop = async (e: React.DragEvent, day: string, time: string) => {
    e.preventDefault();
    
    if (!draggedLesson || !dropZone?.isValid) {
      return;
    }
    
    const { lesson } = draggedLesson;
    
    // Don't do anything if dropped on the same slot
    if (lesson.day === day && lesson.start_time === time) {
      return;
    }
    
    try {
      // Calculate end time (maintain duration)
      const startMinutes = parseInt(time.split(':')[0]) * 60 + parseInt(time.split(':')[1]);
      const endMinutes = startMinutes + lesson.duration_minutes;
      const endHours = Math.floor(endMinutes / 60);
      const endMins = endMinutes % 60;
      const endTime = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
      
      // Update lesson via API
      const updateData: LessonUpdate = {
        day,
        start_time: time,
        end_time: endTime
      };
      
      if (lesson.id) {
        await api.updateLesson(lesson.id, updateData);
        
        // Update local state optimistically
        setLessons(prevLessons => 
          prevLessons.map(l => 
            l.id === lesson.id 
              ? { ...l, day, start_time: time, end_time: endTime }
              : l
          )
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move lesson');
      // Revert the change by reloading lessons
      const lessonData = await api.listLessons({ week });
      setLessons(lessonData);
    }
    
    setDropZone(null);
  };

  // Render a lesson card
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
      <div className="text-xs font-medium text-gray-900 truncate">
        {lesson.class_code}
      </div>
      <div className="text-xs text-gray-600 truncate">
        {lesson.teacher_name}
      </div>
      <div className="text-xs text-gray-500">
        {lesson.start_time} - {lesson.end_time}
      </div>
      {lesson.room && (
        <div className="text-xs text-gray-500 truncate">
          📍 {lesson.room}
        </div>
      )}
    </div>
  );

  // Render a time slot
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
        
        {/* Show conflicts tooltip */}
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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="drag-drop-calendar">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => onWeekChange(week - 1)}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-medium"
          >
            ← Previous
          </button>
          <h2 className="text-xl font-bold">
            Week {week} ({format(weekStart, 'MMM d')} - {format(addDays(weekStart, 6), 'MMM d, yyyy')})
          </h2>
          <button
            onClick={() => onWeekChange(week + 1)}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-medium"
          >
            Next →
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded mb-4">
        <div className="flex items-center">
          <div className="text-sm">
            <strong>Drag & Drop:</strong> Click and drag lesson cards to move them to different time slots. 
            Invalid drops will be highlighted in red.
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div 
        ref={gridRef}
        className="calendar-grid bg-white rounded-lg shadow-sm border overflow-hidden"
        style={{
          display: 'grid',
          gridTemplateColumns: '80px repeat(7, 1fr)',
          gridTemplateRows: 'auto repeat(' + TIME_SLOTS.length + ', minmax(64px, auto))'
        }}
      >
        {/* Header row */}
        <div className="bg-gray-50 border-b font-medium text-sm p-2">Time</div>
        {DAYS.map((day, index) => {
          const dayDate = addDays(weekStart, index);
          return (
            <div key={day} className="bg-gray-50 border-b border-l font-medium text-sm p-2 text-center">
              <div>{day}</div>
              <div className="text-xs text-gray-600 mt-1">
                {format(dayDate, 'MMM d')}
              </div>
            </div>
          );
        })}

        {/* Time slots */}
        {TIME_SLOTS.map(time => (
          <React.Fragment key={time}>
            {/* Time label */}
            <div className="bg-gray-50 border-b border-r text-xs p-2 font-medium text-gray-600">
              {time}
            </div>
            
            {/* Day columns */}
            {DAYS.map(day => renderTimeSlot(day, time))}
          </React.Fragment>
        ))}
      </div>

      {/* Legend */}
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
    </div>
  );
};

export default DragDropCalendar;
