# 同迹 AI 输入输出接口、Prompt 与需求符合度

> 更新日期：2026-08-28
> 适用范围：观察表提取、逐幼儿游戏分析、AI修订、个体与班级报告、报告修订、兴趣聚类、课程草案、课程活动方向、深度课程计划
> 原则：AI输出均为建议稿；权限、证据门槛、审核、发布和导出由业务系统控制
> 术语说明：需求中的 `promotion` 本文按 `prompt（提示词）` 理解

## 1. 总体结论

本轮实现后，AI链路已覆盖：

- 观察文档结构化提取；
- 多幼儿观察按幼儿独立分析；
- 固定专业结构与证据引用；
- 教师分板块审核、逐条证据追溯和AI V2修订；
- 每名幼儿固定3套完整应答方案；
- 历史观察对比；
- 个体教师版、家长版和班级周期报告；
- 语义兴趣聚类、4个课程活动方向和深度课程计划；
- 教研员审核后的园所专业经验检索。

系统仍禁止AI自动发布结论、自动选择应答、自动形成课程或直接判定儿童“达标/不达标”。年龄段指标用于提供参照和下一步观察方向，不等同于测验量表。

## 2. 知识库如何提供给模型

知识库不以整个数据库、文档链接或向量库账号直接交给模型。后端先根据班级年龄段、游戏场景、主题和观察重点检索相关知识卡，再以精简JSON上下文放入单次请求。

单张知识卡结构：

```ts
interface KnowledgeRow {
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
```

后端规则：

1. 只发送本次检索命中的卡片。
2. 模型只能引用白名单中的 `code`。
3. 指标名称、领域和年龄段由后端覆盖，不能由模型改写。
4. 国家指标与园本经验分层提供；园本经验必须为教研员已启用状态。
5. 原始影像不进入园所经验库，也不用于训练通用模型。

## 3. 观察表结构化提取

### 3.1 输入

```ts
interface ObservationDocumentExtractionInput {
  fileName: string;
  mimeType: string;
  rawText: string;
  classroomChildren: Array<{ id: string; displayName: string }>;
  mediaUrl?: string;
}
```

- DOCX优先使用文档结构解析。
- DOC使用文本提取器。
- PDF提取文本后再结构化。
- 图片可在视觉能力开启时识别，否则返回低置信度提醒。
- 姓名只在当前班级候选中匹配。

### 3.2 输出

```ts
{
  observerName: string;
  occurredAtText: string;
  scene: string;
  theme: string;
  organizationStage: "plan" | "introduction" | "process" | "sharing" | "evaluation";
  subjects: Array<{
    displayName: string;
    contextualFeature: string;
    role: "primary" | "participant" | "incidental";
  }>;
  unlistedParticipantCount: number;
  groupContext: string;
  objectiveObservation: string;
  teacherIdentification: string;
  teacherResponseDraft: string;
  nextObservationFocus: string;
  fieldConfidence: Record<string, number>;
  warnings: string[];
}
```

该接口只提取字段，不输出发展判断。教师确认后的表单才进入观察分析。

## 4. 游戏观察分析

### 4.1 单名幼儿的模型输入

一条多人观察会拆成多次分析请求，每次只针对一名幼儿：

```ts
interface ObservationAnalysisInput {
  observation: {
    teacher_observation: string;
    teacher_identification: string;
    teacher_response: {
      category: string;
      strategy: string;
      nextObservationFocus: string;
    };
    scene: string;
    theme: string;
    organization_stage: string;
    group_context?: string;
    subject_context?: string;
  };
  child: {
    id: string;
    display_name: string;
    birth_month: string;
    guardian_consent_status?: string;
  };
  classroom: { id: string; grade: "small" | "middle" | "large" };
  knowledge: KnowledgeRow[];
  evidence: Array<{
    id: string;
    evidence_type: string;
    transcript?: string;
    event_segments?: unknown;
  }>;
  media: Array<{
    id: string;
    evidenceType: "photo" | "video";
    mimeType: string;
    signedUrl: string;
  }>;
  history: HistoricalObservationEvidence[];
}
```

