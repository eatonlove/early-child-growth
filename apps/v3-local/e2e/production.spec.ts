import { expect, test, type Page } from "@playwright/test";

const classroom = { id: "11111111-1111-4111-8111-111111111111", name: "中一班", grade: "middle", academic_year: "2026-2027", semester: "上学期", status: "active" };
const child = { id: "22222222-2222-4222-8222-222222222222", classroom_id: classroom.id, internal_code: "M001", display_name: "乐乐", birth_month: "2022-01-01", guardian_consent_status: "granted", interests: ["桥梁建构"], status: "active" };
const observation = { id: "44444444-4444-4444-8444-444444444444", classroom_id: classroom.id, child_id: child.id, title: "桥梁再次加固", occurred_at: "2026-08-24T09:00:00+08:00", scene: "建构区", theme: "积木桥梁", organization_stage: "process", observation_focus_category: "materials_tools", observation_focus: ["问题解决"], teacher_observation: "幼儿移动桥墩后，再次把积木放到桥面上。", child_quote: "这样更稳。", teacher_identification: "正在比较支撑位置。", teacher_response: { category: "material", strategy: "保留不同形状支撑物", nextObservationFocus: "观察是否主动比较" }, observer_ids: [], observer_name_snapshot: "陈老师", unlisted_participant_count: 0, status: "ai_ready", created_at: "2026-08-24T09:20:00+08:00" };
const observationImport = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", classroom_id: classroom.id, source_file_name: "桥梁观察记录.docx",
  source_mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", status: "needs_review",
  extracted_fields: { observerName: "陈老师", occurredAtText: "2026-08-24 09:00", scene: "建构区", theme: "桥梁探究", organizationStage: "process", observationFocusCategory: "cognition_experience", subjects: [{ displayName: "乐乐", contextualFeature: "主动调整桥墩", role: "primary" }], unlistedParticipantCount: 1, groupContext: "两名同伴在旁共同搭建", objectiveObservation: "乐乐移动桥墩后，再次把积木放到桥面上进行测试。", teacherIdentification: "教师识别到比较支撑位置的经验线索。", teacherResponseDraft: "保留不同形状支撑物。", nextObservationFocus: "观察是否主动比较。", warnings: [], fieldConfidence: { objectiveObservation: .94, teacherIdentification: .86 } },
  field_confidence: { objectiveObservation: .94, teacherIdentification: .86 }, matched_child_ids: [child.id], failure_reason: null, observation_id: null, created_at: "2026-08-28T09:00:00+08:00",
};
const analysis = {
  id: "55555555-5555-4555-8555-555555555555", observation_id: observation.id, child_id: child.id, provider: "QianwenAIProvider", model: "qwen3.7-plus", knowledge_version: "guide-cn-2012.v1.0.0", decision: "pending", generated_at: "2026-08-24T09:30:00+08:00",
  structured_result: {
    objectiveSummary: "幼儿移动桥墩并再次测试桥面。",
    facts: [{ content: "幼儿移动桥墩后再次放置桥面。", evidence: "教师白描", evidenceIds: ["teacher-observation"], confidence: .9 }],
    interpretations: [{ content: "这一行动可能体现对支撑位置的比较。", indicatorCode: "SCI-M-01", evidenceIds: ["teacher-observation"], limitation: "仍需跨时间复察。", confidence: .72 }],
    hypotheses: [{ content: "可能正在形成稳定性比较策略。", nextObservation: "更换材料后继续观察。", confidence: .62 }],
    teacherComparison: { teacherIdentification: observation.teacher_identification, teacherResponse: observation.teacher_response, aiAddition: "补充了科学探究参照。" },
    currentExperience: "会根据结果调整支撑位置。", interestsAndStrengths: ["桥梁建构"], evidenceGaps: ["缺少跨材料证据"], developmentReferences: [{ indicatorCode: "SCI-M-01", title: "探究与比较", domain: "科学", ageBand: "4-5岁", status: "线索", evidenceStatement: "移动桥墩后再次测试", missingEvidence: "仍需跨材料复察" }],
    responseSuggestions: { experience: ["回顾调整理由"], material: ["补充不同支撑物"], activity: ["下一次复察"] }, nextObservation: ["是否主动比较"],
    historicalComparison: { evidenceCount: 1, timePointCount: 1, changes: [{ dimension: "问题解决", content: "本次增加了再次测试。", previousEvidenceIds: ["observation:66666666-6666-4666-8666-666666666666"], currentEvidenceIds: ["teacher-observation"], confidence: .7 }], stablePatterns: [], caution: "仍需更多时间点。" }, externalSupportReferences: [],
    evidenceSufficiency: "有限", warnings: ["必须由教师审核。"],
  },
  claim_reviews: [{ id: "77777777-7777-4777-8777-777777777777", analysis_run_id: "55555555-5555-4555-8555-555555555555", claim_key: "objective-summary", claim_type: "objective_summary", original_content: { content: "幼儿移动桥墩并再次测试桥面。", evidenceIds: ["teacher-observation"] }, reviewed_content: null, decision: "pending", review_note: null, reviewed_by: null, reviewed_at: null }],
};

