"use client";

import { AlertCircle, PackageCheck, RefreshCw, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientApiError } from "@/features/shared/api-client";
import { createReservation, fetchProducts } from "../api";
import type { ProductStock } from "../types";

type ReserveTarget = {
  productId: string;
  warehouseId: string;
};

export function ProductListing({ initialProducts }: { initialProducts?: ProductStock[] }): JSX.Element {
  const router = useRouter();
  const [products, setProducts] = useState<ProductStock[]>(initialProducts ?? []);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!initialProducts);
  const [reserveTarget, setReserveTarget] = useState<ReserveTarget | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadProducts = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      setProducts(await fetchProducts());
    } catch (unknownError) {
      setError(toUserMessage(unknownError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialProducts) {
      void loadProducts();
    }
  }, [loadProducts, initialProducts]);

  async function handleReserve(productId: string, warehouseId: string): Promise<void> {
    setReserveTarget({ productId, warehouseId });
    setError(null);

    try {
      const reservation = await createReservation(productId, warehouseId);
      startTransition(() => {
        router.push(`/reservations/${reservation.id}`);
      });
    } catch (unknownError) {
      setError(toUserMessage(unknownError));
      await loadProducts();
    } finally {
      setReserveTarget(null);
    }
  }

  return (
    <section className="grid gap-4" aria-live="polite">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Alert className="sm:max-w-xl">
          <PackageCheck size={20} aria-hidden="true" />
          <AlertDescription>Available stock is calculated after releasing expired checkout holds.</AlertDescription>
        </Alert>
        <Button variant="outline" type="button" onClick={loadProducts} disabled={isLoading}>
          <RefreshCw size={18} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg text-center animate-in zoom-in-95 fade-in">
            <AlertCircle size={48} className="mx-auto text-destructive mb-4" />
            <h2 className="text-2xl font-bold mb-2">Action Failed</h2>
            <p className="text-muted-foreground mb-6">
              {error}
            </p>
            <Button className="w-full" size="lg" onClick={() => setError(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading products">
          <Skeleton className="min-h-40" />
          <Skeleton className="min-h-40" />
          <Skeleton className="min-h-40" />
        </div>
      ) : products.length === 0 ? (
        <Alert variant="warning">
          <AlertCircle size={20} aria-hidden="true" />
          <AlertDescription>No products are available. Run the seed command to load demo inventory.</AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <Card key={product.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <CardTitle>{product.name}</CardTitle>
                    <CardDescription>{product.description}</CardDescription>
                  </div>
                  <Badge variant="secondary">{product.warehouses.length} sites</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {product.warehouses.map((warehouse) => {
                    const isTargeted =
                      reserveTarget?.productId === product.id &&
                      reserveTarget?.warehouseId === warehouse.id;
                    const canReserve = warehouse.availableUnits > 0 && !isTargeted && !isPending;

                    return (
                      <div
                        className="grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                        key={warehouse.id}
                      >
                        <div className="grid min-w-0 gap-1">
                          <strong className="break-words text-sm">{warehouse.name}</strong>
                          <span className="text-sm text-muted-foreground">
                            {warehouse.availableUnits} available
                          </span>
                        </div>
                        <Button
                          type="button"
                          onClick={() => void handleReserve(product.id, warehouse.id)}
                          disabled={!canReserve}
                          aria-label={`Reserve ${product.name} from ${warehouse.name}`}
                        >
                          <ShoppingCart size={18} aria-hidden="true" />
                          {isTargeted ? "Reserving" : "Reserve"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function toUserMessage(error: unknown): string {
  if (error instanceof ClientApiError) {
    if (error.status === 409) {
      return "That stock was just reserved by someone else. Please choose another warehouse or refresh availability.";
    }

    return `${error.message}${error.requestId ? ` Request ID: ${error.requestId}` : ""}`;
  }

  return "We could not load inventory right now. Please try again.";
}
