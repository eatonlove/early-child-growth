import type {
  AIGeneration,
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
} from "./contracts.js";
import { QianwenAIProvider, type QianwenProviderOptions } from "./qianwen-provider.js";
import { buildScenarioActivityOptions, buildScenarioAnalysis, buildScenarioClassroomReport, buildScenarioCurriculum, buildScenarioCurriculumPlan, buildScenarioInterestClusters, buildScenarioObservationExtraction, buildScenarioReport, buildScenarioRevision } from "./scenario-provider.js";

export interface AIProviderConfig extends QianwenProviderOptions {
  mode: "simulated" | "qianwen";
  fallbackToSimulated: boolean;
}

class ScenarioAIProvider implements AIAnalysisProvider {
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
    return {
      data: buildScenarioAnalysis(input.observation, input.knowledge, input.history),
      provider: "ScenarioAIProvider",
      model: "simulated-ai-v3",
      promptVersion: "observation-analysis.v3.2",
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
      if (!this.fallbackEnabled) throw error;
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
  const scenario = new ScenarioAIProvider();
  if (config.mode === "simulated") return scenario;
  const qianwen = new QianwenAIProvider({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    textModel: config.textModel,
    visionModel: config.visionModel,
    timeoutMs: config.timeoutMs,
  });
  return new ResilientAIProvider(qianwen, scenario, config.fallbackToSimulated);
}
