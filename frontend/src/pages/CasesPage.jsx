import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import { Search, Filter } from 'lucide-react';
import { casesAPI } from '../utils/api';
import { STATUS_LABELS, STATUS_BADGES, URGENCY_LABELS, URGENCY_BADGES, CASE_TYPES, formatDateTime } from '../utils/helpers';
import useAuthStore from '../store/authStore';

export default function CasesPage() {
  const { canManage } = useAuthStore();
  const [filters, setFilters] = useState({ search: '', status: '', urgency: '', case_type: '', page: 1 });

  const { data, isLoading } = useQuery(
    ['cases', filters],
    () => casesAPI.list(filters).then(r => r.data),
    { keepPreviousData: true }
  );

  const update = (key, val) => setFilters(f => ({ ...f, [key]: val, page: 1 }));

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
                </tr>
              </thead>
              <tbody>
                {data?.cases?.map(c => (
                  <tr key={c.id} className="cursor-pointer" onClick={() => window.location.href = `/cases/${c.id}`}>
                    <td className="font-medium text-primary text-xs">{c.case_number}</td>
                    <td className="max-w-[180px]">
                      <div className="truncate text-sm font-medium text-gray-800">{c.title}</div>
                    </td>
                    <td className="text-xs text-gray-500">{c.case_type}</td>
                    <td className="text-xs">{c.owner_company || c.owner_name}</td>
                    <td className="text-xs text-gray-500 max-w-[120px]">
                      <div className="truncate">{c.location_address}</div>
                    </td>
                    {canManage() && <td className="text-xs text-gray-500">{c.engineer_name || <span className="text-gray-300">未指派</span>}</td>}
                    <td><span className={`badge ${URGENCY_BADGES[c.urgency]}`}>{URGENCY_LABELS[c.urgency]}</span></td>
                    <td><span className={`badge ${STATUS_BADGES[c.status]}`}>{STATUS_LABELS[c.status]}</span></td>
                    <td className="text-xs text-gray-400 whitespace-nowrap">{formatDateTime(c.created_at)}</td>
                  </tr>
                ))}
                {!data?.cases?.length && (
                  <tr><td colSpan="9" className="py-16 text-center text-sm text-gray-400">沒有符合的案件</td></tr>
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
    </div>
  );
}
