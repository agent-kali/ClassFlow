import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { User } from '../api/types';

interface HeaderProps {
  user: User | null;
  onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({ user, onLogout }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    api.logout();
    onLogout();
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path;

  const navLinkClass = (path: string) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive(path)
        ? 'bg-indigo-700 text-white'
        : 'text-indigo-100 hover:bg-indigo-600 hover:text-white'
    }`;

  // For teacher users, show no header - let the main content handle it
  if (user && user.role === 'teacher') {
    return null;
  }

  // For manager/admin users, show the full purple header
  return (
    <header className="bg-indigo-600 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-8">
            <h1 className="text-xl font-bold text-white">
              E-Home Schedule Manager
            </h1>
            
            <nav className="flex space-x-4">
              <Link to="/" className={navLinkClass('/')}>
                Teacher Timeline
              </Link>
              <Link to="/week" className={navLinkClass('/week')}>
                Week View
              </Link>
              {user && ['manager', 'admin'].includes(user.role) && (
                <Link to="/manage" className={navLinkClass('/manage')}>
                  Manage Schedule
                </Link>
              )}
              {user && ['manager', 'admin'].includes(user.role) && (
                <Link to="/calendar" className={navLinkClass('/calendar')}>
                  Visual Editor
                </Link>
              )}
              {user && ['manager', 'admin'].includes(user.role) && (
                <Link to="/resources" className={navLinkClass('/resources')}>
                  Resources
                </Link>
              )}
              {user && user.role === 'admin' && (
                <Link to="/admin" className={navLinkClass('/admin')}>
                  Admin Panel
                </Link>
              )}
            </nav>
          </div>

          <div className="flex items-center space-x-4">
            {user && (
              <div className="text-white text-sm">
                <span className="font-medium">{user.username}</span>
                <span className="ml-2 px-2 py-1 bg-indigo-700 rounded text-xs uppercase">
                  {user.role}
                </span>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-md"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
