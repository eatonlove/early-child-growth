import { z } from "zod";

export interface KnowledgeRow {
  id: string;
  code: string;
  domain: string;
  subdomain: string;
  title: string;
  age_band: string;
  official_expectations: string[];
  observable_behaviors: string[];
  evidence_requirements: string[];
  assessment_guidance: string[];
  misunderstanding_warning: string;
  response_strategies: Record<string, string[]>;
  next_observation_prompts: string[];
  keywords: string[];
}

export interface ObservationForAnalysis {
  teacher_observation: string;
  child_quote?: string | null;
  teacher_identification: string;
  teacher_response: { category: string; strategy: string; nextObservationFocus: string };
  scene: string;
  theme: string;
  organization_stage: string;
  observation_focus?: string[];
  group_context?: string | null;
  subject_context?: string | null;
  subject_role?: "primary" | "participant" | "incidental";
  subject_evidence_anchors?: string[];
}

export interface MediaForAnalysis {
  id: string;
  evidenceType: "photo" | "video";
  mimeType: string;
  signedUrl: string;
}

export interface HistoricalObservationEvidence {
  id: string;
  occurred_at: string;
  scene: string;
  theme: string;
  teacher_observation: string;
  child_quote?: string | null;
  teacher_identification: string;
  teacher_response: { category: string; strategy: string; nextObservationFocus: string };
  adopted_analysis?: unknown;
}

export interface ProfessionalMemoryForAnalysis {
  id: string;
  memoryType: string;
  summary: string;
  retrievalText: string;
  applicability: Record<string, unknown>;
  qualityScore: number;
}

export interface AnalysisFrameworkForPrompt {
  id: string;
  frameworkType: "game_experience" | "learning_disposition";
  name: string;
  version: number;
  description: string;
  dimensions: Array<{ label: string; evidenceReminder: string }>;
}

export interface ResolvedAIPrompt {
  key: string;
  systemPrompt: string;
  version: string;
  source: "default" | "custom";
  revision: number;
}

const shortText = z.string().trim().min(1).max(2000);
const confidence = z.number().min(0).max(1);
const evidenceIds = z.array(z.string().trim().min(1).max(100)).max(8).default([]);

export const responsePlanSchema = z.object({
  title: z.string().trim().min(2).max(160),
  rationale: z.string().trim().min(2).max(2000),
  targetExperience: z.array(shortText).min(1).max(6),
  activitySupport: z.object({
    activityName: z.string().trim().min(2).max(160),
    timing: z.string().trim().min(2).max(500),
    objective: z.string().trim().min(2).max(1000),
    steps: z.array(shortText).min(2).max(8),
    teacherRole: z.string().trim().min(2).max(1000),
    suggestedDuration: z.string().trim().min(1).max(120),
  }).strict(),
  materialSupport: z.object({
    materials: z.array(z.object({
      name: z.string().trim().min(1).max(120),
      quantity: z.string().trim().max(120).default(""),
      variable: z.string().trim().max(300).default(""),
    }).strict()).min(1).max(12),
    placement: z.string().trim().min(2).max(600),
    purpose: z.string().trim().min(2).max(1000),
    safetyNotes: z.array(shortText).max(6).default([]),
  }).strict(),
  experienceSupport: z.object({
    suggestedQuestions: z.array(shortText).min(1).max(8),
    participationMode: z.string().trim().min(2).max(1000),
    demonstration: z.string().trim().max(1000).default(""),
    withdrawalCondition: z.string().trim().min(2).max(1000),
  }).strict(),
  observationCut: z.string().trim().min(2).max(1000),
  observationFocus: z.array(shortText).min(2).max(6),
  adjustmentCondition: z.string().trim().min(2).max(1000),
  evidenceIds,
}).strict();

export type ResponsePlan = z.infer<typeof responsePlanSchema>;

