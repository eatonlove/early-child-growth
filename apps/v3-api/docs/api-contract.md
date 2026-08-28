# 同迹生产 API 契约

## 1. 通用约定

- Base path：`/api`
- 数据格式：`application/json; charset=utf-8`
- 会话：身份服务的 access/refresh token 由 API 写入 `HttpOnly` Cookie，前端不读取令牌。
- 角色：`teacher`、`researcher`。
- 数据 schema：`tongji_v3`；`tongji_v3_private` 仅保存 RLS 辅助函数，不对 Data API 暴露。
- 成功响应：单对象使用 `{ "item": ... }`，列表使用 `{ "items": [...] }`。
- 错误响应：`{ "code": "ERROR_CODE", "message": "用户可理解说明", "fields"?: {} }`。
- 所有写操作由 API 写入 `tongji_v3.audit_events`。
- 生产环境的 `GET /api/healthz` 只返回API服务状态，不公开数据库或AI内部配置；站点根路径的 `/healthz` 只表示Web容器存活。本地验证环境保留详细状态，便于检查真实AI开关。
- `GET /api/local-media` 仅在 `RUNTIME_MODE=local-lite` 下提供本地限时签名文件；生产模式固定返回404。

## 2. 身份与账号

| 方法 | 路径 | 权限 | 作用 |
|---|---|---|---|
| POST | `/auth/login` | 公开、限流 | 使用账号和密码登录，设置安全 Cookie |
| POST | `/auth/refresh` | refresh Cookie | 刷新会话 |
| POST | `/auth/logout` | 当前会话 | 注销并清除 Cookie |
| GET | `/me` | 已登录 | 返回当前角色、园所与用户资料 |
| GET | `/accounts` | 教研员 | 查看本园账号和班级分配 |
| POST | `/accounts` | 教研员 | 创建教师或教研员账号 |
| PATCH | `/accounts/:id/status` | 教研员 | 停用或恢复账号 |
| PATCH | `/accounts/:id/password` | 教研员 | 重置账号密码 |

登录请求：

```json
{
  "username": "teacher.chen",
  "password": "StrongPass123"
}
```

新增教师账号：

```json
{
  "username": "teacher.chen",
  "displayName": "陈老师",
  "role": "teacher",
  "password": "StrongPass123",
  "classroomIds": ["uuid"]
}
```

账号停用同时执行两层控制：

1. `tongji_v3.profiles.status=disabled`，使 API 中间件与 RLS 立即拒绝旧 access token。
2. 身份服务同步禁止新登录和会话刷新。

## 3. 班级与幼儿

| 方法 | 路径 | 权限 | 作用 |
|---|---|---|---|
| GET | `/classrooms` | 两角色 | 教师仅返回已分配班级，教研员返回全园班级 |
| POST | `/classrooms` | 教研员 | 新建班级 |
| PATCH | `/classrooms/:id` | 教研员 | 修改或归档班级 |
| GET | `/children?classroomId=` | 两角色 | 查看授权班级幼儿 |
| GET | `/children/import-template` | 两角色 | 下载Excel可直接打开的标准CSV导入模板 |
| POST | `/children/import` | 两角色 | 校验并批量导入同一班级幼儿，单次最多200条 |
| POST | `/children` | 两角色 | 在授权班级新增幼儿 |
| PATCH | `/children/:id` | 两角色 | 修改、转班或归档幼儿 |

## 4. 标准观察

`GET /observation-templates?grade=middle&scene=建构区` 返回适用年龄段和游戏情境的标准观察模板。教师可以采用推荐重点，也可以调整观察重点。

### 4.1 创建观察

`POST /observations`

```json
{
  "classroomId": "uuid",
  "childId": "uuid",
  "title": "会转弯的桥",
  "occurredAt": "2026-08-21T09:30:00+08:00",
  "durationMinutes": 25,
  "scene": "建构区",
  "theme": "桥梁建构",
  "organizationStage": "process",
  "observationFocus": ["材料选择与使用", "问题解决"],
  "teacherObservation": "客观白描，至少10字",
  "childQuote": "这块更稳。",
  "teacherIdentification": "教师的初步专业识别",
  "teacherResponse": {
    "category": "material",
    "strategy": "补充不同长度与形状的积木",
    "nextObservationFocus": "观察幼儿是否主动比较并说明选择理由"
  }
}
```

`organizationStage`：`plan | introduction | process | sharing | evaluation`。

`teacherResponse.category`：`experience | material | activity`。

### 4.2 媒体证据

1. `POST /observations/:id/evidence-ticket` 校验观察、授权、媒体类型和大小并创建待上传证据。
2. `POST /evidence/:id/upload` 通过同迹API受控上传到私有媒体空间，避免向浏览器暴露内部存储地址。
3. 服务端核对文件大小、媒体类型、租户和授权后将证据标记为 `ready`。
4. `GET /evidence/:id/download` 返回5分钟有效、使用公网HTTPS域名的私有查看链接。

