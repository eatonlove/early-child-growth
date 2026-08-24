import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const routeFiles = ["auth.ts", "management.ts", "observations.ts", "knowledge.ts", "governance.ts", "outcomes.ts"];
const backendSource = (
  await Promise.all([
    ...routeFiles.map((file) => readFile(path.join(root, "apps/v3-api/src/routes", file), "utf8")),
    readFile(path.join(root, "apps/v3-api/src/app.ts"), "utf8"),
  ])
).join("\n");
const frontendSource = await readFile(path.join(root, "apps/v3-local/src/production/api.ts"), "utf8");

const contract = [
  ["GET", "/api/healthz", false],
  ["POST", "/api/auth/login", true],
  ["POST", "/api/auth/refresh", true],
  ["POST", "/api/auth/logout", true],
  ["GET", "/api/me", true],
  ["GET", "/api/dashboard", true],
  ["GET", "/api/classrooms", true],
  ["POST", "/api/classrooms", true],
  ["PATCH", "/api/classrooms/:id", true],
  ["GET", "/api/children", true],
  ["POST", "/api/children", true],
  ["PATCH", "/api/children/:id", true],
  ["GET", "/api/observations", true],
  ["GET", "/api/observations/:id", true],
  ["POST", "/api/observations", true],
  ["POST", "/api/observations/:id/evidence-ticket", true],
  ["POST", "/api/evidence/:id/upload", true],
  ["POST", "/api/evidence/:id/complete", true],
  ["GET", "/api/evidence/:id/download", true],
  ["POST", "/api/observations/:id/analyze", true],
  ["POST", "/api/analyses/:id/decision", true],
  ["GET", "/api/observation-templates", true],
  ["GET", "/api/knowledge", true],
  ["GET", "/api/accounts", true],
  ["POST", "/api/accounts", true],
  ["PATCH", "/api/accounts/:userId/status", true],
  ["PATCH", "/api/accounts/:userId/password", true],
  ["GET", "/api/quality-reviews", true],
  ["POST", "/api/quality-reviews", true],
  ["GET", "/api/export-requests", true],
  ["POST", "/api/export-requests", true],
  ["PATCH", "/api/export-requests/:id/decision", true],
  ["GET", "/api/research-activities", true],
  ["POST", "/api/research-activities", true],
  ["PATCH", "/api/research-activities/:id", true],
  ["POST", "/api/research-activities/:id/entries", true],
  ["GET", "/api/support-actions", true],
  ["PATCH", "/api/support-actions/:id", true],
  ["GET", "/api/children/:id/growth", true],
  ["GET", "/api/reports", true],
  ["POST", "/api/reports/generate", true],
  ["PATCH", "/api/reports/:id/status", true],
  ["GET", "/api/curriculum-clues", true],
  ["POST", "/api/curriculum-clues/scan", true],
  ["PATCH", "/api/curriculum-clues/:id", true],
];

const backendRoutes = new Set(
  [...backendSource.matchAll(/app\.(get|post|patch|delete)\(\s*["'](\/api\/[^"']+)["']/g)]
    .map((match) => `${match[1].toUpperCase()} ${match[2]}`),
);
const expectedRoutes = new Set(contract.map(([method, route]) => `${method} ${route}`));
const errors = [];

for (const endpoint of expectedRoutes) {
  if (!backendRoutes.has(endpoint)) errors.push(`后端缺少契约路由: ${endpoint}`);
}
for (const endpoint of backendRoutes) {
  if (!expectedRoutes.has(endpoint)) errors.push(`后端存在未登记路由: ${endpoint}`);
}

for (const [, route, requiredInFrontend] of contract) {
  if (!requiredInFrontend) continue;
  const staticParts = route.split(/:[a-zA-Z]+/).filter((part) => part.length > 1);
  if (!staticParts.every((part) => frontendSource.includes(part))) {
    errors.push(`前端服务未引用契约路径: ${route}`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`生产API契约检查通过：${contract.length}个后端路由，${contract.filter((item) => item[2]).length}个前端已接入路由。`);
