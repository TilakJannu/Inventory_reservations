import { notFound } from "next/navigation";
import { PaymentGatewayClient } from "@/features/reservations/components/payment-gateway-client";

type PaymentPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PaymentPage({ params }: PaymentPageProps) {
  const { id } = await params;
  if (!id) {
    notFound();
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <PaymentGatewayClient reservationId={id} />
    </main>
  );
}
