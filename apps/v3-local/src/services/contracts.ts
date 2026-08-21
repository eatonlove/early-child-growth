import type {
  AIAnalysisRun, AnalysisClaim, Child, DemoSnapshot, EvidencePackage, KnowledgeCard, MediaEvidence,
  NewEvidencePackageInput, ObservationSubject, Role,
} from "../domain/types";

export interface EvidenceRepository {
  initialize(): Promise<void>;
  snapshot(): Promise<DemoSnapshot>;
  reset(): Promise<void>;
  createEvidencePackage(input: NewEvidencePackageInput): Promise<EvidencePackage>;
}

export interface AIAnalysisResult {
  runs: AIAnalysisRun[];
  claims: AnalysisClaim[];
}

export interface AIAnalysisContext {
  children: Child[];
  knowledgeCards: KnowledgeCard[];
}

export interface AIAnalysisProvider {
  analyze(evidencePackage: EvidencePackage, subjects: ObservationSubject[], media: MediaEvidence[], context?: AIAnalysisContext): Promise<AIAnalysisResult>;
}

export interface MediaStorage {
  save(file: File, evidencePackageId: string): Promise<MediaEvidence>;
  get(id: string): Promise<Blob | undefined>;
  remove(id: string): Promise<void>;
}

export interface AuthSession { role: Role; actorId: string; actorName: string }
export interface AuthProvider { getSession(role: Role): Promise<AuthSession> }
