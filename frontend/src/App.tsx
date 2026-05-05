import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { auth } from './api/client';
import type { User } from './api/types';

// Components
import Header from './components/Header';
import LoginForm from './components/LoginForm';
import ProtectedRoute from './components/ProtectedRoute';
import TeacherTimeline from './components/TeacherTimeline';
import DemoModeBanner from './components/DemoModeBanner';

// Views
import WeekView from './views/WeekView';
import MonthView from './views/MonthView';
import AdminPanel from './views/AdminPanel';
import ScheduleManager from './views/ScheduleManager';
import CalendarManager from './views/CalendarManager';
import ResourceManager from './views/ResourceManager';

type ScheduleViewMode = 'day' | 'week' | 'month';

const scheduleViews: ScheduleViewMode[] = ['day', 'week', 'month'];

const ScheduleRoute: React.FC = () => {
  const [params] = useSearchParams();
  const requestedView = params.get('view');
  const view = scheduleViews.includes(requestedView as ScheduleViewMode)
    ? requestedView as ScheduleViewMode
    : 'day';

  if (view === 'week') return <WeekView />;
  if (view === 'month') return <MonthView />;
  return <TeacherTimeline />;
};

const buildLegacyScheduleRedirect = (search: string, view: Exclude<ScheduleViewMode, 'day'>) => {
  const params = new URLSearchParams(search);
  params.set('view', view);

  return { pathname: '/', search: `?${params.toString()}` };
};

const LegacyScheduleRedirect: React.FC<{ view: Exclude<ScheduleViewMode, 'day'> }> = ({ view }) => {
  const location = useLocation();
  return <Navigate to={buildLegacyScheduleRedirect(location.search, view)} replace />;
};

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
      <div className="min-h-screen flex items-center justify-center bg-base">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-accent-500/20 border-t-accent-500"></div>
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

  if (location.pathname === '/week') {
    return <Navigate to={buildLegacyScheduleRedirect(location.search, 'week')} replace />;
  }

  if (location.pathname === '/month') {
    return <Navigate to={buildLegacyScheduleRedirect(location.search, 'month')} replace />;
  }

  return (
    <div className="min-h-screen bg-base">
      <Header user={user} onLogout={handleLogout} />
      <DemoModeBanner containerSize="full" />
      <main>
        <Routes>
          <Route path="/" element={<ScheduleRoute />} />
          <Route path="/week" element={<LegacyScheduleRedirect view="week" />} />
          <Route path="/month" element={<LegacyScheduleRedirect view="month" />} />
          
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


