import type {
  AIAnalysisRun,
  AnalysisClaim,
  AuditEvent,
  BaseEntity,
  Child,
  ClassReport,
  Classroom,
  CurriculumClue,
  CurriculumPlan,
  DemoSnapshot,
  EvidencePackage,
  ExportRequest,
  GamePlan,
  GrowthStatement,
  IndividualReport,
  MediaEvidence,
  ObservationFocus,
  ObservationQualityReview,
  ObservationSubject,
  ResearchActivity,
  SupportAction,
  UserAccount,
} from "../domain/types";
import { completeKnowledgeCards } from "./guideKnowledgeBase";

export const TENANT_ID = "school-sunshine";
export const DEMO_DATA_VERSION = 3003;

const NOW = "2026-08-18T09:30:00.000Z";

function entity(id: string, createdAt = NOW, createdBy = "demo-system"): BaseEntity {
  return { id, tenantId: TENANT_ID, createdAt, updatedAt: createdAt, createdBy, version: 1 };
}

export const seedClassrooms: Classroom[] = [
  { ...entity("class-1"), name: "大一班", grade: "大班", semester: "2026年秋季学期", teacherNames: ["陈老师", "王老师"] },
];

export const seedUserAccounts: UserAccount[] = [
  { ...entity("user-teacher"), name: "陈老师", role: "teacher", classroomIds: ["class-1"], status: "启用" },
  { ...entity("user-teacher-2"), name: "王老师", role: "teacher", classroomIds: ["class-1"], status: "启用" },
  { ...entity("user-research"), name: "周教研员", role: "research_admin", classroomIds: ["class-1"], status: "启用" },
  { ...entity("user-principal"), name: "沈园长", role: "principal_viewer", classroomIds: ["class-1"], status: "启用" },
  { ...entity("user-former"), name: "刘老师", role: "teacher", classroomIds: [], status: "已停用", disabledAt: "2026-07-31T10:00:00.000Z", disabledReason: "岗位调整，保留历史操作记录" },
];

const childSource = [
  ["林一诺", "诺诺", "LN", "#E6A77B", ["桥梁建构", "轨道"]],
  ["周牧川", "川川", "ZC", "#76A98F", ["水流", "管道"]],
  ["陈星禾", "星禾", "CX", "#72A7C2", ["光影", "色彩"]],
  ["赵可心", "可可", "ZK", "#D58DA8", ["医院", "角色协商"]],
  ["王知远", "远远", "WZ", "#C69B69", ["斜坡", "测量"]],
  ["李想", "想想", "LX", "#8E9ED0", ["沙水", "运输"]],
  ["孙予安", "安安", "SY", "#E0B75D", ["舞台", "故事表演"]],
  ["许乐言", "乐言", "XL", "#6CAFAE", ["自然材料", "昆虫"]],
  ["郭米乐", "米乐", "GM", "#BE8F77", ["积木", "社区道路"]],
  ["吴小满", "小满", "WX", "#87A86A", ["泥土", "种植"]],
  ["何清越", "清清", "HQ", "#8F94C4", ["绘画", "符号记录"]],
  ["郑沐阳", "阳阳", "ZM", "#D99062", ["足球", "合作规则"]],
] as const;

export const seedChildren: Child[] = childSource.map((item, index) => ({
  ...entity(`child-${index + 1}`, `2026-05-${String(5 + index).padStart(2, "0")}T08:20:00.000Z`),
  name: item[0], alias: item[1], initials: item[2], color: item[3], interests: [...item[4]],
  classroomId: "class-1", classroomName: "大一班", grade: "大班",
  birthMonth: `2020-${String((index % 10) + 1).padStart(2, "0")}`,
  consentStatus: index === 10 ? "部分授权" : "已授权",
  lastObservedAt: index < 9 ? `2026-08-${String(12 - index).padStart(2, "0")}T09:00:00.000Z` : "2026-07-16T09:00:00.000Z",
  observationCount: Math.max(1, 7 - Math.floor(index / 2)),
}));

export const seedObservationFocuses: ObservationFocus[] = [
  { id: "focus-persist", name: "持续投入与调整", group: "通用维度", description: "关注幼儿如何保持目标、发现结果差异并改变办法。", prompts: ["持续了多久？", "遇到阻碍后做了什么？", "调整前后有什么变化？"] },
  { id: "focus-problem", name: "问题解决", group: "专项观察", description: "记录问题产生、策略选择、验证与反思的完整链条。", prompts: ["问题由谁提出？", "尝试过哪些策略？", "是否使用结果继续行动？"] },
  { id: "focus-social", name: "同伴协商", group: "专项观察", description: "关注意见表达、倾听、规则形成和共同决策。", prompts: ["分歧是什么？", "幼儿如何回应同伴？", "规则是否被共同调整？"] },
  { id: "focus-represent", name: "表达与表征", group: "通用维度", description: "观察语言、动作、图画、符号和作品如何承载想法。", prompts: ["幼儿用了什么表达方式？", "表征是否帮助推进游戏？"] },
  { id: "focus-material", name: "材料探究", group: "专项观察", description: "记录材料选择、比较、组合及对材料特性的发现。", prompts: ["为什么选择该材料？", "是否比较不同材料？"] },
  { id: "focus-teacher", name: "教师介入效果", group: "通用维度", description: "区分介入前后幼儿行为，检验支持是否真正有帮助。", prompts: ["教师何时介入？", "介入后幼儿行动如何变化？"] },
];

