import { expect, test, type Page } from "@playwright/test";

const classroom = { id: "11111111-1111-4111-8111-111111111111", name: "中一班", grade: "middle", academic_year: "2026-2027", semester: "上学期", status: "active" };
const child = { id: "22222222-2222-4222-8222-222222222222", classroom_id: classroom.id, internal_code: "M001", display_name: "乐乐", birth_month: "2022-01-01", guardian_consent_status: "granted", interests: ["桥梁建构"], status: "active" };
const observation = { id: "44444444-4444-4444-8444-444444444444", classroom_id: classroom.id, child_id: child.id, title: "桥梁再次加固", occurred_at: "2026-08-24T09:00:00+08:00", scene: "建构区", theme: "积木桥梁", organization_stage: "process", observation_focus: ["问题解决"], teacher_observation: "幼儿移动桥墩后，再次把积木放到桥面上。", child_quote: "这样更稳。", teacher_identification: "正在比较支撑位置。", teacher_response: { category: "material", strategy: "保留不同形状支撑物", nextObservationFocus: "观察是否主动比较" }, status: "ai_ready", created_at: "2026-08-24T09:20:00+08:00" };
const analysis = {
  id: "55555555-5555-4555-8555-555555555555", observation_id: observation.id, provider: "QianwenAIProvider", model: "qwen3.7-plus", knowledge_version: "guide-cn-2012.v1.0.0", decision: "pending", generated_at: "2026-08-24T09:30:00+08:00",
  structured_result: {
    objectiveSummary: "幼儿移动桥墩并再次测试桥面。",
    facts: [{ content: "幼儿移动桥墩后再次放置桥面。", evidence: "教师白描", evidenceIds: ["teacher-observation"], confidence: .9 }],
    interpretations: [{ content: "这一行动可能体现对支撑位置的比较。", indicatorCode: "SCI-M-01", evidenceIds: ["teacher-observation"], limitation: "仍需跨时间复察。", confidence: .72 }],
    hypotheses: [{ content: "可能正在形成稳定性比较策略。", nextObservation: "更换材料后继续观察。", confidence: .62 }],
    teacherComparison: { teacherIdentification: observation.teacher_identification, teacherResponse: observation.teacher_response, aiAddition: "补充了科学探究参照。" },
    currentExperience: "会根据结果调整支撑位置。", interestsAndStrengths: ["桥梁建构"], evidenceGaps: ["缺少跨材料证据"], developmentReferences: [],
    responseSuggestions: { experience: ["回顾调整理由"], material: ["补充不同支撑物"], activity: ["下一次复察"] }, nextObservation: ["是否主动比较"],
    historicalComparison: { evidenceCount: 1, timePointCount: 1, changes: [{ dimension: "问题解决", content: "本次增加了再次测试。", previousEvidenceIds: ["observation:66666666-6666-4666-8666-666666666666"], currentEvidenceIds: ["teacher-observation"], confidence: .7 }], stablePatterns: [], caution: "仍需更多时间点。" },
    evidenceSufficiency: "有限", warnings: ["必须由教师审核。"],
  },
  claim_reviews: [{ id: "77777777-7777-4777-8777-777777777777", analysis_run_id: "55555555-5555-4555-8555-555555555555", claim_key: "objective-summary", claim_type: "objective_summary", original_content: { content: "幼儿移动桥墩并再次测试桥面。", evidenceIds: ["teacher-observation"] }, reviewed_content: null, decision: "pending", review_note: null, reviewed_by: null, reviewed_at: null }],
};

