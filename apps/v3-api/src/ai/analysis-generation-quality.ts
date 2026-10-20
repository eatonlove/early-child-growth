import {z} from 'zod';
import {analysisResultSchema} from './contracts.js';

/** Only newly generated prose: old saved results and legitimate one-character material names remain readable. */
export const generatedTextRules = [
  ['interestsAndStrengths.*', 2], ['evidenceGaps.*', 2],
  ['responseSuggestions.*.*', 2], ['nextObservation.*', 2],
  ['learningPossibilities.*', 2], ['gamePossibilities.*', 2],
  ['observationCut.*', 2], ['observationFocus.*', 4], ['warnings.*', 2],
  ['responsePlans.*.rationale', 2], ['responsePlans.*.targetExperience.*', 2],
  ['responsePlans.*.activitySupport.activityName', 2],
  ['responsePlans.*.activitySupport.timing', 2], ['responsePlans.*.activitySupport.objective', 2],
  ['responsePlans.*.activitySupport.steps.*', 8], ['responsePlans.*.activitySupport.teacherRole', 2],
  ['responsePlans.*.activitySupport.suggestedDuration', 2],
  ['responsePlans.*.materialSupport.placement', 2], ['responsePlans.*.materialSupport.purpose', 2],
  ['responsePlans.*.materialSupport.safetyNotes.*', 2],
  ['responsePlans.*.experienceSupport.suggestedQuestions.*', 8],
  ['responsePlans.*.experienceSupport.participationMode', 2],
  ['responsePlans.*.experienceSupport.withdrawalCondition', 2],
  ['responsePlans.*.observationCut', 2], ['responsePlans.*.observationFocus.*', 4],
  ['responsePlans.*.adjustmentCondition', 2],
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
