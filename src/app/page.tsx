import { ProductListing } from "@/features/products/components/product-listing";
import { listProductsWithStock } from "@/server/features/products/product.service";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const products = await listProductsWithStock();

  return (
    <main>
      <section className="mb-6 grid gap-2" aria-labelledby="page-title">
        <h1 id="page-title" className="text-3xl font-black leading-none tracking-normal md:text-5xl">
          Reserve inventory at checkout
        </h1>
        <p className="max-w-3xl text-base leading-7 text-muted-foreground">
          Review live available stock by warehouse, place a temporary hold, and complete or cancel the
          reservation before it expires.
        </p>
      </section>
      <ProductListing initialProducts={products} />
    </main>
  );
}
