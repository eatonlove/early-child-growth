/** Numbers, whitespace and punctuation alone are not a usable observation or support instruction. */
export const hasMeaningfulText = (value: unknown): value is string => typeof value === 'string' && /\p{L}/u.test(value);

export function hasPlaceholderSupport(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const plans = (value as {responsePlans?: unknown}).responsePlans;
  if (!Array.isArray(plans)) return false;
  return plans.some(plan => {
    const steps = plan?.activitySupport?.steps;
    const questions = plan?.experienceSupport?.suggestedQuestions;
    return Array.isArray(steps) && steps.some(item => !hasMeaningfulText(item))
      || Array.isArray(questions) && questions.some(item => !hasMeaningfulText(item));
  });
}
