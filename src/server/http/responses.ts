import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "@/server/observability/logger";
import { AppError, BadRequestError } from "./errors";

type SuccessEnvelope<T> = {
  data: T;
  requestId: string;
};

type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
};

export function ok<T>(data: T, requestId: string, init?: ResponseInit): NextResponse<SuccessEnvelope<T>> {
  return NextResponse.json(
    {
      data,
      requestId
    },
    init
  );
}

export function created<T>(data: T, requestId: string): NextResponse<SuccessEnvelope<T>> {
  return ok(data, requestId, { status: 201 });
}

export function errorResponse(error: unknown, requestId: string): NextResponse<ErrorEnvelope> {
  const appError = normalizeError(error);

  if (appError.statusCode >= 500) {
    logger.error("Unhandled API error", {
      requestId,
      errorName: error instanceof Error ? error.name : "Unknown",
      errorMessage: error instanceof Error ? error.message : "Unknown error"
    });
  } else {
    logger.warn("Handled API error", {
      requestId,
      code: appError.code,
      statusCode: appError.statusCode
    });
  }

  return NextResponse.json(
    {
      error: {
        code: appError.code,
        message: appError.message,
        details: appError.details
      },
      requestId
    },
    {
      status: appError.statusCode
    }
  );
}

function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new BadRequestError("The request payload is invalid.", error.flatten());
  }

  return new AppError(500, "INTERNAL_ERROR", "An unexpected error occurred.");
}

export function getRequestId(request: Request): string {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}
