import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { config } from "./config.js";
import { ApiError, registerErrorHandler } from "./http.js";
import { authRoutes } from "./routes/auth.js";
import { governanceRoutes } from "./routes/governance.js";
import { evolutionRoutes } from "./routes/evolution.js";
import { knowledgeRoutes } from "./routes/knowledge.js";
import { managementRoutes } from "./routes/management.js";
import { observationRoutes } from "./routes/observations.js";
import { outcomeRoutes } from "./routes/outcomes.js";

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

  const health = () => ({
    status: "ok",
    service: "tongji-v3-api",
    schema: config.SUPABASE_SCHEMA,
    ai: {
      mode: config.AI_MODE,
      textModel: config.AI_MODE === "qianwen" ? config.QWEN_TEXT_MODEL : "simulated-ai-v3",
      visionModel: config.AI_MODE === "qianwen" ? config.QWEN_VISION_MODEL : "simulated-ai-v3",
      mediaAnalysisEnabled: config.AI_MODE === "qianwen" && config.qwenMediaAnalysisEnabled,
      fallbackEnabled: config.aiFallbackToSimulated,
    },
  });
  app.get("/healthz", async () => health());
  app.get("/api/healthz", async () => health());
  await authRoutes(app);
  await managementRoutes(app);
  await observationRoutes(app);
  await evolutionRoutes(app);
  await knowledgeRoutes(app);
  await governanceRoutes(app);
  await outcomeRoutes(app);
  return app;
}
