import React, { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useForm } from 'react-hook-form';
import {
  ArrowLeft, Upload, Plus, Edit2, Trash2, FileText,
  User, Shield, Calendar, Phone, Briefcase, AlertTriangle, Clock,
  MessageCircle, CheckCircle, XCircle, Copy, ExternalLink
} from 'lucide-react';
import api from '../utils/api';
import { ROLE_LABELS, ROLE_BADGES, formatDate } from '../utils/helpers';
import toast from 'react-hot-toast';

// ── API ──────────────────────────────────────────────────────
const hrAPI = {
  get: (id) => api.get(`/hr/${id}`),
  updateProfile: (id, data) => api.put(`/hr/${id}/profile`, data),
  uploadIdCard: (id, file) => {
    const fd = new FormData();
    fd.append('id_card', file);
    return api.post(`/hr/${id}/id-card`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  addLicense: (userId, fd) =>
    api.post(`/hr/${userId}/licenses`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  updateLicense: (userId, lid, fd) =>
    api.put(`/hr/${userId}/licenses/${lid}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteLicense: (userId, lid) => api.delete(`/hr/${userId}/licenses/${lid}`),
  addInsurance: (userId, fd) =>
    api.post(`/hr/${userId}/insurance`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  updateInsurance: (userId, iid, fd) =>
    api.put(`/hr/${userId}/insurance/${iid}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteInsurance: (userId, iid) => api.delete(`/hr/${userId}/insurance/${iid}`),
};

// ── Helper: days until expiry ────────────────────────────────
const daysUntil = (date) => {
  if (!date) return null;
  return Math.ceil((new Date(date) - new Date()) / (1000 * 60 * 60 * 24));
};

// ── FileUploadButton ─────────────────────────────────────────
function FileUploadBtn({ label, accept = 'image/*,application/pdf', onFileChange, currentUrl, fileName }) {
  const ref = useRef();
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button type="button" className="btn btn-sm gap-1.5" onClick={() => ref.current.click()}>
        <Upload size={12} /> {label}
      </button>
      <input ref={ref} type="file" className="hidden" accept={accept}
        onChange={e => { if (e.target.files[0]) onFileChange(e.target.files[0]); }} />
      {currentUrl && (
        <a href={currentUrl} target="_blank" rel="noopener noreferrer"
          className="text-xs text-primary hover:underline flex items-center gap-1">
          <FileText size={12} /> {fileName || '查看已上傳檔案'}
        </a>
      )}
    </div>
  );
}

// ── LicenseModal ─────────────────────────────────────────────
function LicenseModal({ userId, license, onClose, onSuccess }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: license
      ? { ...license, issue_date: license.issue_date?.slice(0,10), expiry_date: license.expiry_date?.slice(0,10) }
      : {}
  });
  const [file, setFile] = useState(null);

  const onSubmit = async (data) => {
    const fd = new FormData();
    Object.entries(data).forEach(([k, v]) => { if (v !== undefined && v !== '') fd.append(k, v); });
    if (file) fd.append('license_file', file);
    try {
      if (license) {
        await hrAPI.updateLicense(userId, license.id, fd);
        toast.success('證照已更新');
      } else {
        await hrAPI.addLicense(userId, fd);
        toast.success('證照已新增');
      }
      onSuccess();
    } catch {}
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">{license ? '編輯證照' : '新增證照'}</h2>
          <button className="btn btn-sm" onClick={onClose}>關閉</button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div>
            <label className="form-label">證照名稱 *</label>
            <input {...register('license_name', { required: '證照名稱必填' })} className="form-control"
              placeholder="例：乙級水電技術士、消防安全管理人" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">證照字號</label>
              <input {...register('license_number')} className="form-control" placeholder="證照編號" />
            </div>
            <div>
              <label className="form-label">發證機關</label>
              <input {...register('issued_by')} className="form-control" placeholder="勞動部、消防署..." />
            </div>
            <div>
              <label className="form-label">發證日期</label>
              <input {...register('issue_date')} type="date" className="form-control" />
            </div>
            <div>
              <label className="form-label">到期日期</label>
              <input {...register('expiry_date')} type="date" className="form-control" />
            </div>
          </div>
          <div>
            <label className="form-label">備注</label>
            <textarea {...register('notes')} className="form-textarea" rows={2}
              placeholder="其他備注..." />
          </div>
          <div>
            <label className="form-label">證照影像（JPG/PNG/PDF）</label>
            <div className="mt-1">
              <FileUploadBtn
                label="選擇證照檔案"
                accept="image/*,application/pdf"
                onFileChange={setFile}
                currentUrl={license?.file_url}
                fileName={license?.file_name}
              />
              {file && <p className="text-xs text-success mt-1.5">✓ 已選擇：{file.name}</p>}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn" onClick={onClose}>取消</button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary">
              {isSubmitting ? '儲存中...' : '儲存證照'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── InsuranceModal ───────────────────────────────────────────
function InsuranceModal({ userId, record, onClose, onSuccess }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: record
      ? { ...record, enroll_date: record.enroll_date?.slice(0,10), terminate_date: record.terminate_date?.slice(0,10) }
      : { insurance_type: 'both', status: 'active' }
  });
  const [file, setFile] = useState(null);

  const onSubmit = async (data) => {
    const fd = new FormData();
    Object.entries(data).forEach(([k, v]) => { if (v !== undefined && v !== '') fd.append(k, v); });
    if (file) fd.append('proof_file', file);
    try {
      if (record) {
        await hrAPI.updateInsurance(userId, record.id, fd);
        toast.success('保險記錄已更新');
      } else {
        await hrAPI.addInsurance(userId, fd);
        toast.success('保險記錄已新增');
      }
      onSuccess();
    } catch {}
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">{record ? '編輯保險記錄' : '新增保險記錄'}</h2>
          <button className="btn btn-sm" onClick={onClose}>關閉</button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">保險類型 *</label>
              <select {...register('insurance_type', { required: true })} className="form-select">
                <option value="both">勞保 + 健保</option>
                <option value="labor">勞保</option>
                <option value="health">健保</option>
              </select>
            </div>
            <div>
              <label className="form-label">投保狀態 *</label>
              <select {...register('status')} className="form-select">
                <option value="active">投保中</option>
                <option value="suspended">暫停投保</option>
                <option value="terminated">已退保</option>
              </select>
            </div>
            <div>
              <label className="form-label">投保日期</label>
              <input {...register('enroll_date')} type="date" className="form-control" />
            </div>
            <div>
              <label className="form-label">退保日期</label>
              <input {...register('terminate_date')} type="date" className="form-control" />
            </div>
            <div>
              <label className="form-label">投保薪資（月薪）</label>
              <input {...register('insured_salary')} type="number" className="form-control" placeholder="45000" />
            </div>
            <div>
              <label className="form-label">投保單位</label>
              <input {...register('insurer_name')} className="form-control" placeholder="公司名稱" />
            </div>
          </div>
          <div>
            <label className="form-label">備注</label>
            <textarea {...register('notes')} className="form-textarea" rows={2} />
          </div>
          <div>
            <label className="form-label">投保證明上傳（JPG/PNG/PDF）</label>
            <div className="mt-1">
              <FileUploadBtn
                label="選擇證明檔案"
                onFileChange={setFile}
                currentUrl={record?.proof_url}
                fileName={record?.proof_file_name}
              />
              {file && <p className="text-xs text-success mt-1.5">✓ 已選擇：{file.name}</p>}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn" onClick={onClose}>取消</button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary">
              {isSubmitting ? '儲存中...' : '儲存記錄'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

// ── LINE 綁定管理（管理員用）────────────────────────────────
function LineBindAdmin({ userId, userName }) {
  const [bindCode, setBindCode] = React.useState(null);
  const [bindExpiry, setBindExpiry] = React.useState(null);
  const { data: bindStatus, refetch } = useQuery(
    ['lineStatus', userId],
    () => api.get(`/line/status/${userId}`).then(r => r.data),
    { enabled: !!userId }
  );

  const generateCode = async () => {
    try {
      const res = await api.post('/line/bind', { user_id: userId });
      setBindCode(res.data.token);
      setBindExpiry(res.data.expires_at);
      toast.success('綁定碼已產生');
    } catch { toast.error('產生失敗'); }
  };

  const unbind = async () => {
    if (!window.confirm(`確定解除 ${userName} 的 LINE 綁定？`)) return;
    try {
      await api.delete(`/line/unbind/${userId}`);
      setBindCode(null);
      refetch();
      toast.success('已解除 LINE 綁定');
    } catch { toast.error('解除失敗'); }
  };

  const copyCode = () => {
    if (bindCode) {
      navigator.clipboard.writeText(`綁定 ${bindCode}`);
      toast.success('已複製！請告知用戶到 LINE OA 發送');
    }
  };

  const isBound = bindStatus?.bound;

  return (
    <div className="card card-body mt-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#06C755' }}>
          <MessageCircle size={18} className="text-white" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">LINE 通知綁定</h3>
          <p className="text-xs text-gray-400">管理員可代為產生綁定碼，由用戶在 LINE OA 輸入完成綁定</p>
        </div>
        <div>
          {isBound
            ? <span className="badge badge-success flex items-center gap-1"><CheckCircle size={11} /> 已綁定</span>
            : <span className="badge badge-gray flex items-center gap-1"><XCircle size={11} /> 未綁定</span>}
        </div>
      </div>

      {isBound ? (
        <div className="flex items-center justify-between bg-green-50 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-green-500" />
            <span className="text-sm text-green-800">{userName} 的 LINE 帳號已綁定，可接收推播通知</span>
          </div>
          <button onClick={unbind} className="btn btn-sm text-danger border-red-200 hover:bg-red-50 text-xs">
            解除綁定
          </button>
        </div>
      ) : (
        <div>
          {!bindCode ? (
            <div className="flex items-center gap-3">
              <button onClick={generateCode} className="btn btn-sm gap-1"
                style={{ background: '#06C755', borderColor: '#06C755', color: 'white' }}>
                <MessageCircle size={12} /> 產生綁定碼
              </button>
              <span className="text-xs text-gray-400">產生後提供給 {userName}，讓他在 LINE OA 輸入完成綁定</span>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="text-xs text-green-700 font-medium mb-2">
                ✅ 綁定碼已產生（有效至 {bindExpiry ? new Date(bindExpiry).toLocaleTimeString('zh-TW') : '--'}）
              </div>
              <div className="text-xs text-green-600 mb-3">
                請告知 {userName} 在 LINE OA 輸入以下訊息：
              </div>
              <div className="bg-white rounded-lg px-4 py-3 border border-green-200 flex items-center justify-between mb-3">
                <span className="font-mono text-lg font-bold text-gray-900 tracking-widest">
                  綁定 {bindCode}
                </span>
                <button onClick={copyCode} className="btn btn-sm gap-1">
                  <Copy size={12} /> 複製
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={generateCode} className="btn btn-sm">重新產生</button>
                <button onClick={() => { setBindCode(null); refetch(); }} className="btn btn-sm">
                  重新檢查狀態
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function UserDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState('basic');
  const [licenseModal, setLicenseModal] = useState(null);
  const [insuranceModal, setInsuranceModal] = useState(null);

  const { data, isLoading } = useQuery(
    ['hrUser', id],
    () => hrAPI.get(id).then(r => r.data),
    { retry: 1 }
  );

  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    values: data ? {
      id_number: data.id_number || '',
      birth_date: data.birth_date ? data.birth_date.slice(0,10) : '',
      address: data.address || '',
      emergency_contact: data.emergency_contact || '',
      emergency_phone: data.emergency_phone || '',
      hire_date: data.hire_date ? data.hire_date.slice(0,10) : '',
      department: data.department || '',
    } : {}
  });

  const updateProfile = useMutation(
    (d) => hrAPI.updateProfile(id, d),
    { onSuccess: () => { toast.success('基本資料已儲存'); qc.invalidateQueries(['hrUser', id]); } }
  );

  const uploadIdCard = async (file) => {
    try {
      await hrAPI.uploadIdCard(id, file);
      toast.success('身分證影本已上傳');
      qc.invalidateQueries(['hrUser', id]);
    } catch {}
  };

  const deleteLicense = useMutation(
    (lid) => hrAPI.deleteLicense(id, lid),
    { onSuccess: () => { toast.success('證照已刪除'); qc.invalidateQueries(['hrUser', id]); } }
  );

  const deleteInsurance = useMutation(
    (iid) => hrAPI.deleteInsurance(id, iid),
    { onSuccess: () => { toast.success('記錄已刪除'); qc.invalidateQueries(['hrUser', id]); } }
  );

  const INS_STATUS_BADGE = { active: 'badge-success', suspended: 'badge-warning', terminated: 'badge-gray' };
  const INS_STATUS_LABEL = { active: '投保中', suspended: '暫停', terminated: '已退保' };
  const INS_TYPE_LABEL = { both: '勞保 + 健保', labor: '勞保', health: '健保' };

  if (isLoading) return (
    <div className="page-container">
      <div className="flex items-center justify-center py-20 text-sm text-gray-400">載入中...</div>
    </div>
  );

  if (!data) return (
    <div className="page-container">
      <div className="flex items-center justify-center py-20 text-sm text-danger">找不到此人員資料</div>
    </div>
  );

  const expiredLicenses = data.licenses?.filter(l => l.expiry_date && daysUntil(l.expiry_date) !== null && daysUntil(l.expiry_date) <= 0) || [];
  const expiringSoon = data.licenses?.filter(l => { const d = daysUntil(l.expiry_date); return d !== null && d > 0 && d <= 90; }) || [];

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/users')} className="btn btn-sm">
          <ArrowLeft size={13} /> 返回列表
        </button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-primary-light flex items-center justify-center text-base font-semibold text-primary-dark flex-shrink-0">
            {data.name?.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-semibold text-gray-900">{data.name}</h1>
              <span className={`badge ${ROLE_BADGES[data.role]}`}>{ROLE_LABELS[data.role]}</span>
              <span className={`badge ${data.is_active ? 'badge-success' : 'badge-gray'}`}>
                {data.is_active ? '在職' : '停用'}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{data.email}
              {data.department && <span className="ml-2">· {data.department}</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Warnings */}
      {(expiredLicenses.length > 0 || expiringSoon.length > 0) && (
        <div className="space-y-2 mb-5">
          {expiredLicenses.map(l => (
            <div key={l.id} className="flex items-center gap-2 px-4 py-2.5 bg-danger-light border border-danger/20 rounded-xl text-sm text-danger">
              <AlertTriangle size={15} className="flex-shrink-0" />
              <span>證照「{l.license_name}」已於 {formatDate(l.expiry_date)} 到期，請盡快更新</span>
            </div>
          ))}
          {expiringSoon.map(l => (
            <div key={l.id} className="flex items-center gap-2 px-4 py-2.5 bg-warning-light border border-warning/20 rounded-xl text-sm text-warning">
              <Clock size={15} className="flex-shrink-0" />
              <span>證照「{l.license_name}」將於 {formatDate(l.expiry_date)} 到期（剩 {daysUntil(l.expiry_date)} 天）</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 mb-5 border-b border-gray-100">
        {[
          { key: 'basic', label: '基本資料', icon: User },
          { key: 'licenses', label: `證照管理 (${data.licenses?.length || 0})`, icon: Shield },
          { key: 'insurance', label: `勞健保記錄 (${data.insurance?.length || 0})`, icon: Briefcase },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors ${tab === t.key ? 'border-primary text-primary font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 基本資料 ── */}
      {tab === 'basic' && (
        <form onSubmit={handleSubmit(d => updateProfile.mutate(d))}>
          <div className="grid md:grid-cols-2 gap-5">
            <div className="card card-body space-y-4">
              <h3 className="font-medium text-sm text-gray-700 flex items-center gap-2">
                <User size={14} className="text-gray-400" /> 個人資料
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">身分證字號</label>
                  <input {...register('id_number')} className="form-control" placeholder="A123456789" maxLength={10} />
                </div>
                <div>
                  <label className="form-label">出生日期</label>
                  <input {...register('birth_date')} type="date" className="form-control" />
                </div>
              </div>
              <div>
                <label className="form-label">戶籍/通訊地址</label>
                <input {...register('address')} className="form-control" placeholder="完整地址" />
              </div>
              <div>
                <label className="form-label">身分證影本</label>
                <FileUploadBtn
                  label="上傳身分證正面"
                  accept="image/*,application/pdf"
                  onFileChange={uploadIdCard}
                  currentUrl={data.id_card_url}
                  fileName="查看身分證影本"
                />
                <p className="text-[10px] text-gray-400 mt-1">支援 JPG、PNG、PDF，最大 10MB</p>
              </div>
            </div>

            <div className="card card-body space-y-4">
              <h3 className="font-medium text-sm text-gray-700 flex items-center gap-2">
                <Briefcase size={14} className="text-gray-400" /> 職務資料
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">部門</label>
                  <input {...register('department')} className="form-control" placeholder="工程部" />
                </div>
                <div>
                  <label className="form-label">到職日期</label>
                  <input {...register('hire_date')} type="date" className="form-control" />
                </div>
              </div>

              <h3 className="font-medium text-sm text-gray-700 flex items-center gap-2 pt-2 border-t border-gray-100">
                <Phone size={14} className="text-gray-400" /> 緊急聯絡人
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">聯絡人姓名</label>
                  <input {...register('emergency_contact')} className="form-control" placeholder="姓名" />
                </div>
                <div>
                  <label className="form-label">聯絡電話</label>
                  <input {...register('emergency_phone')} className="form-control" placeholder="0912-345-678" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-5">
            <button type="submit" disabled={isSubmitting} className="btn btn-primary btn-lg">
              {isSubmitting ? '儲存中...' : '儲存基本資料'}
            </button>
          </div>
        </form>
      )}

      {/* ── 證照管理 ── */}
      {tab === 'licenses' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-gray-400">管理此人員所持有的專業證照，可上傳證照影像</p>
            <button className="btn btn-primary" onClick={() => setLicenseModal('new')}>
              <Plus size={14} /> 新增證照
            </button>
          </div>

          {!data.licenses?.length ? (
            <div className="card card-body text-center py-16">
              <Shield size={32} className="text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">尚未新增任何證照</p>
              <button className="btn btn-sm mt-3 mx-auto" onClick={() => setLicenseModal('new')}>+ 新增第一張證照</button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {data.licenses.map(lic => {
                const days = daysUntil(lic.expiry_date);
                const isExpired = days !== null && days <= 0;
                const isSoon = days !== null && days > 0 && days <= 90;
                return (
                  <div key={lic.id} className={`card card-body ${isExpired ? 'border-danger/30 bg-danger-light/20' : isSoon ? 'border-warning/30 bg-warning-light/20' : ''}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 truncate">{lic.license_name}</div>
                        {lic.license_number && <div className="text-xs text-gray-400 mt-0.5">字號：{lic.license_number}</div>}
                        {lic.issued_by && <div className="text-xs text-gray-400">發證：{lic.issued_by}</div>}
                      </div>
                      <div className="flex gap-1 flex-shrink-0 ml-2">
                        <button className="btn btn-sm px-2" onClick={() => setLicenseModal(lic)}><Edit2 size={12} /></button>
                        <button className="btn btn-sm px-2 hover:bg-danger-light hover:text-danger"
                          onClick={() => { if (window.confirm(`確定刪除「${lic.license_name}」？`)) deleteLicense.mutate(lic.id); }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-4 text-xs text-gray-500 flex-wrap">
                      {lic.issue_date && <span>發證：{formatDate(lic.issue_date)}</span>}
                      {lic.expiry_date && (
                        <span className={`font-medium ${isExpired ? 'text-danger' : isSoon ? 'text-warning' : 'text-gray-500'}`}>
                          到期：{formatDate(lic.expiry_date)}
                          {isExpired && ' ⚠️ 已過期'}
                          {isSoon && ` ⏰ 剩 ${days} 天`}
                        </span>
                      )}
                    </div>

                    {lic.notes && <div className="text-xs text-gray-400 mt-1">備注：{lic.notes}</div>}

                    {lic.file_url ? (
                      <a href={lic.file_url} target="_blank" rel="noopener noreferrer"
                        className="mt-2 text-xs text-primary hover:underline flex items-center gap-1">
                        <FileText size={11} /> 查看證照影像
                      </a>
                    ) : (
                      <div className="mt-2 text-xs text-gray-300">尚未上傳影像</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 勞健保記錄 ── */}
      {tab === 'insurance' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-gray-400">記錄此人員的勞保、健保投保狀態與歷史</p>
            <button className="btn btn-primary" onClick={() => setInsuranceModal('new')}>
              <Plus size={14} /> 新增保險記錄
            </button>
          </div>

          {!data.insurance?.length ? (
            <div className="card card-body text-center py-16">
              <Briefcase size={32} className="text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">尚未新增保險記錄</p>
              <button className="btn btn-sm mt-3 mx-auto" onClick={() => setInsuranceModal('new')}>+ 新增保險記錄</button>
            </div>
          ) : (
            <div className="space-y-3">
              {data.insurance.map(ins => (
                <div key={ins.id} className="card card-body">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium text-sm text-gray-900">{INS_TYPE_LABEL[ins.insurance_type]}</span>
                        <span className={`badge ${INS_STATUS_BADGE[ins.status]}`}>{INS_STATUS_LABEL[ins.status]}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-500">
                        {ins.enroll_date && <div>投保日期：{formatDate(ins.enroll_date)}</div>}
                        {ins.terminate_date && <div>退保日期：{formatDate(ins.terminate_date)}</div>}
                        {ins.insured_salary && <div>投保薪資：${Number(ins.insured_salary).toLocaleString()}</div>}
                        {ins.insurer_name && <div>投保單位：{ins.insurer_name}</div>}
                      </div>
                      {ins.notes && <div className="text-xs text-gray-400 mt-1">備注：{ins.notes}</div>}
                      {ins.proof_url && (
                        <a href={ins.proof_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1 mt-2">
                          <FileText size={11} /> 查看投保證明
                        </a>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0 ml-3">
                      <button className="btn btn-sm px-2" onClick={() => setInsuranceModal(ins)}><Edit2 size={12} /></button>
                      <button className="btn btn-sm px-2 hover:bg-danger-light hover:text-danger"
                        onClick={() => { if (window.confirm('確定刪除此保險記錄？')) deleteInsurance.mutate(ins.id); }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* LINE 綁定管理 */}
      <LineBindAdmin userId={id} userName={data?.user?.name || ''} />

      {/* Modals */}
      {licenseModal && (
        <LicenseModal
          userId={id}
          license={licenseModal === 'new' ? null : licenseModal}
          onClose={() => setLicenseModal(null)}
          onSuccess={() => { setLicenseModal(null); qc.invalidateQueries(['hrUser', id]); }}
        />
      )}
      {insuranceModal && (
        <InsuranceModal
          userId={id}
          record={insuranceModal === 'new' ? null : insuranceModal}
          onClose={() => setInsuranceModal(null)}
          onSuccess={() => { setInsuranceModal(null); qc.invalidateQueries(['hrUser', id]); }}
        />
      )}
    </div>
  );
}
