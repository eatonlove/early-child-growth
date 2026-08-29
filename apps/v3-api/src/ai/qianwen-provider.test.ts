import { describe, expect, it, vi } from "vitest";
import type { KnowledgeRow } from "./contracts.js";
import {
  AI_PROMPT_DEFINITIONS,
  IMMUTABLE_AI_SAFETY_PROMPT,
  QianwenAIProvider,
  aiPromptDefinitions,
  assertNoForbiddenJudgment,
} from "./qianwen-provider.js";
import { buildScenarioAnalysis } from "./scenario-provider.js";

const card: KnowledgeRow = {
  id: "card-1",
  code: "SCI-M-01",
  domain: "科学",
  subdomain: "科学探究",
  title: "具有初步的探究能力",
  age_band: "4-5岁",
  official_expectations: ["能对事物或现象进行观察比较"],
  observable_behaviors: ["观察积木倒塌并调整"],
  evidence_requirements: ["再次观察策略变化"],
  assessment_guidance: ["结合情境连续观察"],
  misunderstanding_warning: "不要把一次成功写成稳定能力。",
  response_strategies: { 材料支持: ["提供不同形状积木"] },
  next_observation_prompts: ["幼儿是否主动比较材料？"],
  keywords: ["积木", "调整", "倒塌"],
};

const crossDomainCards: KnowledgeRow[] = [
  card,
  { ...card, id: "card-2", code: "SOC-M-01", domain: "社会", subdomain: "人际交往", title: "愿意与同伴协商", keywords: ["同伴", "共同", "协商"] },
  { ...card, id: "card-3", code: "LAN-M-01", domain: "语言", subdomain: "倾听与表达", title: "能表达自己的想法", keywords: ["说", "表达", "为什么"] },
  { ...card, id: "card-4", code: "ART-M-01", domain: "艺术", subdomain: "表现与创造", title: "能使用材料进行表现", keywords: ["造型", "装饰", "设计"] },
  { ...card, id: "card-5", code: "HEA-M-01", domain: "健康", subdomain: "动作发展", title: "手的动作灵活协调", keywords: ["操作", "按压", "连接"] },
];

const expandedResponse = buildScenarioAnalysis({
  teacher_observation: "幼儿将较长积木换到下层并继续搭建。",
  child_quote: "这样更稳。",
  teacher_identification: "幼儿开始比较材料与稳定性的关系。",
  teacher_response: { category: "material", strategy: "增加不同长度积木", nextObservationFocus: "观察主动比较" },
  scene: "建构区",
  theme: "桥梁建构",
  organization_stage: "process",
}, [card]);

const response = {
  ...expandedResponse,
  objectiveSummary: "幼儿调整积木后继续搭建。",
  facts: [{ content: "幼儿将较长积木换到下层。", evidence: "视频画面", evidenceIds: ["evidence-1"], confidence: 0.9 }],
  interpretations: [{ content: "这一调整可能体现了对稳定性的初步比较。", indicatorCode: "SCI-M-01", evidenceIds: ["evidence-1"], limitation: "只有一个时间点。", confidence: 0.72 }],
  hypotheses: [{ content: "幼儿可能正在形成比较材料稳定性的策略。", nextObservation: "在另一种材料中继续观察。", confidence: 0.6 }],
  teacherComparison: {
    teacherIdentification: "会被后端覆盖",
    teacherResponse: { category: "material", strategy: "会被后端覆盖", nextObservationFocus: "会被后端覆盖" },
    aiAddition: "补充了科学探究年龄参照。",
  },
  currentExperience: "可能会根据搭建结果调整材料位置。",
  interestsAndStrengths: ["持续参与桥梁建构"],
  evidenceGaps: ["需要在不同材料中复察"],
  developmentReferences: [{
    indicatorCode: "SCI-M-01",
    title: "模型标题会被知识卡覆盖",
    domain: "其他",
    ageBand: "其他",
    status: "部分证据",
    evidenceStatement: "视频中出现一次调整。",
    missingEvidence: "缺少跨情境证据。",
  }],
  responseSuggestions: {
    experience: ["邀请幼儿回顾为什么调整。"],
    material: ["提供长度相近、形状不同的积木。"],
    activity: ["在下一次建构中复察。"],
  },
  nextObservation: ["是否主动比较材料稳定性"],
  historicalComparison: {
    evidenceCount: 0,
    timePointCount: 0,
    changes: [],
    stablePatterns: [],
    caution: "没有历史证据，不能进行跨时间判断。",
  },
  evidenceSufficiency: "有限",
  warnings: ["结论需要教师审核。"],
};

