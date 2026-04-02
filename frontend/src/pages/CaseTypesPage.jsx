import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useForm } from 'react-hook-form';
import { Plus, Edit2, Trash2, GripVertical, Check, X } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const caseTypesAPI = {
  list:         ()           => api.get('/case-types/all'),
  create:       (data)       => api.post('/case-types', data),
  update:       (id, data)   => api.put(`/case-types/${id}`, data),
  delete:       (id)         => api.delete(`/case-types/${id}`),
  reorder:      (orderedIds) => api.put('/case-types/reorder', { orderedIds }),
};

// ── 新增/編輯表單 ────────────────────────────────────────────────
// nameWidth: 類型名稱欄的 td offsetWidth，讓說明 input 左側精準對齊說明欄
function TypeForm({ type, onSave, onCancel, nameWidth }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      name: type?.name || '',
      description: type?.description || '',
    }
  });

  return (
    <form
      onSubmit={handleSubmit(onSave)}
      className="flex items-center w-full"
      style={{ gap: 0 }}
    >
      {/* 名稱 input：寬度 = 類型名稱欄 td 寬度，說明 input 左側自然對齊說明欄左側 */}
      <div style={{ width: nameWidth || 160, flexShrink: 0, paddingRight: 8 }}>
        <input
          {...register('name', { required: true })}
          className="form-control text-sm py-1.5 w-full"
          placeholder="類型名稱"
          autoFocus
        />
      </div>
      {/* 說明 input：flex-1，左側自然對齊說明欄左側 */}
      <div className="flex flex-1 items-center gap-2">
        <input
          {...register('description')}
          className="form-control text-sm py-1.5 flex-1"
          placeholder="說明（選填）"
        />
        <button type="submit" disabled={isSubmitting} className="btn btn-primary btn-sm px-2 flex-shrink-0">
          <Check size={13} />
        </button>
        <button type="button" className="btn btn-sm px-2 flex-shrink-0" onClick={onCancel}>
          <X size={13} />
        </button>
      </div>
    </form>
  );
}

