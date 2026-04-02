import React, { useState } from 'react';
import { Save, Info } from 'lucide-react';
import toast from 'react-hot-toast';

// ── 功能模組（名稱與左欄一致）─────────────────────────────────
const NAV_GROUPS = [
  {
    section: '主要功能',
    modules: [
      { key: 'cases',     label: '案件管理' },
      { key: 'dispatch',  label: '派工管理' },
      { key: 'field',     label: '現場作業' },
    ]
  },
  {
    section: '客服',
    modules: [
      { key: 'chat',      label: '線上客服' },
      { key: 'case_chat', label: '案件溝通' },
    ]
  },
  {
    section: '帳務管理',
    modules: [
      { key: 'finance',   label: '帳務管理' },
    ]
  },
  {
    section: '系統管理',
    modules: [
      { key: 'users',       label: '人員管理' },
      { key: 'settings',    label: '功能設定' },
      { key: 'permissions', label: '權限設定' },
      { key: 'case_types',  label: '報修類型' },
      { key: 'backup',      label: '備份記錄' },
      { key: 'init',        label: '初始設定' },
    ]
  },
];

// #9：角色標籤色彩（#E8614A 系列，排除狀態色）
const ROLE_COLORS = {
  admin:            'text-[#7C4DFF] bg-[#EDE7FF]',
  customer_service: 'text-[#E8614A] bg-[#FFF0EC]',
  engineer:         'text-[#0F6E56] bg-[#E1F5EE]',
  owner:            'text-[#5B6B8A] bg-[#EEF0F5]',
};

const ROLES = [
  { key: 'admin',            label: '系統管理員' },
  { key: 'customer_service', label: '客服人員' },
  { key: 'engineer',         label: '工程師' },
  { key: 'owner',            label: '業主' },
];

// ── 預設權限 ──────────────────────────────────────────────────
const DEFAULT_PERMS = {
  cases:       { admin:{v:false,a:true,e:true,d:true}, customer_service:{v:false,a:true,e:true,d:false}, engineer:{v:false,a:false,e:false,d:false}, owner:{v:false,a:false,e:false,d:false} },
  dispatch:    { admin:{v:false,a:true,e:true,d:true}, customer_service:{v:false,a:true,e:true,d:false}, engineer:{v:false,a:false,e:false,d:false}, owner:{v:false,a:false,e:false,d:false} },
  field:       { admin:{v:false,a:true,e:true,d:true}, customer_service:{v:false,a:false,e:false,d:false}, engineer:{v:false,a:true,e:true,d:false}, owner:{v:false,a:false,e:false,d:false} },
  chat:        { admin:{v:false,a:true,e:true,d:true}, customer_service:{v:false,a:true,e:true,d:false}, engineer:{v:false,a:true,e:false,d:false}, owner:{v:false,a:true,e:false,d:false} },
  case_chat:   { admin:{v:false,a:true,e:true,d:true}, customer_service:{v:false,a:true,e:true,d:false}, engineer:{v:false,a:true,e:true,d:false}, owner:{v:false,a:false,e:false,d:false} },
  finance:     { admin:{v:false,a:true,e:true,d:true}, customer_service:{v:false,a:true,e:true,d:false}, engineer:{v:false,a:false,e:false,d:false}, owner:{v:false,a:false,e:false,d:false} },
  users:       { admin:{v:false,a:true,e:true,d:true}, customer_service:{v:false,a:false,e:false,d:false}, engineer:{v:false,a:false,e:false,d:false}, owner:{v:false,a:false,e:false,d:false} },
  settings:    { admin:{v:false,a:true,e:true,d:true}, customer_service:{v:false,a:false,e:false,d:false}, engineer:{v:false,a:false,e:false,d:false}, owner:{v:false,a:false,e:false,d:false} },
  permissions: { admin:{v:false,a:true,e:true,d:true}, customer_service:{v:false,a:false,e:false,d:false}, engineer:{v:false,a:false,e:false,d:false}, owner:{v:false,a:false,e:false,d:false} },
  case_types:  { admin:{v:false,a:true,e:true,d:true}, customer_service:{v:false,a:true,e:true,d:false}, engineer:{v:false,a:false,e:false,d:false}, owner:{v:false,a:false,e:false,d:false} },
  backup:      { admin:{v:false,a:true,e:true,d:true}, customer_service:{v:false,a:false,e:false,d:false}, engineer:{v:false,a:false,e:false,d:false}, owner:{v:false,a:false,e:false,d:false} },
  init:        { admin:{v:false,a:true,e:true,d:true}, customer_service:{v:false,a:false,e:false,d:false}, engineer:{v:false,a:false,e:false,d:false}, owner:{v:false,a:false,e:false,d:false} },
};

