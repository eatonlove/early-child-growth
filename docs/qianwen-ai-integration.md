# 童迹3.0千问AI接入说明

## 接入场景

| 场景 | 模型输入 | 固定输出 | 人工控制 |
|---|---|---|---|
| 游戏观察分析 | 教师观察、幼儿原话、教师识别与应答、年龄段知识卡；可选授权图片/视频画面 | 事实、解释、假设、年龄参照、证据缺口、应答和复察重点 | 教师采用或放弃 |
| 周期报告 | 指定周期内教师已采用的观察、分析和应答效果 | 教师版或家长版标准报告 | 教师审核、发布或撤回 |
| 游戏课程草案 | 达到门槛的多幼儿或多时间点持续观察 | 课程缘起、问题、经验、材料环境、可能路径和调整依据 | 教师编辑、教研员审核 |

知识检索、课程证据门槛、权限校验和状态机继续由业务代码决定，不交给模型自由判断。

## Provider与回退

- `AI_MODE=qianwen`：调用千问 OpenAI 兼容接口。
- `AI_MODE=simulated`：只运行本地规则 Provider。
- `AI_FALLBACK_TO_SIMULATED=true`：千问超时、限流、上游故障、JSON校验失败或风险守卫失败时，返回明确标记的模拟草稿。
- 每次观察分析保存 `provider`、`model`、`prompt_version`、知识卡ID和风险提示；报告与课程草案在内容内保存 `aiMeta`。

## 模型与配置

默认文本和视觉模型均为千问技能建议的平衡档 `qwen3.7-plus`，可通过环境变量独立替换：

```dotenv
AI_MODE=qianwen
DASHSCOPE_API_KEY=sk-your-key-here
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_TEXT_MODEL=qwen3.7-plus
QWEN_VISION_MODEL=qwen3.7-plus
QWEN_TIMEOUT_MS=120000
QWEN_MEDIA_ANALYSIS_ENABLED=false
QWEN_MAX_MEDIA=2
AI_FALLBACK_TO_SIMULATED=true
```

密钥只放在 API 容器环境中。后端自动拒绝 `sk-sp-` Token Plan 密钥，不在前端、Git、日志或审计详情中保存密钥。

## 多媒体边界

- 只有 `guardian_consent_status=granted` 且显式启用媒体分析时，图片或视频才会发送给千问。
- 使用 Supabase 私有对象的15分钟签名链接，链接只存在于本次上游请求内，不进入分析快照或审计日志。
- 每次最多发送 `QWEN_MAX_MEDIA` 项，当前上限为3项。
- 视频按画面抽帧分析，不处理音轨；PDF不发送给视觉模型。
- 未授权、签名失败或关闭媒体分析时，仍可使用教师文字和经确认的转写进行分析。

## 风险守卫

- 千问使用严格 JSON Schema，响应再经 Zod 校验。
- 每条事实必须引用允许的证据ID。
- 每条解释只能引用本次检索到的指标编码和证据ID。
- 指标标题、领域和年龄段由后端知识卡覆盖，模型不能改写国家参照。
- 标签化、诊断、排名、综合评分和确定性达标判断触发整次结果拒绝。
- 单次观察必须保留证据限制和下一轮验证重点。

## 验证

无真实密钥时使用 mock HTTP 响应验证请求格式、结构化输出、媒体输入、指标白名单和隐私最小化。配置标准密钥后，可先保持 `QWEN_MEDIA_ANALYSIS_ENABLED=false` 验证文字分析，再使用虚构且已授权的短视频验证视觉链路。
