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
}

export interface RemoteEvidence {
  id: string;
  evidence_type: "photo" | "video" | "document" | "work" | "quote";
  file_name?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  upload_status: "pending" | "ready" | "failed";
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

export interface RemoteQualityReview {
  id: string;
  observation_id: string;
  factuality: number;
  specificity: number;
  chronology: number;
  evidence_alignment: number;
  subjective_phrases: string[];
  comment: string;
  status: "pending" | "passed" | "revision_requested";
  reviewed_at?: string | null;
  updated_at: string;
}

export interface RemoteQualityQueueItem {
  observation: RemoteObservation;
  childName: string;
  review: RemoteQualityReview | null;
}

export interface RemoteExportRequest {
  id: string;
  classroom_id?: string | null;
  requested_by: string;
  export_type:
    | "individual_report"
    | "classroom_report"
    | "curriculum_case"
    | "anonymized_research";
  resource_type: string;
  resource_id: string;
  purpose: string;
  recipient: string;
  anonymized: boolean;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decision_note?: string | null;
  created_at: string;
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

export interface RemotePeriodReport {
  id: string;
  classroom_id: string;
  child_id: string;
  report_type: "teacher" | "guardian" | "classroom";
  period_start: string;
  period_end: string;
  content: {
    title: string;
    evidenceBoundary: string;
    observationCoverage: string;
    interests: string[];
    evidencedGrowth: string[];
    teacherSupport: string[];
    pendingQuestions: string[];
    nextPlan: string[];
    familySuggestions: string[];
    audience: string;
    aiMeta?: {
      provider: string;
      model: string;
      promptVersion: string;
      fallbackUsed: boolean;
    };
  };
  evidence_observation_ids: string[];
  status: "draft" | "reviewed" | "published" | "withdrawn";
  created_at: string;
}

export interface RemoteCurriculumClue {
  id: string;
  classroom_id: string;
  title: string;
  theme: string;
  origin: string;
  inquiry_questions: string[];
  plan: Record<string, unknown> & {
    version?: number;
    existingExperience?: string[];
    aiMeta?: {
      provider?: string;
      model?: string;
      promptVersion?: string;
      fallbackUsed?: boolean;
    };
  };
  child_ids: string[];
  evidence_observation_ids: string[];
  time_point_count: number;
  threshold_met: boolean;
  status: "clue" | "draft" | "reviewed" | "active" | "reflected" | "archived";
  updated_at: string;
}
