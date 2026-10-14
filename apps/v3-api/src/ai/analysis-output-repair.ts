import { hasMeaningfulText } from './text-quality.js';

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const blankText = (value: unknown): value is string => typeof value === 'string' && !hasMeaningfulText(value);

/** Repair only evidence limitations and future support suggestions, never observed facts. */
export function repairAnalysisOutput(value: unknown): { value: unknown; fields: string[] } {
  const fields: string[] = [];
  if (!record(value)) return { value, fields };
  if (Array.isArray(value.domainExperiences)) {
    value.domainExperiences.forEach((experience: unknown, index: number) => {
      if (!record(experience) || typeof experience.noJudgment !== 'boolean' || !blankText(experience.missingEvidence)) return;
      experience.missingEvidence = experience.noJudgment
        ? '本次材料不足以作该领域判断，需补充可明确归属目标幼儿的直接行为证据。'
        : '本次记录仅支持情境内的经验线索，仍需后续观察复核，不能据此判断稳定能力。';
      fields.push(`domainExperiences.${index}.missingEvidence`);
    });
  }
  if (!Array.isArray(value.responsePlans)) return { value, fields };
  value.responsePlans.forEach((plan: unknown, index: number) => {
    if (!record(plan)) return;
    if (record(plan.materialSupport) && Array.isArray(plan.materialSupport.materials) && plan.materialSupport.materials.length === 0) {
      plan.materialSupport.materials = [{
        name: '沿用当前游戏材料', quantity: '按现场需要',
        variable: '保持幼儿自主选择，一次只调整一个可比较变量',
      }];
      fields.push(`responsePlans.${index}.materialSupport.materials`);
    }
    if (record(plan.activitySupport) && Array.isArray(plan.activitySupport.steps) && plan.activitySupport.steps.every(step => typeof step === 'string')) {
      const steps = plan.activitySupport.steps;
      const valid = steps.filter(hasMeaningfulText);
      if (valid.length !== steps.length) {
        plan.activitySupport.steps = valid.length >= 2 ? valid : [...valid,
          '先观察目标幼儿的实际动作和游戏意图，确认是否需要支持。',
          '仅在幼儿主动求助或持续受阻时按本方案提供最小必要支持，恢复游戏后退回观察。',
          '记录支持前后的具体动作、关键原话或作品变化，作为下次复察依据。',
        ].slice(0, 8);
        fields.push(`responsePlans.${index}.activitySupport.steps`);
      }
    }
    const support = plan.experienceSupport;
    if (!record(support)) return;
    const questions = support.suggestedQuestions;
    // Invalid types are deliberately left to the validator. Only blank strings are removed.
    if (Array.isArray(questions) && questions.every(question => typeof question === 'string')) {
      const nonBlank = questions.filter(question => !blankText(question));
      if (nonBlank.length !== questions.length || questions.length === 0) {
        support.suggestedQuestions = nonBlank.length ? nonBlank : ['你接下来想先试哪一种办法？为什么？'];
        fields.push(`responsePlans.${index}.experienceSupport.suggestedQuestions`);
      }
    }
    if (blankText(support.participationMode)) {
      support.participationMode = '先保持观察并跟随幼儿的游戏意图；仅在幼儿主动求助或持续受阻时提供最小必要支持。';
      fields.push(`responsePlans.${index}.experienceSupport.participationMode`);
    }
  });
  return { value, fields };
}
