import React, { useState } from 'react';
import { Shield, Save, Info } from 'lucide-react';
import toast from 'react-hot-toast';

// ── P5-1：功能模組名稱與左欄一致 ────────────────────────────
// ── P5-2：權限細節化 2大類（檢視/編輯）× 3小類（新增/修改/刪除）──
const DEFAULT_PERMISSIONS = {
  cases:    { admin: { view:true, add:true, edit:true, delete:true }, customer_service: { view:true, add:true, edit:true, delete:false }, engineer: { view:true, add:false, edit:false, delete:false }, owner: { view:true, add:false, edit:false, delete:false } },
  dispatch: { admin: { view:true, add:true, edit:true, delete:true }, customer_service: { view:true, add:true, edit:true, delete:false }, engineer: { view:true, add:false, edit:false, delete:false }, owner: { view:false, add:false, edit:false, delete:false } },
  finance:  { admin: { view:true, add:true, edit:true, delete:true }, customer_service: { view:true, add:true, edit:true, delete:false }, engineer: { view:false, add:false, edit:false, delete:false }, owner: { view:false, add:false, edit:false, delete:false } },
  chat:     { admin: { view:true, add:true, edit:true, delete:true }, customer_service: { view:true, add:true, edit:true, delete:false }, engineer: { view:true, add:true, edit:false, delete:false }, owner: { view:true, add:true, edit:false, delete:false } },
  case_chat:{ admin: { view:true, add:true, edit:true, delete:true }, customer_service: { view:true, add:true, edit:true, delete:false }, engineer: { view:true, add:true, edit:false, delete:false }, owner: { view:false, add:false, edit:false, delete:false } },
  users:    { admin: { view:true, add:true, edit:true, delete:true }, customer_service: { view:true, add:false, edit:false, delete:false }, engineer: { view:false, add:false, edit:false, delete:false }, owner: { view:false, add:false, edit:false, delete:false } },
  settings: { admin: { view:true, add:true, edit:true, delete:true }, customer_service: { view:false, add:false, edit:false, delete:false }, engineer: { view:false, add:false, edit:false, delete:false }, owner: { view:false, add:false, edit:false, delete:false } },
  permissions: { admin: { view:true, add:true, edit:true, delete:true }, customer_service: { view:false, add:false, edit:false, delete:false }, engineer: { view:false, add:false, edit:false, delete:false }, owner: { view:false, add:false, edit:false, delete:false } },
  case_types:{ admin: { view:true, add:true, edit:true, delete:true }, customer_service: { view:true, add:true, edit:true, delete:false }, engineer: { view:true, add:false, edit:false, delete:false }, owner: { view:false, add:false, edit:false, delete:false } },
  photos:   { admin: { view:true, add:true, edit:true, delete:true }, customer_service: { view:true, add:true, edit:true, delete:false }, engineer: { view:true, add:true, edit:false, delete:false }, owner: { view:true, add:false, edit:false, delete:false } },
  notes:    { admin: { view:true, add:true, edit:true, delete:true }, customer_service: { view:true, add:true, edit:true, delete:false }, engineer: { view:true, add:true, edit:true, delete:true }, owner: { view:false, add:false, edit:false, delete:false } },
};

// P5-1：名稱對應左欄完全一致
const MODULES = [
  { key: 'cases',      label: '案件管理',  desc: '案件的建立、修改、刪除' },
  { key: 'dispatch',   label: '派工管理',  desc: '派工單的新增、修改、重新指派' },
  { key: 'finance',    label: '帳務管理',  desc: '報價單、請款單、收款單' },
  { key: 'chat',       label: '線上客服',  desc: '與業主的對話通道' },
  { key: 'case_chat',  label: '案件溝通',  desc: '與工程師的對話通道' },
  { key: 'photos',     label: '照片記錄',  desc: '施工照片上傳、刪除' },
  { key: 'notes',      label: '案件備註',  desc: '現場施工備註的編輯、刪除' },
  { key: 'users',      label: '人員管理',  desc: '人員帳號建立、修改、停用' },
  { key: 'settings',   label: '功能設定',  desc: '系統功能參數設定' },
  { key: 'permissions',label: '權限設定',  desc: '各角色的功能權限管理' },
  { key: 'case_types', label: '報修類型',  desc: '報修類型的新增、修改、排序' },
];

// P5-4：角色標籤色彩（基於 #E8614A，排除狀態色紅/黃/綠）
const ROLE_COLORS = {
  admin:            'text-[#7C4DFF] bg-[#EDE7FF]',   // 紫色
  customer_service: 'text-[#E8614A] bg-[#FFF0EC]',   // 珊瑚橘（primary）
  engineer:         'text-[#0F6E56] bg-[#E1F5EE]',   // 青綠
  owner:            'text-[#5B6B8A] bg-[#EEF0F5]',   // 藍灰
};

