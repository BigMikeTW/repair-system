import React, { useState } from 'react';
import { Shield, Trash2, AlertTriangle, Lock, CheckCircle, RefreshCw } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

function getDailyPassword() {
  const now = new Date();
  const y2 = now.getFullYear() % 100;
  const m  = now.getMonth() + 1;
  const d  = now.getDate();
  const val = y2 * (m * m) + (d * d * d);
  return String(val).padStart(6, '0');
}

const MODULES = [
  { key: 'cases',      label: '案件資料',            desc: '所有案件、活動記錄、打卡記錄、簽名' },
  { key: 'finance',    label: '財務資料',            desc: '報價單、請款單、收款單、結案單' },
  { key: 'users_data', label: '用戶輔助資料',         desc: '通知記錄、個人偏好設定（保留帳號）' },
  { key: 'all',        label: '⚠️ 全部資料（完整重置）', desc: '清除所有資料，恢復出廠狀態' },
];

export default function InitPage() {
  const [step, setStep]           = useState('password');
  const [input, setInput]         = useState('');
  const [pwdError, setPwdError]   = useState('');
  const [selected, setSelected]   = useState([]);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading]     = useState(false);

  const correctPwd = getDailyPassword();

  const handleVerify = () => {
    if (input === correctPwd) {
      setStep('select');
      setPwdError('');
    } else {
      setPwdError(`密碼錯誤（今日密碼為 ${correctPwd.length} 位數字）`);
      setInput('');
    }
  };

  const toggleModule = (key) => {
    if (key === 'all') {
      setSelected(prev => prev.includes('all') ? [] : ['all']);
      return;
    }
    setSelected(prev => {
      const without = prev.filter(k => k !== 'all');
      return without.includes(key) ? without.filter(k => k !== key) : [...without, key];
    });
  };

  const handleClear = async () => {
    if (confirmText !== '確認清除') {
      toast.error('請輸入「確認清除」以確認操作');
      return;
    }
    setLoading(true);
    try {
      await api.post('/system/init-clear', { modules: selected });
      toast.success('資料清除完成，系統已重置');
      setStep('done');
    } catch (e) {
      toast.error(e.response?.data?.error || '清除失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container max-w-2xl mx-auto">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-danger-light rounded-xl flex items-center justify-center">
            <RefreshCw size={22} className="text-danger" />
          </div>
          <div>
            <h1 className="page-title">初始設定</h1>
            <p className="text-sm text-gray-400">清除系統資料，恢復初始狀態</p>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 bg-danger-light border border-red-200 rounded-xl p-4">
        <AlertTriangle size={20} className="text-danger flex-shrink-0 mt-0.5" />
        <div className="text-sm text-danger">
          <div className="font-semibold mb-1">危險操作警告</div>
          此功能將永久刪除系統資料，操作後無法復原。請確認已備份重要資料後再執行。
        </div>
      </div>

      {step === 'password' && (
        <div className="card card-body">
          <div className="flex items-center gap-3 mb-5">
            <Lock size={20} className="text-primary" />
            <h2 className="text-lg font-semibold">輸入今日授權密碼</h2>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <p className="text-sm text-gray-600 mb-1">授權密碼每日不同，計算公式：</p>
            <code className="text-sm font-mono text-primary">年份後2碼 × 月份² + 日期³，不足6位前補0</code>
            <p className="text-xs text-gray-400 mt-2">例：2026年4月15日 → 26 × 16 + 3375 = 3791 → <strong>003791</strong></p>
          </div>
          <div className="flex gap-3">
            <input
              type="password"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleVerify()}
              className="form-control font-mono text-center text-2xl tracking-widest max-w-xs"
              placeholder="000000"
              maxLength={6}
            />
            <button className="btn btn-primary" onClick={handleVerify}>
              驗證密碼
            </button>
          </div>
          {pwdError && (
            <p className="text-sm text-danger mt-2 flex items-center gap-1.5">
              <AlertTriangle size={14} /> {pwdError}
            </p>
          )}
        </div>
      )}

      {step === 'select' && (
        <div className="card card-body">
          <div className="flex items-center gap-3 mb-5">
            <CheckCircle size={20} className="text-success" />
            <h2 className="text-lg font-semibold">密碼驗證成功，選擇清除範圍</h2>
          </div>
          <div className="space-y-3 mb-5">
            {MODULES.map(mod => (
              <label key={mod.key} className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                selected.includes(mod.key)
                  ? mod.key === 'all' ? 'border-danger bg-red-50' : 'border-primary bg-primary-light'
                  : 'border-gray-200 hover:border-gray-300'
              }`}>
                <input
                  type="checkbox"
                  checked={selected.includes(mod.key)}
                  onChange={() => toggleModule(mod.key)}
                  className="mt-1 w-5 h-5 rounded"
                />
                <div>
                  <div className={`font-semibold ${mod.key === 'all' ? 'text-danger' : 'text-gray-900'}`}>
                    {mod.label}
                  </div>
                  <div className="text-sm text-gray-500 mt-0.5">{mod.desc}</div>
                </div>
              </label>
            ))}
          </div>
          <div className="flex gap-3">
            <button className="btn" onClick={() => { setStep('password'); setSelected([]); }}>返回</button>
            <button className="btn btn-danger" disabled={selected.length === 0} onClick={() => setStep('confirm')}>
              繼續 →
            </button>
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <div className="card card-body">
          <div className="flex items-center gap-3 mb-4">
            <Trash2 size={20} className="text-danger" />
            <h2 className="text-lg font-semibold text-danger">最後確認</h2>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <p className="text-sm text-danger font-medium mb-2">即將永久清除以下資料：</p>
            <ul className="text-sm text-danger space-y-1">
              {selected.map(key => {
                const mod = MODULES.find(m => m.key === key);
                return <li key={key}>• {mod?.label}：{mod?.desc}</li>;
              })}
            </ul>
          </div>
          <p className="text-sm text-gray-600 mb-3">
            請在下方輸入「<strong className="text-danger">確認清除</strong>」以確認執行：
          </p>
          <input
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            className="form-control mb-4"
            placeholder="確認清除"
          />
          <div className="flex gap-3">
            <button className="btn" onClick={() => setStep('select')}>返回</button>
            <button
              className="btn btn-danger gap-2"
              onClick={handleClear}
              disabled={loading || confirmText !== '確認清除'}
            >
              <Trash2 size={16} />
              {loading ? '清除中...' : '執行清除'}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="card card-body text-center py-12">
          <CheckCircle size={52} className="text-success mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">資料清除完成</h2>
          <p className="text-gray-500 mb-6">系統已恢復至初始狀態</p>
          <button className="btn btn-primary" onClick={() => window.location.href = '/'}>
            返回首頁
          </button>
        </div>
      )}
    </div>
  );
}
