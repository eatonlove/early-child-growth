import { config } from "../config.js";
import { serviceClient } from "../supabase.js";

const requestedModelOptions = [
  { value: "qwen3.7-flash-2026-07-15", label: "qwen3.7-flash-2026-07-15", description: "固定版本，便于保持一段时间内的输出一致性。" },
  { value: "qwen3.7-flash", label: "qwen3.7-flash", description: "滚动版本，适合额度切换和日常快速分析。" },
  { value: "qwen3.7-max-2026-06-08", label: "qwen3.7-max-2026-06-08", description: "固定高能力版本，适合复杂分析、报告和课程生成。" },
] as const;

export interface AIModelConfigRow {
  id: string;
  tenant_id: string;
  model_key: string;
  revision: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface AIModelConfigView {
  model: string;
  defaultModel: string;
  source: "environment" | "tenant";
  revision: number;
  updatedAt: string | null;
  updatedBy: string | null;
  options: Array<{ value: string; label: string; description: string }>;
}

export function aiModelOptions() {
  const options: Array<{ value: string; label: string; description: string }> = [...requestedModelOptions];
  if (!options.some((item) => item.value === config.QWEN_TEXT_MODEL)) {
    options.unshift({
      value: config.QWEN_TEXT_MODEL,
      label: config.QWEN_TEXT_MODEL,
      description: "当前服务端默认模型；未保存园所配置时使用。",
    });
  }
  return options;
}

export function isValidAIModelKey(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,159}$/.test(value);
}

export function aiModelConfigView(row?: AIModelConfigRow | null): AIModelConfigView {
  return {
    model: row?.model_key ?? config.QWEN_TEXT_MODEL,
    defaultModel: config.QWEN_TEXT_MODEL,
    source: row ? "tenant" : "environment",
    revision: row?.revision ?? 0,
    updatedAt: row?.updated_at ?? null,
    updatedBy: row?.updated_by ?? null,
    options: aiModelOptions(),
  };
}

export async function readTenantAIModelConfig(tenantId: string) {
  const { data, error } = await serviceClient
    .schema(config.SUPABASE_SCHEMA)
    .from("ai_model_configs")
    .select("id, tenant_id, model_key, revision, created_by, updated_by, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(`AI模型配置读取失败：${error.message}`);
  return data as AIModelConfigRow | null;
}

export async function resolveTenantAIModel(tenantId: string) {
  return aiModelConfigView(await readTenantAIModelConfig(tenantId)).model;
}
