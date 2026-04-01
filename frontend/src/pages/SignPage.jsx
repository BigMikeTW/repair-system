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
  // 簽收人欄位預設空白，讓業主自行填寫，不代入工程師名字
  const [signedBy, setSignedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const { data: caseData } = useQuery(['case', id], () => casesAPI.get(id).then(r => r.data));

  useEffect(() => {
    if (canvasRef.current) {
      padRef.current = new SignaturePad(canvasRef.current, {
        backgroundColor: 'rgba(255,255,255,0)',
        penColor: '#0C447C',
        minWidth: 1,
        maxWidth: 3,
      });
    }
  }, []);

  const resizeCanvas = () => {
    if (!canvasRef.current || !padRef.current) return;
    const canvas = canvasRef.current;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d').scale(ratio, ratio);
    padRef.current.clear();
  };

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
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
    if (!signedBy.trim()) {
      toast.error('請填寫簽收人姓名');
      return;
    }
    if (!padRef.current || padRef.current.isEmpty()) {
      toast.error('請先在簽名欄簽名');
      return;
    }
    if (!confirmed) {
      toast.error('請確認工程已完成');
      return;
    }
    const signature = padRef.current.toDataURL('image/png');
    signMutation.mutate({ signature, signed_by: signedBy.trim(), notes, completion_confirmed: true });
  };

  if (!caseData) return <div className="page-container text-sm text-gray-400">載入中...</div>;
  const c = caseData;

  return (
    <div className="page-container max-w-xl mx-auto">
      <h1 className="page-title mb-5">業主簽收確認</h1>

      <div className="card card-body space-y-5">
        {/* 工程摘要 */}
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="text-xs font-medium text-gray-500 mb-3">工程摘要</div>
          <div className="grid grid-cols-2 gap-y-2.5 text-sm">
            <div className="text-gray-500">案件編號</div>
            <div className="font-medium">{c.case_number}</div>
            <div className="text-gray-500">業主/公司</div>
            <div className="break-words">{c.owner_company || c.owner_name || '--'}</div>
            <div className="text-gray-500">工程類型</div>
            <div className="break-words">{c.case_type}</div>
            <div className="text-gray-500">施工地點</div>
            <div className="col-span-1 text-xs break-words">{c.location_address}</div>
            <div className="text-gray-500">負責工程師</div>
            <div className="break-words">{c.engineer_name || '--'}</div>
            {c.checkin_time && (
              <>
                <div className="text-gray-500">到場時間</div>
                <div className="text-success text-xs">{formatDateTime(c.checkin_time)}</div>
              </>
            )}
            {c.checkout_time && (
              <>
                <div className="text-gray-500">離場時間</div>
                <div className="text-success text-xs">{formatDateTime(c.checkout_time)}</div>
              </>
            )}
          </div>
        </div>

        {/* 工程完成確認 */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-500">工程完成確認</div>
          <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 transition-colors">
            <input
              type="checkbox"
              className="mt-0.5 rounded"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
            />
            <span className="text-sm text-gray-700">
              本人確認上述工程已完成，現場已清潔整理完畢，工程品質符合要求，並同意以電子簽名作為驗收確認
            </span>
          </label>
        </div>

        {/* 簽收人姓名 - 空白讓業主填寫 */}
        <div>
          <label className="form-label">簽收人姓名 * <span className="text-gray-400 font-normal">（請業主填寫）</span></label>
          <input
            className="form-control"
            value={signedBy}
            onChange={e => setSignedBy(e.target.value)}
            placeholder="請填寫業主或授權代理人姓名"
          />
        </div>

        {/* 意見備注 */}
        <div>
          <label className="form-label">意見備注（選填）</label>
          <textarea
            className="form-textarea"
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="如有意見或特別說明請填寫..."
          />
        </div>

        {/* 電子簽名 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="form-label mb-0">
              業主電子簽名 * <span className="text-gray-400 font-normal">（請業主親自簽名）</span>
            </label>
            <button type="button" className="btn btn-sm text-xs" onClick={clearSign}>
              清除重簽
            </button>
          </div>
          <div className="relative border-2 border-dashed border-primary rounded-xl overflow-hidden"
            style={{ background: '#f0f9ff' }}>
            <canvas
              ref={canvasRef}
              style={{
                width: '100%',
                height: '140px',
                touchAction: 'none',
                cursor: 'crosshair',
                display: 'block'
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
              <span className="text-primary text-sm">請在此處簽名</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">請使用滑鼠（電腦）或手指（手機/平板）在上方區域簽名</p>
        </div>

        {/* 操作按鈕 */}
        <div className="flex gap-3 pt-2">
          <button
            className="btn flex-1 justify-center"
            onClick={() => navigate(`/cases/${id}`)}
          >
            取消
          </button>
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
