import mammoth from "mammoth";
import { describe, expect, it } from "vitest";
import { documentStorageObjectPath, generateBlankObservationTemplate, generateCurriculumDocument, generateObservationArchiveDocument, generateObservationDocument, observationDocumentFormat } from "./documents.js";

describe("Word document generation", () => {
  it("uses an ASCII-only storage key independent of the download filename", () => {
    const path = documentStorageObjectPath(
      "00096e73-b32c-4468-acac-b6213cef1cae",
      "cf43c3a1-33eb-4fb7-a6ef-bc9d35974abe",
      "abc5aa23-d86b-4bf9-87cb-422b0245f5ba",
    );

    expect(path).toBe("00096e73-b32c-4468-acac-b6213cef1cae/cf43c3a1-33eb-4fb7-a6ef-bc9d35974abe/exports/abc5aa23-d86b-4bf9-87cb-422b0245f5ba/document.docx");
    expect(path).toMatch(/^[\x20-\x7e]+$/);
  });

  it("normalizes Word imports when the browser sends a generic MIME type", () => {
    expect(observationDocumentFormat("观察记录.docx", "application/octet-stream")).toEqual({
      extension: "docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(observationDocumentFormat("旧版观察表.doc", "application/octet-stream")).toEqual({
      extension: "doc",
      mimeType: "application/msword",
    });
  });

  it("generates a standard observation template that can be parsed as DOCX", async () => {
    const buffer = await generateBlankObservationTemplate();
    const text = (await mammoth.extractRawText({ buffer })).value;
    expect(buffer.byteLength).toBeGreaterThan(5000);
    expect(text).toContain("同迹·游戏观察记录表");
    expect(text).toContain("客观白描");
    expect(text).toContain("观察聚焦（单选）");
    expect(text).toContain("材料与工具");
    expect(text).not.toContain("综合评分");
  });

  it("keeps teacher-confirmed evidence in the professional observation export", async () => {
    const input = {
      schoolName: "演示幼儿园",
      classroomName: "中一班",
      observerNames: ["演示教师"],
      observation: {
        occurred_at: "2026-08-27T09:00:00+08:00", scene: "建构区", theme: "桥梁",
        organization_stage: "process", teacher_observation: "幼儿移动桥墩后再次测试。",
        teacher_identification: "教师识别到比较支撑位置的线索。",
        teacher_response: { strategy: "提供不同支撑物", nextObservationFocus: "继续观察比较" },
      },
      subjects: [
        { displayName: "小禾", role: "primary", contextualFeature: "主动发起搭桥" },
        { displayName: "小山", role: "participant", contextualFeature: "共同调整桥墩" },
      ],
      evidence: [{ evidence_type: "video", file_name: "桥梁片段.mp4" }],
      analyses: [
        {
          childId: "child-1", childName: "小禾", result: {
            gameExperience: [{ dimension: "问题解决", possibleExperience: "出现调整和再次测试的线索" }],
            domainExperiences: [{ domain: "科学", possibleExperience: "可能正在比较支撑位置" }],
            learningDispositions: [{ dimension: "专注与坚持", possibleExperience: "倒塌后继续尝试" }],
            learningPossibilities: ["继续比较"], gamePossibilities: ["改变一个材料变量"],
            observationCut: ["支撑变化时如何调整"], observationFocus: ["首次反应", "再次测试"],
            objectiveSummary: "幼儿移动桥墩后再次测试。",
            facts: [{ content: "移动桥墩后再次测试", evidenceIds: ["教师原稿"] }],
            currentExperience: "出现比较支撑位置的经验线索。",
            developmentReferences: [{ domain: "科学", indicatorCode: "SC-M-01", title: "探究与比较", ageBand: "4-5岁", status: "线索", evidenceStatement: "移动后再次测试", missingEvidence: "需跨情境复察" }],
            interpretations: [{ indicatorCode: "SC-M-01", content: "可能在比较位置变化", limitation: "单次观察" }],
            responsePlans: [{ title: "一次只改变一个支撑变量", rationale: "便于幼儿比较", activitySupport: { activityName: "桥梁再测试", steps: ["选择位置", "再次测试"] }, materialSupport: { materials: [{ name: "桥墩", quantity: "3个", variable: "位置" }] }, experienceSupport: { suggestedQuestions: ["哪里不一样？"], withdrawalCondition: "幼儿继续自主尝试" }, observationCut: "是否主动比较" }],
            historicalComparison: { caution: "尚需更多时间点", changes: [] },
            externalSupportReferences: [{ title: "幼儿探究活动参考", source: "公开资料", url: "https://example.com/support", appliedSuggestion: "一次改变一个变量" }],
          },
        },
        {
          childId: "child-2", childName: "小山", result: {
            gameExperience: [{ dimension: "交往合作", possibleExperience: "回应同伴并共同调整" }],
            domainExperiences: [{ domain: "社会", possibleExperience: "可能正在协商共同方案" }],
            learningDispositions: [{ dimension: "合作与表达", possibleExperience: "用动作回应同伴建议" }],
          },
        },
      ],
    };
    const professional = await generateObservationDocument({ ...input, variant: "professional" });
    const teacher = await generateObservationDocument({ ...input, variant: "teacher" });
    const professionalText = (await mammoth.extractRawText({ buffer: professional })).value;
    const teacherText = (await mammoth.extractRawText({ buffer: teacher })).value;
    expect(professionalText).toContain("幼儿移动桥墩后再次测试");
    expect(professionalText).toContain("教师终审后的专业分析");
    expect(professionalText).toContain("SC-M-01");
    expect(professionalText).toContain("一次只改变一个支撑变量");
    expect(professionalText).toContain("幼儿探究活动参考");
    expect(professionalText).toContain("小禾");
    expect(professionalText).toContain("小山");
    expect(professionalText).toContain("回应同伴并共同调整");
    expect(teacherText).toContain("幼儿移动桥墩后再次测试");
    expect(teacherText).not.toContain("教师终审后的专业分析");
    expect(teacherText).not.toContain("SC-M-01");
    expect(teacherText).not.toContain("幼儿探究活动参考");
  });

  it("generates the school curriculum template with cycle records", async () => {
    const buffer = await generateCurriculumDocument({
      schoolName: "演示幼儿园", classroomName: "中一班", implementationPeriod: "四周",
      title: "桥梁探究", coreInquiryClue: "怎样让桥更稳",
      content: {
        themeOrigin: { coreEmergencePoint: "桥梁反复倒塌", sourceDescription: "来自三次连续观察" },
        coreCompetencies: { 与自然同生: ["比较结构"], 与生活同生: ["联系真实桥梁"], 与自我同生: ["坚持调整"] },
        generatedPossibilities: { presetDirections: ["支撑位置"], opennessNote: "保留幼儿新问题", mindMap: [] },
        implementationFramework: { teacherSupportAndQuestions: ["哪里发生了变化"], anticipatedChildActivities: ["再次测试"], environmentAndMaterials: ["不同支撑物"], experienceAndNewDirections: ["形成新问题"] },
        resources: { environment: [], materials: [], familyPartnership: [], processActivities: [], sharedOutcomes: [] },
        adjustmentBasis: ["根据复察调整"],
      },
      cycles: [{ cycle_number: 1, zone: "starting", seven_steps: { 发现真问题: "桥会倒" }, reflection: "幼儿提出增加桥墩", new_questions: ["桥墩放哪里"] }],
    });
    const text = (await mammoth.extractRawText({ buffer })).value;
    expect(text).toContain("四区七步N循环");
    expect(text).toContain("第1轮");
    expect(text).toContain("桥会倒");
  });

  it("generates a class observation archive with multiple records", async () => {
    const record = {
      variant: "teacher" as const,
      schoolName: "成都市第六幼儿园B区",
      classroomName: "中四班",
      observerNames: ["陈老师"],
      observation: {
        title: "泡泡大探秘", occurred_at: "2026-08-20T09:00:00+08:00", scene: "科学区", theme: "泡泡",
        organization_stage: "process", teacher_observation: "幼儿更换吹泡工具后再次尝试。",
        teacher_identification: "教师识别到比较工具差异的线索。",
        teacher_response: { strategy: "提供不同口径的工具", nextObservationFocus: "观察幼儿如何比较结果" },
      },
      subjects: [{ displayName: "小禾", role: "primary", contextualFeature: "主动更换工具" }],
      evidence: [{ evidence_type: "photo", file_name: "泡泡工具.jpg" }],
    };
    const buffer = await generateObservationArchiveDocument({
      schoolName: "成都市第六幼儿园B区",
      archiveLabel: "2025-2026学年下学期 · 中四班 · 2026年8月",
      records: [record, { ...record, observation: { ...record.observation, title: "泡泡再比较" } }],
    });
    const text = (await mammoth.extractRawText({ buffer })).value;
    expect(text).toContain("班级游戏观察档案");
    expect(text).toContain("2025-2026学年下学期");
    expect(text).toContain("泡泡大探秘");
    expect(text).toContain("泡泡再比较");
    expect(text).toContain("2条");
  });
});
