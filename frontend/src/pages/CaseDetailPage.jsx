import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { MapPin, Clock, User, Phone, Building, ArrowLeft, MessageSquare, Camera, FileText } from 'lucide-react';
import { casesAPI, photosAPI } from '../utils/api';
import { STATUS_LABELS, STATUS_BADGES, URGENCY_LABELS, URGENCY_BADGES, formatDateTime, CASE_TYPES } from '../utils/helpers';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';
import DispatchModal from '../components/DispatchModal';
import PhotoUpload from '../components/PhotoUpload';

const TimelineItem = ({ label, time, done, active }) => (
  <div className="relative pb-5">
    <div className={`timeline-dot-${done ? 'done' : active ? 'active' : 'pending'}`} />
    <div className="text-xs font-medium text-gray-800">{label}</div>
    {time && <div className="text-[10px] text-gray-400 mt-0.5">{time}</div>}
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
    {
      onSuccess: () => { toast.success('狀態已更新'); qc.invalidateQueries(['case', id]); },
    }
  );

  if (isLoading) return <div className="page-container"><div className="text-sm text-gray-400">載入中...</div></div>;
  if (!caseData) return <div className="page-container"><div className="text-sm text-red-500">案件不存在</div></div>;

  const c = caseData;
  const s = c.status;

  const statusFlow = [
    { key: 'pending', label: '報修申請', time: c.created_at },
    { key: 'accepted', label: '客服受理', time: null },
    { key: 'dispatched', label: '派工完成', time: c.assigned_at },
    { key: 'in_progress', label: '工程師到場', time: c.checkin_time },
    { key: 'signing', label: '施工完成', time: c.actual_end },
    { key: 'completed', label: '業主簽收', time: c.signed_at },
  ];
  const statusOrder = ['pending','accepted','dispatched','in_progress','signing','completed','closed'];
  const currentIdx = statusOrder.indexOf(s);

  const photosByPhase = { before: [], during: [], after: [] };
  c.photos?.forEach(p => { if (photosByPhase[p.phase]) photosByPhase[p.phase].push(p); });

  const tabs = [
    { key: 'info', label: '案件資訊' },
    { key: 'timeline', label: '進度追蹤' },
    { key: 'photos', label: `照片記錄 (${c.photos?.length || 0})` },
  ];

  return (
    <div className="page-container">
      <div className="flex items-center gap-3 mb-5">
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
        <div className="flex gap-2 flex-shrink-0">
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
      <div className="flex gap-0 mb-4 border-b border-gray-100">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2.5 text-sm border-b-2 transition-colors ${activeTab === t.key ? 'border-primary text-primary font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

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
                  {c.checkout_time && <div className="flex justify-between"><span className="text-gray-400">離場時間</span><span>{formatDateTime(c.checkout_time)}</span></div>}
                  {c.checkin_lat && (
                    <div className="text-xs text-gray-400 flex items-center gap-1">
                      <MapPin size={11} /> GPS: {c.checkin_lat}, {c.checkin_lng}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-400">尚未派工</div>
              )}
            </div>
            {c.signed_at && (
              <div className="card card-body bg-success-light border-success/20">
                <h3 className="font-medium text-sm text-success mb-2">業主簽收記錄</h3>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-gray-500">簽收人</span><span>{c.signed_by}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">簽收時間</span><span>{formatDateTime(c.signed_at)}</span></div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="card card-body max-w-lg">
          <h3 className="font-medium text-sm mb-5">案件進度時間軸</h3>
          <div className="timeline-line">
            {statusFlow.map((step, i) => (
              <TimelineItem key={step.key} label={step.label} time={step.time ? formatDateTime(step.time) : null}
                done={statusOrder.indexOf(step.key) < currentIdx}
                active={step.key === s} />
            ))}
          </div>
          {c.activities?.length > 0 && (
            <div className="mt-6 border-t border-gray-100 pt-4">
              <h4 className="text-xs font-medium text-gray-500 mb-3">操作記錄</h4>
              <div className="space-y-2">
                {c.activities.map(a => (
                  <div key={a.id} className="text-xs text-gray-500">
                    <span className="text-gray-300">{formatDateTime(a.created_at)}</span>
                    <span className="mx-1.5 text-gray-300">·</span>
                    <span className="text-gray-600">{a.actor_name}</span>
                    <span className="mx-1.5 text-gray-300">·</span>
                    {a.description}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'photos' && (
        <div className="space-y-5">
          {['before', 'during', 'after'].map(phase => (
            <div key={phase} className="card card-body">
              <h3 className="font-medium text-sm mb-4">
                {phase === 'before' ? '施工前' : phase === 'during' ? '施工中' : '施工後'} ({photosByPhase[phase].length})
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 mb-3">
                {photosByPhase[phase].map(p => (
                  <a key={p.id} href={p.file_url} target="_blank" rel="noopener noreferrer"
                    className="aspect-square rounded-lg overflow-hidden border border-gray-100 block">
                    <img src={p.file_url} alt="" className="w-full h-full object-cover hover:scale-105 transition-transform" />
                  </a>
                ))}
              </div>
              {(canManage() || isEngineer()) && (
                <PhotoUpload caseId={id} phase={phase} onSuccess={() => qc.invalidateQueries(['case', id])} />
              )}
            </div>
          ))}
        </div>
      )}

      {showDispatch && <DispatchModal caseId={id} onClose={() => setShowDispatch(false)} onSuccess={() => { setShowDispatch(false); qc.invalidateQueries(['case', id]); }} />}
    </div>
  );
}
