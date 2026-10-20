import {describe, expect, it, vi} from 'vitest';
import {analysisResultSchema} from './contracts.js';
import {analysisGenerationSchema} from './analysis-generation-quality.js';
import {analysisJsonSchema, observationJsonSchema} from './json-schemas.js';
import {buildScenarioAnalysis} from './scenario-provider.js';
import {QwenClient} from './qianwen-client.js';

function fixture() {
  const draft = buildScenarioAnalysis({teacher_observation: '幼儿移动桥墩后再放木板，木板保持在上方。', teacher_identification: '正在尝试支撑位置。', teacher_response: {category: 'material', strategy: '保留材料', nextObservationFocus: '观察比较'}, scene: '建构区', theme: '搭桥', organization_stage: 'process'}, []);
  draft.nextObservation = ['观察幼儿是否继续比较支撑位置。'];
  return draft;
}
describe('generated observation prose quality', () => {
  it('does not constrain remote strings to one character and validates whole sentences locally', () => {
    expect(analysisJsonSchema.properties.responsePlans.items.properties.activitySupport.properties.steps.items).not.toHaveProperty('pattern');
    const draft = fixture();
    draft.responsePlans[0]!.activitySupport.steps[0] = '先观察幼儿。\n再按需介入。';
    expect(analysisGenerationSchema.safeParse(draft).success).toBe(true);
    draft.responsePlans[0]!.activitySupport.steps[0] = '1. ,，';
    expect(analysisGenerationSchema.safeParse(draft).success).toBe(false);
    const schema = observationJsonSchema(['teacher-observation']) as any;
    expect(schema.properties.responsePlans.items.properties.activitySupport.properties.steps.items.minLength).toBe(8);
    expect(schema.properties.responsePlans.items.properties.experienceSupport.properties.suggestedQuestions.items.minLength).toBe(8);
    expect(analysisJsonSchema.properties.responsePlans.items.properties.activitySupport.properties.steps.items.minLength).toBe(1);
  });
  it('rejects real-production-shaped single-character lists while preserving historical readability and valid short labels', () => {
    const draft = fixture();
    expect(analysisGenerationSchema.safeParse(draft).success).toBe(true);
    draft.responsePlans[0]!.materialSupport.materials[0]!.name = '纸';
    expect(analysisGenerationSchema.safeParse(draft).success).toBe(true);
    for (const plan of draft.responsePlans) {
      plan.activitySupport.steps = ['教', '记', '引'];
      plan.experienceSupport.suggestedQuestions = ['如', '你'];
      plan.observationFocus = ['幼', '该'];
      plan.targetExperience = ['自'];
      plan.materialSupport.safetyNotes = ['确'];
    }
    expect(analysisResultSchema.safeParse(draft).success).toBe(true);
    const result = analysisGenerationSchema.safeParse(draft);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toHaveLength(27);
  });
  it('corrects all short lists in one bounded request, preserves facts, and rejects an incomplete patch', async () => {
    for (const invalidPatch of [false, true]) {
      const good = fixture(); const draft = structuredClone(good);
      // More than 100 bad entries must still fit in one correction of their containing lists.
      for (const plan of draft.responsePlans) {
        plan.activitySupport.steps = Array(8).fill('教');
        plan.experienceSupport.suggestedQuestions = Array(8).fill('如');
        plan.observationFocus = Array(6).fill('幼');
        plan.targetExperience = Array(6).fill('自');
        plan.materialSupport.safetyNotes = Array(6).fill('确');
      }
      const fetcher = vi.fn(async (_url: any, init: any) => {
        const request = JSON.parse(init.body);
        const correction = request.response_format.json_schema;
        let content: unknown = draft;
        if (correction.name === 'tongji_observation_support_correction') {
          const instruction = request.messages.at(-1).content;
          const {fields} = JSON.parse(instruction.slice(instruction.indexOf('\n') + 1));
          expect(fields).toHaveLength(15);
          content = Object.fromEntries(fields.map((field: any) => [field.key, invalidPatch ? ['教'] : field.path.split('.').reduce((value: any, key: string) => value[key], good)]));
        }
        return new Response(JSON.stringify({choices: [{message: {content: JSON.stringify(content)}}]}));
      });
      const client = new QwenClient({apiKey: 'sk-test-only', baseUrl: 'https://example.test/v1', timeoutMs: 5000, retries: 0, fetcher});
      const call = client.structuredCompletion({model: 'test', messages: [{role: 'user', content: '分析JSON'}], schemaName: 'tongji_observation_analysis', jsonSchema: observationJsonSchema(['teacher-observation']), validator: analysisGenerationSchema, targetedSupportCorrection: true});
      if (invalidPatch) await expect(call).rejects.toThrow('业务校验');
      else {
        const fixed = await call;
        expect(fixed.facts).toEqual(draft.facts);
        expect(fixed.interpretations).toEqual(draft.interpretations);
        expect(fixed.responsePlans).toEqual(good.responsePlans);
      }
      expect(fetcher).toHaveBeenCalledTimes(2);
    }
  });
});
