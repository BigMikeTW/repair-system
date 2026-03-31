import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import useAuthStore from '../store/authStore';

const BACKEND_URL = 'https://repair-system-production-cf5b.up.railway.app';

let socketInstance = null;

export const getSocket = () => socketInstance;

export const useSocket = () => {
  const { token } = useAuthStore();
  const socketRef = useRef(null);

  useEffect(() => {
    if (!token) return;

    if (!socketInstance) {
      socketInstance = io(BACKEND_URL, {
        auth: { token },
        transports: ['polling', 'websocket'], // polling first for Vercel+Railway
        reconnection: true,
        reconnectionDelay: 3000,
        reconnectionAttempts: 5, // limit retries to reduce console spam
        timeout: 10000,
      });

      socketInstance.on('connect', () => console.log('✅ Socket connected'));
      socketInstance.on('disconnect', () => console.log('Socket disconnected'));
      socketInstance.on('connect_error', (err) => {
        // Silent fail after max attempts - don't spam console
        if (socketInstance?.io?.reconnectionAttempts === 0) {
          console.warn('Socket unavailable, notifications disabled');
        }
      });
    }

    socketRef.current = socketInstance;
    return () => {};
  }, [token]);

  return socketRef.current || socketInstance;
};

export const disconnectSocket = () => {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
};

export default useSocket;