const planStages = (theme: string) => [
  { stage: "游戏计划" as const, content: `回顾${theme}中的已有问题，由幼儿自主表达今天想继续解决什么。` },
  { stage: "游戏导入" as const, content: "开放材料并确认场地规则，不示范统一做法。" },
  { stage: "游戏过程" as const, content: "教师以连续白描记录关键事件，在安全前提下延迟介入。" },
  { stage: "游戏分享" as const, content: "邀请幼儿借助作品、照片或图画说明发现与尚未解决的问题。" },
  { stage: "游戏评价" as const, content: "教师回看证据，判断环境和支持是否需要调整。" },
];

export const seedGamePlans: GamePlan[] = [
  {
    ...entity("plan-bridge", "2026-07-18T08:00:00.000Z", "user-teacher"), classroomId: "class-1", title: "会转弯的桥", scene: "建构区", ageBand: "5-6岁",
    rationale: "幼儿连续关注车辆在弯道掉落和桥面连接问题，计划保留现场并支持其比较结构。",
    goals: [
      { id: "goal-b1", domain: "科学", statement: "在操作中比较结构变化与结果的关系", observationFocus: "是否依据测试结果调整支撑和宽度" },
      { id: "goal-b2", domain: "社会", statement: "在共同建构中表达并协商不同方案", observationFocus: "如何处理设计意见分歧" },
    ], materials: ["长板积木", "圆柱积木", "小汽车", "卷尺", "记录板"], stages: planStages("桥梁建构"),
    evaluationFocus: ["幼儿是否自主形成测量需要", "教师提问是否保留幼儿决策空间"], reflection: "继续减少成品图片提示，保留失败结构供次日复察。", status: "使用中",
  },
  {
    ...entity("plan-water", "2026-07-20T08:00:00.000Z", "user-teacher"), classroomId: "class-1", title: "水怎样走得更远", scene: "沙水区", ageBand: "5-6岁",
    rationale: "多名幼儿反复尝试连接水管和堵漏，已形成持续探究问题。",
    goals: [
      { id: "goal-w1", domain: "科学", statement: "感知坡度、接口和材料特性对水流的影响", observationFocus: "是否能预测、比较并解释结果" },
      { id: "goal-w2", domain: "语言", statement: "用语言和符号记录操作过程", observationFocus: "能否说明先后变化" },
    ], materials: ["透明水管", "连接件", "黏土", "海绵", "坡度板"], stages: planStages("引水游戏"),
    evaluationFocus: ["问题是否来自幼儿真实游戏", "记录工具是否被幼儿主动使用"], reflection: "避免变成教师演示实验。", status: "使用中",
  },
  {
    ...entity("plan-hospital", "2026-07-22T08:00:00.000Z", "user-teacher-2"), classroomId: "class-1", title: "社区医院", scene: "角色区", ageBand: "5-6岁",
    rationale: "幼儿在角色分配、候诊顺序和照顾病人方面出现真实协商需求。",
    goals: [{ id: "goal-h1", domain: "社会", statement: "协商角色和共同规则", observationFocus: "规则如何提出、使用和修订" }],
    materials: ["号码牌", "纸笔", "安全包装盒", "角色标识"], stages: planStages("社区医院"),
    evaluationFocus: ["规则是否真正服务于共同游戏"], reflection: "后续邀请保健老师交流真实工作经验。", status: "草稿",
  },
];

const packageSource = [
  ["pkg-1", "桥面第一次掉车", "2026-07-21T09:10:00.000Z", "建构区", "会转弯的桥", "plan-bridge", ["child-1", "child-5"], "待对照审核"],
  ["pkg-2", "把弯道加宽以后", "2026-07-28T09:18:00.000Z", "建构区", "会转弯的桥", "plan-bridge", ["child-1", "child-9"], "已整合"],
  ["pkg-3", "怎样堵住接口", "2026-07-23T09:35:00.000Z", "沙水区", "水怎样走得更远", "plan-water", ["child-2", "child-6"], "已整合"],
  ["pkg-4", "比较海绵和黏土", "2026-08-02T09:22:00.000Z", "沙水区", "水怎样走得更远", "plan-water", ["child-2", "child-10"], "待对照审核"],
  ["pkg-5", "号码牌由谁来发", "2026-08-05T10:03:00.000Z", "角色区", "社区医院", "plan-hospital", ["child-4", "child-7"], "教师已提交"],
  ["pkg-6", "透明片叠出了新颜色", "2026-08-08T09:42:00.000Z", "光影区", "会变色的城市", "", ["child-3", "child-11"], "教师草稿"],
  ["pkg-7", "共同修改足球规则", "2026-08-11T09:05:00.000Z", "户外运动场", "三人足球", "", ["child-12", "child-8"], "已整合"],
  ["pkg-8", "昆虫旅馆的新入口", "2026-08-12T10:20:00.000Z", "自然角", "昆虫旅馆", "", ["child-8", "child-10"], "教师已提交"],
] as const;