export const analysisResultSchema = z.object({
  objectiveSummary: z.string().trim().min(1).max(4000),
  facts: z.array(z.object({
    content: shortText,
    evidence: z.string().trim().min(1).max(300),
    evidenceIds: z.array(z.string().trim().min(1).max(100)).max(5).default([]),
    confidence,
  }).strict()).min(1).max(12),
  interpretations: z.array(z.object({
    content: shortText,
    indicatorCode: z.string().trim().min(1).max(100),
    evidenceIds: z.array(z.string().trim().min(1).max(100)).max(5).default([]),
    limitation: z.string().trim().min(1).max(1000),
    confidence,
  }).strict()).max(12),
  hypotheses: z.array(z.object({
    content: shortText,
    nextObservation: z.string().trim().min(1).max(1000),
    confidence,
  }).strict()).min(1).max(8),
  teacherComparison: z.object({
    teacherIdentification: z.string().max(6000),
    teacherResponse: z.object({
      category: z.string().max(80),
      strategy: z.string().max(2000),
      nextObservationFocus: z.string().max(1000),
    }).strict(),
    aiAddition: z.string().trim().min(1).max(2000),
  }).strict(),
  currentExperience: z.string().trim().min(1).max(3000),
  interestsAndStrengths: z.array(shortText).max(8),
  evidenceGaps: z.array(shortText).min(1).max(8),
  developmentReferences: z.array(z.object({
    indicatorCode: z.string().trim().min(1).max(100),
    title: z.string().trim().min(1).max(300),
    domain: z.string().trim().min(1).max(80),
    ageBand: z.string().trim().min(1).max(80),
    status: z.enum(["线索", "部分证据", "较充分证据"]),
    evidenceStatement: z.string().trim().min(1).max(1500),
    missingEvidence: z.string().trim().min(1).max(1000),
  }).strict()).max(10),
  responseSuggestions: z.object({
    experience: z.array(shortText).min(1).max(5),
    material: z.array(shortText).min(1).max(5),
    activity: z.array(shortText).min(1).max(5),
  }).strict(),
  nextObservation: z.array(shortText).min(1).max(6),
  gameExperience: z.array(z.object({
    dimension: z.enum(["计划与意图", "材料使用", "角色与情节", "问题解决", "合作协商", "规则与自我调节", "表达与回顾"]),
    evidence: z.string().trim().min(1).max(1500),
    evidenceIds,
    possibleExperience: z.string().trim().min(1).max(1500),
    limitation: z.string().trim().min(1).max(1000),
  }).strict()).min(1).max(7),
  domainExperiences: z.array(z.object({
    domain: z.enum(["健康", "语言", "社会", "科学", "艺术"]),
    evidence: z.string().trim().max(1500),
    evidenceIds,
    possibleExperience: z.string().trim().min(1).max(1500),
    indicatorCodes: z.array(z.string().trim().min(1).max(100)).max(8),
    missingEvidence: z.string().trim().min(1).max(1000),
    noJudgment: z.boolean(),
  }).strict()).length(5),
  learningDispositions: z.array(z.object({
    dimension: z.enum(["好奇与探究", "主动性", "专注与坚持", "想象与创造", "合作", "反思与调整"]),
    evidence: z.string().trim().min(1).max(1500),
    evidenceIds,
    possibleExperience: z.string().trim().min(1).max(1500),
    confidence,
  }).strict()).max(6),
  learningPossibilities: z.array(shortText).min(1).max(6),
  gamePossibilities: z.array(shortText).min(1).max(6),
  responsePlans: z.array(responsePlanSchema).length(3),
  observationCut: z.array(shortText).min(1).max(2),
  observationFocus: z.array(shortText).min(2).max(5),
  historicalComparison: z.object({
    evidenceCount: z.number().int().min(0).max(20),
    timePointCount: z.number().int().min(0).max(20),
    changes: z.array(z.object({
      dimension: z.string().trim().min(1).max(120),
      content: shortText,
      previousEvidenceIds: z.array(z.string().trim().min(1).max(100)).min(1).max(8),
      currentEvidenceIds: z.array(z.string().trim().min(1).max(100)).min(1).max(5),
      confidence,
    }).strict()).max(8),
    stablePatterns: z.array(z.object({
      content: shortText,
      evidenceIds: z.array(z.string().trim().min(1).max(100)).min(2).max(10),
      confidence,
    }).strict()).max(6),
    caution: z.string().trim().min(1).max(1000),
  }).strict(),
  evidenceSufficiency: z.enum(["有限", "初步充分"]),
  warnings: z.array(shortText).min(1).max(8),
}).strict();

