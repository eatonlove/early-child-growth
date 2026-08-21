import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(4310),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  CORS_ORIGIN: z.string().default("http://127.0.0.1:5300"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_INTERNAL_URL: z.string().url().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_SCHEMA: z.literal("tongji_v3").default("tongji_v3"),
  SUPABASE_STORAGE_BUCKET: z.literal("tongji-v3-evidence").default("tongji-v3-evidence"),
  INTERNAL_EMAIL_DOMAIN: z.string().regex(/^[a-z0-9.-]+$/).default("tongji-v3.local"),
  AI_MODE: z.literal("simulated").default("simulated"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`童迹API环境变量缺失或无效: ${fields}`);
}

export const config = {
  ...parsed.data,
  trustProxy: parsed.data.TRUST_PROXY === "true",
  cookieSecure: parsed.data.COOKIE_SECURE === "true",
  corsOrigins: parsed.data.CORS_ORIGIN.split(",").map((item) => item.trim()).filter(Boolean),
};

export const internalEmail = (username: string) => `${username.trim().toLowerCase()}@${config.INTERNAL_EMAIL_DOMAIN}`;
