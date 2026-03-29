import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useQuery } from 'react-query';
import { ArrowLeft } from 'lucide-react';
import { casesAPI } from '../utils/api';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function NewCasePage() {
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { urgency: 'normal' }
  });

  const { data: caseTypes } = useQuery('caseTypes', () =>
    api.get('/case-types').then(r => r.data)
  );

  const onSubmit = async (data) => {
    try {
      const res = await casesAPI.create(data);
      toast.success(`案件 ${res.data.case_number} 已建立`);
      navigate(`/cases/${res.data.id}`);
    } catch {}
  };

  return (
    <div className="page-container max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="btn btn-sm"><ArrowLeft size={13} /> 返回</button>
        <h1 className="page-title">新增報修申請</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="card card-body space-y-4">
          <h3 className="font-medium text-sm text-gray-700 pb-2 border-b border-gray-100">基本資訊</h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="form-label">報修標題 *</label>
              <input {...register('title', { required: '標題必填' })} className="form-control" placeholder="簡短描述故障狀況" />
              {errors.title && <p className="text-xs text-danger mt-1">{errors.title.message}</p>}
            </div>
            <div>
              <label className="form-label">報修類型 *</label>
              <select {...register('case_type', { required: '請選擇類型' })} className="form-select">
                <option value="">選擇類型</option>
                {caseTypes?.map(t => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
              {errors.case_type && <p className="text-xs text-danger mt-1">{errors.case_type.message}</p>}
            </div>
            <div>
              <label className="form-label">緊急程度 *</label>
              <select {...register('urgency')} className="form-select">
                <option value="low">低</option>
                <option value="normal">一般</option>
                <option value="emergency">緊急</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="form-label">詳細說明 *</label>
              <textarea {...register('description', { required: '說明必填' })} className="form-textarea" rows={4} placeholder="請詳細描述故障情況、影響範圍及相關背景..." />
              {errors.description && <p className="text-xs text-danger mt-1">{errors.description.message}</p>}
            </div>
          </div>

          <h3 className="font-medium text-sm text-gray-700 pb-2 border-b border-gray-100 pt-2">地點資訊</h3>
          <div>
            <label className="form-label">施工地址 *</label>
            <input {...register('location_address', { required: '地址必填' })} className="form-control" placeholder="完整施工地址（含樓層/區域）" />
            {errors.location_address && <p className="text-xs text-danger mt-1">{errors.location_address.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">緯度（選填）</label>
              <input {...register('location_lat')} className="form-control" placeholder="25.033" type="number" step="any" />
            </div>
            <div>
              <label className="form-label">經度（選填）</label>
              <input {...register('location_lng')} className="form-control" placeholder="121.565" type="number" step="any" />
            </div>
          </div>

          <h3 className="font-medium text-sm text-gray-700 pb-2 border-b border-gray-100 pt-2">業主資訊</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">聯絡人姓名</label>
              <input {...register('owner_name')} className="form-control" placeholder="聯絡人姓名" />
            </div>
            <div>
              <label className="form-label">聯絡電話</label>
              <input {...register('owner_phone')} className="form-control" placeholder="0912-345-678" />
            </div>
            <div className="col-span-2">
              <label className="form-label">公司/機構名稱</label>
              <input {...register('owner_company')} className="form-control" placeholder="業主公司名稱" />
            </div>
          </div>

          <h3 className="font-medium text-sm text-gray-700 pb-2 border-b border-gray-100 pt-2">排程（選填）</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">預計開始時間</label>
              <input {...register('scheduled_start')} className="form-control" type="datetime-local" />
            </div>
            <div>
              <label className="form-label">預計完工時間</label>
              <input {...register('scheduled_end')} className="form-control" type="datetime-local" />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn" onClick={() => navigate(-1)}>取消</button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary btn-lg">
              {isSubmitting ? '建立中...' : '建立案件'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
