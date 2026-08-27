import type {
  AnalysisResult,
  AnalysisRevisionInput,
  ClassroomReportContent,
  ClassroomReportGenerationInput,
  CurriculumDraft,
  CurriculumActivityOptions,
  CurriculumActivityOptionsInput,
  CurriculumPlanContent,
  CurriculumPlanGenerationInput,
  CurriculumGenerationInput,
  HistoricalObservationEvidence,
  InterestClusteringInput,
  InterestClusterResult,
  KnowledgeRow,
  ObservationForAnalysis,
  ObservationDocumentExtraction,
  ObservationDocumentExtractionInput,
  ReportContent,
  ReportGenerationInput,
} from "./contracts.js";
import { analysisResultSchema } from "./contracts.js";
import { normalizeAnalysisResult } from "./analysis-compatibility.js";

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
  const primaryEvidence = facts[0] ?? "本次客观白描仍需补充可见行为细节";
  const generalEvidenceIds = ["teacher-observation"];
  const activitySeed = response["活动支持"]?.[0] ?? `围绕“${observation.theme}”安排一次可比较的延续游戏`;
  const materialSeed = response["材料支持"]?.[0] ?? "投放两组具有明显差异、可比较和可组合的开放材料";
  const experienceSeed = response["经验支持"]?.[0] ?? "邀请幼儿说明自己的计划、变化和理由，教师不急于给出答案";
  const responsePlans = [
    { title: "延续原有兴趣并增加一个可比较变量", timing: "幼儿再次主动进入相近游戏时", variable: "材料形状或连接方式" },
    { title: "通过同伴协作扩展问题解决经验", timing: "幼儿出现需要协商、分工或共同验证的问题时", variable: "同伴角色与任务分工" },
    { title: "通过回顾和表征推动经验迁移", timing: "游戏告一段落、幼儿愿意分享做法时", variable: "照片、图示或作品记录" },
  ].map((plan, index) => ({
    title: plan.title,
    rationale: `依据“${primaryEvidence}”形成候选应答；该方案只支持下一步行动，不替代教师现场判断。`,
    targetExperience: [observation.teacher_identification || `围绕“${observation.theme}”形成更清晰的计划与调整经验`],
    activitySupport: {
      activityName: `${observation.theme}·${index === 0 ? "变量比较" : index === 1 ? "合作探究" : "回顾表征"}`,
      timing: plan.timing,
      objective: activitySeed,
      steps: ["保持幼儿原有游戏意图，先观察其自主计划", `只增加一个变量：${plan.variable}`, "邀请幼儿比较前后变化并决定是否调整", "记录支持前后的行动、语言或作品"],
      teacherRole: index === 1 ? "以共同参与者或资源提供者身份进入，协助明确分工后逐步退出" : "作为观察者和思维挑战者，用提问代替直接示范答案",
      suggestedDuration: "15-30分钟，服从幼儿游戏节奏",
    },
    materialSupport: {
      materials: [
        { name: materialSeed, quantity: "每类2-4件", variable: plan.variable },
        { name: "照片、画纸或记录卡", quantity: "按小组准备", variable: "用于记录前后变化" },
      ],
      placement: "放在幼儿可自主取放的位置，不预先规定唯一用法",
      purpose: "让幼儿能够比较、选择、组合和验证，而不是完成教师预设成品",
      safetyNotes: ["根据材料尺寸、重量和场地检查安全性", "避免一次投放过多导致游戏意图被材料替代"],
    },
    experienceSupport: {
      suggestedQuestions: ["你现在想解决的是什么？", "刚才哪一点发生了变化？", "你还想试哪一种办法？为什么？"],
      participationMode: experienceSeed,
      demonstration: "幼儿持续受阻且主动求助时，只示范一个可迁移的方法，再把决定权交还幼儿",
      withdrawalCondition: "当幼儿能够继续计划、协商或验证时，教师退回观察位置",
    },
    observationCut: `当${plan.variable}变化时，幼儿如何计划、比较并调整？`,
    observationFocus: ["支持前幼儿原有计划和做法", "材料或同伴变化后的第一反应", "是否提出比较、解释或新的问题", "教师退出后能否继续推进"],
    adjustmentCondition: "若连续两次支持都没有促进新的行动或表达，应撤回该变量并重新确认幼儿真实兴趣。",
    evidenceIds: generalEvidenceIds,
  }));
  const domains = ["健康", "语言", "社会", "科学", "艺术"] as const;

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
    gameExperience: [{
      dimension: /搭|比较|调整|尝试|解决/.test(observation.teacher_observation) ? "问题解决" : "计划与意图",
      evidence: primaryEvidence,
      evidenceIds: generalEvidenceIds,
      possibleExperience: observation.teacher_identification || `幼儿可能正在围绕“${observation.theme}”形成计划、尝试或表达经验。`,
      limitation: "本次仅记录一个情境，尚不能说明该经验已经稳定或能够跨情境迁移。",
    }],
    domainExperiences: domains.map((domain) => {
      const cardsForDomain = matched.filter((card) => card.domain === domain);
      return {
        domain,
        evidence: cardsForDomain.length ? primaryEvidence : "",
        evidenceIds: cardsForDomain.length ? generalEvidenceIds : [],
        possibleExperience: cardsForDomain.length ? `本次行为可与${domain}领域的“${cardsForDomain.map((card) => card.title).join("、")}”联系理解。` : "本次没有足够直接证据，不作领域判断。",
        indicatorCodes: cardsForDomain.map((card) => card.code),
        missingEvidence: cardsForDomain[0]?.evidence_requirements[0] ?? `需要补充与${domain}领域直接相关的可见行为证据。`,
        noJudgment: cardsForDomain.length === 0,
      };
    }),
    learningDispositions: [{
      dimension: /问|试|观察|探索|发现/.test(observation.teacher_observation) ? "好奇与探究" : "主动性",
      evidence: primaryEvidence,
      evidenceIds: generalEvidenceIds,
      possibleExperience: "本次出现了可继续观察的学习品质线索，需要比较支持变化前后的主动行动。",
      confidence: 0.68,
    }],
    learningPossibilities: ["支持幼儿把当前行动转化为更清晰的计划、比较或表达", "在相近和不同情境中验证经验是否能够再次使用"],
    gamePossibilities: ["延长当前游戏，使幼儿有时间重复、调整和验证", "增加一个可控变量，观察幼儿是否生成新的问题和玩法"],
    responsePlans,
    observationCut: responsePlans.slice(0, 2).map((plan) => plan.observationCut),
    observationFocus: responsePlans[0]!.observationFocus,
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

