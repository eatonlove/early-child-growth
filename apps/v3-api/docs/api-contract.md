# 童迹 3.0 生产 API 契约

## 1. 通用约定

- Base path：`/api`
- 数据格式：`application/json; charset=utf-8`
- 会话：Supabase Auth access/refresh token 由 API 写入 `HttpOnly` Cookie，前端不读取令牌。
- 角色：`teacher`、`researcher`。
- 数据 schema：`tongji_v3`；`tongji_v3_private` 仅保存 RLS 辅助函数，不对 Data API 暴露。
- 成功响应：单对象使用 `{ "item": ... }`，列表使用 `{ "items": [...] }`。
- 错误响应：`{ "code": "ERROR_CODE", "message": "用户可理解说明", "fields"?: {} }`。
- 所有写操作由 API 写入 `tongji_v3.audit_events`。

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
2. Supabase Auth `ban_duration`，阻止新登录和刷新。

## 3. 班级与幼儿

| 方法 | 路径 | 权限 | 作用 |
|---|---|---|---|
| GET | `/classrooms` | 两角色 | 教师仅返回已分配班级，教研员返回全园班级 |
| POST | `/classrooms` | 教研员 | 新建班级 |
| PATCH | `/classrooms/:id` | 教研员 | 修改或归档班级 |
| GET | `/children?classroomId=` | 两角色 | 查看授权班级幼儿 |
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

1. `POST /observations/:id/evidence-ticket` 获取2小时有效的Supabase签名上传凭证。
2. 浏览器使用签名凭证直接上传到私有 bucket，不经过轻量服务器内存。
3. `POST /evidence/:id/complete` 校验对象存在并将证据标记为 `ready`。
4. `GET /evidence/:id/download` 返回5分钟有效的私有查看链接。

对象路径固定为：

```text
{tenant_id}/{classroom_id}/{child_id}/{observation_id}/{random_uuid}.{ext}
```

## 5. AI 分析与教师选择

| 方法 | 路径 | 作用 |
|---|---|---|
| POST | `/observations/:id/analyze` | 按班级年龄检索知识卡并生成模拟AI草稿 |
| POST | `/analyses/:id/decision` | 教师对整份AI结果选择采用或放弃 |

分析只接受已经提交的教师记录。当前 `ScenarioAIProvider` 不读取真实视频画面或音轨。

固定输出：

```json
{
  "objectiveSummary": "客观摘要",
  "facts": [],
  "interpretations": [],
  "hypotheses": [],
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
  "evidenceSufficiency": "有限 | 初步充分",
  "warnings": []
}
```

采用请求：

```json
{
  "decision": "adopted",
  "note": "教师采用理由"
}
```

数据库函数 `tongji_v3.decide_analysis` 在同一事务内完成：AI结果决策、观察状态更新和待实施应答创建。放弃时不创建应答。

## 6. 知识库

`GET /knowledge?grade=middle&domain=科学&query=探究`

生产知识库包含：

- 5个领域、11个子领域、32个目标。
- 小中大班共96张年龄参照卡。
- 3张形成性评价、支架与课程生成理论卡。
- 7套标准游戏观察模板。

## 7. 成长、报告与课程

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/support-actions` | 查看教师采用AI建议后形成的待实施应答 |
| PATCH | `/support-actions/:id` | 按“实施、复察、验证、关闭”状态机记录效果证据 |
| GET | `/children/:id/growth` | 汇总该幼儿已采用观察、分析和应答效果时间轴 |
| GET | `/reports` | 查看权限范围内的周期报告 |
| POST | `/reports/generate` | 从指定周期内已采用证据生成教师版或家长版草稿 |
| PATCH | `/reports/:id/status` | 完成审核、发布或撤回 |
| GET | `/curriculum-clues` | 查看多幼儿、多时间点课程线索 |
| POST | `/curriculum-clues/scan` | 按持续兴趣和证据门槛扫描班级课程线索 |
| PATCH | `/curriculum-clues/:id` | 保存可编辑课程草案新版本并推进状态 |

报告没有已采用证据时拒绝生成。课程线索至少满足“2名幼儿或同一幼儿3次观察”，并跨越不少于2个时间点；系统只生成可修改草案。

## 8. 教研治理

### 8.1 观察质量审核

| 方法 | 路径 | 权限 | 作用 |
|---|---|---|---|
| GET | `/quality-reviews` | 教研员 | 返回已提交观察及其独立质量审核状态 |
| POST | `/quality-reviews` | 教研员 | 按事实性、具体性、时序性、证据匹配四维保存审核 |

质量审核不得改写教师原稿，也不得评价幼儿能力。状态为 `pending | passed | revision_requested`。

### 8.2 导出审批

| 方法 | 路径 | 权限 | 作用 |
|---|---|---|---|
| GET | `/export-requests` | 两角色 | 教师查看本人申请，教研员查看全园申请 |
| POST | `/export-requests` | 两角色 | 申请导出报告、课程案例或匿名研究数据 |
| PATCH | `/export-requests/:id/decision` | 教研员 | 批准或拒绝，并保存用途限制与匿名化条件 |

审批通过不自动扩大使用范围；系统记录申请对象、用途、接收方、去标识要求和决定。

### 8.3 教研活动模式

| 方法 | 路径 | 权限 | 作用 |
|---|---|---|---|
| GET | `/research-activities` | 两角色 | 查看全园或本人班级可参加的活动及小组记录 |
| POST | `/research-activities` | 教研员 | 创建全园或班级教研活动 |
| PATCH | `/research-activities/:id` | 教研员 | 开始、结束、归档并保存对照总结 |
| POST | `/research-activities/:id/entries` | 两角色 | 活动进行中独立提交观察、识别和应答 |

每名参与者在同一活动只保留一份可更新的独立记录。活动结束后停止新增和修改，避免事后改写原始判断。

## 9. 关键错误码

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
| `EXPORT_REQUEST_DECISION_FAILED` | 导出申请无权处理或已经处理 |
| `REPORT_EVIDENCE_INSUFFICIENT` | 指定周期没有教师已采用的正式证据 |
| `FOLLOW_UP_EVIDENCE_REQUIRED` | 应答效果验证缺少幼儿后续反应 |
