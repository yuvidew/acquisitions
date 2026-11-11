import { z } from 'zod';

export const userIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const updateUserSchema = z
  .object({
    name: z.string().min(2).max(255).trim(),
    email: z.email().max(255).toLowerCase().trim(),
    password: z.string().min(6).max(128),
    role: z.enum(['user', 'admin']),
  })
  .partial()
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });
