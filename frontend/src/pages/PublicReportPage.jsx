import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery } from 'react-query';
import { CheckCircle, Wrench, MapPin, Phone, User, FileText, AlertTriangle } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const BACKEND_URL = 'https://repair-system-production-cf5b.up.railway.app';

export default function PublicReportPage() {
  const [step, setStep] = useState('form'); // form | otp | success
  const [submittedCase, setSubmittedCase] = useState(null);
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { urgency: 'normal' }
  });

  const { data: caseTypes } = useQuery('publicCaseTypes', () =>
    api.get('/case-types').then(r => r.data), { retry: 1 }
  );

  const onSubmit = async (data) => {
    try {
      const res = await api.post('/cases/public', data);
      setSubmittedCase(res.data);
      setStep('success');
    } catch (e) {
      toast.error(e.response?.data?.error || '提交失敗，請稍後再試');
    }
  };

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1A1A2E] to-[#0F3460] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-md p-8 text-center shadow-2xl">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={40} className="text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">報修申請已送出！</h2>
          <p className="text-gray-500 mb-6">我們已收到您的報修申請，客服人員將盡快與您聯繫。</p>

          <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
            <div className="text-xs text-gray-400 mb-1">您的案件編號</div>
            <div className="text-2xl font-mono font-bold text-[#FF6B00]">{submittedCase?.case_number}</div>
            <div className="text-xs text-gray-400 mt-2">請保存此編號以便後續查詢進度</div>
          </div>

          <div className="space-y-3">
            <a
              href={`/track/${submittedCase?.case_number}`}
              className="block w-full bg-[#FF6B00] text-white py-3 rounded-xl font-medium hover:bg-orange-600 transition-colors"
            >
              查詢案件進度
            </a>
            <button
              onClick={() => { setStep('form'); setSubmittedCase(null); }}
              className="block w-full border border-gray-200 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-50 transition-colors"
            >
              再次申請報修
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1A1A2E] to-[#0F3460]">
      {/* Header */}
      <div className="px-4 py-6 text-center">
        <div className="text-[#FF6B00] text-sm font-bold tracking-widest mb-2">皇祥工程設計</div>
        <h1 className="text-white text-2xl font-bold">線上報修申請</h1>
        <p className="text-gray-400 text-sm mt-1">填寫以下資料，我們將盡快安排服務</p>
      </div>

      <div className="px-4 pb-8">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-lg mx-auto">
          <form onSubmit={handleSubmit(onSubmit)}>

            {/* 聯絡資訊 */}
            <div className="p-6 border-b border-gray-50">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                  <User size={16} className="text-[#FF6B00]" />
                </div>
                <h3 className="font-semibold text-gray-900">聯絡資訊</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">姓名 *</label>
                  <input
                    {...register('owner_name', { required: '請填寫姓名' })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#FF6B00] transition-colors"
                    placeholder="您的姓名"
                  />
                  {errors.owner_name && <p className="text-xs text-red-500 mt-1">{errors.owner_name.message}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">聯絡電話 *</label>
                  <input
                    {...register('owner_phone', { required: '請填寫電話', pattern: { value: /^[0-9]{8,10}$/, message: '請填寫正確電話號碼' } })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#FF6B00] transition-colors"
                    placeholder="0912345678"
                    type="tel"
                  />
                  {errors.owner_phone && <p className="text-xs text-red-500 mt-1">{errors.owner_phone.message}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">公司/單位名稱</label>
                  <input
                    {...register('owner_company')}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#FF6B00] transition-colors"
                    placeholder="選填"
                  />
                </div>
              </div>
            </div>

            {/* 報修資訊 */}
            <div className="p-6 border-b border-gray-50">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                  <Wrench size={16} className="text-[#FF6B00]" />
                </div>
                <h3 className="font-semibold text-gray-900">報修資訊</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">報修標題 *</label>
                  <input
                    {...register('title', { required: '請填寫報修標題' })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#FF6B00] transition-colors"
                    placeholder="簡短描述故障狀況"
                  />
                  {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title.message}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">報修類型 *</label>
                    <select
                      {...register('case_type', { required: '請選擇類型' })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#FF6B00] transition-colors bg-white"
                    >
                      <option value="">選擇類型</option>
                      {caseTypes?.map(t => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                    {errors.case_type && <p className="text-xs text-red-500 mt-1">{errors.case_type.message}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">緊急程度</label>
                    <select
                      {...register('urgency')}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#FF6B00] transition-colors bg-white"
                    >
                      <option value="low">低</option>
                      <option value="normal">一般</option>
                      <option value="emergency">🔴 緊急</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">詳細說明 *</label>
                  <textarea
                    {...register('description', { required: '請填寫故障說明' })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#FF6B00] transition-colors resize-none"
                    rows={4}
                    placeholder="請詳細描述故障情況、影響範圍、何時開始發生..."
                  />
                  {errors.description && <p className="text-xs text-red-500 mt-1">{errors.description.message}</p>}
                </div>
              </div>
            </div>

            {/* 地點資訊 */}
            <div className="p-6 border-b border-gray-50">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                  <MapPin size={16} className="text-[#FF6B00]" />
                </div>
                <h3 className="font-semibold text-gray-900">施工地點</h3>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">完整地址 *</label>
                <input
                  {...register('location_address', { required: '請填寫施工地址' })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#FF6B00] transition-colors"
                  placeholder="完整地址（含樓層/區域）"
                />
                {errors.location_address && <p className="text-xs text-red-500 mt-1">{errors.location_address.message}</p>}
              </div>
            </div>

            {/* 提交 */}
            <div className="p-6">
              <div className="bg-orange-50 rounded-xl p-3 mb-4 flex gap-2">
                <AlertTriangle size={16} className="text-orange-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-orange-700">
                  提交後系統將產生案件編號，請保存以便後續查詢進度。我們將於工作時間內盡快與您聯繫。
                </p>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#FF6B00] text-white py-3.5 rounded-xl font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? '提交中...' : '📤 送出報修申請'}
              </button>
            </div>
          </form>
        </div>

        {/* Query link */}
        <div className="text-center mt-6">
          <a href="/track" className="text-gray-400 text-sm hover:text-white transition-colors">
            已有案件編號？查詢進度 →
          </a>
        </div>
      </div>
    </div>
  );
}