const labelValue = (text: string, labels: string[]) => {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return text.match(new RegExp(`(?:${escaped})[：:]?\\s*([^\\n]{1,300})`, "i"))?.[1]?.trim() ?? "";
};

export function buildScenarioObservationExtraction(input: ObservationDocumentExtractionInput): ObservationDocumentExtraction {
  const text = input.rawText.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  const namedChildren = input.classroomChildren.filter((child) => text.includes(child.displayName));
  const objective = labelValue(text, ["客观白描", "观察记录", "观察实录", "游戏过程", "幼儿表现"]);
  const identification = labelValue(text, ["识别", "分析", "教师分析", "经验分析"]);
  const response = labelValue(text, ["应答", "支持策略", "教师支持", "调整策略"]);
  const nextFocus = labelValue(text, ["下一次观察", "观察重点", "后续观察"]);
  const confidenceFor = (value: string, high = 0.82) => value ? high : 0.25;
  return {
    observerName: labelValue(text, ["观察教师", "观察者", "教师"]),
    occurredAtText: labelValue(text, ["观察时间", "时间", "日期"]),
    scene: labelValue(text, ["游戏场地", "观察地点", "游戏区域", "区域"]),
    theme: labelValue(text, ["游戏主题", "主题名称", "主题"]),
    organizationStage: "process",
    subjects: namedChildren.map((child, index) => ({ displayName: child.displayName, contextualFeature: "", role: index === 0 ? "primary" : "participant" })),
    unlistedParticipantCount: 0,
    groupContext: labelValue(text, ["游戏背景", "情境", "活动背景"]),
    objectiveObservation: objective || text.slice(0, 10000),
    teacherIdentification: identification,
    teacherResponseDraft: response,
    nextObservationFocus: nextFocus,
    fieldConfidence: {
      observerName: confidenceFor(labelValue(text, ["观察教师", "观察者", "教师"])),
      occurredAtText: confidenceFor(labelValue(text, ["观察时间", "时间", "日期"])),
      scene: confidenceFor(labelValue(text, ["游戏场地", "观察地点", "游戏区域", "区域"])),
      theme: confidenceFor(labelValue(text, ["游戏主题", "主题名称", "主题"])),
      subjects: namedChildren.length ? 0.9 : 0.2,
      objectiveObservation: confidenceFor(objective, objective ? 0.86 : 0.45),
      teacherIdentification: confidenceFor(identification),
      teacherResponseDraft: confidenceFor(response),
      nextObservationFocus: confidenceFor(nextFocus),
    },
    warnings: [
      "这是字段提取草稿，不是幼儿发展分析。",
      ...(!namedChildren.length ? ["未能与当前班级幼儿姓名自动匹配，请教师手动选择。"] : []),
      ...(!identification ? ["未识别到教师原始识别，请核对文档栏目。"] : []),
    ],
  };
}

