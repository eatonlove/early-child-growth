import { describe, expect, it } from "vitest";
import { buildScenarioAnalysis, rankKnowledgeCards, type KnowledgeRow } from "./scenario-provider.js";

const cards: KnowledgeRow[] = [
  { id: "science", code: "SCI", domain: "科学", subdomain: "科学探究", title: "具有初步的探究能力", age_band: "4-5岁", official_expectations: [], observable_behaviors: ["观察积木倒塌并调整"], evidence_requirements: ["再次观察策略变化"], assessment_guidance: [], misunderstanding_warning: "不要把一次成功写成稳定能力。", response_strategies: { 材料支持: ["提供不同形状积木"] }, next_observation_prompts: ["幼儿是否主动比较材料？"], keywords: ["积木", "调整", "倒塌"] },
  { id: "art", code: "ART", domain: "艺术", subdomain: "表现", title: "喜欢艺术活动", age_band: "4-5岁", official_expectations: [], observable_behaviors: ["随音乐表达"], evidence_requirements: [], assessment_guidance: [], misunderstanding_warning: "", response_strategies: {}, next_observation_prompts: [], keywords: ["音乐"] },
];

const observation = { teacher_observation: "积木倒塌后，幼儿换了一块积木并重新搭建。", child_quote: "这块更稳。", teacher_identification: "幼儿开始比较材料。", teacher_response: { category: "material", strategy: "补充积木", nextObservationFocus: "比较过程" }, scene: "建构区", theme: "稳固的桥", organization_stage: "process" };

describe("scenario AI provider", () => {
  it("优先检索与场景和原始证据一致的知识卡", () => {
    expect(rankKnowledgeCards(observation, cards)[0]?.code).toBe("SCI");
  });

  it("只把教师白描和幼儿原话写入事实层", () => {
    const result = buildScenarioAnalysis(observation, cards);
    expect(result.facts.map((fact) => fact.content).join(" ")).toContain("积木倒塌");
    expect(result.facts.map((fact) => fact.content).join(" ")).toContain("这块更稳");
    expect(result.warnings.join(" ")).toContain("不输出达标/不达标");
  });
});
