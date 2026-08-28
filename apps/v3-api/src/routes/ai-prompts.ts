import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { ApiError, audit, authenticate, requireResearcher } from "../http.js";
import {
  immutablePromptSafety,
  listTenantPromptConfigs,
  promptView,
  type AIPromptConfigRow,
} from "../ai/prompt-config.js";
import { AI_PROMPT_DEFINITIONS, isAIPromptKey } from "../ai/qianwen-provider.js";
import { serviceClient } from "../supabase.js";

const keyParams = z.object({ key: z.string().min(3).max(100) });
const updateInput = z.object({
  systemPrompt: z.string().trim().min(100).max(30000),
  expectedRevision: z.number().int().min(0),
  changeNote: z.string().trim().max(500).default(""),
});
const resetInput = z.object({ expectedRevision: z.number().int().min(1) });

function checkedKey(value: string) {
  if (!isAIPromptKey(value)) throw new ApiError(404, "AI_PROMPT_NOT_FOUND", "AI提示词场景不存在");
  return value;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function aiPromptRoutes(app: FastifyInstance) {
  app.get("/api/ai-prompts", async (request) => {
    const auth = await authenticate(request);
    requireResearcher(auth);
    const items = await listTenantPromptConfigs(auth.tenantId).catch((reason) => {
      request.log.error({ err: reason }, "AI prompt configs read failed");
      throw new ApiError(500, "AI_PROMPT_LIST_FAILED", "AI提示词配置读取失败");
    });
    const updatedByIds = [...new Set(items.map((item) => item.updatedBy).filter((value): value is string => Boolean(value)))];
    const { data: profiles, error } = updatedByIds.length
      ? await serviceClient.schema(config.SUPABASE_SCHEMA).from("profiles").select("user_id, display_name").eq("tenant_id", auth.tenantId).in("user_id", updatedByIds)
      : { data: [], error: null };
    if (error) throw new ApiError(500, "AI_PROMPT_EDITOR_READ_FAILED", "提示词修改人读取失败");
    const names = new Map((profiles ?? []).map((profile) => [profile.user_id, profile.display_name]));
    return {
      immutableSafetyPrompt: immutablePromptSafety(),
      items: items.map((item) => ({ ...item, updatedByName: item.updatedBy ? names.get(item.updatedBy) ?? "园所教研员" : null })),
    };
  });

  app.put("/api/ai-prompts/:key", async (request) => {
    const auth = await authenticate(request);
    requireResearcher(auth);
    const key = checkedKey(keyParams.parse(request.params).key);
    const input = updateInput.parse(request.body);
    const definition = AI_PROMPT_DEFINITIONS[key];
    const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
    const { data: current, error: currentError } = await schema
      .from("ai_prompt_configs")
      .select("id, prompt_key, custom_prompt, base_prompt_version, revision, change_note, created_by, updated_by, created_at, updated_at")
      .eq("tenant_id", auth.tenantId)
      .eq("prompt_key", key)
      .maybeSingle();
    if (currentError) throw new ApiError(500, "AI_PROMPT_LOOKUP_FAILED", "AI提示词配置读取失败");
    const currentRevision = current?.revision ?? 0;
    if (input.expectedRevision !== currentRevision) throw new ApiError(409, "AI_PROMPT_VERSION_CONFLICT", "提示词已被其他教研员更新，请刷新后重试");

    let saved: AIPromptConfigRow | null = null;
    if (current) {
      const { data, error } = await schema.from("ai_prompt_configs").update({
        custom_prompt: input.systemPrompt,
        base_prompt_version: definition.defaultVersion,
        revision: currentRevision + 1,
        change_note: input.changeNote,
        updated_by: auth.userId,
      }).eq("id", current.id).eq("tenant_id", auth.tenantId).eq("revision", currentRevision).select().maybeSingle();
      if (error) throw new ApiError(500, "AI_PROMPT_UPDATE_FAILED", "AI提示词保存失败");
      if (!data) throw new ApiError(409, "AI_PROMPT_VERSION_CONFLICT", "提示词已被其他教研员更新，请刷新后重试");
      saved = data as AIPromptConfigRow;
    } else {
      const { data, error } = await schema.from("ai_prompt_configs").insert({
        tenant_id: auth.tenantId,
        prompt_key: key,
        custom_prompt: input.systemPrompt,
        base_prompt_version: definition.defaultVersion,
        revision: 1,
        change_note: input.changeNote,
        created_by: auth.userId,
        updated_by: auth.userId,
      }).select().single();
      if (error) {
        if (error.code === "23505") throw new ApiError(409, "AI_PROMPT_VERSION_CONFLICT", "提示词已被其他教研员创建，请刷新后重试");
        throw new ApiError(500, "AI_PROMPT_CREATE_FAILED", "AI提示词保存失败");
      }
      saved = data as AIPromptConfigRow;
    }

    await audit(auth, "ai_prompt.updated", "ai_prompt_config", saved.id, {
      promptKey: key,
      revision: saved.revision,
      basePromptVersion: saved.base_prompt_version,
      characterCount: saved.custom_prompt.length,
      sha256: digest(saved.custom_prompt),
      changeNote: saved.change_note,
    });
    return { item: { ...promptView(key, saved), updatedByName: auth.displayName } };
  });

  app.post("/api/ai-prompts/:key/reset", async (request) => {
    const auth = await authenticate(request);
    requireResearcher(auth);
    const key = checkedKey(keyParams.parse(request.params).key);
    const input = resetInput.parse(request.body);
    const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
    const { data, error } = await schema.from("ai_prompt_configs").delete()
      .eq("tenant_id", auth.tenantId)
      .eq("prompt_key", key)
      .eq("revision", input.expectedRevision)
      .select("id, revision")
      .maybeSingle();
    if (error) throw new ApiError(500, "AI_PROMPT_RESET_FAILED", "恢复系统默认提示词失败");
    if (!data) throw new ApiError(409, "AI_PROMPT_VERSION_CONFLICT", "提示词已被其他教研员更新，请刷新后重试");
    await audit(auth, "ai_prompt.reset", "ai_prompt_config", data.id, { promptKey: key, previousRevision: data.revision });
    return { item: { ...promptView(key), updatedByName: null } };
  });
}