const teacherText: Record<string, { observation: string; quote: string; identification: string; response: string }> = {
  "pkg-1": { observation: "诺诺把两块长板搭在圆柱积木上，让小汽车从直道进入弯道。汽车连续两次从外侧掉下。她停下来看掉落位置，把外侧圆柱向里移动约一掌宽，再次放车，汽车仍在连接处掉下。远远递来一块短板，她接在缝隙上继续测试。", quote: "不是车太快，是这里有一个洞。", identification: "她已开始依据掉落位置调整支撑，并把同伴材料纳入方案；是否能稳定比较桥面宽度仍需验证。", response: "保留未完成结构和测试车辆，下一次提供卷尺与不同宽度木板，不直接示范搭法。" },
  "pkg-2": { observation: "诺诺先指着上次拍摄的桥说外面太窄。她选了两块同样长的板并排放置，请米乐扶住连接处。连续三辆车通过后，她在记录板画了三个圆圈；换成窄桥时第二辆车掉下，她画了一个叉。", quote: "宽的过了三辆，窄的第二辆就掉了。", identification: "幼儿开始用重复测试和符号记录比较宽窄桥面，策略从局部修补发展到有目的比较。", response: "支持幼儿向同伴说明记录符号，并在另一种车辆上复察这一比较策略。" },
  "pkg-3": { observation: "川川和想想连接三段透明水管。放水后接口持续滴水。川川先用手压住，松手后仍漏；他取黏土绕接口一圈，再让想想倒水，漏水明显减少。两人随后检查下一个接口。", quote: "手不能一直按，黏土可以留在这里。", identification: "幼儿能根据持续效果选择堵漏材料，并形成检查多个接口的行动顺序。", response: "增加海绵、布条等材料，支持比较材料的吸水与防水差异。" },
  "pkg-4": { observation: "川川把海绵塞在接口处，水流经过时海绵吸水变重，接口下方仍滴水。他取出海绵，指给小满看里面的水，再换成黏土包住接口。第二次放水时只出现两滴水。", quote: "海绵把水喝进去了，可是它会满。", identification: "幼儿通过观察材料状态解释堵漏结果，并根据结果更换材料。", response: "提供可画图的材料比较表，观察幼儿是否主动记录并迁移到其他接口。" },
  "pkg-5": { observation: "可可拿着号码牌站在桌边，安安说自己也想发。两人同时抓住盒子约十秒。可可提出一个人发上午、一个人发下午；安安说游戏没有下午。随后两人把号码牌分成单号和双号，各自发一叠。", quote: "那你发双数，我发单数，大家都有事情。", identification: "幼儿能提出分工办法维持共同游戏，但规则能否被其他同伴理解和使用需要继续观察。", response: "暂不评价方案，邀请候诊幼儿实际使用号码牌，并在分享环节讨论是否清楚。" },
  "pkg-6": { observation: "星禾把黄色和蓝色透明片叠在光桌上，停顿后又分开两张，重复叠放三次。清清拿来绿色画笔，星禾把叠放后的形状描在纸上。", quote: "两张放一起，影子变成绿色了。", identification: "幼儿注意到透明色片叠加后的颜色变化，并尝试用绘画保留发现。", response: "提供更多透明材料和可移动光源，观察颜色变化与光源位置的关系。" },
  "pkg-7": { observation: "三人足球中，阳阳连续两次在边线外接球。乐言指出出界后不能继续踢，阳阳说场地太小。两人用四个标志桶把边线向外移动，重新开始后共同遵守新边线。", quote: "我们把线变大一点，三个人就不会挤。", identification: "幼儿能围绕真实冲突共同调整空间规则，并在后续游戏中遵守新约定。", response: "下一次增加人数，观察幼儿是否会主动复用协商规则的方法。" },
  "pkg-8": { observation: "乐言发现昆虫旅馆入口被树叶挡住，先用手拨开，风吹后树叶再次合上。他找来两根树枝压住左右两侧，并蹲下观察约一分钟。小满提出在上面加一片树皮，两人共同调整入口。", quote: "要留一条路，但不能把里面全打开。", identification: "幼儿尝试平衡入口通行和内部遮蔽，持续关注自然材料变化。", response: "提供放大镜和连续记录卡，支持跨天观察入口变化。" },
};