对象路径固定为：

```text
{tenant_id}/{classroom_id}/{child_id}/{observation_id}/{random_uuid}.{ext}
```

## 5. AI 分析与教师确认

| 方法 | 路径 | 作用 |
|---|---|---|
| POST | `/observations/:id/analyze` | 按班级年龄检索知识卡，由当前AI Provider生成结构化草稿 |
| POST | `/analyses/:id/decision` | 教师对整份“观察、识别、应答”AI结果确认采用或不采用 |
| POST | `/analyses/:id/revise` | 根据教师反馈生成新的AI修订稿 |
| PATCH | `/analyses/:id/claims/:claimKey` | 兼容历史精细审阅数据，不在当前教师页面暴露 |
| POST | `/analyses/:id/finalize` | 兼容历史精细审阅数据，不在当前教师页面暴露 |

分析只接受已经提交的教师记录。`AI_MODE=qianwen` 时使用 `QianwenAIProvider`；在监护授权为 `granted` 且 `QWEN_MEDIA_ANALYSIS_ENABLED=true` 时，可将私有图片或视频的15分钟签名链接作为多模态输入。视频只分析画面，不处理音轨。生产环境默认禁止在真实 AI 失败时静默回退到模拟结果，并返回明确的服务错误；只有显式使用 `AI_MODE=scenario` 的本地演示环境才使用 `ScenarioAIProvider`。页面必须显示实际 Provider 和模型。

固定输出：

```json
{
  "objectiveSummary": "客观摘要",
  "facts": [{ "content": "事实", "evidence": "来源", "evidenceIds": ["teacher-observation"], "confidence": 0.9 }],
  "interpretations": [{ "content": "可能解释", "indicatorCode": "指标编码", "evidenceIds": ["teacher-observation"], "limitation": "证据限制", "confidence": 0.7 }],
  "hypotheses": [{ "content": "待验证假设", "nextObservation": "复察重点", "confidence": 0.6 }],
  "teacherComparison": {},
  "currentExperience": "当前经验",
  "interestsAndStrengths": [],
  "evidenceGaps": [],
  "developmentReferences": [],
  "responseSuggestions": {
    "experience": [],
    "material": [],
    "activity": []
  },
  "nextObservation": [],
  "historicalComparison": {
    "evidenceCount": 2,
    "timePointCount": 2,
    "changes": [{
      "dimension": "问题解决策略",
      "content": "与前次相比出现了新的尝试线索",
      "previousEvidenceIds": ["observation:历史观察ID"],
      "currentEvidenceIds": ["teacher-observation"],
      "confidence": 0.7
    }],
    "stablePatterns": [],
    "caution": "只进行个体跨时间比较，仍需后续验证"
  },
  "evidenceSufficiency": "有限 | 初步充分",
  "warnings": ["必须由教师确认"]
}
```

接口同时返回 `aiNotice`；`analysis_runs.provider`、`model`、`prompt_version`、`knowledge_card_ids` 和 `risk_flags` 保存本次生成的可追溯信息。千问返回的指标编码和证据ID必须在请求白名单内，否则整次结果作废并按配置回退或报错。

当前教师页面只保留整份确认：

```json
{
  "decision": "adopted",
  "note": "确认说明"
}
```

`decision` 可取 `adopted | abandoned`。AI原文保存在 `analysis_runs.structured_result`，教师确认说明和AI修订版本独立留痕。只有教师确认采用的分析才进入成长轨迹、周期报告和课程线索；不采用的分析不会成为正式证据。

## 6. AI 提示词配置

仅教研员可以查看和修改本园所的 AI 场景提示词。系统默认提示词保留在代码中，园所修改以租户覆盖配置保存，不影响其他园所。

| 方法 | 路径 | 权限 | 作用 |
|---|---|---|---|
| GET | `/ai-prompts` | 教研员 | 返回全部场景、系统默认内容、园所自定义内容、生效版本和固定安全约束 |
| PUT | `/ai-prompts/:key` | 教研员 | 保存园所自定义提示词，下一次对应 AI 调用立即生效 |
| POST | `/ai-prompts/:key/reset` | 教研员 | 删除园所覆盖配置并恢复系统默认提示词 |

当前场景编码：

```text
observation_document_extraction
observation_analysis
analysis_revision
individual_period_report
classroom_period_report
report_revision
curriculum_interest_clustering
curriculum_draft
curriculum_activity_options
curriculum_plan
```

保存请求使用乐观并发修订号，避免多人编辑时静默覆盖：

