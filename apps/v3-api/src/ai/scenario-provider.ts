import type {
  AnalysisResult,
  CurriculumDraft,
  CurriculumGenerationInput,
  HistoricalObservationEvidence,
  InterestClusteringInput,
  InterestClusterResult,
  KnowledgeRow,
  ObservationForAnalysis,
  ReportContent,
  ReportGenerationInput,
} from "./contracts.js";

export type { KnowledgeRow, ObservationForAnalysis } from "./contracts.js";

const sceneDomains: Array<[RegExp, string[]]> = [
  [/建构|积木|沙水|科学|探究/, ["科学", "语言"]],
  [/角色|表演|商店|医院|家庭/, ["社会", "语言", "艺术"]],
  [/户外|运动|攀爬|骑行|球/, ["健康", "社会"]],
  [/绘画|音乐|舞蹈|艺术/, ["艺术", "语言"]],
];

const splitEvidence = (text: string) => text
  .split(/[。！？\n]/)
  .map((item) => item.trim())
  .filter((item) => item.length >= 4)
  .slice(0, 4);

export function rankKnowledgeCards(observation: ObservationForAnalysis, cards: KnowledgeRow[]) {
  const context = `${observation.scene} ${observation.theme} ${observation.teacher_observation} ${observation.child_quote ?? ""} ${observation.teacher_identification}`;
  const preferredDomains = sceneDomains.find(([pattern]) => pattern.test(context))?.[1] ?? [];
  return cards
    .map((card) => {
      const keywordScore = card.keywords.reduce((sum, keyword) => sum + (keyword.length > 1 && context.includes(keyword) ? 3 : 0), 0);
      const behaviorScore = card.observable_behaviors.reduce((sum, behavior) => {
        const tokens = behavior.split(/[、，。；（）\s]/).filter((token) => token.length >= 2);
        return sum + Math.min(4, tokens.filter((token) => context.includes(token)).length);
      }, 0);
      return { card, score: keywordScore + behaviorScore + (preferredDomains.includes(card.domain) ? 4 : 0) };
    })
    .sort((a, b) => b.score - a.score || a.card.code.localeCompare(b.card.code))
    .slice(0, 3)
    .map(({ card }) => card);
}

