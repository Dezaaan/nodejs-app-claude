import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const registerSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(8).max(128),
});

// No length rule beyond the maximum: login shouldn't reveal the password policy.
export const loginSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export type LoginInput = z.infer<typeof loginSchema>;
