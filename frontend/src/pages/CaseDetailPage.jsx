import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { MapPin, Clock, User, Phone, Building, ArrowLeft, MessageSquare, FileText, Activity } from 'lucide-react';
import { casesAPI, photosAPI } from '../utils/api';
import { STATUS_LABELS, STATUS_BADGES, URGENCY_LABELS, URGENCY_BADGES, formatDateTime } from '../utils/helpers';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';
import DispatchModal from '../components/DispatchModal';
import PhotoUpload from '../components/PhotoUpload';

const BACKEND_URL = 'https://repair-system-production-cf5b.up.railway.app';

// 確保圖片 URL 是完整路徑
const fullUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${BACKEND_URL}${url}`;
};

const TimelineItem = ({ label, time, done, active }) => (
  <div className="relative pb-5">
    <div className={`timeline-dot-${done ? 'done' : active ? 'active' : 'pending'}`} />
    <div className="text-xs font-medium text-gray-800">{label}</div>
    {time
      ? <div className="text-[10px] text-success mt-0.5">{formatDateTime(time)}</div>
      : <div className="text-[10px] text-gray-300 mt-0.5">等待中</div>
    }
  </div>
);

export default function CaseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { canManage, isEngineer, user } = useAuthStore();
  const [showDispatch, setShowDispatch] = useState(false);
  const [activeTab, setActiveTab] = useState('info');

  const { data: caseData, isLoading } = useQuery(
    ['case', id],
    () => casesAPI.get(id).then(r => r.data)
  );

  const statusMutation = useMutation(
    (status) => casesAPI.updateStatus(id, { status }),
    { onSuccess: () => { toast.success('狀態已更新'); qc.invalidateQueries(['case', id]); } }
  );

  if (isLoading) return <div className="page-container"><div className="text-sm text-gray-400">載入中...</div></div>;
  if (!caseData) return <div className="page-container"><div className="text-sm text-red-500">案件不存在</div></div>;

  const c = caseData;
  const s = c.status;

  // 時間軸：不含客服受理
  const statusFlow = [
    { key: 'pending',              label: '報修申請',   time: c.created_at },
    { key: 'dispatched',           label: '派工完成',   time: c.assigned_at },
    { key: 'in_progress',          label: '工程師到場', time: c.checkin_time },
    { key: 'in_progress_checkout', label: '工程師離場', time: c.checkout_time },
    { key: 'signing',              label: '施工完成',   time: c.actual_end || c.checkout_time },
    { key: 'completed',            label: '業主簽收',   time: c.signed_at },
  ];

  const statusOrder = ['pending','accepted','dispatched','in_progress','signing','completed','closed'];
  const currentIdx = statusOrder.indexOf(s);

  const isDone = (key) => {
    if (key === 'dispatched') return currentIdx > statusOrder.indexOf('dispatched');
    if (key === 'in_progress') return !!c.checkin_time;
    if (key === 'in_progress_checkout') return !!c.checkout_time;
    if (key === 'signing') return currentIdx >= statusOrder.indexOf('signing') || !!c.checkout_time;
    if (key === 'completed') return !!c.signed_at;
    return currentIdx > statusOrder.indexOf(key);
  };
  const isActive = (key) => {
    if (key === 'in_progress') return s === 'in_progress' && !c.checkout_time;
    if (key === 'in_progress_checkout') return s === 'in_progress' && !!c.checkin_time && !c.checkout_time;
    if (key === 'signing') return s === 'signing';
    return s === key;
  };

  // 照片分組，統一處理 URL
  const photosByPhase = { before: [], during: [], after: [] };
  c.photos?.forEach(p => {
    const photo = { ...p, file_url: fullUrl(p.file_url) };
    if (photosByPhase[p.phase]) photosByPhase[p.phase].push(photo);
  });

  // 移除重複（URL 相同）的佔位空白格
  const allActivities = c.activities || [];

  const tabs = [
    { key: 'info',       label: '案件資訊' },
    { key: 'timeline',   label: '進度追蹤' },
    { key: 'photos',     label: `照片記錄 (${c.photos?.length || 0})` },
    { key: 'activities', label: `客服記錄 (${allActivities.length})` },
  ];

  return (
    <div className="page-container">
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <button onClick={() => navigate('/cases')} className="btn btn-sm">
          <ArrowLeft size={13} /> 返回
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-medium text-primary bg-primary-light px-2 py-0.5 rounded">{c.case_number}</span>
            <span className={`badge ${STATUS_BADGES[s]}`}>{STATUS_LABELS[s]}</span>
            <span className={`badge ${URGENCY_BADGES[c.urgency]}`}>{URGENCY_LABELS[c.urgency]}</span>
          </div>
          <h1 className="text-base font-semibold text-gray-900 mt-1 truncate">{c.title}</h1>
        </div>
        <div className="flex gap-2 flex-wrap flex-shrink-0">
          <Link to={`/chat/${id}`} className="btn btn-sm"><MessageSquare size={13} /> 客服對談</Link>
          {(s === 'in_progress' || s === 'signing') && (canManage() || isEngineer()) && (
            <Link to={`/cases/${id}/sign`} className="btn btn-primary btn-sm">業主簽收</Link>
          )}
          {canManage() && s === 'pending' && (
            <button className="btn btn-sm" onClick={() => statusMutation.mutate('accepted')}>受理</button>
          )}
          {canManage() && (s === 'accepted' || s === 'pending') && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowDispatch(true)}>派工</button>
          )}
          {isEngineer() && s === 'dispatched' && (
            <Link to="/field" className="btn btn-primary btn-sm">前往現場作業</Link>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-4 border-b border-gray-100 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === t.key ? 'border-primary text-primary font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 案件資訊 ── */}
      {activeTab === 'info' && (
        <div className="grid md:grid-cols-2 gap-5">
          <div className="card card-body space-y-4">
            <h3 className="font-medium text-sm text-gray-900">案件資訊</h3>
            <div className="space-y-3 text-sm">
              <div className="flex gap-2"><Building size={14} className="text-gray-400 mt-0.5 flex-shrink-0" /><div><div className="text-xs text-gray-400">業主/公司</div><div>{c.owner_company || '--'}</div></div></div>
              <div className="flex gap-2"><User size={14} className="text-gray-400 mt-0.5 flex-shrink-0" /><div><div className="text-xs text-gray-400">聯絡人</div><div>{c.owner_name}</div></div></div>
              <div className="flex gap-2"><Phone size={14} className="text-gray-400 mt-0.5 flex-shrink-0" /><div><div className="text-xs text-gray-400">電話</div><div>{c.owner_phone || '--'}</div></div></div>
              <div className="flex gap-2"><MapPin size={14} className="text-gray-400 mt-0.5 flex-shrink-0" /><div><div className="text-xs text-gray-400">施工地點</div><div>{c.location_address}</div></div></div>
              <div className="flex gap-2"><FileText size={14} className="text-gray-400 mt-0.5 flex-shrink-0" /><div><div className="text-xs text-gray-400">報修說明</div><div className="text-gray-700">{c.description}</div></div></div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="card card-body space-y-3">
              <h3 className="font-medium text-sm text-gray-900">派工資訊</h3>
              {c.engineer_name ? (
                <div className="text-sm space-y-2">
                  <div className="flex justify-between"><span className="text-gray-400">負責工程師</span><span className="font-medium">{c.engineer_name}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">派工時間</span><span>{formatDateTime(c.assigned_at)}</span></div>
                  {c.scheduled_start && <div className="flex justify-between"><span className="text-gray-400">預計到場</span><span>{formatDateTime(c.scheduled_start)}</span></div>}
                  {c.checkin_time && <div className="flex justify-between"><span className="text-gray-400">實際到場</span><span className="text-success">{formatDateTime(c.checkin_time)}</span></div>}
                  {c.checkout_time && <div className="flex justify-between"><span className="text-gray-400">離場時間</span><span className="text-success">{formatDateTime(c.checkout_time)}</span></div>}
                  {c.checkin_lat && (
                    <div className="text-xs text-gray-400 flex items-center gap-1">
                      <MapPin size={11} /> GPS：{parseFloat(c.checkin_lat).toFixed(6)}, {parseFloat(c.checkin_lng).toFixed(6)}
                    </div>
                  )}
                </div>
              ) : <div className="text-sm text-gray-400">尚未派工</div>}
            </div>

            {/* 業主簽收 */}
            {c.signed_at && (
              <div className="card card-body bg-success-light border-success/20 space-y-3">
                <h3 className="font-medium text-sm text-success">業主簽收記錄</h3>
                <div className="text-sm space-y-1.5">
                  <div className="flex justify-between"><span className="text-gray-500">簽收人</span><span className="font-medium">{c.signed_by || '--'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">簽收時間</span><span>{formatDateTime(c.signed_at)}</span></div>
                </div>
                {c.owner_signature && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1.5">簽名影像</div>
                    <div className="border border-success/30 rounded-lg overflow-hidden bg-white p-2">
                      <img src={c.owner_signature} alt="業主簽名" className="max-w-full h-auto max-h-24 mx-auto block" style={{ mixBlendMode: 'multiply' }} />
                    </div>
                  </div>
                )}
                {c.completion_notes && <div className="text-xs text-gray-500">備注：{c.completion_notes}</div>}
                {c.drive_pdf_link && (
                  <a href={c.drive_pdf_link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                    <FileText size={11} /> 查看結案 PDF（Google Drive）
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 進度追蹤 ── */}
      {activeTab === 'timeline' && (
        <div className="max-w-lg">
          <div className="card card-body">
            <h3 className="font-medium text-sm mb-5 flex items-center gap-2">
              <Clock size={14} className="text-gray-400" /> 施工進度時間軸
            </h3>
            <div className="timeline-line">
              {statusFlow.map((step) => (
                <TimelineItem key={step.key} label={step.label} time={step.time}
                  done={isDone(step.key)} active={isActive(step.key)} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 照片記錄 ── */}
      {activeTab === 'photos' && (
        <div className="space-y-5">
          {['before','during','after'].map(phase => (
            <div key={phase} className="card card-body">
              <h3 className="font-medium text-sm mb-4">
                {phase === 'before' ? '施工前' : phase === 'during' ? '施工中' : '施工後'}
                <span className="ml-2 text-xs text-gray-400 font-normal">({photosByPhase[phase].length} 張)</span>
              </h3>
              {photosByPhase[phase].length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-4">
                  {photosByPhase[phase].map(p => (
                    <a key={p.id} href={p.file_url} target="_blank" rel="noopener noreferrer"
                      className="aspect-square rounded-lg overflow-hidden border border-gray-100 block bg-gray-50 hover:opacity-90 transition-opacity">
                      <img
                        src={p.file_url}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.parentElement.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:10px;color:#aaa;background:#f9fafb;">無法載入</div>';
                        }}
                      />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-300 mb-3">尚無照片</p>
              )}
              {(canManage() || isEngineer()) && (
                <PhotoUpload caseId={id} phase={phase} onSuccess={() => qc.invalidateQueries(['case', id])} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── 客服記錄 ── */}
      {activeTab === 'activities' && (
        <div className="card card-body max-w-2xl">
          <h3 className="font-medium text-sm mb-4 flex items-center gap-2">
            <Activity size={14} className="text-gray-400" /> 客服操作記錄
          </h3>
          {allActivities.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">尚無操作記錄</div>
          ) : (
            <div className="space-y-3">
              {allActivities.map(a => (
                <div key={a.id} className="flex gap-3 pb-3 border-b border-gray-50 last:border-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-gray-700">{a.actor_name || '系統'}</span>
                      <span className="text-[10px] text-gray-400">{formatDateTime(a.created_at)}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{a.description}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showDispatch && (
        <DispatchModal caseId={id} onClose={() => setShowDispatch(false)}
          onSuccess={() => { setShowDispatch(false); qc.invalidateQueries(['case', id]); }} />
      )}
    </div>
  );
}
