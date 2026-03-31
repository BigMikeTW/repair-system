import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Trash2, Save, CreditCard, Users, Shield, Info, Edit2, X, Check } from 'lucide-react';
import toast from 'react-hot-toast';

// ── 儲存/讀取工具 ─────────────────────────────────────────────
const storage = {
  getBankAccounts: () => { try { return JSON.parse(localStorage.getItem('default_bank_accounts') || '[]'); } catch { return []; } },
  saveBankAccounts: (data) => localStorage.setItem('default_bank_accounts', JSON.stringify(data)),
  getRoles: () => {
    try {
      const saved = localStorage.getItem('custom_roles');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      { key: 'admin',            label: '系統管理員', color: 'purple', modules: ['cases','photos','finance','notes','dispatch','users','settings'], editable: false },
      { key: 'customer_service', label: '客服人員',   color: 'blue',   modules: ['cases','photos','finance','notes','dispatch'], editable: false },
      { key: 'engineer',         label: '工程師',     color: 'teal',   modules: ['cases','photos','notes'], editable: false },
      { key: 'owner',            label: '業主',       color: 'gray',   modules: ['cases'], editable: false },
    ];
  },
  saveRoles: (data) => localStorage.setItem('custom_roles', JSON.stringify(data)),
  getPermissions: () => { try { return JSON.parse(localStorage.getItem('repair_system_permissions') || '{}'); } catch { return {}; } },
  savePermissions: (data) => localStorage.setItem('repair_system_permissions', JSON.stringify(data)),
};

const ALL_MODULES = [
  { key: 'cases',    label: '案件管理',   desc: '案件建立、查看、追蹤' },
  { key: 'dispatch', label: '派工管理',   desc: '派工、取消、重新指派' },
  { key: 'finance',  label: '財務管理',   desc: '報價單、結案單、請款單、收款單' },
  { key: 'photos',   label: '照片記錄',   desc: '施工照片上傳與管理' },
  { key: 'notes',    label: '案件記錄',   desc: '現場施工記錄' },
  { key: 'users',    label: '人員管理',   desc: '人員帳號與 HR 資料' },
  { key: 'settings', label: '系統設定',   desc: '功能設定與角色管理' },
];

const COLOR_OPTIONS = [
  { key: 'purple', label: '紫色', class: 'bg-purple-100 text-purple-700' },
  { key: 'blue',   label: '藍色', class: 'bg-blue-100 text-blue-700' },
  { key: 'teal',   label: '青色', class: 'bg-teal-100 text-teal-700' },
  { key: 'green',  label: '綠色', class: 'bg-green-100 text-green-700' },
  { key: 'orange', label: '橘色', class: 'bg-orange-100 text-orange-700' },
  { key: 'gray',   label: '灰色', class: 'bg-gray-100 text-gray-700' },
];
const colorClass = (color) => COLOR_OPTIONS.find(c => c.key === color)?.class || 'bg-gray-100 text-gray-700';

