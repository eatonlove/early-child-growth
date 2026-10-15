import type {
  AIGeneration,
  ResourceCategoryAnalysisInput,
  ResourceCategoryAnalysis,
  AIAnalysisProvider,
  AnalysisRevisionInput,
  AnalysisResult,
  ClassroomReportContent,
  ClassroomReportGenerationInput,
  CurriculumDraft,
  CurriculumActivityOptions,
  CurriculumActivityOptionsInput,
  CurriculumPlanContent,
  CurriculumPlanGenerationInput,
  CurriculumGenerationInput,
  InterestClusteringInput,
  InterestClusterResult,
  ObservationAnalysisInput,
  ObservationDocumentExtraction,
  ObservationDocumentExtractionInput,
  ReportContent,
  ReportGenerationInput,
  ReportRevisionInput,
} from "./contracts.js";
import { applyEvidenceBoundary, InsufficientObservationEvidenceError, hasExplicitTargetBehavior, requireObservationMaterial } from "./subject-evidence.js";
import { QianwenAIProvider, type QianwenProviderOptions } from "./qianwen-provider.js";
import { buildScenarioActivityOptions, buildScenarioAnalysis, buildScenarioClassroomReport, buildScenarioCurriculum, buildScenarioCurriculumPlan, buildScenarioInterestClusters, buildScenarioObservationExtraction, buildScenarioReport, buildScenarioRevision } from "./scenario-provider.js";

export interface AIProviderConfig extends QianwenProviderOptions {
  mode: "simulated" | "qianwen";
  fallbackToSimulated: boolean;
}

class ScenarioAIProvider implements AIAnalysisProvider {
  constructor(private readonly assessIndividualEvidence = false) {}
  async analyzeResourceCategory(input: ResourceCategoryAnalysisInput): Promise<AIGeneration<ResourceCategoryAnalysis>> {
    const ids = input.resources.map((item) => item.packageId);
    return {
      data: { directionalContent: [{ title:`${input.categoryLabel}课程内容`, description:input.resources.map((item) => item.activityOrigin || item.title).join('；').slice(0,1600), sourcePackageIds:ids }],
        indicatorFocus:[{name:'活动中的经验运用',focus:'依据当前资料观察幼儿怎样在活动中运用已有经验。',observableBehaviors:['记录幼儿的实际行动、材料选择和调整过程。'],sourcePackageIds:ids}],
        limitations:['当前是模拟AI，仅展示分类分析结构，正式内容由真实模型提炼。'] },
      provider:'ScenarioAIProvider',model:'simulated-resource-category-v1',promptVersion:input.prompt?.version || 'resource-category-analysis.v1',mediaAnalyzed:false,notice:'模拟分类分析已完成。',
    };
  }
  async extractObservationDocument(input: ObservationDocumentExtractionInput): Promise<AIGeneration<ObservationDocumentExtraction>> {
    return {
      data: buildScenarioObservationExtraction(input),
      provider: "ScenarioAIProvider",
      model: "simulated-document-rules-v1",
      promptVersion: "observation-document-extraction.v1",
      mediaAnalyzed: false,
      notice: "当前使用本地规则提取观察表字段；所有字段必须由教师校对确认。",
    };
  }

  async analyzeObservation(input: ObservationAnalysisInput): Promise<AIGeneration<AnalysisResult>> {
    requireObservationMaterial({...input, media: []});
    const result = buildScenarioAnalysis({...input.observation, teacher_observation: input.observation.subject_additional_observation || input.observation.teacher_observation}, input.knowledge, input.history);
    const multi = (input.observation.subject_count ?? 1) > 1 || (input.observation.unlisted_participant_count ?? 0) > 0;
    if (this.assessIndividualEvidence && multi && !hasExplicitTargetBehavior(input.observation.teacher_observation) && !hasExplicitTargetBehavior(input.observation.subject_additional_observation ?? '', true)) {
      result.analysisScope = 'context_only';
      result.objectiveSummary = `游戏情境资料：${input.observation.teacher_observation}`.slice(0, 4000);
      result.evidenceGaps = ['可补充该幼儿的具体动作或原话，让个人经验分析更具体。', '可补充衣着、位置或关键片段，帮助将画面行为对应到该幼儿。', ...result.evidenceGaps].slice(0, 8);
    }
    return {
      data: applyEvidenceBoundary(result),
      provider: "ScenarioAIProvider",
      model: "simulated-ai-v3",
      promptVersion: "observation-analysis.v3.3",
      mediaAnalyzed: false,
      notice: "当前使用模拟AI：仅依据教师文字和结构化知识库生成，不读取图片、视频画面或音轨。",
    };
  }

