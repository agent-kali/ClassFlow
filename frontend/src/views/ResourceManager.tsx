import React, { useState } from 'react';
import TeacherManager from './TeacherManager';
import ClassManager from './ClassManager';
import SidebarLayout from '../components/SidebarLayout';
import SidebarSection from '../components/SidebarSection';

const ResourceManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'teachers' | 'classes'>('teachers');

  const sidebarContent = (
    <>
      <SidebarSection label="Resources">
        <div className="space-y-1">
          <button
            onClick={() => setActiveTab('teachers')}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'teachers'
                ? 'bg-accent-500/15 text-accent-300 border border-accent-500/30'
                : 'text-white/60 hover:bg-white/[0.04] hover:text-white/80 border border-transparent'
            }`}
          >
            Teachers
          </button>
          <button
            onClick={() => setActiveTab('classes')}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'classes'
                ? 'bg-accent-500/15 text-accent-300 border border-accent-500/30'
                : 'text-white/60 hover:bg-white/[0.04] hover:text-white/80 border border-transparent'
            }`}
          >
            Classes
          </button>
        </div>
      </SidebarSection>

      <div className="border-t border-white/[0.06]" />

      <SidebarSection>
        <p className="text-xs text-white/30 leading-relaxed">
          Manage teachers, classes, and other scheduling resources.
        </p>
      </SidebarSection>
    </>
  );

  return (
    <SidebarLayout sidebar={sidebarContent}>
      <div className="min-h-full">
        <div className="px-4 lg:px-6 py-6">
          {activeTab === 'teachers' && <TeacherManager />}
          {activeTab === 'classes' && <ClassManager />}
        </div>
      </div>
    </SidebarLayout>
  );
};

export default ResourceManager;
