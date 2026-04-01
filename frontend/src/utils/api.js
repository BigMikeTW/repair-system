import axios from 'axios';
import toast from 'react-hot-toast';

const BACKEND_URL = 'https://repair-system-production-cf5b.up.railway.app';

const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  timeout: 60000,
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
      if (window.location.pathname !== '/login') window.location.href = '/login';
      return Promise.reject(error);
    }
    if (error.response?.status !== 404) toast.error(msg);
    return Promise.reject(error);
  }
);

export const BACKEND = BACKEND_URL;

export const fullUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${BACKEND_URL}${url}`;
};

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
  // Notes
  getNotes: (caseId) => api.get(`/case-notes/${caseId}`),
  addNote: (caseId, data) => api.post(`/case-notes/${caseId}`, data),
  updateNote: (caseId, noteId, data) => api.put(`/case-notes/${caseId}/${noteId}`, data),
  deleteNote: (caseId, noteId) => api.delete(`/case-notes/${caseId}/${noteId}`),
  list: (params) => api.get('/cases', { params }),
  get: (id) => api.get(`/cases/${id}`),
  create: (data) => api.post('/cases', data),
  update: (id, data) => api.put(`/cases/${id}`, data),
  delete: (id) => api.delete(`/cases/${id}`),
  updateStatus: (id, data) => api.put(`/cases/${id}/status`, data),
  assign: (id, data) => api.put(`/cases/${id}/assign`, data),
  cancelDispatch: (id, data) => api.put(`/cases/${id}/cancel-dispatch`, data),
  reassign: (id, data) => api.put(`/cases/${id}/reassign`, data),
  checkin: (id, data) => api.post(`/cases/${id}/checkin`, data),
  sign: (id, data) => api.post(`/cases/${id}/sign`, data),
  getActivities: (id) => api.get(`/cases/${id}/activities`),
  getStats: () => api.get('/cases/stats'),
};

// Photos
export const photosAPI = {
  upload: (caseId, formData, onProgress) => api.post(`/photos/${caseId}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total));
    }
  }),
  list: (caseId) => api.get(`/photos/${caseId}`),
  delete: (id) => api.delete(`/photos/${id}`),
};

// Case Notes
export const caseNotesAPI = {
  list: (caseId) => api.get(`/case-notes/${caseId}`),
  create: (caseId, formData) => api.post(`/case-notes/${caseId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  update: (caseId, noteId, data) => api.put(`/case-notes/${caseId}/${noteId}`, data),
  delete: (caseId, noteId) => api.delete(`/case-notes/${caseId}/${noteId}`),
  deletePhoto: (caseId, photoId) => api.delete(`/case-notes/${caseId}/photo/${photoId}`),
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
  // ── 報價單 ──────────────────────────────────────────────────
  getQuotations: (params) => api.get('/finance/quotations', { params }),
  getQuotation: (id) => api.get(`/finance/quotations/${id}`),
  createQuotation: (data) => api.post('/finance/quotations', data),
  updateQuotation: (id, data) => api.put(`/finance/quotations/${id}`, data),
  deleteQuotation: (id) => api.delete(`/finance/quotations/${id}`),
  updateQuotationStatus: (id, data) => api.put(`/finance/quotations/${id}/status`, data),
  quotationPdf: (id) => `${BACKEND_URL}/api/finance/quotations/${id}/pdf?token=${localStorage.getItem('token')}`,
  // ── 請款單 ──────────────────────────────────────────────────
  getInvoices: (params) => api.get('/finance/invoices', { params }),
  createInvoice: (data) => api.post('/finance/invoices', data),
  updateInvoice: (id, data) => api.put(`/finance/invoices/${id}`, data),
  deleteInvoice: (id) => api.delete(`/finance/invoices/${id}`),
  recordPayment: (id, data) => api.put(`/finance/invoices/${id}/payment`, data),
  invoicePdf: (id) => `${BACKEND_URL}/api/finance/invoices/${id}/pdf?token=${localStorage.getItem('token')}`,
  getStats: () => api.get('/finance/stats'),
  getPayments: () => api.get('/finance/payments'),
  // 結案單
  getClosures: (params) => api.get('/finance/closures', { params }),
  createClosure: (data) => api.post('/finance/closures', data),
  updateClosure: (id, data) => api.put(`/finance/closures/${id}`, data),
  cancelClosure: (id, data) => api.put(`/finance/closures/${id}/cancel`, data),
  closurePdf: (id) => `${BACKEND_URL}/api/finance/closures/${id}/pdf?token=${localStorage.getItem('token')}`,
  closurePdfByCase: (caseId) => `${BACKEND_URL}/api/finance/closures/by-case/${caseId}/pdf?token=${localStorage.getItem('token')}`,
  // 收款單
  getReceipts: () => api.get('/finance/receipts'),
  createReceipt: (data) => api.post('/finance/receipts', data),
  receiptPdf: (id) => `${BACKEND_URL}/api/finance/receipts/${id}/pdf?token=${localStorage.getItem('token')}`,
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

// HR
export const hrAPI = {
  get: (id) => api.get(`/hr/${id}`),
  updateProfile: (id, data) => api.put(`/hr/${id}/profile`, data),
  uploadIdCard: (id, fd) => api.post(`/hr/${id}/id-card`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  addLicense: (id, fd) => api.post(`/hr/${id}/licenses`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  updateLicense: (uid, lid, fd) => api.put(`/hr/${uid}/licenses/${lid}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteLicense: (uid, lid) => api.delete(`/hr/${uid}/licenses/${lid}`),
  addInsurance: (id, fd) => api.post(`/hr/${id}/insurance`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  updateInsurance: (uid, iid, fd) => api.put(`/hr/${uid}/insurance/${iid}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteInsurance: (uid, iid) => api.delete(`/hr/${uid}/insurance/${iid}`),
};

// Case Types
export const caseTypesAPI = {
  list: () => api.get('/case-types'),
  create: (data) => api.post('/case-types', data),
  update: (id, data) => api.put(`/case-types/${id}`, data),
  delete: (id) => api.delete(`/case-types/${id}`),
};

// Backup
export const backupAPI = {
  list: () => api.get('/backup/list'),
  create: () => api.post('/backup/create'),
  exportCases: (params) => `${BACKEND_URL}/api/backup/export/cases?${new URLSearchParams(params)}`,
  exportFinance: () => `${BACKEND_URL}/api/backup/export/finance`,
};

export default api;
