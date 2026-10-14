import { describe, expect, it } from 'vitest';
import { analysisResultSchema, type KnowledgeRow } from './contracts.js';
import { repairAnalysisOutput } from './analysis-output-repair.js';
import { buildScenarioAnalysis } from './scenario-provider.js';

const observation = {
  teacher_observation: '幼儿把两块木板并排放置后，又移动一侧的支撑积木。',
  teacher_identification: '幼儿可能在比较桥面的稳定性，需继续观察。',
  teacher_response: {category: 'material', strategy: '保留当前材料，等待幼儿再次尝试。', nextObservationFocus: '观察幼儿是否比较支撑位置。'},
  scene: '建构区', theme: '搭桥', organization_stage: 'process',
};

const card: KnowledgeRow = {
  id: 'card-1', code: 'SCI-M-01', domain: '科学', subdomain: '科学探究', title: '具有初步的探究能力', age_band: '4-5岁',
  official_expectations: ['能观察比较'], observable_behaviors: ['调整支撑物'], evidence_requirements: ['跨情境复察'],
  assessment_guidance: ['结合连续观察'], misunderstanding_warning: '单次成功不能判断稳定能力。', response_strategies: {材料支持: ['提供积木']}, next_observation_prompts: ['是否继续比较？'], keywords: ['积木', '支撑'],
};
function fixture() {
  const draft = buildScenarioAnalysis(observation, [card]);
  draft.domainExperiences.push({...draft.domainExperiences[0]!, domain: '社会', noJudgment: true, evidence: '', evidenceIds: [], indicatorCodes: []});
  return draft;
}

describe('conservative analysis output repair', () => {
  it('replays the latest failure: two blank domain limitations pass with conservative boundaries and unchanged evidence', () => {
    const draft = fixture();
    draft.domainExperiences[0]!.missingEvidence = '';
    draft.domainExperiences[1]!.missingEvidence = ' \n ';
    draft.domainExperiences[0]!.noJudgment = false;
    const before = structuredClone(draft);
    const repaired = repairAnalysisOutput(draft);
    expect(analysisResultSchema.safeParse(repaired.value).success).toBe(true);
    expect(repaired.fields).toEqual(['domainExperiences.0.missingEvidence', 'domainExperiences.1.missingEvidence']);
    expect(draft.domainExperiences[0]!.missingEvidence).toContain('不能据此判断稳定能力');
    expect(draft.domainExperiences[1]!.missingEvidence).toContain('需补充');
    expect(draft.facts).toEqual(before.facts);
    expect(draft.interpretations).toEqual(before.interpretations);
    expect(draft.domainExperiences.map(({missingEvidence: _, ...rest}) => rest)).toEqual(before.domainExperiences.map(({missingEvidence: _, ...rest}) => rest));
  });

  it('repairs empty-string teacher questions and blank participation without replacing usable questions', () => {
    const draft = fixture();
    const support = draft.responsePlans[0]!.experienceSupport;
    support.suggestedQuestions = ['', ' \n ', '你想怎样再试一次？'];
    support.participationMode = '';
    const repaired = repairAnalysisOutput(draft);
    expect(analysisResultSchema.safeParse(repaired.value).success).toBe(true);
    expect(support.suggestedQuestions).toEqual(['你想怎样再试一次？']);
    expect(support.participationMode).toContain('先保持观察');
    expect(repaired.fields).toHaveLength(2);
    support.suggestedQuestions = [''];
    repairAnalysisOutput(draft);
    expect(support.suggestedQuestions).toEqual(['你接下来想先试哪一种办法？为什么？']);
  });

  it('replays the eight-comma activity-step and question arrays without accepting punctuation as content', () => {
    const draft = fixture();
    draft.responsePlans[0]!.activitySupport.steps = Array(8).fill(',');
    draft.responsePlans[0]!.experienceSupport.suggestedQuestions = Array(8).fill(',');
    expect(analysisResultSchema.safeParse(draft).success).toBe(false);
    const facts = structuredClone(draft.facts);
    const repaired = repairAnalysisOutput(draft);
    expect(analysisResultSchema.safeParse(repaired.value).success).toBe(true);
    expect(draft.responsePlans[0]!.activitySupport.steps).toHaveLength(3);
    expect(draft.responsePlans[0]!.activitySupport.steps.every(step => /\p{L}/u.test(step))).toBe(true);
    expect(draft.responsePlans[0]!.experienceSupport.suggestedQuestions).toEqual(['你接下来想先试哪一种办法？为什么？']);
    expect(draft.facts).toEqual(facts);
  });

  it('does not repair empty observed facts, wrong field types, or missing judgment flags', () => {
    const draft = fixture();
    draft.facts[0]!.content = '';
    expect(analysisResultSchema.safeParse(repairAnalysisOutput(draft).value).success).toBe(false);
    const malformed = {domainExperiences: [{missingEvidence: '', noJudgment: 'false'}], responsePlans: [{experienceSupport: {suggestedQuestions: [null], participationMode: null}}]};
    const before = structuredClone(malformed);
    expect(repairAnalysisOutput(malformed).fields).toEqual([]);
    expect(malformed).toEqual(before);
  });
});
