export type RemoteRole = "teacher" | "researcher";
export type GradeCode = "small" | "middle" | "large";

export interface RemoteUser {
  id: string;
  tenantId: string;
  username: string;
  displayName: string;
  role: RemoteRole;
  tenantName: string;
}

export interface RemoteObserver {
  userId: string;
  displayName: string;
  role: RemoteRole;
}

export interface RemoteClassroom {
  id: string;
  name: string;
  grade: GradeCode;
  academic_year: string;
  semester: string;
  status: "active" | "archived";
}

export interface RemoteChild {
  id: string;
  classroom_id: string;
  internal_code: string;
  display_name: string;
  birth_month: string;
  enrolled_on?: string | null;
  guardian_consent_status: "granted" | "partial" | "pending" | "withdrawn";
  interests: string[];
  status: "active" | "archived";
}

export interface TeacherResponse {
  category: "experience" | "material" | "activity";
  strategy: string;
  nextObservationFocus: string;
}

export interface RemoteObservation {
  id: string;
  classroom_id: string;
  child_id: string;
  source_type?: "web" | "document_import";
  source_import_id?: string | null;
  observer_ids?: string[];
  observer_name_snapshot?: string;
  group_context?: string | null;
  unlisted_participant_count?: number;
  title: string;
  occurred_at: string;
  duration_minutes?: number | null;
  scene: string;
  theme: string;
  organization_stage:
    "plan" | "introduction" | "process" | "sharing" | "evaluation";
  observation_focus: string[];
  teacher_observation: string;
  child_quote?: string | null;
  teacher_identification: string;
  teacher_response: TeacherResponse;
  status:
    "draft" | "submitted" | "ai_ready" | "adopted" | "abandoned" | "archived";
  created_at: string;
}

export interface AnalysisResult {
  objectiveSummary: string;
  facts: Array<{ content: string; evidence: string; evidenceIds?: string[]; confidence: number }>;
  interpretations: Array<{
    content: string;
    indicatorCode: string;
    evidenceIds?: string[];
    limitation?: string;
    confidence: number;
  }>;
  hypotheses: Array<{ content: string; nextObservation?: string; confidence: number }>;
  teacherComparison: {
    teacherIdentification: string;
    teacherResponse: TeacherResponse;
    aiAddition: string;
  };
  currentExperience: string;
  interestsAndStrengths: string[];
  evidenceGaps: string[];
  developmentReferences: Array<{
    indicatorCode: string;
    title: string;
    domain: string;
    ageBand: string;
    status: string;
    evidenceStatement: string;
    missingEvidence: string;
  }>;
  responseSuggestions: {
    experience: string[];
    material: string[];
    activity: string[];
  };
  nextObservation: string[];
  gameExperience: Array<{
    dimension: "计划与意图" | "材料使用" | "角色与情节" | "问题解决" | "合作协商" | "规则与自我调节" | "表达与回顾";
    evidence: string;
    evidenceIds: string[];
    possibleExperience: string;
    limitation: string;
  }>;
  domainExperiences: Array<{
    domain: "健康" | "语言" | "社会" | "科学" | "艺术";
    evidence: string;
    evidenceIds: string[];
    possibleExperience: string;
    indicatorCodes: string[];
    missingEvidence: string;
    noJudgment: boolean;
  }>;
  learningDispositions: Array<{
    dimension: "好奇与探究" | "主动性" | "专注与坚持" | "想象与创造" | "合作" | "反思与调整";
    evidence: string;
    evidenceIds: string[];
    possibleExperience: string;
    confidence: number;
  }>;
  learningPossibilities: string[];
  gamePossibilities: string[];
  responsePlans: ResponsePlanContent[];
  observationCut: string[];
  observationFocus: string[];
  historicalComparison: {
    evidenceCount: number;
    timePointCount: number;
    changes: Array<{
      dimension: string;
      content: string;
      previousEvidenceIds: string[];
      currentEvidenceIds: string[];
      confidence: number;
    }>;
    stablePatterns: Array<{ content: string; evidenceIds: string[]; confidence: number }>;
    caution: string;
  };
  externalSupportReferences: Array<{
    title: string;
    url: string;
    source: string;
    appliedSuggestion: string;
  }>;
  evidenceSufficiency: string;
  warnings: string[];
}

