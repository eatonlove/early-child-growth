import { expect, test, type Page } from "@playwright/test";

const classroom = { id: "11111111-1111-4111-8111-111111111111", name: "中一班", grade: "middle", academic_year: "2026-2027", semester: "上学期", status: "active" };
const child = { id: "22222222-2222-4222-8222-222222222222", classroom_id: classroom.id, internal_code: "M001", display_name: "乐乐", birth_month: "2022-01-01", guardian_consent_status: "granted", interests: ["桥梁建构"], status: "active" };

async function mockApi(page: Page, role: "teacher" | "researcher") {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = path === "/api/me" ? { user: { id: role === "teacher" ? "teacher-id" : "research-id", tenantId: "tenant-id", username: role, displayName: role === "teacher" ? "陈老师" : "周教研员", role, tenantName: "向阳实验幼儿园" } }
      : path === "/api/dashboard" ? { counts: { classrooms: 1, children: 1, observations: 0, pendingAnalyses: 0 }, role }
      : path === "/api/classrooms" ? { items: [classroom] }
      : path === "/api/children" ? { items: [child] }
      : path === "/api/observations" ? { items: [] }
      : path === "/api/observation-templates" ? { items: [{ id: "33333333-3333-4333-8333-333333333333", code: "BUILDING", name: "建构游戏标准观察表", grade: null, scenes: ["建构区"], focus_options: ["材料选择与使用"], fields: ["连续动作"], version: 1 }] }
      : path === "/api/knowledge" ? { items: [], version: "guide-cn-2012.v1.0.0" }
      : path === "/api/accounts" ? { items: [{ user_id: "teacher-id", username: "teacher", display_name: "陈老师", role: "teacher", status: "active", classroom_ids: [classroom.id] }] }
      : path === "/api/quality-reviews" ? { items: [] }
      : path === "/api/export-requests" ? { items: [] }
      : path === "/api/research-activities" ? { items: [] }
      : path === `/api/children/${child.id}/growth` ? { child, timeline: [], coverage: { observations: 0, scenes: [], themes: [], verifiedSupports: 0 } }
      : path === "/api/reports" ? { items: [] }
      : path === "/api/curriculum-clues" ? { items: [] }
      : { code: "NOT_MOCKED", message: path };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(json),
    });
  });
}

test("生产教师端只显示两角色模型下的核心工作区", async ({ page }) => {
  await mockApi(page, "teacher");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "陈老师，从真实观察开始" })).toBeVisible();
  await expect(page.getByText("Supabase 正式数据")).toBeVisible();
  await expect(page.getByRole("link", { name: "账号管理" })).toHaveCount(0);
  await page.getByRole("link", { name: "班级与幼儿" }).click();
  await expect(page.getByRole("heading", { name: "班级与幼儿管理" })).toBeVisible();
  await expect(page.getByText("乐乐", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "标准观察" }).click();
  await expect(page.getByRole("button", { name: "新建观察" })).toBeVisible();
  await page.getByRole("link", { name: "成长与应答" }).click();
  await expect(page.getByRole("heading", { name: "成长轨迹与应答追踪" })).toBeVisible();
  await page.getByRole("link", { name: "周期报告" }).click();
  await expect(page.getByRole("heading", { name: "标准周期报告" })).toBeVisible();
  await page.getByRole("link", { name: "课程生成" }).click();
  await expect(page.getByRole("heading", { name: "从持续游戏证据生成课程" })).toBeVisible();
});

test("生产教研员端可进入真实账号管理", async ({ page }) => {
  await mockApi(page, "researcher");
  await page.goto("/");
  await page.getByRole("link", { name: "账号管理" }).click();
  await expect(page.getByRole("heading", { name: "账号与权限管理" })).toBeVisible();
  await expect(page.getByRole("button", { name: "新增账号" })).toBeVisible();
  await expect(page.getByText("陈老师", { exact: true })).toBeVisible();
});

test("教研治理模块按角色开放", async ({ page }) => {
  await mockApi(page, "researcher");
  await page.goto("/");
  await page.getByRole("link", { name: "观察质量审核" }).first().click();
  await expect(page.getByRole("heading", { name: "观察质量审核" })).toBeVisible();
  await page.getByRole("link", { name: "导出审批" }).click();
  await expect(page.getByRole("heading", { name: "敏感数据导出审批" })).toBeVisible();
  await page.getByRole("link", { name: "教研活动" }).click();
  await expect(page.getByRole("heading", { name: "教研活动模式" })).toBeVisible();
});
