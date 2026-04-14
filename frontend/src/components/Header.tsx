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

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  const navItems = [
    { path: '/', label: 'Timeline', icon: '◷', roles: ['manager', 'admin', 'teacher'] },
    { path: '/week', label: 'Week', icon: '▦', roles: ['manager', 'admin', 'teacher'] },
    { path: '/month', label: 'Month', icon: '▣', roles: ['manager', 'admin'] },
    { path: '/manage', label: 'Manage', icon: '⚙', roles: ['manager', 'admin'] },
    { path: '/resources', label: 'Resources', icon: '◈', roles: ['manager', 'admin'] },
    { path: '/admin', label: 'Admin', icon: '⛭', roles: ['admin'] },
  ];

  const visibleNavItems = navItems.filter(item =>
    user && item.roles.includes(user.role)
  );

  // User initials for avatar
  const initials = user?.username
    ? user.username.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <header className="glass-nav sticky top-0 z-50">
      <div className="page-container page-container-full">
        <div className="flex justify-between items-center" style={{ height: '60px' }}>
          {/* Logo + Desktop nav */}
          <div className="flex items-center gap-8">
            {/* ClassFlow wordmark */}
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #f97316)' }}>
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="text-lg font-bold font-display tracking-tight">
                <span className="text-accent-400">Class</span>
                <span className="text-white">Flow</span>
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1">
              {visibleNavItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`relative px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide transition-all duration-150
                    ${isActive(item.path)
                      ? 'text-accent-300 bg-accent-500/10'
                      : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                    }`}
                >
                  {item.label}
                  {isActive(item.path) && (
                    <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-accent-500 rounded-full" />
                  )}
                </Link>
              ))}
            </nav>
          </div>

          {/* Right side — user + logout */}
          <div className="hidden sm:flex items-center gap-3">
            {user && (
              <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                {/* Avatar */}
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                  {initials}
                </div>
                <span className="text-sm font-medium text-white/80">{user.username}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-accent-500/15 text-accent-300">
                  {user.role}
                </span>
              </div>
            )}
            {/* Logout icon button */}
            <button
              onClick={handleLogout}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150"
              title="Sign out"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center gap-2 lg:hidden">
            {user && (
              <span className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-accent-500/15 text-accent-300">
                {user.role}
              </span>
            )}
            <button
              onClick={toggleMobileMenu}
              className="text-white/60 hover:text-white/90 transition-colors p-1"
              aria-label="Toggle mobile menu"
            >
              {isMobileMenuOpen ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-white/[0.06] animate-fade-in">
            <div className="px-2 pt-3 pb-4 space-y-1">
              {visibleNavItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={closeMobileMenu}
                  className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                    ${isActive(item.path)
                      ? 'text-accent-300 bg-accent-500/10'
                      : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                    }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>

            {/* Mobile user + logout */}
            <div className="border-t border-white/[0.06] pt-4 pb-3 px-4">
              {user && (
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                    {initials}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white/80">{user.username}</div>
                    <div className="text-xs text-white/40">{user.role}</div>
                  </div>
                </div>
              )}
              <button
                onClick={() => { handleLogout(); closeMobileMenu(); }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
