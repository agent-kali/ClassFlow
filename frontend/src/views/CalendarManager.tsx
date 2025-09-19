import React, { useState } from 'react';
import DragDropCalendar from '../components/DragDropCalendar';

const CalendarManager: React.FC = () => {
  const [currentWeek, setCurrentWeek] = useState(5); // Start with week 5 since that has data

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
          onWeekChange={setCurrentWeek}
        />
      </div>
    </div>
  );
};

export default CalendarManager;
