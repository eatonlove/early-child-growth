import { buildApp } from "./app.js";
import { markInterruptedAnalysisJobs } from "./analysis-task-queue.js";
import { config } from "./config.js";
import { markInterruptedResourceAnalyses } from './routes/resource-library.js';

const app = await buildApp();

const interruptedJobError = await markInterruptedAnalysisJobs();
if (interruptedJobError) app.log.warn({ dbError: interruptedJobError }, "unable to close interrupted analysis jobs during startup");
const resourceAnalysisError = await markInterruptedResourceAnalyses();
if (resourceAnalysisError) app.log.warn({dbError:resourceAnalysisError},'unable to close interrupted resource analysis jobs');

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ host: config.HOST, port: config.PORT });