export function buildScenarioAnalysis(
  observation: ObservationForAnalysis,
  cards: KnowledgeRow[],
  history: HistoricalObservationEvidence[] = [],
): AnalysisResult {
  const facts = splitEvidence(observation.teacher_observation);
  if (observation.child_quote?.trim()) facts.push(`幼儿原话：“${observation.child_quote.trim()}”`);
  const matched = rankKnowledgeCards(observation, cards);
  const response = matched.reduce<Record<string, string[]>>((result, card) => {
    for (const [category, items] of Object.entries(card.response_strategies ?? {})) {
      result[category] = [...new Set([...(result[category] ?? []), ...items])].slice(0, 3);
    }
    return result;
  }, {});

  return {
    objectiveSummary: facts.length ? facts.join("；") : "当前只有结构化情境信息，仍需补充客观行为白描。",
    facts: facts.map((content, index) => ({
      content,
      evidence: index === facts.length - 1 && observation.child_quote ? "幼儿原话" : "教师客观白描",
      evidenceIds: index === facts.length - 1 && observation.child_quote ? ["child-quote"] : ["teacher-observation"],
      confidence: observation.child_quote && index === facts.length - 1 ? 0.96 : 0.9,
    })),
    interpretations: matched.map((card) => ({
      content: `这一行为可与“${card.title}”关联理解，但不能脱离当前游戏情境单独判断能力。`,
      indicatorCode: card.code,
      evidenceIds: ["teacher-observation"],
      limitation: card.evidence_requirements[0] ?? "仍需跨时间、跨情境继续观察。",
      confidence: 0.74,
    })),
    hypotheses: [{
      content: `幼儿可能正在围绕“${observation.theme}”形成新的策略或表达方式，需要在下一次相近及不同情境中继续验证。`,
      nextObservation: "观察幼儿在材料、同伴或教师支持变化后是否再次出现相近策略。",
      confidence: 0.62,
    }],
    teacherComparison: {
      teacherIdentification: observation.teacher_identification,
      teacherResponse: observation.teacher_response,
      aiAddition: matched.length ? `AI补充了${matched.map((card) => card.domain).join("、")}领域的年龄参照。` : "本次没有检索到足够匹配的年龄参照。",
    },
    currentExperience: observation.teacher_identification || "以教师已提交的初步识别为主，AI不替代教师原判。",
    interestsAndStrengths: [`持续参与“${observation.theme}”相关游戏`, "能够通过行动或语言留下可继续追踪的证据"],
    evidenceGaps: ["需要至少一个后续时间点的相似情境证据", "需要观察在材料、同伴或教师支持变化后的表现"],
    developmentReferences: matched.map((card) => ({
      indicatorCode: card.code,
      title: card.title,
      domain: card.domain,
      ageBand: card.age_band,
      status: "部分证据",
      evidenceStatement: facts[0] ?? "本次证据不足",
      missingEvidence: card.evidence_requirements[0] ?? "需跨时间、跨情境继续观察",
    })),
    responseSuggestions: {
      experience: response["经验支持"] ?? ["保持游戏连续性，邀请幼儿回顾自己的做法并表达理由。"],
      material: response["材料支持"] ?? ["在不改变幼儿游戏意图的前提下补充可比较、可组合的开放材料。"],
      activity: response["活动支持"] ?? ["安排下一次相近情境复察，并记录支持前后的策略变化。"],
    },
    nextObservation: matched.flatMap((card) => card.next_observation_prompts).slice(0, 4),
    historicalComparison: {
      evidenceCount: history.length,
      timePointCount: new Set(history.map((item) => item.occurred_at.slice(0, 10))).size,
      changes: history.length ? [{
        dimension: "游戏策略与经验表达",
        content: `与最近一次已采用观察相比，本次围绕“${observation.theme}”出现了可继续比较的行动或表达线索；变化方向仍需教师结合两次原始记录确认。`,
        previousEvidenceIds: [`observation:${history.at(-1)!.id}`],
        currentEvidenceIds: ["teacher-observation"],
        confidence: 0.68,
      }] : [],
      stablePatterns: history.length >= 2 && history.slice(-2).every((item) => item.theme === observation.theme) ? [{
        content: `围绕“${observation.theme}”的兴趣已在多个时间点出现，但是否跨情境稳定仍需复察。`,
        evidenceIds: history.slice(-2).map((item) => `observation:${item.id}`),
        confidence: 0.7,
      }] : [],
      caution: history.length
        ? `本次比较读取了${history.length}条更早的已采用观察，只描述时间内变化，不与其他幼儿比较。`
        : "当前没有更早的已采用观察，不能形成跨时间成长判断。",
    },
    evidenceSufficiency: facts.length >= 3 && matched.length >= 2 ? "初步充分" : "有限",
    warnings: [
      "本结果为模拟AI建议稿，未读取真实视频画面或音轨。",
      "单次观察不能形成稳定发展结论，不输出达标/不达标、排名或诊断。",
      ...matched.map((card) => card.misunderstanding_warning).filter(Boolean).slice(0, 2),
    ],
  };
}

const semanticThemes: Array<{ label: string; pattern: RegExp }> = [
  { label: "建构与结构探究", pattern: /建构|积木|搭建|建筑|桥梁|轨道|结构|平衡/ },
  { label: "沙水与物质探究", pattern: /沙水|玩沙|泥|水流|管道|沉浮|泡泡|液体/ },
  { label: "自然与生命探究", pattern: /自然|种植|植物|花|树叶|昆虫|动物|生命/ },
  { label: "角色与社会交往", pattern: /角色|表演|商店|医院|家庭|餐厅|舞台|合作/ },
  { label: "艺术表达与创造", pattern: /艺术|绘画|音乐|舞蹈|美工|色彩|创作/ },
  { label: "运动与身体挑战", pattern: /户外|运动|攀爬|骑行|球|跳跃|平衡车/ },
  { label: "科学现象探究", pattern: /科学|光影|磁|声音|风|电|实验|观察/ },
];

