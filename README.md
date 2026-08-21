# 童迹 3.0：幼儿游戏循证评估系统

童迹 3.0 将幼儿园游戏中的零散观察组织为可追溯的专业闭环：

```text
观察记录 -> 教师识别 -> AI辅助分析 -> 教师采用或放弃
         -> 应答实施 -> 后续复察 -> 成长轨迹 -> 周期报告/课程线索
```

当前线上地址：[https://tongji.meidaquan.com](https://tongji.meidaquan.com)

## 当前能力

- 仅保留教师、教研员两个角色，采用账号和密码登录。
- 教研员管理账号、班级、幼儿以及教师班级权限。
- 教师按标准结构录入观察、识别和应答，可上传私有媒体证据。
- AI 当前为模拟分析，结合《3-6岁儿童学习与发展指南》知识卡输出事实、解释、待验证假设和应答建议。
- 教师决定采用或放弃 AI 草稿；未经采用的结果不进入正式成长资料。
- 支持应答实施、复察验证、成长轨迹、周期报告和课程线索生成。
- 支持观察质量审核、导出审批、账号停用和教研活动模式。
- 禁止幼儿综合评分、横向排名和诊断性结论。

## 技术架构

- Web：React 18、TypeScript、Vite
- API：Fastify、TypeScript、Zod
- 数据与认证：共享 Supabase Postgres/Auth/Storage，业务数据使用 `tongji_v3` schema 隔离
- 部署：Docker Compose、Nginx、腾讯云轻量应用服务器
- AI：`ScenarioAIProvider` 模拟实现，已保留真实模型适配边界

```text
浏览器 -> Nginx -> Web 容器 -> API 容器
                              -> Supabase Auth
                              -> Postgres/tongji_v3
                              -> 私有 Storage bucket
```

## 仓库结构

```text
apps/v3-local/       童迹 3.0 Web，包含生产模式和本地演示模式
apps/v3-api/         生产 API、知识种子、数据库迁移
deploy/tongji-v3/    Docker Compose、Nginx 和部署脚本
docs/                教育指标、AI 契约和生产架构文档
```

## 本地开发

要求 Node.js 20+、npm 10+。

```bash
npm run install:all
cp apps/v3-api/.env.example apps/v3-api/.env
npm run dev:api
npm run dev:web
```

Web 默认以本地演示模式启动，不依赖云服务。需要连接生产 API 时设置：

```bash
VITE_APP_MODE=production VITE_API_BASE_URL=http://127.0.0.1:4310 npm run dev:web
```

构建与测试：

```bash
npm run check
```

## 生产部署

生产环境使用共享 Supabase、独立 schema 和独立 Docker 网络。部署前必须创建私有 `.env`，真实密钥不得提交到 Git：

```bash
cd deploy/tongji-v3
cp .env.example .env
chmod 600 .env
./migrate.sh
./deploy.sh
./seed.sh
./bootstrap-admin.sh
```

完整步骤见 [生产部署说明](deploy/tongji-v3/README.md)，接口见 [生产 API 契约](apps/v3-api/docs/api-contract.md)。

## 专业与数据边界

- 知识库覆盖《3-6岁儿童学习与发展指南》五大领域、11 个子领域、32 个目标，以及小、中、大班 96 张年龄参照卡。
- 年龄参照用于形成性评价和后续支持设计，不等同于考试式“达标判定”。
- 单次观察只能形成待验证假设，正式结论应有跨时间、跨情境或多类型证据支持。
- 媒体位于私有 bucket，通过短时签名链接访问。
- 仓库只包含示例配置和虚构数据，不包含生产密钥或真实幼儿资料。

更多说明见 [生产架构与状态](docs/production-architecture-and-status.md) 和 [指标中心理论与设计依据](docs/indicator-center-theory-and-design-basis.md)。
