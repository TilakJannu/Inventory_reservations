import { NextResponse } from "next/server";
import { getClientKey, enforceRateLimit } from "@/server/http/rate-limit";
import { errorResponse, getRequestId, ok } from "@/server/http/responses";
import { listProductsWithStock } from "@/server/features/products/product.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const requestId = getRequestId(request);

  try {
    enforceRateLimit(`products:${getClientKey(request)}`);
    const products = await listProductsWithStock();
    return ok(products, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