export type AnalysisResult = z.infer<typeof analysisResultSchema>;

export const observationDocumentExtractionSchema = z.object({
  observerName: z.string().trim().max(80).default(""),
  occurredAtText: z.string().trim().max(120).default(""),
  scene: z.string().trim().max(120).default(""),
  theme: z.string().trim().max(160).default(""),
  organizationStage: z.enum(["plan", "introduction", "process", "sharing", "evaluation"]).default("process"),
  subjects: z.array(z.object({
    displayName: z.string().trim().min(1).max(80),
    contextualFeature: z.string().trim().max(500).default(""),
    role: z.enum(["primary", "participant", "incidental"]).default("participant"),
  }).strict()).max(30).default([]),
  unlistedParticipantCount: z.number().int().min(0).max(99).default(0),
  groupContext: z.string().trim().max(2000).default(""),
  objectiveObservation: z.string().trim().max(12000).default(""),
  teacherIdentification: z.string().trim().max(6000).default(""),
  teacherResponseDraft: z.string().trim().max(4000).default(""),
  nextObservationFocus: z.string().trim().max(2000).default(""),
  fieldConfidence: z.record(z.number().min(0).max(1)),
  warnings: z.array(shortText).max(12).default([]),
}).strict();

export type ObservationDocumentExtraction = z.infer<typeof observationDocumentExtractionSchema>;

export interface ObservationDocumentExtractionInput {
  fileName: string;
  mimeType: string;
  rawText: string;
  classroomChildren: Array<{ id: string; displayName: string }>;
  mediaUrl?: string;
  prompt?: ResolvedAIPrompt;
}

export const curriculumActivityOptionSchema = z.object({
  title: z.string().trim().min(2).max(160),
  valuePoint: z.string().trim().min(2).max(1200),
  coreQuestion: z.string().trim().min(2).max(500),
  socialNatureSelf: z.object({
    社会: z.array(shortText).max(5),
    自然: z.array(shortText).max(5),
    自我: z.array(shortText).max(5),
  }).strict(),
  developmentLinks: z.array(shortText).min(1).max(8),
  mainActivities: z.array(shortText).min(2).max(8),
  materials: z.array(shortText).min(1).max(10),
  teacherSupport: z.array(shortText).min(1).max(8),
  observationFocus: z.array(shortText).min(1).max(6),
  riskNote: z.string().trim().min(1).max(1000),
}).strict();

export const curriculumActivityOptionsSchema = z.object({
  options: z.array(curriculumActivityOptionSchema).length(4),
}).strict();

export type CurriculumActivityOptions = z.infer<typeof curriculumActivityOptionsSchema>;

export const curriculumPlanContentSchema = z.object({
  themeOrigin: z.object({
    coreEmergencePoint: z.string().trim().min(2).max(2000),
    sourceDescription: z.string().trim().min(2).max(3000),
    evidenceReferences: z.array(z.string().uuid()).min(1).max(100),
  }).strict(),
  coreCompetencies: z.object({
    与自然同生: z.array(shortText).max(8),
    与生活同生: z.array(shortText).max(8),
    与自我同生: z.array(shortText).max(8),
    qualities: z.object({
      慧创生: z.array(shortText).max(6),
      懂生活: z.array(shortText).max(6),
      悦生长: z.array(shortText).max(6),
    }).strict(),
  }).strict(),
  generatedPossibilities: z.object({
    presetDirections: z.array(shortText).min(1).max(10),
    mindMap: z.array(z.object({ branch: shortText, activities: z.array(shortText).min(1).max(10) }).strict()).min(1).max(12),
    opennessNote: z.string().trim().min(1).max(1500),
  }).strict(),
  implementationFramework: z.object({
    teacherSupportAndQuestions: z.array(shortText).min(1).max(12),
    anticipatedChildActivities: z.array(shortText).min(1).max(12),
    environmentAndMaterials: z.array(shortText).min(1).max(12),
    experienceAndNewDirections: z.array(shortText).min(1).max(12),
  }).strict(),
  resources: z.object({
    environment: z.array(shortText).max(10),
    materials: z.array(shortText).max(12),
    familyPartnership: z.array(shortText).max(10),
    processActivities: z.array(shortText).max(10),
    sharedOutcomes: z.array(shortText).max(10),
  }).strict(),
  adjustmentBasis: z.array(shortText).min(1).max(8),
}).strict();

