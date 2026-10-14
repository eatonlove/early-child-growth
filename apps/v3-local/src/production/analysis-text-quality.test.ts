import {expect, it} from 'vitest';
import {invalidSupportInstructions, meaningfulSupportText} from './analysis-text-quality';
it('identifies historical punctuation-only support without hiding real instructions', () => {
  expect(invalidSupportInstructions([{activitySupport: {steps: [',', '，', '。']}}])).toBe(true);
  expect([',', '教师先保持观察。', '   '].filter(meaningfulSupportText)).toEqual(['教师先保持观察。']);
  expect(invalidSupportInstructions([{activitySupport: {steps: ['教师先保持观察。', '记录尝试前后变化。']}, experienceSupport: {suggestedQuestions: ['你准备怎样再试？']}}])).toBe(false);
});
