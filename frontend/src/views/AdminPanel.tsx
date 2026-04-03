import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { User, UserCreate, Teacher, UserRole } from '../api/types';

const AdminPanel: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const [formData, setFormData] = useState<UserCreate>({
    username: '',
    email: '',
    password: '',
    role: 'teacher',
    teacher_id: null,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersData, teachersData] = await Promise.all([
        api.listUsers(),
        api.listTeachers(),
      ]);
      setUsers(usersData);
      setTeachers(teachersData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await api.updateUser(editingUser.user_id, formData);
      } else {
        await api.createUser(formData);
      }
      await loadData();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed');
    }
  };

  const handleDelete = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    
    try {
      await api.deleteUser(userId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const resetForm = () => {
    setFormData({
      username: '',
      email: '',
      password: '',
      role: 'teacher',
      teacher_id: null,
    });
    setShowCreateForm(false);
    setEditingUser(null);
  };

  const startEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      password: '', // Don't pre-fill password
      role: user.role,
      teacher_id: user.teacher_id,
    });
    setShowCreateForm(true);
  };

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case 'admin': return 'bg-red-500/15 text-red-300';
      case 'manager': return 'bg-blue-500/15 text-blue-300';
      case 'teacher': return 'bg-green-500/15 text-green-300';
      default: return 'bg-elevated text-white/90';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-accent-500"></div>
      </div>
    );
  }

  return (
    <div className="page-container page-container-lg py-6">
      <div className="py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-white">Admin Panel</h1>
          <button
            onClick={() => setShowCreateForm(true)}
            className="bg-accent-600 hover:bg-accent-700 text-white px-6 py-3 rounded-lg text-sm font-semibold shadow-card hover:shadow-card focus:outline-none focus:ring-4 focus:ring-accent-500/15 transition-all duration-200 transform hover:-translate-y-0.5"
          >
            Create User
          </button>
        </div>

        {error && (
          <div className="bg-red-500/[0.08] border border-red-500/20 text-red-400 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* User Creation/Edit Form */}
        {showCreateForm && (
          <div className="bg-surface shadow-card rounded-2xl p-8 mb-8 border border-white/[0.04]">
            <h2 className="text-2xl font-bold text-white mb-6 pb-2 border-b border-white/[0.06]">
              {editingUser ? 'Edit User' : 'Create New User'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-white/90 mb-2">Username</label>
                  <input
                    type="text"
                    required
                    className="w-full px-4 py-3 bg-surface border-2 border-white/[0.06] rounded-lg text-white placeholder-gray-500 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/15 focus:outline-none transition-all duration-200 hover:border-white/[0.08] shadow-glass"
                    value={formData.username}
                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                    placeholder="Enter username"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-white/90 mb-2">Email</label>
                  <input
                    type="email"
                    required
                    className="w-full px-4 py-3 bg-surface border-2 border-white/[0.06] rounded-lg text-white placeholder-gray-500 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/15 focus:outline-none transition-all duration-200 hover:border-white/[0.08] shadow-glass"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    placeholder="Enter email address"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-white/90 mb-2">
                    Password {editingUser && <span className="text-white/50 font-normal">(leave blank to keep current)</span>}
                  </label>
                  <input
                    type="password"
                    required={!editingUser}
                    className="w-full px-4 py-3 bg-surface border-2 border-white/[0.06] rounded-lg text-white placeholder-gray-500 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/15 focus:outline-none transition-all duration-200 hover:border-white/[0.08] shadow-glass"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    placeholder={editingUser ? "Enter new password" : "Enter password"}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-white/90 mb-2">Role</label>
                  <select
                    className="w-full px-4 py-3 bg-surface border-2 border-white/[0.06] rounded-lg text-white focus:border-accent-500 focus:ring-4 focus:ring-accent-500/15 focus:outline-none transition-all duration-200 hover:border-white/[0.08] shadow-glass cursor-pointer"
                    value={formData.role}
                    onChange={(e) => setFormData({...formData, role: e.target.value as UserRole})}
                  >
                    <option value="teacher">Teacher</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-white/90 mb-2">Linked Teacher <span className="text-white/50 font-normal">(Optional)</span></label>
                  <select
                    className="w-full px-4 py-3 bg-surface border-2 border-white/[0.06] rounded-lg text-white focus:border-accent-500 focus:ring-4 focus:ring-accent-500/15 focus:outline-none transition-all duration-200 hover:border-white/[0.08] shadow-glass cursor-pointer"
                    value={formData.teacher_id || ''}
                    onChange={(e) => setFormData({...formData, teacher_id: e.target.value ? Number(e.target.value) : null})}
                  >
                    <option value="">No linked teacher</option>
                    {teachers.map(teacher => (
                      <option key={teacher.teacher_id} value={teacher.teacher_id}>
                        {teacher.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end space-x-4 pt-4 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-6 py-3 border-2 border-white/[0.08] rounded-lg text-sm font-semibold text-white/70 hover:bg-base hover:border-gray-400 focus:outline-none focus:ring-4 focus:ring-gray-100 transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-lg shadow-card hover:shadow-card focus:outline-none focus:ring-4 focus:ring-accent-500/15 transition-all duration-200 transform hover:-translate-y-0.5"
                >
                  {editingUser ? 'Update User' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Users Table */}
        <div className="bg-surface shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-white/[0.06]">
            <thead className="bg-base">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/50 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/50 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/50 uppercase tracking-wider">
                  Linked Teacher
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
              {users.map((user) => (
                <tr key={user.user_id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-white">{user.username}</div>
                      <div className="text-sm text-white/50">{user.email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 text-xs font-semibold rounded-full ${getRoleBadgeColor(user.role)}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                    {user.teacher_id ? teachers.find(t => t.teacher_id === user.teacher_id)?.name || `ID: ${user.teacher_id}` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 text-xs font-semibold rounded-full ${user.is_active ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'}`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button
                      onClick={() => startEdit(user)}
                      className="text-accent-400 hover:text-accent-300"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(user.user_id)}
                      className="text-red-400 hover:text-red-900"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