export type CurriculumPlanContent = z.infer<typeof curriculumPlanContentSchema>;

export const reportContentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  evidenceBoundary: z.string().trim().min(1).max(1000),
  observationCoverage: z.string().trim().min(1).max(1000),
  interests: z.array(shortText).max(8),
  evidencedGrowth: z.array(shortText).min(1).max(8),
  teacherSupport: z.array(shortText).max(8),
  pendingQuestions: z.array(shortText).max(8),
  nextPlan: z.array(shortText).max(8),
  familySuggestions: z.array(shortText).max(6),
  audience: z.enum(["teacher", "guardian"]),
}).strict();

export type ReportContent = z.infer<typeof reportContentSchema>;

const domainEvidenceSchema = z.object({
  健康: z.number().int().min(0),
  语言: z.number().int().min(0),
  社会: z.number().int().min(0),
  科学: z.number().int().min(0),
  艺术: z.number().int().min(0),
}).strict();

export const classroomReportContentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  evidenceBoundary: z.string().trim().min(1).max(1000),
  observationCoverage: z.string().trim().min(1).max(1000),
  observationCount: z.number().int().min(0),
  timePointCount: z.number().int().min(0),
  observedChildCount: z.number().int().min(0),
  totalChildCount: z.number().int().min(0),
  sceneCoverage: z.array(z.string().trim().min(1).max(120)).max(30),
  commonInterests: z.array(shortText).max(8),
  recurringQuestions: z.array(shortText).max(8),
  domainEvidence: domainEvidenceSchema,
  supportFollowUpRate: z.number().int().min(0).max(100),
  nextSuggestions: z.array(shortText).min(1).max(8),
  curriculumClues: z.array(z.object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    theme: z.string().trim().min(1).max(160),
    status: z.string().trim().min(1).max(80),
  }).strict()).max(20),
  audience: z.literal("classroom"),
}).strict();

export type ClassroomReportContent = z.infer<typeof classroomReportContentSchema>;

export const curriculumDraftSchema = z.object({
  title: z.string().trim().min(2).max(160),
  origin: z.string().trim().min(1).max(2000),
  inquiryQuestions: z.array(shortText).min(1).max(8),
  existingExperience: z.array(shortText).min(1).max(8),
  keyExperiences: z.array(shortText).min(1).max(8),
  materialsAndEnvironment: z.array(shortText).min(1).max(8),
  possiblePaths: z.array(shortText).min(1).max(8),
  observationFocus: z.array(shortText).min(1).max(8),
  familyAndCommunity: z.array(shortText).max(6),
  adjustmentBasis: z.array(shortText).min(1).max(6),
}).strict();

export type CurriculumDraft = z.infer<typeof curriculumDraftSchema>;

export interface ObservationAnalysisInput {
  observation: ObservationForAnalysis;
  child: { id: string; display_name: string; birth_month: string; guardian_consent_status?: string };
  classroom: { id: string; grade: string };
  knowledge: KnowledgeRow[];
  evidence: Array<{
    id: string;
    evidence_type: string;
    transcript?: string | null;
    event_segments?: unknown;
    mime_type?: string | null;
  }>;
  media: MediaForAnalysis[];
  history: HistoricalObservationEvidence[];
  professionalMemories?: ProfessionalMemoryForAnalysis[];
  analysisFrameworks?: AnalysisFrameworkForPrompt[];
  prompt?: ResolvedAIPrompt;
}

export interface ReportGenerationInput {
  reportType: "teacher" | "guardian";
  childName: string;
  periodStart: string;
  periodEnd: string;
  observations: Array<Record<string, any>>;
  analyses: Array<Record<string, any>>;
  supports: Array<Record<string, any>>;
  prompt?: ResolvedAIPrompt;
}

