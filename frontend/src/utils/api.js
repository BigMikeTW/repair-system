import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const msg = error.response?.data?.error || error.message || '網路錯誤';
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }
    if (error.response?.status !== 404) {
      toast.error(msg);
    }
    return Promise.reject(error);
  }
);

// Auth
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  getMe: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/profile', data),
  changePassword: (data) => api.put('/auth/change-password', data),
};

// Cases
export const casesAPI = {
  list: (params) => api.get('/cases', { params }),
  get: (id) => api.get(`/cases/${id}`),
  create: (data) => api.post('/cases', data),
  update: (id, data) => api.put(`/cases/${id}`, data),
  updateStatus: (id, data) => api.put(`/cases/${id}/status`, data),
  assign: (id, data) => api.put(`/cases/${id}/assign`, data),
  checkin: (id, data) => api.post(`/cases/${id}/checkin`, data),
  sign: (id, data) => api.post(`/cases/${id}/sign`, data),
  getActivities: (id) => api.get(`/cases/${id}/activities`),
  getStats: () => api.get('/cases/stats'),
};

// Photos
export const photosAPI = {
  upload: (caseId, formData) => api.post(`/photos/${caseId}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  list: (caseId) => api.get(`/photos/${caseId}`),
  delete: (id) => api.delete(`/photos/${id}`),
};

// Chat
export const chatAPI = {
  getMessages: (caseId, params) => api.get(`/chat/${caseId}/messages`, { params }),
  getConversations: () => api.get('/chat/conversations/list'),
  sendMessage: (caseId, data) => api.post(`/chat/${caseId}/messages`, data),
  markRead: (caseId) => api.put(`/chat/${caseId}/read`),
};

// Finance
export const financeAPI = {
  getQuotations: (params) => api.get('/finance/quotations', { params }),
  getQuotation: (id) => api.get(`/finance/quotations/${id}`),
  createQuotation: (data) => api.post('/finance/quotations', data),
  updateQuotationStatus: (id, data) => api.put(`/finance/quotations/${id}/status`, data),
  quotationPdf: (id) => `/api/finance/quotations/${id}/pdf`,
  getInvoices: (params) => api.get('/finance/invoices', { params }),
  createInvoice: (data) => api.post('/finance/invoices', data),
  recordPayment: (id, data) => api.put(`/finance/invoices/${id}/payment`, data),
  invoicePdf: (id) => `/api/finance/invoices/${id}/pdf`,
  getStats: () => api.get('/finance/stats'),
  getPayments: () => api.get('/finance/payments'),
};

// Users
export const usersAPI = {
  list: (params) => api.get('/users', { params }),
  getEngineers: () => api.get('/users/engineers'),
  get: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  deactivate: (id) => api.delete(`/users/${id}`),
  getNotifications: () => api.get('/users/notifications/mine'),
  readNotification: (id) => api.put(`/users/notifications/${id}/read`),
  readAllNotifications: () => api.put('/users/notifications/read-all'),
};

// Backup
export const backupAPI = {
  list: () => api.get('/backup/list'),
  create: () => api.post('/backup/create'),
  exportCases: (params) => `/api/backup/export/cases?${new URLSearchParams(params)}`,
  exportFinance: () => '/api/backup/export/finance',
};

export default api;
