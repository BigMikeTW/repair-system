import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore';
import Layout from './components/Layout';

const LoginPage         = lazy(() => import('./pages/LoginPage'));
const RegisterPage      = lazy(() => import('./pages/RegisterPage'));
const OAuthCallbackPage = lazy(() => import('./pages/OAuthCallbackPage'));
const DashboardPage     = lazy(() => import('./pages/DashboardPage'));
const CasesPage         = lazy(() => import('./pages/CasesPage'));
const NewCasePage       = lazy(() => import('./pages/NewCasePage'));
const CaseDetailPage    = lazy(() => import('./pages/CaseDetailPage'));
const SignPage          = lazy(() => import('./pages/SignPage'));
const DispatchPage      = lazy(() => import('./pages/DispatchPage'));
const FieldPage         = lazy(() => import('./pages/FieldPage'));
const FieldQuotePage    = lazy(() => import('./pages/FieldQuotePage'));
const ChatPage          = lazy(() => import('./pages/ChatPage'));
const CaseChatPage      = lazy(() => import('./pages/CaseChatPage'));
const FinancePage       = lazy(() => import('./pages/FinancePage'));
const PaymentPage       = lazy(() => import('./pages/PaymentPage'));
const UsersPage         = lazy(() => import('./pages/UsersPage'));
const UserDetailPage    = lazy(() => import('./pages/UserDetailPage'));
const CaseTypesPage     = lazy(() => import('./pages/CaseTypesPage'));
const PermissionsPage   = lazy(() => import('./pages/PermissionsPage'));
const SystemSettingsPage= lazy(() => import('./pages/SystemSettingsPage'));
const BackupPage        = lazy(() => import('./pages/BackupPage'));
const ProfilePage       = lazy(() => import('./pages/ProfilePage'));
const InitPage          = lazy(() => import('./pages/InitPage'));
const PublicReportPage  = lazy(() => import('./pages/PublicReportPage'));
const LiffReportPage    = lazy(() => import('./pages/LiffReportPage'));
const PublicTrackPage   = lazy(() => import('./pages/PublicTrackPage'));

const PrivateRoute = ({ children, roles }) => {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user?.role)) return <Navigate to="/" replace />;
  return children;
};

const Loader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

export default function App() {
  const { isAuthenticated } = useAuthStore();

  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        {/* 公開頁面 */}
        <Route path="/login"          element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/register"       element={isAuthenticated ? <Navigate to="/" replace /> : <RegisterPage />} />
        <Route path="/oauth-callback" element={<OAuthCallbackPage />} />
        <Route path="/public/report"  element={<PublicReportPage />} />
        <Route path="/liff-report"    element={<LiffReportPage />} />
        <Route path="/track"          element={<PublicTrackPage />} />
        <Route path="/track/:caseNumber" element={<PublicTrackPage />} />

        {/* 私有頁面 */}
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="cases" element={<CasesPage />} />
          <Route path="cases/new" element={<PrivateRoute roles={['admin','customer_service','owner']}><NewCasePage /></PrivateRoute>} />
          <Route path="cases/:id" element={<CaseDetailPage />} />
          <Route path="cases/:id/sign" element={<SignPage />} />
          <Route path="dispatch" element={<PrivateRoute roles={['admin','customer_service']}><DispatchPage /></PrivateRoute>} />
          <Route path="field" element={<PrivateRoute roles={['engineer']}><FieldPage /></PrivateRoute>} />
          <Route path="field-quote" element={<PrivateRoute roles={['engineer']}><FieldQuotePage /></PrivateRoute>} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="chat/:caseId" element={<ChatPage />} />
          <Route path="case-chat" element={<CaseChatPage />} />
          <Route path="case-chat/:caseId" element={<CaseChatPage />} />
          <Route path="finance" element={<PrivateRoute roles={['admin','customer_service']}><FinancePage /></PrivateRoute>} />
          <Route path="payments" element={<PrivateRoute roles={['admin','customer_service']}><PaymentPage /></PrivateRoute>} />
          <Route path="users" element={<PrivateRoute roles={['admin']}><UsersPage /></PrivateRoute>} />
          <Route path="users/:id" element={<PrivateRoute roles={['admin','customer_service']}><UserDetailPage /></PrivateRoute>} />
          <Route path="case-types" element={<PrivateRoute roles={['admin','customer_service']}><CaseTypesPage /></PrivateRoute>} />
          <Route path="permissions" element={<PrivateRoute roles={['admin']}><PermissionsPage /></PrivateRoute>} />
          <Route path="settings" element={<PrivateRoute roles={['admin']}><SystemSettingsPage /></PrivateRoute>} />
          <Route path="backup" element={<PrivateRoute roles={['admin']}><BackupPage /></PrivateRoute>} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="init" element={<PrivateRoute roles={['admin']}><InitPage /></PrivateRoute>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
