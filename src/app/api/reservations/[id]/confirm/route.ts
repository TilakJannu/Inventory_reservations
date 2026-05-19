import { NextResponse } from "next/server";
import { confirmReservation } from "@/server/features/reservations/reservation.service";
import { reservationIdSchema } from "@/server/features/reservations/reservation.schemas";
import { getClientKey, enforceRateLimit } from "@/server/http/rate-limit";
import { withIdempotency } from "@/server/http/idempotency";
import { errorResponse, getRequestId } from "@/server/http/responses";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const requestId = getRequestId(request);

  try {
    const clientKey = getClientKey(request);
    enforceRateLimit(`reservations:confirm:${clientKey}`, 60);
    const { id } = reservationIdSchema.parse(await context.params);

    return await withIdempotency({
      request,
      requestId,
      scope: `reservations:confirm:${clientKey}:${id}`,
      handler: async () => {
        const reservation = await confirmReservation(id, requestId);

        return {
          status: 200,
          body: {
            data: reservation,
            requestId
          }
        };
      }
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
