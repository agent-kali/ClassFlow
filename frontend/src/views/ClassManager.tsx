import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { ClassOut, ClassCreate, ClassUpdate } from '../api/types';

const ClassManager: React.FC = () => {
  const [classes, setClasses] = useState<ClassOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [campusFilter, setCampusFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassOut | null>(null);

  // Get unique campuses for filter
  const uniqueCampuses = Array.from(new Set(classes.map(c => c.campus_name))).sort();

  // Form state
  const [formData, setFormData] = useState<ClassCreate>({
    code_new: '',
    code_old: '',
    campus_name: '',
    level: '',
    capacity: undefined,
    is_active: true
  });

  // Fetch classes
  const fetchClasses = async () => {
    try {
      setLoading(true);
      const data = await api.listClassesDetailed({
        search: searchTerm || undefined,
        campus: campusFilter || undefined,
        is_active: showInactive ? undefined : true
      });
      setClasses(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load classes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
  }, [searchTerm, campusFilter, showInactive]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingClass) {
        // Update existing class
        await api.updateClass(editingClass.class_id, formData as ClassUpdate);
      } else {
        // Create new class
        await api.createClass(formData);
      }
      
      // Reset form and refresh list
      setFormData({ 
        code_new: '', 
        code_old: '', 
        campus_name: '', 
        level: '', 
        capacity: undefined, 
        is_active: true 
      });
      setShowCreateForm(false);
      setEditingClass(null);
      fetchClasses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save class');
    }
  };

  // Handle delete
  const handleDelete = async (cls: ClassOut) => {
    if (!confirm(`Are you sure you want to delete ${cls.code_new || cls.code_old}?`)) return;
    
    try {
      const force = cls.lesson_count > 0;
      if (force && !confirm(`${cls.code_new || cls.code_old} has ${cls.lesson_count} lessons. This will deactivate instead of delete. Continue?`)) {
        return;
      }
      
      await api.deleteClass(cls.class_id, force);
      fetchClasses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete class');
    }
  };

  // Handle edit
  const handleEdit = (cls: ClassOut) => {
    setEditingClass(cls);
    setFormData({
      code_new: cls.code_new || '',
      code_old: cls.code_old || '',
      campus_name: cls.campus_name,
      level: cls.level || '',
      capacity: cls.capacity || undefined,
      is_active: cls.is_active
    });
    setShowCreateForm(true);
  };

  // Cancel form
  const handleCancel = () => {
    setFormData({ 
      code_new: '', 
      code_old: '', 
      campus_name: '', 
      level: '', 
      capacity: undefined, 
      is_active: true 
    });
    setShowCreateForm(false);
    setEditingClass(null);
  };

  return (
    <div className="max-w-6xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Class Management</h1>
          <p className="mt-2 text-sm text-gray-600">
            Manage classes, their codes, campuses, and capacity information.
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Controls */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            {/* Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search classes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Campus filter */}
            <select
              value={campusFilter}
              onChange={(e) => setCampusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">All Campuses</option>
              {uniqueCampuses.map(campus => (
                <option key={campus} value={campus}>{campus}</option>
              ))}
            </select>

            {/* Show inactive toggle */}
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="mr-2 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700">Show inactive classes</span>
            </label>
          </div>

          {/* Add Class Button */}
          <button
            onClick={() => setShowCreateForm(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500"
          >
            Add Class
          </button>
        </div>

        {/* Create/Edit Form */}
        {showCreateForm && (
          <div className="bg-white shadow-sm rounded-lg border mb-6">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-medium">
                {editingClass ? 'Edit Class' : 'Add New Class'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    New Class Code
                  </label>
                  <input
                    type="text"
                    value={formData.code_new}
                    onChange={(e) => setFormData({ ...formData, code_new: e.target.value })}
                    placeholder="e.g., E1 INTER 4 K2"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Old Class Code
                  </label>
                  <input
                    type="text"
                    value={formData.code_old}
                    onChange={(e) => setFormData({ ...formData, code_old: e.target.value })}
                    placeholder="Legacy class code"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Campus *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.campus_name}
                    onChange={(e) => setFormData({ ...formData, campus_name: e.target.value })}
                    placeholder="e.g., E1, E2, Main Campus"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Level
                  </label>
                  <input
                    type="text"
                    value={formData.level}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                    placeholder="e.g., Beginner, Intermediate, Advanced"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Capacity
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formData.capacity || ''}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      capacity: e.target.value ? parseInt(e.target.value) : undefined 
                    })}
                    placeholder="Maximum students"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="mr-2 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <span className="text-sm text-gray-700">Active class</span>
                  </label>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  type="submit"
                  className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500"
                >
                  {editingClass ? 'Update Class' : 'Create Class'}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Classes Table */}
        <div className="bg-white shadow-sm rounded-lg border overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-medium">Classes ({classes.length})</h2>
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Class Code
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Campus
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Level
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Capacity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Lessons
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {classes.map((cls) => (
                    <tr key={cls.class_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {cls.code_new || cls.code_old || 'Unnamed Class'}
                        </div>
                        {cls.code_new && cls.code_old && cls.code_new !== cls.code_old && (
                          <div className="text-xs text-gray-500">
                            Legacy: {cls.code_old}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{cls.campus_name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {cls.level || (
                            <span className="text-gray-400">Not specified</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {cls.capacity ? `${cls.capacity} students` : (
                            <span className="text-gray-400">No limit</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {cls.lesson_count} lessons
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          cls.is_active 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {cls.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(cls)}
                            className="text-indigo-600 hover:text-indigo-900"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(cls)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {classes.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No classes found. {searchTerm && 'Try adjusting your search.'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClassManager;
