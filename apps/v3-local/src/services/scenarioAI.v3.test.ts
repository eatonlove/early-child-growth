import { describe, expect, it } from "vitest";
import { seedEvidencePackages, seedMediaEvidence, seedObservationSubjects } from "../data/seed";
import { guideKnowledgeCards } from "../data/guideKnowledgeBase";
import { seedChildren } from "../data/seed";
import { ScenarioAIProvider } from "./scenarioAI";

describe("ScenarioAIProvider", () => {
  const provider = new ScenarioAIProvider();

  it("教师原始判断未提交时拒绝分析", async () => {
    const draft = seedEvidencePackages.find((item) => item.status === "教师草稿")!;
    await expect(provider.analyze(
      draft,
      seedObservationSubjects.filter((item) => item.evidencePackageId === draft.id),
      seedMediaEvidence.filter((item) => item.evidencePackageId === draft.id),
    )).rejects.toThrow("教师原始观察");
  });

  it("事实层只整理教师已提交白描", async () => {
    const submitted = seedEvidencePackages.find((item) => item.status === "教师已提交")!;
    const subjects = seedObservationSubjects.filter((item) => item.evidencePackageId === submitted.id);
    const result = await provider.analyze(submitted, subjects, seedMediaEvidence.filter((item) => item.evidencePackageId === submitted.id));
    const fact = result.claims.find((item) => item.layer === "事实" && item.subjectId === subjects[0].id);
    expect(fact?.content).toBe(subjects[0].teacherObservation);
    expect(result.claims.find((item) => item.layer === "假设")?.reviewStatus).toBe("待验证");
  });

  it("根据幼儿所在班级只引用对应年龄段指标", async () => {
    const submitted = seedEvidencePackages.find((item) => item.status === "教师已提交")!;
    const subjects = seedObservationSubjects.filter((item) => item.evidencePackageId === submitted.id);
    const children = seedChildren.map((child) => ({ ...child, grade: "小班" as const }));
    const result = await provider.analyze(
      submitted,
      subjects,
      seedMediaEvidence.filter((item) => item.evidencePackageId === submitted.id),
      { children, knowledgeCards: guideKnowledgeCards },
    );
    expect(result.runs.every((run) => run.ageReference.startsWith("小班"))).toBe(true);
    expect(result.runs.flatMap((run) => run.developmentReferences).length).toBeGreaterThan(0);
    expect(result.runs.flatMap((run) => run.developmentReferences).every((item) => item.grade === "小班" && item.indicatorCode.endsWith("3-4"))).toBe(true);
  });
});
