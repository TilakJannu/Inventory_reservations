import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const warehouses = [
    { code: "BLR-01", name: "Bengaluru Fulfillment Center", city: "Bengaluru" },
    { code: "DEL-01", name: "Delhi NCR Warehouse", city: "Gurugram" },
    { code: "BOM-01", name: "Mumbai D2C Hub", city: "Mumbai" }
  ];

  const products = [
    {
      slug: "daily-hydration-serum",
      name: "Daily Hydration Serum",
      description: "Fast-moving skincare SKU used to test high-demand checkout holds."
    },
    {
      slug: "travel-wellness-kit",
      name: "Travel Wellness Kit",
      description: "Bundled retail kit with limited warehouse availability."
    },
    {
      slug: "calm-sleep-gummies",
      name: "Calm Sleep Gummies",
      description: "Popular D2C consumable with inventory split across regions."
    },
    {
      slug: "advanced-sleep-support-formula",
      name: "Advanced Sleep Support Formula",
      description: "A specially formulated supplement for deep, restorative sleep."
    },
    {
      slug: "daily-multivitamin-gummies",
      name: "Daily Multivitamin Gummies",
      description: "Comprehensive daily vitamin kit for evaluating health discretely at home."
    },
    {
      slug: "soothing-pain-relief-gel",
      name: "Soothing Pain Relief Gel",
      description: "Topical gel for managing localized discomfort and pain."
    }
  ];

  await prisma.reservation.deleteMany();
  await prisma.inventoryStock.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  const createdWarehouses = await Promise.all(
    warehouses.map((warehouse) =>
      prisma.warehouse.create({
        data: warehouse
      })
    )
  );

  const createdProducts = await Promise.all(
    products.map((product) =>
      prisma.product.create({
        data: product
      })
    )
  );

  // stockPlan: [BLR-01, DEL-01, BOM-01]
  // null means the product is not stocked in that warehouse at all.
  const stockPlan = [
    [8, 3, 1],       // Daily Hydration Serum: all 3 warehouses
    [2, null, 5],    // Travel Wellness Kit: 2 warehouses
    [12, 4, 7],      // Calm Sleep Gummies: all 3 warehouses
    [null, 15, null],// Advanced Sleep Support Formula: 1 warehouse only
    [4, 2, null],    // Daily Multivitamin Gummies: 2 warehouses
    [null, null, 10] // Soothing Pain Relief Gel: 1 warehouse only
  ];

  for (const [productIndex, product] of createdProducts.entries()) {
    for (const [warehouseIndex, warehouse] of createdWarehouses.entries()) {
      const stock = stockPlan[productIndex]?.[warehouseIndex];
      
      // If stock is null, we skip creating the inventory record entirely,
      // simulating a product that is not tracked at this warehouse.
      if (stock !== null && stock !== undefined) {
        await prisma.inventoryStock.create({
          data: {
            productId: product.id,
            warehouseId: warehouse.id,
            totalUnits: stock
          }
        });
      }
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