const STORAGE_KEY = 'repair_perms_v3';
const loadPerms = () => { try { const s = localStorage.getItem(STORAGE_KEY); if (s) return JSON.parse(s); } catch {} return DEFAULT_PERMS; };
const savePerms = (p) => localStorage.setItem(STORAGE_KEY, JSON.stringify(p));

export const usePermissions = () => {
  const p = loadPerms();
  return {
    canView:   (m, r) => p[m]?.[r]?.v === false,  // view=false 表示唯讀（可看）
    canAdd:    (m, r) => p[m]?.[r]?.a ?? false,
    canEdit:   (m, r) => p[m]?.[r]?.e ?? false,
    canDelete: (m, r) => p[m]?.[r]?.d ?? false,
  };
};

// ── Toggle Switch ─────────────────────────────────────────────
const Toggle = ({ on, onChange, color = 'bg-primary', disabled }) => (
  <div
    className={`w-9 h-5 rounded-full transition-colors relative select-none flex-shrink-0
      ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
      ${on ? color : 'bg-gray-200'}`}
    onClick={() => !disabled && onChange(!on)}
  >
    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
  </div>
);

export default function PermissionsPage() {
  // #9：依角色分Tab
  const [activeRole, setActiveRole] = useState('admin');
  const [perms, setPerms] = useState(loadPerms);
  const [hasChanges, setHasChanges] = useState(false);

  // #10：權限邏輯
  // 開啟「檢視」= 唯讀（v=false），三細項自動全關且不可操作
  // 關閉「檢視」= 可編輯（v=true），三細項開放各自設定
  const toggle = (modKey, field) => {
    const role = activeRole;
    if (role === 'admin') return;
    setPerms(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const cur = next[modKey][role];
      if (field === 'v') {
        cur.v = !cur.v;
        // 開啟唯讀（v=false）→ 關閉三細項
        if (!cur.v) { cur.a = false; cur.e = false; cur.d = false; }
      } else {
        // 只有在 v=true（關閉檢視/可編輯狀態）才能設定細項
        if (!cur.v) return prev;
        cur[field] = !cur[field];
      }
      return next;
    });
    setHasChanges(true);
  };

  const handleSave = () => { savePerms(perms); setHasChanges(false); toast.success('權限設定已儲存'); };
  const handleReset = () => {
    if (window.confirm('確定要還原為預設權限設定？')) {
      setPerms(DEFAULT_PERMS); savePerms(DEFAULT_PERMS); setHasChanges(false); toast.success('已還原為預設設定');
    }
  };

  const role = activeRole;
  const isAdmin = role === 'admin';

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">權限設定</h1>
          <p className="text-xs text-gray-400 mt-0.5">設定各角色對各功能模組的存取與操作權限</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-sm" onClick={handleReset}>還原預設</button>
          <button className={`btn btn-primary btn-sm gap-1 ${!hasChanges ? 'opacity-50' : ''}`} onClick={handleSave}>
            <Save size={13} /> 儲存設定
          </button>
        </div>
      </div>

      {/* 說明 */}
      <div className="flex items-start gap-2 px-4 py-3 bg-primary-light border border-primary/10 rounded-xl mb-5 text-xs text-primary-dark">
        <Info size={14} className="flex-shrink-0 mt-0.5" />
        <div>
          <strong>檢視（開啟）= 唯讀</strong>：只能查看資料，新增/修改/刪除自動關閉。
          <strong className="ml-2">檢視（關閉）= 可編輯</strong>：可個別設定新增、修改、刪除權限。
          系統管理員擁有完整權限不可更改。
        </div>
      </div>

      {/* #9：角色 Tabs */}
      <div className="flex gap-0 mb-6 border-b border-gray-100">
        {ROLES.map(r => (
          <button key={r.key} onClick={() => setActiveRole(r.key)}
            className={`px-4 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap ${activeRole === r.key ? 'border-primary text-primary font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_COLORS[r.key]}`}>{r.label}</span>
          </button>
        ))}
      </div>

      {isAdmin && (
        <div className="card card-body text-center py-10 text-sm text-gray-400">
          系統管理員擁有所有功能模組的完整權限，不可更改。
        </div>
      )}

      {/* #9：依左欄功能分類顯示群組 */}
      {!isAdmin && (
        <div className="space-y-5">
          {NAV_GROUPS.map(group => (
            <div key={group.section} className="card overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{group.section}</span>
              </div>
              <div className="divide-y divide-gray-50">
                {group.modules.map(mod => {
                  const mp = perms[mod.key]?.[role] || { v: false, a: false, e: false, d: false };
                  // #10：v=false → 唯讀（開啟檢視），v=true → 可編輯（關閉檢視）
                  const isReadOnly = !mp.v;
                  const canEdit = mp.v;
                  return (
                    <div key={mod.key} className="flex items-center px-4 py-3 gap-4">
                      <div className="w-24 flex-shrink-0 text-sm font-medium text-gray-700">{mod.label}</div>
                      {/* 檢視 toggle */}
                      <div className="flex items-center gap-2 min-w-[80px]">
                        <Toggle on={!mp.v} onChange={() => toggle(mod.key, 'v')} color="bg-primary" />
                        <span className={`text-xs ${!mp.v ? 'text-primary font-medium' : 'text-gray-400'}`}>檢視</span>
                      </div>
                      {/* 分隔線 */}
                      <div className="h-5 w-px bg-gray-200 flex-shrink-0" />
                      {/* 三細項：只有在 v=true（可編輯）才能操作 */}
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Toggle on={!!mp.a} onChange={() => toggle(mod.key, 'a')} color="bg-success" disabled={!canEdit} />
                          <span className={`text-xs ${mp.a && canEdit ? 'text-success font-medium' : 'text-gray-300'}`}>新增</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Toggle on={!!mp.e} onChange={() => toggle(mod.key, 'e')} color="bg-warning" disabled={!canEdit} />
                          <span className={`text-xs ${mp.e && canEdit ? 'text-warning font-medium' : 'text-gray-300'}`}>修改</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Toggle on={!!mp.d} onChange={() => toggle(mod.key, 'd')} color="bg-danger" disabled={!canEdit} />
                          <span className={`text-xs ${mp.d && canEdit ? 'text-danger font-medium' : 'text-gray-300'}`}>刪除</span>
                        </div>
                      </div>
                      {/* 狀態說明 */}
                      <div className="ml-auto text-xs text-gray-400 hidden sm:block">
                        {isReadOnly ? '唯讀' : `編輯（${[mp.a&&'新增',mp.e&&'修改',mp.d&&'刪除'].filter(Boolean).join('/') || '無細項'}）`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasChanges && (
        <div className="fixed bottom-6 right-6 z-50">
          <button className="btn btn-primary gap-2 shadow-lg px-5 py-2.5" onClick={handleSave}>
            <Save size={15} /> 儲存變更
          </button>
        </div>
      )}
    </div>
  );
}