const classroomReport = {
  id: "88888888-8888-4888-8888-888888888888",
  classroom_id: classroom.id,
  child_id: null,
  report_type: "classroom",
  period_start: "2026-08-01",
  period_end: "2026-08-24",
  content: {
    title: "中一班游戏学习班级画像",
    evidenceBoundary: "只汇总多幼儿、多时间点的已终审证据，不展示排名。",
    observationCoverage: "6次观察，覆盖2/3名幼儿、2类游戏场景和3个日期。",
    observationCount: 6,
    timePointCount: 3,
    observedChildCount: 2,
    totalChildCount: 3,
    sceneCoverage: ["建构区", "沙水区"],
    commonInterests: ["桥梁结构", "材料比较"],
    recurringQuestions: ["怎样让结构更稳定？"],
    domainEvidence: { 健康: 0, 语言: 1, 社会: 1, 科学: 3, 艺术: 0 },
    supportFollowUpRate: 50,
    nextSuggestions: ["补充健康、艺术领域的真实游戏证据。"],
    curriculumClues: [{ id: "99999999-9999-4999-8999-999999999999", title: "稳固的桥", theme: "结构", status: "draft" }],
    audience: "classroom",
  },
  evidence_observation_ids: [observation.id],
  status: "draft",
  created_at: "2026-08-24T10:00:00+08:00",
};

async function mockApi(page: Page, role: "teacher" | "researcher", withAnalysis = false, withClassroomReport = false) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = path === "/api/me" ? { user: { id: role === "teacher" ? "teacher-id" : "research-id", tenantId: "tenant-id", username: role, displayName: role === "teacher" ? "陈老师" : "周教研员", role, tenantName: "向阳实验幼儿园" } }
      : path === "/api/dashboard" ? { counts: { classrooms: 1, children: 1, observations: 0, pendingAnalyses: 0 }, role }
      : path === "/api/classrooms" ? { items: [classroom] }
      : path === "/api/children" ? { items: [child] }
      : path === "/api/observations" ? { items: withAnalysis ? [observation] : [] }
      : path === `/api/observations/${observation.id}` ? { item: observation, evidence: [], analyses: [analysis] }
      : path === "/api/observation-templates" ? { items: [{ id: "33333333-3333-4333-8333-333333333333", code: "BUILDING", name: "建构游戏标准观察表", grade: null, scenes: ["建构区"], focus_options: ["材料选择与使用"], fields: ["连续动作"], version: 1 }] }
      : path === "/api/knowledge" ? { items: [], version: "guide-cn-2012.v1.0.0" }
      : path === "/api/accounts" ? { items: [{ user_id: "teacher-id", username: "teacher", display_name: "陈老师", role: "teacher", status: "active", classroom_ids: [classroom.id] }] }
      : path === "/api/quality-reviews" ? { items: [] }
      : path === "/api/export-requests" ? { items: [] }
      : path === "/api/research-activities" ? { items: [] }
      : path === `/api/children/${child.id}/growth` ? { child, timeline: [], coverage: { observations: 0, scenes: [], themes: [], verifiedSupports: 0 } }
      : path === "/api/reports" ? { items: withClassroomReport ? [classroomReport] : [] }
      : path === "/api/curriculum-clues" ? { items: [] }
      : { code: "NOT_MOCKED", message: path };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(json),
    });
  });
}

async function openWorkspaceMenu(page: Page) {
  await page.getByRole("button", { name: "打开全部功能菜单" }).click();
  await expect(page.getByRole("navigation", { name: "全部功能" })).toBeVisible();
}

test("生产教师端只显示两角色模型下的核心工作区", async ({ page }) => {
  await mockApi(page, "teacher");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "每一次，从老师的观察开始" })).toBeVisible();
  await expect(page.getByRole("button", { name: /标准观察/ })).toBeVisible();
  await expect(page.getByLabel("同迹功能主页").getByText("观察  ·  识别  ·  应答  ·  拓展")).toBeVisible();
  await expect(page.getByRole("link", { name: "账号管理" })).toHaveCount(0);
  await page.getByRole("button", { name: /班级与幼儿/ }).click();
  await expect(page.getByRole("heading", { name: "班级与幼儿管理" })).toBeVisible();
  await expect(page.getByText("乐乐", { exact: true })).toBeVisible();
  await openWorkspaceMenu(page);
  await page.getByRole("link", { name: "标准观察" }).click();
  await expect(page.getByRole("button", { name: "新建观察" })).toBeVisible();
  await page.getByRole("button", { name: "新建观察" }).click();
  const dialog = page.getByRole("dialog", { name: "新建标准观察" });
  await expect(dialog).toBeVisible();
  await expect.poll(async () => dialog.evaluate((element) => document.activeElement === element)).toBe(true);
  const dialogBox = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(dialogBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
  expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(viewport!.height);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await openWorkspaceMenu(page);
  await page.getByRole("link", { name: "成长与应答" }).click();
  await expect(page.getByRole("heading", { name: "成长轨迹与应答追踪" })).toBeVisible();
  await openWorkspaceMenu(page);
  await page.getByRole("link", { name: "周期报告" }).click();
  await expect(page.getByRole("heading", { name: "标准周期报告" })).toBeVisible();
  await expect(page.getByRole("button", { name: "浏览器打印" })).toBeDisabled();
  await openWorkspaceMenu(page);
  await page.getByRole("link", { name: "课程生成" }).click();
  await expect(page.getByRole("heading", { name: "从持续游戏证据生成课程" })).toBeVisible();
});

