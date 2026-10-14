import { z } from 'zod';

export const analysisSubjectResultSchema = z.object({
  childId: z.string().uuid(),
  status: z.enum(['queued', 'processing', 'completed', 'needs_more_evidence', 'failed']),
  explanation: z.string().max(1000),
  missingInformation: z.array(z.string().max(300)).max(6),
  analysisRunId: z.string().uuid().nullable(),
}).strict();
export type AnalysisSubjectResult = z.infer<typeof analysisSubjectResultSchema>;

export function subjectResults(value: unknown): AnalysisSubjectResult[] {
  const parsed = z.array(analysisSubjectResultSchema).max(30).safeParse(value);
  return parsed.success ? parsed.data : [];
}
export function replaceSubjectResult(results: AnalysisSubjectResult[], result: AnalysisSubjectResult): AnalysisSubjectResult[] {
  return [...results.filter(item => item.childId !== result.childId), result];
}
export function mergeSubjectResults(jobs: Array<{subject_results?: unknown}>): AnalysisSubjectResult[] {
  const latest = new Map<string, AnalysisSubjectResult>();
  for (const job of jobs) for (const item of subjectResults(job.subject_results)) if (!latest.has(item.childId)) latest.set(item.childId, item);
  return [...latest.values()];
}
