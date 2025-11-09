import React, { useState } from 'react';
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

  const mobileNavLinkClass = (path: string) =>
    `block px-3 py-2 rounded-md text-base font-medium transition-colors ${
      isActive(path)
        ? 'bg-indigo-700 text-white'
        : 'text-indigo-100 hover:bg-indigo-600 hover:text-white'
    }`;

  // For teacher users, show no header - let the main content handle it
  if (user && user.role === 'teacher') {
    return null;
  }

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  // For manager/admin users, show the full responsive header
  return (
    <header className="bg-indigo-600 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          {/* Logo and desktop navigation */}
          <div className="flex items-center">
            <h1 className="text-lg sm:text-xl font-bold text-white mr-4 sm:mr-8 flex-shrink-0">
              E-Home Schedule
            </h1>
            
            {/* Desktop Navigation */}
            <nav className="hidden lg:flex space-x-4">
              <Link to="/" className={navLinkClass('/')}>
                Timeline
              </Link>
              <Link to="/week" className={navLinkClass('/week')}>
                Week View
              </Link>
              {user && ['manager', 'admin'].includes(user.role) && (
                <Link to="/month" className={navLinkClass('/month')}>
                  Month View
                </Link>
              )}
              {user && ['manager', 'admin'].includes(user.role) && (
                <Link to="/manage" className={navLinkClass('/manage')}>
                  Manage
                </Link>
              )}
              {user && ['manager', 'admin'].includes(user.role) && (
                <Link to="/resources" className={navLinkClass('/resources')}>
                  Resources
                </Link>
              )}
              {user && user.role === 'admin' && (
                <Link to="/admin" className={navLinkClass('/admin')}>
                  Admin
                </Link>
              )}
            </nav>
          </div>

          {/* Desktop user info and logout */}
          <div className="hidden sm:flex items-center space-x-4">
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

          {/* Mobile menu button */}
          <div className="flex items-center space-x-2 lg:hidden">
            {/* Mobile user badge */}
            {user && (
              <span className="px-2 py-1 bg-indigo-700 rounded text-xs uppercase text-white font-medium">
                {user.role}
              </span>
            )}
            <button
              onClick={toggleMobileMenu}
              className="text-white hover:text-indigo-200 focus:outline-none focus:text-indigo-200 transition-colors"
              aria-label="Toggle mobile menu"
            >
              {isMobileMenuOpen ? (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-indigo-700">
            <div className="px-2 pt-2 pb-3 space-y-1">
              <Link to="/" className={mobileNavLinkClass('/')} onClick={closeMobileMenu}>
                Teacher Timeline
              </Link>
              <Link to="/week" className={mobileNavLinkClass('/week')} onClick={closeMobileMenu}>
                Week View
              </Link>
              {user && ['manager', 'admin'].includes(user.role) && (
                <Link to="/month" className={mobileNavLinkClass('/month')} onClick={closeMobileMenu}>
                  Month View
                </Link>
              )}
              {user && ['manager', 'admin'].includes(user.role) && (
                <Link to="/manage" className={mobileNavLinkClass('/manage')} onClick={closeMobileMenu}>
                  Manage Schedule
                </Link>
              )}
              {user && ['manager', 'admin'].includes(user.role) && (
                <Link to="/resources" className={mobileNavLinkClass('/resources')} onClick={closeMobileMenu}>
                  Resources
                </Link>
              )}
              {user && user.role === 'admin' && (
                <Link to="/admin" className={mobileNavLinkClass('/admin')} onClick={closeMobileMenu}>
                  Admin Panel
                </Link>
              )}
            </div>
            
            {/* Mobile user info and logout */}
            <div className="border-t border-indigo-700 pt-4 pb-3">
              <div className="px-4">
                {user && (
                  <div className="text-white text-sm mb-3">
                    <div className="font-medium">{user.username}</div>
                    <div className="text-indigo-200 text-xs">{user.role}</div>
                  </div>
                )}
                <button
                  onClick={() => {
                    handleLogout();
                    closeMobileMenu();
                  }}
                  className="w-full text-left bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-md"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
