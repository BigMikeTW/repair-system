import React from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Database, Download, RefreshCw, FileSpreadsheet } from 'lucide-react';
import { backupAPI } from '../utils/api';
import { formatDateTime } from '../utils/helpers';
import toast from 'react-hot-toast';

export default function BackupPage() {
  const qc = useQueryClient();

  const { data: logs } = useQuery('backupLogs', () => backupAPI.list().then(r => r.data));

  const createBackup = useMutation(
    () => backupAPI.create(),
    {
      onSuccess: () => { toast.success('備份成功！'); qc.invalidateQueries('backupLogs'); },
      onError: () => toast.error('備份失敗，請確認資料庫連線')
    }
  );

  const exports = [
    { label: '案件完整記錄', desc: '全部案件資料、狀態、派工記錄', href: backupAPI.exportCases({}), icon: FileSpreadsheet },
    { label: '本月案件記錄', desc: '本月案件篩選', href: backupAPI.exportCases({ date_from: new Date().toISOString().slice(0,7) + '-01' }), icon: FileSpreadsheet },
    { label: '財務/請款報表', desc: '全部請款單及收款記錄', href: backupAPI.exportFinance(), icon: FileSpreadsheet },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">備份記錄</h1>
        <button className="btn btn-primary" disabled={createBackup.isLoading} onClick={() => createBackup.mutate()}>
          <Database size={14} /> {createBackup.isLoading ? '備份中...' : '立即備份'}
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Backup settings */}
        <div className="card card-body">
          <h3 className="font-medium text-sm mb-4">備份設定</h3>
          <div className="space-y-3 text-sm">
            {[
              { label: '自動備份', value: '已啟用', color: 'text-success' },
              { label: '備份頻率', value: '每日 02:00 自動執行', color: '' },
              { label: '資料保留', value: '30 天滾動備份', color: '' },
              { label: '備份內容', value: '全部案件、照片、財務、人員', color: '' },
              { label: '儲存位置', value: '伺服器本地 /backups', color: '' },
            ].map(item => (
              <div key={item.label} className="flex justify-between">
                <span className="text-gray-400">{item.label}</span>
                <span className={`font-medium ${item.color}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Export */}
        <div className="card card-body">
          <h3 className="font-medium text-sm mb-4">資料匯出</h3>
          <div className="space-y-3">
            {exports.map(exp => (
              <a key={exp.label} href={exp.href} download className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-primary-light group transition-colors">
                <exp.icon size={18} className="text-gray-400 group-hover:text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-700 group-hover:text-primary-dark">{exp.label}</div>
                  <div className="text-xs text-gray-400">{exp.desc}</div>
                </div>
                <Download size={14} className="text-gray-300 group-hover:text-primary flex-shrink-0" />
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Backup logs */}
      <div className="card overflow-hidden">
        <div className="card-header">
          <span className="card-title">備份記錄</span>
          <button className="btn btn-sm" onClick={() => qc.invalidateQueries('backupLogs')}>
            <RefreshCw size={12} /> 刷新
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr><th>備份時間</th><th>類型</th><th>檔案名稱</th><th>大小</th><th>狀態</th><th>操作</th></tr>
            </thead>
            <tbody>
              {logs?.map(log => (
                <tr key={log.id}>
                  <td className="text-xs text-gray-500">{formatDateTime(log.created_at)}</td>
                  <td>
                    <span className={`badge ${log.backup_type === 'manual' ? 'badge-primary' : 'badge-gray'}`}>
                      {log.backup_type === 'manual' ? '手動' : '自動'}
                    </span>
                  </td>
                  <td className="text-xs font-mono text-gray-600">{log.file_name}</td>
                  <td className="text-xs text-gray-400">
                    {log.file_size ? `${(log.file_size / 1024 / 1024).toFixed(1)} MB` : '--'}
                  </td>
                  <td>
                    <span className={`badge ${log.status === 'success' ? 'badge-success' : 'badge-danger'}`}>
                      {log.status === 'success' ? '成功' : '失敗'}
                    </span>
                    {log.error_message && <div className="text-xs text-danger mt-0.5">{log.error_message}</div>}
                  </td>
                  <td>
                    {log.status === 'success' && log.file_name && (
                      <a href={`/api/backup/download/${log.file_name}`} className="btn btn-sm gap-1">
                        <Download size={12} /> 下載
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {!logs?.length && (
                <tr><td colSpan="6" className="py-12 text-center text-sm text-gray-400">尚無備份記錄</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
