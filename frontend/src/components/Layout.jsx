import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import {
  LayoutDashboard, ClipboardList, Users, Wrench, MessageSquare,
  FileText, Shield, Database, LogOut, Bell, ChevronLeft,
  Settings, Menu, Hammer, Tag
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import { usersAPI } from '../utils/api';
import { useSocket } from '../hooks/useSocket';
import { ROLE_LABELS } from '../utils/helpers';
import toast from 'react-hot-toast';

const navConfig = [
  {
    section: '主要功能',
    items: [
      { to: '/', icon: LayoutDashboard, label: '總覽儀表板', roles: ['admin','customer_service','engineer','owner'] },
      { to: '/cases', icon: ClipboardList, label: '案件管理', roles: ['admin','customer_service','engineer','owner'] },
      { to: '/dispatch', icon: Users, label: '派工管理', roles: ['admin','customer_service'] },
      { to: '/field', icon: Wrench, label: '現場作業', roles: ['engineer'] },
    ]
  },
  {
    section: '溝通管理',
    items: [
      { to: '/chat', icon: MessageSquare, label: '線上客服', roles: ['admin','customer_service','engineer','owner'] },
    ]
  },
  {
    section: '財務管理',
    items: [
      { to: '/finance', icon: FileText, label: '帳務處理', roles: ['admin','customer_service'] },
    ]
  },
  {
    section: '系統管理',
    items: [
      { to: '/users', icon: Shield, label: '人員管理', roles: ['admin'] },
      { to: '/permissions', icon: Settings, label: '權限設定', roles: ['admin'] },
      { to: '/case-types', icon: Tag, label: '報修類型', roles: ['admin','customer_service'] },
      { to: '/backup', icon: Database, label: '備份記錄', roles: ['admin'] },
    ]
  }
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const socket = useSocket();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const { data: notifications, refetch: refetchNotifs } = useQuery(
    'notifications',
    () => usersAPI.getNotifications().then(r => r.data),
    { refetchInterval: 30000 }
  );

  useEffect(() => {
    if (notifications) {
      setUnreadCount(notifications.filter(n => !n.is_read).length);
    }
  }, [notifications]);

  useEffect(() => {
    if (!socket) return;
    socket.on('notification', (notif) => {
      toast(notif.message, { icon: '🔔' });
      setUnreadCount(c => c + 1);
      refetchNotifs();
    });
    return () => socket.off('notification');
  }, [socket]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const visibleNav = navConfig.map(section => ({
    ...section,
    items: section.items.filter(item => item.roles.includes(user?.role))
  })).filter(s => s.items.length > 0);

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
            <Hammer size={16} className="text-white" />
          </div>
          {!collapsed && (
            <div>
              <div className="text-sm font-semibold text-gray-900 leading-tight">工程報修</div>
              <div className="text-xs text-gray-400">管理系統</div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        {visibleNav.map(section => (
          <div key={section.section} className="mb-3">
            {!collapsed && (
              <div className="px-4 py-1 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                {section.section}
              </div>
            )}
            {section.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `sidebar-item ${isActive ? 'active' : ''} ${collapsed ? 'justify-center px-0 mx-2' : ''}`
                }
              >
                <item.icon size={16} className="flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </div>

      <div className="border-t border-gray-100 p-3">
        {!collapsed ? (
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-primary-light flex items-center justify-center text-xs font-medium text-primary-dark flex-shrink-0">
              {user?.name?.slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-900 truncate">{user?.name}</div>
              <div className="text-[10px] text-gray-400">{ROLE_LABELS[user?.role]}</div>
            </div>
            <NavLink to="/profile" className="p-1 hover:bg-gray-100 rounded">
              <Settings size={14} className="text-gray-400" />
            </NavLink>
            <button onClick={handleLogout} className="p-1 hover:bg-gray-100 rounded" title="登出">
              <LogOut size={14} className="text-gray-400" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <button onClick={handleLogout} className="p-1.5 hover:bg-gray-100 rounded" title="登出">
              <LogOut size={14} className="text-gray-500" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <aside className={`hidden md:flex flex-col bg-white border-r border-gray-100 transition-all duration-300 ${collapsed ? 'w-14' : 'w-52'}`}>
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-52 bg-white h-full shadow-xl z-50">
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header className="h-12 bg-white border-b border-gray-100 flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button className="md:hidden p-1.5 hover:bg-gray-100 rounded" onClick={() => setMobileOpen(true)}>
              <Menu size={18} />
            </button>
            <button className="hidden md:flex p-1.5 hover:bg-gray-100 rounded" onClick={() => setCollapsed(c => !c)}>
              <ChevronLeft size={16} className={`text-gray-400 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <NavLink to="/cases/new" className="btn btn-primary btn-sm hidden sm:flex">
              + 新增報修
            </NavLink>
            <div className="relative">
              <button className="p-1.5 hover:bg-gray-100 rounded relative">
                <Bell size={17} className="text-gray-500" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 text-[9px] bg-danger text-white rounded-full flex items-center justify-center px-0.5">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            </div>
            <NavLink to="/profile" className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-gray-100 rounded-lg">
              <div className="w-6 h-6 rounded-full bg-primary-light flex items-center justify-center text-[10px] font-medium text-primary-dark">
                {user?.name?.slice(0, 2)}
              </div>
              <span className="text-xs text-gray-700 hidden sm:block">{user?.name}</span>
            </NavLink>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
