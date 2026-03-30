import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import { Search, CheckCircle, Circle, AlertCircle, Clock, MapPin, User, Phone } from 'lucide-react';
import api from '../utils/api';

const STATUS_STEPS = [
  { key: 'pending',     label: '待受理',   icon: '📋' },
  { key: 'accepted',    label: '已受理',   icon: '✅' },
  { key: 'dispatched',  label: '派工中',   icon: '🚗' },
  { key: 'in_progress', label: '施工中',   icon: '🔧' },
  { key: 'completed',   label: '已完成',   icon: '🎉' },
  { key: 'closed',      label: '已結案',   icon: '📁' },
];

const STATUS_ORDER = STATUS_STEPS.map(s => s.key);

function StatusTimeline({ currentStatus }) {
  const currentIdx = STATUS_ORDER.indexOf(currentStatus);
  return (
    <div className="flex items-center justify-between relative">
      <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200 z-0" />
      <div
        className="absolute top-5 left-0 h-0.5 bg-[#FF6B00] z-0 transition-all duration-500"
        style={{ width: `${Math.max(0, (currentIdx / (STATUS_STEPS.length - 1)) * 100)}%` }}
      />
      {STATUS_STEPS.map((step, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        return (
          <div key={step.key} className="flex flex-col items-center gap-1.5 relative z-10">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm border-2 transition-all
              ${done ? 'bg-[#FF6B00] border-[#FF6B00] text-white' :
                active ? 'bg-white border-[#FF6B00] shadow-lg shadow-orange-100' :
                'bg-white border-gray-200 text-gray-300'}`}>
              {done ? '✓' : step.icon}
            </div>
            <div className={`text-[10px] text-center leading-tight font-medium
              ${done || active ? 'text-[#FF6B00]' : 'text-gray-300'}`}>
              {step.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function PublicTrackPage() {
  const { caseNumber: paramCaseNumber } = useParams();
  const navigate = useNavigate();
  const [inputCaseNumber, setInputCaseNumber] = useState(paramCaseNumber || '');
  const [searchCaseNumber, setSearchCaseNumber] = useState(paramCaseNumber || '');

  const { data: caseData, isLoading, error } = useQuery(
    ['publicTrack', searchCaseNumber],
    () => api.get(`/cases/track/${searchCaseNumber}`).then(r => r.data),
    { enabled: !!searchCaseNumber, retry: false }
  );

  const handleSearch = (e) => {
    e.preventDefault();
    if (!inputCaseNumber.trim()) return;
    setSearchCaseNumber(inputCaseNumber.trim().toUpperCase());
    navigate(`/track/${inputCaseNumber.trim().toUpperCase()}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1A1A2E] to-[#0F3460]">
      {/* Header */}
      <div className="px-4 py-6 text-center">
        <div className="text-[#FF6B00] text-sm font-bold tracking-widest mb-2">SIGNIFY</div>
        <h1 className="text-white text-2xl font-bold">案件進度查詢</h1>
        <p className="text-gray-400 text-sm mt-1">輸入案件編號即可查詢即時進度</p>
      </div>

      <div className="px-4 pb-8 max-w-lg mx-auto">
        {/* Search Bar */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="flex gap-2">
            <input
              value={inputCaseNumber}
              onChange={e => setInputCaseNumber(e.target.value.toUpperCase())}
              className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-gray-400 outline-none focus:border-[#FF6B00] transition-colors font-mono tracking-wider"
              placeholder="WO-2026-0001"
            />
            <button
              type="submit"
              className="bg-[#FF6B00] text-white px-5 rounded-xl hover:bg-orange-600 transition-colors flex items-center gap-2"
            >
              <Search size={18} />
            </button>
          </div>
        </form>

        {/* Loading */}
        {isLoading && (
          <div className="bg-white rounded-2xl p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-[#FF6B00] border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-gray-500 text-sm">查詢中...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-white rounded-2xl p-8 text-center">
            <div className="text-4xl mb-3">🔍</div>
            <h3 className="font-semibold text-gray-900 mb-1">查無此案件</h3>
            <p className="text-gray-500 text-sm">請確認案件編號是否正確（格式：WO-2026-0001）</p>
          </div>
        )}

        {/* Case Data */}
        {caseData && (
          <div className="space-y-4">
            {/* Main Card */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-xl">
              {/* Card Header */}
              <div className="bg-[#1A1A2E] px-5 py-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[#FF6B00] text-xs font-bold">SIGNIFY</span>
                  <span className="text-gray-400 text-xs">
                    {new Date(caseData.created_at).toLocaleDateString('zh-TW')}
                  </span>
                </div>
                <div className="text-white font-mono text-lg font-bold">{caseData.case_number}</div>
                <div className="text-gray-300 text-sm mt-0.5 truncate">{caseData.title}</div>
              </div>

              {/* Timeline */}
              <div className="px-5 py-6">
                <StatusTimeline currentStatus={caseData.status} />
              </div>

              {/* Info */}
              <div className="px-5 pb-5 space-y-3 border-t border-gray-50 pt-4">
                <div className="flex items-start gap-3">
                  <MapPin size={15} className="text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-gray-400">施工地點</div>
                    <div className="text-sm text-gray-800">{caseData.location_address || '--'}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <User size={15} className="text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-gray-400">負責工程師</div>
                    <div className="text-sm text-gray-800">{caseData.engineer_name || '待指派'}</div>
                  </div>
                </div>
                {caseData.scheduled_start && (
                  <div className="flex items-start gap-3">
                    <Clock size={15} className="text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-gray-400">預計到場時間</div>
                      <div className="text-sm text-gray-800 font-medium">
                        {new Date(caseData.scheduled_start).toLocaleString('zh-TW')}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Activity Timeline */}
            {caseData.activities?.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-xl">
                <h3 className="font-semibold text-gray-900 mb-4">處理記錄</h3>
                <div className="space-y-3">
                  {caseData.activities.map((act, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-2 h-2 rounded-full bg-[#FF6B00] mt-1.5 flex-shrink-0" />
                        {i < caseData.activities.length - 1 && (
                          <div className="w-px flex-1 bg-gray-100 mt-1" />
                        )}
                      </div>
                      <div className="pb-3">
                        <div className="text-sm text-gray-800">{act.description}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {new Date(act.created_at).toLocaleString('zh-TW')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Report Another */}
            <a
              href="/public/report"
              className="block text-center bg-white/10 border border-white/20 text-white py-3 rounded-xl text-sm hover:bg-white/20 transition-colors"
            >
              + 申請新的報修
            </a>
          </div>
        )}

        {/* Empty State */}
        {!searchCaseNumber && !isLoading && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
            <div className="text-5xl mb-4">🔍</div>
            <p className="text-gray-400">輸入案件編號開始查詢</p>
          </div>
        )}
      </div>
    </div>
  );
}
