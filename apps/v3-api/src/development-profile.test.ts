import { describe, expect, it } from "vitest";
import { buildClassroomDevelopmentProfile, buildIndividualDevelopmentProfile } from "./development-profile.js";

const observations = [
  { id: "11111111-1111-4111-8111-111111111111", occurred_at: "2026-08-01T09:00:00+08:00", scene: "建构区" },
  { id: "22222222-2222-4222-8222-222222222222", occurred_at: "2026-08-08T09:00:00+08:00", scene: "沙水区" },
];

describe("development profiles", () => {
  it("uses descriptive states and keeps missing domains neutral", () => {
    const analyses = observations.map((observation) => ({
      observation_id: observation.id,
      child_id: "child-a",
      structured_result: {
        domainExperiences: [{ domain: "科学", noJudgment: false, possibleExperience: "比较材料变化" }],
        gameExperience: [{ dimension: "问题解决", possibleExperience: "再次尝试" }],
        learningDispositions: [{ dimension: "专注与坚持", possibleExperience: "继续调整" }],
      },
    }));
    const profile = buildIndividualDevelopmentProfile(observations, analyses);
    expect(profile.domains.find((item) => item.dimension === "科学")?.state).toBe("发展中");
    expect(profile.domains.find((item) => item.dimension === "艺术")?.state).toBe("待积累证据");
    expect(profile.domains.map((item) => item.state)).not.toContain("达标");
    expect(profile.evidenceBoundary).toContain("不代表测评分数、排名");
  });

  it("builds class state distributions without comparing children", () => {
    const profile = buildClassroomDevelopmentProfile({
      childIds: ["child-a", "child-b"],
      observations,
      analyses: [{
        observation_id: observations[0]!.id,
        child_id: "child-a",
        structured_result: { domainExperiences: [{ domain: "语言", noJudgment: false, possibleExperience: "表达游戏计划" }] },
      }],
    });
    const language = profile.domains.find((item) => item.domain === "语言")!;
    expect(language.distribution.初现).toBe(1);
    expect(language.distribution.待积累证据).toBe(1);
    expect(language.observedChildCount).toBe(1);
  });
});
