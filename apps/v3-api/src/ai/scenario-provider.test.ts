import { describe, expect, it } from "vitest";
import { buildScenarioAnalysis, buildScenarioClassroomReport, buildScenarioInterestClusters, rankKnowledgeCards, type KnowledgeRow } from "./scenario-provider.js";

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
    expect(result.domainExperiences.map((item) => item.domain)).toEqual(["健康", "语言", "社会", "科学", "艺术"]);
    expect(result.responsePlans).toHaveLength(3);
    expect(result.responsePlans.every((plan) => plan.activitySupport && plan.materialSupport && plan.experienceSupport)).toBe(true);
  });

  it("使用历史观察形成带证据ID的跨时间比较", () => {
    const result = buildScenarioAnalysis(observation, cards, [{
      id: "11111111-1111-4111-8111-111111111111",
      occurred_at: "2026-08-01T09:00:00+08:00",
      scene: "建构区",
      theme: "稳固的桥",
      teacher_observation: "幼儿第一次尝试用两块积木支撑桥面。",
      child_quote: null,
      teacher_identification: "开始关注支撑位置。",
      teacher_response: observation.teacher_response,
    }]);
    expect(result.historicalComparison.evidenceCount).toBe(1);
    expect(result.historicalComparison.changes[0]?.previousEvidenceIds).toEqual(["observation:11111111-1111-4111-8111-111111111111"]);
  });

  it("把不同表述但语义相近的兴趣主题聚为一组", () => {
    const clustered = buildScenarioInterestClusters({ observations: [
      { id: "11111111-1111-4111-8111-111111111111", theme: "搭一座桥", scene: "积木区", teacher_identification: "比较桥墩位置", teacher_response: {} },
      { id: "22222222-2222-4222-8222-222222222222", theme: "积木桥梁", scene: "建构区", teacher_identification: "尝试让结构更稳", teacher_response: {} },
      { id: "33333333-3333-4333-8333-333333333333", theme: "医院角色游戏", scene: "角色区", teacher_identification: "协商医生角色", teacher_response: {} },
    ] });
    expect(clustered.clusters.find((item) => item.label === "建构与结构探究")?.observationIds).toHaveLength(2);
    expect(clustered.clusters).toHaveLength(2);
  });

  it("生成不含排名的班级证据画像", () => {
    const report = buildScenarioClassroomReport({
      classroomName: "星星一班",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-24",
      observations: [
        { id: "observation-1", child_id: "child-1", theme: "桥梁建构", scene: "建构区" },
        { id: "observation-2", child_id: "child-2", theme: "桥梁建构", scene: "建构区" },
      ],
      analyses: [{ observation_id: "observation-1", structured_result: { evidenceGaps: ["继续观察支撑策略"], nextObservation: ["比较不同桥墩位置"] } }],
      supports: [],
      metrics: {
        observationCount: 2,
        timePointCount: 2,
        observedChildCount: 2,
        totalChildCount: 3,
        sceneCoverage: ["建构区"],
        domainEvidence: { 健康: 0, 语言: 0, 社会: 0, 科学: 1, 艺术: 0 },
        supportFollowUpRate: 0,
        curriculumClues: [],
      },
    });
    expect(report.commonInterests).toEqual(["桥梁建构"]);
    expect(report.observationCoverage).toContain("2/3名幼儿");
    expect(report.nextSuggestions.join(" ")).toContain("优先为尚未覆盖的1名幼儿");
    expect(JSON.stringify(report)).not.toMatch(/第[一二三四五六七八九十\d]+名|优良差/);
  });
});
