import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Trash2, Save, CreditCard, Users, Info, Edit2, X, Check, FileText, Building2, StickyNote, Upload } from 'lucide-react';
import toast from 'react-hot-toast';

// ── 儲存/讀取工具 ─────────────────────────────────────────────
const storage = {
  getBankAccounts: () => { try { return JSON.parse(localStorage.getItem('default_bank_accounts') || '[]'); } catch { return []; } },
  saveBankAccounts: (v) => localStorage.setItem('default_bank_accounts', JSON.stringify(v)),
  getRoles: () => {
    try {
      const s = localStorage.getItem('custom_roles');
      if (s) return JSON.parse(s);
    } catch {}
    return DEFAULT_ROLES();
  },
  saveRoles: (v) => localStorage.setItem('custom_roles', JSON.stringify(v)),
  getPermissions: () => { try { return JSON.parse(localStorage.getItem('repair_system_permissions') || '{}'); } catch { return {}; } },
  savePermissions: (v) => localStorage.setItem('repair_system_permissions', JSON.stringify(v)),
};

function DEFAULT_ROLES() {
  return [
    { key: 'admin',            label: '系統管理員', color: 'purple', modules: ['cases','photos','finance','notes','dispatch','users','settings'], editable: false },
    { key: 'customer_service', label: '客服人員',   color: 'blue',   modules: ['cases','photos','finance','notes','dispatch'], editable: true },
    { key: 'engineer',         label: '工程師',     color: 'teal',   modules: ['cases','photos','notes'], editable: true },
    { key: 'owner',            label: '業主',       color: 'gray',   modules: ['cases'], editable: true },
  ];
}

const ALL_MODULES = [
  { key: 'cases',    label: '案件管理',   desc: '案件建立、查看、追蹤' },
  { key: 'dispatch', label: '派工管理',   desc: '派工、取消、重新指派' },
  { key: 'finance',  label: '帳務管理',   desc: '報價單、結案單、請款單、收款單' },
  { key: 'photos',   label: '照片記錄',   desc: '施工照片上傳與管理' },
  { key: 'notes',    label: '案件記錄',   desc: '現場施工記錄' },
  { key: 'users',    label: '人員管理',   desc: '人員帳號與 HR 資料' },
  { key: 'settings', label: '系統設定',   desc: '功能設定與角色管理' },
];

const COLOR_OPTIONS = [
  { key: 'purple', label: '紫色', bg: 'bg-purple-100', text: 'text-purple-700' },
  { key: 'blue',   label: '藍色', bg: 'bg-blue-100',   text: 'text-blue-700' },
  { key: 'teal',   label: '青色', bg: 'bg-teal-100',   text: 'text-teal-700' },
  { key: 'green',  label: '綠色', bg: 'bg-green-100',  text: 'text-green-700' },
  { key: 'orange', label: '橘色', bg: 'bg-orange-100', text: 'text-orange-700' },
  { key: 'gray',   label: '灰色', bg: 'bg-gray-100',   text: 'text-gray-700' },
];

