# 同迹生产 API 契约

## 1. 通用约定

- Base path：`/api`
- 数据格式：`application/json; charset=utf-8`
- 会话：身份服务的 access/refresh token 由 API 写入浏览器会话级 `HttpOnly` Cookie，前端不读取令牌；重新打开网页需要再次输入密码。
- 角色：`teacher`、`researcher`。
- 数据 schema：`tongji_v3`；`tongji_v3_private` 仅保存 RLS 辅助函数，不对 Data API 暴露。
- 成功响应：单对象使用 `{ "item": ... }`，列表使用 `{ "items": [...] }`。
- 错误响应：`{ "code": "ERROR_CODE", "message": "用户可理解说明", "fields"?: {} }`。
- 所有写操作由 API 写入 `tongji_v3.audit_events`。
- 生产环境的 `GET /api/healthz` 只返回API服务状态，不公开数据库或AI内部配置；站点根路径的 `/healthz` 只表示Web容器存活。本地验证环境保留详细状态，便于检查真实AI开关。
- `GET /api/local-media` 仅在 `RUNTIME_MODE=local-lite` 下提供本地限时签名文件；生产模式固定返回404。

### 课程资源库 2026年10月更新

- 资源包增加 `category`（`life`懂生活、`creation`慧创生、`growth`悦生长、历史待分类为null）与 `activity_origin`。创建请求使用 `activityOrigin`，历史 `summary` 保留兼容；标题有明确分类前缀的历史资料迁移至对应分类。
- `PATCH /api/curriculum-resource-packages/:id`：上传者或教研员修改草稿信息；已有资料可调整分类。
- `DELETE /api/curriculum-resource-packages/:id`：上传者或教研员删除草稿或退回资源，同步清理其文件和参考索引。
- `POST /api/curriculum-resource-packages/:id/assets`：使用 `application/x-tongji-resource-stream` 流式请求，query包含 `assetType,fileName,mimeType,sizeBytes`；单文件500MiB（524288000字节）。替换成功前保留原文件；失败后继续提交同一资源包。三类必需文件齐全可提交，补充文件可稍后处理。
- `GET /api/curriculum-resource-assets/:id/preview`：返回PDF/图片限时预览URL或Word文本阅读版；下载接口跳转到私有存储限时地址，避免后端缓存整份大文件。
- `GET /api/resource-categories/:category/analysis`：最近一次分析，包含状态、来源课程、模型和提示词版本、结果及资料变化提醒。
- `POST /api/resource-categories/:category/analyze`：人工主动触发，以该分类已入库资料生成后台任务，返回202。上传、归类、打开页面不会自动调用AI。
- 分类AI固定输出 `directionalContent[{title,description,sourcePackageIds}]`、`indicatorFocus[{name,focus,observableBehaviors,sourcePackageIds}]`、`limitations[]`。来源ID必须属于本次输入；指标侧重描述课程经验，不评定具体幼儿。
- 新增 `resource_category_analysis` 提示词场景，使用现有园所统一模型、可配置提示词和固定安全规则。
- 分类输出若触发幼儿标签化校验，仅依据原始课程资料自动修订一次，修订后仍须通过相同Schema、资源来源白名单和安全校验；仍失败时返回可理解的提示，不发布违规结果、不静默降级模拟，也不由上传或打开页面自动重试。
- DOCX正文按流提取，500MB含图Word无需整份载入内存；大于32MB的PDF/旧DOC可阅读或下载，分类分析提示补充DOCX文字版。扫描PDF和图片未OCR时明确记录文字缺口。

## 2. 身份与账号

