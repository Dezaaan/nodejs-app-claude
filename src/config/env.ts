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
  // Shared by every app copy. The database number at the end (/0, /1, ...)
  // keeps dev, test and load-test data apart.
  REDIS_URL: z
    .string()
    .refine(
      (value) => value.startsWith("redis://") || value.startsWith("rediss://"),
      "REDIS_URL must be a Redis connection string",
    ),

  CLIENT_ORIGIN: z.url(),

  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),

  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error", "silent"])
    .default("info"),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),

  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),

  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // Only set to false for local HTTP development in browsers that refuse
  // Secure cookies on localhost (such as Safari).
  COOKIE_SECURE: z.stringbool().default(true),

  // Raised only for load testing, where every request comes from one IP.
  RATE_LIMIT_API_PER_MINUTE: z.coerce.number().int().positive().default(100),

  // Stricter on auth routes to slow down password guessing.
  RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().positive().default(20),

  // Connections per app process. Keep processes x this below PostgreSQL's
  // max_connections.
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  // PostgreSQL cancels any query running longer, so one slow query can't
  // hold a connection and a CPU core indefinitely.
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5_000),
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
