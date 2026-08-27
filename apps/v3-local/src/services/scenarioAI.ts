import type {
  AIAnalysisRun, AnalysisClaim, Child, DevelopmentReference, EvidencePackage,
  Grade, KnowledgeCard, MediaEvidence, ObservationSubject, SupportCategory,
} from "../domain/types";
import { GUIDE_KNOWLEDGE_VERSION, guideKnowledgeCards } from "../data/guideKnowledgeBase";
import { TENANT_ID } from "../data/seed";
import type { AIAnalysisContext, AIAnalysisProvider, AIAnalysisResult } from "./contracts";
import { makeId } from "./localRepository";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const sceneTargets: Array<{ pattern: RegExp; goalCodes: string[] }> = [
  { pattern: /建构|积木|桥|轨道|道路/, goalCodes: ["SCI-INQ-02", "SCI-MATH-03", "SOC-INT-02", "LAN-LS-02"] },
  { pattern: /沙水|水流|管道|材料|自然|种植|光影/, goalCodes: ["SCI-INQ-03", "SCI-INQ-02", "SCI-INQ-01", "SCI-MATH-01"] },
  { pattern: /角色|医院|商店|舞台|表演/, goalCodes: ["SOC-INT-02", "LAN-LS-02", "SOC-ADP-02", "ART-CRE-02"] },
  { pattern: /户外|运动|足球|攀爬|跑|跳|球/, goalCodes: ["HEA-MOT-01", "HEA-MOT-02", "HEA-LIFE-03", "SOC-INT-02"] },
  { pattern: /美工|艺术|绘画|泥塑|音乐|舞蹈/, goalCodes: ["ART-CRE-01", "ART-CRE-02", "ART-APP-02", "LAN-RW-03"] },
  { pattern: /规则|协商|合作|冲突|同伴/, goalCodes: ["SOC-INT-02", "SOC-ADP-02", "LAN-LS-03", "LAN-LS-02"] },
];

interface MatchedCard {
  card: KnowledgeCard;
  matchedKeywords: string[];
  score: number;
}

function subjectGrade(subject: ObservationSubject, children: Child[]): Grade {
  return children.find((child) => child.id === subject.childId)?.grade ?? "大班";
}