const semanticLabel = (text: string) => semanticThemes.find((item) => item.pattern.test(text))?.label;
const bigrams = (value: string) => {
  const text = value.replace(/[\s，。！？、：；《》（）()“”'"·_-]/g, "");
  return new Set(Array.from({ length: Math.max(0, text.length - 1) }, (_, index) => text.slice(index, index + 2)));
};
const semanticSimilarity = (left: string, right: string) => {
  const a = bigrams(left);
  const b = bigrams(right);
  const intersection = [...a].filter((item) => b.has(item)).length;
  return intersection / Math.max(1, Math.min(a.size, b.size));
};

export function buildScenarioInterestClusters(input: InterestClusteringInput): InterestClusterResult {
  const observations = input.observations;
  const parent = observations.map((_, index) => index);
  const root = (index: number): number => parent[index] === index ? index : (parent[index] = root(parent[index]!));
  const join = (left: number, right: number) => { parent[root(right)] = root(left); };
  observations.forEach((left, leftIndex) => observations.slice(leftIndex + 1).forEach((right, offset) => {
    const rightIndex = leftIndex + offset + 1;
    const leftText = `${left.theme} ${left.scene} ${left.teacher_identification}`;
    const rightText = `${right.theme} ${right.scene} ${right.teacher_identification}`;
    const leftLabel = semanticLabel(leftText);
    const rightLabel = semanticLabel(rightText);
    if ((leftLabel && leftLabel === rightLabel) || semanticSimilarity(leftText, rightText) >= 0.28) join(leftIndex, rightIndex);
  }));
  const groups = new Map<number, typeof observations>();
  observations.forEach((item, index) => groups.set(root(index), [...(groups.get(root(index)) ?? []), item]));
  return {
    clusters: [...groups.values()].map((group) => {
      const text = group.map((item) => `${item.theme} ${item.scene} ${item.teacher_identification}`).join(" ");
      const label = semanticLabel(text) ?? mostFrequent(group.map((item) => item.theme), 1)[0] ?? "持续游戏兴趣";
      return {
        label,
        aliases: [...new Set(group.map((item) => item.theme))],
        observationIds: group.map((item) => item.id),
        rationale: `依据主题别名、游戏场景及教师识别中的共同兴趣语义归为“${label}”。`,
      };
    }),
  };
}

const mostFrequent = (values: string[], limit = 4) => {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([value]) => value);
};

export function buildScenarioReport(input: ReportGenerationInput): ReportContent {
  const observationIds = input.observations.map((item) => item.id);
  const analyses = input.analyses.filter((item) => observationIds.includes(item.observation_id));
  const supports = input.supports.filter((item) => observationIds.includes(item.observation_id));
  const growth = analyses.flatMap((item) => item.structured_result?.interpretations ?? []).map((item) => item.content).slice(0, 6);
  const familyGrowth = analyses.flatMap((item) => item.structured_result?.interestsAndStrengths ?? []).slice(0, 6);
  return {
    title: `${input.childName}的游戏学习与发展记录`,
    evidenceBoundary: input.reportType === "guardian"
      ? "我们关注孩子在不同时候的变化，不与其他孩子比较。"
      : "只汇总教师明确采用的分析，不与其他幼儿比较。",
    observationCoverage: `${input.observations.length}次观察，覆盖${new Set(input.observations.map((item) => item.scene)).size}类游戏场景。`,
    interests: mostFrequent(input.observations.map((item) => item.theme)),
    evidencedGrowth: input.reportType === "guardian" && familyGrowth.length
      ? familyGrowth
      : growth.length
        ? growth
        : ["当前已有游戏证据，仍需更多时间点验证稳定变化。"],
    teacherSupport: supports.map((item) => `${item.strategy}${item.child_response ? `；后续反应：${item.child_response}` : ""}`).slice(0, 6),
    pendingQuestions: analyses.flatMap((item) => item.structured_result?.evidenceGaps ?? []).slice(0, 5),
    nextPlan: analyses.flatMap((item) => item.structured_result?.nextObservation ?? []).slice(0, 5),
    familySuggestions: analyses.flatMap((item) => item.structured_result?.responseSuggestions?.activity ?? []).slice(0, 4),
    audience: input.reportType,
  };
}

export function buildScenarioCurriculum(input: CurriculumGenerationInput): CurriculumDraft {
  const identifications = input.observations.map((item) => String(item.teacher_identification ?? "")).filter(Boolean).slice(0, 8);
  const nextFocuses = input.observations.map((item) => String(item.teacher_response?.nextObservationFocus ?? "")).filter(Boolean).slice(0, 8);
  return {
    title: `${input.theme}：持续探究课程线索`,
    origin: `${input.observationCount}条已采用观察，涉及${input.childCount}名幼儿、${input.timePointCount}个时间点，显示该主题具有持续探究价值。`,
    inquiryQuestions: nextFocuses.length ? nextFocuses : [`幼儿围绕“${input.theme}”还想解决什么问题？`],
    existingExperience: identifications.length ? identifications : ["已有多次围绕相同主题的游戏行动和表达证据。"],
    keyExperiences: ["持续提出问题并尝试不同解决方法", "通过行动、语言或作品表达探究过程"],
    materialsAndEnvironment: ["保留原有游戏材料，逐步增加可比较、可组合的开放材料", "提供可持续使用的记录与展示空间"],
    possiblePaths: ["回顾已有经验并共议问题", "围绕幼儿的新问题调整材料", "在新情境中复察经验迁移"],
    observationFocus: nextFocuses.length ? nextFocuses : ["记录幼儿的问题、策略变化和同伴协作"],
    familyAndCommunity: ["邀请家庭提供与主题相关的生活经验，但不要求统一完成任务"],
    adjustmentBasis: ["根据后续观察证据增减材料与探究路径", "当兴趣减弱或问题已解决时允许课程自然结束"],
  };
}
