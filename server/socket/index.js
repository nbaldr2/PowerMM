import { Server } from 'socket.io';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import logger from '../utils/logger.js';

let io = null;

export function initSocketIO(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: [env.APP_URL, 'http://localhost:5173', 'http://localhost:3000', 'http://109.71.254.177'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // JWT authentication middleware for Socket.io
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.user.email} (${socket.id})`);
    socket.join(`user:${socket.user.id}`);

    socket.on('join:campaign', (campaignId) => {
      socket.join(`campaign:${campaignId}`);
      logger.debug(`${socket.user.email} joined campaign:${campaignId}`);
    });

    socket.on('leave:campaign', (campaignId) => {
      socket.leave(`campaign:${campaignId}`);
    });

    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${socket.user.email}`);
    });
  });

  // Subscribe to Redis pub/sub for worker events
  const subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  subscriber.subscribe('campaign:events');
  subscriber.on('message', (channel, message) => {
    if (channel === 'campaign:events') {
      try {
        const { event, data } = JSON.parse(message);
        if (data.campaignId) {
          io.to(`campaign:${data.campaignId}`).emit(event, data);
        }
      } catch (err) {
        logger.error('Socket event parse error:', err.message);
      }
    }
  });

  logger.info('Socket.io initialized with Redis pub/sub bridge');
  return io;
}

export function getIO() {
  return io;
}

export function emitToUser(userId, event, data) {
  if (io) io.to(`user:${userId}`).emit(event, data);
}

export function emitToCampaign(campaignId, event, data) {
  if (io) io.to(`campaign:${campaignId}`).emit(event, data);
}