  async reviseAnalysis(input: AnalysisRevisionInput): Promise<AIGeneration<AnalysisResult>> {
    return {
      data: buildScenarioRevision(input),
      provider: "ScenarioAIProvider",
      model: "simulated-feedback-revision-v1",
      promptVersion: "observation-analysis-revision.v1",
      mediaAnalyzed: false,
      notice: "当前使用安全规则生成教师反馈修订稿；修订稿仍需教师再次确认。",
    };
  }

  async generateReport(input: ReportGenerationInput): Promise<AIGeneration<ReportContent>> {
    return {
      data: buildScenarioReport(input),
      provider: "ScenarioAIProvider",
      model: "simulated-ai-v3",
      promptVersion: "period-report.v3.1",
      mediaAnalyzed: false,
      notice: "当前使用模拟AI规则汇总已采用证据，报告仍需教师审核。",
    };
  }

  async generateClassroomReport(input: ClassroomReportGenerationInput): Promise<AIGeneration<ClassroomReportContent>> {
    return {
      data: buildScenarioClassroomReport(input),
      provider: "ScenarioAIProvider",
      model: "simulated-ai-v3",
      promptVersion: "classroom-period-report.v3.1",
      mediaAnalyzed: false,
      notice: "当前使用模拟AI规则提炼班级共同兴趣与后续建议；覆盖指标由系统计算，报告仍需教师审核。",
    };
  }

  async reviseReport(input: ReportRevisionInput): Promise<AIGeneration<ReportContent | ClassroomReportContent>> {
    const instruction = input.instruction.trim();
    const data = structuredClone(input.existingContent);
    if ("nextSuggestions" in data) {
      data.nextSuggestions = [...data.nextSuggestions.filter((item) => item !== instruction), instruction].slice(-8);
    } else {
      data.nextPlan = [...data.nextPlan.filter((item) => item !== instruction), instruction].slice(-8);
    }
    return {
      data,
      provider: "ScenarioAIProvider",
      model: "simulated-report-revision-v1",
      promptVersion: "period-report-revision.v1",
      mediaAnalyzed: false,
      notice: "当前使用模拟AI按教师意见调整报告表达，原有证据边界保持不变。",
    };
  }

  async generateCurriculum(input: CurriculumGenerationInput): Promise<AIGeneration<CurriculumDraft>> {
    return {
      data: buildScenarioCurriculum(input),
      provider: "ScenarioAIProvider",
      model: "simulated-ai-v3",
      promptVersion: "curriculum-draft.v3.1",
      mediaAnalyzed: false,
      notice: "当前使用模拟AI规则生成课程草案，课程路径仍由教师和教研员调整。",
    };
  }

  async generateActivityOptions(input: CurriculumActivityOptionsInput): Promise<AIGeneration<CurriculumActivityOptions>> {
    return {
      data: buildScenarioActivityOptions(input),
      provider: "ScenarioAIProvider",
      model: "simulated-curriculum-options-v1",
      promptVersion: "curriculum-activity-options.v1",
      mediaAnalyzed: false,
      notice: "当前使用模拟AI生成4个可比较活动方向，教师选择后才能继续生成课程计划。",
    };
  }

  async generateCurriculumPlan(input: CurriculumPlanGenerationInput): Promise<AIGeneration<CurriculumPlanContent>> {
    return {
      data: buildScenarioCurriculumPlan(input),
      provider: "ScenarioAIProvider",
      model: "simulated-curriculum-plan-v1",
      promptVersion: "curriculum-plan-tongsheng.v1",
      mediaAnalyzed: false,
      notice: "当前使用模拟AI按园本模板生成课程地图；四区七步N循环仍由教师持续记录。",
    };
  }

