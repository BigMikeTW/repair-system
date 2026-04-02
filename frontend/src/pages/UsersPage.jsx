import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { usersAPI } from '../utils/api';
import { ROLE_LABELS, ROLE_BADGES, formatDateTime } from '../utils/helpers';
import toast from 'react-hot-toast';

const SPECIALTIES = ['冷氣空調','機電設備','消防設備','水電維修','電氣配線','弱電系統','電梯昇降','門禁系統','土木裝修'];

function UserModal({ user: editUser, onClose, onSuccess }) {
  const isEdit = !!editUser;
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: editUser || { role: 'engineer', is_active: true }
  });
  const role = watch('role');

  const onSubmit = async (data) => {
    try {
      if (isEdit) {
        await usersAPI.update(editUser.id, data);
        toast.success('人員資料已更新');
      } else {
        await usersAPI.create(data);
        toast.success('人員已新增，可使用指定 Email 登入');
      }
      onSuccess();
    } catch {}
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">{isEdit ? '編輯人員' : '新增人員'}</h2>
          <button className="btn btn-sm" onClick={onClose}>關閉</button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">姓名 *</label>
              <input {...register('name', { required: true })} className="form-control" />
            </div>
            <div>
              <label className="form-label">角色 *</label>
              <select {...register('role', { required: true })} className="form-select">
                <option value="admin">系統管理員</option>
                <option value="customer_service">客服人員</option>
                <option value="engineer">工程師</option>
                <option value="owner">業主</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="form-label">電子郵件 *</label>
              <input {...register('email', { required: !isEdit })} className="form-control" type="email" disabled={isEdit} />
            </div>
            <div>
              <label className="form-label">{isEdit ? '新密碼（留空不變）' : '密碼 *（至少8碼）'}</label>
              <input {...register('password', { required: !isEdit, minLength: isEdit ? 0 : 8 })}
                className="form-control" type="password" placeholder="••••••••" />
              {errors.password && <p className="text-xs text-danger mt-1">密碼至少 8 碼</p>}
            </div>
            <div>
              <label className="form-label">手機</label>
              <input {...register('phone')} className="form-control" placeholder="0912-345-678" />
            </div>
          </div>
          {role === 'engineer' && (
            <div>
              <label className="form-label">工程師專長（可複選）</label>
              <div className="grid grid-cols-2 gap-1.5 mt-1">
                {SPECIALTIES.map(s => (
                  <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" value={s} {...register('specialties')} className="rounded" />
                    {s}
                  </label>
                ))}
              </div>
            </div>
          )}
          {isEdit && (
            <div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" {...register('is_active')} className="rounded" />
                帳號啟用中
              </label>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn" onClick={onClose}>取消</button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary">
              {isSubmitting ? '儲存中...' : isEdit ? '更新' : '建立'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const { data: users } = useQuery(['users', search, roleFilter], () =>
    usersAPI.list({ search, role: roleFilter }).then(r => r.data)
  );

  const deactivate = useMutation(
    (id) => usersAPI.deactivate(id),
    { onSuccess: () => { toast.success('帳號已停用'); qc.invalidateQueries('users'); } }
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">人員管理</h1>
        <button className="btn btn-primary" onClick={() => { setEditUser(null); setShowModal(true); }}>
          <UserPlus size={14} /> 新增人員
        </button>
      </div>

      <div className="filter-bar">
        <input className="form-control w-48" placeholder="搜尋姓名或 Email..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="form-select w-auto" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="">全部角色</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="table-base">
          <thead>
            <tr><th>姓名</th><th>狀態</th><th>角色</th><th>專長</th><th>手機</th><th>電子郵件</th><th>最後登入</th></tr>
          </thead>
          <tbody>
            {users?.map(u => (
              /* #5：整列可點擊進入詳情，停用時文字灰階 */
              <tr key={u.id}
                className={`cursor-pointer hover:bg-gray-50 transition-colors ${!u.is_active ? 'opacity-40' : ''}`}
                onClick={() => navigate(`/users/${u.id}`)}>
                <td><span className="text-sm font-medium">{u.name}</span></td>
                <td onClick={e => e.stopPropagation()}>
                  {/* #5：狀態改為 Toggle Switch */}
                  <div
                    className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${u.is_active ? 'bg-success' : 'bg-gray-300'}`}
                    onClick={() => {
                      if (u.is_active) {
                        if (window.confirm(`確定停用 ${u.name} 的帳號？`)) deactivate.mutate(u.id);
                      } else {
                        usersAPI.update(u.id, { ...u, is_active: true }).then(() => qc.invalidateQueries('users'));
                      }
                    }}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${u.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                </td>
                <td><span className={`badge ${ROLE_BADGES[u.role]}`}>{ROLE_LABELS[u.role]}</span></td>
                <td className="text-xs text-gray-400 max-w-[140px]"><div className="truncate">{u.specialties?.join(', ') || '--'}</div></td>
                <td className="text-xs text-gray-500 max-w-[100px]"><div className="truncate">{u.phone || '--'}</div></td>
                <td className="text-xs text-gray-500 max-w-[160px]"><div className="truncate">{u.email}</div></td>
                <td className="text-xs text-gray-400">{formatDateTime(u.last_login)}</td>
              </tr>
            ))}
            {!users?.length && (
              <tr><td colSpan="7" className="py-12 text-center text-sm text-gray-400">沒有符合的人員</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <UserModal
          user={editUser}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); qc.invalidateQueries('users'); }}
        />
      )}
    </div>
  );
}
