import { describe, expect, it, vi } from "vitest";
import type { KnowledgeRow } from "./contracts.js";
import { QianwenAIProvider } from "./qianwen-provider.js";

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

const response = {
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
  evidenceSufficiency: "有限",
  warnings: ["结论需要教师审核。"],
};

describe("QianwenAIProvider", () => {
  it("analyzes authorized media, preserves teacher text and limits indicator references", async () => {
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
      },
      child: { id: "child-1", display_name: "不应发送的姓名", birth_month: "2022-05", guardian_consent_status: "granted" },
      classroom: { id: "class-1", grade: "middle" },
      knowledge: [card],
      evidence: [{ id: "evidence-1", evidence_type: "video", mime_type: "video/mp4" }],
      media: [{ id: "evidence-1", evidenceType: "video", mimeType: "video/mp4", signedUrl: "https://storage.example/signed-video" }],
    });

    expect(generated.provider).toBe("QianwenAIProvider");
    expect(generated.mediaAnalyzed).toBe(true);
    expect(generated.data.teacherComparison.teacherIdentification).toBe("幼儿开始比较材料与稳定性的关系。");
    expect(generated.data.teacherComparison.teacherResponse).toEqual(teacherResponse);
    expect(generated.data.developmentReferences[0]).toMatchObject({ title: card.title, domain: card.domain, ageBand: card.age_band });
    expect(requestBody).toContain("video_url");
    expect(requestBody).not.toContain("不应发送的姓名");
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
});
