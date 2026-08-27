# 同迹 3.0 本地精简验证环境

## 目的

本环境用于在发布线上版本前完成真实前后端联调。业务表、RLS、RPC 和迁移全部使用正式代码；只有外部平台能力使用本地替代：

- 数据库：PostgreSQL 16
- 数据 API：PostgREST，执行与线上一致的 Supabase 查询和 RLS
- Auth：API 内置本地账号适配器，签发短时 JWT
- Storage：API 内置文件适配器，文件保存在 Docker 本地卷
- AI：默认使用 `ScenarioAIProvider`；也可以切换到真实千问结构化分析

这些替代能力仅在 `RUNTIME_MODE=local-lite` 时生效，线上默认仍为 Supabase Auth、Storage 和千问。

## 前置条件

- Docker Desktop 已安装并处于运行状态
- Node.js 22 与 npm
- 首次构建建议预留 4GB 磁盘；长期使用建议预留 8GB
- 常驻内存通常约 1.0-1.5GB，容器内存上限合计约 1.4GB

## 使用

```bash
npm run local:up
```

打开 <http://127.0.0.1:5300>。

本地账号：

| 角色 | 账号 | 密码 |
| --- | --- | --- |
| 教研员 | `research.admin` | `LocalResearch123!` |
| 教师 | `teacher.demo` | `LocalTeacher123!` |

常用命令：

```bash
npm run verify:local
npm run local:status
npm run local:logs
npm run local:down
npm run local:reset
```

`local:reset` 会删除本地 PostgreSQL 和媒体卷，然后恢复标准演示数据。默认模拟模式不会访问线上 Supabase、腾讯云和千问服务；只有显式配置 `ai.env` 才会调用千问。

## 调用真实千问

先创建本地 AI 配置：

```bash
cp deploy/local-lite/ai.env.example deploy/local-lite/ai.env
```

在 `deploy/local-lite/ai.env` 中将 `sk-your-key-here` 替换为千问控制台创建的标准按量付费密钥，然后运行：

```bash
npm run local:up
```

密钥文件已被 Git 忽略，不会进入前端构建或仓库。`AI_FALLBACK_TO_SIMULATED=false` 会让真实接口错误直接显示，避免测试结果被模拟数据掩盖。API 健康检查会显示 `ai.mode=qianwen`，但不会返回密钥。

默认启用真实文本分析，适用于观察白描分析、知识库结合分析、周期报告和课程草案。图片或视频分析还需要让千问服务器能够读取本地签名媒体：

1. 用 HTTPS 隧道将本机 `5300` 端口临时公开。
2. 将公开根地址写入 `LOCAL_MEDIA_PUBLIC_BASE_URL`。
3. 设置 `QWEN_MEDIA_ANALYSIS_ENABLED=true`。

未配置可访问的 HTTPS 地址时，系统会拒绝以本地真实媒体模式启动，避免生成“已分析画面”的错误印象。

## 发布前流程

1. 执行 `npm run check`，完成静态契约、单元测试和生产构建。
2. 执行 `npm run local:up`，自动完成登录、RLS、班级、幼儿和知识库冒烟验证。
3. 在浏览器完成目标业务流程验收。
4. 本地验收通过后再提交、推送并执行线上部署。

## 与生产的已知差异

- 本地 Auth 不模拟短信、邮件、远程会话撤销和 Supabase 管理台。
- 本地登出不维护服务端令牌黑名单，访问令牌最长一小时自然失效；账号停用仍会立即被资料状态拦截。
- 本地 Storage 使用签名链接和本机文件卷，不模拟对象存储 CDN、生命周期规则和跨区域容灾。
- 模拟模式不验证模型质量、额度和网络；千问模式会进行真实接口调用并直接暴露调用失败。

因此，本环境用于验证业务代码、数据约束、RLS、流程和页面，不替代上线后的外部服务连通性检查。