export function buildScenarioRevision(input: AnalysisRevisionInput): AnalysisResult {
  const original = normalizeAnalysisResult(input.original);
  const notes = input.teacherFeedback.filter((item) => item.note || item.content);
  return analysisResultSchema.parse({
    ...original,
    objectiveSummary: (input.teacherFeedback.find((item) => item.section === "objective" && item.content)?.content ?? original.objectiveSummary).slice(0, 4000),
    warnings: [...original.warnings.filter((item) => !item.startsWith("教师反馈")).slice(0, 7), `教师反馈修订：本版参考了${notes.length}条教师意见，仍需教师再次确认。`],
  });
}

export function buildScenarioActivityOptions(input: CurriculumActivityOptionsInput): CurriculumActivityOptions {
  const baseQuestion = input.observations.map((item) => item.teacher_response?.nextObservationFocus).find(Boolean) ?? `幼儿还想怎样继续探究“${input.theme}”？`;
  const directions: Array<[string, string, string]> = [
    ["材料变量实验室", "通过改变一种材料变量继续比较和验证", "自然"],
    ["同伴协作任务", "通过协商、分工和共同记录扩展社会性探究", "社会"],
    ["生活情境迁移", "把游戏中的问题带到真实生活情境中验证", "生活"],
    ["表达与展览", "通过图示、作品、讲述或表演回顾和生成新问题", "自我"],
  ];
  return { options: directions.map(([title, valuePoint, dimension], index) => ({
    title: `${input.theme}·${title}`,
    valuePoint,
    coreQuestion: index === 0 ? baseQuestion : `怎样从“${input.theme}”中继续发现与${dimension}有关的新问题？`,
    socialNatureSelf: {
      社会: index === 1 ? ["协商分工", "共同记录与分享"] : [],
      自然: index === 0 ? ["比较材料特性", "观察变化并验证"] : [],
      自我: index >= 2 ? ["表达选择和理由", "回顾并调整计划"] : [],
    },
    developmentLinks: ["依据连续观察选择相关《指南》知识卡，不为幼儿生成综合评分"],
    mainActivities: ["回顾来源观察并由幼儿确认真实问题", `围绕“${title}”开展一次开放游戏`, "分享新发现并决定下一次走向"],
    materials: index === 0 ? ["同类不同形态材料", "比较记录卡", "照片或图示工具"] : ["开放材料", "角色或任务标识", "记录与展示材料"],
    teacherSupport: ["以提问和资源提供支持，不预设唯一答案", "记录幼儿问题、策略和支持前后变化"],
    observationFocus: ["幼儿是否持续提出相关问题", "是否出现新的材料使用、协作或表达方式"],
    riskNote: "该方向是可修改的课程地图，不应替代幼儿真实兴趣或变成统一活动清单。",
  })) };
}

