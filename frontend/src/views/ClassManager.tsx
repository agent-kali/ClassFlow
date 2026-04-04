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
    <div>
      <div>
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">Class Management</h1>
          <p className="mt-2 text-sm text-white/60">
            Manage classes, their codes, campuses, and capacity information.
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/[0.08] border border-red-500/20 text-red-400 px-4 py-3 rounded mb-4">
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
                className="pl-10 pr-4 py-2.5 rounded-xl border border-white/[0.06] bg-elevated text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500/40 transition-all"
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-4 w-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Campus filter */}
            <select
              value={campusFilter}
              onChange={(e) => setCampusFilter(e.target.value)}
              className="select-control"
            >
              <option value="">All Campuses</option>
              {uniqueCampuses.map(campus => (
                <option key={campus} value={campus}>{campus}</option>
              ))}
            </select>

            {/* Show inactive toggle */}
            <button
              type="button"
              role="switch"
              aria-checked={showInactive}
              onClick={() => setShowInactive(!showInactive)}
              className="flex items-center gap-2.5 group"
            >
              <span className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-white/[0.06] transition-colors duration-200 ${showInactive ? 'bg-accent-600' : 'bg-white/[0.06]'}`}>
                <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${showInactive ? 'translate-x-[15px]' : 'translate-x-0.5'} mt-px`} />
              </span>
              <span className="text-sm text-white/50 group-hover:text-white/70 transition-colors">Show inactive</span>
            </button>
          </div>

          {/* Add Class Button */}
          <button
            onClick={() => setShowCreateForm(true)}
            className="bg-accent-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-accent-700 shadow-card transition-all"
          >
            Add Class
          </button>
        </div>

        {/* Create/Edit Form */}
        {showCreateForm && (
          <div className="bg-surface shadow-glass rounded-lg border mb-6">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-medium">
                {editingClass ? 'Edit Class' : 'Add New Class'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">
                    New Class Code
                  </label>
                  <input
                    type="text"
                    value={formData.code_new}
                    onChange={(e) => setFormData({ ...formData, code_new: e.target.value })}
                    placeholder="e.g., E1 INTER 4 K2"
                    className="w-full px-3 py-2 border border-white/[0.08] rounded-md focus:ring-accent-500 focus:border-accent-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">
                    Old Class Code
                  </label>
                  <input
                    type="text"
                    value={formData.code_old}
                    onChange={(e) => setFormData({ ...formData, code_old: e.target.value })}
                    placeholder="Legacy class code"
                    className="w-full px-3 py-2 border border-white/[0.08] rounded-md focus:ring-accent-500 focus:border-accent-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">
                    Campus *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.campus_name}
                    onChange={(e) => setFormData({ ...formData, campus_name: e.target.value })}
                    placeholder="e.g., E1, E2, Main Campus"
                    className="w-full px-3 py-2 border border-white/[0.08] rounded-md focus:ring-accent-500 focus:border-accent-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">
                    Level
                  </label>
                  <input
                    type="text"
                    value={formData.level}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                    placeholder="e.g., Beginner, Intermediate, Advanced"
                    className="w-full px-3 py-2 border border-white/[0.08] rounded-md focus:ring-accent-500 focus:border-accent-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">
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
                    className="w-full px-3 py-2 border border-white/[0.08] rounded-md focus:ring-accent-500 focus:border-accent-500"
                  />
                </div>

                <div className="flex items-center">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="mr-2 h-4 w-4 text-accent-400 focus:ring-accent-500 border-white/[0.08] rounded"
                    />
                    <span className="text-sm text-white/70">Active class</span>
                  </label>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  type="submit"
                  className="bg-accent-600 text-white px-4 py-2 rounded-md hover:bg-accent-700 focus:ring-2 focus:ring-accent-500"
                >
                  {editingClass ? 'Update Class' : 'Create Class'}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="border border-white/[0.08] bg-white/[0.04] text-white/60 px-4 py-2 rounded-lg hover:bg-white/[0.06] hover:text-white/80 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Classes Table */}
        <div className="bg-surface shadow-glass rounded-lg border overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-medium">Classes ({classes.length})</h2>
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/[0.06]">
                <thead className="bg-base">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/50 uppercase tracking-wider">
                      Class Code
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/50 uppercase tracking-wider">
                      Campus
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/50 uppercase tracking-wider">
                      Level
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/50 uppercase tracking-wider">
                      Capacity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/50 uppercase tracking-wider">
                      Lessons
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/50 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/50 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-surface divide-y divide-white/[0.06]">
                  {classes.map((cls) => (
                    <tr key={cls.class_id} className="hover:bg-base">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-white">
                          {cls.code_new || cls.code_old || 'Unnamed Class'}
                        </div>
                        {cls.code_new && cls.code_old && cls.code_new !== cls.code_old && (
                          <div className="text-xs text-white/50">
                            Legacy: {cls.code_old}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-white">{cls.campus_name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-white">
                          {cls.level || (
                            <span className="text-white/40">Not specified</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-white">
                          {cls.capacity ? `${cls.capacity} students` : (
                            <span className="text-white/40">No limit</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-white">
                          {cls.lesson_count} lessons
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 text-[11px] font-semibold rounded-full ${
                          cls.is_active 
                            ? 'bg-green-500/15 text-green-300' 
                            : 'bg-white/[0.06] text-white/40'
                        }`}>
                          {cls.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEdit(cls)}
                            className="p-1.5 rounded-lg text-white/40 hover:text-accent-400 hover:bg-white/[0.04] transition-colors"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                          </button>
                          <button
                            onClick={() => handleDelete(cls)}
                            className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {classes.length === 0 && (
                <div className="text-center py-8 text-white/50">
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