// ── 收款帳號管理 ──────────────────────────────────────────────
function BankAccountSettings() {
  const [accounts, setAccounts] = useState(storage.getBankAccounts);
  const [showForm, setShowForm] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const onAdd = (data) => {
    const newList = [...accounts, data];
    setAccounts(newList);
    storage.saveBankAccounts(newList);
    toast.success('收款帳號已新增');
    reset();
    setShowForm(false);
  };

  const onDelete = (idx) => {
    if (!window.confirm('確定刪除此帳號？')) return;
    const newList = accounts.filter((_, i) => i !== idx);
    setAccounts(newList);
    storage.saveBankAccounts(newList);
    toast.success('已刪除');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">預設收款帳號</h3>
          <p className="text-xs text-gray-400 mt-0.5">新增後，建立收款單時可直接選擇，不需每次手動輸入</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
          <Plus size={12} /> 新增帳號
        </button>
      </div>

      {accounts.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-6 text-center text-sm text-gray-400">
          尚無預設收款帳號，點右上角「新增帳號」建立
        </div>
      )}

      <div className="space-y-2">
        {accounts.map((acc, i) => (
          <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-primary-light rounded-lg flex items-center justify-center">
                <CreditCard size={16} className="text-primary" />
              </div>
              <div>
                <div className="font-medium text-sm text-gray-900">{acc.bank_name}</div>
                <div className="text-xs text-gray-400 font-mono">{acc.account_number}</div>
                {acc.account_name && <div className="text-xs text-gray-400">戶名：{acc.account_name}</div>}
              </div>
            </div>
            <button onClick={() => onDelete(i)} className="btn btn-sm text-danger border-red-200 hover:bg-red-50">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold">新增收款帳號</h3>
              <button className="btn btn-sm" onClick={() => { setShowForm(false); reset(); }}>關閉</button>
            </div>
            <form onSubmit={handleSubmit(onAdd)} className="p-5 space-y-3">
              <div>
                <label className="form-label">銀行名稱 *</label>
                <input {...register('bank_name', { required: '請填寫銀行名稱' })} className="form-control" placeholder="例：台灣銀行、國泰世華銀行" />
                {errors.bank_name && <p className="text-xs text-danger mt-1">{errors.bank_name.message}</p>}
              </div>
              <div>
                <label className="form-label">銀行帳號 *</label>
                <input {...register('account_number', { required: '請填寫帳號' })} className="form-control font-mono" placeholder="123-456-789012" />
                {errors.account_number && <p className="text-xs text-danger mt-1">{errors.account_number.message}</p>}
              </div>
              <div>
                <label className="form-label">戶名（選填）</label>
                <input {...register('account_name')} className="form-control" placeholder="帳戶戶名" />
              </div>
              <div>
                <label className="form-label">備注（選填）</label>
                <input {...register('notes')} className="form-control" placeholder="例：公司主帳戶" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn" onClick={() => { setShowForm(false); reset(); }}>取消</button>
                <button type="submit" className="btn btn-primary">新增</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 角色管理 ─────────────────────────────────────────────────
function RoleSettings() {
  const [roles, setRoles] = useState(storage.getRoles);
  const [permissions, setPermissions] = useState(storage.getPermissions);
  const [editingRole, setEditingRole] = useState(null);
  const [showNewRole, setShowNewRole] = useState(false);
  const { register, handleSubmit, reset, setValue, watch } = useForm();
  const watchModules = watch('modules') || [];

  const saveAll = (newRoles, newPerms) => {
    storage.saveRoles(newRoles);
    storage.savePermissions(newPerms);
    toast.success('角色設定已儲存');
  };

  const onAddRole = (data) => {
    const key = `custom_${Date.now()}`;
    const newRole = {
      key,
      label: data.label,
      color: data.color || 'blue',
      modules: Array.isArray(data.modules) ? data.modules : [],
      editable: true,
    };
    // Init permissions for new role
    const newPerms = { ...permissions };
    newRole.modules.forEach(mod => {
      if (!newPerms[mod]) newPerms[mod] = {};
      newPerms[mod][key] = { edit: true, delete: false };
    });
    const newRoles = [...roles, newRole];
    setRoles(newRoles);
    setPermissions(newPerms);
    saveAll(newRoles, newPerms);
    setShowNewRole(false);
    reset();
  };

  const onDeleteRole = (roleKey) => {
    if (!window.confirm('確定刪除此角色？')) return;
    const newRoles = roles.filter(r => r.key !== roleKey);
    setRoles(newRoles);
    saveAll(newRoles, permissions);
  };

  const toggleModulePermission = (roleKey, modKey, action) => {
    const newPerms = JSON.parse(JSON.stringify(permissions));
    if (!newPerms[modKey]) newPerms[modKey] = {};
    if (!newPerms[modKey][roleKey]) newPerms[modKey][roleKey] = { edit: false, delete: false };
    newPerms[modKey][roleKey][action] = !newPerms[modKey][roleKey][action];
    if (action === 'edit' && !newPerms[modKey][roleKey][action]) {
      newPerms[modKey][roleKey].delete = false;
    }
    setPermissions(newPerms);
    saveAll(roles, newPerms);
  };

  const hasModule = (role, modKey) => role.modules?.includes(modKey);
  const toggleModule = (roleKey, modKey) => {
    const newRoles = roles.map(r => {
      if (r.key !== roleKey) return r;
      const mods = r.modules || [];
      const newMods = mods.includes(modKey)
        ? mods.filter(m => m !== modKey)
        : [...mods, modKey];
      return { ...r, modules: newMods };
    });
    // Update permissions accordingly
    const newPerms = JSON.parse(JSON.stringify(permissions));
    const role = newRoles.find(r => r.key === roleKey);
    if (!role.modules.includes(modKey)) {
      // Module disabled - clear permissions
      if (newPerms[modKey]?.[roleKey]) {
        newPerms[modKey][roleKey] = { edit: false, delete: false };
      }
    } else {
      // Module enabled - grant edit by default
      if (!newPerms[modKey]) newPerms[modKey] = {};
      newPerms[modKey][roleKey] = { edit: true, delete: false };
    }
    setRoles(newRoles);
    setPermissions(newPerms);
    saveAll(newRoles, newPerms);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">角色管理</h3>
          <p className="text-xs text-gray-400 mt-0.5">設定各角色可存取的功能模組，模組關閉後，人員權限頁面的對應項目將自動鎖定</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNewRole(true)}>
          <Plus size={12} /> 新增角色
        </button>
      </div>

      {/* 角色模組矩陣表 */}
      <div className="card overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-gray-500 font-medium w-40">功能模組</th>
                {roles.map(role => (
                  <th key={role.key} className="px-3 py-3 text-center min-w-[110px]">
                    <div className="flex flex-col items-center gap-1">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colorClass(role.color)}`}>
                        {role.label}
                      </span>
                      {role.editable && (
                        <button onClick={() => onDeleteRole(role.key)}
                          className="text-gray-300 hover:text-danger text-[10px]">刪除</button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_MODULES.map((mod, idx) => (
                <tr key={mod.key} className={`border-b border-gray-50 ${idx % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{mod.label}</div>
                    <div className="text-[10px] text-gray-400">{mod.desc}</div>
                  </td>
                  {roles.map(role => {
                    const isAdmin = role.key === 'admin';
                    const enabled = isAdmin || hasModule(role, mod.key);
                    const perms = permissions[mod.key]?.[role.key] || { edit: false, delete: false };
                    const canEditPerm = enabled && !isAdmin;

                    return (
                      <td key={role.key} className="px-3 py-3 text-center">
                        {isAdmin ? (
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[10px] text-purple-500 font-medium">完整權限</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2">
                            {/* 模組開關 */}
                            <div
                              className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${enabled ? 'bg-primary' : 'bg-gray-200'}`}
                              onClick={() => role.editable && toggleModule(role.key, mod.key)}
                              title={role.editable ? '點擊切換模組存取' : '預設角色不可修改'}
                            >
                              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                            </div>
                            {/* 修改/刪除權限（模組啟用時才顯示） */}
                            {enabled && (
                              <div className="flex gap-1">
                                <button
                                  className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${perms.edit ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'} ${!role.editable ? 'cursor-default' : 'cursor-pointer'}`}
                                  onClick={() => canEditPerm && toggleModulePermission(role.key, mod.key, 'edit')}
                                >修改</button>
                                <button
                                  className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${perms.delete ? 'bg-danger text-white' : 'bg-gray-100 text-gray-400'} ${(!role.editable || !perms.edit) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                                  onClick={() => canEditPerm && perms.edit && toggleModulePermission(role.key, mod.key, 'delete')}
                                >刪除</button>
                              </div>
                            )}
                            {!enabled && <span className="text-[9px] text-gray-300">無權限</span>}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700">
        <Info size={13} className="flex-shrink-0 mt-0.5" />
        <span>模組開關關閉後，對應角色在人員權限設定中的修改/刪除開關將自動顯示為「無權限」且無法開啟。此設定與「權限設定」頁面同步。</span>
      </div>

      {/* 新增角色 Modal */}
      {showNewRole && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold">新增自訂角色</h3>
              <button className="btn btn-sm" onClick={() => { setShowNewRole(false); reset(); }}>關閉</button>
            </div>
            <form onSubmit={handleSubmit(onAddRole)} className="p-5 space-y-4">
              <div>
                <label className="form-label">角色名稱 *</label>
                <input {...register('label', { required: '請填寫角色名稱' })} className="form-control" placeholder="例：現場主任、業務人員" />
              </div>
              <div>
                <label className="form-label">標籤顏色</label>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_OPTIONS.map(c => (
                    <label key={c.key} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" {...register('color')} value={c.key} className="sr-only" />
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium cursor-pointer border-2 transition-all ${colorClass(c.key)} ${watch('color') === c.key ? 'border-primary' : 'border-transparent'}`}>
                        {c.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="form-label">可存取的功能模組</label>
                <div className="space-y-2">
                  {ALL_MODULES.map(mod => (
                    <label key={mod.key} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" {...register('modules')} value={mod.key} className="rounded" />
                      <span className="text-sm text-gray-700">{mod.label}</span>
                      <span className="text-xs text-gray-400">— {mod.desc}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn" onClick={() => { setShowNewRole(false); reset(); }}>取消</button>
                <button type="submit" className="btn btn-primary">建立角色</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 主頁面 ────────────────────────────────────────────────────
export default function SystemSettingsPage() {
  const [tab, setTab] = useState('finance');

  const TABS = [
    { key: 'finance', label: '財務管理', icon: CreditCard },
    { key: 'roles',   label: '角色管理', icon: Users },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">功能設定</h1>
          <p className="text-xs text-gray-400 mt-0.5">系統功能參數設定、角色管理與模組權限</p>
        </div>
      </div>

      <div className="flex gap-0 mb-5 border-b border-gray-100">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors ${tab === key ? 'border-primary text-primary font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'finance' && (
        <div className="card card-body">
          <BankAccountSettings />
        </div>
      )}

      {tab === 'roles' && (
        <div className="card card-body">
          <RoleSettings />
        </div>
      )}
    </div>
  );
}
