"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { confirmReservation } from "../api";
import { ClientApiError } from "@/features/shared/api-client";

import { useRouter } from "next/navigation";

export function PaymentGatewayClient({ reservationId }: { reservationId: string }) {
  const router = useRouter();
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "processing" | "success">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleConfirmPayment(): Promise<void> {
    setError(null);
    setPaymentStatus("processing");
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await confirmReservation(reservationId);
      setPaymentStatus("success");
      setTimeout(() => {
        router.refresh();
        router.push(`/reservations/${reservationId}`);
      }, 2000);
    } catch (unknownError) {
      if (unknownError instanceof ClientApiError) {
        setError(unknownError.message);
      } else {
        setError("Payment failed. Please try again.");
      }
      setPaymentStatus("idle");
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-xl border bg-card p-8 text-center shadow-lg animate-in fade-in zoom-in duration-300">
      {paymentStatus === "success" ? (
        <>
          <CheckCircle2 size={64} className="text-green-500" />
          <h1 className="text-2xl font-bold">Payment Successful</h1>
          <p className="text-muted-foreground">Your reservation is confirmed! Redirecting you back to your order details...</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold">Payment Gateway</h1>
          <p className="text-muted-foreground">Please proceed to confirm your reservation.</p>
          
          {error && (
            <div className="w-full rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="mt-4 flex w-full flex-col gap-3">
            <Button 
              size="lg"
              className="w-full"
              onClick={() => void handleConfirmPayment()} 
              disabled={paymentStatus === "processing"}
            >
              {paymentStatus === "processing" ? "Processing..." : "Proceed & Pay"}
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              className="w-full"
              onClick={() => window.close()}
              disabled={paymentStatus === "processing"}
            >
              Cancel Payment
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
