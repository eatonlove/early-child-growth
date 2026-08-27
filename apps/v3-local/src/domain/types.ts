export type Role = "teacher" | "research_admin" | "principal_viewer";
export type Grade = "小班" | "中班" | "大班";
export type ClaimLayer = "事实" | "解释" | "假设";
export type ClaimReviewStatus = "待审核" | "已采用" | "修改后采用" | "已拒绝" | "待验证";
export type EvidencePackageStatus = "教师草稿" | "教师已提交" | "AI分析中" | "待对照审核" | "已整合" | "已归档";
export type SupportCategory = "经验支持" | "材料支持" | "活动支持";
export type SupportStatus = "待确认" | "待实施" | "已实施" | "待复察" | "已关联证据" | "有效" | "待继续验证";
export type GrowthLevel = "初现" | "发展中" | "较稳定" | "跨情境迁移";
export type PlanReviewStatus = "草稿" | "使用中" | "已完成" | "已归档";
export type ReportStatus = "草稿" | "教师已审核" | "已发布";
export type CurriculumStatus = "线索" | "草案" | "待教研确认" | "已确认" | "实施中" | "已复盘";
export type KnowledgeDomain = "健康" | "语言" | "社会" | "科学" | "艺术" | "课程";
export type KnowledgeKind = "指南年龄参照" | "理论原则" | "园本指标";
export type ObservationApplicability = "游戏直接观察" | "生活综合观察" | "健康档案与家园协同";
export type DevelopmentReferenceStatus = "已观察到相关表现" | "部分证据" | "待继续观察" | "本情境不适用";

export interface BaseEntity {
  id: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  version: number;
}

export interface Classroom extends BaseEntity {
  name: string;
  grade: Grade;
  semester: string;
  teacherNames: string[];
}

export interface UserAccount extends BaseEntity {
  name: string;
  role: Role;
  classroomIds: string[];
  status: "启用" | "已停用";
  disabledAt?: string;
  disabledReason?: string;
}

export interface Child extends BaseEntity {
  name: string;
  alias: string;
  initials: string;
  classroomId: string;
  classroomName: string;
  grade: Grade;
  birthMonth: string;
  consentStatus: "已授权" | "部分授权" | "未授权";
  color: string;
  interests: string[];
  lastObservedAt: string;
  observationCount: number;
}

export interface GamePlanGoal {
  id: string;
  domain: "健康" | "语言" | "社会" | "科学" | "艺术";
  statement: string;
  observationFocus: string;
}

export interface GamePlanStage {
  stage: "游戏计划" | "游戏导入" | "游戏过程" | "游戏分享" | "游戏评价";
  content: string;
}

export interface GamePlan extends BaseEntity {
  classroomId: string;
  title: string;
  scene: string;
  ageBand: string;
  rationale: string;
  goals: GamePlanGoal[];
  materials: string[];
  stages: GamePlanStage[];
  evaluationFocus: string[];
  reflection: string;
  status: PlanReviewStatus;
}

export interface ObservationFocus {
  id: string;
  name: string;
  group: "通用维度" | "专项观察";
  description: string;
  prompts: string[];
}

export interface VideoEvent {
  id: string;
  startSecond: number;
  endSecond: number;
  category: string;
  objectiveDescription: string;
  possibleMeaning: string;
  confidence: number;
}

export interface MediaEvidence extends BaseEntity {
  evidencePackageId: string;
  type: "照片" | "视频" | "作品" | "观察表文档";
  name: string;
  mimeType?: string;
  size?: number;
  blob?: Blob;
  transcript?: string;
  events?: VideoEvent[];
  simulatedAnalysisStatus?: "待分析" | "已分析";
}

export interface TeacherResponseDraft {
  category: SupportCategory;
  strategy: string;
  nextObservationFocus: string;
}

export interface ObservationSubject extends BaseEntity {
  evidencePackageId: string;
  childId: string;
  childName: string;
  role: "主要观察" | "关联观察";
  visualCue: string;
  teacherObservation: string;
  childQuote: string;
  teacherIdentification: string;
  teacherResponseDraft: TeacherResponseDraft;
}