const robotObservation = {
  ...observation,
  id: "12121212-1212-4212-8212-121212121212",
  title: "机器人搭建与加固",
  theme: "机器人搭建",
  status: "adopted",
};
const bubbleObservation = {
  ...observation,
  id: "13131313-1313-4313-8313-131313131313",
  title: "泡泡大小比较",
  theme: "泡泡探秘",
  status: "adopted",
};
const secondRobotObservation = {
  ...robotObservation,
  id: "19191919-1919-4919-8919-191919191919",
  title: "机器人连接片再次比较",
  occurred_at: "2026-08-27T09:00:00+08:00",
};
const growthResult = {
  child,
  timeline: [
    {
      observation: robotObservation,
      analysis: { ...analysis, observation_id: robotObservation.id, decision: "adopted" },
      supports: [{ id: "14141414-1414-4414-8414-141414141414", child_id: child.id, observation_id: robotObservation.id, category: "material", rationale: "支持比较不同连接材料", strategy: "补充不同宽度连接片", next_observation_focus: "观察是否主动比较稳定性", child_response: "幼儿更换连接片后再次测试。", effectiveness: "supported", status: "verified", created_at: "2026-08-25T09:00:00+08:00" }],
    },
    { observation: secondRobotObservation, analysis: { ...analysis, observation_id: secondRobotObservation.id, decision: "adopted" }, supports: [] },
    { observation: bubbleObservation, analysis: null, supports: [] },
  ],
  coverage: { observations: 3, scenes: ["建构区"], themes: ["机器人搭建", "泡泡探秘"], verifiedSupports: 1 },
  interestInsights: {
    sustainedInterests: [{ label: "机器人搭建", aliases: ["机器人搭建"], observationCount: 2, timePointCount: 2, childCount: 1, firstSeenAt: robotObservation.occurred_at, lastSeenAt: secondRobotObservation.occurred_at, evidenceObservationIds: [robotObservation.id, secondRobotObservation.id], childIds: [child.id] }],
    sharedInterests: [{ label: "结构搭建", aliases: ["机器人搭建", "积木桥梁"], observationCount: 4, timePointCount: 3, childCount: 2, firstSeenAt: "2026-08-20T09:00:00+08:00", lastSeenAt: secondRobotObservation.occurred_at, evidenceObservationIds: [robotObservation.id, secondRobotObservation.id, observation.id], childIds: [child.id, "20202020-2020-4020-8020-202020202020"] }],
  },
};

