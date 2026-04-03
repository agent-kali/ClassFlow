import React, { useState } from 'react';
import TeacherManager from './TeacherManager';
import ClassManager from './ClassManager';

const ResourceManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'teachers' | 'classes'>('teachers');

  return (
    <div className="page-container page-container-lg py-6">
      <div className="py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">Resource Management</h1>
          <p className="mt-2 text-sm text-white/60">
            Manage teachers, classes, and other scheduling resources.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-white/[0.06] mb-6">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('teachers')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'teachers'
                  ? 'border-accent-500 text-accent-400'
                  : 'border-transparent text-white/50 hover:text-white/70 hover:border-white/[0.08]'
              }`}
            >
              👨‍🏫 Teachers
            </button>
            <button
              onClick={() => setActiveTab('classes')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'classes'
                  ? 'border-accent-500 text-accent-400'
                  : 'border-transparent text-white/50 hover:text-white/70 hover:border-white/[0.08]'
              }`}
            >
              📚 Classes
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="tab-content">
          {activeTab === 'teachers' && <TeacherManager />}
          {activeTab === 'classes' && <ClassManager />}
        </div>
      </div>
    </div>
  );
};

export default ResourceManager;