| 方法 | 路径 | 权限 | 作用 |
|---|---|---|---|
| POST | `/auth/login` | 公开、限流 | 使用账号和密码登录，设置不跨浏览器会话持久化的安全 Cookie |
| POST | `/auth/refresh` | refresh Cookie | 刷新会话 |
| POST | `/auth/logout` | 当前会话 | 注销并清除 Cookie |
| GET | `/me` | 已登录 | 返回当前角色、园所与用户资料 |
| GET | `/accounts` | 教研员 | 查看本园账号和班级分配 |
| POST | `/accounts` | 教研员 | 创建教师或教研员账号 |
| PATCH | `/accounts/:id/status` | 教研员 | 停用或恢复账号 |
| PATCH | `/accounts/:id/password` | 教研员 | 重置账号密码 |
| PATCH | `/accounts/:id/classrooms` | 教研员 | 原子替换本园教师的班级范围；教研员固定为全园 |
| PATCH | `/accounts/:id/display-name` | 教研员 | `{displayName}`，1至40字，原子修改本园显示名称并记录审计；返回完整账号及班级范围，不改变登录账号、角色、密码或历史观察者快照 |

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

创建和重置密码须为10至128位，同时包含大写字母、小写字母与数字。参数不合规返回`422 VALIDATION_ERROR`及`fields`字段原因；前端必须在当前弹窗显示，不能只显示在背景页面。

修改教师班级范围请求：`{"classroomIds":["uuid"]}`。传入空数组表示暂不分配任何班级；只允许本园有效班级，已分配的归档班级可保留或移除，不能新增归档班级。重复班级被拒绝。教师不能修改范围，其他园账号无法修改，教研员范围修改返回`409 RESEARCHER_SCOPE_FIXED`。

返回`{"item":RemoteAccount}`，`item.classroom_ids`为保存后的范围。数据库函数`set_teacher_classrooms`仅后端`service_role`可执行，使用调用者权限，不提权；替换与审计同一事务，失败不丢失原范围。教师下一次请求按新范围校验，历史观察及幼儿记录不删除。

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

`GET /observations/:id` 返回 `canDelete`，标明当前账号是否为教研员或记录创建者；实际删除还会验证班级访问权限和引用状态。

`DELETE /observations/:id`：教师只能删除本人创建且仍负责的活动班级观察，教研员可删除本园观察。排队/执行中的AI任务、已有周期报告或课程引用返回 `409` 并说明原因。观察、参与幼儿关联、分析、应答及派生经验按事务删除，模板导入原文件保留并回到待校对。删除后清理该观察的私有附件，返回 `{ok:true,warning:null|string}`；清理失败路径记录于删除审计，页面明确提示，不把已成功删除伪装成失败。跨园/无权访问返回404，非创建教师返回403。


```json
{
  "classroomId": "uuid",
  "observerName": "观察教师署名",
  "subjects": [{"childId": "uuid", "role": "primary", "contextualFeature": "", "evidenceAnchors": []}],
  "occurredAt": "2026-08-21T09:30:00+08:00",
  "durationMinutes": 25,
  "scene": "建构区",
  "theme": "桥梁建构",
  "organizationStage": "process",
  "observationFocusCategory": "materials_tools",
  "observationFocus": ["材料选择与使用", "问题解决"],
  "teacherObservation": "客观白描，至少10字",
  "teacherIdentification": "教师的初步专业识别",
  "teacherResponse": {
    "category": "material",
    "strategy": "补充不同长度与形状的积木",
    "nextObservationFocus": "观察幼儿是否主动比较并说明选择理由"
  }
}
```

`organizationStage`：`plan | introduction | process | sharing | evaluation`。

`observationFocusCategory` 为教师必选的单一观察聚焦：`materials_tools`（材料与工具）、`cognition_experience`（认知与经验）、`social_experience`（交往与规则）。枚举值不变，模板解析兼容旧表述“交往与经验”。历史记录可以为空，不做追溯性猜测。

`teacherResponse.category`：`experience | material | activity`。

提交校验（网页填写与导入校对共用真实 `POST /observations` 契约）：

