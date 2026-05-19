import { NextResponse } from "next/server";
import { createReservation } from "@/server/features/reservations/reservation.service";
import { createReservationSchema } from "@/server/features/reservations/reservation.schemas";
import { getClientKey, enforceRateLimit } from "@/server/http/rate-limit";
import { BadRequestError } from "@/server/http/errors";
import { withIdempotency } from "@/server/http/idempotency";
import { errorResponse, getRequestId } from "@/server/http/responses";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = getRequestId(request);

  try {
    const clientKey = getClientKey(request);
    enforceRateLimit(`reservations:create:${clientKey}`, 60);

    return await withIdempotency({
      request,
      requestId,
      scope: `reservations:create:${clientKey}`,
      handler: async () => {
        const body = await parseJson(request);
        const input = createReservationSchema.parse(body);
        const reservation = await createReservation(input, requestId);

        return {
          status: 201,
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

async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new BadRequestError("Request body must be valid JSON.");
  }
}
