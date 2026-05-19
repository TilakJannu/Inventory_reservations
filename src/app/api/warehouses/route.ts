import { NextResponse } from "next/server";
import { listWarehouses } from "@/server/features/warehouses/warehouse.service";
import { getClientKey, enforceRateLimit } from "@/server/http/rate-limit";
import { errorResponse, getRequestId, ok } from "@/server/http/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const requestId = getRequestId(request);

  try {
    enforceRateLimit(`warehouses:${getClientKey(request)}`);
    const warehouses = await listWarehouses();
    return ok(warehouses, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