const memoryFrameworks = [
  { id: "15151515-1515-4515-8515-151515151515", framework_type: "game_experience", code: "GAME", name: "游戏经验七维框架", version: 2, description: "依据真实游戏行为提炼经验。", dimensions: [{ label: "计划与意图", evidenceReminder: "回到行为证据" }], is_default: true },
  { id: "16161616-1616-4616-8616-161616161616", framework_type: "learning_disposition", code: "DISPOSITION", name: "学习品质六维框架", version: 1, description: "依据真实游戏情境描述学习品质。", dimensions: [{ label: "好奇与探究", evidenceReminder: "回到行为证据" }], is_default: true },
];
const professionalMemories = [
  { id: "17171717-1717-4717-8717-171717171717", memory_type: "support", title: "材料比较支持经验", summary: "通过改变连接材料支持幼儿继续验证。", retrieval_text: "连接材料、稳定性、比较", source_resource_type: "observation", source_resource_id: robotObservation.id, status: "active" },
  { id: "18181818-1818-4818-8818-181818181818", memory_type: "curriculum", title: "机器人持续探究经验", summary: "从连续观察中提炼课程线索。", retrieval_text: "机器人、结构、持续探究", source_resource_type: "curriculum", source_resource_id: "curriculum-1", status: "active" },
];

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
    developmentProfile: {
      totalChildCount: 3,
      evidenceBoundary: "仅汇总教师确认采用的证据，以状态分布和证据覆盖呈现，不形成分数或排名。",
      domains: ["健康", "语言", "社会", "科学", "艺术"].map((domain, index) => ({
        domain,
        distribution: { 初现: index === 0 ? 1 : 0, 发展中: index === 2 ? 1 : 0, 较稳定: index === 3 ? 1 : 0, 跨情境迁移: 0, 待积累证据: index === 4 ? 3 : 2 },
        evidenceCount: index === 3 ? 3 : index === 4 ? 0 : 1,
        observedChildCount: index === 4 ? 0 : 1,
      })),
    },
    audience: "classroom",
  },
  evidence_observation_ids: [observation.id],
  status: "draft",
  created_at: "2026-08-24T10:00:00+08:00",
};

const curriculumClue = {
  id: "21212121-2121-4121-8121-212121212121",
  classroom_id: classroom.id,
  title: "机器人怎样站得更稳",
  theme: "结构搭建",
  origin: "来自跨时间的机器人搭建观察。",
  inquiry_questions: ["怎样选择更稳的连接材料？"],
  child_ids: [child.id],
  evidence_observation_ids: [robotObservation.id, secondRobotObservation.id],
  time_point_count: 2,
  threshold_met: true,
  plan: { scope: "classroom_curriculum", version: 1 },
  status: "clue",
  updated_at: "2026-08-30T09:00:00+08:00",
};

const aiPrompt = {
  key: "observation_analysis",
  name: "逐幼儿观察分析",
  category: "观察",
  description: "结合文字、图片、视频、年龄段知识卡和历史证据生成观察、识别、应答与拓展。",
  defaultVersion: "observation-analysis.qwen.v6",
  effectiveVersion: "observation-analysis.qwen.v6",
  source: "default",
  revision: 0,
  defaultPrompt: "你是逐幼儿循证分析助手。严格区分客观事实、专业解释和待验证假设，依据年龄段知识卡提出可执行应答，不补造未提供的行为、语言、次数和时长。".repeat(2),
  customPrompt: null,
  effectivePrompt: "你是逐幼儿循证分析助手。严格区分客观事实、专业解释和待验证假设，依据年龄段知识卡提出可执行应答，不补造未提供的行为、语言、次数和时长。".repeat(2),
  basePromptVersion: "observation-analysis.qwen.v6",
  baseVersionOutdated: false,
  changeNote: "",
  updatedAt: null,
  updatedBy: null,
  updatedByName: null,
};
const aiModelConfig = {
  model: "qwen3.7-plus-2026-05-26",
  defaultModel: "qwen3.7-plus-2026-05-26",
  source: "environment",
  revision: 0,
  updatedAt: null,
  updatedBy: null,
  updatedByName: null,
  options: [
    { value: "qwen3.7-plus-2026-05-26", label: "qwen3.7-plus-2026-05-26", description: "当前默认模型。" },
    { value: "qwen3.7-flash-2026-07-15", label: "qwen3.7-flash-2026-07-15", description: "固定快速版本。" },
    { value: "qwen3.7-flash", label: "qwen3.7-flash", description: "滚动快速版本。" },
    { value: "qwen3.7-max-2026-06-08", label: "qwen3.7-max-2026-06-08", description: "固定高能力版本。" },
  ],
};

