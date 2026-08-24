import { describe, expect, it } from "vitest";
import { canTransitionResearchActivity, recommendObservationTemplates } from "./workflow-contracts.js";

describe("production workflow contracts", () => {
  it("recommends exact grade and scene templates first", () => {
    const templates = [
      { name: "通用观察", grade: null, scenes: [] },
      { name: "中班建构", grade: "middle", scenes: ["建构区"] },
      { name: "小班建构", grade: "small", scenes: ["建构区"] },
      { name: "中班沙水", grade: "middle", scenes: ["沙水区"] },
    ];

    expect(recommendObservationTemplates(templates, { grade: "middle", scene: "建构区" }).map((item) => item.name))
      .toEqual(["中班建构", "小班建构", "通用观察"]);
  });

  it("only permits sequential research activity transitions", () => {
    expect(canTransitionResearchActivity("preparing", "in_progress")).toBe(true);
    expect(canTransitionResearchActivity("in_progress", "completed")).toBe(true);
    expect(canTransitionResearchActivity("completed", "archived")).toBe(true);
    expect(canTransitionResearchActivity("preparing", "completed")).toBe(false);
    expect(canTransitionResearchActivity("archived", "in_progress")).toBe(false);
  });
});
