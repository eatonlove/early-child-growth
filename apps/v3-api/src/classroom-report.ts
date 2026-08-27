import { reportEvidenceCoverage } from "./report-evidence.js";

export const classroomReportDomains = ["健康", "语言", "社会", "科学", "艺术"] as const;
export type ClassroomReportDomain = (typeof classroomReportDomains)[number];

interface ClassroomObservation {
  id: string;
  child_id: string;
  participant_child_ids?: string[];
  occurred_at: string;
  scene: string;
}

interface ClassroomAnalysis {
  observation_id: string;
  structured_result?: {
    developmentReferences?: Array<{ domain?: string }>;
  } | null;
}

interface ClassroomSupport {
  status: string;
}

interface CurriculumClueSummary {
  id: string;
  title: string;
  theme: string;
  status: string;
}

export function classroomReportEvidenceCoverage(observations: ClassroomObservation[]) {
  const periodCoverage = reportEvidenceCoverage(observations);
  const childCount = new Set(observations.flatMap((item) => item.participant_child_ids?.length ? item.participant_child_ids : [item.child_id])).size;
  return {
    ...periodCoverage,
    childCount,
    eligible: periodCoverage.eligible && childCount >= 2,
  };
}

export function classroomReportMetrics(input: {
  observations: ClassroomObservation[];
  analyses: ClassroomAnalysis[];
  supports: ClassroomSupport[];
  totalChildCount: number;
  curriculumClues: CurriculumClueSummary[];
}) {
  const coverage = classroomReportEvidenceCoverage(input.observations);
  const observationIds = new Set(input.observations.map((item) => item.id));
  const domainEvidence = Object.fromEntries(classroomReportDomains.map((domain) => [domain, 0])) as Record<ClassroomReportDomain, number>;

  input.analyses.forEach((analysis) => {
    if (!observationIds.has(analysis.observation_id)) return;
    const domains = new Set(
      (analysis.structured_result?.developmentReferences ?? [])
        .map((item) => item.domain)
        .filter((domain): domain is ClassroomReportDomain => classroomReportDomains.includes(domain as ClassroomReportDomain)),
    );
    domains.forEach((domain) => { domainEvidence[domain] += 1; });
  });

  const followedSupports = input.supports.filter((item) => ["verified", "closed"].includes(item.status)).length;
  return {
    observationCount: coverage.observationCount,
    timePointCount: coverage.timePointCount,
    observedChildCount: coverage.childCount,
    totalChildCount: input.totalChildCount,
    sceneCoverage: [...new Set(input.observations.map((item) => item.scene).filter(Boolean))],
    domainEvidence,
    supportFollowUpRate: input.supports.length ? Math.round((followedSupports / input.supports.length) * 100) : 0,
    curriculumClues: input.curriculumClues,
  };
}
