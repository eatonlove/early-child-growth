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

const shortText = z.string().trim().min(1).max(2000);
const confidence = z.number().min(0).max(1);

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
}

export interface ReportGenerationInput {
  reportType: "teacher" | "guardian";
  childName: string;
  periodStart: string;
  periodEnd: string;
  observations: Array<Record<string, any>>;
  analyses: Array<Record<string, any>>;
  supports: Array<Record<string, any>>;
}

export interface CurriculumGenerationInput {
  theme: string;
  observationCount: number;
  childCount: number;
  timePointCount: number;
  observations: Array<Record<string, any>>;
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
  analyzeObservation(input: ObservationAnalysisInput): Promise<AIGeneration<AnalysisResult>>;
  generateReport(input: ReportGenerationInput): Promise<AIGeneration<ReportContent>>;
  generateCurriculum(input: CurriculumGenerationInput): Promise<AIGeneration<CurriculumDraft>>;
  clusterInterests(input: InterestClusteringInput): Promise<AIGeneration<InterestClusterResult>>;
}
