# 童迹 3.0 Web 说明

本应用包含两个构建模式：

- `local`：默认模式，使用 IndexedDB 和虚构演示数据，不依赖后端。
- `production`：连接 `apps/v3-api`，使用真实账号会话、Supabase 数据和私有媒体存储。

## 启动本地演示

```bash
npm install
npm run dev
```

默认地址为 `http://127.0.0.1:5300`。首次进入会初始化虚构演示数据。

## 启动生产前端开发模式

先启动 API，再运行：

```bash
VITE_APP_MODE=production VITE_API_BASE_URL=http://127.0.0.1:4310 npm run dev
```

生产构建：

```bash
VITE_APP_MODE=production VITE_API_BASE_URL= npm run build
```

同源部署时 `VITE_API_BASE_URL` 留空。Web容器的 `/healthz` 只检查静态站点，`/api/healthz` 与其他 `/api` 请求代理到API容器。

## 生产角色与模块

系统只保留教师和教研员两个角色。

- 教师：班级幼儿、标准观察、AI 采用或放弃、应答复察、成长轨迹、周期报告、课程线索、导出申请和教研活动。
- 教研员：除教师可见能力外，还可管理账号、班级、观察质量审核、导出审批和教研活动。

AI 当前使用模拟实现，不读取真实视频内容。知识库覆盖《3-6岁儿童学习与发展指南》五大领域、11 个子领域、32 个目标和 96 张年龄参照卡，详见 [知识库说明](guide-knowledge-base.md)。

## 验证

```bash
npm run test
npm run build
npm run test:e2e
npm run test:e2e:production
```
