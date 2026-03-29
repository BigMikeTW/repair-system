import React, { useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { Link } from 'react-router-dom';
import { casesAPI, usersAPI } from '../utils/api';
import { STATUS_LABELS, STATUS_BADGES, URGENCY_LABELS, URGENCY_BADGES, formatDateTime } from '../utils/helpers';
import DispatchModal from '../components/DispatchModal';

export default function DispatchPage() {
  const qc = useQueryClient();
  const [selectedCase, setSelectedCase] = useState(null);

  const { data: pending } = useQuery('pendingCases', () =>
    casesAPI.list({ status: 'pending', limit: 50 }).then(r => r.data)
  );
  const { data: accepted } = useQuery('acceptedCases', () =>
    casesAPI.list({ status: 'accepted', limit: 50 }).then(r => r.data)
  );
  const { data: dispatched } = useQuery('dispatchedCases', () =>
    casesAPI.list({ status: 'dispatched', limit: 50 }).then(r => r.data)
  );
  const { data: engineers } = useQuery('engineers', () => usersAPI.getEngineers().then(r => r.data));

  const needDispatch = [...(pending?.cases || []), ...(accepted?.cases || [])];

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">派工管理</h1>
        <Link to="/cases/new" className="btn btn-primary btn-sm">+ 新增報修</Link>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Pending dispatch */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">待派工案件</span>
            <span className="badge badge-warning">{needDispatch.length} 件</span>
          </div>
          <div className="divide-y divide-gray-50">
            {needDispatch.map(c => (
              <div key={c.id} className="flex items-start gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-mono text-primary">{c.case_number}</span>
                    <span className={`badge ${URGENCY_BADGES[c.urgency]}`}>{URGENCY_LABELS[c.urgency]}</span>
                  </div>
                  <div className="text-sm font-medium text-gray-800 truncate">{c.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{c.location_address}</div>
                </div>
                <button className="btn btn-primary btn-sm flex-shrink-0" onClick={() => setSelectedCase(c)}>
                  派工
                </button>
              </div>
            ))}
            {!needDispatch.length && (
              <div className="py-10 text-center text-sm text-gray-400">目前沒有待派工案件</div>
            )}
          </div>
        </div>

        {/* Engineers */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">工程師狀態</span>
            <span className="badge badge-primary">{engineers?.length || 0} 人</span>
          </div>
          <div className="divide-y divide-gray-50">
            {engineers?.map(eng => (
              <div key={eng.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-9 h-9 rounded-full bg-primary-light flex items-center justify-center text-sm font-medium text-primary-dark flex-shrink-0">
                  {eng.name.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800">{eng.name}</div>
                  <div className="text-xs text-gray-400">{eng.specialties?.join(' · ') || '未設定專長'}</div>
                </div>
                <div className="text-right">
                  <span className={`badge ${parseInt(eng.active_tasks) > 0 ? 'badge-warning' : 'badge-success'}`}>
                    {parseInt(eng.active_tasks) > 0 ? `${eng.active_tasks} 個任務` : '可用'}
                  </span>
                  <div className="text-[10px] text-gray-300 mt-0.5">{eng.phone}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Active dispatched cases */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">進行中派工</span>
          <span className="badge badge-teal">{dispatched?.cases?.length || 0} 件</span>
        </div>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>案件編號</th>
                <th>標題</th>
                <th>業主</th>
                <th>工程師</th>
                <th>預計到場</th>
                <th>打卡狀態</th>
                <th>狀態</th>
              </tr>
            </thead>
            <tbody>
              {dispatched?.cases?.map(c => (
                <tr key={c.id} className="cursor-pointer" onClick={() => window.location.href = `/cases/${c.id}`}>
                  <td className="text-xs text-primary font-medium">{c.case_number}</td>
                  <td className="text-sm">{c.title}</td>
                  <td className="text-xs text-gray-500">{c.owner_company || c.owner_name}</td>
                  <td className="text-xs">{c.engineer_name || '--'}</td>
                  <td className="text-xs text-gray-400">{formatDateTime(c.scheduled_start)}</td>
                  <td>
                    {c.checkin_time
                      ? <span className="badge badge-success">已打卡 {formatDateTime(c.checkin_time)}</span>
                      : <span className="badge badge-gray">未打卡</span>
                    }
                  </td>
                  <td><span className={`badge ${STATUS_BADGES[c.status]}`}>{STATUS_LABELS[c.status]}</span></td>
                </tr>
              ))}
              {!dispatched?.cases?.length && (
                <tr><td colSpan="7" className="py-10 text-center text-sm text-gray-400">沒有進行中的派工</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedCase && (
        <DispatchModal
          caseId={selectedCase.id}
          caseData={selectedCase}
          onClose={() => setSelectedCase(null)}
          onSuccess={() => {
            setSelectedCase(null);
            qc.invalidateQueries('pendingCases');
            qc.invalidateQueries('acceptedCases');
            qc.invalidateQueries('dispatchedCases');
          }}
        />
      )}
    </div>
  );
}
