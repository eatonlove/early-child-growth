import { config } from "../config.js";
import { serviceClient } from "../supabase.js";
import type { ResolvedAIPrompt } from "./contracts.js";
import {
  IMMUTABLE_AI_SAFETY_PROMPT,
  aiPromptDefinitions,
  type AIPromptKey,
} from "./qianwen-provider.js";
import { promptView, type AIPromptConfigRow } from "./prompt-registry.js";

export { promptView, type AIPromptConfigRow, type AIPromptConfigView } from "./prompt-registry.js";

export async function listTenantPromptConfigs(tenantId: string) {
  const { data, error } = await serviceClient
    .schema(config.SUPABASE_SCHEMA)
    .from("ai_prompt_configs")
    .select("id, prompt_key, custom_prompt, base_prompt_version, revision, change_note, created_by, updated_by, created_at, updated_at")
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`AI提示词配置读取失败：${error.message}`);
  const rows = new Map((data ?? []).map((row) => [row.prompt_key, row as AIPromptConfigRow]));
  return aiPromptDefinitions().map((definition) => promptView(definition.key, rows.get(definition.key)));
}

export async function resolveTenantPrompt(tenantId: string, key: AIPromptKey): Promise<ResolvedAIPrompt> {
  const { data, error } = await serviceClient
    .schema(config.SUPABASE_SCHEMA)
    .from("ai_prompt_configs")
    .select("id, prompt_key, custom_prompt, base_prompt_version, revision, change_note, created_by, updated_by, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .eq("prompt_key", key)
    .maybeSingle();
  if (error) throw new Error(`AI提示词配置读取失败：${error.message}`);
  const view = promptView(key, data as AIPromptConfigRow | null);
  return {
    key,
    systemPrompt: view.effectivePrompt,
    version: view.effectiveVersion,
    source: view.source,
    revision: view.revision,
  };
}

export function immutablePromptSafety() {
  return IMMUTABLE_AI_SAFETY_PROMPT;
}
