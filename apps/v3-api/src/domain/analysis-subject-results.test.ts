import {expect, it} from 'vitest';
import {mergeSubjectResults, replaceSubjectResult, type AnalysisSubjectResult} from './analysis-subject-results.js';
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
