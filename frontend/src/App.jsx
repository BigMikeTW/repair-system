import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import CasesPage from './pages/CasesPage';
import CaseDetailPage from './pages/CaseDetailPage';
import NewCasePage from './pages/NewCasePage';
import DispatchPage from './pages/DispatchPage';
import FieldPage from './pages/FieldPage';
import ChatPage from './pages/ChatPage';
import SignPage from './pages/SignPage';
import FinancePage from './pages/FinancePage';
import PaymentPage from './pages/PaymentPage';
import UsersPage from './pages/UsersPage';
import UserDetailPage from './pages/UserDetailPage';
import BackupPage from './pages/BackupPage';
import ProfilePage from './pages/ProfilePage';
import CaseTypesPage from './pages/CaseTypesPage';

const PrivateRoute = ({ children, roles }) => {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user?.role)) return <Navigate to="/" replace />;
  return children;
};

export default function App() {
  const { isAuthenticated } = useAuthStore();

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/register" element={isAuthenticated ? <Navigate to="/" replace /> : <RegisterPage />} />

      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="cases" element={<CasesPage />} />
        <Route path="cases/new" element={<PrivateRoute roles={['admin','customer_service','owner']}><NewCasePage /></PrivateRoute>} />
        <Route path="cases/:id" element={<CaseDetailPage />} />
        <Route path="cases/:id/sign" element={<SignPage />} />
        <Route path="dispatch" element={<PrivateRoute roles={['admin','customer_service']}><DispatchPage /></PrivateRoute>} />
        <Route path="field" element={<PrivateRoute roles={['engineer']}><FieldPage /></PrivateRoute>} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="chat/:caseId" element={<ChatPage />} />
        <Route path="finance" element={<PrivateRoute roles={['admin','customer_service']}><FinancePage /></PrivateRoute>} />
        <Route path="payments" element={<PrivateRoute roles={['admin','customer_service']}><PaymentPage /></PrivateRoute>} />
        <Route path="users" element={<PrivateRoute roles={['admin']}><UsersPage /></PrivateRoute>} />
        <Route path="users/:id" element={<PrivateRoute roles={['admin','customer_service']}><UserDetailPage /></PrivateRoute>} />
        <Route path="case-types" element={<PrivateRoute roles={['admin','customer_service']}><CaseTypesPage /></PrivateRoute>} />
        <Route path="backup" element={<PrivateRoute roles={['admin']}><BackupPage /></PrivateRoute>} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
