import {expect, it} from 'vitest';
import {anonymizeSubjectNames, hasExplicitTargetBehavior, InsufficientObservationEvidenceError, requireAttributedEvidence, subjectEvidenceSchema} from './subject-evidence.js';
import type {ObservationAnalysisInput} from './contracts.js';

const input: ObservationAnalysisInput = {observation: {teacher_observation: 'target-child移动桥墩后再次推车测试。同伴在旁拿取木板。', teacher_identification: '可能比较支撑位置。', teacher_response: {category: 'material', strategy: '保留材料', nextObservationFocus: '观察再次比较'}, scene: '建构区', theme: '搭桥', organization_stage: 'process', subject_count: 2}, child: {id: 'a', display_name: '虚构幼儿', birth_month: '2022-01'}, classroom: {id: 'class', grade: 'middle'}, knowledge: [], evidence: [], media: [], history: []};
const assessment = {canAnalyze: true, reason: '存在可归属的动作和测试过程。', missingInformation: [], directEvidence: ['target-child移动桥墩后再次推车测试。'], mediaEvidenceIds: []};
it('requires actionable missing information and stops insufficient subjects', () => {
  expect(subjectEvidenceSchema.safeParse({...assessment, canAnalyze: false}).success).toBe(false);
  expect(() => requireAttributedEvidence({...assessment, canAnalyze: false, missingInformation: ['补充该幼儿具体的动作或关键原话。']}, input)).toThrow(InsufficientObservationEvidenceError);
});
it('accepts only quoted current evidence attributable to the target, not a peer or invented snippet', () => {
  expect(() => requireAttributedEvidence(assessment, input)).not.toThrow();
  expect(() => requireAttributedEvidence({...assessment, directEvidence: ['同伴在旁拿取木板。']}, input)).toThrow(InsufficientObservationEvidenceError);
  expect(() => requireAttributedEvidence({...assessment, directEvidence: ['target-child已经学会稳定搭桥。']}, input)).toThrow(InsufficientObservationEvidenceError);
});
it('allows a separate teacher supplement and rejects unprovided or unidentifiable media', () => {
  const supplement = {...input, observation: {...input.observation, subject_additional_observation: '幼儿将木板转向后又尝试了一次。'}};
  expect(() => requireAttributedEvidence({...assessment, directEvidence: ['幼儿将木板转向后又尝试了一次。']}, supplement)).not.toThrow();
  expect(() => requireAttributedEvidence({...assessment, directEvidence: [], mediaEvidenceIds: ['not-provided']}, input)).toThrow(InsufficientObservationEvidenceError);
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
