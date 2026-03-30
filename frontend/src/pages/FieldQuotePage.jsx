import React, { useRef, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from 'react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import SignaturePad from 'signature_pad';
import { ArrowLeft, Plus, Trash2, Download } from 'lucide-react';
import { casesAPI, financeAPI } from '../utils/api';
import { formatMoney, formatDate } from '../utils/helpers';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';

const TAX_RATE = 5;

export default function FieldQuotePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedCaseId = searchParams.get('case_id') || '';
  const { user } = useAuthStore();
  const canvasRef = useRef(null);
  const padRef = useRef(null);
  const [ownerName, setOwnerName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [quoteData, setQuoteData] = useState(null);

  const { register, control, handleSubmit, watch, setValue, formState: { isSubmitting } } = useForm({
    defaultValues: {
      case_id: preselectedCaseId,
      tax_rate: TAX_RATE,
      notes: '',
      items: [{ item_name: '', description: '', quantity: 1, unit: '式', unit_price: 0 }]
    }
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchItems = watch('items');
  const watchTaxRate = parseFloat(watch('tax_rate')) || TAX_RATE;
  const subtotal = watchItems.reduce((s, i) => s + (parseFloat(i.unit_price) || 0) * (parseFloat(i.quantity) || 0), 0);
  const tax = subtotal * (watchTaxRate / 100);
  const total = subtotal + tax;

  // 取得工程師負責的案件
  const { data: myCases } = useQuery('myActiveCases', () =>
    casesAPI.list({ limit: 50 }).then(r => r.data)
  );

  const activeCases = myCases?.cases?.filter(c =>
    ['dispatched','in_progress','signing','pending','accepted'].includes(c.status)
  ) || [];

  // 當案件選單載入完成後，再次確保帶入正確的 case_id
  useEffect(() => {
    if (preselectedCaseId && activeCases.length > 0) {
      const found = activeCases.find(c => c.id === preselectedCaseId);
      if (found) setValue('case_id', preselectedCaseId);
    }
  }, [activeCases.length, preselectedCaseId]);

  useEffect(() => {
    if (canvasRef.current) {
      padRef.current = new SignaturePad(canvasRef.current, {
        backgroundColor: 'rgba(255,255,255,0)',
        penColor: '#0C447C',
      });
      const canvas = canvasRef.current;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d').scale(ratio, ratio);
    }
  }, []);

  const clearSign = () => padRef.current?.clear();

  const onSubmit = async (data) => {
    if (!ownerName.trim()) {
      toast.error('請填寫業主確認人姓名');
      return;
    }
    if (!padRef.current || padRef.current.isEmpty()) {
      toast.error('請業主在報價單上簽名確認');
      return;
    }
    try {
      const signature = padRef.current.toDataURL('image/png');
      const res = await financeAPI.createQuotation({
        ...data,
        case_id: data.case_id || undefined,
      });
      setQuoteData({ ...res.data, ownerName, signature, items: data.items, subtotal, tax, total });
      setSubmitted(true);
      toast.success('現場報價單已建立並儲存');
    } catch {}
  };

  if (submitted && quoteData) {
    return (
      <div className="page-container max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate('/field')} className="btn btn-sm"><ArrowLeft size={13} /> 返回現場作業</button>
          <h1 className="page-title">報價單已完成</h1>
        </div>
        <div className="card card-body space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-primary font-mono">{quoteData.quote_number}</div>
              <div className="font-semibold text-gray-900 mt-0.5">現場報價單</div>
            </div>
            <span className="badge badge-success">已儲存</span>
          </div>

          <div className="bg-gray-50 rounded-xl p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-1.5 text-xs text-gray-500 font-medium">項目</th>
                  <th className="text-right py-1.5 text-xs text-gray-500 font-medium">數量</th>
                  <th className="text-right py-1.5 text-xs text-gray-500 font-medium">單價</th>
                  <th className="text-right py-1.5 text-xs text-gray-500 font-medium">小計</th>
                </tr>
              </thead>
              <tbody>
                {quoteData.items.map((item, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1.5">{item.item_name}</td>
                    <td className="py-1.5 text-right text-gray-500">{item.quantity}{item.unit}</td>
                    <td className="py-1.5 text-right text-gray-500">{formatMoney(item.unit_price)}</td>
                    <td className="py-1.5 text-right">{formatMoney((parseFloat(item.unit_price) || 0) * (parseFloat(item.quantity) || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 space-y-1 text-sm text-right border-t border-gray-200 pt-3">
              <div className="text-gray-500">小計：{formatMoney(quoteData.subtotal)}</div>
              <div className="text-gray-500">稅金（{watchTaxRate}%）：{formatMoney(quoteData.tax)}</div>
              <div className="font-semibold text-primary-dark text-base">合計：{formatMoney(quoteData.total)}</div>
            </div>
          </div>

          <div>
            <div className="text-xs text-gray-500 mb-2">業主確認簽名</div>
            <div className="text-sm font-medium text-gray-700 mb-2">確認人：{quoteData.ownerName}</div>
            <div className="border border-gray-200 rounded-lg p-2 bg-white">
              <img src={quoteData.signature} alt="業主簽名" className="max-h-20 mx-auto block" style={{ mixBlendMode: 'multiply' }} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <a
              href={financeAPI.quotationPdf(quoteData.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary flex-1 justify-center gap-1.5"
            >
              <Download size={14} /> 下載 PDF 報價單
            </a>
            <button className="btn flex-1 justify-center" onClick={() => navigate('/field')}>
              返回現場作業
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/field')} className="btn btn-sm"><ArrowLeft size={13} /> 返回</button>
        <h1 className="page-title">現場報價單</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* 基本資訊 */}
        <div className="card card-body space-y-4">
          <h3 className="font-medium text-sm text-gray-700 border-b border-gray-100 pb-2">報價基本資訊</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="form-label">
                關聯案件
                {preselectedCaseId && <span className="ml-2 text-xs text-success font-normal">✓ 已自動帶入</span>}
              </label>
              <select {...register('case_id')} className="form-select">
                <option value="">不關聯案件</option>
                {activeCases.map(c => (
                  <option key={c.id} value={c.id}>{c.case_number} - {c.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">報價有效期限</label>
              <input {...register('valid_until')} type="date" className="form-control"
                defaultValue={new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)} />
            </div>
            <div>
              <label className="form-label">稅率 (%)</label>
              <input {...register('tax_rate')} type="number" className="form-control" defaultValue={5} />
            </div>
          </div>
        </div>

        {/* 報價項目 */}
        <div className="card card-body space-y-3">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <h3 className="font-medium text-sm text-gray-700">報價項目</h3>
            <button type="button" className="btn btn-sm gap-1"
              onClick={() => append({ item_name: '', description: '', quantity: 1, unit: '式', unit_price: 0 })}>
              <Plus size={12} /> 新增項目
            </button>
          </div>

          <div className="space-y-2">
            {fields.map((field, i) => (
              <div key={field.id} className="grid gap-2 p-3 bg-gray-50 rounded-lg" style={{ gridTemplateColumns: '1fr 80px 60px 100px 100px 32px' }}>
                <div>
                  <label className="form-label">項目名稱</label>
                  <input {...register(`items.${i}.item_name`)} className="form-control text-sm py-1.5" placeholder="施工項目" />
                </div>
                <div>
                  <label className="form-label">數量</label>
                  <input {...register(`items.${i}.quantity`)} type="number" step="0.01" className="form-control text-sm py-1.5" />
                </div>
                <div>
                  <label className="form-label">單位</label>
                  <input {...register(`items.${i}.unit`)} className="form-control text-sm py-1.5" placeholder="式" />
                </div>
                <div>
                  <label className="form-label">單價</label>
                  <input {...register(`items.${i}.unit_price`)} type="number" step="1" className="form-control text-sm py-1.5" />
                </div>
                <div>
                  <label className="form-label">小計</label>
                  <div className="text-sm font-medium text-gray-700 py-2">
                    {formatMoney((parseFloat(watchItems[i]?.unit_price) || 0) * (parseFloat(watchItems[i]?.quantity) || 0))}
                  </div>
                </div>
                <div className="flex items-end pb-1.5">
                  <button type="button" onClick={() => remove(i)} className="text-gray-300 hover:text-danger p-1 rounded">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* 合計 */}
          <div className="flex justify-end border-t border-gray-100 pt-3">
            <div className="w-52 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">小計</span><span>{formatMoney(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">稅金 ({watchTaxRate}%)</span><span>{formatMoney(tax)}</span></div>
              <div className="flex justify-between font-semibold text-primary-dark border-t border-gray-100 pt-1.5">
                <span>報價合計</span><span className="text-base">{formatMoney(total)}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="form-label">備注</label>
            <textarea {...register('notes')} className="form-textarea" rows={2} placeholder="付款條件、施工說明等備注..." />
          </div>
        </div>

        {/* 業主確認簽名 */}
        <div className="card card-body space-y-4">
          <h3 className="font-medium text-sm text-gray-700 border-b border-gray-100 pb-2">業主報價確認</h3>

          <div>
            <label className="form-label">業主確認人姓名 * <span className="text-gray-400 font-normal">（請業主填寫）</span></label>
            <input
              className="form-control"
              value={ownerName}
              onChange={e => setOwnerName(e.target.value)}
              placeholder="請填寫業主或授權代理人姓名"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="form-label mb-0">業主確認簽名 * <span className="text-gray-400 font-normal">（請業主簽名確認報價）</span></label>
              <button type="button" className="btn btn-sm text-xs" onClick={clearSign}>清除重簽</button>
            </div>
            <div className="border-2 border-dashed border-primary rounded-xl overflow-hidden bg-blue-50">
              <canvas
                ref={canvasRef}
                style={{ width: '100%', height: '130px', touchAction: 'none', cursor: 'crosshair', display: 'block' }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">請業主使用滑鼠或手指在上方區域簽名確認報價</p>
          </div>
        </div>

        <div className="flex gap-3">
          <button type="button" className="btn flex-1 justify-center" onClick={() => navigate('/field')}>取消</button>
          <button type="submit" disabled={isSubmitting} className="btn btn-primary flex-1 justify-center">
            {isSubmitting ? '建立中...' : '確認建立報價單'}
          </button>
        </div>
      </form>
    </div>
  );
}
