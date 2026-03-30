import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Link } from 'react-router-dom';
import { MapPin, Camera, CheckCircle, Plus, Edit2, Trash2, FileText, Image, X, BookOpen } from 'lucide-react';
import { casesAPI, photosAPI } from '../utils/api';
import api from '../utils/api';
import { formatDateTime } from '../utils/helpers';
import useAuthStore from '../store/authStore';
import PhotoUpload from '../components/PhotoUpload';
import toast from 'react-hot-toast';

// ── 案件記錄 API ─────────────────────────────────────────────
const notesAPI = {
  list: (caseId) => api.get(`/case-notes/${caseId}`),
  create: (caseId, fd) => api.post(`/case-notes/${caseId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  update: (caseId, noteId, data) => api.put(`/case-notes/${caseId}/${noteId}`, data),
  delete: (caseId, noteId) => api.delete(`/case-notes/${caseId}/${noteId}`),
  deletePhoto: (caseId, photoId) => api.delete(`/case-notes/${caseId}/photo/${photoId}`),
};

// ── 新增/編輯記錄表單 ────────────────────────────────────────
function NoteForm({ caseId, note, onClose, onSuccess, isClosed }) {
  const [content, setContent] = useState(note?.content || '');
  const [photos, setPhotos] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef();

  const handlePhotoSelect = (e) => {
    const files = Array.from(e.target.files);
    setPhotos(prev => [...prev, ...files]);
    setPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
  };

  const removeNewPhoto = (idx) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
    setPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!content.trim()) { toast.error('請填寫記錄內容'); return; }
    setSubmitting(true);
    try {
      if (note) {
        // 編輯：只更新文字
        await notesAPI.update(caseId, note.id, { content });
        toast.success('記錄已更新');
      } else {
        // 新增：含照片
        const fd = new FormData();
        fd.append('content', content);
        photos.forEach(f => fd.append('photos', f));
        await notesAPI.create(caseId, fd);
        toast.success('記錄已新增');
      }
      onSuccess();
    } catch {}
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">{note ? '編輯記錄' : '新增現場記錄'}</h2>
          <button className="btn btn-sm" onClick={onClose}>關閉</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="form-label">記錄內容 *</label>
            <textarea
              className="form-textarea"
              rows={5}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="記錄現場處理細節、與業主對談摘要、特殊狀況說明..."
              disabled={isClosed}
            />
          </div>

          {/* 照片（新增時才可上傳） */}
          {!note && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="form-label mb-0">附加照片（選填）</label>
                <button type="button" className="btn btn-sm gap-1" onClick={() => fileRef.current.click()}>
                  <Camera size={12} /> 選擇照片
                </button>
                <input ref={fileRef} type="file" className="hidden" multiple accept="image/*"
                  onChange={handlePhotoSelect} />
              </div>
              {previews.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {previews.map((url, idx) => (
                    <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-gray-100">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center"
                        onClick={() => removeNewPhoto(idx)}>
                        <X size={10} className="text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button className="btn" onClick={onClose}>取消</button>
            <button className="btn btn-primary" disabled={submitting || isClosed} onClick={handleSubmit}>
              {submitting ? '儲存中...' : '儲存記錄'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 記錄列表 ─────────────────────────────────────────────────
function NotesList({ caseId, isClosed }) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [editNote, setEditNote] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const { data: notes, isLoading } = useQuery(
    ['caseNotes', caseId],
    () => notesAPI.list(caseId).then(r => r.data)
  );

  const deleteMutation = useMutation(
    (noteId) => notesAPI.delete(caseId, noteId),
    { onSuccess: () => { toast.success('記錄已刪除'); qc.invalidateQueries(['caseNotes', caseId]); } }
  );

  const deletePhotoMutation = useMutation(
    (photoId) => notesAPI.deletePhoto(caseId, photoId),
    { onSuccess: () => qc.invalidateQueries(['caseNotes', caseId]) }
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-gray-500">{notes?.length || 0} 筆記錄</div>
        {!isClosed && (
          <button className="btn btn-primary btn-sm gap-1" onClick={() => setShowForm(true)}>
            <Plus size={13} /> 新增記錄
          </button>
        )}
        {isClosed && (
          <span className="badge badge-gray text-xs">案件已結案，記錄已鎖定</span>
        )}
      </div>

      {isLoading && <div className="text-sm text-gray-400 py-4">載入中...</div>}

      {!notes?.length && !isLoading && (
        <div className="card card-body text-center py-10">
          <BookOpen size={28} className="text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">尚無現場記錄</p>
          {!isClosed && (
            <button className="btn btn-sm mt-3 mx-auto" onClick={() => setShowForm(true)}>+ 新增第一筆記錄</button>
          )}
        </div>
      )}

      <div className="space-y-4">
        {notes?.map(note => (
          <div key={note.id} className="card card-body">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-gray-400 mb-1.5">
                  <span className="font-medium text-gray-600">{note.author_name}</span>
                  <span>·</span>
                  <span>{formatDateTime(note.created_at)}</span>
                  {note.updated_at !== note.created_at && (
                    <span className="text-gray-300">（已編輯）</span>
                  )}
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{note.content}</p>
              </div>
              {!isClosed && note.author_name === user.name && (
                <div className="flex gap-1 flex-shrink-0">
                  <button className="btn btn-sm px-2" onClick={() => { setEditNote(note); setShowForm(true); }}>
                    <Edit2 size={12} />
                  </button>
                  <button className="btn btn-sm px-2 hover:bg-danger-light hover:text-danger"
                    onClick={() => { if (window.confirm('確定刪除此記錄？')) deleteMutation.mutate(note.id); }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>

            {/* 記錄照片 */}
            {note.photos?.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-gray-50">
                {note.photos.map(p => (
                  <div key={p.id} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-100">
                    <a
                      href={`https://repair-system-production-cf5b.up.railway.app${p.file_url}`}
                      target="_blank" rel="noopener noreferrer"
                    >
                      <img
                        src={`https://repair-system-production-cf5b.up.railway.app${p.file_url}`}
                        alt=""
                        className="w-full h-full object-cover hover:opacity-90 transition-opacity"
                      />
                    </a>
                    {p.drive_link && (
                      <a href={p.drive_link} target="_blank" rel="noopener noreferrer"
                        className="absolute bottom-0.5 right-0.5 bg-white/90 rounded px-1 py-0.5 text-[9px] text-primary">
                        Drive
                      </a>
                    )}
                    {!isClosed && (
                      <button
                        className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/50 rounded-full hidden group-hover:flex items-center justify-center"
                        onClick={() => deletePhotoMutation.mutate(p.id)}
                      >
                        <X size={9} className="text-white" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {showForm && (
        <NoteForm
          caseId={caseId}
          note={editNote}
          isClosed={isClosed}
          onClose={() => { setShowForm(false); setEditNote(null); }}
          onSuccess={() => { setShowForm(false); setEditNote(null); qc.invalidateQueries(['caseNotes', caseId]); }}
        />
      )}
    </div>
  );
}

// ── 主頁面 ───────────────────────────────────────────────────
export default function FieldPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [gpsLoading, setGpsLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [activeTab, setActiveTab] = useState('checkin');

  const { data } = useQuery('myTasks', () =>
    casesAPI.list({ limit: 20 }).then(r => r.data)
  );

  const myActiveCases = data?.cases?.filter(c =>
    ['dispatched','in_progress'].includes(c.status)
  ) || [];

  const [selectedCase, setSelectedCase] = useState(null);
  const activeCase = selectedCase || myActiveCases[0];

  const isClosed = activeCase && ['completed','closed','cancelled'].includes(activeCase.status);

  // 獨立查詢施工照片（casesAPI.list 不含照片）
  const { data: casePhotos, refetch: refetchPhotos } = useQuery(
    ['fieldPhotos', activeCase?.id],
    () => photosAPI.list(activeCase.id).then(r => r.data),
    { enabled: !!activeCase?.id }
  );

  const BACKEND_URL = 'https://repair-system-production-cf5b.up.railway.app';
  const fullUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return `${BACKEND_URL}${url}`;
  };

  const photosByPhase = { before: [], during: [], after: [] };
  casePhotos?.forEach(p => {
    const photo = { ...p, file_url: fullUrl(p.file_url) };
    if (photosByPhase[p.phase]) photosByPhase[p.phase].push(photo);
  });

  const checkinMutation = useMutation(
    ({ type, lat, lng, address }) =>
      casesAPI.checkin(activeCase.id, { type, latitude: lat, longitude: lng, address, notes }),
    {
      onSuccess: (_, vars) => {
        toast.success(vars.type === 'checkin' ? '✅ 到場打卡成功' : '✅ 離場打卡成功');
        qc.invalidateQueries('myTasks');
      }
    }
  );

  const doCheckin = (type) => {
    setGpsLoading(true);
    if (!navigator.geolocation) { toast.error('裝置不支援 GPS'); setGpsLoading(false); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setGpsLoading(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        let address = `GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        // 嘗試反向地理編碼取得中文地址
        try {
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=zh-TW`
          );
          const geoData = await geoRes.json();
          if (geoData.display_name) {
            address = geoData.display_name.split(',').slice(0,4).join(', ');
          }
        } catch {}
        checkinMutation.mutate({ type, lat, lng, address });
      },
      () => { setGpsLoading(false); toast.error('無法取得 GPS 位置，請確認定位權限'); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const tabs = [
    { key: 'checkin', label: '打卡作業' },
    { key: 'photos', label: '施工照片' },
    { key: 'notes', label: `案件記錄 ${activeCase ? '' : ''}` },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">現場作業</h1>
        <div className="flex items-center gap-2">
          <span className="badge badge-primary text-xs">{user?.name}</span>
          {activeCase && (
            <Link to={`/field-quote?case_id=${activeCase.id}`} className="btn btn-sm gap-1">
              <FileText size={13} /> 現場報價單
            </Link>
          )}
          {!activeCase && (
            <Link to="/field-quote" className="btn btn-sm gap-1">
              <FileText size={13} /> 現場報價單
            </Link>
          )}
        </div>
      </div>

      {!myActiveCases.length ? (
        <div className="card card-body text-center py-16">
          <div className="text-gray-400 text-sm">目前沒有指派給您的任務</div>
          <Link to="/cases" className="btn btn-sm mt-3 mx-auto">查看所有案件</Link>
        </div>
      ) : (
        <>
          {myActiveCases.length > 1 && (
            <div className="filter-bar">
              <label className="text-xs text-gray-500">選擇任務：</label>
              <select className="form-select w-auto"
                value={activeCase?.id}
                onChange={e => setSelectedCase(myActiveCases.find(c => c.id === e.target.value))}>
                {myActiveCases.map(c => <option key={c.id} value={c.id}>{c.case_number} - {c.title}</option>)}
              </select>
            </div>
          )}

          {activeCase && (
            <>
              {/* 案件標題 */}
              <div className="card card-body mb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs text-primary font-mono font-medium">{activeCase.case_number}</div>
                    <div className="text-base font-semibold text-gray-900 mt-0.5">{activeCase.title}</div>
                    <div className="flex items-start gap-1.5 mt-1 text-sm text-gray-500">
                      <MapPin size={14} className="mt-0.5 flex-shrink-0 text-gray-400" />
                      {activeCase.location_address}
                    </div>
                  </div>
                  <span className={`badge flex-shrink-0 ${activeCase.status === 'in_progress' ? 'badge-teal' : 'badge-primary'}`}>
                    {activeCase.status === 'in_progress' ? '施工中' : '待到場'}
                  </span>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-0 mb-5 border-b border-gray-100">
                {tabs.map(t => (
                  <button key={t.key} onClick={() => setActiveTab(t.key)}
                    className={`px-4 py-2.5 text-sm border-b-2 transition-colors ${activeTab === t.key ? 'border-primary text-primary font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* ── 打卡作業 ── */}
              {activeTab === 'checkin' && (
                <div className="max-w-lg space-y-4">
                  <div className="card card-body space-y-3">
                    <h3 className="font-medium text-sm">GPS 定點打卡</h3>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <div className="text-sm font-medium">到場打卡</div>
                        {activeCase.checkin_time
                          ? <div className="text-xs text-success mt-0.5">✓ {formatDateTime(activeCase.checkin_time)}</div>
                          : <div className="text-xs text-gray-400 mt-0.5">尚未打卡</div>}
                      </div>
                      {!activeCase.checkin_time
                        ? <button className="btn btn-primary btn-sm gap-1" disabled={gpsLoading} onClick={() => doCheckin('checkin')}>
                            <MapPin size={13} /> {gpsLoading ? '定位中...' : '到場打卡'}
                          </button>
                        : <CheckCircle size={20} className="text-success" />}
                    </div>

                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <div className="text-sm font-medium">離場打卡</div>
                        {activeCase.checkout_time
                          ? <div className="text-xs text-success mt-0.5">✓ {formatDateTime(activeCase.checkout_time)}</div>
                          : <div className="text-xs text-gray-400 mt-0.5">工程完成後打卡</div>}
                      </div>
                      {activeCase.checkin_time && !activeCase.checkout_time
                        ? <button className="btn btn-sm gap-1" disabled={gpsLoading} onClick={() => doCheckin('checkout')}>
                            <MapPin size={13} /> 離場打卡
                          </button>
                        : activeCase.checkout_time ? <CheckCircle size={20} className="text-success" /> : null}
                    </div>

                    <div>
                      <label className="form-label">打卡備注</label>
                      <textarea className="form-textarea" rows={2} value={notes}
                        onChange={e => setNotes(e.target.value)} placeholder="施工狀況備注..." />
                    </div>
                  </div>

                  {activeCase.checkout_time && (
                    <Link to={`/cases/${activeCase.id}/sign`} className="btn btn-primary w-full justify-center">
                      前往業主簽收結案
                    </Link>
                  )}
                </div>
              )}

              {/* ── 施工照片 ── */}
              {activeTab === 'photos' && (
                <div className="space-y-4">
                  {['before','during','after'].map(phase => (
                    <div key={phase} className="card card-body">
                      <h3 className="font-medium text-sm mb-3">
                        <Camera size={14} className="inline mr-1.5 text-gray-400" />
                        {phase === 'before' ? '施工前照片' : phase === 'during' ? '施工中照片' : '施工後照片'}
                        {(phase === 'before' || phase === 'after') && <span className="text-danger ml-1 text-xs">必填</span>}
                        <span className="ml-2 text-xs text-gray-400 font-normal">({photosByPhase[phase].length} 張)</span>
                      </h3>

                      {/* 已上傳照片縮圖（電腦版 50% 寬度，手機版 3 欄） */}
                      {photosByPhase[phase].length > 0 && (
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-3">
                          {photosByPhase[phase].map(p => (
                            <a key={p.id} href={p.file_url} target="_blank" rel="noopener noreferrer"
                              className="aspect-square rounded-lg overflow-hidden border border-gray-100 block bg-gray-50">
                              <img
                                src={p.file_url}
                                alt=""
                                className="w-full h-full object-cover hover:opacity-90 transition-opacity"
                                onError={(e) => {
                                  e.target.parentElement.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:9px;color:#aaa;background:#f9fafb;">無法載入</div>';
                                }}
                              />
                            </a>
                          ))}
                        </div>
                      )}

                      <PhotoUpload
                        caseId={activeCase.id}
                        phase={phase}
                        onSuccess={() => {
                          qc.invalidateQueries('myTasks');
                          refetchPhotos();
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* ── 案件記錄 ── */}
              {activeTab === 'notes' && (
                <NotesList caseId={activeCase.id} isClosed={isClosed} />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
