import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z
    .string()
    .refine(
      (value) =>
        value.startsWith("postgres://") || value.startsWith("postgresql://"),
      "DATABASE_URL must be a PostgreSQL connection string",
    ),
  CLIENT_ORIGIN: z.url(),

  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),

  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error", "silent"])
    .default("info"),
});

export type Env = z.infer<typeof envSchema>;

export const createEnv = (): Env => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error(
      "Invalid environment variables:",
      z.flattenError(result.error).fieldErrors,
    );

    throw new Error("Invalid environment configuration");
  }

  return result.data;
};
