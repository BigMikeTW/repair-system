import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { MapPin, Clock, User, Phone, Building, ArrowLeft, MessageSquare, FileText, Activity, CheckCircle, Circle, AlertCircle, Lock, Plus, Trash2 } from 'lucide-react';
import { casesAPI, photosAPI } from '../utils/api';
import { STATUS_LABELS, STATUS_BADGES, URGENCY_LABELS, URGENCY_BADGES, formatDateTime } from '../utils/helpers';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';
import DispatchModal from '../components/DispatchModal';
import PhotoUpload from '../components/PhotoUpload';

const BACKEND_URL = 'https://repair-system-production-cf5b.up.railway.app';

const fullUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${BACKEND_URL}${url}`;
};

// ── 橫式進度條時間軸 ─────────────────────────────────────────
const HorizontalTimeline = ({ steps, currentStatus, caseData }) => {
  const statusOrder = ['pending','accepted','dispatched','in_progress','signing','completed','closed'];
  const currentIdx = statusOrder.indexOf(currentStatus);

  const getStepState = (step) => {
    if (step.key === 'in_progress' && caseData.checkin_time) return 'done';
    if (step.key === 'in_progress_checkout' && caseData.checkout_time) return 'done';
    if (step.key === 'completed' && caseData.signed_at) return 'done';
    if (step.key === 'dispatched' && currentIdx > statusOrder.indexOf('dispatched')) return 'done';
    if (step.key === 'signing' && (currentIdx >= statusOrder.indexOf('signing') || caseData.checkout_time)) return 'done';
    if (step.key === 'pending' && currentIdx > 0) return 'done';
    // active
    if (step.key === 'in_progress' && currentStatus === 'in_progress' && !caseData.checkout_time) return 'active';
    if (step.key === 'signing' && currentStatus === 'signing') return 'active';
    if (step.key === currentStatus) return 'active';
    return 'pending';
  };

  const doneCount = steps.filter(s => getStepState(s) === 'done').length;
  const progressPct = steps.length > 1 ? Math.round((doneCount / (steps.length - 1)) * 100) : 0;

  return (
    <div className="w-full">
      {/* 進度條 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-500">施工進度</span>
          <span className="text-xs font-semibold text-primary">{progressPct}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* 橫式步驟 */}
      <div className="relative">
        {/* 連接線 */}
        <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-100 mx-6" />
        <div
          className="absolute top-5 left-0 h-0.5 bg-primary transition-all duration-500 mx-6"
          style={{ width: `calc(${progressPct}% - 48px * ${progressPct / 100})` }}
        />

        <div className="grid gap-2 relative z-10" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
          {steps.map((step) => {
            const state = getStepState(step);
            return (
              <div key={step.key} className="flex flex-col items-center gap-1.5 px-1">
                {/* 圖示 */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all
                  ${state === 'done' ? 'bg-primary border-primary text-white' :
                    state === 'active' ? 'bg-white border-primary text-primary shadow-md shadow-primary/20' :
                    'bg-white border-gray-200 text-gray-300'}`}>
                  {state === 'done'
                    ? <CheckCircle size={18} />
                    : state === 'active'
                    ? <AlertCircle size={18} className="animate-pulse" />
                    : <Circle size={18} />}
                </div>
                {/* 標籤 */}
                <div className={`text-center text-xs leading-tight font-medium
                  ${state === 'done' ? 'text-primary' :
                    state === 'active' ? 'text-primary font-semibold' :
                    'text-gray-300'}`}>
                  {step.label}
                </div>
                {/* 時間 */}
                {step.time && (
                  <div className="text-xs text-success text-center leading-tight">
                    {formatDateTime(step.time)}
                  </div>
                )}
                {!step.time && state === 'active' && (
                  <div className="text-xs text-primary text-center bg-primary/10 rounded px-1 py-0.5">進行中</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

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

  const deletePhotoMutation = useMutation(
    (photoId) => photosAPI.delete(photoId),
    { onSuccess: () => { toast.success('照片已刪除'); qc.invalidateQueries(['case', id]); } }
  );

  if (isLoading) return <div className="page-container"><div className="text-sm text-gray-400">載入中...</div></div>;
  if (!caseData) return <div className="page-container"><div className="text-sm text-red-500">案件不存在</div></div>;

  const c = caseData;
  const s = c.status;

  // 業主已簽收
  const isSigned = !!c.signed_at;

  // 施工進度步驟
  const statusFlow = [
    { key: 'pending',              label: '報修申請',   time: c.created_at },
    { key: 'dispatched',           label: '派工完成',   time: c.assigned_at },
    { key: 'in_progress',          label: '工程師到場', time: c.checkin_time },
    { key: 'in_progress_checkout', label: '工程師離場', time: c.checkout_time },
    { key: 'signing',              label: '施工完成',   time: c.actual_end || c.checkout_time },
    { key: 'completed',            label: '業主簽收',   time: c.signed_at },
  ];

  // 操作記錄
  const allActivities = c.activities || [];

  // 照片分組
  const photosByPhase = { before: [], during: [], after: [] };
  c.photos?.forEach(p => {
    const photo = { ...p, file_url: fullUrl(p.file_url) };
    if (photosByPhase[p.phase]) photosByPhase[p.phase].push(photo);
  });

  const tabs = [
    { key: 'info',     label: '案件資訊' },
    { key: 'timeline', label: `進度追蹤 (${allActivities.length})` },
    { key: 'photos',   label: `照片記錄 (${c.photos?.length || 0})` },
    { key: 'notes',    label: '案件備注' },
  ];

  // 案件鎖定（業主已簽收或已結案）
  const isLocked = isSigned || s === 'closed';

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
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm text-gray-900">案件資訊</h3>
              {isLocked && (
                <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                  <Lock size={11} /> 已鎖定（業主簽收後不可修改）
                </span>
              )}
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex gap-2"><Building size={14} className="text-gray-400 mt-0.5 flex-shrink-0" /><div className="min-w-0"><div className="text-xs text-gray-400">業主/公司</div><div className="break-words">{c.owner_company || '--'}</div></div></div>
              <div className="flex gap-2"><User size={14} className="text-gray-400 mt-0.5 flex-shrink-0" /><div className="min-w-0"><div className="text-xs text-gray-400">聯絡人</div><div className="break-words">{c.owner_name}</div></div></div>
              <div className="flex gap-2"><Phone size={14} className="text-gray-400 mt-0.5 flex-shrink-0" /><div className="min-w-0"><div className="text-xs text-gray-400">電話</div><div className="break-words">{c.owner_phone || '--'}</div></div></div>
              <div className="flex gap-2"><MapPin size={14} className="text-gray-400 mt-0.5 flex-shrink-0" /><div className="min-w-0"><div className="text-xs text-gray-400">施工地點</div><div className="break-words">{c.location_address}</div></div></div>
              <div className="flex gap-2"><FileText size={14} className="text-gray-400 mt-0.5 flex-shrink-0" /><div className="min-w-0"><div className="text-xs text-gray-400">報修說明</div><div className="text-gray-700 break-words">{c.description}</div></div></div>
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
                    <FileText size={11} /> 查看結案 PDF
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 進度追蹤（合併操作記錄）── */}
      {activeTab === 'timeline' && (
        <div className="space-y-5">
          {/* 橫式進度時間軸 */}
          <div className="card card-body">
            <h3 className="font-medium text-sm mb-6 flex items-center gap-2">
              <Clock size={14} className="text-gray-400" /> 施工進度
            </h3>
            <HorizontalTimeline steps={statusFlow} currentStatus={s} caseData={c} />
          </div>

          {/* 操作記錄（原客服記錄） */}
          <div className="card card-body max-w-2xl">
            <h3 className="font-medium text-sm mb-4 flex items-center gap-2">
              <Activity size={14} className="text-gray-400" /> 操作記錄
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
                        <span className="text-xs text-gray-400">{formatDateTime(a.created_at)}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{a.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 照片記錄 ── */}
      {activeTab === 'photos' && (
        <div className="space-y-5">
          {/* 需求3：業主簽收後顯示提示 */}
          {isSigned && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
              <AlertCircle size={15} className="flex-shrink-0" />
              案件已完成簽收，照片僅可新增，任何人皆不得刪除
            </div>
          )}
          {['before', 'during', 'after'].map(phase => (
            <div key={phase} className="card card-body">
              <h3 className="font-medium text-sm mb-4">
                {phase === 'before' ? '施工前' : phase === 'during' ? '施工中' : '施工後'}
                <span className="ml-2 text-xs text-gray-400 font-normal">({photosByPhase[phase].length} 張)</span>
              </h3>
              {photosByPhase[phase].length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-4">
                  {photosByPhase[phase].map(p => (
                    <div key={p.id} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-100 bg-gray-50">
                      <a href={p.file_url} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
                        <img
                          src={p.file_url}
                          alt=""
                          className="w-full h-full object-cover hover:opacity-90 transition-opacity"
                          onError={(e) => {
                            e.target.parentElement.parentElement.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:10px;color:#aaa;background:#f9fafb;">無法載入</div>';
                          }}
                        />
                      </a>
                      {/* 需求3：簽收後不顯示刪除按鈕 */}
                      {!isSigned && (canManage() || isEngineer()) && (
                        <button
                          className="absolute top-1 right-1 w-6 h-6 bg-black/50 rounded-full hidden group-hover:flex items-center justify-center"
                          onClick={() => { if (window.confirm('確定刪除此照片？')) deletePhotoMutation.mutate(p.id); }}
                        >
                          <span className="text-white text-xs">✕</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-300 mb-3">尚無照片</p>
              )}
              {/* 需求3：簽收後仍可新增 */}
              {(canManage() || isEngineer()) && (
                <PhotoUpload caseId={id} phase={phase} onSuccess={() => qc.invalidateQueries(['case', id])} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── 案件備注 ── */}
      {activeTab === 'notes' && (
        <CaseNotesSection caseId={id} isSigned={isSigned} isLocked={isLocked} />
      )}

      {showDispatch && (
        <DispatchModal caseId={id} onClose={() => setShowDispatch(false)}
          onSuccess={() => { setShowDispatch(false); qc.invalidateQueries(['case', id]); }} />
      )}
    </div>
  );
}


// ── 案件備注區塊（獨立元件）────────────────────────────────────
function CaseNotesSection({ caseId, isSigned, isLocked }) {
  const { user } = useAuthStore();
  const [noteText, setNoteText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: notes, refetch } = useQuery(
    ['caseNotes', caseId],
    () => casesAPI.getNotes(caseId).then(r => r.data),
    { staleTime: 30000 }
  );

  const handleAdd = async () => {
    if (!noteText.trim()) return;
    setSubmitting(true);
    try {
      await casesAPI.addNote(caseId, { content: noteText.trim() });
      setNoteText('');
      refetch();
      toast.success('備注已新增');
    } catch (e) { toast.error(e.response?.data?.error || '新增失敗'); }
    finally { setSubmitting(false); }
  };

  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  const handleEdit = (note) => {
    setEditingId(note.id);
    setEditText(note.content);
  };

  const handleEditSave = async (noteId) => {
    if (!editText.trim()) return;
    try {
      await casesAPI.updateNote(caseId, noteId, { content: editText.trim() });
      setEditingId(null);
      refetch();
      toast.success('備注已更新');
    } catch { toast.error('更新失敗'); }
  };

  const handleDelete = async (noteId) => {
    if (!window.confirm('確定刪除此備注？')) return;
    try {
      await casesAPI.deleteNote(caseId, noteId);
      refetch();
      toast.success('已刪除');
    } catch { toast.error('刪除失敗'); }
  };

  return (
    <div className="space-y-4">
      {isLocked && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
          <Lock size={14} />
          <span>業主已簽收，備注僅可新增，不可修改或刪除</span>
        </div>
      )}
      <div className="card card-body">
        <label className="form-label">新增備注</label>
        <textarea
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
          className="form-textarea mb-3"
          rows={3}
          placeholder="輸入備注內容..."
        />
        <div className="flex justify-end">
          <button className="btn btn-primary btn-sm gap-1" onClick={handleAdd}
            disabled={submitting || !noteText.trim()}>
            <Plus size={13} /> 新增備注
          </button>
        </div>
      </div>
      <div className="card overflow-hidden">
        <div className="card-header">
          <h3 className="card-title">備注記錄（{notes?.length || 0}）</h3>
        </div>
        {(!notes || notes.length === 0) ? (
          <div className="text-center py-10 text-gray-400 text-sm">尚無備注記錄</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {notes.map((note, idx) => (
              <div key={note.id} className="flex gap-3 px-5 py-4">
                <div className="w-7 h-7 rounded-full bg-primary-light flex items-center justify-center text-sm font-bold text-primary-dark flex-shrink-0">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
                    <span>{note.author_name || '—'}</span>
                    <span>·</span>
                    <span>{new Date(note.created_at).toLocaleString('zh-TW')}</span>
                  </div>
                  {editingId === note.id ? (
                    <textarea
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      className="form-textarea text-base w-full mt-1"
                      rows={3}
                      autoFocus
                    />
                  ) : (
                    <div className="text-base text-gray-800 whitespace-pre-wrap">{note.content}</div>
                  )}
                </div>
                {!isLocked && (
                  <div className="flex gap-1 flex-shrink-0">
                    {editingId === note.id ? (
                      <>
                        <button className="btn btn-sm btn-primary text-xs" onClick={() => handleEditSave(note.id)}>儲存</button>
                        <button className="btn btn-sm text-xs" onClick={() => setEditingId(null)}>取消</button>
                      </>
                    ) : (
                      <>
                        <button className="text-gray-300 hover:text-primary" onClick={() => handleEdit(note)}>
                          <Edit2 size={13} />
                        </button>
                        <button className="text-gray-300 hover:text-danger" onClick={() => handleDelete(note.id)}>
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
