import React from 'react';
import TeacherTimeline from './components/TeacherTimeline';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import WeekView from './views/WeekView';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Routes>
          <Route path="/" element={<TeacherTimeline />} />
          <Route path="/week" element={<WeekView />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
};

export default App;


