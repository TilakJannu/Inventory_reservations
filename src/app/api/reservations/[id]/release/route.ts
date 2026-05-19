import { NextResponse } from "next/server";
import { releaseReservation } from "@/server/features/reservations/reservation.service";
import { reservationIdSchema } from "@/server/features/reservations/reservation.schemas";
import { getClientKey, enforceRateLimit } from "@/server/http/rate-limit";
import { errorResponse, getRequestId, ok } from "@/server/http/responses";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const requestId = getRequestId(request);

  try {
    enforceRateLimit(`reservations:release:${getClientKey(request)}`, 60);
    const { id } = reservationIdSchema.parse(await context.params);
    const reservation = await releaseReservation(id, requestId);
    return ok(reservation, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
