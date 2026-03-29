import dayjs from 'dayjs';
import 'dayjs/locale/zh-tw';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);
dayjs.locale('zh-tw');

export const formatDate = (date, fmt = 'YYYY/MM/DD') => date ? dayjs(date).format(fmt) : '--';
export const formatDateTime = (date) => date ? dayjs(date).format('YYYY/MM/DD HH:mm') : '--';
export const formatRelative = (date) => date ? dayjs(date).fromNow() : '--';
export const formatMoney = (amount) => amount != null ? `$${Number(amount).toLocaleString('zh-TW')}` : '--';

export const STATUS_LABELS = {
  pending: '待受理', accepted: '已受理', dispatched: '派工中',
  in_progress: '施工中', signing: '簽收中', completed: '已完成',
  closed: '已結案', cancelled: '已取消'
};

export const STATUS_BADGES = {
  pending: 'badge-danger', accepted: 'badge-warning', dispatched: 'badge-primary',
  in_progress: 'badge-teal', signing: 'badge-purple', completed: 'badge-success',
  closed: 'badge-gray', cancelled: 'badge-gray'
};

export const URGENCY_LABELS = { emergency: '緊急', normal: '一般', low: '低' };
export const URGENCY_BADGES = { emergency: 'badge-danger', normal: 'badge-warning', low: 'badge-gray' };

export const ROLE_LABELS = { admin: '系統管理員', engineer: '工程師', customer_service: '客服人員', owner: '業主' };
export const ROLE_BADGES = { admin: 'badge-purple', engineer: 'badge-primary', customer_service: 'badge-teal', owner: 'badge-gray' };

export const CASE_TYPES = ['冷氣空調','水電維修','消防設備','電梯昇降','電氣配線','弱電系統','門禁系統','土木裝修','其他'];
export const PAYMENT_METHODS = ['銀行轉帳','現金','支票','電匯','其他'];

export const INV_STATUS_LABELS = { pending: '待請款', sent: '已發出', paid: '已收款', overdue: '逾期', cancelled: '已取消' };
export const INV_STATUS_BADGES = { pending: 'badge-warning', sent: 'badge-primary', paid: 'badge-success', overdue: 'badge-danger', cancelled: 'badge-gray' };

export const getInitials = (name) => name ? name.slice(0, 2) : '??';

export const clsx = (...classes) => classes.filter(Boolean).join(' ');