`subject_context`只描述该幼儿在本次游戏中的情境特征。无法从群体材料确认行为归属时，AI必须写“证据不足”，不能把群体行为平均分配给所有幼儿。

### 4.2 固定输出结构

```text
1. objectiveSummary 客观摘要
2. facts 事实及证据ID
3. interpretations 专业解释、指标与限制
4. hypotheses 待验证假设
5. teacherComparison 教师原始判断与AI补充
6. currentExperience 当前经验
7. interestsAndStrengths 兴趣与优势
8. evidenceGaps 证据缺口
9. developmentReferences 年龄段参照
10. gameExperience 七类游戏经验
11. domainExperiences 五大领域，固定5项
12. learningDispositions 六类学习品质
13. learningPossibilities 学习可能
14. gamePossibilities 游戏可能
15. responsePlans 固定3套完整方案
16. observationCut 1至2个观察切口
17. observationFocus 2至5个观察点
18. historicalComparison 跨时间变化与稳定线索
19. evidenceSufficiency 证据充分性
20. warnings 风险边界
```

五大领域始终返回5项。某领域无直接证据时：

```json
{
  "domain": "艺术",
  "evidence": "",
  "evidenceIds": [],
  "possibleExperience": "本次不作判断",
  "indicatorCodes": [],
  "missingEvidence": "需要作品、动作表现或审美表达证据",
  "noJudgment": true
}
```

### 4.3 三套应答方案

每套不是“活动、材料、经验”三选一，而是同时包含：

```ts
interface ResponsePlan {
  title: string;
  rationale: string;
  targetExperience: string[];
  activitySupport: {
    activityName: string;
    timing: string;
    objective: string;
    steps: string[];
    teacherRole: string;
    suggestedDuration: string;
  };
  materialSupport: {
    materials: Array<{ name: string; quantity: string; variable: string }>;
    placement: string;
    purpose: string;
    safetyNotes: string[];
  };
  experienceSupport: {
    suggestedQuestions: string[];
    participationMode: string;
    demonstration: string;
    withdrawalCondition: string;
  };
  observationCut: string;
  observationFocus: string[];
  adjustmentCondition: string;
  evidenceIds: string[];
}
```

教师完成分析终审后才能选择1套；系统随后生成活动、材料、经验三类实施任务。未选择方案不会进入支持追踪。

## 5. 教师审核与AI V2

主界面按七个专业板块呈现：

1. 客观事实；
2. 游戏经验；
3. 五大领域经验；
4. 学习品质；
5. 学习与游戏可能；
6. 应答方案；
7. 下一次观察。

教师可以整组采用、拒绝、标记待验证，也可展开底层证据链查看每条 Claim。教师反馈调用修订接口后生成新的 `analysis_run`，原版本转为已替代，反馈存入 `analysis_feedback_versions`，实现可追溯而非覆盖。

只有全部审核项处理完毕，教师才能终审。多人观察中，只有每名幼儿的最新分析都终审完成，观察记录才整体进入正式采用状态。

## 6. 周期报告

### 6.1 个体报告输入

- 指定幼儿和周期；
- 周期内教师已终审采用的观察和分析；
- 教师已实施的支持及复察效果；
- 证据时间点、场景和主题覆盖。

业务层强制多时间点门槛。AI只负责在已筛选证据内组织语言。

### 6.2 个体报告输出

```text
title
evidenceBoundary
observationCoverage
interests[]
evidencedGrowth[]
teacherSupport[]
pendingQuestions[]
nextPlan[]
familySuggestions[]
audience: teacher | guardian
```

### 6.3 班级报告输出

```text
observationCount / timePointCount
observedChildCount / totalChildCount
sceneCoverage[]
commonInterests[]
recurringQuestions[]
domainEvidence: 健康/语言/社会/科学/艺术
supportFollowUpRate
nextSuggestions[]
curriculumClues[]
audience: classroom
```

班级统计由后端计算，AI不能伪造人数、观察数量或覆盖率。

## 7. 课程生成

### 7.1 输入门槛

- 只使用教师已终审采用的观察；
- 至少2个时间点；
- 至少2名幼儿，或同一幼儿至少3次连续观察；
- 教师可手选证据，也可使用语义兴趣聚类。

### 7.2 第一阶段：4个活动方向

