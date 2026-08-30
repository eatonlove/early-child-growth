import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key-1234567890";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key-1234567890";
});

import { aiModelConfigView, aiModelOptions, isValidAIModelKey, type AIModelConfigRow } from "./model-config.js";
import { config } from "../config.js";

const row: AIModelConfigRow = {
  id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "22222222-2222-4222-8222-222222222222",
  model_key: "qwen3.7-flash",
  revision: 2,
  created_by: "33333333-3333-4333-8333-333333333333",
  updated_by: "33333333-3333-4333-8333-333333333333",
  created_at: "2026-08-30T08:00:00.000Z",
  updated_at: "2026-08-30T09:00:00.000Z",
};

describe("tenant-wide AI model configuration", () => {
  it("uses the server default until a tenant selection is saved", () => {
    const view = aiModelConfigView();
    expect(view.model).toBe(config.QWEN_TEXT_MODEL);
    expect(view.source).toBe("environment");
    expect(view.revision).toBe(0);
    expect(view.options.some((item) => item.value === view.model)).toBe(true);
  });

  it("exposes suggested models and accepts valid custom model IDs", () => {
    const view = aiModelConfigView(row);
    expect(view).toMatchObject({ model: "qwen3.7-flash", source: "tenant", revision: 2 });
    expect(isValidAIModelKey("qwen3.7-flash-2026-07-15")).toBe(true);
    expect(isValidAIModelKey("qwen3.7-plus-2026-08-30-custom")).toBe(true);
    expect(isValidAIModelKey("vendor/qwen:latest")).toBe(true);
    expect(isValidAIModelKey("bad model")).toBe(false);
    expect(isValidAIModelKey("中文模型")).toBe(false);
    expect(new Set(aiModelOptions().map((item) => item.value)).size).toBe(aiModelOptions().length);
  });
});
