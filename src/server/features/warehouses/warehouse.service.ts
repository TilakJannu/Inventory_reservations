import { prisma } from "@/server/db/prisma";
import { toWarehouseResponse, type WarehouseResponse } from "./warehouse.dto";

export async function listWarehouses(): Promise<WarehouseResponse[]> {
  const warehouses = await prisma.warehouse.findMany({
    orderBy: {
      name: "asc"
    }
  });

  return warehouses.map(toWarehouseResponse);
}