每个方向固定输出：

```text
title
valuePoint
coreQuestion
socialNatureSelf: 社会/自然/自我
developmentLinks[]
mainActivities[]
materials[]
teacherSupport[]
observationFocus[]
riskNote
```

教师选择1至3个后，才能进入第二阶段。

### 7.3 第二阶段：深度课程计划

输出包括：

- 主题缘起和证据回链；
- 与自然、生活、自我同生的核心经验；
- 预设方向、思维导图和生成留白；
- 教师支持、幼儿活动、环境材料和新方向；
- 家园与过程资源；
- 课程调整依据。

课程计划绑定园所模板版本。教师继续记录第N轮“四区七步”推进，不把AI初稿视为固定课程路径。

## 8. 园所专业经验

可沉淀类型包括教师修订、有效应答、优秀案例、课程复盘和园本知识。新增经验默认 `pending`，教研员审核后转为 `active`，不再适用时可 `disabled`。

后续AI只检索：

- 同一园所；
- 状态为启用；
- 有来源资源和证据引用；
- 适用年龄、场景或主题匹配；
- 质量分达到检索要求。

## 9. 安全与风险守卫

- JSON Schema约束模型输出，Zod二次校验。
- 事实证据ID、历史证据ID和指标编码均做白名单校验。
- 标签化、诊断、排名、总分和确定性结论触发拒绝。
- 媒体仅在监护人授权、服务器开启媒体分析且签名成功时发送。
- 私有签名URL不保存到分析快照或审计详情。
- 模型失败或结构校验失败时，可按配置显式回退模拟；不得伪装成真实AI。
- 报告发布、课程采用、Word导出均需人工操作。

## 10. 需求符合度

| 原始核心需求 | 当前实现 |
|---|---|
| 观察表与视频证据输入 | 满足；支持网页、文档导入、媒体证据 |
| 标准化AI分析 | 满足；固定结构并按幼儿独立生成 |
| 理论和年龄段知识参考 | 满足；检索知识卡并限制指标白名单 |
| 教师逐项控制AI结果 | 满足；板块审核、底层Claim与AI V2 |
| 应答设计与复察 | 满足；3套完整方案、选择后建任务 |
| 跨时间成长比较 | 满足；分析读取历史，轨迹和报告汇总 |
| 月度、学期报告 | 满足；个体教师版、家长版、班级版 |
| 连续兴趣生成课程 | 满足；语义聚类、4案选择、模板计划、N循环 |
| 园所经验积累 | 满足；人工审核后同园检索、可停用 |
| 自动判断儿童是否达标 | 不按字面实现；改为证据充分性与年龄参照，避免标签化 |

## 11. 代码位置

- AI契约：`apps/v3-api/src/ai/contracts.ts`
- JSON Schema：`apps/v3-api/src/ai/json-schemas.ts`
- 千问 Provider：`apps/v3-api/src/ai/qianwen-provider.ts`
- 模拟 Provider：`apps/v3-api/src/ai/scenario-provider.ts`
- 观察与分析：`apps/v3-api/src/routes/observations.ts`
- 扩展流程：`apps/v3-api/src/routes/evolution.ts`
- 报告与课程：`apps/v3-api/src/routes/outcomes.ts`
- Word生成：`apps/v3-api/src/documents.ts`
- 前端主流程：`apps/v3-local/src/production/evolution-pages.tsx`

## 12. AI调用的两层接口

系统存在两层接口，不能混为一谈：

```text
教师浏览器
  -> 同迹业务API（只提交资源ID、日期、教师意见等）
  -> 后端鉴权、读取数据库、筛选正式证据和知识卡
  -> AIAnalysisProvider内部接口（完整模型上下文）
  -> 千问 /chat/completions
  -> JSON Schema约束
  -> Zod业务校验与证据白名单守卫
  -> 保存分析版本、Prompt版本、模型及教师审核状态
```

前端不会直接把幼儿档案、知识库、媒体签名地址或千问密钥提交给模型。前端只调用同迹业务API，完整AI上下文由后端按当前用户权限和业务状态组装。

### 12.1 对外业务API总表

