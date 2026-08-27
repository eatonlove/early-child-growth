import { describe, expect, it } from "vitest";
import { normalizeAnalysisResultForView } from "./evolution-pages";
import type { RemoteAnalysis } from "./types";

describe("normalizeAnalysisResultForView", () => {
  it("keeps a legacy analysis renderable without inventing new professional sections", () => {
    const legacy = {
      objectiveSummary: "幼儿调整桥墩后再次测试。",
      facts: [{ content: "移动桥墩", evidence: "教师白描", confidence: 0.9 }],
    } as RemoteAnalysis["structured_result"];

    const normalized = normalizeAnalysisResultForView(legacy);

    expect(normalized.isLegacyAnalysis).toBe(true);
    expect(normalized.result.objectiveSummary).toBe(legacy.objectiveSummary);
    expect(normalized.result.facts).toEqual(legacy.facts);
    expect(normalized.result.gameExperience).toEqual([]);
    expect(normalized.result.domainExperiences).toEqual([]);
    expect(normalized.result.learningDispositions).toEqual([]);
    expect(normalized.result.warnings[0]).toContain("旧版结构");
  });
});
