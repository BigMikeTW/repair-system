import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { Plus, Trash2, FileText, Download, Send } from 'lucide-react';
import { financeAPI, casesAPI } from '../utils/api';
import { formatDate, formatMoney, INV_STATUS_LABELS, INV_STATUS_BADGES, CASE_TYPES } from '../utils/helpers';
import toast from 'react-hot-toast';

const TAX_RATE = 5;

function QuotationForm({ onClose, onSuccess }) {
  const { register, control, handleSubmit, watch, formState: { isSubmitting } } = useForm({
    defaultValues: { tax_rate: TAX_RATE, items: [{ item_name: '', description: '', quantity: 1, unit: '', unit_price: 0 }] }
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchItems = watch('items');
  const subtotal = watchItems.reduce((s, i) => s + (parseFloat(i.unit_price) || 0) * (parseFloat(i.quantity) || 0), 0);
  const tax = subtotal * (TAX_RATE / 100);

  const { data: completedCases } = useQuery('completedCasesForQuote', () =>
    casesAPI.list({ status: 'completed', limit: 100 }).then(r => r.data)
  );

  const onSubmit = async (data) => {
    try {
      await financeAPI.createQuotation(data);
      toast.success('報價單已建立');
      onSuccess();
    } catch {}
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">建立報價單</h2>
          <button className="btn btn-sm" onClick={onClose}>關閉</button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="form-label">關聯案件</label>
              <select {...register('case_id')} className="form-select">
                <option value="">選擇案件（選填）</option>
                {completedCases?.cases?.map(c => (
                  <option key={c.id} value={c.id}>{c.case_number} - {c.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">報價有效期限</label>
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
              <button type="button" className="btn btn-sm" onClick={() => append({ item_name: '', description: '', quantity: 1, unit: '', unit_price: 0 })}>
                <Plus size={12} /> 新增項目
              </button>
            </div>
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <table className="table-base">
                <thead><tr><th>項目名稱</th><th>說明</th><th>數量</th><th>單位</th><th>單價</th><th>小計</th><th></th></tr></thead>
                <tbody>
                  {fields.map((field, i) => (
                    <tr key={field.id}>
                      <td><input {...register(`items.${i}.item_name`)} className="form-control text-xs py-1" placeholder="項目名稱" /></td>
                      <td><input {...register(`items.${i}.description`)} className="form-control text-xs py-1" placeholder="說明" /></td>
                      <td><input {...register(`items.${i}.quantity`)} type="number" step="0.01" className="form-control text-xs py-1 w-16" /></td>
                      <td><input {...register(`items.${i}.unit`)} className="form-control text-xs py-1 w-14" placeholder="式/個" /></td>
                      <td><input {...register(`items.${i}.unit_price`)} type="number" step="0.01" className="form-control text-xs py-1 w-24" /></td>
                      <td className="text-xs font-medium text-right">{formatMoney((parseFloat(watchItems[i]?.unit_price) || 0) * (parseFloat(watchItems[i]?.quantity) || 0))}</td>
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
              <div className="flex justify-between"><span className="text-gray-500">稅金 ({TAX_RATE}%)</span><span>{formatMoney(tax)}</span></div>
              <div className="flex justify-between font-semibold text-primary-dark border-t border-gray-100 pt-1"><span>合計</span><span>{formatMoney(subtotal + tax)}</span></div>
            </div>
          </div>

          <div>
            <label className="form-label">備注</label>
            <textarea {...register('notes')} className="form-textarea" rows={2} placeholder="報價備注..." />
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" className="btn" onClick={onClose}>取消</button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary">{isSubmitting ? '建立中...' : '建立報價單'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InvoiceForm({ onClose, onSuccess }) {
  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm({ defaultValues: { tax_rate: TAX_RATE } });
  const amount = parseFloat(watch('amount')) || 0;
  const taxRate = parseFloat(watch('tax_rate')) || TAX_RATE;

  const { data: completedCases } = useQuery('completedCasesForInv', () =>
    casesAPI.list({ status: 'completed', limit: 100 }).then(r => r.data)
  );
  const { data: quotations } = useQuery('quotationsForInv', () =>
    financeAPI.getQuotations({ status: 'approved' }).then(r => r.data)
  );

  const onSubmit = async (data) => {
    try {
      data.tax_amount = (amount * taxRate / 100).toFixed(2);
      await financeAPI.createInvoice(data);
      toast.success('請款單已建立');
      onSuccess();
    } catch {}
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">建立請款單</h2>
          <button className="btn btn-sm" onClick={onClose}>關閉</button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div>
            <label className="form-label">關聯案件 *</label>
            <select {...register('case_id', { required: true })} className="form-select">
              <option value="">選擇案件</option>
              {completedCases?.cases?.map(c => (
                <option key={c.id} value={c.id}>{c.case_number} - {c.owner_company || c.owner_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">關聯報價單（選填）</label>
            <select {...register('quotation_id')} className="form-select">
              <option value="">不關聯</option>
              {quotations?.map(q => (
                <option key={q.id} value={q.id}>{q.quote_number} - {formatMoney(q.total)}</option>
              ))}
            </select>
          </div>
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
            <div className="flex justify-between"><span className="text-gray-500">稅金</span><span>{formatMoney(amount * taxRate / 100)}</span></div>
            <div className="flex justify-between font-semibold text-primary-dark mt-1"><span>請款總計</span><span>{formatMoney(amount + amount * taxRate / 100)}</span></div>
          </div>
          <div>
            <label className="form-label">付款期限</label>
            <input {...register('due_date')} type="date" className="form-control" />
          </div>
          <div>
            <label className="form-label">備注</label>
            <textarea {...register('notes')} className="form-textarea" rows={2} />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" className="btn" onClick={onClose}>取消</button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary">{isSubmitting ? '建立中...' : '建立請款單'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function FinancePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('quotations');
  const [showQForm, setShowQForm] = useState(false);
  const [showIForm, setShowIForm] = useState(false);

  const { data: quotations } = useQuery('quotations', () => financeAPI.getQuotations().then(r => r.data));
  const { data: invoices } = useQuery('invoices', () => financeAPI.getInvoices().then(r => r.data));

  const updateQStatus = useMutation(
    ({ id, status }) => financeAPI.updateQuotationStatus(id, { status }),
    { onSuccess: () => { toast.success('狀態已更新'); qc.invalidateQueries('quotations'); } }
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">報價 / 結案單管理</h1>
        <div className="flex gap-2">
          <button className="btn btn-sm" onClick={() => setShowQForm(true)}>+ 新增報價單</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowIForm(true)}>+ 新增請款單</button>
        </div>
      </div>

      <div className="flex gap-0 mb-4 border-b border-gray-100">
        {[['quotations','報價單'], ['invoices','請款單']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm border-b-2 transition-colors ${tab === key ? 'border-primary text-primary font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'quotations' && (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr><th>報價單號</th><th>案件</th><th>業主</th><th>金額</th><th>有效期限</th><th>狀態</th><th>操作</th></tr>
            </thead>
            <tbody>
              {quotations?.map(q => (
                <tr key={q.id}>
                  <td className="text-xs font-mono text-primary font-medium">{q.quote_number}</td>
                  <td className="text-xs">{q.case_number || '--'}</td>
                  <td className="text-sm">{q.owner_company || '--'}</td>
                  <td className="text-sm font-medium">{formatMoney(q.total)}</td>
                  <td className="text-xs text-gray-400">{formatDate(q.valid_until)}</td>
                  <td>
                    <select className="text-xs border border-gray-200 rounded px-1.5 py-0.5"
                      value={q.status}
                      onChange={e => updateQStatus.mutate({ id: q.id, status: e.target.value })}>
                      <option value="draft">草稿</option>
                      <option value="sent">已發送</option>
                      <option value="approved">已核准</option>
                      <option value="rejected">已拒絕</option>
                    </select>
                  </td>
                  <td>
                    <a href={financeAPI.quotationPdf(q.id)} target="_blank" rel="noopener noreferrer"
                      className="btn btn-sm gap-1"><Download size={12} /> PDF</a>
                  </td>
                </tr>
              ))}
              {!quotations?.length && <tr><td colSpan="7" className="py-12 text-center text-sm text-gray-400">尚無報價單</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'invoices' && (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead>
              <tr><th>請款單號</th><th>案件</th><th>業主</th><th>請款金額</th><th>付款期限</th><th>狀態</th><th>操作</th></tr>
            </thead>
            <tbody>
              {invoices?.map(inv => (
                <tr key={inv.id}>
                  <td className="text-xs font-mono text-primary font-medium">{inv.invoice_number}</td>
                  <td className="text-xs">{inv.case_number || '--'}</td>
                  <td className="text-sm">{inv.owner_company || inv.owner_name || '--'}</td>
                  <td className="text-sm font-medium">{formatMoney(inv.total_amount)}</td>
                  <td className="text-xs text-gray-400">{formatDate(inv.due_date)}</td>
                  <td><span className={`badge ${INV_STATUS_BADGES[inv.status]}`}>{INV_STATUS_LABELS[inv.status]}</span></td>
                  <td>
                    <a href={financeAPI.invoicePdf(inv.id)} target="_blank" rel="noopener noreferrer"
                      className="btn btn-sm gap-1"><Download size={12} /> PDF</a>
                  </td>
                </tr>
              ))}
              {!invoices?.length && <tr><td colSpan="7" className="py-12 text-center text-sm text-gray-400">尚無請款單</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showQForm && <QuotationForm onClose={() => setShowQForm(false)} onSuccess={() => { setShowQForm(false); qc.invalidateQueries('quotations'); }} />}
      {showIForm && <InvoiceForm onClose={() => setShowIForm(false)} onSuccess={() => { setShowIForm(false); qc.invalidateQueries('invoices'); }} />}
    </div>
  );
}