| 场景 | 同迹业务API | 前端直接输入 | 后端补充的AI输入 | 业务API输出 |
|---|---|---|---|---|
| 观察表提取 | `POST /api/observation-imports` + `POST /api/observation-imports/:id/upload` | 班级ID、文件名、MIME、大小、文件二进制 | 文档提取文本、当前班级幼儿候选、图片短时地址 | `item`、结构化字段、`aiNotice` |
| 逐幼儿观察分析 | `POST /api/observations/:id/analyze` | URL中的观察ID，无请求体 | 观察、每名幼儿、年龄段知识卡、证据、媒体、历史、园所经验、分析框架 | `item`、`items[]`、`aiNotice`；多人观察每人一条分析 |
| 教师意见修订分析 | `POST /api/analyses/:id/revise` | `feedback[]` | 原分析完整结构 | 新分析版本、反馈版本、`aiNotice` |
| 个体或班级周期报告 | `POST /api/reports/generate` | 班级ID、可选幼儿ID、报告类型、起止日期 | 已采用观察、终审分析、支持效果、系统统计 | 报告数据行及 `aiNotice` |
| AI修订报告 | `POST /api/reports/:id/revise` | `instruction` | 当前报告结构；班级固定指标由后端锁定 | 修订后的报告及 `aiNotice` |
| 兴趣聚类和课程线索 | `POST /api/curriculum-clues/scan` | 班级ID | 已采用观察的主题、场景、教师识别和应答 | 保存后的课程线索 `items[]` |
| 教师选证课程线索 | `POST /api/curriculum-clues/from-evidence` | 班级ID、2至100个观察ID、可选主题 | 系统计算幼儿数、时间点和课程门槛 | 课程线索 `item`；本步骤不调用AI |
| 4个活动方向 | `POST /api/curriculum-clues/:id/activity-options` | URL中的课程线索ID | 连续观察、证据ID、年龄段知识卡 | 固定4个方向 `items[]`、`aiNotice` |
| 深度课程计划 | `POST /api/curriculum-clues/:id/plan` | 实施周期、可选模板版本ID | 选中的1至3个方向、园本模板、观察证据、知识卡 | 课程计划 `item`、`aiNotice` |

### 12.2 关键业务请求示例

生成个体报告：

```json
{
  "classroomId": "uuid",
  "childId": "uuid",
  "reportType": "teacher",
  "periodStart": "2026-08-01",
  "periodEnd": "2026-08-31"
}
```

生成班级报告时不传 `childId`，`reportType` 为 `classroom`。个体和班级报告均至少需要2条、2个日期的正式观察；班级报告还必须覆盖至少2名幼儿。

教师修订分析：

```json
{
  "feedback": [
    {
      "section": "观察-识别-应答",
      "decision": "revise",
      "note": "删除缺少直接证据的推断，补充材料调整后的观察重点"
    }
  ]
}
```

生成深度课程计划：

```json
{
  "implementationPeriod": "4周",
  "templateVersionId": "可选的园本模板版本UUID"
}
```

## 13. 后端AI Provider内部接口

当前统一接口为 `AIAnalysisProvider`：

```ts
interface AIAnalysisProvider {
  extractObservationDocument(input): Promise<AIGeneration<ObservationDocumentExtraction>>;
  analyzeObservation(input): Promise<AIGeneration<AnalysisResult>>;
  reviseAnalysis(input): Promise<AIGeneration<AnalysisResult>>;
  generateReport(input): Promise<AIGeneration<ReportContent>>;
  generateClassroomReport(input): Promise<AIGeneration<ClassroomReportContent>>;
  reviseReport(input): Promise<AIGeneration<ReportContent | ClassroomReportContent>>;
  generateCurriculum(input): Promise<AIGeneration<CurriculumDraft>>;
  generateActivityOptions(input): Promise<AIGeneration<CurriculumActivityOptions>>;
  generateCurriculumPlan(input): Promise<AIGeneration<CurriculumPlanContent>>;
  clusterInterests(input): Promise<AIGeneration<InterestClusterResult>>;
}
```

所有AI能力使用统一元数据包装：