- `subjects`：1–30名且不能重复，必须且只能有1名 `primary`；兼容仅传 `childId` 的单人旧请求。
- `observerName`：1–80字；`scene`：1–80字；`theme`：1–120字。
- `durationMinutes`：选填；填写时为1–240的整数。留空必须省略该字段，不能转换为0。
- `teacherObservation`：10–12000字；`teacherIdentification`：5–6000字；`teacherResponse.strategy`：2–2000字；`teacherResponse.nextObservationFocus`：2–1000字。字数在去掉首尾空白后校验。
- `observationFocus`：最多12项，每项1–80字；`groupContext`：最多2000字；幼儿情境特征最多500字、每条媒体定位最多160字且每名幼儿最多20条。
- 校验失败返回422 / `VALIDATION_ERROR`，`fields`包含具体字段及可读原因。页面须在仍打开的草稿弹窗中显示这些原因并保留已填内容。服务日志仅记字段路径与校验错误码，不记录教师原稿或幼儿内容。

### 4.2 媒体证据

1. `POST /observations/:id/evidence-ticket` 校验观察、授权、媒体类型和大小并创建待上传证据。
2. `POST /evidence/:id/upload` 通过同迹API受控上传到私有媒体空间，避免向浏览器暴露内部存储地址。新客户端使用 `Content-Type: application/x-tongji-evidence-stream`，文件有界写入临时文件并流式保存，不把整段视频复制到内存；兼容旧客户端的 `application/octet-stream`。
3. 服务端核对文件大小、媒体类型、租户和授权后，在写入私有存储前执行无损优化：JPEG仅重排DCT系数并保留EXIF/ICC，PNG仅做无损压缩，MP4/MOV仅流复制重封装、不重编码画面与音轨；WebP及文档原样保存。优化结果不小于原文件时保留更小的原文件。
4. 证据记录保存 `original_size_bytes`、`optimized_size_bytes`、`optimization_status`、`optimization_mode` 和 `optimization_tool`；只有优化或原样处理成功后才标记为 `ready` 并可进入AI分析。
5. `GET /evidence/:id/download` 返回5分钟有效、使用公网HTTPS域名的私有查看链接。

手机视频可能包含无法重封装到MP4的附加数据轨道。此时先验证原视频至少有可读取的视频轨道；验证通过则逐字节保留原文件，返回 `optimization_status=not_applicable`、`optimization_mode=none`，不删轨道、不重编码。视频本身损坏仍返回422，不伪装上传成功。

观察文字保存与媒体上传分开反馈。文件失败不撤销观察、不重新确认导入任务；前端可仅重试文件，或通过现有 `evidence-ticket` 和 `upload` 接口为原观察补充媒体。进度100%仅表示浏览器文件传输完成，私有保存成功以接口返回的 `ready` 为准。

新上传凭证只返回同迹受控 `uploadPath`，不再向前端返回内部存储地址、密钥或直传令牌。`POST /evidence/:id/complete` 仅兼容升级前已经签发但未完成的历史直传记录。

对象路径固定为：

```text
{tenant_id}/{classroom_id}/{child_id}/{observation_id}/{random_uuid}.{ext}
```

## 5. AI 分析与教师确认

| 方法 | 路径 | 作用 |
|---|---|---|
| POST | `/observations/:id/analyze` | 创建后台分析任务并立即返回 `202` 与任务对象；重复提交返回同一活动任务 |
| GET | `/analysis-jobs/:id` | 读取后台分析任务的真实阶段、进度、结果ID或失败原因 |
| POST | `/analyses/:id/decision` | 教师对整份“观察、识别、应答”AI结果确认采用或不采用 |
| POST | `/analyses/:id/revise` | 根据教师反馈生成新的AI修订稿 |
| PATCH | `/analyses/:id/claims/:claimKey` | 兼容历史精细审阅数据，不在当前教师页面暴露 |
| POST | `/analyses/:id/finalize` | 兼容历史精细审阅数据，不在当前教师页面暴露 |

