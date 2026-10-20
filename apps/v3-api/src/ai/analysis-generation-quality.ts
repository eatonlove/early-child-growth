import {z} from 'zod';
import {analysisResultSchema} from './contracts.js';

/** Only newly generated prose: old saved results and legitimate one-character material names remain readable. */
export const generatedTextRules = [
  ['interestsAndStrengths.*', 4], ['evidenceGaps.*', 8],
  ['responseSuggestions.*.*', 8], ['nextObservation.*', 8],
  ['learningPossibilities.*', 8], ['gamePossibilities.*', 8],
  ['observationCut.*', 8], ['observationFocus.*', 6], ['warnings.*', 6],
  ['responsePlans.*.rationale', 12], ['responsePlans.*.targetExperience.*', 4],
  ['responsePlans.*.activitySupport.activityName', 4],
  ['responsePlans.*.activitySupport.timing', 8], ['responsePlans.*.activitySupport.objective', 8],
  ['responsePlans.*.activitySupport.steps.*', 8], ['responsePlans.*.activitySupport.teacherRole', 6],
  ['responsePlans.*.activitySupport.suggestedDuration', 2],
  ['responsePlans.*.materialSupport.placement', 6], ['responsePlans.*.materialSupport.purpose', 8],
  ['responsePlans.*.materialSupport.safetyNotes.*', 6],
  ['responsePlans.*.experienceSupport.suggestedQuestions.*', 8],
  ['responsePlans.*.experienceSupport.participationMode', 8],
  ['responsePlans.*.experienceSupport.withdrawalCondition', 8],
  ['responsePlans.*.observationCut', 8], ['responsePlans.*.observationFocus.*', 6],
  ['responsePlans.*.adjustmentCondition', 8],
] as const;

export const analysisGenerationSchema = analysisResultSchema.superRefine((draft, ctx) => {
  for (const [pattern, minimum] of generatedTextRules) {
    const visit = (value: any, parts: string[], path: Array<string | number>) => {
      if (!parts.length) {
        if (typeof value === 'string' && (value.trim().length < minimum || !/\p{L}/u.test(value))) {
          ctx.addIssue({code: z.ZodIssueCode.custom, path, message: `请写完整词组或可执行短句（至少${minimum}字），不能使用单字、标点或序号占位`});
        }
        return;
      }
      const [part, ...rest] = parts;
      if (part === '*') {
        if (Array.isArray(value)) value.forEach((item, i) => visit(item, rest, [...path, i]));
        else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => visit(item, rest, [...path, key]));
      } else visit(value?.[part!], rest, [...path, part!]);
    };
    visit(draft, pattern.split('.'), []);
  }
});

/** Keep remote constraints and local correction minimums aligned, without changing evidence ID schemas. */
export function applyGeneratedTextRules(schema: Record<string, any>) {
  for (const [pattern, minimum] of generatedTextRules) {
    const visit = (node: any, parts: string[]) => {
      if (!node) return;
      if (!parts.length) {
        node.minLength = Math.max(minimum, node.minLength ?? 0);
        node.description = '写完整词组或可执行短句，不缩写成首字，不用标点或序号占位。';
        return;
      }
      const [part, ...rest] = parts;
      if (part === '*') {
        if (node.type === 'array') visit(node.items, rest);
        else Object.values(node.properties ?? {}).forEach(child => visit(child, rest));
      } else visit(node.properties?.[part!], rest);
    };
    visit(schema, pattern.split('.'));
  }
  return schema;
}
