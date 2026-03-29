import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Hammer } from 'lucide-react';
import { authAPI } from '../utils/api';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm();
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const onSubmit = async (data) => {
    try {
      const res = await authAPI.register(data);
      login(res.data.token, res.data.user);
      toast.success('註冊成功！歡迎使用工程報修管理系統');
      navigate('/');
    } catch {}
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-light via-white to-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex w-12 h-12 bg-primary rounded-xl items-center justify-center mb-3">
            <Hammer size={22} className="text-white" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">業主帳號註冊</h1>
          <p className="text-sm text-gray-500 mt-1">建立您的報修申請帳號</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="form-label">姓名 *</label>
              <input {...register('name', { required: '請輸入姓名' })} className="form-control" placeholder="您的姓名" />
              {errors.name && <p className="text-xs text-danger mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <label className="form-label">電子郵件 *</label>
              <input {...register('email', { required: '請輸入 Email', pattern: { value: /^\S+@\S+$/, message: 'Email 格式不正確' } })}
                className="form-control" placeholder="email@example.com" type="email" />
              {errors.email && <p className="text-xs text-danger mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label className="form-label">手機號碼</label>
              <input {...register('phone')} className="form-control" placeholder="0912-345-678" />
            </div>
            <div>
              <label className="form-label">密碼 *（至少 8 碼）</label>
              <input {...register('password', { required: '請輸入密碼', minLength: { value: 8, message: '密碼至少 8 碼' } })}
                className="form-control" type="password" placeholder="••••••••" />
              {errors.password && <p className="text-xs text-danger mt-1">{errors.password.message}</p>}
            </div>
            <div>
              <label className="form-label">確認密碼 *</label>
              <input {...register('confirmPassword', { required: '請確認密碼', validate: v => v === watch('password') || '密碼不一致' })}
                className="form-control" type="password" placeholder="••••••••" />
              {errors.confirmPassword && <p className="text-xs text-danger mt-1">{errors.confirmPassword.message}</p>}
            </div>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary btn-lg w-full justify-center mt-2">
              {isSubmitting ? '建立中...' : '建立帳號'}
            </button>
          </form>
          <div className="mt-4 text-center text-sm text-gray-500">
            已有帳號？ <Link to="/login" className="text-primary hover:underline font-medium">立即登入</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