async function mockApi(page: Page, role: "teacher" | "researcher", withAnalysis = false, withClassroomReport = false, withActiveAnalysisJob = false, withCurriculumClue = false) {
  let curriculumExists = withCurriculumClue;
  const analysisJob = {
    id: "99999999-9999-4999-8999-999999999999",
    observation_id: observation.id,
    status: "processing",
    stage: "analyzing_subject",
    progress: 52,
    analysis_run_ids: [],
    requested_at: "2026-08-29T09:00:00+08:00",
  };
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    if (path === `/api/curriculum-clues/${curriculumClue.id}` && method === "DELETE") {
      curriculumExists = false;
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    const json = path === "/api/me" ? { user: { id: role === "teacher" ? "teacher-id" : "research-id", tenantId: "tenant-id", username: role, displayName: role === "teacher" ? "陈老师" : "周教研员", role, tenantName: "向阳实验幼儿园" } }
      : path === "/api/dashboard" ? { counts: { classrooms: 1, children: 1, observations: 0, pendingAnalyses: 0 }, role }
      : path === "/api/classrooms" ? { items: [classroom] }
      : path === "/api/children" ? { items: [child] }
      : path === "/api/observations" ? { items: withAnalysis ? [observation] : [] }
      : path === `/api/observations/${observation.id}` ? { item: observation, evidence: [], analyses: [analysis], subjects: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", child_id: child.id, role: "primary", contextual_feature: "主动调整桥墩", display_name: child.display_name }], responsePlans: [], observers: [], analysisJob: withActiveAnalysisJob ? analysisJob : null }
      : path === `/api/analysis-jobs/${analysisJob.id}` ? { item: analysisJob }
      : path === "/api/observers" ? { items: [{ userId: "teacher-id", displayName: "陈老师", role: "teacher" }] }
      : path === "/api/observation-imports" && method === "POST" ? { item: { ...observationImport, status: "pending_upload" } }
      : path === "/api/observation-imports" ? { items: [] }
      : path === `/api/observation-imports/${observationImport.id}/upload` ? { item: observationImport, aiNotice: "字段已提取，请教师校对。" }
      : path === "/api/observation-templates" ? { items: [{ id: "33333333-3333-4333-8333-333333333333", code: "BUILDING", name: "建构游戏标准观察表", grade: null, scenes: ["建构区"], focus_options: ["材料选择与使用"], fields: ["连续动作"], version: 1 }] }
      : path === "/api/knowledge" ? { items: [], version: "guide-cn-2012.v1.0.0" }
      : path === "/api/accounts" ? { items: [{ user_id: "teacher-id", username: "teacher", display_name: "陈老师", role: "teacher", status: "active", classroom_ids: [classroom.id] }] }
      : path === "/api/ai-model-config" ? { item: aiModelConfig }
      : path === "/api/ai-prompts" ? { immutableSafetyPrompt: "禁止诊断、排名、标签化和编造证据。", items: [aiPrompt] }
      : path === "/api/quality-reviews" ? { items: [] }
      : path === "/api/export-requests" ? { items: [] }
      : path === "/api/research-activities" ? { items: [] }
      : path === `/api/children/${child.id}/growth` ? growthResult
      : path === "/api/reports" ? { items: withClassroomReport ? [classroomReport] : [] }
      : path === "/api/curriculum-clues" ? { items: curriculumExists ? [curriculumClue] : [] }
      : path === `/api/curriculum-clues/${curriculumClue.id}/workspace` ? { clue: curriculumClue, options: [], plans: [], cycles: [] }
      : path === "/api/curriculum-templates" ? { items: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", code: "co-growth-course", name: "同生课程模板", version: 1, description: "连续证据课程模板", structure: {}, is_default: true, status: "active" }] }
      : path === "/api/professional-memories" ? { items: professionalMemories }
      : path === "/api/curriculum-resource-packages" ? { items: [] }
      : path === "/api/analysis-frameworks" ? { items: memoryFrameworks }
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
  await page.getByRole("button", { name: /网页直接填写/ }).click();
  const dialog = page.getByRole("dialog", { name: "新建标准观察" });
  await expect(dialog).toBeVisible();
  await expect.poll(async () => dialog.evaluate((element) => document.activeElement === element)).toBe(true);
  const dialogBox = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(dialogBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
  expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(viewport!.height);
  await expect(dialog.getByRole("radio", { name: "材料与工具" })).toBeChecked();
  await dialog.getByRole("radio", { name: "交往与经验" }).check();
  await expect(dialog.getByRole("radio", { name: "交往与经验" })).toBeChecked();
  await expect(dialog.getByRole("radio", { checked: true })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await openWorkspaceMenu(page);
  await page.getByRole("link", { name: "成长与应答" }).click();
  await expect(page.getByRole("heading", { name: "成长轨迹与应答追踪" })).toBeVisible();
  await openWorkspaceMenu(page);
  await page.getByRole("link", { name: "周期报告" }).click();
  await expect(page.getByRole("heading", { name: "标准周期报告" })).toBeVisible();
  await expect(page.getByRole("button", { name: "生成报告" })).toBeVisible();
  await openWorkspaceMenu(page);
  await page.getByRole("link", { name: "课程生成" }).click();
  await expect(page.getByRole("heading", { name: "游戏课程生成" })).toBeVisible();
});

test("上传观察模板后进入与网页录入相同的教师校对表单", async ({ page }) => {
  await mockApi(page, "teacher");
  await page.goto("/observations");
  await page.getByRole("button", { name: "新建观察" }).click();
  await page.getByRole("button", { name: /上传已有观察表/ }).click();
  const importDialog = page.getByRole("dialog", { name: "导入已有观察表" });
  await importDialog.getByLabel(/观察表文件/).setInputFiles({
    name: "桥梁观察记录.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from("mock-docx"),
  });
  await importDialog.getByRole("button", { name: /提取并进入教师校对/ }).click();
  const reviewDialog = page.getByRole("dialog", { name: "校对AI提取的观察草稿" });
  await expect(reviewDialog).toBeVisible();
  await expect(reviewDialog.getByText("桥梁观察记录.docx")).toBeVisible();
  await expect(reviewDialog.getByLabel("观察教师")).toHaveValue("陈老师");
  await expect(reviewDialog.getByLabel(/客观白描/)).toHaveValue(/再次把积木放到桥面上/);
  await expect(reviewDialog.getByLabel("教师识别")).toHaveValue(/比较支撑位置/);
  await expect(reviewDialog.getByLabel("教师原始应答")).toHaveValue(/保留不同形状支撑物/);
  await expect(reviewDialog.getByRole("radio", { name: "认知与经验" })).toBeChecked();
});

test("AI结果展示连续观察、指南证据链与教师最终确认", async ({ page }) => {
  await mockApi(page, "teacher", true);
  await page.goto("/observations");
  await page.getByRole("button", { name: /桥梁再次加固/ }).click();
  await expect(page.getByRole("heading", { name: "连续观察对比" })).toBeVisible();
  await expect(page.getByText(/SCI-M-01 · 探究与比较/)).toBeVisible();
  await expect(page.getByText(/仍需跨时间复察/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "教师确认" })).toBeVisible();
  await expect(page.getByRole("button", { name: "确认并采用" })).toBeVisible();
});

test("0830建议页面采用单列、折叠和精确主题筛选", async ({ page }) => {
  await mockApi(page, "teacher", true);
  await page.goto("/observations");
  await page.getByRole("button", { name: /桥梁再次加固/ }).click();
  const teacherRows = page.locator(".observation-record-item");
  await expect(teacherRows).toHaveCount(3);
  const teacherPositions = await teacherRows.evaluateAll((elements) => elements.map((element) => ({ x: element.getBoundingClientRect().x, y: element.getBoundingClientRect().y })));
  expect(new Set(teacherPositions.map((item) => Math.round(item.x))).size).toBe(1);
  expect(teacherPositions[1].y).toBeGreaterThan(teacherPositions[0].y);
  const aiRows = page.locator(".analysis-core-card");
  await expect(aiRows).toHaveCount(3);
  const aiPositions = await aiRows.evaluateAll((elements) => elements.map((element) => ({ x: element.getBoundingClientRect().x, y: element.getBoundingClientRect().y })));
  expect(new Set(aiPositions.map((item) => Math.round(item.x))).size).toBe(1);
  expect(aiPositions[1].y).toBeGreaterThan(aiPositions[0].y);
  await expect(page.locator(".teacher-source")).toHaveCount(3);
  await expect(page.locator(".teacher-source[open]")).toHaveCount(0);
  await expect(page.getByText("展开内容", { exact: true })).toBeVisible();
  await page.getByText("展开内容", { exact: true }).click();
  await expect(page.getByText("收起内容", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "导出当前档案" })).toBeEnabled();

  await page.goto("/growth");
  await expect(page.getByRole("heading", { name: "成长轨迹与应答追踪" })).toBeVisible();
  await expect(page.getByText(/2条观察 · 2个日期/)).toBeVisible();
  await expect(page.getByText(/2名幼儿 · 4条观察/)).toBeVisible();
  const allRecords = page.locator(".growth-compact-card");
  await expect(allRecords).toHaveCount(3);
  await page.locator(".growth-theme-chips").getByRole("button", { name: "机器人搭建", exact: true }).click();
  await expect(page.locator(".growth-compact-card").getByText("泡泡探秘", { exact: true })).toHaveCount(0);
  await expect(page.locator(".growth-compact-card")).toHaveCount(2);
  await page.locator(".growth-compact-card").first().click();
  await expect(page.getByRole("dialog", { name: "机器人搭建与加固" })).toBeVisible();
  await expect(page.locator(".growth-analysis-list > article")).toHaveCount(3);
  await page.keyboard.press("Escape");

  await page.goto("/memories");
  const frameworkRows = page.locator(".evo-framework-list article");
  await expect(frameworkRows).toHaveCount(2);
  const frameworkPositions = await frameworkRows.evaluateAll((elements) => elements.map((element) => ({ x: element.getBoundingClientRect().x, y: element.getBoundingClientRect().y })));
  expect(new Set(frameworkPositions.map((item) => Math.round(item.x))).size).toBe(1);
  expect(frameworkPositions[1].y).toBeGreaterThan(frameworkPositions[0].y);
  const memoryRows = page.locator(".evo-memory-grid > .panel");
  await expect(memoryRows).toHaveCount(2);
  const memoryPositions = await memoryRows.evaluateAll((elements) => elements.map((element) => ({ x: element.getBoundingClientRect().x, y: element.getBoundingClientRect().y })));
  expect(new Set(memoryPositions.map((item) => Math.round(item.x))).size).toBe(1);
  expect(memoryPositions[1].y).toBeGreaterThan(memoryPositions[0].y);
});

test("后台AI任务离开或刷新观察页面后仍可恢复真实进度", async ({ page }) => {
  await mockApi(page, "teacher", true, false, true);
  await page.goto("/observations");
  await expect(page.getByText("逐幼儿分析文字、图片与视频")).toBeVisible();
  await expect(page.getByText(/可以离开或关闭本页面/)).toBeVisible();
  await expect(page.getByText("52%")).toBeVisible();
  await page.reload();
  await expect(page.getByText("逐幼儿分析文字、图片与视频")).toBeVisible();
  await expect(page.getByText("52%")).toBeVisible();
});

test("周期报告支持班级维度生成与画像展示", async ({ page }) => {
  await mockApi(page, "teacher", false, true);
  await page.goto("/reports");
  await page.getByRole("button", { name: "班级周期报告" }).click();
  await expect(page.getByRole("heading", { name: "中一班游戏学习班级画像" })).toBeVisible();
  await expect(page.getByText("已观察2/3名幼儿")).toBeVisible();
  await expect(page.getByText("支持策略复察率：50%")).toBeVisible();
  await expect(page.getByText(/科学：3条教师确认的证据/)).toBeVisible();
  await expect(page.getByText("五大领域发展状态与证据覆盖")).toBeVisible();
  await expect(page.locator(".class-domain-coverage > span")).toHaveCount(5);
  await expect(page.getByText(/不形成分数或排名/)).toBeVisible();
  await page.getByRole("button", { name: "生成报告" }).click();
  const dialog = page.getByRole("dialog", { name: "生成标准周期报告" });
  await dialog.getByLabel("报告维度").selectOption("classroom");
  await expect(dialog.getByLabel("幼儿", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText(/至少覆盖2名幼儿/)).toBeVisible();
});

test("课程线索可删除派生内容且明确保留来源观察", async ({ page }) => {
  await mockApi(page, "teacher", true, false, false, true);
  await page.goto("/curriculum");
  await expect(page.getByRole("heading", { name: "机器人怎样站得更稳" })).toBeVisible();
  await expect(page.getByText(/不会删除来源观察/)).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  const deleteRequest = page.waitForRequest((request) => request.method() === "DELETE" && request.url().endsWith(`/api/curriculum-clues/${curriculumClue.id}`));
  await page.getByRole("button", { name: "删除课程线索" }).click();
  await deleteRequest;
  await expect(page.getByText("尚无课程线索")).toBeVisible();
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

test("生产教研员端可查看并编辑全部AI场景提示词", async ({ page }) => {
  await mockApi(page, "researcher");
  await page.goto("/");
  await page.getByRole("button", { name: /提示词配置/ }).click();
  await expect(page.getByRole("heading", { name: "提示词配置" })).toBeVisible();
  await expect(page.getByText("安全与循证底线不可修改")).toBeVisible();
  await expect(page.getByRole("heading", { name: "统一模型配置" })).toBeVisible();
  const modelInput = page.getByLabel("千问模型 ID");
  await expect(modelInput).toHaveValue("qwen3.7-plus-2026-05-26");
  await modelInput.fill("qwen3.7-plus-2026-08-30-custom");
  await expect(page.getByRole("button", { name: "保存统一模型" })).toBeEnabled();
  await expect(page.getByRole("heading", { name: "逐幼儿观察分析" })).toBeVisible();
  await expect(page.getByLabel(/园所场景提示词/)).toHaveValue(/逐幼儿循证分析助手/);
});

test("教研员保留账号、提示词与教研入口且不出现审批模块", async ({ page }) => {
  await mockApi(page, "researcher");
  await page.goto("/");
  await openWorkspaceMenu(page);
  await expect(page.getByRole("link", { name: "观察质量审核" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "导出审批" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "账号管理" })).toBeVisible();
  await expect(page.getByRole("link", { name: "提示词配置" })).toBeVisible();
  await page.getByRole("link", { name: "教研活动" }).click();
  await expect(page.getByRole("heading", { name: "教研活动模式" })).toBeVisible();
});