export default function CaseTypesPage() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const dragItem     = useRef(null);
  const dragOverItem = useRef(null);
  const [localTypes, setLocalTypes] = useState(null);
  const nameColRef   = useRef(null); // 量測名稱欄寬度用
  const [nameColWidth, setNameColWidth] = useState(140);

  const { data: types, isLoading } = useQuery('caseTypes', () =>
    caseTypesAPI.list().then(r => r.data),
    { onSuccess: (data) => setLocalTypes(data) }
  );

  const displayTypes = localTypes || types || [];

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

  const reorderMutation = useMutation(
    (orderedIds) => caseTypesAPI.reorder(orderedIds),
    { onSuccess: () => { qc.invalidateQueries('caseTypes'); toast.success('排序已更新'); } }
  );

  const toggleActive = (type) => {
    updateMutation.mutate({ id: type.id, data: { ...type, is_active: !type.is_active } });
  };

  // ── 量測名稱欄寬度（用於對齊表單欄位）─────────────────────────
  useEffect(() => {
    if (nameColRef.current) {
      setNameColWidth(nameColRef.current.offsetWidth);
    }
  }, [localTypes]);

  // ── 拖曳排序處理（限縮把手區域觸發）────────────────────────────
  const handleDragStart = (e, index) => {
    dragItem.current = index;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnter = (e, index) => {
    dragOverItem.current = index;
    if (dragItem.current === null || dragItem.current === index) return;
    const newList = [...displayTypes];
    const dragged = newList.splice(dragItem.current, 1)[0];
    newList.splice(index, 0, dragged);
    dragItem.current = index;
    setLocalTypes(newList);
  };

  const handleDragEnd = () => {
    const orderedIds = displayTypes.map(t => t.id);
    reorderMutation.mutate(orderedIds);
    dragItem.current   = null;
    dragOverItem.current = null;
  };

  return (
    <div className="page-container w-full max-w-full">
      {/* 頁首 */}
      <div className="page-header">
        <div>
          <h1 className="page-title">報修類型</h1>
          <p className="text-xs text-gray-400 mt-0.5">新增、修改、停用報修類型</p>
        </div>
        <button className="btn btn-primary flex-shrink-0" onClick={() => { setShowAdd(true); setEditingId(null); }}>
          <Plus size={14} /> 新增類型
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">
          <span className="card-title">目前類型列表</span>
          <span className="badge badge-primary">{displayTypes.filter(t => t.is_active).length || 0} 個啟用中</span>
        </div>

        {/* 新增列 */}
        {showAdd && (
          <div className="px-4 py-3 bg-primary-light border-b border-primary/10">
            <TypeForm
              onSave={(data) => createMutation.mutate(data)}
              onCancel={() => setShowAdd(false)}
            />
          </div>
        )}

        {isLoading ? (
          <div className="py-12 text-center text-sm text-gray-400">載入中...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base w-full min-w-[500px]">
              <thead>
                <tr>
                  <th style={{ width: 32 }}></th>
                  <th style={{ width: 80 }}>狀態</th>
                  <th ref={nameColRef}>類型名稱</th>
                  <th>說明</th>
                  <th style={{ width: 80 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {displayTypes.map((type, index) => (
                  <tr
                    key={type.id}
                    className={`${!type.is_active ? 'opacity-40' : ''} ${dragItem.current === index ? 'bg-primary-light' : ''}`}
                    onDragEnter={(e) => handleDragEnter(e, index)}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    {/* #13 拖曳把手 - 限縮在說明欄位左側的把手圖示範圍內 */}
                    <td
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragEnd={handleDragEnd}
                      style={{ cursor: 'grab', width: 32, userSelect: 'none' }}
                    >
                      <GripVertical size={14} className="text-gray-300" />
                    </td>

                    {/* 狀態 */}
                    <td>
                      <button
                        onClick={() => toggleActive(type)}
                        className={`badge cursor-pointer ${type.is_active ? 'badge-success' : 'badge-gray'}`}
                      >
                        {type.is_active ? '啟用' : '停用'}
                      </button>
                    </td>

                    {/* #11 類型名稱欄：colSpan 編輯時跨說明欄，TypeForm 名稱欄寬與此欄同寬對齊 */}
                    <td colSpan={editingId === type.id ? 2 : 1}>
                      {editingId === type.id ? (
                        <TypeForm
                          type={type}
                          nameWidth={nameColWidth}
                          onSave={(data) => updateMutation.mutate({
                            id: type.id,
                            data: { ...data, is_active: type.is_active, sort_order: type.sort_order }
                          })}
                          onCancel={() => setEditingId(null)}
                        />
                      ) : (
                        <span className="text-sm font-medium">{type.name}</span>
                      )}
                    </td>

                    {/* 說明 - 編輯時隱藏（colSpan 已處理） */}
                    {editingId !== type.id && (
                      <td className="text-xs text-gray-400">
                        <div className="truncate max-w-[200px]">{type.description || '--'}</div>
                      </td>
                    )}

                    {/* 操作 */}
                    <td>
                      <div className="flex gap-1">
                        <button
                          className="btn btn-sm px-2"
                          onClick={() => { setEditingId(type.id); setShowAdd(false); }}
                        >
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
                  </tr>
                ))}
                {!displayTypes.length && (
                  <tr><td colSpan="5" className="py-12 text-center text-sm text-gray-400">尚無類型，點上方「新增類型」開始建立</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card card-body bg-primary-light border-primary/10">
        <p className="text-xs text-primary-dark">
          💡 <strong>提示</strong>：拖曳每列左側的把手可調整顯示順序。停用的類型不會出現在新增案件的選單中，但已使用此類型的舊案件不受影響。
        </p>
      </div>
    </div>
  );
}
