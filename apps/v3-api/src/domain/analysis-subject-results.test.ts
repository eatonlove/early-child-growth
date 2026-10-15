import {expect, it} from 'vitest';
import {completedSubjectResult, mergeSubjectResults, replaceSubjectResult, type AnalysisSubjectResult} from './analysis-subject-results.js';
import {buildScenarioAnalysis} from '../ai/scenario-provider.js';
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
const completed: AnalysisSubjectResult = {childId: a, status: 'completed', explanation: '已完成', missingInformation: [], analysisRunId: a};
const insufficient: AnalysisSubjectResult = {childId: b, status: 'needs_more_evidence', explanation: '缺少个体行为', missingInformation: ['请补充原话或动作'], analysisRunId: null};
it('preserves a completed peer while one subject needs evidence or retries', () => {
  const results = replaceSubjectResult([completed, insufficient], {...insufficient, status: 'processing'});
  expect(results.find(item => item.childId === a)).toEqual(completed);
  expect(results.filter(item => item.childId === b)).toHaveLength(1);
});
it('merges a targeted retry with previous results without dropping completed subjects', () => {
  const retry = {...insufficient, status: 'completed' as const, missingInformation: [], analysisRunId: b};
  expect(mergeSubjectResults([{subject_results: [retry]}, {subject_results: [completed, insufficient]}])).toEqual([retry, completed]);
});
it('saves optional improvement notes alongside a successful context analysis', () => {
  const analysis = buildScenarioAnalysis({teacher_observation: '几名幼儿一起搭桥。', teacher_identification: '待确认', teacher_response: {category: 'material', strategy: '保留材料', nextObservationFocus: '继续观察'}, scene: '建构区', theme: '搭桥', organization_stage: 'process'}, []);
  analysis.analysisScope = 'context_only';
  analysis.evidenceGaps = ['可补充targetIdentificationCues以核对mediaEvidenceIds。'];
  const result = completedSubjectResult(a, b, analysis);
  expect(result.status).toBe('completed');
  expect(result.analysisRunId).toBe(b);
  expect(result.analysisScope).toBe('context_only');
  expect(result.missingInformation).toEqual(['可补充衣着、位置等识别线索以核对照片或视频。']);
  expect(result.explanation).toContain('已生成游戏情境分析');
});
