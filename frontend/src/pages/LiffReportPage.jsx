import React, { useState, useEffect } from 'react';
import { CheckCircle, ChevronRight, ChevronLeft, Camera, MapPin, Phone, User, FileText, Wrench } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

// LINE LIFF SDK
const LIFF_ID = '2009672015-Sge8Zhej';

export default function LiffReportPage() {
  const [liffReady, setLiffReady] = useState(false);
  const [lineUser, setLineUser] = useState(null);
  const [step, setStep] = useState(1); // 1,2,3,done
  const [caseTypes, setCaseTypes] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submittedCase, setSubmittedCase] = useState(null);

  const [form, setForm] = useState({
    owner_name: '', owner_phone: '', owner_company: '',
    case_type: '', location_address: '', description: '', urgency: 'normal'
  });

  // 初始化 LIFF
  useEffect(() => {
    const initLiff = async () => {
      try {
        // 動態載入 LIFF SDK
        await new Promise((resolve, reject) => {
          if (window.liff) { resolve(); return; }
          const script = document.createElement('script');
          script.src = 'https://static.line-scdn.net/liff/edge/versions/2.22.3/sdk.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });

        await window.liff.init({ liffId: LIFF_ID });

        if (window.liff.isLoggedIn()) {
          const profile = await window.liff.getProfile();
          setLineUser(profile);
          setForm(f => ({ ...f, owner_name: profile.displayName }));
        } else {
          // 在 LINE 內建瀏覽器中自動登入
          if (window.liff.isInClient()) {
            window.liff.login();
          }
          // 一般瀏覽器中不強制登入，讓用戶手動填寫
        }
      } catch (e) {
        console.error('LIFF init error:', e);
        // LIFF 初始化失敗時仍可繼續使用（不強制 LINE 登入）
      }
      setLiffReady(true);
    };

    initLiff();

    // 取得案件類型
    api.get('/case-types').then(r => setCaseTypes(r.data || [])).catch(() => {});
  }, []);

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handlePhotoUpload = (e) => {
    const files = Array.from(e.target.files);
    if (photos.length + files.length > 3) {
      toast.error('最多上傳 3 張照片');
      return;
    }
    const newPhotos = files.map(f => ({ file: f, preview: URL.createObjectURL(f) }));
    setPhotos(p => [...p, ...newPhotos]);
  };

  const removePhoto = (i) => {
    setPhotos(p => p.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([k, v]) => formData.append(k, v));
      if (lineUser) formData.append('line_user_id', lineUser.userId);
      photos.forEach((p, i) => formData.append(`photo_${i}`, p.file));

      const res = await api.post('/cases/public', Object.fromEntries(formData));
      setSubmittedCase(res.data);
      setStep('done');
    } catch (e) {
      toast.error(e.response?.data?.error || '提交失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };

  // 完成頁面
  if (step === 'done') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#F5F0EA] to-[#EDE8E0] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-sm p-8 text-center shadow-2xl">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={40} className="text-green-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">報修申請已送出！</h2>
          <p className="text-gray-500 text-sm mb-6">客服人員將盡快與您聯繫</p>
          <div className="bg-orange-50 rounded-xl p-4 mb-6">
            <div className="text-xs text-gray-400 mb-1">您的案件編號</div>
            <div className="text-2xl font-mono font-bold text-[#E8614A]">{submittedCase?.case_number}</div>
            <div className="text-xs text-gray-400 mt-1">請保存此編號以便查詢進度</div>
          </div>
          <a href={`/track/${submittedCase?.case_number}`}
            className="block w-full bg-[#E8614A] text-white py-3 rounded-xl font-medium text-center mb-3">
            查詢案件進度
          </a>
          {window.liff?.isInClient() && (
            <button onClick={() => window.liff.closeWindow()}
              className="w-full border border-gray-200 text-gray-600 py-3 rounded-xl font-medium">
              關閉
            </button>
          )}
        </div>
      </div>
    );
  }

  // 步驟指示器
  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[1, 2, 3].map(s => (
        <React.Fragment key={s}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
            step === s ? 'bg-[#E8614A] text-white shadow-lg scale-110' :
            step > s ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'
          }`}>
            {step > s ? '✓' : s}
          </div>
          {s < 3 && <div className={`h-0.5 w-8 ${step > s ? 'bg-green-500' : 'bg-gray-200'}`} />}
        </React.Fragment>
      ))}
    </div>
  );

  if (!liffReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#F5F0EA] to-[#EDE8E0] flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm opacity-70">載入中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5F0EA] to-[#EDE8E0]">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 text-center">
        <div className="text-[#E8614A] text-xs font-bold tracking-widest mb-1">Pro080</div>
        <h1 className="text-[#1A1A1A] text-xl font-bold">線上報修申請</h1>
        {lineUser && (
          <div className="flex items-center justify-center gap-2 mt-2">
            <img src={lineUser.pictureUrl} alt="" className="w-6 h-6 rounded-full" />
            <span className="text-gray-400 text-xs">{lineUser.displayName}</span>
          </div>
        )}
      </div>

      <div className="px-4 pb-8">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-lg mx-auto p-6">
          <StepIndicator />

          {/* Step 1: 基本資料 */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900 mb-4">基本資料</h2>
              <div>
                <label className="form-label flex items-center gap-1"><User size={14} />姓名 <span className="text-red-500">*</span></label>
                <input className="form-control" value={form.owner_name} onChange={e => update('owner_name', e.target.value)} placeholder="請輸入姓名" />
              </div>
              <div>
                <label className="form-label flex items-center gap-1"><Phone size={14} />電話 <span className="text-red-500">*</span></label>
                <input className="form-control" value={form.owner_phone} onChange={e => update('owner_phone', e.target.value)} placeholder="0912-345-678" type="tel" />
              </div>
              <div>
                <label className="form-label">公司/單位（選填）</label>
                <input className="form-control" value={form.owner_company} onChange={e => update('owner_company', e.target.value)} placeholder="公司或大樓名稱" />
              </div>
              <button
                onClick={() => {
                  if (!form.owner_name.trim() || !form.owner_phone.trim()) {
                    toast.error('請填寫姓名和電話');
                    return;
                  }
                  setStep(2);
                }}
                className="w-full flex items-center justify-center gap-2 bg-[#E8614A] text-white py-3 rounded-xl font-medium mt-4">
                下一步 <ChevronRight size={18} />
              </button>
            </div>
          )}

          {/* Step 2: 問題描述 */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900 mb-4">問題描述</h2>
              <div>
                <label className="form-label flex items-center gap-1"><Wrench size={14} />報修類型 <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {caseTypes.map(t => (
                    <button key={t.id} onClick={() => update('case_type', t.name)}
                      className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                        form.case_type === t.name
                          ? 'border-[#E8614A] bg-orange-50 text-[#E8614A]'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}>
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="form-label flex items-center gap-1"><MapPin size={14} />施工地點 <span className="text-red-500">*</span></label>
                <input className="form-control" value={form.location_address} onChange={e => update('location_address', e.target.value)} placeholder="請輸入詳細地址" />
              </div>
              <div>
                <label className="form-label flex items-center gap-1"><FileText size={14} />問題說明 <span className="text-red-500">*</span></label>
                <textarea className="form-control" rows={3} value={form.description} onChange={e => update('description', e.target.value)} placeholder="請描述發生的問題..." />
              </div>
              <div>
                <label className="form-label">緊急程度</label>
                <div className="flex gap-2 mt-1">
                  {[['low','低'], ['normal','一般'], ['emergency','緊急']].map(([val, label]) => (
                    <button key={val} onClick={() => update('urgency', val)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                        form.urgency === val
                          ? val === 'emergency' ? 'bg-red-500 border-red-500 text-white'
                          : val === 'normal' ? 'bg-blue-500 border-blue-500 text-white'
                          : 'bg-gray-400 border-gray-400 text-white'
                          : 'border-gray-200 text-gray-500'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={() => setStep(1)} className="flex-1 flex items-center justify-center gap-2 border border-gray-200 text-gray-600 py-3 rounded-xl font-medium">
                  <ChevronLeft size={18} /> 上一步
                </button>
                <button onClick={() => {
                  if (!form.case_type || !form.location_address.trim() || !form.description.trim()) {
                    toast.error('請填寫所有必填欄位');
                    return;
                  }
                  setStep(3);
                }} className="flex-1 flex items-center justify-center gap-2 bg-[#E8614A] text-white py-3 rounded-xl font-medium">
                  下一步 <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: 照片上傳 */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900 mb-2">照片上傳 <span className="text-sm font-normal text-gray-400">（選填，最多 3 張）</span></h2>

              <div className="grid grid-cols-3 gap-2">
                {photos.map((p, i) => (
                  <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200">
                    <img src={p.preview} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => removePhoto(i)}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">
                      ×
                    </button>
                  </div>
                ))}
                {photos.length < 3 && (
                  <label className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-[#E8614A] transition-colors">
                    <Camera size={24} className="text-gray-400 mb-1" />
                    <span className="text-xs text-gray-400">新增照片</span>
                    <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handlePhotoUpload} />
                  </label>
                )}
              </div>

              {/* 摘要確認 */}
              <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2">
                <div className="font-medium text-gray-700 mb-2">確認資料</div>
                <div className="flex justify-between"><span className="text-gray-400">姓名</span><span>{form.owner_name}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">電話</span><span>{form.owner_phone}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">類型</span><span>{form.case_type}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">地點</span><span className="text-right max-w-[180px] truncate">{form.location_address}</span></div>
              </div>

              <div className="flex gap-3 mt-4">
                <button onClick={() => setStep(2)} className="flex-1 flex items-center justify-center gap-2 border border-gray-200 text-gray-600 py-3 rounded-xl font-medium">
                  <ChevronLeft size={18} /> 上一步
                </button>
                <button onClick={handleSubmit} disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#E8614A] text-white py-3 rounded-xl font-medium disabled:opacity-60">
                  {submitting ? '送出中...' : '確認送出'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
