import { config } from "./config.js";
import { serviceClient } from "./supabase.js";

let tail: Promise<void> = Promise.resolve();

export function enqueueAnalysisTask(task: () => Promise<void>) {
  tail = tail.then(task, task).catch(() => {
    // Each task persists its own failure. Keep the queue available for the next task.
  });
}

export async function markInterruptedAnalysisJobs() {
  const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
  const { data: jobs, error: readError } = await schema.from("analysis_jobs").select("id").in("status", ["queued", "processing"]);
  if (readError) return readError;
  const jobIds = (jobs ?? []).map((item) => item.id);
  if (!jobIds.length) return null;
  const { data: runs, error: runError } = await schema.from("analysis_runs").select("id").in("analysis_job_id", jobIds);
  if (runError) return runError;
  const runIds = (runs ?? []).map((item) => item.id);
  if (runIds.length) {
    const { error: planError } = await schema.from("response_plans").delete().in("analysis_run_id", runIds);
    if (planError) return planError;
    const { error: analysisError } = await schema.from("analysis_runs").delete().in("id", runIds);
    if (analysisError) return analysisError;
  }
  const { error } = await schema.from("analysis_jobs").update({
    status: "failed",
    stage: "failed",
    error_code: "ANALYSIS_WORKER_RESTARTED",
    error_message: "分析服务重启，本次任务已安全停止，请重新发起分析",
    completed_at: new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
  }).in("id", jobIds);
  return error;
}
