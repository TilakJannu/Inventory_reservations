import type { Warehouse } from "@prisma/client";

export type WarehouseResponse = {
  id: string;
  code: string;
  name: string;
  city: string;
};

export function toWarehouseResponse(warehouse: Warehouse): WarehouseResponse {
  return {
    id: warehouse.id,
    code: warehouse.code,
    name: warehouse.name,
    city: warehouse.city
  };
}
