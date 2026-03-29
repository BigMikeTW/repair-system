import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import { ClipboardList, CheckCircle, AlertTriangle, DollarSign, TrendingUp, Users } from 'lucide-react';
import { casesAPI, financeAPI, usersAPI } from '../utils/api';
import { STATUS_LABELS, STATUS_BADGES, URGENCY_LABELS, URGENCY_BADGES, formatDateTime, formatMoney } from '../utils/helpers';
import useAuthStore from '../store/authStore';

const StatCard = ({ label, value, sub, icon: Icon, color = 'text-gray-900' }) => (
  <div className="stat-card">
    <div className="flex items-start justify-between">
      <div>
        <div className="stat-label">{label}</div>
        <div className={`stat-value ${color}`}>{value}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
      {Icon && <Icon size={20} className="text-gray-300 mt-1" />}
    </div>
  </div>
);

export default function DashboardPage() {
  const { user, canManage, isOwner, isEngineer } = useAuthStore();

  const { data: caseStats } = useQuery('caseStats', () => casesAPI.getStats().then(r => r.data), { enabled: !isOwner() });
  const { data: finStats } = useQuery('finStats', () => financeAPI.getStats().then(r => r.data), { enabled: canManage() });
  const { data: recentCases } = useQuery(
    ['cases', 'recent'],
    () => casesAPI.list({ limit: 8, page: 1 }).then(r => r.data)
  );
  const { data: engineers } = useQuery('engineers', () => usersAPI.getEngineers().then(r => r.data), { enabled: canManage() });

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">總覽儀表板</h1>
          <p className="text-xs text-gray-400 mt-0.5">歡迎回來，{user?.name}</p>
        </div>
        <Link to="/cases/new" className="btn btn-primary">+ 新增報修</Link>
      </div>

      {/* Stats grid */}
      {canManage() && caseStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="待受理" value={caseStats.pending} sub="需立即處理" icon={AlertTriangle} color="text-danger" />
          <StatCard label="施工中" value={parseInt(caseStats.dispatched || 0) + parseInt(caseStats.in_progress || 0)} sub="進行中案件" icon={ClipboardList} color="text-primary" />
          <StatCard label="本月完成" value={caseStats.completed} sub="已結案件" icon={CheckCircle} color="text-success" />
          <StatCard label="本月新增" value={caseStats.this_month} sub="案件數量" icon={TrendingUp} />
        </div>
      )}

      {canManage() && finStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="本月應收" value={formatMoney(finStats.monthly_billed)} icon={DollarSign} />
          <StatCard label="已收款" value={formatMoney(finStats.monthly_collected)} color="text-success" />
          <StatCard label="待收款" value={formatMoney(finStats.outstanding)} color="text-warning" />
          <StatCard label="逾期未收" value={formatMoney(finStats.overdue)} color="text-danger" />
        </div>
      )}

      <div className={`grid gap-5 ${canManage() ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
        {/* Recent cases */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">最新案件</span>
            <Link to="/cases" className="text-xs text-primary hover:underline">查看全部</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentCases?.cases?.map(c => (
              <Link key={c.id} to={`/cases/${c.id}`} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 transition-colors block">
                <span className={`badge ${URGENCY_BADGES[c.urgency]} mt-0.5 flex-shrink-0`}>{URGENCY_LABELS[c.urgency]}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{c.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{c.case_number} · {c.owner_company || c.owner_name} · {formatDateTime(c.created_at)}</div>
                </div>
                <span className={`badge ${STATUS_BADGES[c.status]} flex-shrink-0`}>{STATUS_LABELS[c.status]}</span>
              </Link>
            ))}
            {!recentCases?.cases?.length && (
              <div className="py-10 text-center text-sm text-gray-400">目前沒有案件</div>
            )}
          </div>
        </div>

        {/* Engineers status */}
        {canManage() && engineers && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">工程師狀態</span>
              <Link to="/dispatch" className="text-xs text-primary hover:underline">派工管理</Link>
            </div>
            <div className="card-body space-y-3">
              {engineers.map(eng => (
                <div key={eng.id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary-light flex items-center justify-center text-xs font-medium text-primary-dark flex-shrink-0">
                    {eng.name.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800">{eng.name}</div>
                    <div className="text-xs text-gray-400">{eng.specialties?.join(' · ') || '無專長設定'}</div>
                  </div>
                  <span className={`badge text-xs ${parseInt(eng.active_tasks) > 0 ? 'badge-warning' : 'badge-success'}`}>
                    {parseInt(eng.active_tasks) > 0 ? `${eng.active_tasks} 任務` : '可用'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Status breakdown */}
      {canManage() && caseStats && (
        <div className="card">
          <div className="card-header"><span className="card-title">案件狀態分佈</span></div>
          <div className="card-body">
            <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
              {[
                { key: 'pending', label: '待受理', color: 'bg-danger-light text-danger' },
                { key: 'accepted', label: '已受理', color: 'bg-warning-light text-warning' },
                { key: 'dispatched', label: '派工中', color: 'bg-primary-light text-primary-dark' },
                { key: 'in_progress', label: '施工中', color: 'bg-teal-light text-teal' },
                { key: 'signing', label: '簽收中', color: 'bg-purple-light text-purple' },
                { key: 'completed', label: '已完成', color: 'bg-success-light text-success' },
              ].map(({ key, label, color }) => (
                <div key={key} className={`rounded-xl p-3 text-center ${color}`}>
                  <div className="text-xl font-semibold">{caseStats[key] || 0}</div>
                  <div className="text-xs mt-1">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
