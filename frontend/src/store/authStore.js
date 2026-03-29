import { create } from 'zustand';

const useAuthStore = create((set, get) => ({
  user: (() => { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } })(),
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),

  login: (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ token: null, user: null, isAuthenticated: false });
  },

  updateUser: (user) => {
    localStorage.setItem('user', JSON.stringify(user));
    set({ user });
  },

  hasRole: (...roles) => {
    const user = get().user;
    return user && roles.includes(user.role);
  },

  isAdmin: () => get().user?.role === 'admin',
  isEngineer: () => get().user?.role === 'engineer',
  isOwner: () => get().user?.role === 'owner',
  isCS: () => get().user?.role === 'customer_service',
  canManage: () => ['admin','customer_service'].includes(get().user?.role),
}));

export default useAuthStore;
