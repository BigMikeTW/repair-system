import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Hammer, Eye, EyeOff } from 'lucide-react';
import { authAPI } from '../utils/api';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';

const BACKEND = 'https://repair-system-production-cf5b.up.railway.app';

export default function LoginPage() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();
  const { login } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showPwd, setShowPwd] = useState(false);

  useEffect(() => {
    const error = searchParams.get('error');
    if (error === 'line_failed') toast.error('LINE 登入失敗，請再試一次');
    if (error === 'google_failed') toast.error('Google 登入失敗，請再試一次');
    if (error === 'oauth_failed') toast.error('登入失敗，請再試一次');
  }, []);

  const onSubmit = async (data) => {
    try {
      const res = await authAPI.login(data);
      login(res.data.token, res.data.user);
      toast.success(`歡迎回來，${res.data.user.name}！`);
      navigate('/');
    } catch {}
  };

  const handleLineLogin = () => {
    window.location.href = `${BACKEND}/api/auth/line`;
  };

  const handleGoogleLogin = () => {
    window.location.href = `${BACKEND}/api/auth/google`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-light via-white to-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 bg-primary rounded-2xl items-center justify-center mb-4 shadow-lg">
            <Hammer size={26} className="text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">工程報修管理系統</h1>
          <p className="text-sm text-gray-500 mt-1">請登入您的帳號</p>
        </div>

        <div className="card p-6 space-y-4">
          {/* LINE 登入 */}
          <button
            onClick={handleLineLogin}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl font-medium text-white transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: '#06C755' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
              <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
            </svg>
            使用 LINE 帳號登入
          </button>

          {/* Google 登入 */}
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl font-medium text-gray-700 border border-gray-200 bg-white transition-all hover:bg-gray-50 active:scale-95"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            使用 Google 帳號登入
          </button>

          {/* 分隔線 */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-gray-400">或使用帳號密碼登入</span>
            </div>
          </div>

          {/* 帳號密碼表單 */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="form-label">電子郵件</label>
              <input
                {...register('email', { required: '請輸入 Email', pattern: { value: /^\S+@\S+$/, message: 'Email 格式不正確' } })}
                className="form-control" placeholder="email@example.com" type="email" autoComplete="email"
              />
              {errors.email && <p className="text-xs text-danger mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label className="form-label">密碼</label>
              <div className="relative">
                <input
                  {...register('password', { required: '請輸入密碼' })}
                  className="form-control pr-10" placeholder="••••••••"
                  type={showPwd ? 'text' : 'password'} autoComplete="current-password"
                />
                <button type="button" className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPwd(v => !v)}>
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-danger mt-1">{errors.password.message}</p>}
            </div>
            <button type="submit" disabled={isSubmitting}
              className="btn btn-primary btn-lg w-full justify-center">
              {isSubmitting ? '登入中...' : '登入'}
            </button>
          </form>

          <div className="text-center text-sm text-gray-500">
            還沒有帳號？{' '}
            <Link to="/register" className="text-primary hover:underline font-medium">立即註冊</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
