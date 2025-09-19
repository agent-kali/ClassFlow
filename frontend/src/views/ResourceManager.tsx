import React, { useState } from 'react';
import TeacherManager from './TeacherManager';
import ClassManager from './ClassManager';

const ResourceManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'teachers' | 'classes'>('teachers');

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Resource Management</h1>
          <p className="mt-2 text-sm text-gray-600">
            Manage teachers, classes, and other scheduling resources.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('teachers')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'teachers'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              👨‍🏫 Teachers
            </button>
            <button
              onClick={() => setActiveTab('classes')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'classes'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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
