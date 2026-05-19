import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ConflictError } from "@/server/http/errors";
import { logger } from "@/server/observability/logger";
import { getRedisClient } from "@/server/redis/client";

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const IDEMPOTENCY_LOCK_TTL_SECONDS = 15;
const idempotencyKeySchema = z.string().min(8).max(255).regex(/^[A-Za-z0-9._:-]+$/);

type SuccessEnvelope<T> = {
  data: T;
  requestId: string;
};

type StoredIdempotencyResponse<T> = {
  status: number;
  body: SuccessEnvelope<T>;
};

type IdempotencyOptions<T> = {
  request: Request;
  requestId: string;
  scope: string;
  handler: () => Promise<StoredIdempotencyResponse<T>>;
};

export async function withIdempotency<T>({
  request,
  requestId,
  scope,
  handler
}: IdempotencyOptions<T>): Promise<NextResponse<SuccessEnvelope<T>>> {
  const rawKey = request.headers.get("idempotency-key");

  if (!rawKey) {
    const response = await handler();
    return NextResponse.json(response.body, { status: response.status });
  }

  const parsedKey = idempotencyKeySchema.parse(rawKey);
  const redis = getRedisClient();

  if (!redis) {
    logger.warn("Idempotency-Key received without Redis configuration", {
      requestId,
      scope
    });
    const response = await handler();
    return NextResponse.json(response.body, {
      status: response.status,
      headers: {
        "x-idempotency-status": "bypassed"
      }
    });
  }

  const cacheKey = buildCacheKey(scope, parsedKey);
  const lockKey = `${cacheKey}:lock`;
  const existing = await redis.getJson<StoredIdempotencyResponse<T>>(cacheKey);

  if (existing) {
    return NextResponse.json(existing.body, {
      status: existing.status,
      headers: {
        "x-idempotency-status": "replayed"
      }
    });
  }

  const lockAcquired = await redis.setLock(lockKey, requestId, IDEMPOTENCY_LOCK_TTL_SECONDS);

  if (!lockAcquired) {
    const replayed = await waitForStoredResponse<T>(cacheKey);

    if (replayed) {
      return NextResponse.json(replayed.body, {
        status: replayed.status,
        headers: {
          "x-idempotency-status": "replayed"
        }
      });
    }

    throw new ConflictError("A request with this Idempotency-Key is already processing.");
  }

  try {
    const response = await handler();
    await redis.setJson(cacheKey, response, IDEMPOTENCY_TTL_SECONDS);

    return NextResponse.json(response.body, {
      status: response.status,
      headers: {
        "x-idempotency-status": "stored"
      }
    });
  } finally {
    await redis.del(lockKey);
  }
}

function buildCacheKey(scope: string, idempotencyKey: string): string {
  const digest = createHash("sha256").update(`${scope}:${idempotencyKey}`).digest("hex");
  return `idempotency:v1:${digest}`;
}

async function waitForStoredResponse<T>(
  cacheKey: string
): Promise<StoredIdempotencyResponse<T> | null> {
  const redis = getRedisClient();

  if (!redis) {
    return null;
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await delay(100);
    const stored = await redis.getJson<StoredIdempotencyResponse<T>>(cacheKey);

    if (stored) {
      return stored;
    }
  }

  return null;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
