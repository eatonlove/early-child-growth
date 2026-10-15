import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key-1234567890";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key-1234567890";
  process.env.QIANWEN_API_KEY = "sk-yt-test-credential";
  process.env.QIANWEN_API_KEY_YQY = "sk-yqy-test-credential";
});

import { config } from "../config.js";
import { aiCredentialConfigView, type AICredentialConfigRow } from "./credential-config.js";

describe("tenant-wide credential selection", () => {
  it("keeps the existing YT default and exposes only aliases and availability", () => {
    const view = aiCredentialConfigView();
    expect(view).toMatchObject({ profile: "YT", revision: 0, source: "environment" });
    expect(view.options).toEqual([{ value: "YT", label: "YT", configured: true }, { value: "YQY", label: "YQY", configured: true }]);
    expect(JSON.stringify(view)).not.toContain("sk-");
  });

  it("persists only the tenant alias and revision, not key material", () => {
    const row = { profile: "YQY", revision: 3, updated_at: "2026-10-15T09:00:00Z" } as AICredentialConfigRow;
    expect(aiCredentialConfigView(row)).toMatchObject({ profile: "YQY", revision: 3, source: "tenant" });
    const previous = config.qwenApiKeys.YQY;
    config.qwenApiKeys.YQY = "";
    try {
      expect(aiCredentialConfigView(row).options[1]?.configured).toBe(false);
      expect(aiCredentialConfigView(row).profile).toBe("YQY");
    } finally {
      config.qwenApiKeys.YQY = previous;
    }
  });
});
