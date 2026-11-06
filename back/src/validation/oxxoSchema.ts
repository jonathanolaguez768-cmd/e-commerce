import { z } from 'zod'

export const processOxxoOrderSchema = z.object({
  external_reference: z.string().uuid(),
  payer: z.object({
    email: z.string().trim().email().max(150),
    first_name: z.string().trim().min(1).max(60),
    last_name: z.string().trim().min(1).max(60),
  }),
  items: z
    .array(
      z.object({
        producto_id: z.number().int().positive(),
        cantidad: z.number().int().positive(),
      }),
    )
    .min(1),
})