const ROLES = [
  { key: 'admin',            label: '系統管理員' },
  { key: 'customer_service', label: '客服人員' },
  { key: 'engineer',         label: '工程師' },
  { key: 'owner',            label: '業主' },
];

const STORAGE_KEY = 'repair_system_permissions_v2';
const loadPermissions = () => { try { const s = localStorage.getItem(STORAGE_KEY); if (s) return JSON.parse(s); } catch {} return DEFAULT_PERMISSIONS; };
const savePermissions = (p) => localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
export const usePermissions = () => {
  const p = loadPermissions();
  return { canView: (m,r) => p[m]?.[r]?.view??false, canAdd: (m,r) => p[m]?.[r]?.add??false, canEdit: (m,r) => p[m]?.[r]?.edit??false, canDelete: (m,r) => p[m]?.[r]?.delete??false };
};

// Toggle Switch 元件
const Toggle = ({ on, onChange, color = 'bg-primary', disabled }) => (
  <div
    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer select-none
      ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
      ${on ? color : 'bg-gray-200'}`}
    onClick={() => !disabled && onChange(!on)}
  >
    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
  </div>
);

export default function PermissionsPage() {
  const [perms, setPerms] = useState(loadPermissions);
  const [hasChanges, setHasChanges] = useState(false);

  const toggle = (mod, role, action) => {
    if (role === 'admin') return;
    setPerms(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      next[mod] = next[mod] || {};
      next[mod][role] = next[mod][role] || {};
      next[mod][role][action] = !next[mod][role][action];
      // 關閉檢視則全部關閉
      if (action === 'view' && !next[mod][role][action]) {
        next[mod][role].add = false;
        next[mod][role].edit = false;
        next[mod][role].delete = false;
      }
      // 新增/修改/刪除需要先有檢視
      if ((action === 'add' || action === 'edit' || action === 'delete') && next[mod][role][action]) {
        next[mod][role].view = true;
      }
      return next;
    });
    setHasChanges(true);
  };

  const handleSave = () => { savePermissions(perms); setHasChanges(false); toast.success('權限設定已儲存'); };
  const handleReset = () => { if (window.confirm('確定要還原為預設權限設定？')) { setPerms(DEFAULT_PERMISSIONS); savePermissions(DEFAULT_PERMISSIONS); setHasChanges(false); toast.success('已還原為預設設定'); } };

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

      <div className="flex items-start gap-2 px-4 py-3 bg-primary-light border border-primary/10 rounded-xl mb-5 text-xs text-primary-dark">
        <Info size={14} className="flex-shrink-0 mt-0.5" />
        <div>
          <strong>2 大類：</strong>「檢視」可查閱資料；「編輯」含新增、修改、刪除三小類。
          關閉檢視會同時關閉所有編輯權限。系統管理員擁有完整權限不可更改。
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-48">功能模組</th>
                {ROLES.map(role => (
                  <th key={role.key} className="px-3 py-3 text-center" style={{ minWidth: '140px' }}>
                    {/* P5-4 色彩 */}
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ROLE_COLORS[role.key]}`}>
                      {role.label}
                    </span>
                  </th>
                ))}
              </tr>
              {/* 欄位說明列 */}
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-4 py-2 text-left text-xs text-gray-400"></th>
                {ROLES.map(role => (
                  <th key={role.key} className="px-3 py-2">
                    <div className="flex justify-center gap-4">
                      <span className="text-xs text-gray-400 w-8 text-center">檢視</span>
                      <span className="text-xs text-gray-400 w-8 text-center">新增</span>
                      <span className="text-xs text-gray-400 w-8 text-center">修改</span>
                      <span className="text-xs text-danger w-8 text-center">刪除</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((mod, idx) => (
                <tr key={mod.key} className={`border-b border-gray-50 ${idx % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Shield size={13} className="text-gray-400 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-medium text-gray-800">{mod.label}</div>
                        <div className="text-xs text-gray-400 leading-tight">{mod.desc}</div>
                      </div>
                    </div>
                  </td>
                  {ROLES.map(role => {
                    const mp = perms[mod.key]?.[role.key] || {};
                    const isAdmin = role.key === 'admin';
                    return (
                      <td key={role.key} className="px-3 py-3">
                        <div className="flex justify-center gap-4">
                          <div className="flex flex-col items-center gap-1">
                            <Toggle on={!!mp.view} onChange={() => toggle(mod.key, role.key, 'view')} color="bg-primary" disabled={isAdmin} />
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            <Toggle on={!!mp.add} onChange={() => toggle(mod.key, role.key, 'add')} color="bg-success" disabled={isAdmin || !mp.view} />
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            <Toggle on={!!mp.edit} onChange={() => toggle(mod.key, role.key, 'edit')} color="bg-warning" disabled={isAdmin || !mp.view} />
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            <Toggle on={!!mp.delete} onChange={() => toggle(mod.key, role.key, 'delete')} color="bg-danger" disabled={isAdmin || !mp.view} />
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
