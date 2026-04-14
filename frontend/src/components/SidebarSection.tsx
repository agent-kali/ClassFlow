import React from 'react';

interface SidebarSectionProps {
  label?: string;
  children: React.ReactNode;
  className?: string;
}

const SidebarSection: React.FC<SidebarSectionProps> = ({ label, children, className = '' }) => (
  <div className={className}>
    {label && (
      <div className="text-[11px] font-semibold uppercase tracking-widest text-white/25 mb-2.5 px-1">
        {label}
      </div>
    )}
    {children}
  </div>
);

export default SidebarSection;
