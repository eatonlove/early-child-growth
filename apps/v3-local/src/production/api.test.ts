import { afterEach, describe, expect, it, vi } from "vitest";
import { isUnauthenticatedError, remoteApi, RemoteApiError } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("production API error boundary", () => {
  it("treats only authentication and account access responses as logged out", () => {
    expect(isUnauthenticatedError(new RemoteApiError(401, "AUTH_REQUIRED", "请先登录"))).toBe(true);
    expect(isUnauthenticatedError(new RemoteApiError(403, "ACCOUNT_DISABLED", "账号已停用"))).toBe(true);
    expect(isUnauthenticatedError(new RemoteApiError(500, "PROFILE_LOOKUP_FAILED", "服务失败"))).toBe(false);
    expect(isUnauthenticatedError(new TypeError("Failed to fetch"))).toBe(false);
  });
});

describe("production AI prompt API", () => {
  it("uses the real researcher prompt endpoints with revision control", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const prompt = {
      key: "observation_analysis",
      name: "逐幼儿观察分析",
      category: "观察",
      description: "生成观察、识别与应答",
      defaultVersion: "observation-analysis.qwen.v5",
      effectiveVersion: "observation-analysis.qwen.v5",
      source: "default",
      revision: 0,
      defaultPrompt: "系统默认提示词".repeat(10),
      customPrompt: null,
      effectivePrompt: "系统默认提示词".repeat(10),
      basePromptVersion: "observation-analysis.qwen.v5",
      baseVersionOutdated: false,
      changeNote: "",
      updatedAt: null,
      updatedBy: null,
      updatedByName: null,
    } as const;
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith("/ai-model-config")) return new Response(JSON.stringify({ item: { model: "qwen3.7-flash", revision: 1 } }), { status: 200 });
      if (url.endsWith("/reset")) return new Response(JSON.stringify({ item: prompt }), { status: 200 });
      if (init?.method === "PUT") return new Response(JSON.stringify({ item: { ...prompt, source: "custom", revision: 1 } }), { status: 200 });
      return new Response(JSON.stringify({ immutableSafetyPrompt: "固定安全边界", items: [prompt] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);

    await remoteApi.aiModelConfig();
    await remoteApi.updateAIModelConfig({ model: "qwen3.7-flash", expectedRevision: 0 });
    await remoteApi.aiPrompts();
    await remoteApi.updateAIPrompt("observation_analysis", {
      systemPrompt: "园所自定义提示词".repeat(20),
      expectedRevision: 0,
      changeNote: "测试修改",
    });
    await remoteApi.resetAIPrompt("observation_analysis", 1);

    expect(calls.map((call) => call.url)).toEqual([
      "/api/ai-model-config",
      "/api/ai-model-config",
      "/api/ai-prompts",
      "/api/ai-prompts/observation_analysis",
      "/api/ai-prompts/observation_analysis/reset",
    ]);
    expect(calls[1]?.init?.method).toBe("PUT");
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ model: "qwen3.7-flash", expectedRevision: 0 });
    expect(calls[3]?.init?.method).toBe("PUT");
    expect(JSON.parse(String(calls[3]?.init?.body))).toMatchObject({ expectedRevision: 0, changeNote: "测试修改" });
    expect(calls[4]?.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[4]?.init?.body))).toEqual({ expectedRevision: 1 });
  });
});

describe("production curriculum API", () => {
  it("deletes a curriculum clue through the real backend contract", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);

    await remoteApi.deleteCurriculumClue("21212121-2121-4121-8121-212121212121");

    expect(fetcher).toHaveBeenCalledWith(
      "/api/curriculum-clues/21212121-2121-4121-8121-212121212121",
      expect.objectContaining({ method: "DELETE", credentials: "include" }),
    );
  });
});
