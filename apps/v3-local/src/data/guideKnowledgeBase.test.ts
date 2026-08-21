import { describe, expect, it } from "vitest";
import {
  GUIDE_KNOWLEDGE_VERSION, completeKnowledgeCards, guideKnowledgeCards,
  guideKnowledgeStats,
} from "./guideKnowledgeBase";

describe("《3-6岁儿童学习与发展指南》知识库", () => {
  it("完整覆盖五大领域、11个子领域、32个目标和96张年龄参照卡", () => {
    expect(GUIDE_KNOWLEDGE_VERSION).toBe("guide-cn-2012.v1.0.0");
    expect(guideKnowledgeStats).toEqual({ domains: 5, subdomains: 11, goals: 32, ageReferenceCards: 96 });
    expect(guideKnowledgeCards).toHaveLength(96);
    expect(completeKnowledgeCards).toHaveLength(99);
    expect(new Set(guideKnowledgeCards.map((card) => card.code)).size).toBe(96);
  });

  it.each(["小班", "中班", "大班"] as const)("%s包含全部32个目标", (grade) => {
    const cards = guideKnowledgeCards.filter((card) => card.grade === grade);
    expect(cards).toHaveLength(32);
    expect(cards.every((card) => card.officialExpectations.length > 0)).toBe(true);
    expect(cards.every((card) => card.evidenceRequirements.length > 0)).toBe(true);
    expect(cards.every((card) => Object.keys(card.responseStrategies).length === 3)).toBe(true);
  });

  it("同一目标始终具备三个年龄段对照", () => {
    const goalGroups = new Map<string, Set<string>>();
    guideKnowledgeCards.forEach((card) => {
      const key = `${card.domain}-${card.subdomain}-${card.goalNumber}`;
      goalGroups.set(key, (goalGroups.get(key) ?? new Set()).add(card.ageBand));
    });
    expect(goalGroups.size).toBe(32);
    expect([...goalGroups.values()].every((ageBands) => ageBands.size === 3)).toBe(true);
  });

  it("健康体态卡明确禁止AI从影像估算生长发育", () => {
    const bodyCard = guideKnowledgeCards.find((card) => card.code === "GUIDE-HEA-WB-01-3-4");
    expect(bodyCard?.applicability).toBe("健康档案与家园协同");
    expect(bodyCard?.misunderstandingWarning).toContain("AI不得从照片或视频推断");
  });
});
