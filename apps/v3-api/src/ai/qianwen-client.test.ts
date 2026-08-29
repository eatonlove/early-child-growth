import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { QwenClient } from "./qianwen-client.js";

describe("QwenClient", () => {
  it("requests strict structured output and validates the response", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: "```json\n{\"answer\":\"可审核草稿\"}\n```" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const client = new QwenClient({
      apiKey: "sk-test-only",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      timeoutMs: 5000,
      retries: 0,
      fetcher: fetcher as typeof fetch,
    });

    const result = await client.structuredCompletion({
      model: "qwen3.7-plus",
      messages: [{ role: "user", content: "生成JSON" }],
      schemaName: "test_schema",
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["answer"],
        properties: { answer: { type: "string" } },
      },
      validator: z.object({ answer: z.string() }).strict(),
    });

    expect(result.answer).toBe("可审核草稿");
    const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(request.response_format.type).toBe("json_schema");
    expect(request.response_format.json_schema.strict).toBe(true);
    expect(request.enable_thinking).toBe(false);
  });

  it("uses a per-request timeout and does not retry an expensive timed-out request", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    const client = new QwenClient({
      apiKey: "sk-test-only",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      timeoutMs: 5000,
      retries: 2,
      fetcher: fetcher as typeof fetch,
    });

    await expect(client.structuredCompletion({
      model: "qwen3.7-plus",
      messages: [{ role: "user", content: "生成JSON" }],
      schemaName: "timeout_schema",
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["answer"],
        properties: { answer: { type: "string" } },
      },
      validator: z.object({ answer: z.string() }).strict(),
      timeoutMs: 10,
    })).rejects.toThrow("千问请求超时");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("unwraps a JSON object serialized as a string by multimodal responses", async () => {
    const content = JSON.stringify(JSON.stringify({ answer: "视频证据草稿" }));
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const client = new QwenClient({
      apiKey: "sk-test-only",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      timeoutMs: 5000,
      retries: 0,
      fetcher: fetcher as typeof fetch,
    });

    const result = await client.structuredCompletion({
      model: "qwen3.7-plus",
      messages: [{ role: "user", content: "分析视频并生成JSON" }],
      schemaName: "video_test_schema",
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["answer"],
        properties: { answer: { type: "string" } },
      },
      validator: z.object({ answer: z.string() }).strict(),
    });

    expect(result).toEqual({ answer: "视频证据草稿" });
  });

  it("unwraps a single structured object returned in an array", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify([{ answer: "单份视频分析" }]) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const client = new QwenClient({
      apiKey: "sk-test-only",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      timeoutMs: 5000,
      retries: 0,
      fetcher: fetcher as typeof fetch,
    });

    const result = await client.structuredCompletion({
      model: "qwen3.7-plus",
      messages: [{ role: "user", content: "分析视频并生成唯一结果" }],
      schemaName: "single_video_result_schema",
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["answer"],
        properties: { answer: { type: "string" } },
      },
      validator: z.object({ answer: z.string() }).strict(),
    });

    expect(result).toEqual({ answer: "单份视频分析" });
  });

  it("repairs an empty optional teacher-question list without inventing evidence", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        facts: ["幼儿把两块木板并排放置"],
        responsePlans: [{
          materialSupport: { materials: [] },
          experienceSupport: { suggestedQuestions: [] },
        }],
      }) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const client = new QwenClient({
      apiKey: "sk-test-only",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      timeoutMs: 5000,
      retries: 0,
      fetcher: fetcher as typeof fetch,
    });
    const validator = z.object({
      facts: z.array(z.string()).min(1),
      responsePlans: z.array(z.object({
        materialSupport: z.object({
          materials: z.array(z.object({
            name: z.string(), quantity: z.string(), variable: z.string(),
          }).strict()).min(1),
        }).strict(),
        experienceSupport: z.object({ suggestedQuestions: z.array(z.string()).min(1) }).strict(),
      }).strict()).min(1),
    }).strict();

    const result = await client.structuredCompletion({
      model: "qwen3.7-plus",
      messages: [{ role: "user", content: "生成观察分析" }],
      schemaName: "observation_analysis_test",
      jsonSchema: {},
      validator,
    });

    expect(result.facts).toEqual(["幼儿把两块木板并排放置"]);
    expect(result.responsePlans[0]?.experienceSupport.suggestedQuestions).toEqual([
      "你接下来想先试哪一种办法？为什么？",
    ]);
    expect(result.responsePlans[0]?.materialSupport.materials).toEqual([{
      name: "沿用当前游戏材料",
      quantity: "按现场需要",
      variable: "保持幼儿自主选择，一次只调整一个可比较变量",
    }]);
  });

  it("rejects Token Plan keys for backend automation", () => {
    expect(() => new QwenClient({
      apiKey: "sk-sp-test-only",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      timeoutMs: 5000,
    })).toThrow("Token Plan");
  });

  it("accepts punctuation used by standard Qwen keys", () => {
    expect(() => new QwenClient({
      apiKey: "sk-standard.key/value+suffix",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      timeoutMs: 5000,
    })).not.toThrow();
  });
});