export interface EvidencePackage extends BaseEntity {
  classroomId: string;
  title: string;
  observedAt: string;
  durationMinutes: number;
  scene: string;
  theme: string;
  observationFocusIds: string[];
  gamePlanId?: string;
  subjectIds: string[];
  mediaEvidenceIds: string[];
  teacherSubmittedAt?: string;
  status: EvidencePackageStatus;
  evidenceSufficiency: "不足" | "初步" | "中等" | "较充分";
}

export interface EvidenceAnchor {
  type: "教师白描" | "幼儿原话" | "视频片段" | "照片" | "观察表文档";
  referenceId: string;
  label: string;
  timestamp?: string;
}

export interface AnalysisClaim {
  id: string;
  analysisRunId: string;
  subjectId: string;
  childId: string;
  layer: ClaimLayer;
  content: string;
  evidenceAnchors: EvidenceAnchor[];
  indicatorCodes: string[];
  confidence: number;
  reviewStatus: ClaimReviewStatus;
  teacherRevision?: string;
}

export interface AnalysisComparison {
  agreement: string[];
  aiAdditions: string[];
  teacherOnly: string[];
  evidenceConflicts: string[];
}

export interface AIAnalysisRun extends BaseEntity {
  evidencePackageId: string;
  subjectId: string;
  childId: string;
  providerLabel: "模拟 AI";
  summary: string;
  currentExperience: string;
  interestsAndStrengths: string[];
  evidenceGaps: string[];
  responseSuggestions: Record<SupportCategory, string[]>;
  nextObservation: string[];
  planAlignment?: string;
  claimIds: string[];
  comparison: AnalysisComparison;
  knowledgeVersion: string;
  ageReference: string;
  developmentReferences: DevelopmentReference[];
  status: "模拟草稿" | "教师已整合";
}

export interface DevelopmentReference {
  indicatorCode: string;
  indicatorTitle: string;
  domain: Exclude<KnowledgeDomain, "课程">;
  grade: Grade;
  ageBand: string;
  status: DevelopmentReferenceStatus;
  evidenceStatement: string;
  missingEvidence: string;
}

export interface SupportAction extends BaseEntity {
  childId: string;
  childName: string;
  sourcePackageId: string;
  sourceAnalysisRunId?: string;
  category: SupportCategory;
  strategy: string;
  rationale: string;
  plannedAction: string;
  nextObservationFocus: string;
  plannedAt: string;
  implementedAt?: string;
  childResponse?: string;
  followUpPackageId?: string;
  effect?: "有支持证据" | "证据不足";
  status: SupportStatus;
}

export interface GrowthStatement extends BaseEntity {
  childId: string;
  domain: "健康" | "语言" | "社会" | "科学" | "艺术";
  title: string;
  statement: string;
  level: GrowthLevel;
  evidencePackageIds: string[];
  supportActionIds: string[];
}

export interface IndividualReport extends BaseEntity {
  childId: string;
  childName: string;
  classroomId: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  observationCoverage: string;
  interests: string[];
  evidencedGrowth: string[];
  supportAndEffect: string[];
  pendingQuestions: string[];
  nextPlan: string[];
  familySuggestions: string[];
  evidencePackageIds: string[];
  status: ReportStatus;
}

export interface ClassReport extends BaseEntity {
  classroomId: string;
  periodLabel: string;
  observedChildCount: number;
  totalChildCount: number;
  sceneCoverage: string[];
  commonInterests: string[];
  recurringQuestions: string[];
  domainEvidence: Record<"健康" | "语言" | "社会" | "科学" | "艺术", number>;
  supportFollowUpRate: number;
  nextSuggestions: string[];
  curriculumClueIds: string[];
  status: "草稿" | "教师已确认";
}

export interface CurriculumClue extends BaseEntity {
  classroomId: string;
  title: string;
  theme: string;
  childIds: string[];
  evidencePackageIds: string[];
  timePointCount: number;
  origin: string;
  evidenceSummary: string;
  thresholdMet: boolean;
  status: "新线索" | "已采用" | "继续观察";
}

