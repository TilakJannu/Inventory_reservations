export type ProductStock = {
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
