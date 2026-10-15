import {expect, it} from 'vitest';
import {anonymizeSubjectNames, applyEvidenceBoundary, hasExplicitTargetBehavior, InsufficientObservationEvidenceError, readableEvidenceNote, requireObservationMaterial} from './subject-evidence.js';
import type {ObservationAnalysisInput} from './contracts.js';
import {analysisResultSchema} from './contracts.js';
import {buildScenarioAnalysis} from './scenario-provider.js';

const input: ObservationAnalysisInput = {observation: {teacher_observation: 'target-child移动桥墩后再次推车测试。同伴在旁拿取木板。', teacher_identification: '可能比较支撑位置。', teacher_response: {category: 'material', strategy: '保留材料', nextObservationFocus: '观察再次比较'}, scene: '建构区', theme: '搭桥', organization_stage: 'process', subject_count: 2}, child: {id: 'a', display_name: '虚构幼儿', birth_month: '2022-01'}, classroom: {id: 'class', grade: 'middle'}, knowledge: [], evidence: [], media: [], history: []};
it('allows sparse current text without requiring personal identity cues or a complete event', () => {
  expect(() => requireObservationMaterial({...input, observation: {...input.observation, teacher_observation: '几名幼儿一起搭桥。'}})).not.toThrow();
  expect(() => requireObservationMaterial({...input, observation: {...input.observation, teacher_observation: '同伴在旁拿取木板。'}})).not.toThrow();
});
it('only stops when no readable current material is available, not because history or judgments are missing', () => {
  const empty = {...input, observation: {...input.observation, teacher_observation: '  ，。'}};
  expect(() => requireObservationMaterial(empty)).toThrow(InsufficientObservationEvidenceError);
  expect(() => requireObservationMaterial({...empty, observation: {...empty.observation, subject_additional_observation: '幼儿坐在桥面旁。'}})).not.toThrow();
  expect(() => requireObservationMaterial({...empty, evidence: [{id: 'transcript', evidence_type: 'audio', transcript: '幼儿说还想再试一次。'}]})).not.toThrow();
  expect(() => requireObservationMaterial({...empty, media: [{id: 'video', evidenceType: 'video', mimeType: 'video/mp4', signedUrl: 'https://example.test/video'}]})).not.toThrow();
});
it('keeps context support plans while removing unsupported personal conclusions and growth comparisons', () => {
  const draft = buildScenarioAnalysis(input.observation, []);
  draft.nextObservation = ['观察幼儿的具体尝试。'];
  const plans = structuredClone(draft.responsePlans);
  draft.analysisScope = 'context_only';
  const result = applyEvidenceBoundary(draft);
  expect(result.facts).toEqual([]);
  expect(result.interpretations).toEqual([]);
  expect(result.developmentReferences).toEqual([]);
  expect(result.gameExperience).toEqual([]);
  expect(result.learningDispositions).toEqual([]);
  expect(result.currentExperience).toContain('暂不形成个人经验结论');
  expect(result.responsePlans.map(plan => plan.activitySupport)).toEqual(plans.map(plan => plan.activitySupport));
  expect(result.responsePlans.every(plan => plan.rationale.includes('尚不能确认'))).toBe(true);
  expect(result.historicalComparison.changes).toEqual([]);
  expect(analysisResultSchema.safeParse(result).success).toBe(true);
});
it('uses a context-only scope when a draft has no current personal facts', () => {
  const draft = buildScenarioAnalysis(input.observation, []);
  draft.facts = [];
  expect(applyEvidenceBoundary(draft).analysisScope).toBe('context_only');
});
it('keeps technical field names out of teacher-facing evidence notes', () => {
  expect(readableEvidenceNote('target-child可补充mediaEvidenceIds及targetIdentificationCues。')).toBe('该幼儿可补充照片或视频及衣着、位置等识别线索。');
});
it('maps unique target and peer names once, while leaving ambiguous same-name children unassigned', () => {
  const children = [{id: 'a', display_name: '小明'}, {id: 'b', display_name: '小红'}];
  expect(anonymizeSubjectNames('小明移动桥墩，小红递来木板。', children, 'a')).toBe('target-child移动桥墩，peer-child-2递来木板。');
  expect(anonymizeSubjectNames('小明移动桥墩。', [{id: 'a', display_name: '小明'}, {id: 'b', display_name: '小明'}], 'a')).toBe('小明移动桥墩。');
});

it('does not mistake a listed name or a group action for a target behavior in the local demo', () => {
  expect(hasExplicitTargetBehavior('参与幼儿target-child、peer-child-1一起搭桥。')).toBe(false);
  expect(hasExplicitTargetBehavior('target-child位于画面左侧，穿黄色上衣。')).toBe(false);
  expect(hasExplicitTargetBehavior('target-child移动桥墩后再次推车测试。')).toBe(true);
});