test("AI结果展示历史比较、证据链与逐条教师审核", async ({ page }) => {
  await mockApi(page, "teacher", true);
  await page.goto("/observations");
  await page.getByRole("button", { name: /桥梁再次加固/ }).click();
  await expect(page.getByRole("heading", { name: "跨时间成长对比" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "逐条审核与完整证据链" })).toBeVisible();
  await expect(page.getByText("本次教师白描")).toBeVisible();
  await page.getByRole("button", { name: "修改", exact: true }).click();
  await expect(page.getByLabel("教师修改后的结论")).toBeVisible();
  await expect(page.getByRole("button", { name: "保存教师修改" })).toBeVisible();
});

test("周期报告支持班级维度生成与画像展示", async ({ page }) => {
  await mockApi(page, "teacher", false, true);
  await page.goto("/reports");
  await page.getByRole("button", { name: "班级周期报告" }).click();
  await expect(page.getByRole("heading", { name: "中一班游戏学习班级画像" })).toBeVisible();
  await expect(page.getByText("已观察2/3名幼儿")).toBeVisible();
  await expect(page.getByText("支持策略复察率：50%")).toBeVisible();
  await expect(page.getByText(/科学：3条已终审证据/)).toBeVisible();
  await page.getByRole("button", { name: "生成报告" }).click();
  const dialog = page.getByRole("dialog", { name: "生成标准周期报告" });
  await dialog.getByLabel("报告维度").selectOption("classroom");
  await expect(dialog.getByLabel("幼儿", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText(/至少需要覆盖2名幼儿/)).toBeVisible();
});

test("手机端提供清晰的全部功能入口", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, "teacher");
  await page.goto("/observations");
  const menuButton = page.getByRole("button", { name: "打开全部功能菜单" });
  await expect(menuButton).toBeVisible();
  await menuButton.click();
  await expect(page.getByRole("navigation", { name: "全部功能" })).toBeVisible();
  await expect(page.getByRole("link", { name: "课程生成" }).first()).toBeVisible();
});

test("生产教研员端可进入真实账号管理", async ({ page }) => {
  await mockApi(page, "researcher");
  await page.goto("/");
  await page.getByRole("button", { name: /账号管理/ }).click();
  await expect(page.getByRole("heading", { name: "账号与权限管理" })).toBeVisible();
  await expect(page.getByRole("button", { name: "新增账号" })).toBeVisible();
  await expect(page.getByText("陈老师", { exact: true })).toBeVisible();
});

test("教研治理模块按角色开放", async ({ page }) => {
  await mockApi(page, "researcher");
  await page.goto("/");
  await page.getByRole("button", { name: /观察质量审核/ }).click();
  await expect(page.getByRole("heading", { name: "观察质量审核" })).toBeVisible();
  await openWorkspaceMenu(page);
  await page.getByRole("link", { name: "导出审批" }).click();
  await expect(page.getByRole("heading", { name: "敏感数据导出审批" })).toBeVisible();
  await openWorkspaceMenu(page);
  await page.getByRole("link", { name: "教研活动" }).click();
  await expect(page.getByRole("heading", { name: "教研活动模式" })).toBeVisible();
});