```ts
interface AIGeneration<T> {
  data: T;
  provider: "QianwenAIProvider" | "ScenarioAIProvider";
  model: string;
  promptVersion: string;
  notice: string;
  mediaAnalyzed: boolean;
  fallbackReason?: string;
}
```

`fallbackReason`存在时代表真实千问调用失败并使用了模拟安全回退。业务数据同时保存 `provider`、`model`、`promptVersion` 和 `fallbackUsed`，不能把模拟结果伪装成真实模型结果。

## 14. 千问传输协议

千问使用 OpenAI 兼容接口：

```http
POST {QWEN_BASE_URL}/chat/completions
Authorization: Bearer {DASHSCOPE_API_KEY}
Content-Type: application/json
```

统一请求结构：

```json
{
  "model": "qwen3.7-plus-2026-05-26",
  "messages": [
    { "role": "system", "content": "场景Prompt" },
    { "role": "user", "content": "JSON上下文或多模态内容" }
  ],
  "temperature": 0.2,
  "enable_thinking": false,
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "场景Schema名称",
      "strict": true,
      "schema": "对应JSON Schema"
    }
  }
}
```

当前默认配置：

| 项目 | 当前值或规则 |
|---|---|
| 文本模型 | `qwen3.7-plus-2026-05-26` |
| 视觉/视频模型 | `qwen3.7-plus-2026-05-26` |
| 超时 | 120秒，可配置为5至300秒 |
| 自动重试 | 最多2次；仅网络错误、429和5xx重试 |
| 温度 | `0.2` |
| 深度思考 | 关闭，`enable_thinking: false` |
| 输出 | 严格JSON Schema，再经Zod二次校验 |
| 媒体数量 | 默认最多2个，配置上限3个 |
| 视频抽帧 | `fps: 1` |
| 视频音轨 | 当前不处理；只分析画面，已有人工确认转写可作为文本证据 |
| 媒体地址 | 私有对象存储900秒短时签名URL |
| 媒体前置条件 | 监护人授权为 `granted` 且服务端开启媒体分析 |

模型原始响应读取 `choices[0].message.content`。系统允许清理 Markdown JSON 围栏、双重JSON字符串和单元素对象数组，但最终业务对象必须通过严格Schema，否则本次调用失败或进入显式回退。

## 15. 当前Prompt注册表

| AI任务 | Prompt版本 | Schema名称 | 模型输入重点 |
|---|---|---|---|
| 观察表字段提取 | `observation-document-extraction.qwen.v1` | `tongji_observation_document_extraction` | 文件文本、班级幼儿候选、可选图片 |
| 逐幼儿观察分析 | `observation-analysis.qwen.v5` | `tongji_observation_analysis` | 匿名目标幼儿定位、观察聚焦、文字/图片/视频证据、历史、知识卡、园所经验、分析框架 |
| 教师反馈修订分析 | `observation-analysis-revision.qwen.v1` | `tongji_observation_analysis_revision` | 原分析和教师反馈 |
| 个体周期报告 | `period-report.qwen.v2` | `tongji_period_report` | 已采用观察、分析和应答效果 |
| 班级周期报告 | `classroom-period-report.qwen.v1` | `tongji_classroom_period_report` | 匿名班级证据和系统固定统计 |
| 报告修订 | `period-report-revision.qwen.v1` | 个体或班级报告Revision Schema | 原报告和教师编辑意见 |
| 兴趣语义聚类 | `curriculum-interest-clustering.qwen.v1` | `tongji_interest_clusters` | 观察ID、主题、场景、教师识别和应答 |
| 初步课程草案 | `curriculum-draft.qwen.v2` | `tongji_curriculum_draft` | 聚类后的多时间点观察 |
| 4个活动方向 | `curriculum-activity-options.qwen.v1` | `tongji_curriculum_activity_options` | 教师选证、知识卡和证据覆盖 |
| 深度课程计划 | `curriculum-plan-tongsheng.qwen.v1` | `tongji_curriculum_plan` | 选中方向、园本模板、知识卡和观察证据 |

### 15.1 观察表提取Prompt

核心要求：只提取，不分析；缺失字段留空；姓名只匹配当前班级候选；重名、日期或字段不确定时降低置信度并加入警告；禁止生成性格标签。