export const seedEvidencePackages: EvidencePackage[] = packageSource.map((row) => ({
  ...entity(row[0], row[2], "user-teacher"), classroomId: "class-1", title: row[1], observedAt: row[2], durationMinutes: 18,
  scene: row[3], theme: row[4], observationFocusIds: row[3] === "角色区" || row[3] === "户外运动场" ? ["focus-social", "focus-persist"] : ["focus-problem", "focus-material"],
  gamePlanId: row[5] || undefined, subjectIds: row[6].map((_, index) => `subject-${row[0]}-${index + 1}`), mediaEvidenceIds: [`media-${row[0]}`],
  teacherSubmittedAt: row[7] === "教师草稿" ? undefined : row[2], status: row[7], evidenceSufficiency: row[7] === "教师草稿" ? "初步" : "中等",
}));

export const seedObservationSubjects: ObservationSubject[] = packageSource.flatMap((row) => row[6].map((childId, index) => {
  const child = seedChildren.find((item) => item.id === childId)!;
  const text = teacherText[row[0]];
  return {
    ...entity(`subject-${row[0]}-${index + 1}`, row[2], "user-teacher"), evidencePackageId: row[0], childId, childName: child.alias,
    role: index === 0 ? "主要观察" : "关联观察", visualCue: index === 0 ? `${child.alias}穿浅色上衣，位于画面中央。` : `${child.alias}主要在画面右侧参与。`,
    teacherObservation: index === 0 ? text.observation : `在同一事件中，${child.alias}向主要观察幼儿提供材料、表达意见或共同完成操作。`,
    childQuote: index === 0 ? text.quote : "", teacherIdentification: index === 0 ? text.identification : "同伴行为对共同游戏的推进具有影响，需要在后续观察中补充独立证据。",
    teacherResponseDraft: { category: row[3] === "角色区" || row[3] === "户外运动场" ? "活动支持" : "材料支持", strategy: text.response, nextObservationFocus: "支持后幼儿是否继续自主使用该策略，并能否迁移到新的材料或同伴情境。" },
  };
}));

export const seedMediaEvidence: MediaEvidence[] = packageSource.map((row, index) => ({
  ...entity(`media-${row[0]}`, row[2], "user-teacher"), evidencePackageId: row[0], type: index === 5 ? "照片" : "视频", name: index === 5 ? `${row[1]}.jpg` : `${row[1]}_关键片段.mp4`,
  mimeType: index === 5 ? "image/jpeg" : "video/mp4", size: index === 5 ? 1_240_000 : 18_500_000,
  transcript: index === 5 ? undefined : teacherText[row[0]].quote,
  events: index === 5 ? undefined : [
    { id: `event-${row[0]}-1`, startSecond: 4, endSecond: 18, category: "关键行动", objectiveDescription: teacherText[row[0]].observation.split("。")[0] + "。", possibleMeaning: "需结合前后行为和教师白描判断。", confidence: 0.89 },
    { id: `event-${row[0]}-2`, startSecond: 19, endSecond: 38, category: "策略调整", objectiveDescription: teacherText[row[0]].observation.split("。").slice(1, 3).join("。") + "。", possibleMeaning: "可能体现根据结果调整策略，仍需教师确认。", confidence: 0.82 },
  ], simulatedAnalysisStatus: index === 5 ? undefined : "已分析",
}));

const analyzedPackageIds = ["pkg-1", "pkg-2", "pkg-3", "pkg-4", "pkg-7"];
export const seedAnalysisRuns: AIAnalysisRun[] = [];
export const seedClaims: AnalysisClaim[] = [];

