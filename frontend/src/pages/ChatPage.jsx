import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from 'react-query';
import { Send, MessageSquare, Users } from 'lucide-react';
import { chatAPI } from '../utils/api';
import { formatDateTime, ROLE_LABELS } from '../utils/helpers';
import useAuthStore from '../store/authStore';
import useSocket from '../hooks/useSocket';

export default function ChatPage() {
  const { caseId } = useParams();
  const [searchParams] = useSearchParams();
  const isInternal = searchParams.get('internal') === '1';
  const { user } = useAuthStore();
  const socket = useSocket();
  const qc = useQueryClient();
  const [activeCaseId, setActiveCaseId] = useState(caseId || null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const { data: conversations } = useQuery('conversations', () =>
    chatAPI.getConversations().then(r => r.data),
    { refetchInterval: 15000 }
  );

  const { data: fetchedMessages } = useQuery(
    ['messages', activeCaseId],
    () => activeCaseId ? chatAPI.getMessages(activeCaseId).then(r => r.data) : Promise.resolve([]),
    { enabled: !!activeCaseId }
  );

  useEffect(() => {
    if (fetchedMessages) setMessages(fetchedMessages);
  }, [fetchedMessages]);

  useEffect(() => {
    if (!socket || !activeCaseId) return;
    socket.emit('join_case', activeCaseId);
    socket.on('new_message', (msg) => {
      setMessages(prev => [...prev, msg]);
      qc.invalidateQueries('conversations');
    });
    chatAPI.markRead(activeCaseId).catch(() => {});
    return () => {
      socket.emit('leave_case', activeCaseId);
      socket.off('new_message');
    };
  }, [socket, activeCaseId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectConversation = (id) => {
    setActiveCaseId(id);
    setMessages([]);
  };

  const sendMessage = async () => {
    if (!message.trim() || !activeCaseId || sending) return;
    const text = message.trim();
    setMessage('');
    setSending(true);
    try {
      if (socket?.connected) {
        socket.emit('send_message', {
          caseId: activeCaseId, message: text,
          senderName: user.name, senderRole: user.role
        });
      } else {
        const res = await chatAPI.sendMessage(activeCaseId, { message: text });
        setMessages(prev => [...prev, res.data]);
        qc.invalidateQueries('conversations');
      }
    } catch {}
    setSending(false);
  };

  const activeConv = conversations?.find(c => c.id === activeCaseId);

  return (
    <div className="flex h-[calc(100vh-48px)] overflow-hidden">
      {/* Conversation list */}
      <div className="w-64 bg-white border-r border-gray-100 flex flex-col flex-shrink-0">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-medium text-gray-900">
            {isInternal ? '內部對話' : '客服對話'}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {isInternal ? '與工程師溝通派工事項' : '與業主溝通案件進度'}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations?.map(conv => (
            <button
              key={conv.id}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 ${activeCaseId === conv.id ? 'bg-primary-light' : ''}`}
              onClick={() => selectConversation(conv.id)}
            >
              {/* 第一行：案件編號（最上方，放大加粗）*/}
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-sm font-bold text-primary truncate">{conv.case_number}</span>
                {parseInt(conv.unread_count) > 0 && (
                  <span className="w-4 h-4 text-xs bg-danger text-white rounded-full flex items-center justify-center flex-shrink-0 ml-1">
                    {conv.unread_count}
                  </span>
                )}
              </div>
              {/* 第二行：最後訊息 */}
              <div className="text-xs text-gray-400 truncate">{conv.last_message || '暫無訊息'}</div>
              {/* 第三行：業主名稱 + 案件類型 */}
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs text-gray-600 truncate">{conv.owner_company || conv.owner_name || '—'}</span>
                {conv.case_type && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-xs text-gray-400 truncate">{conv.case_type}</span>
                  </>
                )}
              </div>
            </button>
          ))}
          {!conversations?.length && (
            <div className="py-10 text-center text-xs text-gray-400">
              <MessageSquare size={24} className="mx-auto mb-2 text-gray-200" />
              沒有對話記錄
            </div>
          )}
        </div>
      </div>

      {/* Chat window */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeCaseId && activeConv ? (
          <>
            <div className="px-5 py-3 bg-white border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-900">{activeConv.owner_company || activeConv.owner_name}</div>
                <div className="text-xs text-gray-400">{activeConv.case_number} · {activeConv.title}</div>
              </div>
              <span className="badge badge-success text-xs">線上</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
              {messages.map(msg => {
                const isMe = msg.sender_id === user.id;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                      <div className="text-xs text-gray-400 mb-1 px-1">
                        {!isMe && <span>{msg.sender_name} · {ROLE_LABELS[msg.sender_role] || msg.sender_role} · </span>}
                        {formatDateTime(msg.created_at)}
                      </div>
                      <div className={isMe ? 'msg-bubble-user' : 'msg-bubble-agent'}>
                        {msg.message}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <div className="p-4 bg-white border-t border-gray-100">
              <div className="flex gap-2">
                <input
                  className="form-control text-sm"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="輸入訊息，Enter 傳送..."
                  disabled={sending}
                />
                <button className="btn btn-primary btn-sm flex-shrink-0" onClick={sendMessage} disabled={!message.trim() || sending}>
                  <Send size={14} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <MessageSquare size={40} className="text-gray-200 mx-auto mb-3" />
              <div className="text-sm text-gray-400">選擇左側對話，開始客服溝通</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
