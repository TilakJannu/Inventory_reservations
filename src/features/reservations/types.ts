export type ReservationStatus = "pending" | "confirmed" | "released" | "expired";

export type Reservation = {
  id: string;
  product: {
    id: string;
    name: string;
    description: string;
  };
  warehouse: {
    id: string;
    name: string;
    city: string;
  };
  quantity: number;
  status: ReservationStatus;
  expiresAt: string;
  confirmedAt: string | null;
  releasedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
