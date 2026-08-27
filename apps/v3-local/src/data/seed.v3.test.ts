import { describe, expect, it } from "vitest";
import { seedSnapshot } from "./seed";

describe("同迹3.0演示数据", () => {
  it("覆盖完整业务闭环及四项治理能力", () => {
    expect(seedSnapshot.children.length).toBeGreaterThanOrEqual(12);
    expect(seedSnapshot.evidencePackages.length).toBeGreaterThanOrEqual(8);
    expect(seedSnapshot.analysisRuns.length).toBeGreaterThanOrEqual(5);
    expect(seedSnapshot.supportActions.some((item) => item.followUpPackageId)).toBe(true);
    expect(seedSnapshot.individualReports.length).toBeGreaterThanOrEqual(2);
    expect(seedSnapshot.curriculumClues.some((item) => item.thresholdMet)).toBe(true);
    expect(seedSnapshot.qualityReviews.length).toBeGreaterThan(0);
    expect(seedSnapshot.exportRequests.length).toBeGreaterThan(0);
    expect(seedSnapshot.userAccounts.some((item) => item.status === "已停用")).toBe(true);
    expect(seedSnapshot.researchActivities.length).toBeGreaterThan(0);
  });

  it("所有分析结论均可回链证据", () => {
    expect(seedSnapshot.claims.every((claim) => claim.evidenceAnchors.length > 0)).toBe(true);
    expect(seedSnapshot.claims.filter((claim) => claim.layer === "假设").every((claim) => claim.reviewStatus === "待验证")).toBe(true);
  });
});
