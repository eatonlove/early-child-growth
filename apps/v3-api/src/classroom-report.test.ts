import { describe, expect, it } from "vitest";
import { classroomReportEvidenceCoverage, classroomReportMetrics } from "./classroom-report.js";

const observations = [
  { id: "observation-1", child_id: "child-1", occurred_at: "2026-08-01T09:00:00+08:00", scene: "建构区" },
  { id: "observation-2", child_id: "child-2", occurred_at: "2026-08-02T09:00:00+08:00", scene: "沙水区" },
  { id: "observation-3", child_id: "child-1", occurred_at: "2026-08-02T10:00:00+08:00", scene: "建构区" },
];

describe("classroom period report evidence", () => {
  it("requires two children and two China-local dates", () => {
    expect(classroomReportEvidenceCoverage(observations)).toMatchObject({ eligible: true, childCount: 2, timePointCount: 2 });
    expect(classroomReportEvidenceCoverage(observations.filter((item) => item.child_id === "child-1")).eligible).toBe(false);
  });

  it("computes domain evidence and follow-up rate from reviewed records", () => {
    const metrics = classroomReportMetrics({
      observations,
      analyses: [
        { observation_id: "observation-1", structured_result: { developmentReferences: [{ domain: "科学" }, { domain: "科学" }, { domain: "语言" }] } },
        { observation_id: "observation-2", structured_result: { developmentReferences: [{ domain: "社会" }] } },
      ],
      supports: [{ status: "verified" }, { status: "planned" }],
      totalChildCount: 3,
      curriculumClues: [{ id: "11111111-1111-4111-8111-111111111111", title: "桥梁探究", theme: "结构", status: "draft" }],
    });
    expect(metrics).toMatchObject({
      observationCount: 3,
      timePointCount: 2,
      observedChildCount: 2,
      totalChildCount: 3,
      sceneCoverage: ["建构区", "沙水区"],
      domainEvidence: { 健康: 0, 语言: 1, 社会: 1, 科学: 1, 艺术: 0 },
      supportFollowUpRate: 50,
    });
  });
});
