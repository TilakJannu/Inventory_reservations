import { z } from "zod";

export const createReservationSchema = z.object({
  productId: z.string().cuid(),
  warehouseId: z.string().cuid(),
  quantity: z.coerce.number().int().min(1).max(100)
});

export const reservationIdSchema = z.object({
  id: z.string().cuid()
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;
