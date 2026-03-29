import React from 'react';
import { useForm } from 'react-hook-form';
import { useMutation } from 'react-query';
import { authAPI } from '../utils/api';
import useAuthStore from '../store/authStore';
import { ROLE_LABELS, ROLE_BADGES, formatDateTime } from '../utils/helpers';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore();

  const { register: reg1, handleSubmit: hs1, formState: { isSubmitting: sub1 } } = useForm({
    defaultValues: { name: user?.name, phone: user?.phone }
  });
  const { register: reg2, handleSubmit: hs2, watch, formState: { isSubmitting: sub2, errors: err2 } } = useForm();

  const profileMutation = useMutation(
    (data) => authAPI.updateProfile(data),
    {
      onSuccess: (res) => { updateUser(res.data.user); toast.success('個人資料已更新'); }
    }
  );

  const pwdMutation = useMutation(
    (data) => authAPI.changePassword(data),
    { onSuccess: () => toast.success('密碼已更新') }
  );

  return (
    <div className="page-container max-w-xl mx-auto">
      <h1 className="page-title mb-5">個人設定</h1>

      {/* User info card */}
      <div className="card card-body mb-5">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-2xl bg-primary-light flex items-center justify-center text-xl font-semibold text-primary-dark">
            {user?.name?.slice(0, 2)}
          </div>
          <div>
            <div className="font-semibold text-gray-900 text-lg">{user?.name}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`badge ${ROLE_BADGES[user?.role]}`}>{ROLE_LABELS[user?.role]}</span>
              <span className="text-xs text-gray-400">{user?.email}</span>
            </div>
          </div>
        </div>

        <form onSubmit={hs1(d => profileMutation.mutate(d))} className="space-y-4">
          <h3 className="font-medium text-sm text-gray-700">基本資料</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">姓名 *</label>
              <input {...reg1('name', { required: true })} className="form-control" />
            </div>
            <div>
              <label className="form-label">手機號碼</label>
              <input {...reg1('phone')} className="form-control" placeholder="0912-345-678" />
            </div>
            <div className="col-span-2">
              <label className="form-label">電子郵件（不可修改）</label>
              <input className="form-control bg-gray-50 text-gray-400" value={user?.email} disabled />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={sub1} className="btn btn-primary">
              {sub1 ? '儲存中...' : '更新資料'}
            </button>
          </div>
        </form>
      </div>

      {/* Change password */}
      <div className="card card-body">
        <h3 className="font-medium text-sm text-gray-700 mb-4">更改密碼</h3>
        <form onSubmit={hs2(d => pwdMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="form-label">目前密碼 *</label>
            <input {...reg2('oldPassword', { required: '請輸入目前密碼' })} className="form-control" type="password" placeholder="••••••••" />
            {err2.oldPassword && <p className="text-xs text-danger mt-1">{err2.oldPassword.message}</p>}
          </div>
          <div>
            <label className="form-label">新密碼 *（至少 8 碼）</label>
            <input {...reg2('newPassword', { required: '請輸入新密碼', minLength: { value: 8, message: '至少 8 碼' } })}
              className="form-control" type="password" placeholder="••••••••" />
            {err2.newPassword && <p className="text-xs text-danger mt-1">{err2.newPassword.message}</p>}
          </div>
          <div>
            <label className="form-label">確認新密碼 *</label>
            <input {...reg2('confirmPassword', {
              required: '請確認密碼',
              validate: v => v === watch('newPassword') || '密碼不一致'
            })} className="form-control" type="password" placeholder="••••••••" />
            {err2.confirmPassword && <p className="text-xs text-danger mt-1">{err2.confirmPassword.message}</p>}
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={sub2} className="btn btn-primary">
              {sub2 ? '更新中...' : '更新密碼'}
            </button>
          </div>
        </form>
      </div>

      {user?.last_login && (
        <p className="text-xs text-gray-300 text-center mt-4">上次登入：{formatDateTime(user.last_login)}</p>
      )}
    </div>
  );
}
