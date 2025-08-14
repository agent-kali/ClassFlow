import React from 'react';
import TeacherTimeline from './components/TeacherTimeline';

const App: React.FC = () => {
  return (
    <div className="min-h-screen p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">E‑Home Schedule</h1>
        <p className="text-sm text-gray-600">Frontend scaffold ready. Next step: build teacher timeline UI.</p>
      </header>
      <main className="space-y-4">
        <TeacherTimeline />
      </main>
    </div>
  );
};

export default App;