```text
你是幼儿园观察记录表字段提取助手。你只负责从教师上传的文档或图片中提取已有内容，不分析幼儿发展，不补写事实。
优先匹配输入提供的当前班级幼儿姓名；重名、不确定姓名和日期必须降低fieldConfidence并加入warnings。幼儿特征只能提取本次情境描述，不得生成性格标签。没有找到的字段输出空字符串，不得猜测。输出必须完全符合JSON Schema，不要输出Markdown。
```

### 15.2 逐幼儿观察分析Prompt

`v5`参考园所实际使用的《观察·识别·应答游戏记录表》升级，同时针对“群体记录转逐幼儿分析”补充了更严格的个体归因规则。完整运行时提示词以 [`qianwen-provider.ts`](../apps/v3-api/src/ai/qianwen-provider.ts) 中的 `observationSystemPrompt` 为准。

核心要求：

- 只分析匿名 `targetSubject`，结合其本次情境特征和证据锚点识别目标幼儿；无法区分到目标幼儿的群体行为不能写成个体事实。
- “观察”按照情境、材料与工具、可见动作与原话、问题出现、幼儿是否发起解决、尝试调整、同伴或教师互动、可见结果形成客观白描。
- 图片只证明一个可见瞬间；视频只描述可见行动序列；没有已确认音频转写时不生成对话。
- “识别”先分析已有经验、问题和策略，再关联本次允许的年龄段知识卡；使用“可与……联系理解”，不使用“符合、达到、未达到”。
- 五大领域完整返回，但不追求领域齐全；没有直接证据的领域设置 `noJudgment=true`。
- “应答”直接回应兴趣、已有经验、困难或证据缺口，并固定生成三层方案：保持观察/最低介入、材料或互动支架、经验拓展与跨情境迁移。
- 每套方案包含时机、目标经验、步骤、具体材料及变量、教师可使用的问题或参与方式、退出条件、调整条件和复察切口。
- 教师原始识别和应答原样保留；AI只补充专业分析，不覆盖教师原文。
- 单次观察一般只能形成“线索”或“部分证据”；只有多时间点证据共同支持时才可形成“较充分证据”。

```text
角色：幼儿园“观察·识别·应答·拓展”逐幼儿循证分析助手。
工作顺序：先校验目标幼儿归因，再写观察事实，再进行年龄段识别，再提出分层应答，最后给出弱化的拓展与复察方向。
安全边界：不补造事实，不把同伴行为移植给目标幼儿，不作诊断、排名、综合评分、达标判断或一次性稳定结论。
输出约束：严格遵循 tongji_observation_analysis JSON Schema，并保留证据ID、知识卡编码、限制条件、置信度和教师审核边界。
```

用户消息先发送结构化JSON，再按顺序附加最多2个图片或视频。每个媒体后追加其证据ID。视频提示明确为“只分析画面，不推断未提供的音频内容”。模型输出仍使用现有结构化Schema，因此教师审核页面和历史分析数据保持兼容。

### 15.3 分析修订Prompt

```text
你是幼儿游戏循证分析修订助手。输入包含一份AI原稿和教师对专业板块的意见。教师意见优先，但不得据此补造原始观察中不存在的事实。
保留原稿证据ID、知识编码和风险边界；拒绝的板块不得换一种说法偷偷保留。输出仍是教师审核草稿，必须符合完整JSON Schema，不得输出Markdown。
```

### 15.4 个体报告Prompt

```text
你是幼儿游戏成长报告助手。只使用教师已经采用的观察、AI分析和应答效果证据生成草稿，不新增事实，不与其他幼儿比较，不作诊断、排名、评分或达标判断。不得添加输入中不存在的日期、次数、时长、数量、幼儿原话或行为细节。
教师版强调证据覆盖、变化、支持效果和下一轮观察；家长版使用自然、易懂、非标签化语言。没有后续证据时必须明确“仍需持续观察”，不得把单次表现写成稳定能力。输出必须完全符合JSON Schema，不要输出Markdown。
```

### 15.5 班级报告Prompt

