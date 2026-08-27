# 同迹 3.0 AI 输入输出接口与需求符合度

> 更新日期：2026-08-27
> 适用范围：观察表提取、游戏分析、AI修订、周期报告、课程活动方向、深度课程计划
> 原则：AI输出均为建议稿；权限、证据门槛、审核、发布和导出由业务系统控制

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
