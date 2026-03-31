import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Link } from 'react-router-dom';
import { casesAPI, usersAPI } from '../utils/api';
import { STATUS_LABELS, STATUS_BADGES, URGENCY_LABELS, URGENCY_BADGES, formatDateTime } from '../utils/helpers';
import DispatchModal from '../components/DispatchModal';
import toast from 'react-hot-toast';
import { XCircle, RefreshCw } from 'lucide-react';

// ── Cancel Dispatch Modal ──────────────────────────────────────────────────────
function CancelDispatchModal({ caseData, onClose, onSuccess }) {
  const [reason, setReason] = useState('');
  const mutation = useMutation(
    () => casesAPI.cancelDispatch(caseData.id, { reason }),
    {
      onSuccess: () => { toast.success('派工已取消'); onSuccess(); },
      onError: (e) => toast.error(e.response?.data?.error || '取消失敗')
    }
  );
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">取消派工</h2>
          <button className="btn btn-sm" onClick={onClose}>關閉</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs font-mono text-primary">{caseData.case_number}</div>
            <div className="text-sm font-medium text-gray-800 mt-0.5">{caseData.title}</div>
            <div className="text-xs text-gray-400 mt-0.5">目前工程師：{caseData.engineer_name || '--'}</div>
          </div>
          <div>
            <label className="form-label">取消原因（選填）</label>
            <textarea className="form-textarea" rows={3} value={reason}
              onChange={e => setReason(e.target.value)} placeholder="說明取消派工的原因..." />
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn" onClick={onClose}>返回</button>
            <button className="btn btn-danger" onClick={() => mutation.mutate()} disabled={mutation.isLoading}>
              {mutation.isLoading ? '處理中...' : '確認取消派工'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Reassign Modal ─────────────────────────────────────────────────────────────
function ReassignModal({ caseData, engineers, onClose, onSuccess }) {
  const [form, setForm] = useState({
    engineer_id: '', scheduled_start: '', scheduled_end: '', reason: '', notes: ''
  });
  const mutation = useMutation(
    () => casesAPI.reassign(caseData.id, form),
    {
      onSuccess: () => { toast.success('派工變更成功'); onSuccess(); },
      onError: (e) => toast.error(e.response?.data?.error || '變更失敗')
    }
  );
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">派工變更</h2>
          <button className="btn btn-sm" onClick={onClose}>關閉</button>
        </div>
        <div className="px-5 py-3 bg-amber-50 border-b border-amber-100">
          <div className="text-xs font-mono text-primary">{caseData.case_number}</div>
          <div className="text-sm font-medium text-gray-800 mt-0.5">{caseData.title}</div>
          <div className="text-xs text-amber-600 mt-0.5">目前工程師：{caseData.engineer_name || '--'}</div>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="form-label">新指派工程師 *</label>
            <select className="form-select" value={form.engineer_id}
              onChange={e => setForm(f => ({ ...f, engineer_id: e.target.value }))}>
              <option value="">選擇工程師</option>
              {engineers?.map(eng => (
                <option key={eng.id} value={eng.id}>
                  {eng.name} {eng.specialties?.length ? `· ${eng.specialties.join(', ')}` : ''} {parseInt(eng.active_tasks) > 0 ? `(${eng.active_tasks}個任務)` : '(可用)'}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">預計到場時間</label>
              <input type="datetime-local" className="form-control"
                value={form.scheduled_start} onChange={e => setForm(f => ({ ...f, scheduled_start: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">預計完工時間</label>
              <input type="datetime-local" className="form-control"
                value={form.scheduled_end} onChange={e => setForm(f => ({ ...f, scheduled_end: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="form-label">變更原因</label>
            <input type="text" className="form-control" value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="例：原工程師請假、緊急調度..." />
          </div>
          <div>
            <label className="form-label">派工備注</label>
            <textarea className="form-textarea" rows={2} value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="注意事項、特殊要求..." />
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn" onClick={onClose}>取消</button>
            <button className="btn btn-primary" onClick={() => mutation.mutate()}
              disabled={mutation.isLoading || !form.engineer_id}>
              {mutation.isLoading ? '變更中...' : '確認派工變更'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DispatchPage() {
  const qc = useQueryClient();
  const [selectedCase, setSelectedCase] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [reassignTarget, setReassignTarget] = useState(null);

  const { data: pending } = useQuery('pendingCases', () =>
    casesAPI.list({ status: 'pending', limit: 50 }).then(r => r.data)
  );
  const { data: accepted } = useQuery('acceptedCases', () =>
    casesAPI.list({ status: 'accepted', limit: 50 }).then(r => r.data)
  );
  const { data: dispatched } = useQuery('dispatchedCases', () =>
    casesAPI.list({ status: 'dispatched', limit: 50 }).then(r => r.data)
  );
  const { data: inProgress } = useQuery('inProgressCases', () =>
    casesAPI.list({ status: 'in_progress', limit: 50 }).then(r => r.data)
  );
  const { data: engineers } = useQuery('engineers', () => usersAPI.getEngineers().then(r => r.data));

  const needDispatch = [...(pending?.cases || []), ...(accepted?.cases || [])];
  const activeDispatched = [...(dispatched?.cases || []), ...(inProgress?.cases || [])];

  const refreshAll = () => {
    qc.invalidateQueries('pendingCases');
    qc.invalidateQueries('acceptedCases');
    qc.invalidateQueries('dispatchedCases');
    qc.invalidateQueries('inProgressCases');
  };

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
                    <span className={`badge ${STATUS_BADGES[c.status]}`}>{STATUS_LABELS[c.status]}</span>
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
                  <div className="text-xs text-gray-300 mt-0.5">{eng.phone}</div>
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
          <span className="badge badge-teal">{activeDispatched.length} 件</span>
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
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {activeDispatched.map(c => (
                <tr key={c.id}>
                  <td className="text-xs text-primary font-medium cursor-pointer" onClick={() => window.location.href = `/cases/${c.id}`}>{c.case_number}</td>
                  <td className="text-sm cursor-pointer" onClick={() => window.location.href = `/cases/${c.id}`}>{c.title}</td>
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
                  <td>
                    <div className="flex gap-1.5">
                      {/* 派工變更 — 已派工且未打卡可換人 */}
                      {c.status === 'dispatched' && !c.checkin_time && (
                        <button
                          className="btn btn-sm gap-1 text-amber-600 border-amber-200 hover:bg-amber-50"
                          onClick={() => setReassignTarget(c)}
                          title="派工變更"
                        >
                          <RefreshCw size={11} /> 變更
                        </button>
                      )}
                      {/* 取消派工 — 已派工且未打卡 */}
                      {c.status === 'dispatched' && !c.checkin_time && (
                        <button
                          className="btn btn-sm gap-1 text-danger border-red-200 hover:bg-red-50"
                          onClick={() => setCancelTarget(c)}
                          title="取消派工"
                        >
                          <XCircle size={11} /> 取消
                        </button>
                      )}
                      {/* 施工中顯示提示 */}
                      {c.status === 'in_progress' && (
                        <span className="text-xs text-gray-400 italic">施工中</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!activeDispatched.length && (
                <tr><td colSpan="8" className="py-10 text-center text-sm text-gray-400">沒有進行中的派工</td></tr>
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
          onSuccess={() => { setSelectedCase(null); refreshAll(); }}
        />
      )}
      {cancelTarget && (
        <CancelDispatchModal
          caseData={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onSuccess={() => { setCancelTarget(null); refreshAll(); }}
        />
      )}
      {reassignTarget && (
        <ReassignModal
          caseData={reassignTarget}
          engineers={engineers}
          onClose={() => setReassignTarget(null)}
          onSuccess={() => { setReassignTarget(null); refreshAll(); }}
        />
      )}
    </div>
  );
}