export interface RemoteAnalysis {
  id: string;
  observation_id: string;
  provider: string;
  model: string;
  knowledge_version: string;
  structured_result: AnalysisResult;
  decision: "pending" | "adopted" | "abandoned";
  decision_note?: string | null;
  generated_at: string;
  child_id: string;
  claim_reviews: RemoteAnalysisClaimReview[];
}

export type AnalysisClaimDecision = "pending" | "adopted" | "modified" | "rejected" | "to_verify";

export interface RemoteAnalysisClaimReview {
  id?: string | null;
  analysis_run_id: string;
  claim_key: string;
  claim_type:
    | "objective_summary" | "fact" | "interpretation" | "hypothesis"
    | "current_experience" | "interest_strength" | "evidence_gap"
    | "development_reference" | "response_suggestion" | "next_observation"
    | "historical_change" | "game_experience" | "domain_experience"
    | "learning_disposition" | "learning_possibility" | "game_possibility"
    | "response_plan" | "observation_cut" | "observation_focus";
  original_content: Record<string, unknown>;
  reviewed_content?: Record<string, unknown> | null;
  decision: AnalysisClaimDecision;
  review_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

export interface RemoteEvidence {
  id: string;
  evidence_type: "photo" | "video" | "document" | "work" | "quote";
  file_name?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  upload_status: "pending" | "ready" | "failed";
  original_size_bytes?: number | null;
  optimized_size_bytes?: number | null;
  optimization_status?: "pending" | "optimized" | "not_applicable" | "failed" | "legacy";
  optimization_mode?: "lossless" | "none" | null;
  optimization_tool?: string | null;
  optimization_error?: string | null;
}

export interface RemoteAnalysisJob {
  id: string;
  observation_id: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  stage:
    | "queued"
    | "preparing"
    | "context_ready"
    | "analyzing_subject"
    | "saving_subject"
    | "completed"
    | "failed";
  progress: number;
  analysis_run_ids: string[];
  ai_notice?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  requested_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  heartbeat_at?: string | null;
}

export interface RemoteObservationSubject {
  id: string;
  observation_id: string;
  child_id: string;
  display_name: string;
  role: "primary" | "participant" | "incidental";
  contextual_feature?: string | null;
  evidence_anchors: string[];
}

export interface ResponsePlanContent {
  title: string;
  rationale: string;
  targetExperience: string[];
  activitySupport: { activityName: string; timing: string; objective: string; steps: string[]; teacherRole: string; suggestedDuration: string };
  materialSupport: { materials: Array<{ name: string; quantity: string; variable: string }>; placement: string; purpose: string; safetyNotes: string[] };
  experienceSupport: { suggestedQuestions: string[]; participationMode: string; demonstration: string; withdrawalCondition: string };
  observationCut: string;
  observationFocus: string[];
  adjustmentCondition: string;
  evidenceIds: string[];
}

export interface RemoteResponsePlan {
  id: string;
  child_id: string;
  observation_id: string;
  analysis_run_id: string;
  title: string;
  rationale: string;
  target_experience: string[];
  activity_support: ResponsePlanContent["activitySupport"];
  material_support: ResponsePlanContent["materialSupport"];
  experience_support: ResponsePlanContent["experienceSupport"];
  observation_cut: string;
  observation_focus: string[];
  adjustment_condition: string;
  status: "suggested" | "selected" | "planned" | "implemented" | "follow_up" | "verified" | "closed" | "rejected";
}

export interface RemoteObservationImport {
  id: string;
  classroom_id: string;
  source_file_name: string;
  source_mime_type: string;
  status: "pending_upload" | "extracting" | "needs_review" | "confirmed" | "failed";
  extracted_fields: {
    observerName?: string;
    occurredAtText?: string;
    scene?: string;
    theme?: string;
    organizationStage?: RemoteObservation["organization_stage"];
    subjects?: Array<{ displayName: string; contextualFeature: string; role: RemoteObservationSubject["role"] }>;
    unlistedParticipantCount?: number;
    groupContext?: string;
    objectiveObservation?: string;
    teacherIdentification?: string;
    teacherResponseDraft?: string;
    nextObservationFocus?: string;
    fieldConfidence?: Record<string, number>;
    warnings?: string[];
  };
  field_confidence: Record<string, number>;
  matched_child_ids: string[];
  failure_reason?: string | null;
  observation_id?: string | null;
  created_at: string;
}

export interface RemoteAccount {
  user_id: string;
  username: string;
  display_name: string;
  role: RemoteRole;
  status: "active" | "disabled";
  classroom_ids: string[];
  last_login_at?: string | null;
  disabled_reason?: string | null;
}

export type RemoteAIPromptKey =
  | "observation_document_extraction"
  | "observation_analysis"
  | "analysis_revision"
  | "individual_period_report"
  | "classroom_period_report"
  | "report_revision"
  | "curriculum_interest_clustering"
  | "curriculum_draft"
  | "curriculum_activity_options"
  | "curriculum_plan";

export interface RemoteAIPrompt {
  key: RemoteAIPromptKey;
  name: string;
  category: string;
  description: string;
  defaultVersion: string;
  effectiveVersion: string;
  source: "default" | "custom";
  revision: number;
  defaultPrompt: string;
  customPrompt: string | null;
  effectivePrompt: string;
  basePromptVersion: string;
  baseVersionOutdated: boolean;
  changeNote: string;
  updatedAt: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
}

export interface RemoteKnowledgeCard {
  id: string;
  code: string;
  domain: string;
  subdomain: string;
  title: string;
  grade: GradeCode | null;
  age_band: string;
  source: string;
  source_version: string;
  official_expectations: string[];
  observable_behaviors: string[];
  evidence_requirements: string[];
  assessment_guidance: string[];
  misunderstanding_warning: string;
  response_strategies: Record<string, string[]>;
  next_observation_prompts: string[];
}

export interface RemoteObservationTemplate {
  id: string;
  code: string;
  name: string;
  grade: GradeCode | null;
  scenes: string[];
  focus_options: string[];
  fields: string[];
  version: number;
}

export interface RemoteDocumentExport {
  id: string;
  export_request_id: string;
  document_type: "observation_teacher" | "observation_professional" | "curriculum_plan";
  file_name?: string | null;
  status: "preview" | "pending_approval" | "ready" | "expired" | "failed";
}

export interface RemoteResearchEntry {
  id: string;
  activity_id: string;
  group_name: string;
  objective_observation: string;
  identification: string;
  response_strategy: string;
  created_by: string;
  updated_at: string;
}

export interface RemoteResearchActivity {
  id: string;
  classroom_id?: string | null;
  observation_id?: string | null;
  title: string;
  scheduled_at: string;
  shared_evidence_title: string;
  focus_options: string[];
  comparison_summary: string;
  follow_up_questions: string[];
  status: "preparing" | "in_progress" | "completed" | "archived";
  entries: RemoteResearchEntry[];
}

export interface RemoteSupportAction {
  id: string;
  child_id: string;
  observation_id: string;
  category: "experience" | "material" | "activity";
  rationale: string;
  strategy: string;
  next_observation_focus: string;
  planned_for?: string | null;
  implemented_at?: string | null;
  child_response?: string | null;
  effectiveness?: "supported" | "insufficient" | "continue" | null;
  status: "planned" | "implemented" | "follow_up" | "verified" | "closed";
  created_at: string;
}

export interface RemoteGrowthTimelineItem {
  observation: RemoteObservation;
  analysis: RemoteAnalysis | null;
  supports: RemoteSupportAction[];
}

export interface RemoteGrowthResult {
  child: RemoteChild;
  timeline: RemoteGrowthTimelineItem[];
  coverage: {
    observations: number;
    scenes: string[];
    themes: string[];
    verifiedSupports: number;
  };
}

interface RemoteReportAiMeta {
  provider: string;
  model: string;
  promptVersion: string;
  fallbackUsed: boolean;
}

export interface RemoteIndividualReportContent {
  title: string;
  evidenceBoundary: string;
  observationCoverage: string;
  interests: string[];
  evidencedGrowth: string[];
  teacherSupport: string[];
  pendingQuestions: string[];
  nextPlan: string[];
  familySuggestions: string[];
  audience: "teacher" | "guardian";
  aiMeta?: RemoteReportAiMeta;
}

export interface RemoteClassroomReportContent {
  title: string;
  evidenceBoundary: string;
  observationCoverage: string;
  observationCount: number;
  timePointCount: number;
  observedChildCount: number;
  totalChildCount: number;
  sceneCoverage: string[];
  commonInterests: string[];
  recurringQuestions: string[];
  domainEvidence: Record<"健康" | "语言" | "社会" | "科学" | "艺术", number>;
  supportFollowUpRate: number;
  nextSuggestions: string[];
  curriculumClues: Array<{ id: string; title: string; theme: string; status: string }>;
  audience: "classroom";
  aiMeta?: RemoteReportAiMeta;
}

interface RemotePeriodReportBase {
  id: string;
  classroom_id: string;
  period_start: string;
  period_end: string;
  evidence_observation_ids: string[];
  status: "draft" | "reviewed" | "published" | "withdrawn";
  created_at: string;
}

export type RemotePeriodReport = RemotePeriodReportBase & (
  | {
    child_id: string;
    report_type: "teacher" | "guardian";
    content: RemoteIndividualReportContent;
  }
  | {
    child_id: null;
    report_type: "classroom";
    content: RemoteClassroomReportContent;
  }
);

export interface RemoteCurriculumClue {
  id: string;
  classroom_id: string;
  title: string;
  theme: string;
  origin: string;
  inquiry_questions: string[];
  plan: Record<string, unknown> & {
    version?: number;
    scope?: "classroom_curriculum" | "individual_support";
    existingExperience?: string[];
    aiMeta?: {
      provider?: string;
      model?: string;
      promptVersion?: string;
      fallbackUsed?: boolean;
    };
    semanticCluster?: {
      label: string;
      aliases: string[];
      rationale: string;
      provider: string;
      model: string;
      promptVersion: string;
      fallbackUsed: boolean;
    };
  };
  child_ids: string[];
  evidence_observation_ids: string[];
  time_point_count: number;
  threshold_met: boolean;
  status: "clue" | "draft" | "reviewed" | "active" | "reflected" | "archived";
  updated_at: string;
}

export interface RemoteCurriculumTemplate {
  id: string;
  code: string;
  name: string;
  version: number;
  description: string;
  structure: Record<string, unknown>;
  is_default: boolean;
  status?: "active" | "archived";
  created_at?: string;
}

export interface RemoteProfessionalMemory {
  id: string;
  memory_type:
    | "teacher_feedback"
    | "response_effect"
    | "approved_case"
    | "curriculum_reflection"
    | "school_knowledge";
  source_resource_type: string;
  source_resource_id: string;
  title: string;
  summary: string;
  retrieval_text: string;
  applicability: Record<string, unknown>;
  evidence_refs: Array<Record<string, unknown>>;
  quality_score: number;
  status: "pending" | "active" | "disabled";
  created_at: string;
  approved_at?: string | null;
}

export interface RemoteCurriculumResourceAsset {
  id: string;
  package_id: string;
  asset_type: "plan" | "materials" | "booklet" | "supplement";
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

export interface RemoteCurriculumResourcePackage {
  id: string;
  title: string;
  summary: string;
  applicable_grades: GradeCode[];
  themes: string[];
  status: "draft" | "pending" | "active" | "rejected" | "disabled";
  review_comment?: string | null;
  creator_name: string;
  created_by: string;
  created_at: string;
  reviewed_at?: string | null;
  assets: RemoteCurriculumResourceAsset[];
}

export interface RemoteAnalysisFramework {
  id: string;
  framework_type: "game_experience" | "learning_disposition";
  code: string;
  name: string;
  version: number;
  description: string;
  dimensions: Array<{ label: string; evidenceReminder: string }>;
  is_default: boolean;
  status: "draft" | "active" | "archived";
  created_at: string;
}

export interface RemoteCurriculumOption {
  id: string;
  title: string;
  value_point: string;
  evidence_observation_ids: string[];
  core_question: string;
  social_nature_self: Record<"社会" | "自然" | "自我", string[]>;
  development_links: string[];
  main_activities: string[];
  materials: string[];
  teacher_support: string[];
  observation_focus: string[];
  risk_note: string;
  status: "suggested" | "selected" | "rejected";
}

export interface RemoteCurriculumPlan {
  id: string;
  curriculum_clue_id: string;
  title: string;
  implementation_period: string;
  core_inquiry_clue: string;
  content: Record<string, unknown>;
  version: number;
  status: "draft" | "reviewed" | "active" | "reflected" | "archived";
}

export interface RemoteCurriculumCycle {
  id: string;
  curriculum_plan_id: string;
  cycle_number: number;
  zone: "starting" | "focusing" | "inquiring" | "resolving";
  seven_steps: Record<string, string>;
  generated_experience: string[];
  new_questions: string[];
  reflection?: string | null;
  status: "active" | "completed";
}

export interface RemoteCurriculumWorkspace {
  item: RemoteCurriculumClue;
  options: RemoteCurriculumOption[];
  plans: RemoteCurriculumPlan[];
  cycles: RemoteCurriculumCycle[];
}
