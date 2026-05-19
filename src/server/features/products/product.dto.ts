import type { InventoryStock, Product, Warehouse } from "@prisma/client";
import { calculateAvailableUnits } from "@/server/features/inventory/stock-policy";

type ProductWithStocks = Product & {
  stocks: Array<InventoryStock & { warehouse: Warehouse }>;
};

export type ProductStockResponse = {
  id: string;
  slug: string;
  name: string;
  description: string;
  warehouses: Array<{
    id: string;
    name: string;
    city: string;
    totalUnits: number;
    reservedUnits: number;
    availableUnits: number;
  }>;
};

export function toProductStockResponse(product: ProductWithStocks): ProductStockResponse {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    warehouses: product.stocks
      .map((stock) => ({
        id: stock.warehouse.id,
        name: stock.warehouse.name,
        city: stock.warehouse.city,
        totalUnits: stock.totalUnits,
        reservedUnits: stock.reservedUnits,
        availableUnits: calculateAvailableUnits(stock.totalUnits, stock.reservedUnits)
      }))
      .sort((left, right) => left.name.localeCompare(right.name))
  };
}
