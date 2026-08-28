import process from "node:process";

const baseUrl = (process.argv[2] || process.env.TONGJI_BASE_URL || "https://tongji.meidaquan.com").replace(/\/$/, "");

async function readJson(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

const health = await readJson("/api/healthz");
if (!health.response.ok || health.payload.status !== "ok" || health.payload.service !== "tongji-v3-api") {
  throw new Error(`健康检查失败: ${health.response.status} ${JSON.stringify(health.payload)}`);
}
if ("runtime" in health.payload || "schema" in health.payload || "ai" in health.payload) {
  throw new Error(`公开健康检查暴露了内部配置: ${JSON.stringify(health.payload)}`);
}

for (const path of ["/api/me", "/api/dashboard"]) {
  const result = await readJson(path);
  if (result.response.status !== 401 || !["AUTH_REQUIRED", "SESSION_INVALID"].includes(result.payload.code)) {
    throw new Error(`未登录边界异常: ${path} -> ${result.response.status} ${JSON.stringify(result.payload)}`);
  }
}

console.log(`生产链路冒烟通过：${baseUrl} -> Web反向代理 -> ${health.payload.service}`);
console.log("公开健康检查仅返回服务状态，未暴露数据库与AI内部配置。");
