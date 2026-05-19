import IORedis from "ioredis";
import { Redis as UpstashRedis } from "@upstash/redis";
import { getConfig } from "@/server/config/env";

export type RedisCacheClient = {
  getJson<T>(key: string): Promise<T | null>;
  setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  setLock(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  del(key: string): Promise<void>;
};

let redisClient: RedisCacheClient | null | undefined;

export function getRedisClient(): RedisCacheClient | null {
  if (redisClient !== undefined) {
    return redisClient;
  }

  const config = getConfig();

  if (config.UPSTASH_REDIS_REST_URL && config.UPSTASH_REDIS_REST_TOKEN) {
    redisClient = createUpstashClient(config.UPSTASH_REDIS_REST_URL, config.UPSTASH_REDIS_REST_TOKEN);
    return redisClient;
  }

  if (config.REDIS_URL) {
    redisClient = createStandardRedisClient(config.REDIS_URL);
    return redisClient;
  }

  redisClient = null;
  return redisClient;
}

function createUpstashClient(url: string, token: string): RedisCacheClient {
  const redis = new UpstashRedis({
    url,
    token
  });

  return {
    getJson: async <T>(key: string) => redis.get<T>(key),
    setJson: async <T>(key: string, value: T, ttlSeconds: number) => {
      await redis.set(key, value, {
        ex: ttlSeconds
      });
    },
    setLock: async (key: string, value: string, ttlSeconds: number) => {
      const result = await redis.set(key, value, {
        nx: true,
        ex: ttlSeconds
      });
      return result === "OK";
    },
    del: async (key: string) => {
      await redis.del(key);
    }
  };
}

function createStandardRedisClient(redisUrl: string): RedisCacheClient {
  const redis = new IORedis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    tls: redisUrl.startsWith("rediss://") ? {} : undefined
  });

  return {
    getJson: async <T>(key: string) => {
      await connectIfNeeded(redis);
      const value = await redis.get(key);
      return value ? (JSON.parse(value) as T) : null;
    },
    setJson: async <T>(key: string, value: T, ttlSeconds: number) => {
      await connectIfNeeded(redis);
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    },
    setLock: async (key: string, value: string, ttlSeconds: number) => {
      await connectIfNeeded(redis);
      const result = await redis.set(key, value, "EX", ttlSeconds, "NX");
      return result === "OK";
    },
    del: async (key: string) => {
      await connectIfNeeded(redis);
      await redis.del(key);
    }
  };
}

async function connectIfNeeded(redis: IORedis): Promise<void> {
  if (redis.status === "wait") {
    await redis.connect();
  }
}
