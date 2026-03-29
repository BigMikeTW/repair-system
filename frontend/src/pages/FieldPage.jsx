import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { MapPin, Camera, CheckCircle } from 'lucide-react';
import { casesAPI } from '../utils/api';
import { formatDateTime } from '../utils/helpers';
import useAuthStore from '../store/authStore';
import PhotoUpload from '../components/PhotoUpload';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

export default function FieldPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [gpsLoading, setGpsLoading] = useState(false);
  const [notes, setNotes] = useState('');

  const { data } = useQuery('myTasks', () =>
    casesAPI.list({ limit: 20 }).then(r => r.data)
  );

  const myActiveCases = data?.cases?.filter(c =>
    ['dispatched','in_progress'].includes(c.status)
  ) || [];

  const [selectedCase, setSelectedCase] = useState(null);
  const activeCase = selectedCase || myActiveCases[0];

  const checkinMutation = useMutation(
    ({ type, lat, lng, address }) => casesAPI.checkin(activeCase.id, { type, latitude: lat, longitude: lng, address, notes }),
    {
      onSuccess: (_, vars) => {
        toast.success(vars.type === 'checkin' ? '✅ 到場打卡成功' : '✅ 離場打卡成功');
        qc.invalidateQueries('myTasks');
        qc.invalidateQueries(['case', activeCase?.id]);
      }
    }
  );

  const doCheckin = (type) => {
    setGpsLoading(true);
    if (!navigator.geolocation) {
      toast.error('裝置不支援 GPS');
      setGpsLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLoading(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        checkinMutation.mutate({ type, lat, lng, address: `GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}` });
      },
      (err) => {
        setGpsLoading(false);
        toast.error('無法取得 GPS 位置，請確認定位權限已開啟');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">現場作業</h1>
        <span className="badge badge-primary">{user?.name}</span>
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
              <select className="form-select w-auto" value={activeCase?.id} onChange={e => setSelectedCase(myActiveCases.find(c => c.id === e.target.value))}>
                {myActiveCases.map(c => <option key={c.id} value={c.id}>{c.case_number} - {c.title}</option>)}
              </select>
            </div>
          )}

          {activeCase && (
            <div className="grid md:grid-cols-2 gap-5">
              {/* Case info + checkin */}
              <div className="space-y-4">
                <div className="card card-body">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-xs text-primary font-mono font-medium">{activeCase.case_number}</div>
                      <div className="text-base font-semibold text-gray-900 mt-0.5">{activeCase.title}</div>
                    </div>
                    <span className={`badge ${activeCase.status === 'in_progress' ? 'badge-teal' : 'badge-primary'}`}>
                      {activeCase.status === 'in_progress' ? '施工中' : '待到場'}
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-gray-600">
                    <MapPin size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
                    {activeCase.location_address}
                  </div>
                  {activeCase.scheduled_start && (
                    <div className="text-xs text-gray-400 mt-2">預計到場：{formatDateTime(activeCase.scheduled_start)}</div>
                  )}
                </div>

                <div className="card card-body">
                  <h3 className="font-medium text-sm mb-4">GPS 定點打卡</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <div className="text-sm font-medium">到場打卡</div>
                        {activeCase.checkin_time
                          ? <div className="text-xs text-success mt-0.5">✓ {formatDateTime(activeCase.checkin_time)}</div>
                          : <div className="text-xs text-gray-400 mt-0.5">尚未打卡</div>
                        }
                      </div>
                      {!activeCase.checkin_time && (
                        <button className="btn btn-primary btn-sm" disabled={gpsLoading || checkinMutation.isLoading} onClick={() => doCheckin('checkin')}>
                          <MapPin size={13} /> {gpsLoading ? '定位中...' : '到場打卡'}
                        </button>
                      )}
                      {activeCase.checkin_time && <CheckCircle size={20} className="text-success" />}
                    </div>

                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <div className="text-sm font-medium">離場打卡</div>
                        {activeCase.checkout_time
                          ? <div className="text-xs text-success mt-0.5">✓ {formatDateTime(activeCase.checkout_time)}</div>
                          : <div className="text-xs text-gray-400 mt-0.5">工程完成後打卡</div>
                        }
                      </div>
                      {activeCase.checkin_time && !activeCase.checkout_time && (
                        <button className="btn btn-sm" disabled={gpsLoading} onClick={() => doCheckin('checkout')}>
                          <MapPin size={13} /> 離場打卡
                        </button>
                      )}
                      {activeCase.checkout_time && <CheckCircle size={20} className="text-success" />}
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="form-label">施工備注</label>
                    <textarea className="form-textarea" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="記錄現場狀況、使用材料等..." />
                  </div>

                  {activeCase.checkout_time && (
                    <Link to={`/cases/${activeCase.id}/sign`} className="btn btn-primary w-full justify-center mt-4">
                      前往業主簽收結案
                    </Link>
                  )}
                </div>
              </div>

              {/* Photo upload */}
              <div className="space-y-4">
                {['before', 'during', 'after'].map(phase => (
                  <div key={phase} className="card card-body">
                    <h3 className="font-medium text-sm mb-3">
                      <Camera size={14} className="inline mr-1.5 text-gray-400" />
                      {phase === 'before' ? '施工前照片' : phase === 'during' ? '施工中照片' : '施工後照片'}
                      {(phase === 'before' || phase === 'after') && <span className="text-danger ml-1 text-xs">必填</span>}
                    </h3>
                    <PhotoUpload
                      caseId={activeCase.id}
                      phase={phase}
                      onSuccess={() => qc.invalidateQueries('myTasks')}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
