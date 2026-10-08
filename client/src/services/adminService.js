import api from './api';

export const adminService = {
  getAdminStats: async () => {
    return await api.get('/admin/stats');
  },

  getAllUsers: async (params = {}) => {
    return await api.get('/admin/users', { params });
  },

  toggleUserStatus: async (userId, isActive) => {
    return await api.patch(`/admin/users/${userId}/status`, { isActive });
  },

  updateUserRole: async (userId, role) => {
    return await api.patch(`/admin/users/${userId}/role`, { role });
  },
};
