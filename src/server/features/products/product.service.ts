import { prisma } from "@/server/db/prisma";
import { releaseAllExpiredReservations } from "@/server/features/reservations/reservation.service";
import { toProductStockResponse, type ProductStockResponse } from "./product.dto";

export async function listProductsWithStock(): Promise<ProductStockResponse[]> {
  await releaseAllExpiredReservations();

  const products = await prisma.product.findMany({
    orderBy: {
      name: "asc"
    },
    include: {
      stocks: {
        include: {
          warehouse: true
        }
      }
    }
  });

  return products.map(toProductStockResponse);
}
