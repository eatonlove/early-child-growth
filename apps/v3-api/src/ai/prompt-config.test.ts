import { describe, expect, it } from "vitest";
import { promptView, type AIPromptConfigRow } from "./prompt-registry.js";
import { AI_PROMPT_DEFINITIONS } from "./qianwen-provider.js";

const row: AIPromptConfigRow = {
  id: "11111111-1111-4111-8111-111111111111",
  prompt_key: "observation_analysis",
  custom_prompt: "园所自定义逐幼儿观察分析提示词。".repeat(12),
  base_prompt_version: AI_PROMPT_DEFINITIONS.observation_analysis.defaultVersion,
  revision: 3,
  change_note: "加强目标幼儿归属核验",
  created_by: "22222222-2222-4222-8222-222222222222",
  updated_by: "33333333-3333-4333-8333-333333333333",
  created_at: "2026-08-28T08:00:00.000Z",
  updated_at: "2026-08-28T09:00:00.000Z",
};

describe("AI prompt configuration view", () => {
  it("falls back to the code default when the tenant has no override", () => {
    const view = promptView("observation_analysis");
    expect(view.source).toBe("default");
    expect(view.revision).toBe(0);
    expect(view.effectivePrompt).toBe(AI_PROMPT_DEFINITIONS.observation_analysis.defaultSystemPrompt);
    expect(view.effectiveVersion).toBe(AI_PROMPT_DEFINITIONS.observation_analysis.defaultVersion);
  });

  it("returns a traceable tenant revision and flags an outdated base", () => {
    const current = promptView("observation_analysis", row);
    expect(current.source).toBe("custom");
    expect(current.effectivePrompt).toBe(row.custom_prompt);
    expect(current.effectiveVersion).toBe(`custom.observation_analysis.r3@${row.base_prompt_version}`);
    expect(current.baseVersionOutdated).toBe(false);

    const outdated = promptView("observation_analysis", { ...row, base_prompt_version: "observation-analysis.qwen.v4" });
    expect(outdated.baseVersionOutdated).toBe(true);
  });
});
