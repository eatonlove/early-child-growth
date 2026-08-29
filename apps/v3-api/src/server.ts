import { buildApp } from "./app.js";
import { markInterruptedAnalysisJobs } from "./analysis-task-queue.js";
import { config } from "./config.js";

const app = await buildApp();

const interruptedJobError = await markInterruptedAnalysisJobs();
if (interruptedJobError) app.log.warn({ dbError: interruptedJobError }, "unable to close interrupted analysis jobs during startup");

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ host: config.HOST, port: config.PORT });
