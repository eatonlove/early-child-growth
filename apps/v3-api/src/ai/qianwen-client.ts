import type { z } from "zod";
import { isStandardQwenApiKey } from "./key-validation.js";

export type QwenContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "high" | "low" } }
  | { type: "video_url"; video_url: { url: string }; fps?: number };

export interface QwenMessage {
  role: "system" | "user";
  content: string | QwenContentPart[];
}

interface QwenClientOptions {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  retries?: number;
  fetcher?: typeof fetch;
}

interface StructuredCompletionInput<T> {
  model: string;
  messages: QwenMessage[];
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  validator: z.ZodType<T, z.ZodTypeDef, any>;
  temperature?: number;
}

export class QwenRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "QwenRequestError";
  }
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function parseJsonValue(content: string) {
  let parsed: unknown = JSON.parse(content);
  // Some multimodal responses serialize the schema object as a JSON string.
  // Decode that transport wrapper while keeping the business schema strict.
  for (let depth = 0; depth < 2 && typeof parsed === "string"; depth += 1) {
    const nested = parsed.trim();
    const looksLikeJson = (nested.startsWith("{") && nested.endsWith("}"))
      || (nested.startsWith("[") && nested.endsWith("]"));
    if (!looksLikeJson) break;
    parsed = JSON.parse(nested);
  }
  if (Array.isArray(parsed) && parsed.length === 1 && parsed[0] && typeof parsed[0] === "object") {
    parsed = parsed[0];
  }
  return parsed;
}

function extractJson(content: unknown) {
  if (typeof content !== "string") throw new QwenRequestError("千问返回内容不是文本JSON");
  const trimmed = content.trim();
  const unfenced = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  try {
    return parseJsonValue(unfenced);
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return parseJsonValue(unfenced.slice(start, end + 1));
      } catch {
        // Fall through to the stable error below.
      }
    }
    throw new QwenRequestError("千问返回内容不符合JSON格式");
  }
}

export class QwenClient {
  private readonly fetcher: typeof fetch;
  private readonly retries: number;

  constructor(private readonly options: QwenClientOptions) {
    if (!isStandardQwenApiKey(options.apiKey)) {
      throw new Error("同迹后端必须使用标准DASHSCOPE_API_KEY，不能使用Token Plan密钥");
    }
    this.fetcher = options.fetcher ?? fetch;
    this.retries = options.retries ?? 2;
  }

  async structuredCompletion<T>(input: StructuredCompletionInput<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try {
        return await this.request(input);
      } catch (error) {
        lastError = error;
        const retryable = error instanceof QwenRequestError && error.retryable;
        if (!retryable || attempt === this.retries) break;
        await wait(400 * (2 ** attempt));
      }
    }
    throw lastError;
  }

  private async request<T>(input: StructuredCompletionInput<T>): Promise<T> {
    const endpoint = `${this.options.baseUrl.replace(/\/$/, "")}/chat/completions`;
    let response: Response;
    try {
      response = await this.fetcher(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: input.model,
          messages: input.messages,
          temperature: input.temperature ?? 0.2,
          enable_thinking: false,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: input.schemaName,
              strict: true,
              schema: input.jsonSchema,
            },
          },
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      const message = error instanceof Error && error.name === "TimeoutError" ? "千问请求超时" : "千问网络请求失败";
      throw new QwenRequestError(message, undefined, true);
    }

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new QwenRequestError(`千问接口返回HTTP ${response.status}`, response.status, retryable);
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const parsed = extractJson(payload.choices?.[0]?.message?.content);
    const validated = input.validator.safeParse(parsed);
    if (!validated.success) {
      const rootType = Array.isArray(parsed) ? "array" : parsed === null ? "null" : typeof parsed;
      const issueSummary = validated.error.issues
        .slice(0, 8)
        .map((issue) => `${issue.path.join(".") || "root"}:${issue.code}`)
        .join(",");
      throw new QwenRequestError(`千问结构化输出未通过业务校验(root=${rootType};${issueSummary})`);
    }
    return validated.data;
  }
}
