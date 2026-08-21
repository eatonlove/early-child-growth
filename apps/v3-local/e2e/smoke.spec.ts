import { expect, test } from "@playwright/test";

test("教师可完成证据、成长、报告与课程主流程导航", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "今天，从教师的判断开始" })).toBeVisible();
  await page.getByRole("link", { name: "观察·识别·应答" }).click();
  await expect(page.getByRole("heading", { name: "观察 · 识别 · 应答工作台" })).toBeVisible();
  await expect(page.getByText("教师原始判断").first()).toBeVisible();
  await page.getByRole("link", { name: "个体成长" }).click();
  await expect(page.getByRole("heading", { name: "个体成长轨迹" })).toBeVisible();
  await page.getByRole("link", { name: "周期报告" }).click();
  await expect(page.getByText("教师专业版")).toBeVisible();
  await page.getByRole("link", { name: "课程建构" }).click();
  await expect(page.getByRole("heading", { name: "从游戏证据生成课程" })).toBeVisible();
});

test("教研管理员拥有四项独立治理入口", async ({ page }) => {
  await page.goto("/");
  await page.locator(".role-button").click();
  await page.getByRole("button", { name: /教研管理员.*审核、治理与教研/ }).click();
  await expect(page.getByRole("heading", { name: "观察质量独立审核" })).toBeVisible();
  for (const [link, heading] of [["导出审批", "敏感数据导出审批"], ["账号管理", "账号与停用管理"], ["教研活动", "教研活动模式"]]) {
    await page.getByRole("link", { name: link }).click();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});

test("教师原稿提交前模拟AI保持锁定，提交后可生成对照", async ({ page }) => {
  await page.goto("/evidence");
  await page.getByRole("button", { name: /透明片叠出了新颜色/ }).click();
  await page.getByRole("button", { name: /AI 对照 0/ }).click();
  await expect(page.getByRole("heading", { name: "模拟 AI 尚未开放" })).toBeVisible();
  await page.getByRole("button", { name: "教师原始判断" }).click();
  await page.getByRole("button", { name: "提交并锁定原稿" }).click();
  await page.getByRole("button", { name: /AI 对照 0/ }).click();
  await page.getByRole("button", { name: "生成对照分析" }).click();
  await expect(page.getByText("教师与模拟 AI 对照")).toBeVisible();
  await expect(page.getByText("事实").first()).toBeVisible();
});

test("质量审核、导出审批、账号停用和教研活动均可流转", async ({ page }) => {
  await page.goto("/");
  await page.locator(".role-button").click();
  await page.getByRole("button", { name: /教研管理员.*审核、治理与教研/ }).click();
  await page.getByRole("button", { name: "审核通过" }).click();
  await expect(page.getByText("观察质量审核已通过。" )).toBeVisible();

  await page.getByRole("link", { name: "导出审批" }).click();
  await page.getByRole("button", { name: "有条件通过" }).click();
  await expect(page.getByText("导出申请已通过。" )).toBeVisible();

  await page.getByRole("link", { name: "账号管理" }).click();
  await page.getByRole("button", { name: "停用" }).first().click();
  await expect(page.getByText("账号已停用，历史记录仍保留。" )).toBeVisible();

  await page.getByRole("link", { name: "教研活动" }).click();
  await page.getByRole("button", { name: "开始活动" }).click();
  await expect(page.getByText("教研活动已进入“进行中”。" )).toBeVisible();
});

test("幼儿导入、游戏计划和课程版本均写入本地仓储", async ({ page }) => {
  await page.goto("/children");
  await page.getByRole("button", { name: "导入幼儿名单" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "children.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("姓名,园内使用名,出生年月,班级,年级,授权状态\n测试幼儿,新新,2020-09,大一班,大班,已授权\n"),
  });
  await page.getByRole("button", { name: "确认导入 1 名幼儿" }).click();
  await expect(page.getByText("已导入 1 名幼儿，数据仅保存在当前浏览器。" )).toBeVisible();

  await page.getByRole("link", { name: "游戏计划" }).click();
  await page.getByRole("button", { name: "新建计划" }).click();
  await page.getByLabel("计划名称").fill("纸筒滚动实验场");
  await page.getByLabel("课程缘起与真实问题").fill("幼儿持续比较纸筒的滚动距离，并提出坡度是否会改变结果。");
  await page.getByLabel("关键目标").fill("在真实游戏中比较坡度与滚动结果");
  await page.getByLabel("对应观察重点").fill("是否依据多次结果调整坡度");
  await page.getByRole("button", { name: "保存计划" }).click();
  await expect(page.getByText("游戏计划已保存，并可在证据包中选择关联。" )).toBeVisible();

  await page.getByRole("link", { name: "课程建构" }).click();
  await page.getByRole("button", { name: "保存新版本并推进" }).click();
  await expect(page.getByText(/课程草案已保存为新版本/)).toBeVisible();
});

test("指南知识库可按小中大班筛选并展示三年龄段对照", async ({ page }) => {
  await page.goto("/knowledge");
  await expect(page.getByRole("heading", { name: "《指南》分年龄知识库" })).toBeVisible();
  await expect(page.getByText("96", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "小班 3-4岁" }).click();
  await page.getByRole("button", { name: "科学", exact: true }).click();
  await page.getByRole("button", { name: /科学探究 具有初步的探究能力/ }).click();
  await expect(page.getByText("小班 · 3-4岁")).toBeVisible();
  await expect(page.getByText("同一目标的小中大班对照")).toBeVisible();
  await expect(page.getByText("教师应答设计")).toBeVisible();
  await expect(page.getByText("证据最低要求")).toBeVisible();
});