export interface CurriculumPlan extends BaseEntity {
  classroomId: string;
  clueId: string;
  title: string;
  origin: string;
  existingExperience: string[];
  inquiryQuestions: string[];
  keyExperience: string[];
  environmentAndMaterials: string[];
  possiblePathways: string[];
  observationFocus: string[];
  adjustmentBasis: string;
  evidencePackageIds: string[];
  planVersion: number;
  status: CurriculumStatus;
}

export interface KnowledgeCard extends BaseEntity {
  code: string;
  kind: KnowledgeKind;
  source: string;
  sourceVersion: string;
  sourceUrl?: string;
  domain: KnowledgeDomain;
  subdomain: string;
  goalNumber: number;
  grade: Grade | "跨年龄";
  ageBand: string;
  title: string;
  officialExpectations: string[];
  observableBehaviors: string[];
  applicability: ObservationApplicability;
  evidenceRequirements: string[];
  assessmentGuidance: string[];
  misunderstandingWarning: string;
  supportSuggestions: string[];
  responseStrategies: Record<SupportCategory, string[]>;
  nextObservationPrompts: string[];
  keywords: string[];
}

export interface ObservationQualityReview extends BaseEntity {
  evidencePackageId: string;
  reviewerName: string;
  factuality: number;
  specificity: number;
  chronology: number;
  evidenceAlignment: number;
  subjectivePhrases: string[];
  comment: string;
  status: "待审核" | "通过" | "退回修改";
}

export interface ExportRequest extends BaseEntity {
  applicantName: string;
  classroomId: string;
  exportType: "个体报告" | "班级报告" | "课程案例" | "匿名研究数据";
  objectId: string;
  purpose: string;
  recipient: string;
  status: "待审批" | "已通过" | "已拒绝";
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
}

export interface ResearchGroupSubmission {
  id: string;
  groupName: string;
  observation: string;
  identification: string;
  response: string;
  focus: string;
}

export interface ResearchActivity extends BaseEntity {
  title: string;
  scheduledAt: string;
  facilitator: string;
  sharedVideoTitle: string;
  focusOptions: string[];
  groupSubmissions: ResearchGroupSubmission[];
  aiComparison: string[];
  status: "准备中" | "进行中" | "已完成";
}

export interface AuditEvent extends BaseEntity {
  actorRole: Role | "system";
  action: string;
  objectType: string;
  objectId: string;
  detail: string;
}

export interface DemoSnapshot {
  classrooms: Classroom[];
  userAccounts: UserAccount[];
  children: Child[];
  gamePlans: GamePlan[];
  observationFocuses: ObservationFocus[];
  evidencePackages: EvidencePackage[];
  observationSubjects: ObservationSubject[];
  mediaEvidence: MediaEvidence[];
  analysisRuns: AIAnalysisRun[];
  claims: AnalysisClaim[];
  supportActions: SupportAction[];
  growthStatements: GrowthStatement[];
  individualReports: IndividualReport[];
  classReports: ClassReport[];
  curriculumClues: CurriculumClue[];
  curriculumPlans: CurriculumPlan[];
  knowledgeCards: KnowledgeCard[];
  qualityReviews: ObservationQualityReview[];
  exportRequests: ExportRequest[];
  researchActivities: ResearchActivity[];
  audits: AuditEvent[];
}

export interface NewEvidencePackageInput {
  childIds: string[];
  title: string;
  observedAt: string;
  durationMinutes: number;
  scene: string;
  theme: string;
  observationFocusIds: string[];
  gamePlanId?: string;
  teacherObservation: string;
  childQuote: string;
  teacherIdentification: string;
  responseCategory: SupportCategory;
  responseStrategy: string;
  nextObservationFocus: string;
  files: File[];
}

export interface ChildImportRow {
  name: string;
  alias: string;
  birthMonth: string;
  classroomName: string;
  grade: Grade;
  consentStatus: "已授权" | "部分授权" | "未授权";
}