describe("QianwenAIProvider", () => {
  it("allows evidence-boundary language but rejects an actual child label", () => {
    expect(() => assertNoForbiddenJudgment({ caution: "单次证据不足，不能据此判断幼儿是否达标。" })).not.toThrow();
    expect(() => assertNoForbiddenJudgment({ conclusion: "该幼儿已经达标。" })).toThrow("幼儿标签化风险守卫：达标");
    expect(() => assertNoForbiddenJudgment({ conclusion: "该幼儿能力差，需要重点纠正。" })).toThrow("幼儿标签化风险守卫：能力差");
  });
  it("registers every configurable AI scene with a distinct code default", () => {
    expect(aiPromptDefinitions()).toHaveLength(10);
    expect(Object.keys(AI_PROMPT_DEFINITIONS)).toEqual([
      "observation_document_extraction",
      "observation_analysis",
      "analysis_revision",
      "individual_period_report",
      "classroom_period_report",
      "report_revision",
      "curriculum_interest_clustering",
      "curriculum_draft",
      "curriculum_activity_options",
      "curriculum_plan",
    ]);
    expect(new Set(aiPromptDefinitions().map((item) => item.defaultVersion)).size).toBe(10);
  });

  it("applies the individual observation standard to text, image and video evidence without sending the child's identity", async () => {
    let requestBody = "";
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(response) } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const provider = new QianwenAIProvider({
      apiKey: "sk-test-only",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      textModel: "qwen3.7-plus",
      visionModel: "qwen3.7-plus",
      timeoutMs: 5000,
    }, fetcher as typeof fetch);
    const teacherResponse = { category: "material", strategy: "增加不同长度积木", nextObservationFocus: "观察主动比较" };

    const generated = await provider.analyzeObservation({
      observation: {
        teacher_observation: "幼儿看到桥倒塌后，把较长的积木换到下层并继续搭建。",
        child_quote: "这样更稳。",
        teacher_identification: "幼儿开始比较材料与稳定性的关系。",
        teacher_response: teacherResponse,
        scene: "建构区",
        theme: "桥梁建构",
        organization_stage: "process",
        observation_focus: ["材料与工具", "问题解决"],
        group_context: "三名幼儿共同搭桥。",
        subject_context: "目标幼儿穿黄色上衣，主要负责调整桥墩。",
        subject_role: "primary",
        subject_evidence_anchors: ["视频00:04-00:38黄色上衣幼儿", "图片左侧黄色上衣幼儿"],
      },
      child: { id: "child-1", display_name: "不应发送的姓名", birth_month: "2022-05", guardian_consent_status: "granted" },
      classroom: { id: "class-1", grade: "middle" },
      knowledge: crossDomainCards,
      evidence: [
        { id: "evidence-1", evidence_type: "video", mime_type: "video/mp4" },
        { id: "evidence-2", evidence_type: "photo", mime_type: "image/jpeg" },
      ],
      media: [
        { id: "evidence-1", evidenceType: "video", mimeType: "video/mp4", signedUrl: "https://storage.example/signed-video" },
        { id: "evidence-2", evidenceType: "photo", mimeType: "image/jpeg", signedUrl: "https://storage.example/signed-photo" },
      ],
      history: [],
      peerAnalysisSummaries: [{ subjectRole: "participant", subjectContext: "负责搬运积木", currentExperience: "能够调整积木位置。", responseTitles: ["继续搭建"] }],
    });

    expect(generated.provider).toBe("QianwenAIProvider");
    expect(generated.mediaAnalyzed).toBe(true);
    expect(generated.data.teacherComparison.teacherIdentification).toBe("幼儿开始比较材料与稳定性的关系。");
    expect(generated.data.teacherComparison.teacherResponse).toEqual(teacherResponse);
    expect(generated.data.developmentReferences[0]).toMatchObject({ title: card.title, domain: card.domain, ageBand: card.age_band });
    expect(requestBody).toContain("video_url");
    expect(requestBody).toContain("image_url");
    expect(requestBody).not.toContain("不应发送的姓名");
    expect(generated.promptVersion).toBe("observation-analysis.qwen.v7");

    const apiRequest = JSON.parse(requestBody);
    expect(apiRequest.messages[0].content).toContain("逐幼儿循证分析助手");
    expect(apiRequest.messages[0].content).toContain("图片只能证明一个可见瞬间");
    expect(apiRequest.messages[0].content).toContain("保持观察/最低介入");
    const firstTextPart = apiRequest.messages[1].content.find((item: { type: string }) => item.type === "text");
    const prompt = JSON.parse(firstTextPart.text.slice(firstTextPart.text.indexOf("\n") + 1));
    expect(prompt.analysisStandard.observationFocusDimensions).toContain("问题识别与解决发起");
    expect(prompt.allowedKnowledgeCards).toHaveLength(5);
    expect(prompt.targetSubject).toMatchObject({
      reference: "target-child",
      role: "primary",
      contextualFeature: "目标幼儿穿黄色上衣，主要负责调整桥墩。",
      evidenceAnchors: ["视频00:04-00:38黄色上衣幼儿", "图片左侧黄色上衣幼儿"],
    });
    expect(prompt.observation.observationFocus).toEqual(["材料与工具", "问题解决"]);
    expect(prompt.individualizationRequirements.responseSpecificity).toContain("写明材料名称及一个可改变变量");
    expect(prompt.alreadyGeneratedPeerAnalyses).toHaveLength(1);
  });

  it("adds an individual-attribution warning when group media has no target-child anchor", async () => {
    const mediaResponse = {
      ...response,
      facts: [{ ...response.facts[0], evidenceIds: ["evidence-1"] }],
      interpretations: [{ ...response.interpretations[0], evidenceIds: ["evidence-1"] }],
    };
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(mediaResponse) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const provider = new QianwenAIProvider({
      apiKey: "sk-test-only",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      textModel: "qwen3.7-plus",
      visionModel: "qwen3.7-plus",
      timeoutMs: 5000,
    }, fetcher as typeof fetch);

    const generated = await provider.analyzeObservation({
      observation: {
        teacher_observation: "三名幼儿一起搭桥，其中一名幼儿移动了桥墩。",
        child_quote: null,
        teacher_identification: "小组开始比较支撑位置。",
        teacher_response: { category: "material", strategy: "提供不同支撑物", nextObservationFocus: "观察目标幼儿是否继续比较" },
        scene: "建构区",
        theme: "桥梁建构",
        organization_stage: "process",
        group_context: "三名幼儿共同游戏。",
        subject_context: "未补充本次个体情境特征",
        subject_evidence_anchors: [],
      },
      child: { id: "child-1", display_name: "演示幼儿", birth_month: "2022-05", guardian_consent_status: "granted" },
      classroom: { id: "class-1", grade: "middle" },
      knowledge: [card],
      evidence: [{ id: "evidence-1", evidence_type: "video", mime_type: "video/mp4" }],
      media: [{ id: "evidence-1", evidenceType: "video", mimeType: "video/mp4", signedUrl: "https://storage.example/signed-video" }],
      history: [],
    });

    expect(generated.data.warnings).toContain("本次包含群体媒体但未提供目标幼儿的个体特征或画面定位锚点；无法明确归属的群体行为不得作为该幼儿事实。");
  });

  it("removes knowledge references outside the allowlist and keeps an audit warning", async () => {
    const unknownCode = "SCI-M-UNKNOWN";
    const boundaryResponse = {
      ...response,
      interpretations: [
        ...response.interpretations,
        { ...response.interpretations[0], indicatorCode: unknownCode },
      ],
      developmentReferences: [
        ...response.developmentReferences,
        { ...response.developmentReferences[0], indicatorCode: unknownCode },
      ],
      domainExperiences: response.domainExperiences.map((item, index) => index === 0
        ? { ...item, indicatorCodes: [...item.indicatorCodes, unknownCode] }
        : item),
    };
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(boundaryResponse) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const provider = new QianwenAIProvider({
      apiKey: "sk-test-only",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      textModel: "qwen3.7-plus",
      visionModel: "qwen3.7-plus",
      timeoutMs: 5000,
      visionTimeoutMs: 10000,
    }, fetcher as typeof fetch);

    const generated = await provider.analyzeObservation({
      observation: {
        teacher_observation: "幼儿移动桥墩后再次测试桥面。",
        child_quote: null,
        teacher_identification: "正在比较支撑位置。",
        teacher_response: { category: "material", strategy: "提供不同支撑物", nextObservationFocus: "观察是否继续比较" },
        scene: "建构区",
        theme: "桥梁建构",
        organization_stage: "process",
      },
      child: { id: "child-1", display_name: "演示幼儿", birth_month: "2022-05" },
      classroom: { id: "class-1", grade: "middle" },
      knowledge: [card],
      evidence: [{ id: "evidence-1", evidence_type: "photo", mime_type: "image/jpeg" }],
      media: [],
      history: [],
    });

    expect(generated.data.interpretations.map((item) => item.indicatorCode)).not.toContain(unknownCode);
    expect(generated.data.developmentReferences.map((item) => item.indicatorCode)).not.toContain(unknownCode);
    expect(generated.data.domainExperiences.flatMap((item) => item.indicatorCodes)).not.toContain(unknownCode);
    expect(generated.data.warnings.join(" ")).toContain("知识库外指标引用已自动移除");
  });

  it("canonicalizes evidence aliases for a text-only observation", async () => {
    const aliasResponse = {
      ...response,
      facts: response.facts.map((item) => ({ ...item, evidenceIds: ["teacher_observation"] })),
      interpretations: response.interpretations.map((item) => ({ ...item, evidenceIds: ["教师观察"] })),
    };
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(aliasResponse) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const provider = new QianwenAIProvider({
      apiKey: "sk-test-only",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      textModel: "qwen3.7-plus",
      visionModel: "qwen3.7-plus",
      timeoutMs: 5000,
    }, fetcher as typeof fetch);

    const generated = await provider.analyzeObservation({
      observation: {
        teacher_observation: "幼儿移动中间支撑后再次测试桥面。",
        child_quote: null,
        teacher_identification: "正在比较支撑位置。",
        teacher_response: { category: "material", strategy: "提供不同支撑物", nextObservationFocus: "观察是否继续比较" },
        scene: "建构区",
        theme: "桥梁建构",
        organization_stage: "process",
      },
      child: { id: "child-1", display_name: "演示幼儿", birth_month: "2022-05" },
      classroom: { id: "class-1", grade: "middle" },
      knowledge: [card],
      evidence: [],
      media: [],
      history: [],
    });

    expect(generated.data.facts[0]?.evidenceIds).toEqual(["teacher-observation"]);
    expect(generated.data.interpretations[0]?.evidenceIds).toEqual(["teacher-observation"]);
  });

  it("sends observation dates to report generation in China local time", async () => {
    let requestBody = "";
    const report = {
      title: "报告草稿",
      evidenceBoundary: "仅依据已采用证据。",
      observationCoverage: "本期一条观察。",
      interests: ["桥梁建构"],
      evidencedGrowth: ["幼儿移动支撑后再次测试。"],
      teacherSupport: ["提供不同支撑物。"],
      pendingQuestions: ["能否在不同材料中继续比较？"],
      nextPlan: ["继续观察材料变化后的策略。"],
      familySuggestions: ["在家共同搭建并聊聊支撑位置。"],
      audience: "guardian",
    };
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(report) } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const provider = new QianwenAIProvider({
      apiKey: "sk-test-only",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      textModel: "qwen3.7-plus",
      visionModel: "qwen3.7-plus",
      timeoutMs: 5000,
    }, fetcher as typeof fetch);

    await provider.generateReport({
      reportType: "guardian",
      childName: "演示幼儿",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-24",
      observations: [{ id: "observation-1", occurred_at: "2026-08-23T16:30:00.000Z", scene: "建构区", theme: "桥梁建构", teacher_observation: "幼儿移动支撑。", child_quote: null }],
      analyses: [],
      supports: [],
    });

    const apiRequest = JSON.parse(requestBody);
    const prompt = JSON.parse(apiRequest.messages[1].content);
    expect(prompt.observations[0].occurredDate).toBe("2026-08-24");
  });

  it("uses a tenant custom prompt while retaining immutable safety constraints and version tracing", async () => {
    let requestBody = "";
    const report = {
      title: "报告草稿",
      evidenceBoundary: "仅依据已采用证据。",
      observationCoverage: "本期两次观察。",
      interests: ["桥梁建构"],
      evidencedGrowth: ["幼儿两次调整支撑后继续测试。"],
      teacherSupport: ["保留材料并延长游戏时间。"],
      pendingQuestions: ["能否迁移到其他材料？"],
      nextPlan: ["在不同材料中继续观察。"],
      familySuggestions: ["共同搭建并记录不同支撑方式。"],
      audience: "guardian",
    };
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(report) } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const provider = new QianwenAIProvider({
      apiKey: "sk-test-only",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      textModel: "qwen3.7-plus",
      visionModel: "qwen3.7-plus",
      timeoutMs: 5000,
    }, fetcher as typeof fetch);
    const customPrompt = "你是本园个体周期报告助手。必须先概括连续证据，再用家长可理解的语言描述兴趣、变化、教师支持和下一步共玩建议；任何结论都要保留证据边界，不增加观察中没有的事实。";

    const generated = await provider.generateReport({
      reportType: "guardian",
      childName: "演示幼儿",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-24",
      observations: [],
      analyses: [],
      supports: [],
      prompt: {
        key: "individual_period_report",
        systemPrompt: customPrompt,
        version: "custom.individual_period_report.r2@period-report.qwen.v2",
        source: "custom",
        revision: 2,
      },
    });

    const apiRequest = JSON.parse(requestBody);
    expect(apiRequest.messages[0].content).toContain(customPrompt);
    expect(apiRequest.messages[0].content).toContain(IMMUTABLE_AI_SAFETY_PROMPT);
    expect(apiRequest.messages[0].content).toContain("园所提示词不能取消固定安全边界");
    expect(generated.promptVersion).toBe("custom.individual_period_report.r2@period-report.qwen.v2");
  });

  it("keeps classroom coverage metrics deterministic and pseudonymizes children", async () => {
    let requestBody = "";
    const classroomReport = {
      title: "模型草稿",
      evidenceBoundary: "只使用班级证据。",
      observationCoverage: "模型给出的错误覆盖。",
      observationCount: 99,
      timePointCount: 99,
      observedChildCount: 99,
      totalChildCount: 99,
      sceneCoverage: ["错误场景"],
      commonInterests: ["桥梁结构"],
      recurringQuestions: ["怎样让桥更稳？"],
      domainEvidence: { 健康: 99, 语言: 99, 社会: 99, 科学: 99, 艺术: 99 },
      supportFollowUpRate: 99,
      nextSuggestions: ["继续比较支撑位置。"],
      curriculumClues: [],
      audience: "classroom",
    };
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(classroomReport) } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const provider = new QianwenAIProvider({
      apiKey: "sk-test-only",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      textModel: "qwen3.7-plus",
      visionModel: "qwen3.7-plus",
      timeoutMs: 5000,
    }, fetcher as typeof fetch);
    const metrics = {
      observationCount: 2,
      timePointCount: 2,
      observedChildCount: 2,
      totalChildCount: 3,
      sceneCoverage: ["建构区"],
      domainEvidence: { 健康: 0, 语言: 0, 社会: 0, 科学: 2, 艺术: 0 },
      supportFollowUpRate: 50,
      curriculumClues: [{ id: "11111111-1111-4111-8111-111111111111", title: "桥梁探究", theme: "结构", status: "draft" }],
    };
    const generated = await provider.generateClassroomReport({
      classroomName: "星星一班",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-24",
      observations: [{ id: "observation-1", child_id: "sensitive-child-id", occurred_at: "2026-08-23T16:30:00.000Z", scene: "建构区", theme: "桥梁", teacher_observation: "移动支撑。", teacher_identification: "比较位置。" }],
      analyses: [],
      supports: [],
      metrics,
    });

    const apiRequest = JSON.parse(requestBody);
    const prompt = JSON.parse(apiRequest.messages[1].content);
    expect(prompt.observations[0].subjectRef).toBe("child-1");
    expect(requestBody).not.toContain("sensitive-child-id");
    expect(generated.data).toMatchObject(metrics);
    expect(generated.data.title).toBe("星星一班游戏学习班级画像");
  });

  it("accepts only allowlisted historical evidence in growth comparison", async () => {
    let requestBody = "";
    const historyId = "11111111-1111-4111-8111-111111111111";
    const historyResponse = {
      ...response,
      facts: [{ ...response.facts[0], evidenceIds: ["teacher-observation"] }],
      interpretations: [{ ...response.interpretations[0], evidenceIds: ["teacher-observation"] }],
      historicalComparison: {
        evidenceCount: 5,
        timePointCount: 5,
        changes: [{
          dimension: "问题解决策略",
          content: "与上次相比，本次出现再次测试的线索。",
          previousEvidenceIds: [`observation:${historyId}`],
          currentEvidenceIds: ["teacher-observation"],
          confidence: 0.7,
        }],
        stablePatterns: [],
        caution: "仍需更多时间点。",
      },
    };
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(historyResponse) } }] }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    });
    const provider = new QianwenAIProvider({
      apiKey: "sk-test-only", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      textModel: "qwen3.7-plus", visionModel: "qwen3.7-plus", timeoutMs: 5000,
    }, fetcher as typeof fetch);
    const generated = await provider.analyzeObservation({
      observation: {
        teacher_observation: "幼儿移动桥墩后再次测试。", child_quote: null,
        teacher_identification: "正在比较支撑位置。",
        teacher_response: { category: "material", strategy: "提供支撑物", nextObservationFocus: "继续比较" },
        scene: "建构区", theme: "桥梁", organization_stage: "process",
      },
      child: { id: "child-1", display_name: "演示幼儿", birth_month: "2022-05" },
      classroom: { id: "class-1", grade: "middle" }, knowledge: [card], evidence: [], media: [],
      history: [{
        id: historyId, occurred_at: "2026-08-01T09:00:00+08:00", scene: "建构区", theme: "桥梁",
        teacher_observation: "幼儿把两块积木放在桥面下。", child_quote: null,
        teacher_identification: "开始关注支撑。",
        teacher_response: { category: "material", strategy: "保留材料", nextObservationFocus: "观察调整" },
      }],
    });
    expect(generated.data.historicalComparison).toMatchObject({ evidenceCount: 1, timePointCount: 1 });
    expect(requestBody).toContain(`observation:${historyId}`);
  });
});
