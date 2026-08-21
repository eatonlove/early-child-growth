export interface KnowledgeRow {
  id: string;
  code: string;
  domain: string;
  subdomain: string;
  title: string;
  age_band: string;
  official_expectations: string[];
  observable_behaviors: string[];
  evidence_requirements: string[];
  assessment_guidance: string[];
  misunderstanding_warning: string;
  response_strategies: Record<string, string[]>;
  next_observation_prompts: string[];
  keywords: string[];
}

export interface ObservationForAnalysis {
  teacher_observation: string;
  child_quote?: string | null;
  teacher_identification: string;
  teacher_response: { category: string; strategy: string; nextObservationFocus: string };
  scene: string;
  theme: string;
  organization_stage: string;
}

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

export function buildScenarioAnalysis(observation: ObservationForAnalysis, cards: KnowledgeRow[]) {
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
      confidence: observation.child_quote && index === facts.length - 1 ? 0.96 : 0.9,
    })),
    interpretations: matched.map((card) => ({
      content: `这一行为可与“${card.title}”关联理解，但不能脱离当前游戏情境单独判断能力。`,
      indicatorCode: card.code,
      confidence: 0.74,
    })),
    hypotheses: [{
      content: `幼儿可能正在围绕“${observation.theme}”形成新的策略或表达方式，需要在下一次相近及不同情境中继续验证。`,
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
    evidenceSufficiency: facts.length >= 3 && matched.length >= 2 ? "初步充分" : "有限",
    warnings: [
      "本结果为模拟AI建议稿，未读取真实视频画面或音轨。",
      "单次观察不能形成稳定发展结论，不输出达标/不达标、排名或诊断。",
      ...matched.map((card) => card.misunderstanding_warning).filter(Boolean).slice(0, 2),
    ],
  };
}