  async clusterInterests(input: InterestClusteringInput): Promise<AIGeneration<InterestClusterResult>> {
    return {
      data: buildScenarioInterestClusters(input),
      provider: "ScenarioAIProvider",
      model: "simulated-semantic-rules-v1",
      promptVersion: "curriculum-interest-clustering.v1",
      mediaAnalyzed: false,
      notice: "当前使用本地语义规则聚合相近兴趣主题，聚类结果仍需教研员结合证据审核。",
    };
  }
}

class ResilientAIProvider implements AIAnalysisProvider {
  constructor(
    private readonly primary: AIAnalysisProvider,
    private readonly fallback: AIAnalysisProvider,
    private readonly fallbackEnabled: boolean,
  ) {}

  analyzeResourceCategory(input: ResourceCategoryAnalysisInput) {
    return this.withFallback('resource-category', () => this.primary.analyzeResourceCategory(input), () => this.fallback.analyzeResourceCategory(input));
  }

  extractObservationDocument(input: ObservationDocumentExtractionInput) {
    return this.withFallback("document-extraction", () => this.primary.extractObservationDocument(input), () => this.fallback.extractObservationDocument(input));
  }

  analyzeObservation(input: ObservationAnalysisInput) {
    return this.withFallback("observation", () => this.primary.analyzeObservation(input), () => this.fallback.analyzeObservation(input));
  }

  reviseAnalysis(input: AnalysisRevisionInput) {
    return this.withFallback("analysis-revision", () => this.primary.reviseAnalysis(input), () => this.fallback.reviseAnalysis(input));
  }

  generateReport(input: ReportGenerationInput) {
    return this.withFallback("report", () => this.primary.generateReport(input), () => this.fallback.generateReport(input));
  }

  generateClassroomReport(input: ClassroomReportGenerationInput) {
    return this.withFallback("classroom-report", () => this.primary.generateClassroomReport(input), () => this.fallback.generateClassroomReport(input));
  }


  reviseReport(input: ReportRevisionInput) {
    return this.withFallback("report-revision", () => this.primary.reviseReport(input), () => this.fallback.reviseReport(input));
  }

  generateCurriculum(input: CurriculumGenerationInput) {
    return this.withFallback("curriculum", () => this.primary.generateCurriculum(input), () => this.fallback.generateCurriculum(input));
  }

  generateActivityOptions(input: CurriculumActivityOptionsInput) {
    return this.withFallback("curriculum-options", () => this.primary.generateActivityOptions(input), () => this.fallback.generateActivityOptions(input));
  }

  generateCurriculumPlan(input: CurriculumPlanGenerationInput) {
    return this.withFallback("curriculum-plan", () => this.primary.generateCurriculumPlan(input), () => this.fallback.generateCurriculumPlan(input));
  }

  clusterInterests(input: InterestClusteringInput) {
    return this.withFallback("interest-clustering", () => this.primary.clusterInterests(input), () => this.fallback.clusterInterests(input));
  }

  private async withFallback<T>(
    scene: string,
    runPrimary: () => Promise<AIGeneration<T>>,
    runFallback: () => Promise<AIGeneration<T>>,
  ) {
    try {
      return await runPrimary();
    } catch (error) {
      if (error instanceof InsufficientObservationEvidenceError || !this.fallbackEnabled) throw error;
      const fallback = await runFallback();
      const reason = error instanceof Error ? error.message : "未知错误";
      return {
        ...fallback,
        fallbackReason: `${scene}:${reason}`,
        notice: `千问AI暂时不可用，已安全回退为模拟规则草稿。${fallback.notice}`,
      };
    }
  }
}

export function createAIProvider(config: AIProviderConfig): AIAnalysisProvider {
  const scenario = new ScenarioAIProvider(config.assessIndividualEvidence);
  if (config.mode === "simulated") return scenario;
  const qianwen = new QianwenAIProvider({
    apiKey: config.apiKey,
    apiKeys: config.apiKeys,
    baseUrl: config.baseUrl,
    textModel: config.textModel,
    visionModel: config.visionModel,
    timeoutMs: config.timeoutMs,
    visionTimeoutMs: config.visionTimeoutMs,
    observationTimeoutMs: config.observationTimeoutMs,
    assessIndividualEvidence: config.assessIndividualEvidence,
    webSearchEnabled: config.webSearchEnabled,
  });
  return new ResilientAIProvider(qianwen, scenario, config.fallbackToSimulated);
}
