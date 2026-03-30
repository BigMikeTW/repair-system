import React, { useState } from 'react';
import { Shield, Save, Info } from 'lucide-react';
import toast from 'react-hot-toast';

// ── 預設權限設定（存在 localStorage）────────────────────────
const DEFAULT_PERMISSIONS = {
  cases:   { admin: { edit: true,  delete: true  }, customer_service: { edit: true,  delete: false }, engineer: { edit: false, delete: false }, owner: { edit: false, delete: false } },
  photos:  { admin: { edit: true,  delete: true  }, customer_service: { edit: true,  delete: false }, engineer: { edit: true,  delete: false }, owner: { edit: false, delete: false } },
  finance: { admin: { edit: true,  delete: true  }, customer_service: { edit: true,  delete: false }, engineer: { edit: true,  delete: false }, owner: { edit: false, delete: false } },
  users:   { admin: { edit: true,  delete: true  }, customer_service: { edit: false, delete: false }, engineer: { edit: false, delete: false }, owner: { edit: false, delete: false } },
  notes:   { admin: { edit: true,  delete: true  }, customer_service: { edit: true,  delete: false }, engineer: { edit: true,  delete: true  }, owner: { edit: false, delete: false } },
  dispatch:{ admin: { edit: true,  delete: true  }, customer_service: { edit: true,  delete: false }, engineer: { edit: false, delete: false }, owner: { edit: false, delete: false } },
};

const MODULES = [
  { key: 'cases',    label: '案件管理',   desc: '案件單據的建立、修改與刪除' },
  { key: 'photos',   label: '照片記錄',   desc: '施工照片的上傳與刪除（注意：已簽收案件照片無法刪除）' },
  { key: 'finance',  label: '報價/結案單', desc: '報價單與請款記錄的修改與刪除' },
  { key: 'notes',    label: '案件記錄',   desc: '現場施工記錄的編輯與刪除' },
  { key: 'dispatch', label: '派工管理',   desc: '派工單的修改與重新指派' },
  { key: 'users',    label: '人員管理',   desc: '人員帳號資料的修改與停用' },
];

const ROLES = [
  { key: 'admin',            label: '系統管理員', color: 'text-purple-600 bg-purple-50' },
  { key: 'customer_service', label: '客服人員',   color: 'text-blue-600 bg-blue-50' },
  { key: 'engineer',         label: '工程師',     color: 'text-teal-600 bg-teal-50' },
  { key: 'owner',            label: '業主',       color: 'text-gray-600 bg-gray-50' },
];

const STORAGE_KEY = 'repair_system_permissions';

const loadPermissions = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return DEFAULT_PERMISSIONS;
};

const savePermissions = (perms) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(perms));
};

// 供其他頁面使用的 hook
export const usePermissions = () => {
  const perms = loadPermissions();
  return {
    canEdit: (module, role) => perms[module]?.[role]?.edit ?? false,
    canDelete: (module, role) => perms[module]?.[role]?.delete ?? false,
  };
};

export default function PermissionsPage() {
  const [perms, setPerms] = useState(loadPermissions);
  const [hasChanges, setHasChanges] = useState(false);

  const toggle = (module, role, action) => {
    // 系統管理員的 edit 不可關閉
    if (role === 'admin' && action === 'edit') return;
    setPerms(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      next[module] = next[module] || {};
      next[module][role] = next[module][role] || {};
      next[module][role][action] = !next[module][role][action];
      // 若 edit 關閉，delete 也必須關閉
      if (action === 'edit' && !next[module][role][action]) {
        next[module][role].delete = false;
      }
      return next;
    });
    setHasChanges(true);
  };

  const handleSave = () => {
    savePermissions(perms);
    setHasChanges(false);
    toast.success('權限設定已儲存');
  };

  const handleReset = () => {
    if (window.confirm('確定要還原為預設權限設定？')) {
      setPerms(DEFAULT_PERMISSIONS);
      savePermissions(DEFAULT_PERMISSIONS);
      setHasChanges(false);
      toast.success('已還原為預設設定');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">人員權限設定</h1>
          <p className="text-xs text-gray-400 mt-0.5">設定各角色對各功能模組的修改及刪除權限</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-sm" onClick={handleReset}>還原預設</button>
          <button
            className={`btn btn-primary btn-sm gap-1 ${!hasChanges ? 'opacity-50' : ''}`}
            onClick={handleSave}
          >
            <Save size={13} /> 儲存設定
          </button>
        </div>
      </div>

      {/* 說明 */}
      <div className="flex items-start gap-2 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl mb-5 text-xs text-blue-700">
        <Info size={14} className="flex-shrink-0 mt-0.5" />
        <div>
          權限說明：<strong>修改</strong>包含新增與編輯；<strong>刪除</strong>為永久刪除。
          系統管理員擁有所有模組的完整權限，不可更改。
          部分功能有額外限制（如業主簽收後照片不得刪除），不受此設定影響。
        </div>
      </div>

      {/* 角色說明列 */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-52">功能模組</th>
                {ROLES.map(role => (
                  <th key={role.key} className="px-4 py-3 text-center" style={{ minWidth: '130px' }}>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${role.color}`}>
                      {role.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((mod, idx) => (
                <tr key={mod.key} className={`border-b border-gray-50 ${idx % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <Shield size={14} className="text-gray-400 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-medium text-gray-800">{mod.label}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">{mod.desc}</div>
                      </div>
                    </div>
                  </td>
                  {ROLES.map(role => {
                    const modPerms = perms[mod.key]?.[role.key] || {};
                    const isAdmin = role.key === 'admin';
                    return (
                      <td key={role.key} className="px-4 py-4">
                        <div className="flex flex-col items-center gap-2">
                          {/* 修改 */}
                          <label className={`flex items-center gap-1.5 text-xs cursor-pointer select-none ${isAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}>
                            <div
                              className={`w-8 h-4 rounded-full transition-colors relative ${modPerms.edit ? 'bg-primary' : 'bg-gray-200'} ${isAdmin ? '' : 'cursor-pointer'}`}
                              onClick={() => !isAdmin && toggle(mod.key, role.key, 'edit')}
                            >
                              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${modPerms.edit ? 'translate-x-4' : 'translate-x-0.5'}`} />
                            </div>
                            <span className={modPerms.edit ? 'text-gray-700' : 'text-gray-400'}>修改</span>
                          </label>
                          {/* 刪除 */}
                          <label className={`flex items-center gap-1.5 text-xs cursor-pointer select-none ${!modPerms.edit || isAdmin ? 'opacity-40 cursor-not-allowed' : ''}`}>
                            <div
                              className={`w-8 h-4 rounded-full transition-colors relative ${modPerms.delete ? 'bg-danger' : 'bg-gray-200'} ${modPerms.edit && !isAdmin ? 'cursor-pointer' : ''}`}
                              onClick={() => modPerms.edit && !isAdmin && toggle(mod.key, role.key, 'delete')}
                            >
                              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${modPerms.delete ? 'translate-x-4' : 'translate-x-0.5'}`} />
                            </div>
                            <span className={modPerms.delete ? 'text-danger' : 'text-gray-400'}>刪除</span>
                          </label>
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