function matchKnowledgeCards(
  pkg: EvidencePackage,
  subject: ObservationSubject,
  grade: Grade,
  cards: KnowledgeCard[],
): MatchedCard[] {
  const context = `${pkg.scene} ${pkg.theme} ${pkg.title} ${subject.teacherObservation} ${subject.childQuote} ${subject.teacherIdentification}`;
  const targetCodes = sceneTargets.filter((item) => item.pattern.test(context)).flatMap((item) => item.goalCodes);
  const candidates = cards.filter((card) => card.kind === "指南年龄参照" && card.grade === grade);
  return candidates
    .map((card) => {
      const matchedKeywords = card.keywords.filter((keyword) => keyword.length > 1 && context.includes(keyword));
      const targetIndex = targetCodes.findIndex((code) => card.code.includes(code));
      const score = matchedKeywords.length * 4 + (targetIndex >= 0 ? Math.max(2, 8 - targetIndex) : 0);
      return { card, matchedKeywords, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.card.code.localeCompare(b.card.code))
    .slice(0, 3);
}

function unique(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}

function developmentReferences(
  matches: MatchedCard[],
  grade: Grade,
  pkg: EvidencePackage,
  subject: ObservationSubject,
  media: MediaEvidence[],
): DevelopmentReference[] {
  const hasCrossEvidence = Boolean(subject.teacherObservation.trim() && (subject.childQuote.trim() || media.length));
  return matches.map(({ card, matchedKeywords }, index) => {
    const hasDirectKeyword = matchedKeywords.length > 0;
    const status = hasDirectKeyword
      ? (index === 0 && hasCrossEvidence ? "已观察到相关表现" : "部分证据")
      : "待继续观察";
    return {
      indicatorCode: card.code,
      indicatorTitle: card.title,
      domain: card.domain as DevelopmentReference["domain"],
      grade,
      ageBand: card.ageBand,
      status,
      evidenceStatement: hasDirectKeyword
        ? `本次原始证据出现与“${matchedKeywords.slice(0, 3).join("、")}”相关的情境线索；只说明在“${pkg.theme}”中已观察到关联表现。`
        : `场地或主题与该目标相关，但现有白描未出现足够直接行为词，暂不作发展判断。`,
      missingEvidence: card.evidenceRequirements[0] ?? "需要补充跨时间、跨情境证据。",
    };
  });
}

function responseSuggestions(matches: MatchedCard[], subject: ObservationSubject): Record<SupportCategory, string[]> {
  const fromKnowledge = (category: SupportCategory) => unique(matches.flatMap(({ card }) => card.responseStrategies[category])).slice(0, 3);
  return {
    经验支持: fromKnowledge("经验支持").length ? fromKnowledge("经验支持") : ["邀请幼儿回顾做过的尝试及结果，不预设标准答案。"],
    材料支持: unique([subject.teacherResponseDraft.strategy, ...fromKnowledge("材料支持")]).slice(0, 3),
    活动支持: fromKnowledge("活动支持").length ? fromKnowledge("活动支持") : ["在分享环节支持幼儿借助作品、动作或原话表达发现。"],
  };
}

export class ScenarioAIProvider implements AIAnalysisProvider {
  async analyze(
    pkg: EvidencePackage,
    subjects: ObservationSubject[],
    media: MediaEvidence[],
    context?: AIAnalysisContext,
  ): Promise<AIAnalysisResult> {
    if (pkg.status !== "教师已提交") throw new Error("教师原始观察、识别与应答提交后，才能运行模拟AI对照分析");
    if (!subjects.length) throw new Error("证据包没有关联观察幼儿");
    await wait(650);
    const now = new Date().toISOString();
    const allClaims: AnalysisClaim[] = [];
    const knowledgeCards = context?.knowledgeCards.length ? context.knowledgeCards : guideKnowledgeCards;
    const children = context?.children ?? [];
    const runs = subjects.map((subject) => {
      const runId = makeId("analysis");
      const facts = subject.teacherObservation.trim() || "教师仅提交了媒体证据，需先补充或确认客观白描。";
      const mediaAnchor = media.find((item) => item.type === "视频");
      const grade = subjectGrade(subject, children);
      const matches = matchKnowledgeCards(pkg, subject, grade, knowledgeCards);
      const references = developmentReferences(matches, grade, pkg, subject, media);
      const codes = references.map((reference) => reference.indicatorCode);
      const claims: AnalysisClaim[] = [
        {
          id: makeId("claim"), analysisRunId: runId, subjectId: subject.id, childId: subject.childId,
          layer: "事实", content: facts,
          evidenceAnchors: [
            { type: "教师白描", referenceId: subject.id, label: "教师提交的原始白描" },
            ...(mediaAnchor ? [{ type: "视频片段" as const, referenceId: mediaAnchor.id, label: mediaAnchor.name, timestamp: "教师选择的关键片段" }] : []),
          ], indicatorCodes: [], confidence: subject.teacherObservation.trim() ? 0.95 : 0.55, reviewStatus: "待审核",
        },
        {
          id: makeId("claim"), analysisRunId: runId, subjectId: subject.id, childId: subject.childId,
          layer: "解释", content: subject.teacherIdentification.trim() || "从现有行动可以提出初步专业解释，但教师尚未填写自己的识别，需要结合完整情境补充。",
          evidenceAnchors: [{ type: "教师白描", referenceId: subject.id, label: "连续行为及幼儿原话" }],
          indicatorCodes: codes, confidence: subject.teacherIdentification.trim() ? 0.79 : 0.58, reviewStatus: "待审核",
        },
        {
          id: makeId("claim"), analysisRunId: runId, subjectId: subject.id, childId: subject.childId,
          layer: "假设", content: "当前策略是否能在不同材料、同伴或游戏场景中再次出现，仍需安排后续观察验证。",
          evidenceAnchors: [{ type: "教师白描", referenceId: subject.id, label: "本次情境证据" }],
          indicatorCodes: ["FORMATIVE-01", "ZPD-01"], confidence: 0.61, reviewStatus: "待验证",
        },
      ];
      allClaims.push(...claims);
      const knowledgeSupports = responseSuggestions(matches, subject);
      return {
        id: runId, tenantId: TENANT_ID, createdAt: now, updatedAt: now, createdBy: "scenario-ai", version: 1,
        evidencePackageId: pkg.id, subjectId: subject.id, childId: subject.childId, providerLabel: "模拟 AI" as const,
        summary: `在“${pkg.theme}”情境中，${subject.childName}的原始白描、幼儿原话和已确认媒体事件已被整理。此摘要不补写证据之外的行为。`,
        currentExperience: subject.teacherIdentification || "教师尚未提交明确识别，AI只生成待审核的证据整理。",
        interestsAndStrengths: subject.teacherIdentification
          ? ["教师原始识别中记录了当前兴趣或策略线索", "需结合后续证据确认是否稳定出现"]
          : ["当前只保留情境线索，等待教师补充专业识别"],
        evidenceGaps: ["单次证据不足以形成稳定发展判断", "需要区分教师支持下表现与独立表现", media.length ? "需由教师回看原媒体确认事件时间轴" : "当前缺少媒体或作品交叉印证"],
        responseSuggestions: knowledgeSupports,
        nextObservation: unique([subject.teacherResponseDraft.nextObservationFocus, ...matches.flatMap(({ card }) => card.nextObservationPrompts)]).slice(0, 4),
        planAlignment: pkg.gamePlanId ? "本次证据与关联游戏计划可对照，但计划目标不替代现场真实观察。" : "未关联预设游戏计划，仍可作为生成性游戏证据使用。",
        claimIds: claims.map((claim) => claim.id),
        comparison: {
          agreement: subject.teacherIdentification ? ["AI保留了教师对关键策略的识别方向"] : [],
          aiAdditions: [references.length ? `补充${grade}年龄参照与证据缺口，不作简单达标判定` : "当前证据未匹配到足够明确的指南目标，建议教师选择观察重点"],
          teacherOnly: ["教师掌握幼儿此前经验、材料投放背景和现场关系信息"],
          evidenceConflicts: [],
        },
        knowledgeVersion: GUIDE_KNOWLEDGE_VERSION,
        ageReference: `${grade} · ${grade === "小班" ? "3-4岁" : grade === "中班" ? "4-5岁" : "5-6岁"}年龄段末期合理期望`,
        developmentReferences: references,
        status: "模拟草稿" as const,
      } satisfies AIAnalysisRun;
    });
    return { runs, claims: allClaims };
  }
}

export const scenarioAIProvider = new ScenarioAIProvider();