逐幼儿处理契约（2026-10-15）：

- `POST /observations/:id/analyze` 请求体可省略以处理全部参与幼儿，或传 `{"childIds":["uuid"]}` 只重试指定幼儿。只接受本观察中不重复的1至30名幼儿；活动任务存在时仍返回同一任务。创建任务与排队审计在数据库事务内完成。
- `analysis_jobs.subject_results` 保存每名请求幼儿的 `childId`、`status`（`queued | processing | completed | needs_more_evidence | failed`）、`explanation`、`missingInformation`、可空的 `analysisRunId`，以及新结果的 `analysisScope`（`individual | context_only`）。读取观察详情额外返回 `analysisSubjectResults`，按幼儿合并最近任务，保留未被本次单人重试覆盖的其他幼儿结果。`completed` 也可带补充建议，`missingInformation` 是可选完善清单，不代表分析失败或必须补充。
- 取消独立AI前置核对，直接分析已提供的当前文字、已确认转写和实际送入模型的授权媒体。缺少个体特征、片段定位、原话或跨时间资料不拦截整份分析。有个人证据时只分析有依据的部分；暂不能归属个人时仍生成游戏情境分析和支持建议，保存 `structured_result.analysisScope=context_only`，个人事实、发展指标及经验判断可为空。`evidenceGaps` 明确补充什么资料能让分析更完善；展示不要求教师填写内部媒体编号。
- 只有完全没有可读取的当前资料才返回 `needs_more_evidence`。情境分析属于成功结果 `status=completed`；全部完成时任务 `stage=completed`，部分技术失败或无可读资料时为 `partially_completed`。技术失败单独记录在对应幼儿，已完成结果保留。进程重启也保留完整个人结果，只清理未完成的写入。
- `PATCH /observations/:id/subjects/:childId/supplement` 请求 `{"additionalObservation":"本次补充事实","contextualFeature":"衣着或位置","evidenceAnchors":["视频定位"]}`；分别限6000字、500字、20条且每条160字，至少一项有内容。返回 `{item: observationSubject}`。只允许有访问权限的创建教师或本园教研员；活动任务期间返回409、其他教师403、跨园404。保存补充与审计原子完成，不改写原始观察；随后显式发起该幼儿的分析。
- `GET /observations/:id` 返回 `canSupplement` 供页面显示补充入口；实际操作仍由RPC校验创建者、园所、当前班级范围和任务状态。新增数据库结构继承原表RLS，两个写RPC仅供服务角色执行。
- 成长、个人报告、班级报告和课程参与人数按“幼儿与观察对应的已采用分析”过滤，不能仅依据父观察状态或参与名单。没有已采用分析的幼儿不继承群体白描作为个人轨迹；其他幼儿重试、待审核或待补充时，已有采用版本继续用于对应幼儿的正式证据。当前待审核新稿只有采用后才替代该幼儿的上一采用版本。
- 情境分析可由教师查看、确认和用于支持参考，但不作为该幼儿的个人发展证据，不计入个人成长、报告或课程的有效幼儿证据门槛，也不用于历史成长对比；补充本次个人资料后可单独生成个人分析。历史未保存 `analysisScope` 的结果保持原有行为，不追溯修改。
- 操作步骤、教师提问和其他自然语言条目不能只有逗号、句号、序号或空白。未来支持步骤可按保守规则补全并标记教师复核；事实和证据引用保持严格校验。历史标点草稿在页面提示生成新版本，采用接口返回409 / `AI_ANALYSIS_OUTPUT_INVALID`。

分析只接受已经提交的教师记录。任务入库后由服务端继续执行，不依赖浏览器页面或前端会话持续连接；页面关闭、切换或刷新不会取消任务，并可通过任务接口恢复进度。服务进程重启时，未完成任务会被安全标记为失败并删除不完整分析，教师可重新发起。

