import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useForm } from 'react-hook-form';
import { financeAPI, backupAPI } from '../utils/api';
import { formatDate, formatDateTime, formatMoney, INV_STATUS_LABELS, INV_STATUS_BADGES, PAYMENT_METHODS } from '../utils/helpers';
import toast from 'react-hot-toast';

function PaymentModal({ invoice, onClose, onSuccess }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: { amount: invoice.total_amount, payment_date: new Date().toISOString().slice(0, 10), payment_method: '銀行轉帳' }
  });
  const onSubmit = async (data) => {
    try {
      await financeAPI.recordPayment(invoice.id, data);
      toast.success('付款記錄已新增');
      onSuccess();
    } catch {}
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">記錄收款</h2>
          <button className="btn btn-sm" onClick={onClose}>關閉</button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <div className="font-medium">{invoice.invoice_number}</div>
            <div className="text-gray-500 text-xs mt-0.5">{invoice.owner_company || invoice.owner_name} · 應收 {formatMoney(invoice.total_amount)}</div>
          </div>
          <div>
            <label className="form-label">收款金額 *</label>
            <input {...register('amount', { required: true })} type="number" step="0.01" className="form-control" />
          </div>
          <div>
            <label className="form-label">收款日期 *</label>
            <input {...register('payment_date', { required: true })} type="date" className="form-control" />
          </div>
          <div>
            <label className="form-label">付款方式</label>
            <select {...register('payment_method')} className="form-select">
              {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">交易編號（選填）</label>
            <input {...register('reference_number')} className="form-control" placeholder="銀行交易編號" />
          </div>
          <div>
            <label className="form-label">備註</label>
            <textarea {...register('notes')} className="form-textarea" rows={2} />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" className="btn" onClick={onClose}>取消</button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary">{isSubmitting ? '儲存中...' : '確認收款'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PaymentPage() {
  const qc = useQueryClient();
  const [payInvoice, setPayInvoice] = useState(null);
  const [filter, setFilter] = useState('');

  const { data: finStats } = useQuery('finStats', () => financeAPI.getStats().then(r => r.data));
  const { data: invoices } = useQuery('allInvoices', () => financeAPI.getInvoices().then(r => r.data));
  const { data: payments } = useQuery('payments', () => financeAPI.getPayments().then(r => r.data));

  const filtered = invoices?.filter(inv =>
    !filter || inv.status === filter
  ) || [];

  const checkOverdue = useMutation(
    () => financeAPI.checkOverdue ? financeAPI.checkOverdue() : Promise.resolve(),
    { onSuccess: () => { toast.success('逾期狀態已更新'); qc.invalidateQueries('allInvoices'); } }
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">請款記錄</h1>
        <div className="flex gap-2">
          <a href={backupAPI.exportFinance()} className="btn btn-sm" download>匯出 CSV</a>
        </div>
      </div>

      {finStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="stat-card"><div className="stat-label">本月應收</div><div className="stat-value">{formatMoney(finStats.monthly_billed)}</div></div>
          <div className="stat-card"><div className="stat-label">已收款</div><div className="stat-value text-success">{formatMoney(finStats.monthly_collected)}</div></div>
          <div className="stat-card"><div className="stat-label">待收款</div><div className="stat-value text-warning">{formatMoney(finStats.outstanding)}</div></div>
          <div className="stat-card"><div className="stat-label">逾期未收</div><div className="stat-value text-danger">{formatMoney(finStats.overdue)}</div></div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="card-header">
          <span className="card-title">請款單列表</span>
          <div className="flex gap-2">
            <select className="form-select w-auto text-xs py-1" value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="">全部</option>
              <option value="pending">待請款</option>
              <option value="sent">已發出</option>
              <option value="paid">已收款</option>
              <option value="overdue">逾期</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr><th>請款單號</th><th>案件</th><th>業主</th><th>請款金額</th><th>建立日期</th><th>付款期限</th><th>狀態</th><th>操作</th></tr>
            </thead>
            <tbody>
              {filtered.map(inv => (
                <tr key={inv.id}>
                  <td className="text-xs font-mono text-primary font-medium">{inv.invoice_number}</td>
                  <td className="text-xs">{inv.case_number || '--'}</td>
                  <td className="text-sm">{inv.owner_company || inv.owner_name || '--'}</td>
                  <td className="text-sm font-medium">{formatMoney(inv.total_amount)}</td>
                  <td className="text-xs text-gray-400">{formatDate(inv.created_at)}</td>
                  <td className={`text-xs ${inv.status === 'overdue' ? 'text-danger font-medium' : 'text-gray-400'}`}>{formatDate(inv.due_date)}</td>
                  <td><span className={`badge ${INV_STATUS_BADGES[inv.status]}`}>{INV_STATUS_LABELS[inv.status]}</span></td>
                  <td>
                    <div className="flex gap-1">
                      {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                        <button className="btn btn-primary btn-sm" onClick={() => setPayInvoice(inv)}>收款</button>
                      )}
                      {inv.status === 'paid' && (
                        <span className="text-xs text-success">✓ {formatDate(inv.paid_at)}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan="8" className="py-12 text-center text-sm text-gray-400">尚無請款記錄</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment history */}
      <div className="card overflow-hidden">
        <div className="card-header"><span className="card-title">收款記錄</span></div>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr><th>請款單號</th><th>案件</th><th>業主</th><th>收款金額</th><th>收款日期</th><th>付款方式</th><th>交易編號</th></tr>
            </thead>
            <tbody>
              {payments?.map(p => (
                <tr key={p.id}>
                  <td className="text-xs font-mono text-primary">{p.invoice_number}</td>
                  <td className="text-xs">{p.case_number || '--'}</td>
                  <td className="text-sm">{p.owner_company || '--'}</td>
                  <td className="text-sm font-medium text-success">{formatMoney(p.amount)}</td>
                  <td className="text-xs text-gray-400">{formatDate(p.payment_date)}</td>
                  <td className="text-xs text-gray-500">{p.payment_method || '--'}</td>
                  <td className="text-xs text-gray-400">{p.reference_number || '--'}</td>
                </tr>
              ))}
              {!payments?.length && <tr><td colSpan="7" className="py-10 text-center text-sm text-gray-400">尚無收款記錄</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {payInvoice && (
        <PaymentModal
          invoice={payInvoice}
          onClose={() => setPayInvoice(null)}
          onSuccess={() => {
            setPayInvoice(null);
            qc.invalidateQueries('allInvoices');
            qc.invalidateQueries('payments');
            qc.invalidateQueries('finStats');
          }}
        />
      )}
    </div>
  );
}
