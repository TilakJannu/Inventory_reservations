import { NextResponse } from "next/server";
import { getConfig } from "@/server/config/env";
import { releaseAllExpiredReservations } from "@/server/features/reservations/reservation.service";
import { errorResponse, getRequestId, ok } from "@/server/http/responses";
import { UnauthorizedError } from "@/server/http/errors";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = getRequestId(request);

  try {
    const config = getConfig();
    const authorization = request.headers.get("authorization");
    const expected = config.CRON_SECRET ? `Bearer ${config.CRON_SECRET}` : null;

    if (expected && authorization !== expected) {
      throw new UnauthorizedError("Invalid cron authorization.");
    }

    const releasedCount = await releaseAllExpiredReservations();
    return ok({ releasedCount }, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
