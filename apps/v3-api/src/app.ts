import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { config } from "./config.js";
import { ApiError, registerErrorHandler } from "./http.js";
import { authRoutes } from "./routes/auth.js";
import { aiModelConfigRoutes } from "./routes/ai-model-config.js";
import { aiPromptRoutes } from "./routes/ai-prompts.js";
import { governanceRoutes } from "./routes/governance.js";
import { evolutionRoutes } from "./routes/evolution.js";
import { knowledgeRoutes } from "./routes/knowledge.js";
import { managementRoutes } from "./routes/management.js";
import { observationRoutes } from "./routes/observations.js";
import { outcomeRoutes } from "./routes/outcomes.js";
import { localMediaContentType, mediaStorage } from "./runtime/media-storage.js";
import { z } from "zod";

export async function buildApp() {
  const app = Fastify({ logger: true, trustProxy: config.trustProxy, bodyLimit: 2 * 1024 * 1024 });
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer", bodyLimit: 100 * 1024 * 1024 },
    (_request, body, done) => done(null, body),
  );
  await app.register(cookie);
  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || config.corsOrigins.includes(origin)) callback(null, true);
      else callback(new Error("Origin not allowed"), false);
    },
    credentials: true,
  });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  app.addHook("onRequest", async (request) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
    const origin = request.headers.origin;
    if (origin && !config.corsOrigins.includes(origin)) throw new ApiError(403, "ORIGIN_FORBIDDEN", "请求来源不受信任");
  });
  registerErrorHandler(app);

  const internalHealth = () => ({
    status: "ok",
    service: "tongji-v3-api",
    runtime: config.RUNTIME_MODE,
    schema: config.SUPABASE_SCHEMA,
    ai: {
      mode: config.AI_MODE,
      textModel: config.AI_MODE === "qianwen" ? config.QWEN_TEXT_MODEL : "simulated-ai-v3",
      visionModel: config.AI_MODE === "qianwen" ? config.QWEN_VISION_MODEL : "simulated-ai-v3",
      mediaAnalysisEnabled: config.AI_MODE === "qianwen" && config.qwenMediaAnalysisEnabled,
      fallbackEnabled: config.aiFallbackToSimulated,
    },
  });
  const publicHealth = () => ({ status: "ok", service: "tongji-v3-api" });
  app.get("/healthz", async () => internalHealth());
  app.get("/api/healthz", async () => config.isLocalLite ? internalHealth() : publicHealth());
  app.get("/api/local-media", async (request, reply) => {
    if (!config.isLocalLite) throw new ApiError(404, "LOCAL_MEDIA_DISABLED", "本地媒体服务未启用");
    const query = z.object({
      path: z.string().min(1).max(1000),
      expires: z.coerce.number().int().positive(),
      signature: z.string().min(20).max(200),
    }).parse(request.query);
    const body = await mediaStorage.readSigned(query.path, query.expires, query.signature);
    if (!body) throw new ApiError(404, "LOCAL_MEDIA_NOT_FOUND", "媒体链接无效、已过期或文件不存在");
    return reply.header("Cache-Control", "private, no-store").type(localMediaContentType(query.path)).send(body);
  });
  await authRoutes(app);
  await aiModelConfigRoutes(app);
  await aiPromptRoutes(app);
  await managementRoutes(app);
  await observationRoutes(app);
  await evolutionRoutes(app);
  await knowledgeRoutes(app);
  await governanceRoutes(app);
  await outcomeRoutes(app);
  return app;
}
