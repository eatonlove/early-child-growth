import {describe, expect, it} from 'vitest';
import {responsePlanSchema, analysisResultSchema} from './contracts.js';
import {analysisJsonSchema} from './json-schemas.js';
import {supportCorrection} from './support-output-correction.js';
import {buildScenarioAnalysis} from './scenario-provider.js';

function fixture() {
  const draft = buildScenarioAnalysis({teacher_observation: '幼儿移动桥墩后再放木板，木板保持在上方。', teacher_identification: '正在尝试支撑位置。', teacher_response: {category: 'material', strategy: '保留材料', nextObservationFocus: '观察比较'}, scene: '建构区', theme: '搭桥', organization_stage: 'process'}, []);
  draft.nextObservation = ['观察幼儿是否继续比较支撑位置。'];
  return draft;
}
describe('targeted future-support correction', () => {
  it('replays single-character fields, corrects only listed paths and preserves all factual evidence', () => {
    const draft = fixture(); draft.responsePlans[0]!.activitySupport.activityName = '继'; draft.responsePlans[1]!.experienceSupport.participationMode = '平';
    const failed = analysisResultSchema.safeParse(draft); if (failed.success) throw Error('expected failure');
    const repair = supportCorrection(draft, failed.error.issues, analysisJsonSchema)!;
    expect(repair.instruction).toContain('minimum'); expect(repair.instruction).toContain('继');
    expect(repair.validator.safeParse({fix0: '继', fix1: '平'}).success).toBe(false);
    expect(repair.validator.safeParse({fix0: '继续观察换岗', fix1: '平行参与', facts: []}).success).toBe(false);
    const patched = repair.apply({fix0: '继续观察换岗', fix1: '平行参与'}) as typeof draft;
    expect(analysisResultSchema.safeParse(patched).success).toBe(true);
    expect(patched.facts).toEqual(draft.facts); expect(patched.interpretations).toEqual(draft.interpretations);
    expect(patched.responsePlans[0]!.evidenceIds).toEqual(draft.responsePlans[0]!.evidenceIds);
    expect(draft.responsePlans[0]!.activitySupport.activityName).toBe('继');
    expect(responsePlanSchema.safeParse(patched.responsePlans[0]).success).toBe(true);
  });
  it('refuses targeted factual edits or absent plan structures', () => {
    const draft = fixture(); draft.facts[0]!.content = '';
    const failed = analysisResultSchema.safeParse(draft); if (failed.success) throw Error('expected failure');
    expect(supportCorrection(draft, failed.error.issues, analysisJsonSchema)).toBeUndefined();
    expect(supportCorrection({}, failed.error.issues, analysisJsonSchema)).toBeUndefined();
  });
});
