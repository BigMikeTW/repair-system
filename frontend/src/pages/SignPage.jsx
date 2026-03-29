import React, { useRef, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from 'react-query';
import SignaturePad from 'signature_pad';
import { casesAPI } from '../utils/api';
import { formatDateTime } from '../utils/helpers';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';

export default function SignPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const canvasRef = useRef(null);
  const padRef = useRef(null);
  const [signedBy, setSignedBy] = useState(user?.name || '');
  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const { data: caseData } = useQuery(['case', id], () => casesAPI.get(id).then(r => r.data));

  useEffect(() => {
    if (canvasRef.current) {
      padRef.current = new SignaturePad(canvasRef.current, {
        backgroundColor: 'rgb(240, 249, 255)',
        penColor: '#0C447C'
      });
    }
  }, []);

  const clearSign = () => padRef.current?.clear();

  const signMutation = useMutation(
    (data) => casesAPI.sign(id, data),
    {
      onSuccess: () => {
        toast.success('業主簽收完成！案件已結案');
        navigate(`/cases/${id}`);
      }
    }
  );

  const handleSubmit = () => {
    if (!padRef.current || padRef.current.isEmpty()) {
      toast.error('請先在簽名欄簽名');
      return;
    }
    if (!confirmed) {
      toast.error('請確認工程已完成');
      return;
    }
    const signature = padRef.current.toDataURL();
    signMutation.mutate({ signature, signed_by: signedBy, notes, completion_confirmed: true });
  };

  if (!caseData) return <div className="page-container text-sm text-gray-400">載入中...</div>;
  const c = caseData;

  return (
    <div className="page-container max-w-xl mx-auto">
      <h1 className="page-title mb-5">業主簽收確認</h1>

      <div className="card card-body space-y-5">
        {/* Case summary */}
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="text-xs font-medium text-gray-500 mb-3">工程摘要</div>
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <div className="text-gray-500">案件編號</div><div className="font-medium">{c.case_number}</div>
            <div className="text-gray-500">工程類型</div><div>{c.case_type}</div>
            <div className="text-gray-500">施工地點</div><div className="col-span-1">{c.location_address}</div>
            <div className="text-gray-500">負責工程師</div><div>{c.engineer_name || '--'}</div>
            {c.checkin_time && <><div className="text-gray-500">到場時間</div><div>{formatDateTime(c.checkin_time)}</div></>}
            {c.checkout_time && <><div className="text-gray-500">離場時間</div><div>{formatDateTime(c.checkout_time)}</div></>}
          </div>
        </div>

        {/* Confirmation checkboxes */}
        <div>
          <div className="text-xs font-medium text-gray-500 mb-2">工程完成確認</div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" className="mt-0.5 rounded" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
            <span className="text-sm text-gray-700">我確認上述工程已完成，現場已清潔整理，工程品質符合要求</span>
          </label>
        </div>

        {/* Signer name */}
        <div>
          <label className="form-label">簽收人姓名 *</label>
          <input className="form-control" value={signedBy} onChange={e => setSignedBy(e.target.value)} placeholder="請輸入簽收人姓名" />
        </div>

        {/* Notes */}
        <div>
          <label className="form-label">意見備注（選填）</label>
          <textarea className="form-textarea" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="如有意見或特別說明請填寫..." />
        </div>

        {/* Signature pad */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="form-label mb-0">業主電子簽名 *</label>
            <button type="button" className="btn btn-sm text-xs" onClick={clearSign}>清除</button>
          </div>
          <canvas
            ref={canvasRef}
            className="sign-canvas w-full"
            width={500}
            height={120}
            style={{ touchAction: 'none' }}
          />
          <p className="text-xs text-gray-400 mt-1">請在上方區域以滑鼠或手指簽名</p>
        </div>

        <div className="flex gap-3 pt-2">
          <button className="btn flex-1 justify-center" onClick={() => navigate(`/cases/${id}`)}>取消</button>
          <button
            className="btn btn-primary flex-1 justify-center"
            disabled={signMutation.isLoading}
            onClick={handleSubmit}
          >
            {signMutation.isLoading ? '處理中...' : '確認簽收 · 案件結案'}
          </button>
        </div>
      </div>
    </div>
  );
}
