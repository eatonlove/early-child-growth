# Mock 能力登记

本文件记录为开发、演示或测试保留的模拟能力。模拟能力必须有明确边界，不得在生产环境中静默启用。

| ID | 能力 | 真实契约依据 | 当前实现 | 生效范围 | 退出条件 |
| --- | --- | --- | --- | --- | --- |
| MOCK-20260827-001 | 本地 Auth | `apps/v3-api/docs/api-contract.md` 的 `/api/auth/*`、Supabase Auth 生产适配器 | PostgreSQL `auth.users`、HS256 短时访问/刷新令牌、账号创建/停用/改密 | 仅 `RUNTIME_MODE=local-lite` | 部署生产时必须使用默认 `supabase` 模式 |
| MOCK-20260827-002 | 本地 Storage | 证据上传、下载和文档导出 API；Supabase Storage 生产适配器 | Docker 文件卷、HMAC 限时下载链接、同路径存在性检查 | 仅 `RUNTIME_MODE=local-lite` | 部署生产时必须使用默认 `supabase` 模式 |
| MOCK-20260827-003 | 模拟 AI | `AIAnalysisProvider` 结构化输入输出契约、正式千问适配器 | `ScenarioAIProvider`，不调用外部模型，不分析真实画面 | 本地默认模式；配置 `ai.env` 后由真实千问适配器替代 | 真实AI验收使用 `AI_MODE=qianwen`、标准密钥且关闭模拟回退 |

## 已核对的真实服务与契约

- API 契约：`apps/v3-api/docs/api-contract.md`
- 生产数据库：Supabase Postgres，业务对象位于 `tongji_v3` schema
- 生产身份：Supabase Auth，由后端代理登录、刷新、登出和账号管理
- 生产媒体：Supabase Storage 私有桶 `tongji-v3-evidence`
- 生产 AI：千问兼容接口，密钥仅保存在后端环境变量

页面不直接调用上述 Mock；前端始终使用正式 `/api/*` 契约，由后端运行模式选择适配器。
