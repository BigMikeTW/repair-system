import React from 'react';
import { useQuery, useMutation } from 'react-query';
import { useForm } from 'react-hook-form';
import { usersAPI, casesAPI } from '../utils/api';
import toast from 'react-hot-toast';

export default function DispatchModal({ caseId, caseData, onClose, onSuccess }) {
  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm();
  const { data: engineers } = useQuery('engineers', () => usersAPI.getEngineers().then(r => r.data));

  const assignMutation = useMutation(
    (data) => casesAPI.assign(caseId, data),
    {
      onSuccess: () => { toast.success('派工成功！工程師已收到通知'); onSuccess(); },
    }
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">指派工程師</h2>
          <button className="btn btn-sm" onClick={onClose}>關閉</button>
        </div>
        {caseData && (
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <div className="text-xs text-primary font-mono font-medium">{caseData.case_number}</div>
            <div className="text-sm font-medium text-gray-800 mt-0.5">{caseData.title}</div>
            <div className="text-xs text-gray-400 mt-0.5">{caseData.location_address}</div>
          </div>
        )}
        <form onSubmit={handleSubmit(d => assignMutation.mutate(d))} className="p-5 space-y-4">
          <div>
            <label className="form-label">指派工程師 *</label>
            <select {...register('engineer_id', { required: '請選擇工程師' })} className="form-select">
              <option value="">選擇工程師</option>
              {engineers?.map(eng => (
                <option key={eng.id} value={eng.id}>
                  {eng.name} {eng.specialties?.length ? `· ${eng.specialties.join(', ')}` : ''} {parseInt(eng.active_tasks) > 0 ? `(${eng.active_tasks}個任務中)` : '(可用)'}
                </option>
              ))}
            </select>
            {errors.engineer_id && <p className="text-xs text-danger mt-1">{errors.engineer_id.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">預計到場時間</label>
              <input {...register('scheduled_start')} type="datetime-local" className="form-control" />
            </div>
            <div>
              <label className="form-label">預計完工時間</label>
              <input {...register('scheduled_end')} type="datetime-local" className="form-control" />
            </div>
          </div>
          <div>
            <label className="form-label">派工備注</label>
            <textarea {...register('notes')} className="form-textarea" rows={3} placeholder="注意事項、特殊要求..." />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" className="btn" onClick={onClose}>取消</button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary">
              {isSubmitting ? '派工中...' : '確認派工'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
