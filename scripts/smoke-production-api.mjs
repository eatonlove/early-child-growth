import process from "node:process";

const baseUrl = (process.argv[2] || process.env.TONGJI_BASE_URL || "https://tongji.meidaquan.com").replace(/\/$/, "");

async function readJson(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

const health = await readJson("/api/healthz");
if (!health.response.ok || health.payload.service !== "tongji-v3-api" || health.payload.schema !== "tongji_v3") {
  throw new Error(`健康检查失败: ${health.response.status} ${JSON.stringify(health.payload)}`);
}

for (const path of ["/api/me", "/api/dashboard"]) {
  const result = await readJson(path);
  if (result.response.status !== 401 || !["AUTH_REQUIRED", "SESSION_INVALID"].includes(result.payload.code)) {
    throw new Error(`未登录边界异常: ${path} -> ${result.response.status} ${JSON.stringify(result.payload)}`);
  }
}

console.log(`生产链路冒烟通过：${baseUrl} -> Web反向代理 -> ${health.payload.service} -> ${health.payload.schema}`);
console.log(`AI模式：${health.payload.ai?.mode}；文本模型：${health.payload.ai?.textModel}；媒体分析：${health.payload.ai?.mediaAnalysisEnabled}`);
