import { describe, expect, it } from "vitest";
import { buildInterestInsights } from "./interest-insights.js";

describe("interest insights", () => {
  it("separates one-off themes from sustained and shared interests", () => {
    const result = buildInterestInsights([
      { id: "a", theme: "泡泡大探秘", occurred_at: "2026-08-01T09:00:00+08:00", child_id: "c1", participant_child_ids: ["c1", "c2"] },
      { id: "b", theme: "泡泡探索", occurred_at: "2026-08-08T09:00:00+08:00", child_id: "c1", participant_child_ids: ["c1", "c2"] },
      { id: "c", theme: "森林舞台", occurred_at: "2026-08-08T10:00:00+08:00", child_id: "c1", participant_child_ids: ["c1"] },
    ], "c1");
    expect(result.sustainedInterests).toHaveLength(1);
    expect(result.sustainedInterests[0]?.observationCount).toBe(2);
    expect(result.sharedInterests[0]?.childCount).toBe(2);
    expect(result.sharedInterests.some((item) => item.label.includes("森林"))).toBe(false);
  });
});
