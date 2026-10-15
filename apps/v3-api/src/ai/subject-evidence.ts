import { hasMeaningfulText } from './text-quality.js';
import type { AnalysisResult, ObservationAnalysisInput } from './contracts.js';

export function readableEvidenceNote(text: string): string {
  return text.replace(/target-child/g, '该幼儿').replace(/peer-child-\d+/g, '同伴')
    .replace(/mediaEvidenceIds/g, '照片或视频').replace(/targetIdentificationCues/g, '衣着、位置等识别线索')
    .replace(/targetMediaAnchors|evidenceAnchors/g, '画面位置或关键时间段');
}

export class InsufficientObservationEvidenceError extends Error {
  constructor(public readonly reason: string, public readonly missingInformation: string[]) {
    super(readableEvidenceNote(reason));
    this.reason = this.message;
    this.missingInformation = missingInformation.map(readableEvidenceNote);
    this.name = 'InsufficientObservationEvidenceError';
  }
}

export const PARTIAL_ANALYSIS_POLICY = `【当前资料优先分析，补充建议不作前置门槛】
直接基于本次已提供的文字、已确认转写及实际送入的授权图片或视频完成能完成的分析，不因缺少衣着、位置、时间段、完整语言、连续观察或某个字段而停止整份分析，也不要要求教师填写内部媒体编号。
有可归属的个人行为时，analysisScope=individual，只写有依据的情境内表现，其余内容明确不确定或暂不判断。只凭一次动作也可形成待验证线索，不要求所有板块都有完整证据。
如果暂时不能可靠区分目标幼儿，analysisScope=context_only：仍整理游戏情境、材料、可见问题和教师支持建议；objectiveSummary明确是情境摘要，不是该幼儿的个人白描。个人facts、interpretations、hypotheses、interestsAndStrengths、developmentReferences、gameExperience、domainExperiences和learningDispositions可返回空数组，currentExperience明确暂不形成个人经验结论，不用同伴行为补齐。应答写成教师可选择的下一步观察、材料或互动支持，不假定该幼儿已经出现某种行为；不声称个人成长或稳定能力。
evidenceGaps列出能让本次分析更完善的具体资料及其用途，例如“可补充画面中的衣着或位置，帮助将行为对应到该幼儿”“可补充尝试前后的变化，帮助细化应答”。这些是后续可选建议，不是生成草稿的必填条件；只列真正有用的项目，不要求补写未发生的行为。warnings说明本版分析边界。全部展示文字使用简短中文，不输出target-child、peer-child、mediaEvidenceIds等内部标识。
本规则用于更新旧提示词中的“证据不足停止生成”行为；保留不编造、不诊断、不排名和教师最终确认要求。`;

export function requireObservationMaterial(input: ObservationAnalysisInput): void {
  const texts = [input.observation.teacher_observation, input.observation.subject_additional_observation,
    input.observation.child_quote, input.observation.group_context, ...input.evidence.map(item => item.transcript)];
  if (input.media.length || texts.some(text => hasMeaningfulText(text ?? ''))) return;
  throw new InsufficientObservationEvidenceError('本次尚无可读取的观察资料。', ['添加一段游戏事实描述，或上传可读取的照片、视频后即可分析。']);
}

/** Context drafts remain useful support references, never personal development evidence. */
export function applyEvidenceBoundary(result: AnalysisResult): AnalysisResult {
  result.evidenceGaps = [...new Set(result.evidenceGaps.map(readableEvidenceNote))].slice(0, 8);
  result.warnings = [...new Set(result.warnings.map(readableEvidenceNote))].slice(0, 8);
  if (!result.facts.length) result.analysisScope = 'context_only';
  if (result.analysisScope !== 'context_only') return result;
  result.objectiveSummary = readableEvidenceNote(result.objectiveSummary);
  result.facts = [];
  result.interpretations = [];
  result.hypotheses = [];
  result.currentExperience = '本次先提供游戏情境分析与支持建议；尚不能将具体行为可靠归属到该幼儿，暂不形成个人经验结论。';
  result.interestsAndStrengths = [];
  result.developmentReferences = [];
  result.gameExperience = [];
  result.domainExperiences = [];
  result.learningDispositions = [];
  result.teacherComparison.aiAddition = '本版先整理游戏情境和可选支持，不将尚未确认归属的行为写成个人经验；可按需要补充个人资料后再次分析。';
  for (const plan of result.responsePlans) plan.rationale = '依据本次游戏情境提供可选支持，尚不能确认该幼儿的具体行为；实施前请先观察其游戏意图与实际需要。';
  result.historicalComparison.changes = [];
  result.historicalComparison.stablePatterns = [];
  result.historicalComparison.caution = '本次仅形成情境分析，不据此判断该幼儿的成长变化或稳定能力。';
  result.evidenceSufficiency = '有限';
  result.warnings = ['本次为游戏情境分析与支持建议，不代表该幼儿的个人发展结论；补充个人资料后可生成更具体的分析。', ...result.warnings].slice(0, 8);
  return result;
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

/** Only selects a conservative scope for the simulated provider; never blocks real AI. */
export function hasExplicitTargetBehavior(text: string, individuallyScoped = false): boolean {
  const action = /(?:拿|放|搭|移|推|拉|画(?!面)|剪|跑|跳|爬|说|问|答|试|递|连接|拼|调整|比较|协商|商量|指向|选择|转动|转向|拒绝|帮助|moved|placed|tried|said|asked)/iu;
  return text.split(/[。！？；;，,\n]/).some(clause => action.test(clause) && !/peer-child-\d+/.test(clause) && (individuallyScoped || clause.includes('target-child')));
}
