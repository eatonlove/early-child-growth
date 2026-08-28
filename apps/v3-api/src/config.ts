import "dotenv/config";
import { z } from "zod";
import { isStandardQwenApiKey } from "./ai/key-validation.js";

const optionalUrl = z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  RUNTIME_MODE: z.enum(["supabase", "local-lite"]).default("supabase"),
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
  LOCAL_DATABASE_URL: z.string().url().optional(),
  LOCAL_POSTGREST_URL: z.string().url().optional(),
  LOCAL_JWT_SECRET: z.string().min(32).optional(),
  LOCAL_MEDIA_ROOT: z.string().min(1).default("/tmp/tongji-v3-media"),
  LOCAL_MEDIA_PUBLIC_BASE_URL: optionalUrl,
  PUBLIC_APP_URL: z.string().url().default("http://127.0.0.1:5300"),
  INTERNAL_EMAIL_DOMAIN: z.string().regex(/^[a-z0-9.-]+$/).default("tongji-v3.local"),
  AI_MODE: z.enum(["simulated", "qianwen"]).default("simulated"),
  DASHSCOPE_API_KEY: z.string().trim().optional(),
  QIANWEN_API_KEY: z.string().trim().optional(),
  QWEN_BASE_URL: z.string().url().default("https://dashscope.aliyuncs.com/compatible-mode/v1"),
  QWEN_TEXT_MODEL: z.string().trim().min(1).default("qwen3.7-plus"),
  QWEN_VISION_MODEL: z.string().trim().min(1).default("qwen3.7-plus"),
  QWEN_TIMEOUT_MS: z.coerce.number().int().min(5000).max(300000).default(120000),
  QWEN_MEDIA_ANALYSIS_ENABLED: z.enum(["true", "false"]).default("false"),
  QWEN_WEB_SEARCH_ENABLED: z.enum(["true", "false"]).default("true"),
  QWEN_MAX_MEDIA: z.coerce.number().int().min(0).max(3).default(2),
  AI_FALLBACK_TO_SIMULATED: z.enum(["true", "false"]).default("true"),
}).superRefine((value, context) => {
  const key = value.QIANWEN_API_KEY || value.DASHSCOPE_API_KEY;
  if (value.AI_MODE === "qianwen" && !isStandardQwenApiKey(key)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["DASHSCOPE_API_KEY"], message: "千问模式必须配置标准API密钥" });
  }
  if (value.AI_MODE === "qianwen" && key?.startsWith("sk-sp-")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["DASHSCOPE_API_KEY"], message: "后端不能使用Token Plan密钥" });
  }
  if (value.RUNTIME_MODE === "local-lite") {
    if (!value.LOCAL_DATABASE_URL) context.addIssue({ code: z.ZodIssueCode.custom, path: ["LOCAL_DATABASE_URL"], message: "本地精简模式必须配置PostgreSQL连接" });
    if (!value.LOCAL_POSTGREST_URL) context.addIssue({ code: z.ZodIssueCode.custom, path: ["LOCAL_POSTGREST_URL"], message: "本地精简模式必须配置PostgREST地址" });
    if (!value.LOCAL_JWT_SECRET) context.addIssue({ code: z.ZodIssueCode.custom, path: ["LOCAL_JWT_SECRET"], message: "本地精简模式必须配置JWT密钥" });
    if (value.AI_MODE === "qianwen" && value.QWEN_MEDIA_ANALYSIS_ENABLED === "true" && !value.LOCAL_MEDIA_PUBLIC_BASE_URL?.startsWith("https://")) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["LOCAL_MEDIA_PUBLIC_BASE_URL"], message: "本地真实媒体分析必须配置千问可访问的HTTPS媒体地址" });
    }
  }
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`同迹API环境变量缺失或无效: ${fields}`);
}

export const config = {
  ...parsed.data,
  trustProxy: parsed.data.TRUST_PROXY === "true",
  cookieSecure: parsed.data.COOKIE_SECURE === "true",
  corsOrigins: parsed.data.CORS_ORIGIN.split(",").map((item) => item.trim()).filter(Boolean),
  qwenApiKey: parsed.data.QIANWEN_API_KEY || parsed.data.DASHSCOPE_API_KEY || "",
  qwenMediaAnalysisEnabled: parsed.data.QWEN_MEDIA_ANALYSIS_ENABLED === "true",
  qwenWebSearchEnabled: parsed.data.QWEN_WEB_SEARCH_ENABLED === "true",
  aiFallbackToSimulated: parsed.data.AI_FALLBACK_TO_SIMULATED === "true",
  isLocalLite: parsed.data.RUNTIME_MODE === "local-lite",
};

export const internalEmail = (username: string) => `${username.trim().toLowerCase()}@${config.INTERNAL_EMAIL_DOMAIN}`;
