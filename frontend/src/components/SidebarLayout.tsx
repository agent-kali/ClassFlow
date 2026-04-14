import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface SidebarLayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

const SidebarLayout: React.FC<SidebarLayoutProps> = ({ sidebar, children }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  return (
    <>
      <div className="flex min-h-[calc(100vh-60px)]">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:flex-col w-[260px] flex-shrink-0 sidebar-bg border-r border-white/[0.06] sticky top-[60px] h-[calc(100vh-60px)] overflow-y-auto scrollbar-hide">
          <div className="px-4 py-3 space-y-4 flex-1">
            {sidebar}
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div
          className="fixed top-[60px] inset-x-0 bottom-0 z-40 lg:hidden"
          onClick={() => setDrawerOpen(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <aside
            className="absolute inset-y-0 left-0 w-[280px] sidebar-bg border-r border-white/[0.06] overflow-y-auto sidebar-drawer-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 space-y-4">
              {sidebar}
            </div>
          </aside>
        </div>
      )}

      {/* Mobile sidebar FAB */}
      <button
        className="lg:hidden fixed bottom-5 left-5 z-30 w-11 h-11 rounded-full bg-accent-500 text-white shadow-lg flex items-center justify-center hover:bg-accent-600 active:scale-95 transition-all"
        onClick={() => setDrawerOpen((prev) => !prev)}
        aria-label="Toggle filters"
      >
        {drawerOpen ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
          </svg>
        )}
      </button>
    </>
  );
};

export default SidebarLayout;
