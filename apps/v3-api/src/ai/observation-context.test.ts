import {describe, expect, it} from 'vitest';
import {boundedSchoolContext, SCHOOL_CONTEXT_BUDGET, allowedObservationEvidenceIds} from './observation-context.js';
import {observationJsonSchema, analysisJsonSchema} from './json-schemas.js';
import type {ObservationAnalysisInput} from './contracts.js';

const input: ObservationAnalysisInput = {
  observation: {teacher_observation: '幼儿在树屋商量分工，提出换岗，随后轮流看守出口。', teacher_identification: '出现分工线索。', teacher_response: {category: 'experience', strategy: '保持观察', nextObservationFocus: '观察轮流'}, scene: '树屋', theme: '轮流分工', organization_stage: 'process'},
  child: {id: 'child', display_name: '虚构', birth_month: '2022-01'}, classroom: {id: 'class', grade: 'middle'}, knowledge: [], evidence: [], media: [], history: [],
};
describe('bounded school context', () => {
  it('bounds multiple full documents, keeps a relevant late passage, and never changes current observations', () => {
    const source = {...input, professionalMemories: Array.from({length: 8}, (_, i) => ({id: `m${i}`, memoryType: 'school_knowledge', summary: '园本协商支持参考。'.repeat(100), retrievalText: '无关材料说明。\n'.repeat(3000) + '\n树屋轮流分工：教师先观察幼儿是否商量换岗。', applicability: {}, qualityScore: 1}))};
    const before = structuredClone(source);
    const result = boundedSchoolContext(source);
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(SCHOOL_CONTEXT_BUDGET);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(6);
    expect(result[0]!.relevantExcerpt).toContain('树屋轮流分工');
    expect(JSON.stringify(result)).not.toContain('retrievalText');
    expect(source).toEqual(before);
  });
  it('does not include irrelevant full text when no passage matches', () => {
    const result = boundedSchoolContext({...input, professionalMemories: [{id: 'm', memoryType: 'school_knowledge', summary: '教师参考摘要', retrievalText: 'abcdefghij'.repeat(5000), applicability: {}, qualityScore: 1}]});
    expect(result[0]?.relevantExcerpt).toBe('');
    expect(result[0]?.summary).toBe('教师参考摘要');
  });
  it('does not authorize unseen attachments and isolates per-request evidence schemas', () => {
    const ids = allowedObservationEvidenceIds({...input, evidence: [{id: 'unseen', evidence_type: 'photo'}, {id: 'visible', evidence_type: 'photo'}, {id: 'text', evidence_type: 'document', transcript: '已确认文字'}], media: [{id: 'visible', evidenceType: 'photo', mimeType: 'image/png', signedUrl: 'https://example.test/image'}]});
    expect(ids).toEqual(['teacher-observation', 'visible', 'text']);
    const schema = observationJsonSchema(ids) as typeof analysisJsonSchema;
    expect((schema.properties.facts.items.properties.evidenceIds.items as any).enum).toEqual(ids);
    expect((observationJsonSchema(['teacher-observation']) as any).properties.facts.items.properties.evidenceIds.items.enum).not.toContain('visible');
    expect((analysisJsonSchema.properties.facts.items.properties.evidenceIds.items as any).enum).toBeUndefined();
    expect((schema.properties.domainExperiences.items.properties.evidenceIds as any).minItems).toBeUndefined();
  });
});