analyzedPackageIds.forEach((packageId, index) => {
  const subject = seedObservationSubjects.find((item) => item.evidencePackageId === packageId && item.role === "主要观察")!;
  const runId = `analysis-${packageId}`;
  const pkg = seedEvidencePackages.find((item) => item.id === packageId)!;
  const isWaterInquiry = packageId === "pkg-3" || packageId === "pkg-4";
  const referenceCodes = isWaterInquiry
    ? ["GUIDE-SCI-INQ-03-5-6", "GUIDE-SCI-INQ-02-5-6"]
    : ["GUIDE-SCI-INQ-02-5-6", "GUIDE-SOC-INT-02-5-6"];
  const claims: AnalysisClaim[] = [
    { id: `claim-${packageId}-fact`, analysisRunId: runId, subjectId: subject.id, childId: subject.childId, layer: "事实", content: subject.teacherObservation, evidenceAnchors: [{ type: "教师白描", referenceId: subject.id, label: "教师提交的原始白描" }, { type: "视频片段", referenceId: `media-${packageId}`, label: "关键片段 00:04-00:38", timestamp: "00:04-00:38" }], indicatorCodes: [], confidence: 0.96, reviewStatus: index === 0 || index === 3 ? "待审核" : "已采用" },
    { id: `claim-${packageId}-interpret`, analysisRunId: runId, subjectId: subject.id, childId: subject.childId, layer: "解释", content: subject.teacherIdentification, evidenceAnchors: [{ type: "教师白描", referenceId: subject.id, label: "连续行动与幼儿原话" }], indicatorCodes: referenceCodes, confidence: 0.82, reviewStatus: index === 0 || index === 3 ? "待审核" : "修改后采用", teacherRevision: index > 0 ? subject.teacherIdentification : undefined },
    { id: `claim-${packageId}-hypothesis`, analysisRunId: runId, subjectId: subject.id, childId: subject.childId, layer: "假设", content: "该策略能否在不同材料、同伴或场景中持续出现，需要下一轮观察验证。", evidenceAnchors: [{ type: "教师白描", referenceId: subject.id, label: "本次单一情境证据" }], indicatorCodes: ["FORMATIVE-01"], confidence: 0.61, reviewStatus: "待验证" },
  ];
  seedClaims.push(...claims);
  seedAnalysisRuns.push({
    ...entity(runId, pkg.observedAt, "scenario-ai"), evidencePackageId: packageId, subjectId: subject.id, childId: subject.childId, providerLabel: "模拟 AI 3.0",
    summary: `在“${pkg.theme}”中，${subject.childName}围绕真实问题进行了观察、尝试和调整。`, currentExperience: subject.teacherIdentification,
    interestsAndStrengths: ["持续关注游戏结果", "愿意调整原有办法", "能够用行动或语言表达发现"], evidenceGaps: ["跨场景迁移证据仍不足", "需要记录撤回教师支持后的独立表现"],
    responseSuggestions: { "经验支持": ["邀请幼儿回顾不同尝试的结果"], "材料支持": [subject.teacherResponseDraft.strategy], "活动支持": ["在分享环节支持幼儿向同伴说明办法"] },
    nextObservation: [subject.teacherResponseDraft.nextObservationFocus, "记录同伴加入后策略是否发生变化"], planAlignment: pkg.gamePlanId ? "与游戏计划中的观察重点一致，但判断仍以现场证据为准。" : "本次未关联游戏计划，不影响保存真实生成性游戏证据。",
    claimIds: claims.map((claim) => claim.id), comparison: { agreement: ["教师与 AI 均注意到幼儿依据结果调整行动"], aiAdditions: ["建议把跨情境迁移作为待验证问题"], teacherOnly: ["教师更了解材料投放背景和幼儿此前经验"], evidenceConflicts: [] },
    knowledgeVersion: "guide-cn-2012.v1.0.0", ageReference: "大班 · 5-6岁年龄段末期合理期望",
    developmentReferences: referenceCodes.map((code, referenceIndex) => ({
      indicatorCode: code,
      indicatorTitle: isWaterInquiry ? (referenceIndex === 0 ? "在探究中认识周围事物和现象" : "具有初步的探究能力") : (referenceIndex === 0 ? "具有初步的探究能力" : "能与同伴友好相处"),
      domain: isWaterInquiry || referenceIndex === 0 ? "科学" : "社会", grade: "大班", ageBand: "5-6岁",
      status: referenceIndex === 0 ? "已观察到相关表现" : "部分证据",
      evidenceStatement: referenceIndex === 0 ? "本次连续白描和关键片段出现与该目标相关的行动，但仅代表当前情境。" : "现有记录出现关联线索，尚不足以覆盖该目标的多个年龄段表现。",
      missingEvidence: "需要跨时间、跨材料或同伴情境复察，并区分独立表现与支持后表现。",
    })),
    status: index === 0 || index === 3 ? "模拟草稿" : "教师已整合",
  });
});

