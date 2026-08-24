import type { AnalysisResult } from "./ai/contracts.js";

export const claimDecisions = ["pending", "adopted", "modified", "rejected", "to_verify"] as const;
export type ClaimDecision = (typeof claimDecisions)[number];

export interface AnalysisClaimDefinition {
  claimKey: string;
  claimType:
    | "objective_summary"
    | "fact"
    | "interpretation"
    | "hypothesis"
    | "current_experience"
    | "interest_strength"
    | "evidence_gap"
    | "development_reference"
    | "response_suggestion"
    | "next_observation"
    | "historical_change";
  originalContent: Record<string, unknown>;
}

export interface AnalysisClaimReviewRow {
  claim_key: string;
  claim_type: AnalysisClaimDefinition["claimType"];
  original_content: Record<string, unknown>;
  reviewed_content?: Record<string, unknown> | null;
  decision: ClaimDecision;
  review_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

const textClaim = (content: string, extra: Record<string, unknown> = {}) => ({ content, ...extra });

export function flattenAnalysisClaims(result: AnalysisResult): AnalysisClaimDefinition[] {
  const historical = result.historicalComparison ?? { evidenceCount: 0, timePointCount: 0, changes: [], stablePatterns: [], caution: "旧版分析未生成跨时间比较。" };
  const factEvidenceIds = [...new Set(result.facts.flatMap((item) => item.evidenceIds ?? []))];
  const interpretationEvidenceIds = [...new Set(result.interpretations.flatMap((item) => item.evidenceIds ?? []))];
  const generalEvidenceIds = [...new Set([...factEvidenceIds, ...interpretationEvidenceIds])];
  const claims: AnalysisClaimDefinition[] = [{
    claimKey: "objective-summary",
    claimType: "objective_summary",
    originalContent: textClaim(result.objectiveSummary, { evidenceIds: factEvidenceIds }),
  }];
  result.facts.forEach((item, index) => claims.push({ claimKey: `fact:${index}`, claimType: "fact", originalContent: item }));
  result.interpretations.forEach((item, index) => claims.push({ claimKey: `interpretation:${index}`, claimType: "interpretation", originalContent: item }));
  result.hypotheses.forEach((item, index) => claims.push({ claimKey: `hypothesis:${index}`, claimType: "hypothesis", originalContent: { ...item, evidenceIds: factEvidenceIds } }));
  if (result.teacherComparison?.aiAddition) claims.push({ claimKey: "teacher-ai-addition", claimType: "interpretation", originalContent: textClaim(result.teacherComparison.aiAddition, { evidenceIds: generalEvidenceIds }) });
  claims.push({ claimKey: "current-experience", claimType: "current_experience", originalContent: textClaim(result.currentExperience, { evidenceIds: generalEvidenceIds }) });
  result.interestsAndStrengths.forEach((content, index) => claims.push({ claimKey: `interest:${index}`, claimType: "interest_strength", originalContent: textClaim(content, { evidenceIds: generalEvidenceIds }) }));
  result.evidenceGaps.forEach((content, index) => claims.push({ claimKey: `evidence-gap:${index}`, claimType: "evidence_gap", originalContent: textClaim(content, { evidenceIds: generalEvidenceIds }) }));
  result.developmentReferences.forEach((item, index) => {
    const evidenceIds = result.interpretations.filter((candidate) => candidate.indicatorCode === item.indicatorCode).flatMap((candidate) => candidate.evidenceIds ?? []);
    claims.push({ claimKey: `development:${index}`, claimType: "development_reference", originalContent: { ...item, content: item.evidenceStatement, evidenceIds } });
  });
  for (const category of ["experience", "material", "activity"] as const) {
    result.responseSuggestions[category].forEach((content, index) => claims.push({
      claimKey: `response:${category}:${index}`,
      claimType: "response_suggestion",
      originalContent: textClaim(content, { category, evidenceIds: generalEvidenceIds }),
    }));
  }
  result.nextObservation.forEach((content, index) => claims.push({ claimKey: `next-observation:${index}`, claimType: "next_observation", originalContent: textClaim(content, { evidenceIds: generalEvidenceIds }) }));
  historical.changes.forEach((item, index) => claims.push({ claimKey: `historical-change:${index}`, claimType: "historical_change", originalContent: item }));
  historical.stablePatterns.forEach((item, index) => claims.push({ claimKey: `historical-pattern:${index}`, claimType: "historical_change", originalContent: { ...item, pattern: true } }));
  return claims;
}

export function legacyClaimDecision(analysisDecision: string): ClaimDecision {
  if (analysisDecision === "adopted") return "adopted";
  if (analysisDecision === "abandoned") return "rejected";
  return "pending";
}

export function effectiveAnalysisResult(result: AnalysisResult, reviews: AnalysisClaimReviewRow[]) {
  if (!reviews.length) return result;
  const accepted = reviews.filter((item) => item.decision === "adopted" || item.decision === "modified");
  const contentFor = (review: AnalysisClaimReviewRow) => review.reviewed_content ?? review.original_content;
  const byType = (type: AnalysisClaimDefinition["claimType"]) => accepted.filter((item) => item.claim_type === type).map(contentFor);
  const text = (value: Record<string, unknown>) => String(value.content ?? "").trim();
  const responses = { experience: [] as string[], material: [] as string[], activity: [] as string[] };
  byType("response_suggestion").forEach((item) => {
    const category = item.category;
    if (category === "experience" || category === "material" || category === "activity") responses[category].push(text(item));
  });
  const history = byType("historical_change");
  return {
    ...result,
    objectiveSummary: text(byType("objective_summary")[0] ?? {}) || "教师未将AI摘要纳入正式结论。",
    facts: byType("fact"),
    interpretations: byType("interpretation"),
    hypotheses: byType("hypothesis"),
    currentExperience: text(byType("current_experience")[0] ?? {}) || "仍需教师依据后续证据持续识别。",
    interestsAndStrengths: byType("interest_strength").map(text).filter(Boolean),
    evidenceGaps: byType("evidence_gap").map(text).filter(Boolean),
    developmentReferences: byType("development_reference").map((item) => ({ ...item, evidenceStatement: text(item) })),
    responseSuggestions: responses,
    nextObservation: byType("next_observation").map(text).filter(Boolean),
    historicalComparison: {
      ...(result.historicalComparison ?? { evidenceCount: 0, timePointCount: 0, caution: "旧版分析未生成跨时间比较。" }),
      changes: history.filter((item) => !item.pattern),
      stablePatterns: history.filter((item) => item.pattern).map(({ pattern: _pattern, ...item }) => item),
    },
  };
}