```text
你是幼儿园班级游戏循证报告助手。只使用系统提供的班级汇总指标、教师已终审采用的观察、分析和支持效果生成草稿。
报告用于改进班级环境、教师支持与生成性课程，不评价或比较具体幼儿。不得输出幼儿姓名、排名、综合分数、达标率、诊断或优良差标签。覆盖人数、观察次数、日期数、场景、五大领域证据条数、支持复察率和课程线索必须原样采用输入指标，不得改写或补造。共同兴趣、持续问题和下一步建议必须能从输入证据中找到依据。输出必须完全符合JSON Schema，不要输出Markdown。
```

### 15.6 报告修订Prompt

```text
你是幼儿游戏成长报告修订助手。你只能依据现有报告内容和教师修改意见调整结构、措辞、详略与建议，不得新增原报告中没有的幼儿行为、日期、次数、原话或发展结论。
教师意见是编辑要求，不是新的观察证据。保留非比较、非标签化和形成性评价语言。班级报告中的覆盖人数、观察次数、时间点、场景、五大领域证据数量、支持复察率和课程线索属于固定数据，不得修改。输出必须完全符合对应JSON Schema，不要输出Markdown。
```

### 15.7 兴趣聚类Prompt

```text
你是幼儿园游戏兴趣证据聚类助手。请根据主题名称、游戏场景和教师识别，将语义相近但用词不同的观察归为同一兴趣线索。
只能使用输入中提供的观察ID，每个ID最多出现一次，不得编造或省略观察。聚类依据必须说明共同的兴趣或探究问题，不能仅凭班级、幼儿身份或日期分组。输出必须完全符合JSON Schema，不要输出Markdown。
```

聚类输出：

```ts
{
  clusters: Array<{
    label: string;
    aliases: string[];
    observationIds: string[];
    rationale: string;
  }>;
}
```

后端再次校验所有观察ID必须来自本次输入且不能重复。模型遗漏的观察由系统自动补成单条暂未聚合线索。

### 15.8 初步课程草案Prompt

```text
你是幼儿园游戏生成课程助手。课程草案必须来自多幼儿或多时间点的持续游戏证据，不预设固定活动路径，不替代教师决策。
只使用输入中的兴趣、问题、教师识别和下一步观察重点，不新增幼儿行为事实。草案要保留开放性，包含材料环境、可能路径、观察重点、家庭社区资源和调整依据。不得生成幼儿排名、评分、诊断或统一完成标准。输出必须完全符合JSON Schema，不要输出Markdown。
```

### 15.9 四个课程活动方向Prompt

```text
你是幼儿园生成性课程活动方向助手。只基于教师明确选择的连续观察证据和知识卡生成4个差异化活动方向，不能添加未发生的幼儿行为。
每个方向要说明价值点、核心问题、社会/自然/自我三维关联、具体活动、材料、教师支持、观察重点和机械化推进风险。方向是供教师选择和组合的地图，不是统一活动清单。输出必须完全符合JSON Schema，不要输出Markdown。
```

### 15.10 深度课程计划Prompt

```text
你是幼儿园“同生”课程计划助手。请依据教师选中的活动方向、连续观察证据、《指南》知识和园本模板生成课程地图。
内容必须覆盖核心生发点、社会/自然/自我与园本品质、预设方向和思维导图、四区七步N循环实施准备、环境材料、家园共育和调整依据。不得把预设活动写成必须完成的铁轨，不得新增观察中没有的幼儿事实。输出必须完全符合JSON Schema，不要输出Markdown。
```

## 16. 观察分析实际送模上下文

逐幼儿分析并不是把数据库整行直接发送。当前后端整理为：

```ts
{
  analysisStandard: {
    name: "观察·识别·应答逐幼儿循证标准",
    coreOrder: [],
    observationFocusDimensions: []
  },
  ageContext: { grade, knowledgeAgeBands },
  targetSubject: {
    reference: "target-child",
    role,
    contextualFeature,
    evidenceAnchors,
    attributionBoundary
  },
  observation: {
    scene, theme, organizationStage, observationFocus,
    teacherObservation, childQuote,
    teacherIdentification, teacherResponse,
    groupContext, subjectContext
  },
  evidenceIds: {
    teacherObservation: "teacher-observation",
    childQuote: "child-quote" | null
  },
  mediaAndTranscriptEvidence: [{
    id, type, transcript, eventSegments, visualContentProvided
  }],
  adoptedHistory: [{
    evidenceId, occurredDate, scene, theme,
    teacherObservation, childQuote,
    teacherIdentification, teacherResponse,
    adoptedAnalysis
  }],
  allowedKnowledgeCards: [],
  approvedSchoolMemories: [],
  schoolAnalysisFrameworks: []
}
```