export const seedSupportActions: SupportAction[] = [
  { ...entity("support-1", "2026-07-21T10:00:00.000Z", "user-teacher"), childId: "child-1", childName: "诺诺", sourcePackageId: "pkg-1", sourceAnalysisRunId: "analysis-pkg-1", category: "材料支持", strategy: "提供不同宽度木板和记录板", rationale: "已有根据掉落位置调整支撑的证据，适合拓展比较经验。", plannedAction: "保留原桥，增加同长度不同宽度的木板，不示范统一搭法。", nextObservationFocus: "幼儿是否主动比较通过结果", plannedAt: "2026-07-25", implementedAt: "2026-07-28", childResponse: "主动进行三次车辆测试并用圆圈、叉记录结果。", followUpPackageId: "pkg-2", effect: "有支持证据", status: "有效" },
  { ...entity("support-2", "2026-07-23T10:00:00.000Z", "user-teacher"), childId: "child-2", childName: "川川", sourcePackageId: "pkg-3", sourceAnalysisRunId: "analysis-pkg-3", category: "材料支持", strategy: "增加吸水与防水材料", rationale: "幼儿已关注堵漏的持续效果。", plannedAction: "投放海绵、布条和黏土，支持幼儿自主比较。", nextObservationFocus: "是否依据材料状态解释结果", plannedAt: "2026-07-29", implementedAt: "2026-08-02", childResponse: "能指出海绵吸水后仍会滴水，并换回黏土。", followUpPackageId: "pkg-4", effect: "有支持证据", status: "已关联证据" },
  { ...entity("support-3", "2026-08-05T10:30:00.000Z", "user-teacher"), childId: "child-4", childName: "可可", sourcePackageId: "pkg-5", category: "活动支持", strategy: "让实际使用检验号码规则", rationale: "规则由两名幼儿形成，但其他同伴是否理解尚无证据。", plannedAction: "邀请候诊幼儿领取并使用单、双号，不先评价。", nextObservationFocus: "同伴是否理解及幼儿如何修订规则", plannedAt: "2026-08-19", status: "待实施" },
  { ...entity("support-4", "2026-08-08T10:10:00.000Z", "user-teacher"), childId: "child-3", childName: "星禾", sourcePackageId: "pkg-6", category: "材料支持", strategy: "增加透明材料和移动光源", rationale: "已出现色片叠加与图画记录。", plannedAction: "开放多种透明片和手电筒，保留上次作品。", nextObservationFocus: "是否主动比较颜色与光源位置", plannedAt: "2026-08-20", status: "待确认" },
  { ...entity("support-5", "2026-08-11T10:00:00.000Z", "user-teacher"), childId: "child-12", childName: "阳阳", sourcePackageId: "pkg-7", sourceAnalysisRunId: "analysis-pkg-7", category: "活动支持", strategy: "增加参与人数复察规则协商", rationale: "当前已有共同改变边线并遵守的证据。", plannedAction: "增加一名幼儿但不预设边线，观察协商发生。", nextObservationFocus: "能否复用共同调整规则的方法", plannedAt: "2026-08-21", status: "待复察" },
];

export const seedGrowthStatements: GrowthStatement[] = [
  { ...entity("growth-1"), childId: "child-1", domain: "科学", title: "从局部修补到有目的比较", statement: "在两次桥梁游戏中，诺诺从根据掉落位置移动支撑，发展到主动控制桥面宽度、重复测试并用符号记录结果。", level: "发展中", evidencePackageIds: ["pkg-1", "pkg-2"], supportActionIds: ["support-1"] },
  { ...entity("growth-2"), childId: "child-1", domain: "社会", title: "共同建构中的任务协调", statement: "在后续建构中能够请求同伴扶住连接处，并围绕共同测试完成分工。", level: "初现", evidencePackageIds: ["pkg-2"], supportActionIds: ["support-1"] },
  { ...entity("growth-3"), childId: "child-2", domain: "科学", title: "根据材料状态解释结果", statement: "川川从直接堵住漏水处，发展到观察材料吸水状态并据此更换方案。", level: "发展中", evidencePackageIds: ["pkg-3", "pkg-4"], supportActionIds: ["support-2"] },
  { ...entity("growth-4"), childId: "child-12", domain: "社会", title: "共同修订游戏规则", statement: "阳阳能在冲突后表达空间问题，与同伴共同调整边线并遵守新约定。", level: "初现", evidencePackageIds: ["pkg-7"], supportActionIds: ["support-5"] },
];

export const seedIndividualReports: IndividualReport[] = [
  { ...entity("report-child-1", "2026-08-15T08:00:00.000Z", "user-teacher"), childId: "child-1", childName: "诺诺", classroomId: "class-1", periodLabel: "2026年7-8月", periodStart: "2026-07-01", periodEnd: "2026-08-15", observationCoverage: "2次重点观察，覆盖建构区2个时间点。", interests: ["桥梁建构", "车辆轨道"], evidencedGrowth: ["开始依据测试结果调整结构", "尝试用符号保留比较结果"], supportAndEffect: ["教师增加不同宽度木板和记录板后，幼儿出现主动比较与记录行为"], pendingQuestions: ["该比较策略能否迁移到其他建构主题"], nextPlan: ["使用不同车辆复察", "支持向同伴解释记录符号"], familySuggestions: ["散步时观察桥面与弯道，请孩子说说怎样让车辆安全通过"], evidencePackageIds: ["pkg-1", "pkg-2"], status: "教师已审核" },
  { ...entity("report-child-2", "2026-08-15T08:00:00.000Z", "user-teacher"), childId: "child-2", childName: "川川", classroomId: "class-1", periodLabel: "2026年7-8月", periodStart: "2026-07-01", periodEnd: "2026-08-15", observationCoverage: "2次重点观察，覆盖沙水区2个时间点。", interests: ["水流", "管道连接"], evidencedGrowth: ["能关注堵漏效果是否持续", "开始根据材料状态解释结果"], supportAndEffect: ["增加多类材料后，幼儿主动比较海绵与黏土"], pendingQuestions: ["是否会用图画或符号记录材料比较"], nextPlan: ["提供材料比较卡", "复察其他接口"], familySuggestions: ["在安全用水活动中比较海绵和防水材料，并鼓励孩子描述发现"], evidencePackageIds: ["pkg-3", "pkg-4"], status: "草稿" },
];

