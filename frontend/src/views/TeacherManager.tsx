import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { TeacherOut, TeacherCreate, TeacherUpdate } from '../api/types';

const TeacherManager: React.FC = () => {
  const [teachers, setTeachers] = useState<TeacherOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<TeacherOut | null>(null);

  // Form state
  const [formData, setFormData] = useState<TeacherCreate>({
    name: '',
    email: '',
    phone: '',
    specialization: '',
    is_active: true
  });

  // Fetch teachers
  const fetchTeachers = async () => {
    try {
      setLoading(true);
      const data = await api.listTeachersDetailed({
        search: searchTerm || undefined,
        is_active: showInactive ? undefined : true
      });
      setTeachers(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teachers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeachers();
  }, [searchTerm, showInactive]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingTeacher) {
        // Update existing teacher
        await api.updateTeacher(editingTeacher.teacher_id, formData as TeacherUpdate);
      } else {
        // Create new teacher
        await api.createTeacher(formData);
      }
      
      // Reset form and refresh list
      setFormData({ name: '', email: '', phone: '', specialization: '', is_active: true });
      setShowCreateForm(false);
      setEditingTeacher(null);
      fetchTeachers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save teacher');
    }
  };

  // Handle delete
  const handleDelete = async (teacher: TeacherOut) => {
    if (!confirm(`Are you sure you want to delete ${teacher.name}?`)) return;
    
    try {
      const force = teacher.lesson_count > 0;
      if (force && !confirm(`${teacher.name} has ${teacher.lesson_count} lessons. This will deactivate instead of delete. Continue?`)) {
        return;
      }
      
      await api.deleteTeacher(teacher.teacher_id, force);
      fetchTeachers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete teacher');
    }
  };

  // Handle edit
  const handleEdit = (teacher: TeacherOut) => {
    setEditingTeacher(teacher);
    setFormData({
      name: teacher.name,
      email: teacher.email || '',
      phone: teacher.phone || '',
      specialization: teacher.specialization || '',
      is_active: teacher.is_active
    });
    setShowCreateForm(true);
  };

  // Cancel form
  const handleCancel = () => {
    setFormData({ name: '', email: '', phone: '', specialization: '', is_active: true });
    setShowCreateForm(false);
    setEditingTeacher(null);
  };

  return (
    <div>
      <div>
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">Teacher Management</h1>
          <p className="mt-2 text-sm text-white/60">
            Manage teachers, their contact information, and specializations.
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
                placeholder="Search teachers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-white/[0.08] rounded-md focus:ring-accent-500 focus:border-accent-500"
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Show inactive toggle */}
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="mr-2 h-4 w-4 text-accent-400 focus:ring-accent-500 border-white/[0.08] rounded"
              />
              <span className="text-sm text-white/70">Show inactive teachers</span>
            </label>
          </div>

          {/* Add Teacher Button */}
          <button
            onClick={() => setShowCreateForm(true)}
            className="bg-accent-600 text-white px-4 py-2 rounded-md hover:bg-accent-700 focus:ring-2 focus:ring-accent-500"
          >
            Add Teacher
          </button>
        </div>

        {/* Create/Edit Form */}
        {showCreateForm && (
          <div className="bg-surface shadow-glass rounded-lg border mb-6">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-medium">
                {editingTeacher ? 'Edit Teacher' : 'Add New Teacher'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-white/[0.08] rounded-md focus:ring-accent-500 focus:border-accent-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-white/[0.08] rounded-md focus:ring-accent-500 focus:border-accent-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-white/[0.08] rounded-md focus:ring-accent-500 focus:border-accent-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">
                    Specialization
                  </label>
                  <input
                    type="text"
                    value={formData.specialization}
                    onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                    placeholder="e.g., Mathematics, English, Science"
                    className="w-full px-3 py-2 border border-white/[0.08] rounded-md focus:ring-accent-500 focus:border-accent-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="mr-2 h-4 w-4 text-accent-400 focus:ring-accent-500 border-white/[0.08] rounded"
                    />
                    <span className="text-sm text-white/70">Active teacher</span>
                  </label>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  type="submit"
                  className="bg-accent-600 text-white px-4 py-2 rounded-md hover:bg-accent-700 focus:ring-2 focus:ring-accent-500"
                >
                  {editingTeacher ? 'Update Teacher' : 'Create Teacher'}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="bg-gray-300 text-white/70 px-4 py-2 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Teachers Table */}
        <div className="bg-surface shadow-glass rounded-lg border overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-medium">Teachers ({teachers.length})</h2>
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
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/50 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/50 uppercase tracking-wider">
                      Specialization
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
                  {teachers.map((teacher) => (
                    <tr key={teacher.teacher_id} className="hover:bg-base">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-white">
                          {teacher.name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-white">
                          {teacher.email && (
                            <div>📧 {teacher.email}</div>
                          )}
                          {teacher.phone && (
                            <div>📞 {teacher.phone}</div>
                          )}
                          {!teacher.email && !teacher.phone && (
                            <span className="text-white/40">No contact info</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-white">
                          {teacher.specialization || (
                            <span className="text-white/40">Not specified</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-white">
                          {teacher.lesson_count} lessons
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          teacher.is_active 
                            ? 'bg-green-500/15 text-green-300' 
                            : 'bg-red-500/15 text-red-300'
                        }`}>
                          {teacher.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(teacher)}
                            className="text-accent-400 hover:text-accent-300"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(teacher)}
                            className="text-red-400 hover:text-red-900"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {teachers.length === 0 && (
                <div className="text-center py-8 text-white/50">
                  No teachers found. {searchTerm && 'Try adjusting your search.'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeacherManager;