上下文数量限制：

- 当前年龄段知识库先由规则排序，观察分析最多发送12张卡。
- 课程方向和课程计划最多发送30张卡。
- 历史正式观察最多12条，且只读取当前观察发生时间之前的数据。
- 园所专业经验先读取启用记录，再按当前幼儿、班级和质量分排序，最多发送8条。
- 媒体默认最多2个；文本转写和事件片段不受媒体发送开关影响，可作为文字证据。
- 多幼儿观察为每名幼儿分别调用一次模型。模型不接收幼儿姓名或数据库ID，只接收匿名 `targetSubject`；`contextualFeature` 与 `evidenceAnchors` 用于定位该幼儿本次行为，避免把群体表现平均分配或把同伴行为移植给目标幼儿。

## 17. 输出校验与结果落库

### 17.1 模型输出后的四层校验

1. `response_format.json_schema.strict=true`：模型侧结构约束。
2. Zod：字段类型、枚举、数量和长度二次校验。
3. 业务守卫：证据ID、历史ID、知识卡编码必须属于本次白名单。
4. 风险词守卫：出现达标、不达标、排名、综合评分、诊断等词时拒绝结果。

观察分析额外由后端强制：

- 教师原始识别和应答覆盖回 `teacherComparison`，模型不能改写。
- 知识卡标题、领域和年龄段由后端白名单覆盖。
- 没有历史证据时清空成长变化与稳定模式。
- 历史证据条数、时间点数由后端重新计算。
- 固定追加“AI建议稿、教师审核、单次观察不能形成稳定结论”等风险提示。
- 群体媒体缺少目标幼儿特征和证据锚点时，固定追加个体归因风险提示。

### 17.2 保存内容

观察分析保存：模型、Provider、Prompt版本、知识版本、输入快照、知识卡ID、结构化结果、风险提示、生成者和时间。教师逐条审核、板块审核、反馈修订、新旧版本关系和最终决策单独保存，不覆盖AI原稿。

报告和课程保存AI元数据：

```json
{
  "provider": "QianwenAIProvider",
  "model": "qwen3.7-plus-2026-05-26",
  "promptVersion": "对应场景版本",
  "fallbackUsed": false
}
```

## 18. 当前接口评估与后续优化

### 18.1 已满足

- 业务API与模型接口隔离，前端不持有模型密钥。
- 观察、媒体、知识、历史和园所经验具有明确输入边界。
- 所有核心AI输出为标准化JSON，不依赖自由文本解析。
- 观察事实和专业解释具有证据及指标回链。
- 报告和课程只读取业务层筛选后的正式证据。
- 多人观察逐幼儿独立分析，教师拥有最终采用权。

### 18.2 建议继续补强

1. **Prompt集中管理**：当前Prompt硬编码在 `qianwen-provider.ts`。建议迁移到独立注册表，保存版本、内容哈希、变更说明、适用模型和回归样例。
2. **修订稿再次证据校验**：初次观察分析具备完整证据与知识白名单校验；AI修订目前主要依赖完整Schema、原稿和禁止词守卫。建议让修订接口同时读取原始输入快照，再执行同等级证据ID和知识编码校验。
3. **模型运行指标**：建议在AI元数据中补充请求ID、耗时、重试次数、输入输出Token和估算成本，便于排障和预算控制。
4. **模拟回退可见性**：保留安全回退，但教师界面应始终明显展示“真实千问”或“模拟回退”，不能只记录在数据库。
5. **独立转写能力**：当前视频分析只看画面；需要音频时应新增经教师确认的语音转写流程，再把转写文本作为独立证据输入。
6. **Prompt回归测试集**：使用脱敏固定案例验证事实不编造、五大领域无证据不判断、证据ID有效、班级指标不变和课程证据门槛。
