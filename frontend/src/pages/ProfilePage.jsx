import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery } from 'react-query';
import { authAPI } from '../utils/api';
import api from '../utils/api';
import useAuthStore from '../store/authStore';
import { ROLE_LABELS, ROLE_BADGES, formatDateTime } from '../utils/helpers';
import { MessageCircle, CheckCircle, XCircle, Copy, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';

// ── LINE 綁定區塊 ─────────────────────────────────────────────
function LineBind({ user }) {
  const [bindCode, setBindCode] = useState(null);
  const [bindExpiry, setBindExpiry] = useState(null);
  const [isBound, setIsBound] = useState(false);
  const [checking, setChecking] = useState(false);

  // 查詢綁定狀態
  const { data: bindStatus, refetch } = useQuery(
    ['lineStatus', user?.id],
    () => api.get(`/line/status/${user?.id}`).then(r => r.data),
    { enabled: !!user?.id, onSuccess: (d) => setIsBound(d.bound) }
  );

  // 產生綁定碼
  const generateCode = async () => {
    try {
      const res = await api.post('/line/bind', { user_id: user?.id });
      setBindCode(res.data.token);
      setBindExpiry(res.data.expires_at);
      toast.success('綁定碼已產生，有效期 30 分鐘');
    } catch (e) {
      toast.error('產生綁定碼失敗');
    }
  };

  // 解除綁定
  const unbind = async () => {
    if (!window.confirm('確定要解除 LINE 綁定嗎？解除後將不再收到 LINE 推播通知。')) return;
    try {
      await api.delete(`/line/unbind/${user?.id}`);
      setIsBound(false);
      setBindCode(null);
      refetch();
      toast.success('已解除 LINE 綁定');
    } catch (e) {
      toast.error('解除失敗');
    }
  };

  const copyCode = () => {
    if (bindCode) {
      navigator.clipboard.writeText(`綁定 ${bindCode}`);
      toast.success('已複製！請到 LINE OA 貼上發送');
    }
  };

  return (
    <div className="card card-body mt-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: '#06C755' }}>
          <MessageCircle size={18} className="text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">LINE 通知綁定</h3>
          <p className="text-xs text-gray-400">綁定後可接收案件派工、狀態變更等 LINE 推播通知</p>
        </div>
        <div className="ml-auto">
          {isBound
            ? <span className="badge badge-success flex items-center gap-1"><CheckCircle size={11} /> 已綁定</span>
            : <span className="badge badge-gray flex items-center gap-1"><XCircle size={11} /> 未綁定</span>
          }
        </div>
      </div>

      {isBound ? (
        /* 已綁定狀態 */
        <div>
          <div className="bg-green-50 rounded-xl p-4 mb-4 flex items-center gap-3">
            <CheckCircle size={20} className="text-green-500 flex-shrink-0" />
            <div>
              <div className="text-sm font-medium text-green-800">LINE 帳號已成功綁定</div>
              <div className="text-xs text-green-600 mt-0.5">您將透過 LINE 接收所有案件通知</div>
            </div>
          </div>
          <button onClick={unbind} className="btn btn-sm text-danger border-red-200 hover:bg-red-50">
            解除 LINE 綁定
          </button>
        </div>
      ) : (
        /* 未綁定狀態 */
        <div>
          {!bindCode ? (
            /* 尚未產生綁定碼 */
            <div>
              <div className="bg-gray-50 rounded-xl p-4 mb-4">
                <div className="text-sm font-medium text-gray-700 mb-2">綁定步驟：</div>
                <div className="space-y-1.5">
                  {[
                    '先加入 LINE OA 好友（掃描下方 QR Code 或點連結）',
                    '點選「產生綁定碼」按鈕',
                    '將綁定碼複製後，到 LINE OA 發送',
                    '收到綁定成功確認訊息即完成',
                  ].map((step, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-gray-600">
                      <span className="w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      {step}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={generateCode}
                  className="btn btn-primary btn-sm"
                  style={{ background: '#06C755', borderColor: '#06C755' }}
                >
                  產生綁定碼
                </button>
                <a
                  href={`https://line.me/R/ti/p/@${import.meta.env.VITE_LINE_OA_ID || 'your-oa'}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm gap-1"
                >
                  <ExternalLink size={12} /> 加入 LINE OA
                </a>
              </div>
            </div>
          ) : (
            /* 已產生綁定碼 */
            <div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                <div className="text-xs text-green-700 mb-2 font-medium">✅ 綁定碼已產生（30 分鐘內有效）</div>
                <div className="text-sm text-green-600 mb-3">
                  請到 LINE OA，發送以下訊息：
                </div>
                <div className="bg-white rounded-lg px-4 py-3 border border-green-200 flex items-center justify-between">
                  <span className="font-mono text-lg font-bold text-gray-900 tracking-widest">
                    綁定 {bindCode}
                  </span>
                  <button onClick={copyCode} className="btn btn-sm gap-1 flex-shrink-0">
                    <Copy size={12} /> 複製
                  </button>
                </div>
                <div className="text-xs text-green-600 mt-2">
                  有效期限：{bindExpiry ? new Date(bindExpiry).toLocaleTimeString('zh-TW') : '--'}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={generateCode} className="btn btn-sm">重新產生</button>
                <button
                  onClick={() => { setBindCode(null); refetch(); }}
                  className="btn btn-sm"
                >
                  檢查綁定狀態
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 主頁面 ────────────────────────────────────────────────────
export default function ProfilePage() {
  const { user, updateUser } = useAuthStore();

  const { register: reg1, handleSubmit: hs1, formState: { isSubmitting: sub1 } } = useForm({
    defaultValues: { name: user?.name, phone: user?.phone }
  });
  const { register: reg2, handleSubmit: hs2, watch, formState: { isSubmitting: sub2, errors: err2 } } = useForm();

  const profileMutation = useMutation(
    (data) => authAPI.updateProfile(data),
    { onSuccess: (res) => { updateUser(res.data.user); toast.success('個人資料已更新'); } }
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

      {/* LINE 綁定 */}
      <LineBind user={user} />

      {/* Change password */}
      <div className="card card-body mt-5">
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