export function buildScenarioCurriculumPlan(input: CurriculumPlanGenerationInput): CurriculumPlanContent {
  const optionTitles = input.selectedOptions.map((item) => item.title);
  return {
    themeOrigin: {
      coreEmergencePoint: `幼儿围绕“${input.theme}”在多个时间点持续提出问题、尝试方法或形成共同兴趣。`,
      sourceDescription: `本计划来源于${input.observationCount}条教师已终审观察，涉及${input.childCount}名幼儿和${input.timePointCount}个时间点；教师选择了“${optionTitles.join("、")}”作为可继续探究的方向。`,
      evidenceReferences: input.evidenceObservationIds,
    },
    coreCompetencies: {
      与自然同生: input.selectedOptions.flatMap((item) => item.socialNatureSelf.自然).slice(0, 8),
      与生活同生: input.selectedOptions.flatMap((item) => item.socialNatureSelf.社会).slice(0, 8),
      与自我同生: input.selectedOptions.flatMap((item) => item.socialNatureSelf.自我).slice(0, 8),
      qualities: { 慧创生: ["探究", "细致"], 懂生活: ["独立", "自律"], 悦生长: ["愉悦", "自豪"] },
    },
    generatedPossibilities: {
      presetDirections: input.selectedOptions.map((item) => `${item.title}：${item.valuePoint}`),
      mindMap: input.selectedOptions.map((item) => ({ branch: item.title, activities: item.mainActivities })),
      opennessNote: "本计划是地图而非铁轨。教师根据幼儿新问题调整方向，未发生的预设活动不作为实施要求。",
    },
    implementationFramework: {
      teacherSupportAndQuestions: input.selectedOptions.flatMap((item) => item.teacherSupport).slice(0, 12),
      anticipatedChildActivities: input.selectedOptions.flatMap((item) => item.mainActivities).slice(0, 12),
      environmentAndMaterials: input.selectedOptions.flatMap((item) => item.materials).slice(0, 12),
      experienceAndNewDirections: input.selectedOptions.map((item) => item.coreQuestion),
    },
    resources: {
      environment: ["保留可持续探究的班级区域，并随幼儿问题动态调整"],
      materials: input.selectedOptions.flatMap((item) => item.materials).slice(0, 12),
      familyPartnership: ["邀请家庭提供与幼儿当前问题直接相关的生活经验或安全材料", "家庭反馈只作为补充观察，不替代园内证据"],
      processActivities: optionTitles,
      sharedOutcomes: ["幼儿问题与探究路径图", "过程照片、作品、原话与教师反思"],
    },
    adjustmentBasis: ["幼儿是否持续主动参与并生成新问题", "材料、同伴或教师支持变化后是否出现新的行动证据", "每轮循环结束后由教师决定继续、调整或停止"],
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

export function buildScenarioClassroomReport(input: ClassroomReportGenerationInput): ClassroomReportContent {
  const observationIds = new Set(input.observations.map((item) => item.id));
  const analyses = input.analyses.filter((item) => observationIds.has(item.observation_id));
  const evidenceGaps = analyses.flatMap((item) => item.structured_result?.evidenceGaps ?? []);
  const nextObservation = analyses.flatMap((item) => item.structured_result?.nextObservation ?? []);
  const uncoveredDomains = Object.entries(input.metrics.domainEvidence)
    .filter(([, count]) => count === 0)
    .map(([domain]) => domain);
  const nextSuggestions = [
    ...mostFrequent(nextObservation, 5),
    ...(uncoveredDomains.length ? [`补充${uncoveredDomains.join("、")}领域的真实游戏证据。`] : []),
    ...(input.metrics.observedChildCount < input.metrics.totalChildCount
      ? [`优先为尚未覆盖的${input.metrics.totalChildCount - input.metrics.observedChildCount}名幼儿创造自然观察机会。`]
      : []),
  ].slice(0, 8);
  return {
    title: `${input.classroomName}游戏学习班级画像`,
    evidenceBoundary: "只汇总班级中经教师终审采用的多幼儿、多时间点证据，不展示幼儿排名、综合分数或个体比较。",
    observationCoverage: `${input.metrics.observationCount}次观察，覆盖${input.metrics.observedChildCount}/${input.metrics.totalChildCount}名幼儿、${input.metrics.sceneCoverage.length}类游戏场景和${input.metrics.timePointCount}个日期。`,
    ...input.metrics,
    commonInterests: mostFrequent(input.observations.map((item) => item.theme), 6),
    recurringQuestions: mostFrequent(evidenceGaps, 6),
    nextSuggestions: nextSuggestions.length ? nextSuggestions : ["继续积累多幼儿、多场景的连续观察，并依据后续证据调整支持。"],
    audience: "classroom",
  };
}

export function buildScenarioCurriculum(input: CurriculumGenerationInput): CurriculumDraft {
  const identifications = input.observations.map((item) => String(item.teacher_identification ?? "")).filter(Boolean).slice(0, 8);
  const nextFocuses = input.observations.map((item) => String(item.teacher_response?.nextObservationFocus ?? "")).filter(Boolean).slice(0, 8);
  return {
    title: input.scope === "individual_support" ? `${input.theme}：个别支持线索` : `${input.theme}：持续探究课程线索`,
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
