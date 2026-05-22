import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || window.location.origin;

class SocketClient {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect(token) {
    if (this.socket?.connected) return;

    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    for (const [event, callbacks] of this.listeners.entries()) {
      callbacks.forEach(cb => this.socket.on(event, cb));
    }

    this.socket.on('connect', () => {
      console.log('🔌 Socket connected:', this.socket.id);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('🔌 Socket disconnected:', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.error('🔌 Socket error:', err.message);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners.clear();
  }

  joinCampaign(campaignId) {
    if (this.socket) this.socket.emit('join:campaign', campaignId);
  }

  leaveCampaign(campaignId) {
    if (this.socket) this.socket.emit('leave:campaign', campaignId);
  }

  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(callback);
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event, callback) {
    if (this.socket) {
      if (callback) {
        this.socket.off(event, callback);
      } else {
        this.socket.removeAllListeners(event);
      }
    }

    if (!this.listeners.has(event)) return;
    if (callback) {
      const arr = this.listeners.get(event).filter(cb => cb !== callback);
      if (arr.length > 0) this.listeners.set(event, arr);
      else this.listeners.delete(event);
    } else {
      this.listeners.delete(event);
    }
  }

  // Convenience methods for campaign send events
  onSendStart(callback) { this.on('send:start', callback); }
  onSendProgress(callback) { this.on('send:progress', callback); }
  onBatchComplete(callback) { this.on('send:batch_complete', callback); }
  onSendComplete(callback) { this.on('send:complete', callback); }
  onSendError(callback) { this.on('send:error', callback); }
}

const socketClient = new SocketClient();
export default socketClient;
