import mammoth from "mammoth";
import { describe, expect, it } from "vitest";
import { generateBlankObservationTemplate, generateCurriculumDocument, generateObservationDocument, observationDocumentFormat } from "./documents.js";

describe("Word document generation", () => {
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
    expect(text).not.toContain("综合评分");
  });

  it("keeps teacher-confirmed evidence in the professional observation export", async () => {
    const buffer = await generateObservationDocument({
      variant: "professional",
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
    });
    const text = (await mammoth.extractRawText({ buffer })).value;
    expect(text).toContain("幼儿移动桥墩后再次测试");
    expect(text).toContain("专业分析");
    expect(text).toContain("小禾");
    expect(text).toContain("小山");
    expect(text).toContain("回应同伴并共同调整");
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
});
