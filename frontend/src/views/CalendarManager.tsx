import React, { useState } from 'react';
import DragDropCalendar from '../components/DragDropCalendar';

const MIN_WEEK = 1;
const MAX_WEEK = 5;

const CalendarManager: React.FC = () => {
  const [currentWeek, setCurrentWeek] = useState<number>(MIN_WEEK);

  // Handle week changes with bounds checking
  const handleWeekChange = (newWeek: number) => {
    const constrainedWeek = Math.max(MIN_WEEK, Math.min(MAX_WEEK, newWeek));
    setCurrentWeek(constrainedWeek);
  };

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Visual Schedule Editor</h1>
          <p className="mt-2 text-sm text-gray-600">
            Drag and drop lessons to reschedule them. The system will automatically check for conflicts.
          </p>
        </div>

        <DragDropCalendar 
          week={currentWeek}
          onWeekChange={handleWeekChange}
        />
      </div>
    </div>
  );
};

export default CalendarManager;