const getColor = (colorKey) => COLOR_OPTIONS.find(c => c.key === colorKey) || COLOR_OPTIONS[5];

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
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-semibold text-gray-900">預設收款帳號</h3>
          <p className="text-sm text-gray-500 mt-0.5">新增後，建立收款單時可直接選擇，不需每次手動輸入</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={14} /> 新增帳號
        </button>
      </div>

      {accounts.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
          尚無預設收款帳號，點右上角「新增帳號」建立
        </div>
      )}

      <div className="space-y-3">
        {accounts.map((acc, i) => (
          <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl px-5 py-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-primary-light rounded-xl flex items-center justify-center">
                <CreditCard size={18} className="text-primary" />
              </div>
              <div>
                <div className="font-semibold text-gray-900">{acc.bank_name}</div>
                <div className="text-sm text-gray-500 font-mono mt-0.5">{acc.account_number}</div>
                {acc.account_name && <div className="text-sm text-gray-400">戶名：{acc.account_name}</div>}
                {acc.notes && <div className="text-xs text-gray-400 mt-0.5">{acc.notes}</div>}
              </div>
            </div>
            <button onClick={() => onDelete(i)} className="btn btn-sm text-danger border-red-200 hover:bg-red-50">
              <Trash2 size={13} /> 刪除
            </button>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">新增收款帳號</h3>
              <button className="btn btn-sm" onClick={() => { setShowForm(false); reset(); }}>關閉</button>
            </div>
            <form onSubmit={handleSubmit(onAdd)} className="p-5 space-y-4">
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
                <label className="form-label">備註（選填）</label>
                <input {...register('notes')} className="form-control" placeholder="例：公司主帳戶" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
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

// ── 角色編輯 Modal ────────────────────────────────────────────
function RoleEditModal({ role, onClose, onSave }) {
  const [label, setLabel] = useState(role.label);
  const [color, setColor] = useState(role.color || 'blue');
  const [modules, setModules] = useState(role.modules || []);
  const [permissions, setPermissions] = useState(storage.getPermissions());

  const toggleModule = (modKey) => {
    setModules(prev => {
      const next = prev.includes(modKey) ? prev.filter(m => m !== modKey) : [...prev, modKey];
      // If module disabled, clear permissions
      if (!next.includes(modKey)) {
        setPermissions(p => {
          const np = JSON.parse(JSON.stringify(p));
          if (np[modKey]?.[role.key]) np[modKey][role.key] = { edit: false, delete: false };
          return np;
        });
      } else {
        // Module enabled - grant edit by default
        setPermissions(p => {
          const np = JSON.parse(JSON.stringify(p));
          if (!np[modKey]) np[modKey] = {};
          if (!np[modKey][role.key]) np[modKey][role.key] = { edit: true, delete: false };
          return np;
        });
      }
      return next;
    });
  };

  const togglePerm = (modKey, action) => {
    if (!modules.includes(modKey)) return;
    setPermissions(p => {
      const np = JSON.parse(JSON.stringify(p));
      if (!np[modKey]) np[modKey] = {};
      if (!np[modKey][role.key]) np[modKey][role.key] = { edit: false, delete: false };
      np[modKey][role.key][action] = !np[modKey][role.key][action];
      if (action === 'edit' && !np[modKey][role.key][action]) {
        np[modKey][role.key].delete = false;
      }
      return np;
    });
  };

  const handleSave = () => {
    if (!label.trim()) { toast.error('請填寫角色名稱'); return; }
    storage.savePermissions(permissions);
    onSave({ ...role, label: label.trim(), color, modules });
    toast.success(`角色「${label}」已更新`);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">編輯角色：{role.label}</h2>
          <button className="btn btn-sm" onClick={onClose}><X size={14} /> 關閉</button>
        </div>

        <div className="p-6 space-y-6">
          {/* 基本資訊 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">基本資訊</h3>
            <div className="space-y-4">
              <div>
                <label className="form-label">角色名稱 *</label>
                <input
                  className="form-control"
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="角色名稱"
                />
              </div>
              <div>
                <label className="form-label">標籤顏色</label>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_OPTIONS.map(c => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setColor(c.key)}
                      className={`text-sm px-3 py-1.5 rounded-full font-medium border-2 transition-all ${c.bg} ${c.text} ${color === c.key ? 'border-primary scale-105 shadow-sm' : 'border-transparent'}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 功能模組與權限設定 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-gray-700">功能模組與操作權限</h3>
              <span className="text-xs text-gray-400">（開啟模組後可設定修改/刪除權限）</span>
            </div>

            <div className="space-y-2">
              {ALL_MODULES.map(mod => {
                const enabled = modules.includes(mod.key);
                const perms = permissions[mod.key]?.[role.key] || { edit: false, delete: false };

                return (
                  <div key={mod.key} className={`rounded-xl border-2 transition-all ${enabled ? 'border-primary/30 bg-blue-50/30' : 'border-gray-100 bg-gray-50'}`}>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        {/* Module toggle */}
                        <div
                          className={`w-11 h-6 rounded-full relative cursor-pointer transition-colors flex-shrink-0 ${enabled ? 'bg-primary' : 'bg-gray-300'}`}
                          onClick={() => toggleModule(mod.key)}
                        >
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-gray-900">{mod.label}</div>
                          <div className="text-xs text-gray-500">{mod.desc}</div>
                        </div>
                      </div>

                      {/* Permission buttons */}
                      {enabled && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => togglePerm(mod.key, 'edit')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-all ${
                              perms.edit
                                ? 'bg-primary text-white border-primary'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-primary'
                            }`}
                          >
                            {perms.edit && <Check size={13} />} 修改
                          </button>
                          <button
                            type="button"
                            onClick={() => perms.edit && togglePerm(mod.key, 'delete')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-all ${
                              perms.delete
                                ? 'bg-danger text-white border-danger'
                                : perms.edit
                                  ? 'bg-white text-gray-500 border-gray-200 hover:border-danger'
                                  : 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                            }`}
                          >
                            {perms.delete && <Check size={13} />} 刪除
                          </button>
                        </div>
                      )}
                      {!enabled && (
                        <span className="text-sm text-gray-400 italic">無存取權限</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSave}>
            <Save size={14} /> 儲存變更
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 角色管理主區塊 ────────────────────────────────────────────
function RoleSettings() {
  const [roles, setRoles] = useState(storage.getRoles);
  const [editingRole, setEditingRole] = useState(null);
  const [showNewRole, setShowNewRole] = useState(false);
  const { register, handleSubmit, reset, watch } = useForm({ defaultValues: { color: 'blue' } });
  const watchColor = watch('color');

  const saveRoles = (newRoles) => {
    setRoles(newRoles);
    storage.saveRoles(newRoles);
  };

  const onSaveRole = (updatedRole) => {
    saveRoles(roles.map(r => r.key === updatedRole.key ? updatedRole : r));
  };

  const onAddRole = (data) => {
    const key = `custom_${Date.now()}`;
    const newRole = {
      key,
      label: data.label,
      color: data.color || 'blue',
      modules: [],
      editable: true,
    };
    saveRoles([...roles, newRole]);
    toast.success(`角色「${data.label}」已建立，請點擊編輯設定模組權限`);
    setShowNewRole(false);
    reset();
    // Auto open edit
    setTimeout(() => setEditingRole(newRole), 100);
  };

  const onDeleteRole = (roleKey) => {
    const role = roles.find(r => r.key === roleKey);
    if (!window.confirm(`確定刪除角色「${role.label}」？`)) return;
    saveRoles(roles.filter(r => r.key !== roleKey));
    toast.success('角色已刪除');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-semibold text-gray-900">角色管理</h3>
          <p className="text-sm text-gray-500 mt-0.5">設定各角色可存取的功能模組與操作權限，與「權限設定」頁面同步</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNewRole(true)}>
          <Plus size={14} /> 新增角色
        </button>
      </div>

      {/* 角色卡片列表 */}
      <div className="space-y-3">
        {roles.map(role => {
          const color = getColor(role.color);
          const isAdmin = role.key === 'admin';

          return (
            <div key={role.key} className="card p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`${color.bg} ${color.text} px-3 py-1.5 rounded-full text-sm font-semibold`}>
                    {role.label}
                  </div>
                  {isAdmin && (
                    <span className="text-xs text-purple-500 bg-purple-50 px-2 py-1 rounded-full">系統內建，完整權限</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    className="btn btn-sm gap-1.5"
                    onClick={() => setEditingRole(role)}
                  >
                    <Edit2 size={13} /> 編輯
                  </button>
                  {role.editable && !isAdmin && (
                    <button
                      className="btn btn-sm text-danger border-red-200 hover:bg-red-50"
                      onClick={() => onDeleteRole(role.key)}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* 模組標籤 */}
              <div className="flex flex-wrap gap-2 mt-4">
                {isAdmin ? (
                  <span className="text-xs text-gray-400">擁有所有功能模組的完整存取權限</span>
                ) : role.modules?.length > 0 ? (
                  role.modules.map(modKey => {
                    const mod = ALL_MODULES.find(m => m.key === modKey);
                    const perms = storage.getPermissions()[modKey]?.[role.key] || {};
                    return mod ? (
                      <div key={modKey} className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1">
                        <span className="text-sm text-gray-700">{mod.label}</span>
                        {perms.edit && <span className="text-xs text-primary bg-primary-light px-1.5 py-0.5 rounded">修改</span>}
                        {perms.delete && <span className="text-xs text-danger bg-danger-light px-1.5 py-0.5 rounded">刪除</span>}
                      </div>
                    ) : null;
                  })
                ) : (
                  <span className="text-sm text-gray-400 italic">尚未設定任何功能模組，請點擊「編輯」進行設定</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl p-4 mt-4 text-sm text-blue-700">
        <Info size={15} className="flex-shrink-0 mt-0.5" />
        <span>此處設定的模組權限會與「權限設定」頁面同步。若角色無某功能模組，該角色在「權限設定」中的對應欄位將顯示「無模組權限」。</span>
      </div>

      {/* 新增角色 Modal */}
      {showNewRole && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">新增自訂角色</h3>
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
                    <label key={c.key} className="cursor-pointer">
                      <input type="radio" {...register('color')} value={c.key} className="sr-only" />
                      <span className={`block text-sm px-3 py-1.5 rounded-full font-medium border-2 transition-all ${c.bg} ${c.text} ${watchColor === c.key ? 'border-primary scale-105' : 'border-transparent'}`}>
                        {c.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <p className="text-sm text-gray-500">建立後可在角色卡片點擊「編輯」設定功能模組與操作權限。</p>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn" onClick={() => { setShowNewRole(false); reset(); }}>取消</button>
                <button type="submit" className="btn btn-primary">建立角色</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 編輯角色 Modal */}
      {editingRole && (
        <RoleEditModal
          role={editingRole}
          onClose={() => setEditingRole(null)}
          onSave={onSaveRole}
        />
      )}
    </div>
  );
}

// ── PDF 模組選項 ─────────────────────────────────────────────
const PDF_MODULES = [
  { key: 'quotation', label: '報價單' },
  { key: 'invoice',   label: '請款單' },
  { key: 'receipt',   label: '收款單' },
  { key: 'closure',   label: '結案報告' },
];

// ── 自定備註設定 ─────────────────────────────────────────────
function RemarksSettings() {
  const getRemarks = () => { try { return JSON.parse(localStorage.getItem('custom_remarks') || '[]'); } catch { return []; } };
  const saveRemarks = (v) => localStorage.setItem('custom_remarks', JSON.stringify(v));

  const [remarks, setRemarks] = useState(getRemarks);
  const [form, setForm] = useState(null); // null=closed, {}=new, {..data}=edit
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [modules, setModules] = useState([]);

  const openNew = () => { setForm({}); setName(''); setContent(''); setModules([]); };
  const openEdit = (r, idx) => { setForm({ idx }); setName(r.name); setContent(r.content||''); setModules(r.modules||[]); };

  const save = () => {
    if (!name.trim()) return toast.error('請輸入備註名稱');
    const newRemark = { id: form.idx !== undefined ? remarks[form.idx].id : Date.now(), name: name.trim(), content: content.trim(), modules };
    let updated;
    if (form.idx !== undefined) {
      updated = remarks.map((r, i) => i === form.idx ? newRemark : r);
    } else {
      updated = [...remarks, newRemark];
    }
    saveRemarks(updated);
    setRemarks(updated);
    setForm(null);
    toast.success(form.idx !== undefined ? '備註已更新' : '備註已新增');
  };

  const remove = (idx) => {
    if (!window.confirm('確定刪除此備註？')) return;
    const updated = remarks.filter((_, i) => i !== idx);
    saveRemarks(updated);
    setRemarks(updated);
    toast.success('已刪除');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">自定備註</h3>
          <p className="text-sm text-gray-400 mt-0.5">設定 PDF 文件備註，可選擇適用的文件類型</p>
        </div>
        <button className="btn btn-sm btn-primary gap-1" onClick={openNew}><Plus size={13} /> 新增備註</button>
      </div>

      {remarks.length === 0 && (
        <div className="text-center py-10 text-gray-400 text-sm">尚無自定備註</div>
      )}
      <div className="space-y-2">
        {remarks.map((r, idx) => (
          <div key={r.id} className="flex items-start justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex-1">
              <div className="font-medium text-gray-900">{r.name}</div>
              {r.content && <div className="text-sm text-gray-500 mt-1">{r.content}</div>}
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {r.modules?.map(m => {
                  const mod = PDF_MODULES.find(p => p.key === m);
                  return <span key={m} className="badge badge-primary text-xs">{mod?.label||m}</span>;
                })}
                {(!r.modules || r.modules.length === 0) && <span className="text-xs text-gray-400">未設定適用模組</span>}
              </div>
            </div>
            <div className="flex gap-1 ml-3">
              <button className="btn btn-sm" onClick={() => openEdit(r, idx)}><Edit2 size={12} /></button>
              <button className="btn btn-sm text-danger border-red-200" onClick={() => remove(idx)}><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>

      {form && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold">{form.idx !== undefined ? '修改備註' : '新增備註'}</h3>
              <button className="btn btn-sm" onClick={() => setForm(null)}><X size={14} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="form-label">備註名稱 *</label>
                <input value={name} onChange={e => setName(e.target.value)} className="form-control" placeholder="例：施工保固聲明" />
              </div>
              <div>
                <label className="form-label">備註內容</label>
                <textarea value={content} onChange={e => setContent(e.target.value)} className="form-textarea" rows={4} placeholder="備註文字內容..." />
              </div>
              <div>
                <label className="form-label">適用文件類型</label>
                <div className="grid grid-cols-2 gap-2">
                  {PDF_MODULES.map(mod => (
                    <label key={mod.key} className={`flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all ${modules.includes(mod.key) ? 'border-primary bg-primary-light' : 'border-gray-200'}`}>
                      <input type="checkbox" checked={modules.includes(mod.key)}
                        onChange={() => setModules(prev => prev.includes(mod.key) ? prev.filter(k => k !== mod.key) : [...prev, mod.key])}
                        className="w-4 h-4 rounded" />
                      <span className="text-sm font-medium">{mod.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button className="btn" onClick={() => setForm(null)}>取消</button>
              <button className="btn btn-primary" onClick={save}>儲存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 報表擡頭設定 ─────────────────────────────────────────────
function CompanyHeaderSettings() {
  const getHeaders = () => { try { return JSON.parse(localStorage.getItem('company_headers') || '[]'); } catch { return []; } };
  const saveHeaders = (v) => localStorage.setItem('company_headers', JSON.stringify(v));

  const [headers, setHeaders] = useState(getHeaders);
  const [form, setForm] = useState(null);
  const [fd, setFd] = useState({});

  const openNew = () => { setForm({}); setFd({}); };
  const openEdit = (h, idx) => { setForm({ idx }); setFd({ ...h }); };

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setFd(prev => ({ ...prev, logo: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const setDefault = (idx) => {
    const updated = headers.map((h, i) => ({ ...h, isDefault: i === idx }));
    saveHeaders(updated);
    setHeaders(updated);
    toast.success('已設定為預設公司');
  };

  const save = () => {
    if (!fd.name_zh?.trim()) return toast.error('請輸入公司中文全名');
    const header = { id: form.idx !== undefined ? headers[form.idx].id : Date.now(), ...fd };
    let updated;
    if (form.idx !== undefined) {
      updated = headers.map((h, i) => i === form.idx ? header : h);
    } else {
      // 若是第一筆，自動設為預設
      header.isDefault = headers.length === 0;
      updated = [...headers, header];
    }
    saveHeaders(updated);
    setHeaders(updated);
    setForm(null);
    toast.success(form.idx !== undefined ? '擡頭已更新' : '擡頭已新增');
  };

  const remove = (idx) => {
    if (!window.confirm('確定刪除此擡頭設定？')) return;
    const updated = headers.filter((_, i) => i !== idx);
    saveHeaders(updated);
    setHeaders(updated);
    toast.success('已刪除');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">報表擡頭設定</h3>
          <p className="text-sm text-gray-400 mt-0.5">設定 PDF 文件左上角的公司資訊</p>
        </div>
        <button className="btn btn-sm btn-primary gap-1" onClick={openNew}><Plus size={13} /> 新增擡頭</button>
      </div>

      {headers.length === 0 && (
        <div className="text-center py-10 text-gray-400 text-sm">尚無擡頭設定，下載 PDF 時將使用預設值「Pro080」</div>
      )}
      <div className="space-y-2">
        {headers.map((h, idx) => (
          <div key={h.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex items-center gap-4">
              {h.logo && <img src={h.logo} alt="logo" className="w-10 h-10 object-contain rounded" />}
              <div>
                <div className="font-semibold">{h.name_zh}</div>
                {h.name_en && <div className="text-sm text-gray-400">{h.name_en}</div>}
                {h.abbr_zh && <div className="text-xs text-gray-400">縮寫：{h.abbr_zh}{h.abbr_en ? ` / ${h.abbr_en}` : ''}</div>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {h.isDefault
                ? <span className="badge badge-success text-xs">預設</span>
                : <button className="btn btn-sm text-xs" onClick={() => setDefault(idx)}>設為預設</button>
              }
              <button className="btn btn-sm" onClick={() => openEdit(h, idx)}><Edit2 size={12} /></button>
              <button className="btn btn-sm text-danger border-red-200" onClick={() => remove(idx)}><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>

      {form && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold">{form.idx !== undefined ? '修改擡頭' : '新增擡頭'}</h3>
              <button className="btn btn-sm" onClick={() => setForm(null)}><X size={14} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="form-label">公司中文全名 *</label>
                  <input value={fd.name_zh||''} onChange={e => setFd(p=>({...p,name_zh:e.target.value}))} className="form-control" placeholder="例：Pro080有限公司" />
                </div>
                <div className="col-span-2">
                  <label className="form-label">公司英文全名</label>
                  <input value={fd.name_en||''} onChange={e => setFd(p=>({...p,name_en:e.target.value}))} className="form-control" placeholder="例：HuangXiang Engineering Design Co., Ltd." />
                </div>
                <div>
                  <label className="form-label">中文縮寫</label>
                  <input value={fd.abbr_zh||''} onChange={e => setFd(p=>({...p,abbr_zh:e.target.value}))} className="form-control" placeholder="皇祥工程" />
                </div>
                <div>
                  <label className="form-label">英文縮寫</label>
                  <input value={fd.abbr_en||''} onChange={e => setFd(p=>({...p,abbr_en:e.target.value}))} className="form-control" placeholder="HX Engineering" />
                </div>
              </div>
              <div>
                <label className="form-label">公司 Slogan</label>
                <input value={fd.slogan||''} onChange={e => setFd(p=>({...p,slogan:e.target.value}))} className="form-control" placeholder="選填" />
              </div>
              <div>
                <label className="form-label">公司 LOGO</label>
                <div className="flex items-center gap-3">
                  {fd.logo && <img src={fd.logo} alt="logo" className="w-16 h-16 object-contain rounded border border-gray-200" />}
                  <label className="btn btn-sm gap-1 cursor-pointer">
                    <Upload size={12} /> 上傳 LOGO
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                  </label>
                  {fd.logo && <button className="btn btn-sm text-danger border-red-200" onClick={() => setFd(p=>({...p,logo:null}))}>移除</button>}
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button className="btn" onClick={() => setForm(null)}>取消</button>
              <button className="btn btn-primary" onClick={save}>儲存</button>
            </div>
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
    { key: 'finance', label: '帳務管理',   icon: CreditCard },
    { key: 'roles',   label: '角色管理',   icon: Users },
    { key: 'remarks', label: '自定備註',   icon: StickyNote },
    { key: 'headers', label: '報表擡頭',   icon: Building2 },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">功能設定</h1>
          <p className="text-sm text-gray-500 mt-0.5">系統功能參數設定、角色管理、備註與報表擡頭</p>
        </div>
      </div>

      <div className="flex gap-0 mb-5 border-b border-gray-100">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-5 py-3 text-base font-medium border-b-2 transition-colors ${tab === key ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === 'finance'  && <div className="card card-body"><BankAccountSettings /></div>}
      {tab === 'roles'    && <div className="card card-body"><RoleSettings /></div>}
      {tab === 'remarks'  && <div className="card card-body"><RemarksSettings /></div>}
      {tab === 'headers'  && <div className="card card-body"><CompanyHeaderSettings /></div>}
    </div>
  );
}

export { storage };