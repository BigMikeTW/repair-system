import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import {
  Plus, Trash2, Download, FileText, Receipt, CheckSquare, CreditCard,
  Edit2, X, AlertTriangle, Lock, Info, ExternalLink, Printer
} from 'lucide-react';
import { financeAPI, casesAPI } from '../utils/api';
import { formatDate, formatMoney, INV_STATUS_LABELS, INV_STATUS_BADGES, PAYMENT_METHODS } from '../utils/helpers';
import toast from 'react-hot-toast';

const TAX_RATE = 5;

const getDefaultBankAccounts = () => {
  try { return JSON.parse(localStorage.getItem('default_bank_accounts') || '[]'); }
  catch { return []; }
};

const getCompanyHeaders = () => {
  try { return JSON.parse(localStorage.getItem('company_headers') || '[]'); }
  catch { return []; }
};

const getCustomRemarks = (module) => {
  try {
    const all = JSON.parse(localStorage.getItem('custom_remarks') || '[]');
    return all.filter(r => r.modules?.includes(module));
  } catch { return []; }
};

// ── PDF 下載視窗 ──────────────────────────────────────────────
function PdfDownloadModal({ title, pdfUrl, module, onClose }) {
  const headers = getCompanyHeaders();
  const remarks = getCustomRemarks(module);
  const defaultHeader = headers.find(h => h.isDefault);
  const [selectedCompany, setSelectedCompany] = useState(
    defaultHeader?.name_zh || 'Pro080'
  );
  const [selectedRemarks, setSelectedRemarks] = useState([]);

  const buildUrl = () => {
    const params = new URLSearchParams();
    params.set('company', selectedCompany);
    if (selectedRemarks.length > 0) params.set('remarks', selectedRemarks.join(','));
    return `${pdfUrl}&${params.toString()}`;
  };

  const handleDownload = () => {
    // 直接下載
    const a = document.createElement('a');
    a.href = buildUrl();
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    onClose();
  };

  const handlePreview = () => {
    // 在新分頁開啟，使用者可於瀏覽器內下載
    window.open(buildUrl(), '_blank');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">下載 {title}</h3>
          <button className="btn btn-sm" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="form-label">公司名稱（左上角）</label>
            <select className="form-select" value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)}>
              <option value="" disabled>請選擇公司</option>
              {!headers?.length && <option value="Pro080">Pro080</option>}
              {headers.map((h, i) => (
                <option key={i} value={h.name_zh}>
                  {h.name_zh}{h.isDefault ? '（預設）' : ''}
                </option>
              ))}
            </select>
          </div>
          {remarks.length > 0 && (
            <div>
              <label className="form-label">顯示備註</label>
              <div className="space-y-2">
                {remarks.map((r, i) => (
                  <label key={i} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedRemarks.includes(r.id || i)}
                      onChange={() => setSelectedRemarks(prev =>
                        prev.includes(r.id || i)
                          ? prev.filter(x => x !== (r.id || i))
                          : [...prev, r.id || i]
                      )}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm">{r.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn gap-2" onClick={handlePreview}>
            <ExternalLink size={14} /> 瀏覽器開啟
          </button>
          <button className="btn btn-primary gap-2" onClick={handleDownload}>
            <Download size={14} /> 下載 PDF
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 報價單表單 ────────────────────────────────────────────────
function QuotationForm({ onClose, onSuccess, editData }) {
  const [loadedItems, setLoadedItems] = React.useState(null);
  const [loading, setLoading] = React.useState(!!editData);

  React.useEffect(() => {
    if (editData?.id) {
      setLoading(true);
      financeAPI.getQuotation(editData.id).then(r => {
        setLoadedItems(r.data?.items || []);
        setLoading(false);
      }).catch(() => {
        setLoadedItems([]);
        setLoading(false);
      });
    }
  }, [editData?.id]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
        <div className="bg-white rounded-xl p-8 text-center">
          <div className="text-gray-500">載入中...</div>
        </div>
      </div>
    );
  }

  return <QuotationFormInner onClose={onClose} onSuccess={onSuccess} editData={editData} loadedItems={loadedItems} />;
}

function QuotationFormInner({ onClose, onSuccess, editData, loadedItems }) {
  const defaultItems = loadedItems || (editData?.items) || [{ item_name: '', description: '', quantity: 1, unit: '', unit_price: 0 }];

  const { register, control, handleSubmit, watch, formState: { isSubmitting } } = useForm({
    defaultValues: editData
      ? { ...editData, items: defaultItems }
      : { tax_rate: TAX_RATE, items: [{ item_name: '', description: '', quantity: 1, unit: '', unit_price: 0 }] }
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchItems = watch('items');
  const subtotal = watchItems.reduce((s, i) => s + (parseFloat(i.unit_price)||0)*(parseFloat(i.quantity)||0), 0);
  const taxRate = parseFloat(watch('tax_rate')) || TAX_RATE;
  const tax = subtotal * (taxRate / 100);

  const { data: cases } = useQuery('allCasesForQuote', () => casesAPI.list({ limit: 200 }).then(r => r.data));

  const onSubmit = async (data) => {
    try {
      if (editData) {
        await financeAPI.updateQuotation(editData.id, data);
        toast.success('報價單已更新');
      } else {
        await financeAPI.createQuotation(data);
        toast.success('報價單已建立');
      }
      onSuccess();
    } catch (e) { toast.error(e.response?.data?.error || '操作失敗'); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">{editData ? '修改報價單' : '建立報價單'}</h2>
          <button className="btn btn-sm" onClick={onClose}>關閉</button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="form-label">關聯案件</label>
              <select {...register('case_id')} className="form-select">
                <option value="">選擇案件（選填）</option>
                {cases?.cases?.map(c => (
                  <option key={c.id} value={c.id}>{c.case_number} - {c.title} ({c.owner_company || c.owner_name})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">有效期限</label>
              <input {...register('valid_until')} type="date" className="form-control" />
            </div>
            <div>
              <label className="form-label">稅率 (%)</label>
              <input {...register('tax_rate')} type="number" className="form-control" defaultValue={5} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="form-label mb-0">報價項目</label>
              <button type="button" className="btn btn-sm" onClick={() => append({ item_name:'', description:'', quantity:1, unit:'', unit_price:0 })}>
                <Plus size={12} /> 新增項目
              </button>
            </div>
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <table className="table-base">
                <thead><tr><th>項目名稱</th><th>說明</th><th>數量</th><th>單位</th><th>單價</th><th>小計</th><th></th></tr></thead>
                <tbody>
                  {fields.map((field, i) => (
                    <tr key={field.id}>
                      <td><input {...register(`items.${i}.item_name`)} className="form-control py-1" placeholder="項目名稱" /></td>
                      <td><input {...register(`items.${i}.description`)} className="form-control py-1" placeholder="說明" /></td>
                      <td><input {...register(`items.${i}.quantity`)} type="number" step="0.01" className="form-control py-1 w-16" /></td>
                      <td><input {...register(`items.${i}.unit`)} className="form-control py-1 w-14" placeholder="式/個" /></td>
                      <td><input {...register(`items.${i}.unit_price`)} type="number" step="0.01" className="form-control py-1 w-24" /></td>
                      <td className="text-sm font-medium text-right">{formatMoney((parseFloat(watchItems[i]?.unit_price)||0)*(parseFloat(watchItems[i]?.quantity)||0))}</td>
                      <td><button type="button" onClick={() => remove(i)} className="text-gray-300 hover:text-danger"><Trash2 size={13} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end">
            <div className="text-sm space-y-1 w-48">
              <div className="flex justify-between"><span className="text-gray-500">小計</span><span>{formatMoney(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">稅金 ({taxRate}%)</span><span>{formatMoney(tax)}</span></div>
              <div className="flex justify-between font-semibold text-primary-dark border-t pt-1"><span>合計</span><span>{formatMoney(subtotal+tax)}</span></div>
            </div>
          </div>
          <div>
            <label className="form-label">備註</label>
            <textarea {...register('notes')} className="form-textarea" rows={2} />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" className="btn" onClick={onClose}>取消</button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary">{isSubmitting ? '處理中...' : (editData ? '儲存修改' : '建立報價單')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── 結案單表單 ────────────────────────────────────────────────
function ClosureForm({ onClose, onSuccess, editData }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({ defaultValues: editData });
  const { data: eligibleCases } = useQuery('casesForClosure', async () => {
    const r = await casesAPI.list({ status: 'completed', limit: 100 });
    return r.data;
  });

  const onSubmit = async (data) => {
    try {
      if (editData) {
        await financeAPI.updateClosure(editData.id, data);
        toast.success('結案單已更新');
      } else {
        await financeAPI.createClosure(data);
        toast.success('結案單已建立，案件狀態更新為已結案');
      }
      onSuccess();
    } catch (e) { toast.error(e.response?.data?.error || '操作失敗'); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold">{editData ? '修改結案單' : '建立結案單'}</h2>
          <button className="btn btn-sm" onClick={onClose}>關閉</button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          {!editData && (
            <div>
              <label className="form-label">關聯案件 *</label>
              <select {...register('case_id', { required: true })} className="form-select">
                <option value="">選擇已完成案件</option>
                {eligibleCases?.cases?.map(c => (
                  <option key={c.id} value={c.id}>{c.case_number} - {c.title}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="form-label">結案摘要</label>
            <input {...register('summary')} className="form-control" placeholder="本次工程完成事項..." />
          </div>
          <div>
            <label className="form-label">備註</label>
            <textarea {...register('notes')} className="form-textarea" rows={3} />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" className="btn" onClick={onClose}>取消</button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary">
              {isSubmitting ? '處理中...' : (editData ? '儲存修改' : '建立結案單')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── 取消結案 Modal ────────────────────────────────────────────
function CancelClosureModal({ closure, onClose, onSuccess }) {
  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm();

  const onSubmit = async (data) => {
    try {
      await financeAPI.cancelClosure(closure.id, data);
      toast.success('已取消結案，資料已鎖定');
      onSuccess();
    } catch (e) { toast.error(e.response?.data?.error || '操作失敗'); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <AlertTriangle size={18} className="text-danger" />
          <h3 className="font-semibold text-danger">取消結案</h3>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div className="bg-danger-light rounded-xl p-3 text-sm text-danger">
            取消結案後，此結案單將被鎖定，無法修改、刪除或下載 PDF。此操作將記錄執行時間與人員。
          </div>
          <div>
            <label className="form-label">取消原因 *</label>
            <textarea
              {...register('cancel_reason', { required: '取消原因為必填' })}
              className="form-textarea"
              rows={4}
              placeholder="請詳細說明取消結案的原因..."
            />
            {errors.cancel_reason && <p className="text-sm text-danger mt-1">{errors.cancel_reason.message}</p>}
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" className="btn" onClick={onClose}>取消操作</button>
            <button type="submit" disabled={isSubmitting} className="btn btn-danger gap-2">
              <AlertTriangle size={14} />
              {isSubmitting ? '處理中...' : '確認取消結案'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── 請款單表單 ────────────────────────────────────────────────
function InvoiceForm({ onClose, onSuccess, editData }) {
  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm({
    defaultValues: editData || { tax_rate: TAX_RATE }
  });
  const amount = parseFloat(watch('amount')) || 0;
  const taxRate = parseFloat(watch('tax_rate')) || TAX_RATE;
  const selectedCaseId = watch('case_id');

  const { data: cases } = useQuery('casesForInv', () => casesAPI.list({ limit: 200 }).then(r => r.data));
  // 只顯示已核准的報價單
  const { data: approvedQuotations } = useQuery(
    ['approvedQuotations', selectedCaseId],
    () => financeAPI.getQuotations({ case_id: selectedCaseId, status: 'approved' }).then(r => r.data),
    { enabled: !!selectedCaseId }
  );

  const onSubmit = async (data) => {
    try {
      data.tax_amount = (amount * taxRate / 100).toFixed(2);
      if (editData) {
        await financeAPI.updateInvoice(editData.id, data);
        toast.success('請款單已更新');
      } else {
        await financeAPI.createInvoice(data);
        toast.success('請款單已建立');
      }
      onSuccess();
    } catch (e) { toast.error(e.response?.data?.error || '操作失敗'); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold">{editData ? '修改請款單' : '建立請款單'}</h2>
          <button className="btn btn-sm" onClick={onClose}>關閉</button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div>
            <label className="form-label">關聯案件 *</label>
            <select {...register('case_id', { required: true })} className="form-select">
              <option value="">選擇案件</option>
              {cases?.cases?.map(c => (
                <option key={c.id} value={c.id}>{c.case_number} - {c.owner_company || c.owner_name}</option>
              ))}
            </select>
          </div>

          {selectedCaseId && (
            <div className="bg-gray-50 rounded-lg p-3">
              <label className="form-label mb-2">關聯報價單（僅顯示已核准）</label>
              {approvedQuotations?.length > 0 ? (
                <select {...register('quotation_id')} className="form-select">
                  <option value="">不關聯報價單</option>
                  {approvedQuotations.map(q => (
                    <option key={q.id} value={q.id}>{q.quote_number} - {formatMoney(q.total)}</option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-amber-600">此案件無已核准的報價單</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">請款金額 *</label>
              <input {...register('amount', { required: true })} type="number" step="0.01" className="form-control" placeholder="0.00" />
            </div>
            <div>
              <label className="form-label">稅率 (%)</label>
              <input {...register('tax_rate')} type="number" className="form-control" defaultValue={5} />
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">稅金</span><span>{formatMoney(amount*taxRate/100)}</span></div>
            <div className="flex justify-between font-semibold text-primary-dark mt-1"><span>請款總計</span><span>{formatMoney(amount+amount*taxRate/100)}</span></div>
          </div>
          <div>
            <label className="form-label">付款期限</label>
            <input {...register('due_date')} type="date" className="form-control" />
          </div>
          <div>
            <label className="form-label">備註</label>
            <textarea {...register('notes')} className="form-textarea" rows={2} />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" className="btn" onClick={onClose}>取消</button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary">
              {isSubmitting ? '處理中...' : (editData ? '儲存修改' : '建立請款單')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── 收款單表單 ────────────────────────────────────────────────
function ReceiptForm({ onClose, onSuccess, editData }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: editData || { payment_method: '銀行轉帳', payment_date: new Date().toISOString().slice(0,10) }
  });
  const defaultAccounts = getDefaultBankAccounts();
  const { data: invoices } = useQuery('pendingInv', () =>
    financeAPI.getInvoices({ status: 'pending' }).then(r => r.data));
  const { data: sentInvoices } = useQuery('sentInv', () =>
    financeAPI.getInvoices({ status: 'sent' }).then(r => r.data));
  const allPending = [...(invoices||[]), ...(sentInvoices||[])];

  const onSubmit = async (data) => {
    try {
      if (editData) {
        await financeAPI.updateReceipt(editData.id, data);
        toast.success('收款單已更新');
      } else {
        await financeAPI.createReceipt(data);
        toast.success('收款單已建立');
      }
      onSuccess();
    } catch (e) { toast.error(e.response?.data?.error || '操作失敗'); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold">{editData ? '修改收款單' : '建立收款單'}</h2>
          <button className="btn btn-sm" onClick={onClose}>關閉</button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          {!editData && (
            <div>
              <label className="form-label">關聯請款單 *</label>
              <select {...register('invoice_id', { required: true })} className="form-select">
                <option value="">選擇待收款請款單</option>
                {allPending.map(inv => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoice_number} - {inv.owner_company||inv.owner_name||'—'} ({formatMoney(inv.total_amount)})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">收款金額 *</label>
              <input {...register('amount', { required: true })} type="number" step="0.01" className="form-control" placeholder="0.00" />
            </div>
            <div>
              <label className="form-label">收款日期</label>
              <input {...register('payment_date')} type="date" className="form-control" />
            </div>
          </div>
          <div>
            <label className="form-label">付款方式</label>
            <select {...register('payment_method')} className="form-select">
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">交易編號</label>
            <input {...register('reference_number')} className="form-control" placeholder="選填" />
          </div>
          <div>
            <label className="form-label">入帳帳號</label>
            {defaultAccounts.length > 0 ? (
              <select {...register('bank_account')} className="form-select">
                <option value="">選擇或自行輸入</option>
                {defaultAccounts.map((acc, i) => (
                  <option key={i} value={`${acc.bank_name} ${acc.account_number}`}>
                    {acc.bank_name} - {acc.account_number}
                  </option>
                ))}
              </select>
            ) : (
              <input {...register('bank_account')} className="form-control" placeholder="選填" />
            )}
          </div>
          <div>
            <label className="form-label">備註</label>
            <textarea {...register('notes')} className="form-textarea" rows={2} />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" className="btn" onClick={onClose}>取消</button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary">
              {isSubmitting ? '處理中...' : (editData ? '儲存修改' : '建立收款單')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── 主頁面 ─────────────────────────────────────────────────────
export default function FinancePage() {
  const qc = useQueryClient();
  const [tab, setTab]           = useState('quotations');
  const [showQForm, setShowQForm]   = useState(false);
  const [showCForm, setShowCForm]   = useState(false);
  const [showIForm, setShowIForm]   = useState(false);
  const [showRForm, setShowRForm]   = useState(false);
  const [editItem, setEditItem]     = useState(null);
  const [pdfModal, setPdfModal]     = useState(null);
  const [cancelClosure, setCancelClosure] = useState(null);
  const [cancelDetail, setCancelDetail]   = useState(null);

  const { data: quotations } = useQuery('quotations', () => financeAPI.getQuotations().then(r => r.data));
  const { data: invoices }   = useQuery('invoices',   () => financeAPI.getInvoices().then(r => r.data));
  const { data: receipts }   = useQuery('receipts',   () => financeAPI.getReceipts().then(r => r.data));
  const { data: closures }   = useQuery('closures',   () => financeAPI.getClosures().then(r => r.data));

  const updateQStatus = useMutation(
    ({ id, status }) => financeAPI.updateQuotationStatus(id, { status }),
    { onSuccess: () => { toast.success('狀態已更新'); qc.invalidateQueries('quotations'); qc.invalidateQueries('invoices'); } }
  );

  const deleteItem = useMutation(
    ({ type, id }) => {
      if (type === 'quotation') return financeAPI.deleteQuotation(id);
      if (type === 'invoice')   return financeAPI.deleteInvoice(id);
      if (type === 'receipt')   return financeAPI.deleteReceipt(id);
    },
    {
      onSuccess: (_, { type }) => {
        toast.success('已刪除');
        qc.invalidateQueries(type === 'quotation' ? 'quotations' : type === 'invoice' ? 'invoices' : 'receipts');
      }
    }
  );

  const handleDelete = (type, id, name) => {
    if (!window.confirm(`確定刪除 ${name}？此操作無法復原。`)) return;
    deleteItem.mutate({ type, id });
  };

  // ── Tab 設定：報價 → 請款 → 收款 → 結案 ─────────────────────
  const TABS = [
    { key: 'quotations', label: '報價單', icon: FileText,    count: quotations?.length },
    { key: 'invoices',   label: '請款單', icon: Receipt,     count: invoices?.length },
    { key: 'receipts',   label: '收款單', icon: CreditCard,  count: receipts?.length },
    { key: 'closures',   label: '結案單', icon: CheckSquare, count: closures?.length },
  ];

  const tabAddBtns = {
    quotations: { label: '+ 新增報價單', action: () => { setEditItem(null); setShowQForm(true); } },
    invoices:   { label: '+ 新增請款單', action: () => { setEditItem(null); setShowIForm(true); } },
    receipts:   { label: '+ 新增收款單', action: () => { setEditItem(null); setShowRForm(true); } },
    closures:   { label: '+ 新增結案單', action: () => { setEditItem(null); setShowCForm(true); } },
  };

  const openPdf = (title, url, module) => setPdfModal({ title, url, module });

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">帳務管理</h1>
        <button className="btn btn-primary btn-sm" onClick={tabAddBtns[tab].action}>
          {tabAddBtns[tab].label}
        </button>
      </div>

      <div className="flex gap-0 mb-4 border-b border-gray-100">
        {TABS.map(({ key, label, icon: Icon, count }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm border-b-2 transition-colors ${tab===key ? 'border-primary text-primary font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <Icon size={15} /> {label}
            {count > 0 && <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab===key?'bg-primary text-white':'bg-gray-100 text-gray-500'}`}>{count}</span>}
          </button>
        ))}
      </div>

      {/* 報價單 */}
      {tab === 'quotations' && (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr><th>報價單號</th><th>案件</th><th>業主</th><th>金額</th><th>有效期限</th><th>狀態</th><th>操作</th></tr>
            </thead>
            <tbody>
              {quotations?.map(q => (
                <tr key={q.id}>
                  <td className="font-mono text-primary font-medium text-sm">{q.quote_number}</td>
                  <td className="text-sm">{q.case_number||'—'}</td>
                  <td className="max-w-[120px]"><div className="truncate text-sm" title={q.owner_company||''}>{q.owner_company||'—'}</div></td>
                  <td className="font-medium">{formatMoney(q.total)}</td>
                  <td className="text-sm text-gray-400">{formatDate(q.valid_until)}</td>
                  <td>
                    <select className="text-sm border border-gray-200 rounded px-2 py-1"
                      value={q.status}
                      onChange={e => updateQStatus.mutate({ id: q.id, status: e.target.value })}>
                      <option value="draft">草稿</option>
                      <option value="sent">已發送</option>
                      <option value="approved">已核准</option>
                      <option value="rejected">已拒絕</option>
                    </select>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button className="btn btn-sm" onClick={() => { setEditItem(q); setShowQForm(true); }}>
                        <Edit2 size={12} />
                      </button>
                      <button className="btn btn-sm gap-1" onClick={() => openPdf('報價單', financeAPI.quotationPdf(q.id), 'quotation')}>
                        <Printer size={12} /> 輸出
                      </button>
                      <button className="btn btn-sm text-danger border-red-200" onClick={() => handleDelete('quotation', q.id, q.quote_number)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!quotations?.length && <tr><td colSpan="7" className="py-12 text-center text-gray-400">尚無報價單</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* 請款單 */}
      {tab === 'invoices' && (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr><th>請款單號</th><th>案件</th><th>業主</th><th>請款金額</th><th>付款期限</th><th>狀態</th><th>操作</th></tr>
            </thead>
            <tbody>
              {invoices?.map(inv => (
                <tr key={inv.id}>
                  <td className="font-mono text-primary font-medium text-sm">{inv.invoice_number}</td>
                  <td className="text-sm">{inv.case_number||'—'}</td>
                  <td className="max-w-[120px]"><div className="truncate text-sm" title={inv.owner_company||inv.owner_name||''}>{inv.owner_company||inv.owner_name||'—'}</div></td>
                  <td className="font-medium">{formatMoney(inv.total_amount)}</td>
                  <td className="text-sm text-gray-400">{formatDate(inv.due_date)}</td>
                  <td>
                    {inv.quotation_id ? (
                      <span className="badge badge-warning">待請款</span>
                    ) : (
                      <span className={`badge ${INV_STATUS_BADGES[inv.status]}`}>{INV_STATUS_LABELS[inv.status]}</span>
                    )}
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button className="btn btn-sm" onClick={() => { setEditItem(inv); setShowIForm(true); }}>
                        <Edit2 size={12} />
                      </button>
                      <button className="btn btn-sm gap-1" onClick={() => openPdf('請款單', financeAPI.invoicePdf(inv.id), 'invoice')}>
                        <Printer size={12} /> 輸出
                      </button>
                      <button className="btn btn-sm text-danger border-red-200" onClick={() => handleDelete('invoice', inv.id, inv.invoice_number)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!invoices?.length && <tr><td colSpan="7" className="py-12 text-center text-gray-400">尚無請款單</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* 收款單 */}
      {tab === 'receipts' && (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr><th>收款單號</th><th>請款單</th><th>業主</th><th>收款金額</th><th>付款方式</th><th>入帳帳號</th><th>備註</th><th>日期</th><th>操作</th></tr>
            </thead>
            <tbody>
              {receipts?.map(rec => (
                <tr key={rec.id}>
                  <td className="font-mono text-primary font-medium text-sm">{rec.receipt_number}</td>
                  <td className="text-sm">{rec.invoice_number||'—'}</td>
                  <td className="max-w-[120px]"><div className="truncate text-sm" title={rec.owner_company||''}>{rec.owner_company||'—'}</div></td>
                  <td className="font-medium text-green-600">{formatMoney(rec.amount)}</td>
                  <td className="text-sm">{rec.payment_method}</td>
                  <td className="text-sm text-gray-500 max-w-[100px]"><div className="truncate">{rec.bank_account||'—'}</div></td>
                  <td className="text-sm text-gray-400 max-w-[80px]"><div className="truncate">{rec.notes||'—'}</div></td>
                  <td className="text-sm text-gray-400">{formatDate(rec.payment_date)}</td>
                  <td>
                    <div className="flex gap-1">
                      <button className="btn btn-sm" onClick={() => { setEditItem(rec); setShowRForm(true); }}>
                        <Edit2 size={12} />
                      </button>
                      <button className="btn btn-sm gap-1" onClick={() => openPdf('收款單', financeAPI.receiptPdf(rec.id), 'receipt')}>
                        <Printer size={12} /> 輸出
                      </button>
                      <button className="btn btn-sm text-danger border-red-200" onClick={() => handleDelete('receipt', rec.id, rec.receipt_number)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!receipts?.length && <tr><td colSpan="9" className="py-12 text-center text-gray-400">尚無收款記錄</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* 結案單 */}
      {tab === 'closures' && (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr><th>結案單號</th><th>案件</th><th>業主</th><th>結案摘要</th><th>建立時間</th><th>操作</th><th>特殊註記</th></tr>
            </thead>
            <tbody>
              {closures?.map(cr => (
                <tr key={cr.id} className={cr.is_cancelled ? 'bg-red-50/50' : ''}>
                  <td className="font-mono text-primary font-medium text-sm">{cr.closure_number}</td>
                  <td className="text-sm">{cr.case_number||'—'}</td>
                  <td className="max-w-[120px]"><div className="truncate text-sm" title={cr.owner_company||cr.owner_name||''}>{cr.owner_company||cr.owner_name||'—'}</div></td>
                  <td className="text-sm text-gray-500 max-w-[160px]"><div className="truncate">{cr.summary||'—'}</div></td>
                  <td className="text-sm text-gray-400">{formatDate(cr.created_at)}</td>
                  <td>
                    {cr.is_cancelled ? (
                      <div className="flex items-center gap-1 text-sm text-danger">
                        <Lock size={13} /> 已鎖定
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <button className="btn btn-sm" onClick={() => { setEditItem(cr); setShowCForm(true); }}>
                          <Edit2 size={12} />
                        </button>
                        <button className="btn btn-sm gap-1"
                          onClick={() => openPdf('結案報告', financeAPI.closurePdf(cr.id), 'closure')}>
                          <Printer size={12} /> 輸出
                        </button>
                        <button className="btn btn-sm text-danger border-red-200"
                          onClick={() => setCancelClosure(cr)}>
                          取消結案
                        </button>
                      </div>
                    )}
                  </td>
                  <td>
                    {cr.is_cancelled && cr.cancel_reason && (
                      <div className="relative group">
                        <button
                          className="text-sm text-danger underline hover:no-underline"
                          onClick={() => setCancelDetail(cr)}
                        >
                          詳情
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!closures?.length && <tr><td colSpan="7" className="py-12 text-center text-gray-400">尚無結案單</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* 取消結案詳情 Modal */}
      {cancelDetail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-danger flex items-center gap-2">
                <AlertTriangle size={16} /> 取消結案記錄
              </h3>
              <button className="btn btn-sm" onClick={() => setCancelDetail(null)}><X size={14} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-red-50 rounded-xl p-4 space-y-2">
                <div className="text-sm"><span className="text-gray-500">結案單號：</span><span className="font-mono font-medium">{cancelDetail.closure_number}</span></div>
                <div className="text-sm"><span className="text-gray-500">執行人員：</span><span>{cancelDetail.cancelled_by_name||'—'}</span></div>
                <div className="text-sm"><span className="text-gray-500">執行時間：</span><span>{cancelDetail.cancelled_at ? new Date(cancelDetail.cancelled_at).toLocaleString('zh-TW') : '—'}</span></div>
                <div className="text-sm"><span className="text-gray-500">取消原因：</span></div>
                <div className="bg-white rounded-lg p-3 text-sm text-gray-700 border border-red-200">{cancelDetail.cancel_reason}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showQForm && <QuotationForm editData={editItem} onClose={() => { setShowQForm(false); setEditItem(null); }} onSuccess={() => { setShowQForm(false); setEditItem(null); qc.invalidateQueries('quotations'); }} />}
      {showIForm && <InvoiceForm   editData={editItem} onClose={() => { setShowIForm(false); setEditItem(null); }} onSuccess={() => { setShowIForm(false); setEditItem(null); qc.invalidateQueries('invoices'); }} />}
      {showRForm && <ReceiptForm   editData={editItem} onClose={() => { setShowRForm(false); setEditItem(null); }} onSuccess={() => { setShowRForm(false); setEditItem(null); qc.invalidateQueries('receipts'); qc.invalidateQueries('invoices'); }} />}
      {showCForm && <ClosureForm   editData={editItem} onClose={() => { setShowCForm(false); setEditItem(null); }} onSuccess={() => { setShowCForm(false); setEditItem(null); qc.invalidateQueries('closures'); }} />}
      {cancelClosure && <CancelClosureModal closure={cancelClosure} onClose={() => setCancelClosure(null)} onSuccess={() => { setCancelClosure(null); qc.invalidateQueries('closures'); }} />}
      {pdfModal && <PdfDownloadModal title={pdfModal.title} pdfUrl={pdfModal.url} module={pdfModal.module} onClose={() => setPdfModal(null)} />}
    </div>
  );
}
