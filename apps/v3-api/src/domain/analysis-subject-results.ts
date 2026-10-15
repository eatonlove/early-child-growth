import { z } from 'zod';
import type { AnalysisResult } from '../ai/contracts.js';
import { readableEvidenceNote } from '../ai/subject-evidence.js';

export const analysisSubjectResultSchema = z.object({
  childId: z.string().uuid(),
  status: z.enum(['queued', 'processing', 'completed', 'needs_more_evidence', 'failed']),
  explanation: z.string().max(1000),
  missingInformation: z.array(z.string().max(300)).max(6),
  analysisRunId: z.string().uuid().nullable(),
  analysisScope: z.enum(['individual', 'context_only']).optional(),
}).strict();
export type AnalysisSubjectResult = z.infer<typeof analysisSubjectResultSchema>;

export function completedSubjectResult(childId: string, analysisRunId: string, result: AnalysisResult): AnalysisSubjectResult {
  return {
    childId, status: 'completed', analysisRunId, analysisScope: result.analysisScope,
    explanation: result.analysisScope === 'context_only'
      ? '已生成游戏情境分析与支持建议。补充个人动作或画面定位后，可让该幼儿的分析更具体。'
      : '已根据现有资料生成分析，待教师确认；以下资料可帮助完善分析，不影响查看本次结果。',
    missingInformation: [...new Set(result.evidenceGaps.map(readableEvidenceNote))].slice(0, 6).map(note => note.slice(0, 300)),
  };
}

export function subjectResults(value: unknown): AnalysisSubjectResult[] {
  const parsed = z.array(analysisSubjectResultSchema).max(30).safeParse(value);
  return parsed.success ? parsed.data.map(item => ({...item, explanation: readableEvidenceNote(item.explanation), missingInformation: item.missingInformation.map(readableEvidenceNote)})) : [];
}
export function replaceSubjectResult(results: AnalysisSubjectResult[], result: AnalysisSubjectResult): AnalysisSubjectResult[] {
  return [...results.filter(item => item.childId !== result.childId), result];
}
export function mergeSubjectResults(jobs: Array<{subject_results?: unknown}>): AnalysisSubjectResult[] {
  const latest = new Map<string, AnalysisSubjectResult>();
  for (const job of jobs) for (const item of subjectResults(job.subject_results)) if (!latest.has(item.childId)) latest.set(item.childId, item);
  return [...latest.values()];
}