export const seedCurriculumClues: CurriculumClue[] = [
  { ...entity("clue-bridge"), classroomId: "class-1", title: "道路为什么会让车安全通过", theme: "桥梁与道路", childIds: ["child-1", "child-5", "child-9"], evidencePackageIds: ["pkg-1", "pkg-2"], timePointCount: 2, origin: "多名幼儿持续关注弯道、连接处和车辆通过结果。", evidenceSummary: "两个时间点出现结构调整、重复测试和符号记录。", thresholdMet: true, status: "已采用" },
  { ...entity("clue-water"), classroomId: "class-1", title: "水管接口的材料秘密", theme: "水流与材料", childIds: ["child-2", "child-6", "child-10"], evidencePackageIds: ["pkg-3", "pkg-4"], timePointCount: 2, origin: "幼儿围绕漏水问题持续比较接口和材料。", evidenceSummary: "出现堵漏、材料替换和依据吸水状态解释结果的连续证据。", thresholdMet: true, status: "新线索" },
  { ...entity("clue-light"), classroomId: "class-1", title: "会变色的光影城市", theme: "光影与色彩", childIds: ["child-3", "child-11"], evidencePackageIds: ["pkg-6"], timePointCount: 1, origin: "两名幼儿将色片叠加发现转化为绘画。", evidenceSummary: "目前只有一个时间点，需要继续观察。", thresholdMet: false, status: "继续观察" },
];

export const seedCurriculumPlans: CurriculumPlan[] = [
  { ...entity("curriculum-bridge", "2026-08-16T08:00:00.000Z", "user-research"), classroomId: "class-1", clueId: "clue-bridge", title: "会转弯的路与桥", origin: "来自两轮建构游戏和3名幼儿的持续问题。", existingExperience: ["能发现车辆掉落位置", "会调整支撑和连接材料", "开始重复测试"], inquiryQuestions: ["弯道为什么更容易掉车", "怎样让连接处稳定", "怎样记录每次测试"], keyExperience: ["空间关系", "结构稳定", "测量比较", "协商表达"], environmentAndMaterials: ["长期保留建构空间", "不同宽度和长度木板", "卷尺、车辆和记录板"], possiblePathways: ["比较弯道宽度", "测试不同车辆", "共建社区道路", "邀请同伴测试并修订"], observationFocus: ["幼儿是否依据结果继续调整", "测量需求如何产生", "意见不同时如何协商"], adjustmentBasis: "路径随幼儿问题调整，不预设统一作品。", evidencePackageIds: ["pkg-1", "pkg-2"], planVersion: 2, status: "待教研确认" },
];

export const seedClassReports: ClassReport[] = [
  { ...entity("class-report-1", "2026-08-16T09:00:00.000Z", "user-teacher"), classroomId: "class-1", periodLabel: "2026年7-8月班级游戏画像", observedChildCount: 10, totalChildCount: 12, sceneCoverage: ["建构区", "沙水区", "角色区", "光影区", "户外运动场", "自然角"], commonInterests: ["结构与连接", "材料比较", "共同规则"], recurringQuestions: ["怎样让结构更稳定", "哪种材料更合适", "怎样让大家都能继续游戏"], domainEvidence: { 健康: 38, 语言: 64, 社会: 76, 科学: 88, 艺术: 42 }, supportFollowUpRate: 60, nextSuggestions: ["补充艺术和健康领域的真实游戏证据", "优先观察长期未被覆盖的2名幼儿", "继续追踪桥梁与水流课程线索"], curriculumClueIds: ["clue-bridge", "clue-water", "clue-light"], status: "草稿" },
];

export const seedKnowledgeCards = completeKnowledgeCards;

export const seedQualityReviews: ObservationQualityReview[] = [
  { ...entity("quality-1", "2026-08-17T09:00:00.000Z", "user-research"), evidencePackageId: "pkg-5", reviewerName: "周教研员", factuality: 4, specificity: 4, chronology: 5, evidenceAlignment: 4, subjectivePhrases: [], comment: "白描具有动作顺序和幼儿原话；建议补充其他幼儿实际使用号码牌后的表现。", status: "待审核" },
  { ...entity("quality-2", "2026-08-10T09:00:00.000Z", "user-research"), evidencePackageId: "pkg-4", reviewerName: "周教研员", factuality: 5, specificity: 5, chronology: 5, evidenceAlignment: 4, subjectivePhrases: ["明显减少可补充具体滴水次数"], comment: "事实、解释分层清楚，已提示教师补充可计数信息。", status: "通过" },
  { ...entity("quality-3", "2026-08-09T09:00:00.000Z", "user-research"), evidencePackageId: "pkg-6", reviewerName: "周教研员", factuality: 3, specificity: 3, chronology: 4, evidenceAlignment: 3, subjectivePhrases: ["很感兴趣"], comment: "请用可观察的停留、重复操作或原话替代概括性判断。", status: "退回修改" },
];