```json
{
  "systemPrompt": "不少于100字符的园所场景提示词",
  "expectedRevision": 2,
  "changeNote": "加强同伴协商行为的证据要求"
}
```

恢复默认请求：

```json
{ "expectedRevision": 3 }
```

园所提示词不能替换系统固定安全约束。每次 AI 调用都会同时注入不可修改的隐私保护、证据可追溯、禁止编造、禁止诊断与标签化、结构化输出约束。AI 结果继续保存 `promptVersion`；自定义版本格式为 `custom.<场景编码>.r<修订号>@<基础默认版本>`。保存只影响后续生成，不重写历史分析、报告或课程草案。审计日志只保存提示词哈希、长度、版本和修改说明，不复制完整提示词正文。

## 7. 知识库

`GET /knowledge?grade=middle&domain=科学&query=探究`

生产知识库包含：

- 5个领域、11个子领域、32个目标。
- 小中大班共96张年龄参照卡。
- 3张形成性评价、支架与课程生成理论卡。
- 7套标准游戏观察模板。

## 8. 成长、报告与课程

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/support-actions` | 查看教师采用AI建议后形成的待实施应答 |
| PATCH | `/support-actions/:id` | 按“实施、复察、验证、关闭”状态机记录效果证据 |
| GET | `/children/:id/growth` | 汇总该幼儿已采用观察、分析和应答效果时间轴 |
| GET | `/reports` | 查看权限范围内的周期报告 |
| POST | `/reports/generate` | 生成个体教师版、个体家长版或班级证据画像工作稿 |
| PATCH | `/reports/:id` | 教师直接修改报告叙述内容 |
| POST | `/reports/:id/revise` | AI按照教师意见修订报告，不改变系统统计指标 |
| DELETE | `/reports/:id` | 教师直接删除报告 |
| GET | `/curriculum-clues` | 查看多幼儿、多时间点课程线索 |
| POST | `/curriculum-clues/scan` | 先按主题、场景和教师识别进行可解释语义聚类，再按证据门槛生成课程草案 |
| PATCH | `/curriculum-clues/:id` | 保存可编辑课程草案新版本并推进状态 |

个体报告至少需要2条、跨2个日期的教师确认证据。班级报告至少需要覆盖2名幼儿、2条观察和2个日期；覆盖人数、场景、五大领域证据条数、支持复察率和课程线索由系统计算，AI只提炼共同兴趣、持续问题和下一步建议。报告不设审核、发布或撤回流程，教师可直接编辑、AI修订、打印为PDF或删除。课程线索至少满足“2名幼儿或同一幼儿3次观察”，并跨越不少于2个时间点；系统只生成可修改草案。

观察记录和课程计划Word采用即时生成：

| 方法 | 路径 | 作用 |
|---|---|---|
| POST | `/observations/:id/document-exports` | 直接生成教师原稿版或专业版观察Word |
| POST | `/curriculum-plans/:id/document-exports` | 直接生成课程计划Word |
| GET | `/document-exports/:id/download` | 获取当前用户有权访问的下载地址 |

## 9. 教研活动模式

| 方法 | 路径 | 权限 | 作用 |
|---|---|---|---|
| GET | `/research-activities` | 两角色 | 查看全园或本人班级可参加的活动及小组记录 |
| POST | `/research-activities` | 教研员 | 创建全园或班级教研活动 |
| PATCH | `/research-activities/:id` | 教研员 | 开始、结束、归档并保存对照总结 |
| POST | `/research-activities/:id/entries` | 两角色 | 活动进行中独立提交观察、识别和应答 |

每名参与者在同一活动只保留一份可更新的独立记录。活动结束后停止新增和修改，避免事后改写原始判断。

## 10. 关键错误码

| Code | 含义 |
|---|---|
| `AUTH_REQUIRED` | 未登录 |
| `ACCOUNT_DISABLED` | 账号已停用 |
| `RESEARCHER_REQUIRED` | 需要教研员权限 |
| `VALIDATION_ERROR` | 字段校验失败 |
| `CONSENT_WITHDRAWN` | 授权已撤回，禁止新增媒体 |
| `KNOWLEDGE_NOT_READY` | 年龄段知识库未初始化 |
| `ANALYSIS_DECISION_FAILED` | AI结果已处理或事务失败 |
| `MEDIA_TOO_LARGE` | 媒体超过限制 |
| `RESEARCH_ACTIVITY_NOT_OPEN` | 教研活动尚未开始或已经结束 |
| `REPORT_EVIDENCE_INSUFFICIENT` | 指定周期没有教师已采用的正式证据 |
| `FOLLOW_UP_EVIDENCE_REQUIRED` | 应答效果验证缺少幼儿后续反应 |
| `AI_PROMPT_VERSION_CONFLICT` | 提示词已被其他教研员修改，需要刷新后重试 |
