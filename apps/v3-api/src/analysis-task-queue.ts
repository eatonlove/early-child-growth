import { subjectResults } from "./domain/analysis-subject-results.js";
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
  const { data: jobs, error: readError } = await schema.from("analysis_jobs").select("id, analysis_run_ids, subject_results").in("status", ["queued", "processing"]);
  if (readError) return readError;
  const jobIds = (jobs ?? []).map((item) => item.id);
  if (!jobIds.length) return null;
  const { data: runs, error: runError } = await schema.from("analysis_runs").select("id").in("analysis_job_id", jobIds);
  if (runError) return runError;
  const completedIds = new Set((jobs ?? []).flatMap(job => job.analysis_run_ids ?? []));
  const runIds = (runs ?? []).map((item) => item.id).filter(id => !completedIds.has(id));
  if (runIds.length) {
    const { error: planError } = await schema.from("response_plans").delete().in("analysis_run_id", runIds);
    if (planError) return planError;
    const { error: analysisError } = await schema.from("analysis_runs").delete().in("id", runIds);
    if (analysisError) return analysisError;
  }
  for (const job of jobs ?? []) {
    const results = subjectResults(job.subject_results).map(item => ['queued', 'processing'].includes(item.status)
      ? {...item, status: 'failed' as const, explanation: '分析服务重启，请单独重试这名幼儿。'} : item);
    const {error} = await schema.from('analysis_jobs').update({
      status: 'failed', stage: 'failed', progress: 100, subject_results: results,
      error_code: 'ANALYSIS_WORKER_RESTARTED', error_message: '分析服务重启；已完成幼儿的结果保留，未完成者可单独重试。',
      completed_at: new Date().toISOString(),
    }).eq('id', job.id);
    if (error) return error;
  }
  return null;
}