export const seedExportRequests: ExportRequest[] = [
  { ...entity("export-1", "2026-08-17T11:00:00.000Z", "user-teacher"), applicantName: "陈老师", classroomId: "class-1", exportType: "个体报告", objectId: "report-child-1", purpose: "与诺诺家长进行本周期成长交流", recipient: "幼儿监护人", status: "待审批" },
  { ...entity("export-2", "2026-08-12T11:00:00.000Z", "user-teacher"), applicantName: "王老师", classroomId: "class-1", exportType: "课程案例", objectId: "curriculum-bridge", purpose: "园内课程案例研讨", recipient: "园内教研组", status: "已通过", decidedBy: "周教研员", decidedAt: "2026-08-13T08:30:00.000Z", decisionNote: "仅限园内使用，隐去幼儿真实姓名。" },
];

export const seedResearchActivities: ResearchActivity[] = [
  { ...entity("research-1", "2026-08-16T14:00:00.000Z", "user-research"), title: "同一视频的观察、识别与应答对照研讨", scheduledAt: "2026-08-20T14:30:00.000Z", facilitator: "周教研员", sharedVideoTitle: "桥面第一次掉车（00:04-00:38）", focusOptions: ["事实与解释是否分开", "问题解决策略", "教师何时介入", "下一轮如何复察"],
    groupSubmissions: [
      { id: "group-1", groupName: "第一组", observation: "幼儿连续两次让汽车通过弯道，均从外侧掉下；随后移动外侧支撑。", identification: "开始关注掉落位置与支撑之间的关系。", response: "保留结构，提供不同宽度木板。", focus: "事实与解释是否分开" },
      { id: "group-2", groupName: "第二组", observation: "幼儿查看掉落处，把圆柱移动约一掌宽，并接上同伴递来的短板。", identification: "能借助同伴材料继续修补结构。", response: "邀请幼儿先说出下一次测试预测。", focus: "问题解决策略" },
      { id: "group-3", groupName: "第三组", observation: "汽车第二次掉落后，教师未立即介入，幼儿继续调整。", identification: "延迟介入为自主调整留下了时间。", response: "继续保持观察，在出现安全问题或游戏停滞时再提供最小支持。", focus: "教师何时介入" },
    ], aiComparison: ["三组都抓住了掉落、查看和调整这一连续事件。", "第一组更关注材料变量，第二组更关注同伴资源，第三组更关注教师介入时机。", "所有判断都需保留为情境化解释，不能据此形成综合能力标签。"], status: "准备中" },
];

export const seedAudits: AuditEvent[] = [
  { ...entity("audit-1", "2026-08-16T08:00:00.000Z"), actorRole: "teacher", action: "整合模拟分析", objectType: "EvidencePackage", objectId: "pkg-2", detail: "采用事实层，修改解释层，保留迁移假设待验证。" },
  { ...entity("audit-2", "2026-08-13T08:30:00.000Z"), actorRole: "research_admin", action: "通过导出审批", objectType: "ExportRequest", objectId: "export-2", detail: "限制园内使用并要求匿名化。" },
  { ...entity("audit-3", "2026-07-31T10:00:00.000Z"), actorRole: "research_admin", action: "停用账号", objectType: "UserAccount", objectId: "user-former", detail: "岗位调整；账号停用但历史操作记录保留。" },
  { ...entity("audit-4", "2026-08-17T09:00:00.000Z"), actorRole: "research_admin", action: "创建观察质量审核", objectType: "ObservationQualityReview", objectId: "quality-1", detail: "独立于 AI 结论审核教师原始观察质量。" },
];

export const seedSnapshot: DemoSnapshot = {
  classrooms: seedClassrooms,
  userAccounts: seedUserAccounts,
  children: seedChildren,
  gamePlans: seedGamePlans,
  observationFocuses: seedObservationFocuses,
  evidencePackages: seedEvidencePackages,
  observationSubjects: seedObservationSubjects,
  mediaEvidence: seedMediaEvidence,
  analysisRuns: seedAnalysisRuns,
  claims: seedClaims,
  supportActions: seedSupportActions,
  growthStatements: seedGrowthStatements,
  individualReports: seedIndividualReports,
  classReports: seedClassReports,
  curriculumClues: seedCurriculumClues,
  curriculumPlans: seedCurriculumPlans,
  knowledgeCards: seedKnowledgeCards,
  qualityReviews: seedQualityReviews,
  exportRequests: seedExportRequests,
  researchActivities: seedResearchActivities,
  audits: seedAudits,
};
