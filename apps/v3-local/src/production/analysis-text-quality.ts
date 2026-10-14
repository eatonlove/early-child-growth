export const meaningfulSupportText = (value: unknown): value is string => typeof value === 'string' && /\p{L}/u.test(value);
export function invalidSupportInstructions(plans: Array<{activitySupport?: {steps?: unknown[]}; experienceSupport?: {suggestedQuestions?: unknown[]}}>): boolean {
  return plans.some(plan => (plan.activitySupport?.steps ?? []).some(item => !meaningfulSupportText(item)) || (plan.experienceSupport?.suggestedQuestions ?? []).some(item => !meaningfulSupportText(item)));
}
