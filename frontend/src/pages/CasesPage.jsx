import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Search, Trash2, AlertTriangle } from 'lucide-react';
import { casesAPI } from '../utils/api';
import { STATUS_LABELS, STATUS_BADGES, URGENCY_LABELS, URGENCY_BADGES, CASE_TYPES, formatDateTime } from '../utils/helpers';
import useAuthStore from '../store/authStore';
import { usePermissions } from './PermissionsPage';
import toast from 'react-hot-toast';

function DeleteConfirmModal({ caseData, onConfirm, onClose, isDeleting }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
        <div className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={20} className="text-danger" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">確認刪除案件</h3>
              <p className="text-xs text-gray-400 mt-0.5">此操作無法復原</p>
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 mb-4">
            <div className="text-xs font-mono text-primary">{caseData.case_number}</div>
            <div className="text-sm font-medium text-gray-800 mt-0.5">{caseData.title}</div>
            <div className="text-xs text-gray-400 mt-0.5">{caseData.owner_company || caseData.owner_name}</div>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            刪除後，所有相關記錄（活動記錄、通知）將一併移除。確定要刪除此案件嗎？
          </p>
          <div className="flex gap-2 justify-end">
            <button className="btn" onClick={onClose} disabled={isDeleting}>取消</button>
            <button className="btn btn-danger" onClick={onConfirm} disabled={isDeleting}>
              {isDeleting ? '刪除中...' : '確認刪除'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CasesPage() {
  const { user, canManage } = useAuthStore();
  const { canDelete } = usePermissions();
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ search: '', status: '', urgency: '', case_type: '', page: 1 });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading } = useQuery(
    ['cases', filters],
    () => casesAPI.list(filters).then(r => r.data),
    { keepPreviousData: true }
  );

  const deleteMutation = useMutation(
    (id) => casesAPI.delete(id),
    {
      onSuccess: () => {
        toast.success(`案件 ${deleteTarget?.case_number} 已刪除`);
        setDeleteTarget(null);
        qc.invalidateQueries('cases');
      },
      onError: (err) => {
        toast.error(err.response?.data?.error || '刪除失敗');
        setDeleteTarget(null);
      }
    }
  );

  const update = (key, val) => setFilters(f => ({ ...f, [key]: val, page: 1 }));
  const userCanDelete = canDelete('cases', user?.role);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">案件管理</h1>
        <Link to="/cases/new" className="btn btn-primary">+ 新增報修</Link>
      </div>

      <div className="card">
        <div className="card-header flex-wrap gap-2">
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 flex-1 min-w-48">
            <Search size={14} className="text-gray-400 flex-shrink-0" />
            <input className="bg-transparent text-sm w-full outline-none placeholder-gray-400"
              placeholder="搜尋案件編號、業主、地點..."
              value={filters.search}
              onChange={e => update('search', e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <select className="form-select w-auto text-xs py-1.5" value={filters.status} onChange={e => update('status', e.target.value)}>
              <option value="">全部狀態</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="form-select w-auto text-xs py-1.5" value={filters.urgency} onChange={e => update('urgency', e.target.value)}>
              <option value="">全部緊急度</option>
              <option value="emergency">緊急</option>
              <option value="normal">一般</option>
              <option value="low">低</option>
            </select>
            <select className="form-select w-auto text-xs py-1.5" value={filters.case_type} onChange={e => update('case_type', e.target.value)}>
              <option value="">全部類型</option>
              {CASE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-gray-400">載入中...</div>
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th>案件編號</th>
                  <th>標題</th>
                  <th>類型</th>
                  <th>業主/公司</th>
                  <th>地點</th>
                  {canManage() && <th>負責工程師</th>}
                  <th>緊急度</th>
                  <th>狀態</th>
                  <th>建立時間</th>
                  {userCanDelete && <th className="w-10"></th>}
                </tr>
              </thead>
              <tbody>
                {data?.cases?.map(c => (
                  <tr key={c.id} className="group">
                    <td className="font-medium text-primary text-xs cursor-pointer" onClick={() => window.location.href = `/cases/${c.id}`}>{c.case_number}</td>
                    <td className="max-w-[180px] cursor-pointer" onClick={() => window.location.href = `/cases/${c.id}`}>
                      <div className="truncate text-sm font-medium text-gray-800">{c.title}</div>
                    </td>
                    <td className="text-xs text-gray-500 cursor-pointer" onClick={() => window.location.href = `/cases/${c.id}`}>{c.case_type}</td>
                    <td className="text-xs cursor-pointer" onClick={() => window.location.href = `/cases/${c.id}`}>{c.owner_company || c.owner_name}</td>
                    <td className="text-xs text-gray-500 max-w-[120px] cursor-pointer" onClick={() => window.location.href = `/cases/${c.id}`}>
                      <div className="truncate">{c.location_address}</div>
                    </td>
                    {canManage() && <td className="text-xs text-gray-500 cursor-pointer" onClick={() => window.location.href = `/cases/${c.id}`}>{c.engineer_name || <span className="text-gray-300">未指派</span>}</td>}
                    <td className="cursor-pointer" onClick={() => window.location.href = `/cases/${c.id}`}><span className={`badge ${URGENCY_BADGES[c.urgency]}`}>{URGENCY_LABELS[c.urgency]}</span></td>
                    <td className="cursor-pointer" onClick={() => window.location.href = `/cases/${c.id}`}><span className={`badge ${STATUS_BADGES[c.status]}`}>{STATUS_LABELS[c.status]}</span></td>
                    <td className="text-xs text-gray-400 whitespace-nowrap cursor-pointer" onClick={() => window.location.href = `/cases/${c.id}`}>{formatDateTime(c.created_at)}</td>
                    {userCanDelete && (
                      <td>
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-danger"
                          onClick={e => { e.stopPropagation(); setDeleteTarget(c); }}
                          title="刪除案件"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {!data?.cases?.length && (
                  <tr><td colSpan="10" className="py-16 text-center text-sm text-gray-400">沒有符合的案件</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {data?.totalPages > 1 && (
          <div className="px-5 py-3 border-t border-gray-50 flex items-center justify-between">
            <span className="text-xs text-gray-400">共 {data.total} 筆</span>
            <div className="flex gap-1">
              <button className="btn btn-sm" disabled={filters.page <= 1} onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}>上一頁</button>
              <span className="px-3 py-1 text-xs text-gray-500">{filters.page} / {data.totalPages}</span>
              <button className="btn btn-sm" disabled={filters.page >= data.totalPages} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}>下一頁</button>
            </div>
          </div>
        )}
      </div>

      {deleteTarget && (
        <DeleteConfirmModal
          caseData={deleteTarget}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onClose={() => setDeleteTarget(null)}
          isDeleting={deleteMutation.isLoading}
        />
      )}
    </div>
  );
}
