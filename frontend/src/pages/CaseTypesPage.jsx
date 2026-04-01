import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useForm } from 'react-hook-form';
import { Plus, Edit2, Trash2, GripVertical, Check, X } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const caseTypesAPI = {
  list: () => api.get('/case-types'),
  create: (data) => api.post('/case-types', data),
  update: (id, data) => api.put(`/case-types/${id}`, data),
  delete: (id) => api.delete(`/case-types/${id}`),
};

function InlineEdit({ type, onSave, onCancel }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: { name: type?.name || '', description: type?.description || '', sort_order: type?.sort_order || 99 }
  });
  return (
    <form onSubmit={handleSubmit(onSave)} className="flex items-center gap-2 py-1">
      <input {...register('name', { required: true })} className="form-control text-sm py-1.5 w-32" placeholder="類型名稱" autoFocus />
      <input {...register('description')} className="form-control text-sm py-1.5 flex-1" placeholder="說明（選填）" />
      <input {...register('sort_order')} type="number" className="form-control text-sm py-1.5 w-16" placeholder="排序" />
      <button type="submit" disabled={isSubmitting} className="btn btn-primary btn-sm px-2"><Check size={13} /></button>
      <button type="button" className="btn btn-sm px-2" onClick={onCancel}><X size={13} /></button>
    </form>
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
    { onSuccess: (res) => { toast.success(res.data.message); qc.invalidateQueries('caseTypes'); } }
  );

  const toggleActive = (type) => {
    updateMutation.mutate({ id: type.id, data: { ...type, is_active: !type.is_active } });
  };

  return (
    <div className="page-container max-w-2xl">
      <div className="page-header">
        <div>
          <h1 className="page-title">報修類型</h1>
          <p className="text-xs text-gray-400 mt-0.5">新增、修改、停用報修類型</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> 新增類型
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">
          <span className="card-title">目前類型列表</span>
          <span className="badge badge-primary">{types?.filter(t => t.is_active).length || 0} 個啟用中</span>
        </div>

        {/* Add new row */}
        {showAdd && (
          <div className="px-4 py-3 bg-primary-light border-b border-primary/10">
            <InlineEdit
              onSave={(data) => createMutation.mutate(data)}
              onCancel={() => setShowAdd(false)}
            />
          </div>
        )}

        {isLoading ? (
          <div className="py-12 text-center text-sm text-gray-400">載入中...</div>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th style={{ width: 30 }}></th>
                <th>類型名稱</th>
                <th>說明</th>
                <th style={{ width: 60 }}>排序</th>
                <th style={{ width: 80 }}>狀態</th>
                <th style={{ width: 90 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {types?.map(type => (
                <tr key={type.id} className={!type.is_active ? 'opacity-40' : ''}>
                  <td><GripVertical size={14} className="text-gray-300" /></td>
                  <td>
                    {editingId === type.id ? (
                      <InlineEdit
                        type={type}
                        onSave={(data) => updateMutation.mutate({ id: type.id, data: { ...data, is_active: type.is_active } })}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <span className="text-sm font-medium truncate max-w-[150px]">{type.name}</span>
                    )}
                  </td>
                  {editingId !== type.id && (
                    <>
                      <td className="text-xs text-gray-400 max-w-[200px]"><div className="truncate">{type.description || '--'}</div></td>
                      <td className="text-xs text-gray-400 text-center">{type.sort_order}</td>
                      <td>
                        <button
                          onClick={() => toggleActive(type)}
                          className={`badge cursor-pointer ${type.is_active ? 'badge-success' : 'badge-gray'}`}
                        >
                          {type.is_active ? '啟用' : '停用'}
                        </button>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <button className="btn btn-sm px-2" onClick={() => setEditingId(type.id)}>
                            <Edit2 size={12} />
                          </button>
                          <button
                            className="btn btn-sm px-2 hover:bg-danger-light hover:text-danger"
                            onClick={() => {
                              if (window.confirm(`確定要刪除「${type.name}」？`)) {
                                deleteMutation.mutate(type.id);
                              }
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {!types?.length && (
                <tr><td colSpan="6" className="py-12 text-center text-sm text-gray-400">尚無類型，點上方「新增類型」開始建立</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="card card-body bg-primary-light border-primary/10">
        <p className="text-xs text-primary-dark">
          💡 <strong>提示</strong>：停用的類型不會出現在新增案件的選單中，但已使用此類型的舊案件不受影響。排序數字越小越前面。
        </p>
      </div>
    </div>
  );
}
