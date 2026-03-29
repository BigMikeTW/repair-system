import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Hammer, Eye, EyeOff } from 'lucide-react';
import { authAPI } from '../utils/api';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();
  const { login } = useAuthStore();
  const navigate = useNavigate();
  const [showPwd, setShowPwd] = useState(false);

  const onSubmit = async (data) => {
    try {
      const res = await authAPI.login(data);
      login(res.data.token, res.data.user);
      toast.success(`歡迎回來，${res.data.user.name}！`);
      navigate('/');
    } catch (err) {
      // error handled by interceptor
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-light via-white to-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 bg-primary rounded-2xl items-center justify-center mb-4 shadow-lg">
            <Hammer size={26} className="text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">工程報修管理系統</h1>
          <p className="text-sm text-gray-500 mt-1">請登入您的帳號</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="form-label">電子郵件</label>
              <input
                {...register('email', { required: '請輸入 Email', pattern: { value: /^\S+@\S+$/, message: 'Email 格式不正確' } })}
                className="form-control"
                placeholder="email@example.com"
                type="email"
                autoComplete="email"
              />
              {errors.email && <p className="text-xs text-danger mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="form-label">密碼</label>
              <div className="relative">
                <input
                  {...register('password', { required: '請輸入密碼' })}
                  className="form-control pr-10"
                  placeholder="••••••••"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                />
                <button type="button" className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600" onClick={() => setShowPwd(v => !v)}>
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-danger mt-1">{errors.password.message}</p>}
            </div>

            <button type="submit" disabled={isSubmitting} className="btn btn-primary btn-lg w-full justify-center mt-2">
              {isSubmitting ? '登入中...' : '登入'}
            </button>
          </form>

          <div className="mt-4 text-center text-sm text-gray-500">
            還沒有帳號？{' '}
            <Link to="/register" className="text-primary hover:underline font-medium">立即註冊</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
