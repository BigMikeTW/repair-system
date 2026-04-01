import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import api from '../utils/api';

export default function OAuthCallbackPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const redirect = params.get('redirect') || '/';

    if (!token) {
      navigate('/login?error=oauth_failed');
      return;
    }

    // 用 token 取得用戶資料
    api.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        login(token, res.data.user);
        navigate(decodeURIComponent(redirect), { replace: true });
      })
      .catch(() => navigate('/login?error=oauth_failed'));
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-light via-white to-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500 text-sm">登入中，請稍候...</p>
      </div>
    </div>
  );
}
