import Redis from 'ioredis';
import env from './env.js';
import logger from '../utils/logger.js';

const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: true,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 5000);
    logger.warn(`Redis reconnecting in ${delay}ms (attempt ${times})`);
    return delay;
  },
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (err) => {
  logger.error('Redis error:', err.message);
});

// Separate connection for BullMQ subscriber
export const redisSubscriber = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

export default redis;
