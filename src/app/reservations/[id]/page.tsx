import { ReservationDetail } from "@/features/reservations/components/reservation-detail";
import { getReservation } from "@/server/features/reservations/reservation.service";

export const dynamic = "force-dynamic";

type ReservationPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ReservationPage({ params }: ReservationPageProps): Promise<JSX.Element> {
  const { id } = await params;
  
  let reservation = null;
  try {
    reservation = await getReservation(id);
  } catch (error) {
    // Leave as null, the client component will handle displaying the error
  }

  // Next.js passes plain objects from Server Components to Client Components.
  // getReservation returns Date objects, so we need to JSON serialize/deserialize 
  // to strip them to ISO strings, which matches what the client fetch does.
  const serializedReservation = reservation ? JSON.parse(JSON.stringify(reservation)) : null;

  return (
    <main>
      <ReservationDetail reservationId={id} initialReservation={serializedReservation} />
    </main>
  );
}
