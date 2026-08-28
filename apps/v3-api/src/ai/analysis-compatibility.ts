import { z } from "zod";
import { analysisResultSchema, type AnalysisResult, type ResponsePlan } from "./contracts.js";

const expandedAnalysisFields = {
  gameExperience: true,
  domainExperiences: true,
  learningDispositions: true,
  learningPossibilities: true,
  gamePossibilities: true,
  responsePlans: true,
  observationCut: true,
  observationFocus: true,
} as const;

const legacyAnalysisResultSchema = analysisResultSchema.omit(expandedAnalysisFields).passthrough();
const domains = ["健康", "语言", "社会", "科学", "艺术"] as const;

function shorten(value: string, max: number) {
  return value.trim().slice(0, max);
}

function validOr<T>(schema: { safeParse: (value: unknown) => { success: boolean; data?: T } }, value: unknown, fallback: T): T {
  const result = schema.safeParse(value);
  return result.success ? result.data as T : fallback;
}

function buildLegacyResponsePlans(result: z.infer<typeof legacyAnalysisResultSchema>, evidenceIds: string[]): ResponsePlan[] {
  const activity = result.responseSuggestions.activity;
  const material = result.responseSuggestions.material;
  const experience = result.responseSuggestions.experience;
  const observationFocus = [...new Set([
    ...result.nextObservation,
    "观察支持前后幼儿的行动、语言或作品发生了什么变化。",
  ])].slice(0, 5);

  const seeds = [
    { title: "延续当前兴趣并保留自主探索", variable: "游戏时间、空间或材料组合" },
    { title: "增加一个可比较的材料变量", variable: "材料的形状、数量、连接或呈现方式" },
    { title: "通过回顾与表达拓展经验", variable: "照片、图示、作品或同伴分享方式" },
  ];

  return seeds.map((seed, index) => ({
    title: seed.title,
    rationale: shorten(`依据原分析“${result.currentExperience}”形成兼容应答稿；实施前仍需教师结合现场情境确认。`, 1900),
    targetExperience: [shorten(result.currentExperience, 1900)],
    activitySupport: {
      activityName: seed.title,
      timing: "幼儿再次主动进入相近游戏情境时",
      objective: shorten(activity[index] ?? activity[0]!, 900),
      steps: [
        "先观察并确认幼儿当前的游戏意图。",
        `只调整一个变量：${seed.variable}。`,
        "记录幼儿在支持前后的行动、语言或作品。",
      ],
      teacherRole: "以观察者和资源提供者身份支持，用提问代替直接给出答案。",
      suggestedDuration: "服从幼儿游戏节奏",
    },
    materialSupport: {
      materials: [{
        name: shorten(material[index] ?? material[0]!, 110),
        quantity: "按当前游戏人数适量提供",
        variable: shorten(seed.variable, 280),
      }],
      placement: "放在幼儿可以自主取放、比较和组合的位置。",
      purpose: "支持幼儿延续原有问题并尝试新的方法，不预设唯一结果。",
      safetyNotes: ["教师根据材料尺寸、重量和场地进行安全检查。"],
    },
    experienceSupport: {
      suggestedQuestions: [shorten(experience[index] ?? experience[0]!, 1900)],
      participationMode: "先跟随幼儿的游戏意图，必要时通过提问、共同回顾或资源提供支持。",
      demonstration: "只有在幼儿持续受阻且主动求助时，示范一个可迁移的方法。",
      withdrawalCondition: "幼儿能够继续计划、尝试、协商或表达时，教师退回观察位置。",
    },
    observationCut: shorten(result.nextObservation[index] ?? result.nextObservation[0]!, 900),
    observationFocus,
    adjustmentCondition: "若支持没有引发新的行动、表达或持续兴趣，应撤回预设并重新确认幼儿的问题。",
    evidenceIds,
  }));
}

/** Upgrades analysis rows created before the expanded response and growth fields were introduced. */
export function normalizeAnalysisResult(value: unknown): AnalysisResult {
  const current = analysisResultSchema.safeParse(value);
  if (current.success) return current.data;

  const legacy = legacyAnalysisResultSchema.parse(value);
  const raw = value as Record<string, unknown>;
  const evidenceIds = [...new Set(legacy.facts.flatMap((item) => item.evidenceIds ?? []))].slice(0, 8);
  const groundedEvidenceIds = evidenceIds.length ? evidenceIds : ["teacher-observation"];
  const primaryFact = shorten(legacy.facts[0]!.content, 1400);
  const primaryGap = shorten(legacy.evidenceGaps[0]!, 900);
  const references = legacy.developmentReferences;
  const fallbackPlans = buildLegacyResponsePlans(legacy, groundedEvidenceIds);
  const fallbackFocus = [...new Set([
    ...legacy.nextObservation,
    "观察材料、同伴或教师支持变化后，幼儿是否继续推进游戏。",
  ])].slice(0, 5);

  const candidate = {
    ...legacy,
    gameExperience: validOr(analysisResultSchema.shape.gameExperience, raw.gameExperience, [{
      dimension: "计划与意图" as const,
      evidence: primaryFact,
      evidenceIds: groundedEvidenceIds,
      possibleExperience: shorten(legacy.currentExperience, 1400),
      limitation: primaryGap,
    }]),
    domainExperiences: validOr(analysisResultSchema.shape.domainExperiences, raw.domainExperiences, domains.map((domain) => {
      const matches = references.filter((item) => item.domain === domain);
      return {
        domain,
        evidence: matches.length ? shorten(matches[0]!.evidenceStatement, 1400) : "",
        evidenceIds: matches.length ? groundedEvidenceIds : [],
        possibleExperience: matches.length
          ? shorten(`本次行为可与${domain}领域的“${matches.map((item) => item.title).join("、")}”联系理解。`, 1400)
          : "本次没有足够直接证据，不作领域判断。",
        indicatorCodes: matches.map((item) => item.indicatorCode).slice(0, 8),
        missingEvidence: shorten(matches[0]?.missingEvidence ?? `需要补充与${domain}领域直接相关的可见行为证据。`, 900),
        noJudgment: matches.length === 0,
      };
    }).filter((item) => !item.noJudgment)),
    learningDispositions: validOr(analysisResultSchema.shape.learningDispositions, raw.learningDispositions, [{
      dimension: "主动性" as const,
      evidence: primaryFact,
      evidenceIds: groundedEvidenceIds,
      possibleExperience: "本次出现了可继续观察的学习品质线索，仍需结合后续情境验证。",
      confidence: 0.6,
    }]),
    learningPossibilities: validOr(analysisResultSchema.shape.learningPossibilities, raw.learningPossibilities, [
      "支持幼儿在相近游戏中继续计划、尝试、表达和调整。",
    ]),
    gamePossibilities: validOr(analysisResultSchema.shape.gamePossibilities, raw.gamePossibilities, [
      "延续当前游戏并增加一个可控变量，观察幼儿是否生成新的问题和玩法。",
    ]),
    responsePlans: validOr(analysisResultSchema.shape.responsePlans, raw.responsePlans, fallbackPlans),
    observationCut: validOr(analysisResultSchema.shape.observationCut, raw.observationCut, legacy.nextObservation.slice(0, 2)),
    observationFocus: validOr(analysisResultSchema.shape.observationFocus, raw.observationFocus, fallbackFocus),
  };

  return analysisResultSchema.parse(candidate);
}