export interface ClassroomReportGenerationInput {
  classroomName: string;
  periodStart: string;
  periodEnd: string;
  observations: Array<Record<string, any>>;
  analyses: Array<Record<string, any>>;
  supports: Array<Record<string, any>>;
  metrics: Pick<ClassroomReportContent,
    | "observationCount"
    | "timePointCount"
    | "observedChildCount"
    | "totalChildCount"
    | "sceneCoverage"
    | "domainEvidence"
    | "supportFollowUpRate"
    | "curriculumClues"
  >;
  prompt?: ResolvedAIPrompt;
}

export interface ReportRevisionInput {
  reportType: "teacher" | "guardian" | "classroom";
  existingContent: ReportContent | ClassroomReportContent;
  instruction: string;
  prompt?: ResolvedAIPrompt;
}

export interface CurriculumGenerationInput {
  theme: string;
  scope?: "classroom_curriculum" | "individual_support";
  observationCount: number;
  childCount: number;
  timePointCount: number;
  observations: Array<Record<string, any>>;
  prompt?: ResolvedAIPrompt;
}

export interface CurriculumActivityOptionsInput extends CurriculumGenerationInput {
  evidenceObservationIds: string[];
  knowledge: KnowledgeRow[];
}

export interface CurriculumPlanGenerationInput extends CurriculumActivityOptionsInput {
  classroomName: string;
  implementationPeriod: string;
  templateStructure: Record<string, unknown>;
  selectedOptions: z.infer<typeof curriculumActivityOptionSchema>[];
}

export interface AnalysisRevisionInput {
  original: AnalysisResult;
  teacherFeedback: Array<{ section: string; decision: string; note: string; content?: string }>;
  prompt?: ResolvedAIPrompt;
}

export const interestClusterResultSchema = z.object({
  clusters: z.array(z.object({
    label: z.string().trim().min(1).max(120),
    aliases: z.array(z.string().trim().min(1).max(120)).max(12),
    observationIds: z.array(z.string().uuid()).min(1).max(100),
    rationale: z.string().trim().min(1).max(1000),
  }).strict()).max(30),
}).strict();

export type InterestClusterResult = z.infer<typeof interestClusterResultSchema>;

export interface InterestClusteringInput {
  observations: Array<{
    id: string;
    theme: string;
    scene: string;
    teacher_identification: string;
    teacher_response: Record<string, unknown>;
  }>;
  prompt?: ResolvedAIPrompt;
}

export interface AIGeneration<T> {
  data: T;
  provider: "QianwenAIProvider" | "ScenarioAIProvider";
  model: string;
  promptVersion: string;
  notice: string;
  mediaAnalyzed: boolean;
  fallbackReason?: string;
}

export interface AIAnalysisProvider {
  extractObservationDocument(input: ObservationDocumentExtractionInput): Promise<AIGeneration<ObservationDocumentExtraction>>;
  analyzeObservation(input: ObservationAnalysisInput): Promise<AIGeneration<AnalysisResult>>;
  reviseAnalysis(input: AnalysisRevisionInput): Promise<AIGeneration<AnalysisResult>>;
  generateReport(input: ReportGenerationInput): Promise<AIGeneration<ReportContent>>;
  generateClassroomReport(input: ClassroomReportGenerationInput): Promise<AIGeneration<ClassroomReportContent>>;
  reviseReport(input: ReportRevisionInput): Promise<AIGeneration<ReportContent | ClassroomReportContent>>;
  generateCurriculum(input: CurriculumGenerationInput): Promise<AIGeneration<CurriculumDraft>>;
  generateActivityOptions(input: CurriculumActivityOptionsInput): Promise<AIGeneration<CurriculumActivityOptions>>;
  generateCurriculumPlan(input: CurriculumPlanGenerationInput): Promise<AIGeneration<CurriculumPlanContent>>;
  clusterInterests(input: InterestClusteringInput): Promise<AIGeneration<InterestClusterResult>>;
}
