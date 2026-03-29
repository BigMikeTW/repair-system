import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useForm } from 'react-hook-form';
import { Plus, Edit2, Trash2, Check, X, Tag } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const caseTypesAPI = {
  list: () => api.get('/case-types'),
  create: (data) => api.post('/case-types', data),
  update: (id, data) => api.put(`/case-types/${id}`, data),
  delete: (id) => api.delete(`/case-types/${id}`),
};

function EditRow({ type, onSave, onCancel }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      name: type?.name || '',
      description: type?.description || '',
      sort_order: type?.sort_order ?? 99
    }
  });
  return (
    <tr className="bg-primary-light/30">
      <td className="px-4 py-2 w-8"></td>
      <td className="px-4 py-2">
        <input {...register('name', { required: true })} className="form-control text-sm py-1.5 w-full" placeholder="類型名稱" autoFocus />
      </td>
      <td className="px-4 py-2">
        <input {...register('description')} className="form-control text-sm py-1.5 w-full" placeholder="說明（選填）" />
      </td>
      <td className="px-4 py-2 w-24">
        <input {...register('sort_order')} type="number" className="form-control text-sm py-1.5 w-full" placeholder="排序" />
      </td>
      <td className="px-4 py-2 w-24"></td>
      <td className="px-4 py-2 w-28">
        <div className="flex gap-1.5">
          <button type="button" disabled={isSubmitting} onClick={handleSubmit(onSave)} className="btn btn-primary btn-sm px-3 gap-1">
            <Check size={12} /> 儲存
          </button>
          <button type="button" className="btn btn-sm px-2" onClick={onCancel}><X size={12} /></button>
        </div>
      </td>
    </tr>
  );
}

export default function CaseTypesPage() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const { data: types, isLoading } = useQuery('caseTypes', () => caseTypesAPI.list().then(r => r.data));

  const createMutation = useMutation(
    (data) => caseTypesAPI.create(data),
    { onSuccess: () => { toast.success('類型已新增'); qc.invalidateQueries('caseTypes'); setShowAdd(false); } }
  );

  const updateMutation = useMutation(
    ({ id, data }) => caseTypesAPI.update(id, data),
    { onSuccess: () => { toast.success('類型已更新'); qc.invalidateQueries('caseTypes'); setEditingId(null); } }
  );

  const deleteMutation = useMutation(
    (id) => caseTypesAPI.delete(id),
    { onSuccess: (res) => { toast.success(res.data.message || '已刪除'); qc.invalidateQueries('caseTypes'); } }
  );

  const toggleActive = (type) => {
    updateMutation.mutate({
      id: type.id,
      data: { name: type.name, description: type.description, sort_order: type.sort_order, is_active: !type.is_active }
    });
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">報修類型管理</h1>
          <p className="text-xs text-gray-400 mt-0.5">新增、修改或停用報修類型</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowAdd(true); setEditingId(null); }}>
          <Plus size={14} /> 新增類型
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <Tag size={15} className="text-gray-400" />
            <span className="card-title">目前類型列表</span>
          </div>
          <span className="badge badge-primary">{types?.filter(t => t.is_active).length || 0} 個啟用中</span>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-gray-400">載入中...</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 w-10">#</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3" style={{width:'200px'}}>類型名稱</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">說明</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 w-20">排序</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 w-20">狀態</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 w-24">操作</th>
              </tr>
            </thead>
            <tbody>
              {showAdd && (
                <EditRow onSave={(data) => createMutation.mutate(data)} onCancel={() => setShowAdd(false)} />
              )}
              {types?.map((type, idx) => (
                editingId === type.id ? (
                  <EditRow
                    key={type.id}
                    type={type}
                    onSave={(data) => updateMutation.mutate({ id: type.id, data: { ...data, is_active: type.is_active } })}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <tr key={type.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${!type.is_active ? 'opacity-40' : ''}`}>
                    <td className="px-4 py-3 text-xs text-gray-300">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-800">{type.name}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {type.description || <span className="text-gray-300">--</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400 text-center">{type.sort_order}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleActive(type)} className={`badge cursor-pointer hover:opacity-70 ${type.is_active ? 'badge-success' : 'badge-gray'}`}>
                        {type.is_active ? '啟用' : '停用'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button className="btn btn-sm px-2.5" onClick={() => { setEditingId(type.id); setShowAdd(false); }}>
                          <Edit2 size={12} />
                        </button>
                        <button
                          className="btn btn-sm px-2.5 hover:bg-danger-light hover:text-danger"
                          onClick={() => { if (window.confirm(`確定要刪除「${type.name}」？`)) deleteMutation.mutate(type.id); }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
              {!types?.length && !showAdd && (
                <tr><td colSpan="6" className="py-16 text-center text-sm text-gray-400">尚無報修類型</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="card card-body bg-primary-light border-primary/10">
        <p className="text-xs text-primary-dark">
          💡 <strong>說明</strong>：停用的類型不會出現在新增案件的選單中，但已使用此類型的舊案件不受影響。排序數字越小越靠前，點擊狀態標籤可快速切換。
        </p>
      </div>
    </div>
  );
}
