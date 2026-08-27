import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const routeFiles = ["auth.ts", "management.ts", "observations.ts", "knowledge.ts", "governance.ts", "outcomes.ts", "evolution.ts"];
const backendSource = (
  await Promise.all([
    ...routeFiles.map((file) => readFile(path.join(root, "apps/v3-api/src/routes", file), "utf8")),
    readFile(path.join(root, "apps/v3-api/src/app.ts"), "utf8"),
  ])
).join("\n");
const frontendSource = await readFile(path.join(root, "apps/v3-local/src/production/api.ts"), "utf8");

const contract = [
  ["GET", "/api/healthz", false],
  ["GET", "/api/local-media", false],
  ["POST", "/api/auth/login", true],
  ["POST", "/api/auth/refresh", true],
  ["POST", "/api/auth/logout", true],
  ["GET", "/api/me", true],
  ["GET", "/api/dashboard", true],
  ["GET", "/api/classrooms", true],
  ["GET", "/api/observers", true],
  ["POST", "/api/classrooms", true],
  ["PATCH", "/api/classrooms/:id", true],
  ["GET", "/api/children", true],
  ["GET", "/api/children/import-template", true],
  ["POST", "/api/children/import", true],
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
  ["PATCH", "/api/analyses/:id/claims/:claimKey", true],
  ["POST", "/api/analyses/:id/finalize", true],
  ["POST", "/api/analyses/:id/decision", true],
  ["PATCH", "/api/analyses/:id/sections/:section", true],
  ["POST", "/api/analyses/:id/revise", true],
  ["GET", "/api/observation-template/document", true],
  ["POST", "/api/observation-imports", true],
  ["POST", "/api/observation-imports/:id/upload", true],
  ["GET", "/api/observation-imports/:id", true],
  ["GET", "/api/response-plans", true],
  ["POST", "/api/response-plans/:id/select", true],
  ["POST", "/api/response-plans/combine", true],
  ["GET", "/api/observation-templates", true],
  ["GET", "/api/knowledge", true],
  ["GET", "/api/accounts", true],
  ["POST", "/api/accounts", true],
  ["PATCH", "/api/accounts/:userId/status", true],
  ["PATCH", "/api/accounts/:userId/password", true],
  ["GET", "/api/research-activities", true],
  ["POST", "/api/research-activities", true],
  ["PATCH", "/api/research-activities/:id", true],
  ["POST", "/api/research-activities/:id/entries", true],
  ["GET", "/api/support-actions", true],
  ["PATCH", "/api/support-actions/:id", true],
  ["GET", "/api/children/:id/growth", true],
  ["GET", "/api/reports", true],
  ["POST", "/api/reports/generate", true],
  ["PATCH", "/api/reports/:id", true],
  ["POST", "/api/reports/:id/revise", true],
  ["DELETE", "/api/reports/:id", true],
  ["PATCH", "/api/reports/:id/status", true],
  ["GET", "/api/curriculum-clues", true],
  ["POST", "/api/curriculum-clues/scan", true],
  ["PATCH", "/api/curriculum-clues/:id", true],
  ["POST", "/api/curriculum-clues/from-evidence", true],
  ["POST", "/api/curriculum-clues/:id/activity-options", true],
  ["PATCH", "/api/curriculum-clues/:id/activity-options", true],
  ["POST", "/api/curriculum-clues/:id/plan", true],
  ["GET", "/api/curriculum-clues/:id/workspace", true],
  ["GET", "/api/curriculum-templates", true],
  ["POST", "/api/curriculum-templates", true],
  ["POST", "/api/curriculum-plans/:id/cycles", true],
  ["GET", "/api/analysis-frameworks", true],
  ["POST", "/api/analysis-frameworks", true],
  ["GET", "/api/professional-memories", true],
  ["PATCH", "/api/professional-memories/:id", true],
  ["POST", "/api/observations/:id/document-exports", true],
  ["POST", "/api/curriculum-plans/:id/document-exports", true],
  ["GET", "/api/document-exports/:id/download", true],
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
