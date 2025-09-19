import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { auth } from './api/client';
import type { User } from './api/types';

// Components
import Header from './components/Header';
import LoginForm from './components/LoginForm';
import ProtectedRoute from './components/ProtectedRoute';
import TeacherTimeline from './components/TeacherTimeline';

// Views
import WeekView from './views/WeekView';
import AdminPanel from './views/AdminPanel';
import ScheduleManager from './views/ScheduleManager';
import CalendarManager from './views/CalendarManager';
import ResourceManager from './views/ResourceManager';

const AppContent: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    // Check if user is already authenticated
    const storedUser = auth.getUser();
    if (storedUser && auth.isAuthenticated()) {
      setUser(storedUser);
    }
    setLoading(false);
  }, []);

  const handleLoginSuccess = () => {
    const authenticatedUser = auth.getUser();
    setUser(authenticatedUser);
  };

  const handleLogout = () => {
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!auth.isAuthenticated()) {
    return (
      <Routes>
        <Route path="/login" element={<LoginForm onLoginSuccess={handleLoginSuccess} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} onLogout={handleLogout} />
      <main>
        <Routes>
          <Route path="/" element={<TeacherTimeline />} />
          <Route path="/week" element={<WeekView />} />
          
          <Route 
            path="/manage" 
            element={
              <ProtectedRoute requiredRoles={['manager', 'admin']}>
                <ScheduleManager />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/calendar" 
            element={
              <ProtectedRoute requiredRoles={['manager', 'admin']}>
                <CalendarManager />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/resources" 
            element={
              <ProtectedRoute requiredRoles={['manager', 'admin']}>
                <ResourceManager />
              </ProtectedRoute>
            } 
          />
          
          <Route 
            path="/admin" 
            element={
              <ProtectedRoute requiredRoles={['admin']}>
                <AdminPanel />
              </ProtectedRoute>
            } 
          />
          
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
};

export default App;


