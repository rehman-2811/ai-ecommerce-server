// src/config/redis.js
const Redis = require('ioredis');
const { logger } = require('../utils/logger');

let redisClient = null;

const connectRedis = async () => {
  try {
    const config = process.env.REDIS_URL
      ? { host: new URL(process.env.REDIS_URL).hostname, port: new URL(process.env.REDIS_URL).port || 6379 }
      : { host: 'localhost', port: 6379 };

    if (process.env.REDIS_PASSWORD) {
      config.password = process.env.REDIS_PASSWORD;
    }

    redisClient = new Redis({
      ...config,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
      lazyConnect: true
    });

    redisClient.on('error', (err) => {
      logger.warn('Redis error (non-fatal):', err.message);
      console.log('Redis error (non-fatal):')
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected');
      console.log("redis client connected")
    });

    await redisClient.connect().catch(() => {
      logger.warn('Redis not available - caching disabled');
      console.log("redis not available")
      redisClient = null;
    });

  } catch (error) {
    logger.warn('Redis setup failed - running without cache:', error.message);
    console.log("redis setup failed")
    redisClient = null;
  }
  return redisClient;
};

const getCache = async (key) => {
  if (!redisClient) return null;
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

const setCache = async (key, data, ttl = 300) => {
  if (!redisClient) return;
  try {
    await redisClient.setex(key, ttl, JSON.stringify(data));
  } catch {
    // Silently fail
  }
};

const delCache = async (key) => {
  if (!redisClient) return;
  try {
    await redisClient.del(key);
  } catch {
    // Silently fail
  }
};

const delCachePattern = async (pattern) => {
  if (!redisClient) return;
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
  } catch {
    // Silently fail
  }
};

module.exports = { connectRedis, getCache, setCache, delCache, delCachePattern, redisClient };


