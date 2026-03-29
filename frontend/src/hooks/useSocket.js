import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import useAuthStore from '../store/authStore';

let socketInstance = null;

export const getSocket = () => socketInstance;

export const useSocket = () => {
  const { token } = useAuthStore();
  const socketRef = useRef(null);

  useEffect(() => {
    if (!token) return;

    if (!socketInstance) {
      socketInstance = io('/', {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
      });

      socketInstance.on('connect', () => console.log('Socket connected'));
      socketInstance.on('disconnect', () => console.log('Socket disconnected'));
      socketInstance.on('connect_error', (err) => console.error('Socket error:', err.message));
    }

    socketRef.current = socketInstance;

    return () => {
      // Don't disconnect on component unmount; keep alive for app lifetime
    };
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
