import Dexie, { type EntityTable } from "dexie";
import type {
  AIAnalysisRun, AnalysisClaim, AuditEvent, Child, ClassReport, Classroom,
  CurriculumClue, CurriculumPlan, EvidencePackage, ExportRequest, GamePlan,
  GrowthStatement, IndividualReport, KnowledgeCard, MediaEvidence,
  ObservationFocus, ObservationQualityReview, ObservationSubject,
  ResearchActivity, SupportAction, UserAccount,
} from "../domain/types";

export interface MetaRecord { key: string; value: string | number }

export class TongjiV3Database extends Dexie {
  classrooms!: EntityTable<Classroom, "id">;
  userAccounts!: EntityTable<UserAccount, "id">;
  children!: EntityTable<Child, "id">;
  gamePlans!: EntityTable<GamePlan, "id">;
  observationFocuses!: EntityTable<ObservationFocus, "id">;
  evidencePackages!: EntityTable<EvidencePackage, "id">;
  observationSubjects!: EntityTable<ObservationSubject, "id">;
  mediaEvidence!: EntityTable<MediaEvidence, "id">;
  analysisRuns!: EntityTable<AIAnalysisRun, "id">;
  claims!: EntityTable<AnalysisClaim, "id">;
  supportActions!: EntityTable<SupportAction, "id">;
  growthStatements!: EntityTable<GrowthStatement, "id">;
  individualReports!: EntityTable<IndividualReport, "id">;
  classReports!: EntityTable<ClassReport, "id">;
  curriculumClues!: EntityTable<CurriculumClue, "id">;
  curriculumPlans!: EntityTable<CurriculumPlan, "id">;
  knowledgeCards!: EntityTable<KnowledgeCard, "id">;
  qualityReviews!: EntityTable<ObservationQualityReview, "id">;
  exportRequests!: EntityTable<ExportRequest, "id">;
  researchActivities!: EntityTable<ResearchActivity, "id">;
  audits!: EntityTable<AuditEvent, "id">;
  meta!: EntityTable<MetaRecord, "key">;

  constructor() {
    super("tongji-v3-local");
    this.version(1).stores({
      classrooms: "id, tenantId, grade",
      userAccounts: "id, tenantId, role, status, *classroomIds",
      children: "id, tenantId, classroomId, grade, consentStatus, lastObservedAt",
      gamePlans: "id, tenantId, classroomId, scene, status",
      observationFocuses: "id, group",
      evidencePackages: "id, tenantId, classroomId, observedAt, scene, theme, status, *subjectIds",
      observationSubjects: "id, tenantId, evidencePackageId, childId, role",
      mediaEvidence: "id, tenantId, evidencePackageId, type, simulatedAnalysisStatus",
      analysisRuns: "id, tenantId, evidencePackageId, childId, status",
      claims: "id, analysisRunId, childId, layer, reviewStatus",
      supportActions: "id, tenantId, childId, sourcePackageId, status, category",
      growthStatements: "id, tenantId, childId, domain, level",
      individualReports: "id, tenantId, childId, classroomId, status",
      classReports: "id, tenantId, classroomId, status",
      curriculumClues: "id, tenantId, classroomId, status, theme",
      curriculumPlans: "id, tenantId, classroomId, clueId, status",
      knowledgeCards: "id, tenantId, code, domain, ageBand",
      qualityReviews: "id, tenantId, evidencePackageId, status",
      exportRequests: "id, tenantId, classroomId, status, exportType",
      researchActivities: "id, tenantId, status, scheduledAt",
      audits: "id, tenantId, actorRole, action, objectType, objectId, createdAt",
      meta: "key",
    });
  }
}

export const db = new TongjiV3Database();