`AI_MODE=qianwen` 时使用 `QianwenAIProvider`；在监护授权为 `granted` 且 `QWEN_MEDIA_ANALYSIS_ENABLED=true` 时，可将无损优化后私有图片或视频的15分钟签名链接作为多模态输入。视频只分析画面，不处理音轨。生产环境默认禁止在真实 AI 失败时静默回退到模拟结果，并返回明确的服务错误；只有显式使用 `AI_MODE=simulated` 的本地演示环境才使用 `ScenarioAIProvider`。页面必须显示实际 Provider 和模型。

`analysis_runs.input_snapshot` 保留 `mediaAnalyzed`、`mediaExclusionReason` 与可选 `diagnostics`（总耗时、公开资料检索耗时、缓存命中、生成耗时和安全校验重试标记）。教师页面明确显示本版是否读取媒体，不能把“已上传”当成“已分析”。后台日志记录各阶段耗时，不记录密钥、签名URL或幼儿原始内容。

公开支持资料检索是辅助拓展，不替代《指南》知识卡：检索与候选摘要共同使用30秒总截止时间，超时返回空的补充来源并继续核心分析；同班、同观察、同模型和知识主题的公开支持资料最多缓存10分钟，最多32项，避免逐幼儿重复检索。个体事实、历史与应答分析仍逐幼儿独立执行，不缓存或复制其他幼儿结论。未改变用户选择的模型。

观察分析输出兼容与故障处理（2026-10-14）：

- 仅对空白的领域证据边界说明、未来应答中的教师提问与参与方式执行保守补全；说明当前证据仅支持情境内线索、仍需复察，或保留教师观察和最小必要支持。原始事实、幼儿原话、经验判断、指标和证据ID不会由该补全器生成。
- 空白提问项会移除；仍有有效提问时保持其内容，全部为空时补充中性的未来开放问题。错误字段类型和缺失判断标志仍须通过业务校验或报错，不被静默改写。
- 接受过保守补全的草稿在 `warnings` 提示教师重点核对，`diagnostics.outputRepairFields` 保存字段路径供审计；不记录原始文本。
- `QWEN_OBSERVATION_TIMEOUT_MS` 为文字观察单次生成独立超时，默认240000毫秒，上限300000毫秒；图片/视频沿用 `QWEN_VISION_TIMEOUT_MS`。结构纠错至多一次，超时不自动重复昂贵请求。
- 未通过最终输出校验的任务返回 `AI_ANALYSIS_OUTPUT_INVALID`，明确说明错误来自AI草稿；超时返回 `AI_ANALYSIS_TIMEOUT`，不把文字任务误报为图片/视频问题。原始教师观察保留。

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

## 6. AI 模型与提示词配置

仅教研员可以查看和修改本园所的统一 AI 模型与各场景提示词。模型配置只有一项，观察、报告、课程等全部 AI 场景共用；系统默认提示词保留在代码中，园所修改以租户覆盖配置保存，不影响其他园所。

| 方法 | 路径 | 权限 | 作用 |
|---|---|---|---|
| GET | `/ai-model-config` | 教研员 | 返回当前生效模型、服务端默认模型、可选模型和修订号 |
| PUT | `/ai-model-config` | 教研员 | 保存全场景共用模型，下一次所有 AI 调用立即生效 |
| GET | `/ai-credential-config` | 教研员 | 返回本园所当前密钥名称、YT/YQY配置状态及修订号，不返回密钥内容 |
| PUT | `/ai-credential-config` | 教研员 | 保存全场景共用密钥名称，下一次 AI 任务开始时采用；不改变模型 |
| GET | `/ai-prompts` | 教研员 | 返回全部场景、系统默认内容、园所自定义内容、生效版本和固定安全约束 |
| PUT | `/ai-prompts/:key` | 教研员 | 保存园所自定义提示词，下一次对应 AI 调用立即生效 |
| POST | `/ai-prompts/:key/reset` | 教研员 | 删除园所覆盖配置并恢复系统默认提示词 |

