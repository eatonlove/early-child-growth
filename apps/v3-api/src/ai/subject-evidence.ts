import { z } from 'zod';
import { hasMeaningfulText } from './text-quality.js';
import type { ObservationAnalysisInput } from './contracts.js';

export class InsufficientObservationEvidenceError extends Error {
  constructor(public readonly reason: string, public readonly missingInformation: string[]) {
    super(reason.replace(/target-child/g, '该幼儿').replace(/peer-child-\d+/g, '其他幼儿'));
    this.reason = this.message;
    this.missingInformation = missingInformation.map(item => item.replace(/target-child/g, '该幼儿').replace(/peer-child-\d+/g, '其他幼儿'));
    this.name = 'InsufficientObservationEvidenceError';
  }
}

export const subjectEvidenceSchema = z.object({
  canAnalyze: z.boolean(), reason: z.string().trim().min(2).max(1000).refine(hasMeaningfulText),
  missingInformation: z.array(z.string().trim().min(2).max(300).refine(hasMeaningfulText)).max(6),
  directEvidence: z.array(z.string().trim().min(2).max(1000)).max(6),
  mediaEvidenceIds: z.array(z.string().trim().min(1).max(100)).max(3),
}).strict().superRefine((value, ctx) => {
  if (!value.canAnalyze && !value.missingInformation.length) ctx.addIssue({code: 'custom', path: ['missingInformation'], message: '证据不足时必须逐项说明需要补充什么'});
});
export const subjectEvidenceJsonSchema = {
  type: 'object', additionalProperties: false,
  required: ['canAnalyze', 'reason', 'missingInformation', 'directEvidence', 'mediaEvidenceIds'],
  properties: {
    canAnalyze: {type: 'boolean'}, reason: {type: 'string', minLength: 2, maxLength: 1000},
    missingInformation: {type: 'array', maxItems: 6, items: {type: 'string', minLength: 2, maxLength: 300}},
    directEvidence: {type: 'array', maxItems: 6, items: {type: 'string', minLength: 2, maxLength: 1000}},
    mediaEvidenceIds: {type: 'array', maxItems: 3, items: {type: 'string', minLength: 1, maxLength: 100}},
  },
};

export const SUBJECT_EVIDENCE_PROMPT = `你是逐幼儿观察证据核对助手，只判断当前资料是否足以形成目标幼儿的情境内分析，不输出发展结论或应答方案。
target-child是唯一目标，其他幼儿和群体行为不能代替其个人证据。只有存在明确归属目标幼儿的具体动作、原话、选择、尝试或互动过程，才可canAnalyze=true；单次证据可支持情境内线索，不要求跨时间证明稳定能力。
仅有幼儿名单、衣着或位置、教师评价“表现很好”、泛化群体描述、他人动作或已采用历史资料，均不足以形成本次个人分析。
有授权媒体时可以核对目标幼儿的可见行为，多人媒体必须能可靠识别目标；不可推测音轨或把未送入模型的媒体当成证据。
directEvidence只能逐字摘录本次客观白描或目标幼儿的补充观察，不得摘录教师识别或历史结论。媒体事实只引用本次提供的媒体ID。
不足时canAnalyze=false，并给出可操作的missingInformation：目标幼儿做了什么、说了什么、如何尝试或互动、媒体中如何定位；只列实际缺少的项目，不要求老师编写未发生的内容。reason和missingInformation使用简短中文，称为“该幼儿”，不得输出匿名标识或内部字段名。输出严格JSON。`;

export function requireAttributedEvidence(assessment: z.infer<typeof subjectEvidenceSchema>, input: ObservationAnalysisInput): void {
  if (!assessment.canAnalyze) throw new InsufficientObservationEvidenceError(assessment.reason, assessment.missingInformation);
  const original = input.observation.teacher_observation;
  const supplement = input.observation.subject_additional_observation ?? '';
  const multi = (input.observation.subject_count ?? 1) > 1 || (input.observation.unlisted_participant_count ?? 0) > 0;
  const textEvidence = assessment.directEvidence.some(excerpt =>
    (original.includes(excerpt) || supplement.includes(excerpt)) &&
    (!multi || excerpt.includes('target-child') || supplement.includes(excerpt) || input.observation.subject_identification_cues?.some(cue => excerpt.includes(cue))));
  const identifiedMedia = (!multi || Boolean(input.observation.subject_evidence_anchors?.length) || Boolean(input.observation.subject_context?.trim() && input.observation.subject_context !== '未补充本次个体情境特征'))
    && assessment.mediaEvidenceIds.some(id => input.media.some(item => item.id === id));
  if (!textEvidence && !identifiedMedia) throw new InsufficientObservationEvidenceError(
    '本次资料无法可靠回链到目标幼儿的具体行为。',
    ['补充该幼儿本次的具体动作、关键原话或互动过程。', ...(input.media.length ? ['标明照片或视频中该幼儿的衣着、位置及关键片段时间。'] : [])],
  );
}

export function anonymizeSubjectNames(text: string, children: Array<{id: string; display_name: string}>, targetId: string): string {
  const names = new Map<string, string>();
  for (const [index, child] of children.entries()) {
    if (children.filter(other => other.display_name === child.display_name).length !== 1) continue;
    names.set(child.display_name, child.id === targetId ? 'target-child' : `peer-child-${index + 1}`);
  }
  if (!names.size) return text;
  const escaped = [...names.keys()].sort((a, b) => b.length - a.length).map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return text.replace(new RegExp(escaped.join('|'), 'g'), name => names.get(name)!);
}

export function uniqueSubjectCues(feature: string, otherFeatures: string[]): string[] {
  return [...new Set(feature.split(/[，,；;\n]/).map(value => value.trim()).filter(value => value.length >= 3 && !otherFeatures.some(other => other.includes(value))))];
}

/** Conservative local-demo gate. Production uses the model assessment plus evidence back-links. */
export function hasExplicitTargetBehavior(text: string, individuallyScoped = false): boolean {
  const action = /(?:拿|放|搭|移|推|拉|画(?!面)|剪|跑|跳|爬|说|问|答|试|递|连接|拼|调整|比较|协商|商量|指向|选择|转动|转向|拒绝|帮助|moved|placed|tried|said|asked)/iu;
  return text.split(/[。！？；;，,\n]/).some(clause => action.test(clause) && !/peer-child-\d+/.test(clause) && (individuallyScoped || clause.includes('target-child')));
}
