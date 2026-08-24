import { describe, expect, it } from "vitest";
import { effectiveAnalysisResult, flattenAnalysisClaims, type AnalysisClaimReviewRow } from "./analysis-claims.js";
import { buildScenarioAnalysis, type KnowledgeRow } from "./ai/scenario-provider.js";

const card: KnowledgeRow = {
  id: "science", code: "SCI", domain: "科学", subdomain: "探究", title: "初步探究",
  age_band: "4-5岁", official_expectations: [], observable_behaviors: [], evidence_requirements: ["复察"],
  assessment_guidance: [], misunderstanding_warning: "避免单次定论", response_strategies: {}, next_observation_prompts: ["继续观察"], keywords: [],
};
const observation = {
  teacher_observation: "幼儿移动桥墩后，再次把积木放到桥面上。", child_quote: null,
  teacher_identification: "正在比较支撑位置。",
  teacher_response: { category: "material", strategy: "提供不同支撑物", nextObservationFocus: "观察是否继续比较" },
  scene: "建构区", theme: "桥梁", organization_stage: "process",
};

describe("analysis claim review", () => {
  it("只把教师逐条采用或修改的内容放入正式分析", () => {
    const result = buildScenarioAnalysis(observation, [card]);
    const claims = flattenAnalysisClaims(result);
    const reviews: AnalysisClaimReviewRow[] = claims.map((claim) => ({
      claim_key: claim.claimKey,
      claim_type: claim.claimType,
      original_content: claim.originalContent,
      decision: claim.claimKey === "current-experience" ? "modified" : claim.claimType === "fact" ? "adopted" : "rejected",
      reviewed_content: claim.claimKey === "current-experience" ? { ...claim.originalContent, content: "教师修改后的当前经验" } : null,
    }));
    const effective = effectiveAnalysisResult(result, reviews);
    expect(effective.currentExperience).toBe("教师修改后的当前经验");
    expect(effective.facts).toHaveLength(result.facts.length);
    expect(effective.interpretations).toHaveLength(0);
    expect(effective.responseSuggestions.experience).toHaveLength(0);
  });

  it("为指标与应答补全原始证据锚点", () => {
    const claims = flattenAnalysisClaims(buildScenarioAnalysis(observation, [card]));
    expect(claims.find((item) => item.claimType === "development_reference")?.originalContent.evidenceIds).toEqual(["teacher-observation"]);
    expect(claims.find((item) => item.claimType === "response_suggestion")?.originalContent.evidenceIds).toContain("teacher-observation");
  });
});