统一模型保存请求同样使用乐观并发修订号：

```json
{
  "model": "qwen3.7-flash",
  "expectedRevision": 0
}
```

模型切换只影响后续请求。每次生成结果仍保存实际使用的 `model`，历史分析、报告与课程草案不会自动重跑。

密钥选择保存请求：`{"profile":"YQY","expectedRevision":0}`。名称仅允许 `YT | YQY`，默认 `YT`。YT继续使用原服务端 `QIANWEN_API_KEY`（兼容 `DASHSCOPE_API_KEY`），YQY由后端 `QIANWEN_API_KEY_YQY` 提供。数据库仅保存名称，不保存密钥；响应仅含 `profile/defaultProfile/source/revision/updatedAt/options`，每个选项含 `value/label/configured`。页面不提供密钥查看接口。

未配置的名称返回422；并发修订冲突返回409；教师和未登录访问分别返回403/401。配置按园所隔离，仅经后端身份验证的教研员可读写。观察、文档解析、修订、个人/班级报告、课程与分类分析均在任务开始时固定该名称，后续重试、画面分析及联网参考共用同一密钥，不自动回退另一账号。正在运行的任务保持原密钥，不因页面切换被改写。

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
| GET | `/children/:id/growth` | 汇总该幼儿已采用观察、分析、应答效果、跨时间持续兴趣和班级共同兴趣 |
| GET | `/reports` | 查看权限范围内的周期报告 |
| POST | `/reports/generate` | 生成个体教师版、个体家长版或班级证据画像工作稿 |
| PATCH | `/reports/:id` | 教师直接修改报告叙述内容 |
| POST | `/reports/:id/revise` | AI按照教师意见修订报告，不改变系统统计指标 |
| DELETE | `/reports/:id` | 教师直接删除报告 |
| GET | `/curriculum-clues` | 查看多幼儿、多时间点课程线索 |
| POST | `/curriculum-clues/scan` | 先按主题、场景和教师识别进行可解释语义聚类，再按证据门槛生成课程草案 |
| PATCH | `/curriculum-clues/:id` | 保存可编辑课程草案新版本并推进状态 |
| DELETE | `/curriculum-clues/:id` | 删除课程线索及其方向、计划、循环记录；保留来源观察和媒体证据 |

个体报告至少需要2条、跨2个日期的教师确认证据。系统按五大领域、游戏经验、学习品质与问题解决形成“初现、发展中、较稳定、跨情境迁移”四阶段描述；没有足够证据时显示“待积累证据”，不生成能力分数或排名。班级报告至少需要覆盖2名幼儿、2条观察和2个日期；覆盖人数、场景、五大领域状态分布、支持复察率和课程线索由系统计算，AI只提炼共同兴趣、持续问题和下一步建议。报告不设审核、发布或撤回流程，教师可直接编辑、AI修订、打印为PDF或删除。课程线索至少满足“2名幼儿或同一幼儿3次观察”，并跨越不少于2个时间点；系统只生成可修改草案。

观察AI的公开资料补充采用可返回来源清单的联网检索结果，并可合并Crossref学术元数据。服务端只把已验证候选网址交给AI筛选，最终保留题名、作者、出版年份、来源类型和检索时间；公开资料只支持应答设计，不作为幼儿发展判断证据。

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
| `AI_MODEL_VERSION_CONFLICT` | 统一模型已被其他教研员修改，需要刷新后重试 |
| `AI_MODEL_INVALID` | 模型 ID 格式无效；仅支持3-160位字母、数字及 `. _ : / -` |

统一模型配置接口会返回常用模型建议，但建议列表不是白名单。教研员可直接输入千问控制台提供的模型 ID；系统保存格式有效的 ID，并在下一次 AI 调用时由服务商验证模型权限、额度和可用性。
