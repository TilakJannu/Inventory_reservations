import { PrismaClient } from "@prisma/client";
import { createReservation } from "../server/features/reservations/reservation.service";
import { ConflictError } from "../server/http/errors";

const prisma = new PrismaClient();

async function main() {
  console.log("Setting up dummy data for concurrency test...");
  
  // 1. Create a dummy product and warehouse
  const product = await prisma.product.create({
    data: {
      slug: `test-product-${Date.now()}`,
      name: "Concurrency Test Product",
      description: "Test product for concurrency script",
    },
  });

  const warehouse = await prisma.warehouse.create({
    data: {
      code: `TEST-WH-${Date.now()}`,
      name: "Concurrency Test Warehouse",
      city: "Test City",
    },
  });

  // 2. Add inventory stock with totalUnits: 1
  await prisma.inventoryStock.create({
    data: {
      productId: product.id,
      warehouseId: warehouse.id,
      totalUnits: 1,
      reservedUnits: 0,
    },
  });

  console.log(`Created product ${product.id} and warehouse ${warehouse.id} with 1 unit of stock.`);

  // 3. Fire 5 concurrent reservation requests for the same item
  const CONCURRENT_REQUESTS = 5;
  console.log(`Firing ${CONCURRENT_REQUESTS} concurrent reservation requests for 1 unit...`);
  
  const requests = Array.from({ length: CONCURRENT_REQUESTS }).map((_, index) =>
    createReservation(
      {
        productId: product.id,
        warehouseId: warehouse.id,
        quantity: 1,
      },
      `req-${index}`
    ).then(() => "SUCCESS").catch((err) => {
      if (err instanceof ConflictError) {
        return "CONFLICT";
      }
      throw err;
    })
  );

  const results = await Promise.all(requests);
  
  // 4. Verify exactly 1 success and 4 conflicts
  const successes = results.filter((res) => res === "SUCCESS").length;
  const conflicts = results.filter((res) => res === "CONFLICT").length;

  console.log("Results of concurrent requests:");
  console.log(`- Successes: ${successes}`);
  console.log(`- Conflicts: ${conflicts}`);

  if (successes !== 1) {
    throw new Error(`Expected exactly 1 success, but got ${successes}`);
  }

  if (conflicts !== CONCURRENT_REQUESTS - 1) {
    throw new Error(`Expected exactly ${CONCURRENT_REQUESTS - 1} conflicts, but got ${conflicts}`);
  }

  // 5. Assert the final inventory stock state
  const finalStock = await prisma.inventoryStock.findUnique({
    where: {
      productId_warehouseId: {
        productId: product.id,
        warehouseId: warehouse.id,
      },
    },
  });

  if (!finalStock) {
    throw new Error("Final stock not found.");
  }

  console.log("Final inventory stock:");
  console.log(`- Total Units: ${finalStock.totalUnits}`);
  console.log(`- Reserved Units: ${finalStock.reservedUnits}`);

  if (finalStock.reservedUnits !== 1) {
    throw new Error(`Expected exactly 1 reserved unit, but got ${finalStock.reservedUnits}`);
  }

  console.log("✅ Concurrency test passed! Overselling prevented.");

  // 6. Cleanup
  console.log("Cleaning up dummy data...");
  await prisma.inventoryStock.delete({
    where: {
      productId_warehouseId: {
        productId: product.id,
        warehouseId: warehouse.id,
      },
    },
  });
  await prisma.reservation.deleteMany({
    where: {
      productId: product.id,
      warehouseId: warehouse.id,
    },
  });
  await prisma.product.delete({ where: { id: product.id } });
  await prisma.warehouse.delete({ where: { id: warehouse.id } });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("❌ Concurrency test failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
