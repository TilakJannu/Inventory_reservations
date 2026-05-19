"use client";

import { AlertCircle, ArrowLeft, CheckCircle2, RefreshCw, Timer, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientApiError } from "@/features/shared/api-client";
import { confirmReservation, fetchReservation, releaseReservation } from "../api";
import type { Reservation } from "../types";

type ReservationDetailProps = {
  reservationId: string;
  initialReservation?: Reservation | null;
};

export function ReservationDetail({ reservationId, initialReservation }: ReservationDetailProps): JSX.Element {
  const router = useRouter();
  const [reservation, setReservation] = useState<Reservation | null>(initialReservation ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(initialReservation === undefined);
  const [isMutating, setIsMutating] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const loadReservation = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      setReservation(await fetchReservation(reservationId));
    } catch (unknownError) {
      setError(toUserMessage(unknownError));
    } finally {
      setIsLoading(false);
    }
  }, [reservationId]);

  useEffect(() => {
    if (initialReservation === undefined) {
      void loadReservation();
    }
  }, [loadReservation, initialReservation]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const remainingMs = useMemo(() => {
    if (!reservation) return 0;
    
    if (reservation.status === "confirmed" && reservation.confirmedAt) {
      return Math.max(new Date(reservation.expiresAt).getTime() - new Date(reservation.confirmedAt).getTime(), 0);
    }
    
    if (reservation.status === "released" && reservation.releasedAt) {
      return Math.max(new Date(reservation.expiresAt).getTime() - new Date(reservation.releasedAt).getTime(), 0);
    }

    if (reservation.status === "expired") return 0;

    return Math.max(new Date(reservation.expiresAt).getTime() - now, 0);
  }, [now, reservation]);

  const visualStatus = useMemo(() => {
    if (!reservation) {
      return "pending";
    }

    if (reservation.status === "pending" && remainingMs === 0) {
      return "expired";
    }

    return reservation.status;
  }, [remainingMs, reservation]);


  async function handleRelease(): Promise<void> {
    setError(null);
    setIsMutating(true);
    try {
      await releaseReservation(reservationId);
      await loadReservation();
    } catch (unknownError) {
      setError(toUserMessage(unknownError));
      await loadReservation();
    } finally {
      setIsMutating(false);
    }
  }

  if (isLoading) {
    return (
      <section className="max-w-3xl" aria-label="Loading reservation">
        <Skeleton className="min-h-56" />
      </section>
    );
  }

  if (!reservation) {
    return (
      <section className="grid max-w-3xl gap-4">
        <Button asChild variant="outline">
          <Link href="/">
            <ArrowLeft size={18} aria-hidden="true" />
            Back to products
          </Link>
        </Button>
        <Alert variant="destructive" role="alert">
          <AlertCircle size={20} aria-hidden="true" />
          <AlertDescription>{error ?? "Reservation could not be loaded."}</AlertDescription>
        </Alert>
      </section>
    );
  }

  const isPending = visualStatus === "pending";

  return (
    <section className="grid max-w-3xl gap-4" aria-live="polite">
      <div>
        <Button asChild variant="outline">
          <Link href="/">
            <ArrowLeft size={18} aria-hidden="true" />
            Back to products
          </Link>
        </Button>
      </div>

      {visualStatus !== "expired" && visualStatus !== "released" && (
        <Alert variant={statusTone(visualStatus)} role={error ? "alert" : "status"}>
          {statusIcon(visualStatus)}
          <AlertDescription>{statusMessage(visualStatus)}</AlertDescription>
        </Alert>
      )}

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

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="grid gap-1">
              <CardTitle className="text-2xl">{reservation.product.name}</CardTitle>
              <CardDescription>{reservation.product.description}</CardDescription>
            </div>
            <Badge variant={visualStatus === "confirmed" ? "default" : "secondary"}>{visualStatus}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div>
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Time remaining
            </span>
            <div className="text-5xl font-black tabular-nums leading-none md:text-7xl">
              {formatDuration(remainingMs)}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Detail label="Warehouse" value={reservation.warehouse.name} description={reservation.warehouse.city} />
            <Detail label="Quantity" value={reservation.quantity.toString()} />
            <Detail label="Expires" value={new Date(reservation.expiresAt).toLocaleString()} />
          </div>

          {visualStatus === "confirmed" && (
            <div className="rounded-lg border bg-muted/30 p-4 mt-2">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Payment Details</h3>
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <div>
                  <span className="text-muted-foreground block">Transaction ID</span>
                  <span className="font-medium">TXN-{reservation.id.slice(-8).toUpperCase()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Amount Paid</span>
                  <span className="font-medium">₹999.00</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Payment Method</span>
                  <span className="font-medium">Credit Card ending in 4242</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Date</span>
                  <span className="font-medium">{new Date(reservation.confirmedAt!).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              disabled={!isPending || isMutating}
              onClick={() => router.push(`/payment/${reservationId}`)}
            >
              <CheckCircle2 size={18} aria-hidden="true" />
              Confirm purchase
            </Button>
            <Button
              variant="destructive"
              type="button"
              disabled={!isPending || isMutating}
              onClick={() => void handleRelease()}
            >
              <XCircle size={18} aria-hidden="true" />
              Cancel
            </Button>
            <Button variant="outline" type="button" disabled={isMutating} onClick={loadReservation}>
              <RefreshCw size={18} aria-hidden="true" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {visualStatus === "expired" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg text-center animate-in zoom-in-95 fade-in">
            <AlertCircle size={48} className="mx-auto text-destructive mb-4" />
            <h2 className="text-2xl font-bold mb-2">Reservation Expired</h2>
            <p className="text-muted-foreground mb-6">
              Your time to complete this purchase has elapsed. The items have been released back to our inventory.
            </p>
            <Button asChild className="w-full" size="lg">
              <Link href="/">Return to Home Page</Link>
            </Button>
          </div>
        </div>
      )}

      {visualStatus === "released" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg text-center animate-in zoom-in-95 fade-in">
            <CheckCircle2 size={48} className="mx-auto text-green-500 mb-4" />
            <h2 className="text-2xl font-bold mb-2">Reservation Cancelled</h2>
            <p className="text-muted-foreground mb-6">
              Your reservation has been successfully released. The items are now available to other shoppers.
            </p>
            <Button asChild className="w-full" size="lg">
              <Link href="/">Return to Home Page</Link>
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

type DetailProps = {
  label: string;
  value: string;
  description?: string;
};

function Detail({ label, value, description }: DetailProps): JSX.Element {
  return (
    <div className="grid gap-1 rounded-lg border bg-background p-3">
      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="break-words font-extrabold">{value}</span>
      {description ? <span className="text-sm text-muted-foreground">{description}</span> : null}
    </div>
  );
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function toUserMessage(error: unknown): string {
  if (error instanceof ClientApiError) {
    if (error.status === 410) {
      return "This reservation expired before it could be confirmed. The units are available to other shoppers again.";
    }

    if (error.status === 409) {
      return error.message;
    }

    return `${error.message}${error.requestId ? ` Request ID: ${error.requestId}` : ""}`;
  }

  return "We could not update this reservation. Please try again.";
}

function statusMessage(status: Reservation["status"]): string {
  switch (status) {
    case "confirmed":
      return "Reservation confirmed. Stock has been permanently decremented.";
    case "released":
      return "Reservation released. Stock is available again.";
    case "expired":
      return "Reservation expired. Confirming this hold will return a 410.";
    case "pending":
      return "Reservation is active. Confirm or cancel before the countdown reaches zero.";
  }
}

function statusTone(status: Reservation["status"]): "default" | "success" | "warning" {
  switch (status) {
    case "confirmed":
      return "success";
    case "released":
      return "default";
    case "expired":
      return "warning";
    case "pending":
      return "default";
  }
}

function statusIcon(status: Reservation["status"]): JSX.Element {
  switch (status) {
    case "confirmed":
      return <CheckCircle2 size={20} aria-hidden="true" />;
    case "released":
      return <XCircle size={20} aria-hidden="true" />;
    case "expired":
      return <AlertCircle size={20} aria-hidden="true" />;
    case "pending":
      return <Timer size={20} aria-hidden="true" />;
  }
}
