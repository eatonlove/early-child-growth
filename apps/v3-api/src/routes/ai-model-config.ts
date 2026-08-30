import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  aiModelConfigView,
  isSelectableAIModel,
  readTenantAIModelConfig,
  type AIModelConfigRow,
} from "../ai/model-config.js";
import { config } from "../config.js";
import { ApiError, audit, authenticate, requireResearcher } from "../http.js";
import { serviceClient } from "../supabase.js";

const updateInput = z.object({
  model: z.string().trim().min(3).max(160),
  expectedRevision: z.number().int().min(0),
});

async function withEditorName(tenantId: string, row?: AIModelConfigRow | null) {
  const view = aiModelConfigView(row);
  if (!view.updatedBy) return { ...view, updatedByName: null };
  const { data, error } = await serviceClient
    .schema(config.SUPABASE_SCHEMA)
    .from("profiles")
    .select("display_name")
    .eq("tenant_id", tenantId)
    .eq("user_id", view.updatedBy)
    .maybeSingle();
  if (error) throw new ApiError(500, "AI_MODEL_EDITOR_READ_FAILED", "模型配置修改人读取失败");
  return { ...view, updatedByName: data?.display_name ?? "园所教研员" };
}

export async function aiModelConfigRoutes(app: FastifyInstance) {
  app.get("/api/ai-model-config", async (request) => {
    const auth = await authenticate(request);
    requireResearcher(auth);
    const row = await readTenantAIModelConfig(auth.tenantId).catch((reason) => {
      request.log.error({ err: reason }, "AI model config read failed");
      throw new ApiError(500, "AI_MODEL_CONFIG_READ_FAILED", "AI模型配置读取失败");
    });
    return { item: await withEditorName(auth.tenantId, row) };
  });

  app.put("/api/ai-model-config", async (request) => {
    const auth = await authenticate(request);
    requireResearcher(auth);
    const input = updateInput.parse(request.body);
    if (!isSelectableAIModel(input.model)) {
      throw new ApiError(400, "AI_MODEL_NOT_SUPPORTED", "该模型不在当前可选范围内");
    }
    const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
    const current = await readTenantAIModelConfig(auth.tenantId).catch((reason) => {
      request.log.error({ err: reason }, "AI model config lookup failed");
      throw new ApiError(500, "AI_MODEL_CONFIG_READ_FAILED", "AI模型配置读取失败");
    });
    const currentRevision = current?.revision ?? 0;
    if (input.expectedRevision !== currentRevision) {
      throw new ApiError(409, "AI_MODEL_VERSION_CONFLICT", "模型配置已被其他教研员更新，请刷新后重试");
    }

    let saved: AIModelConfigRow;
    if (current) {
      const { data, error } = await schema.from("ai_model_configs").update({
        model_key: input.model,
        revision: currentRevision + 1,
        updated_by: auth.userId,
      }).eq("id", current.id).eq("tenant_id", auth.tenantId).eq("revision", currentRevision).select().maybeSingle();
      if (error) throw new ApiError(500, "AI_MODEL_CONFIG_UPDATE_FAILED", "AI模型配置保存失败");
      if (!data) throw new ApiError(409, "AI_MODEL_VERSION_CONFLICT", "模型配置已被其他教研员更新，请刷新后重试");
      saved = data as AIModelConfigRow;
    } else {
      const { data, error } = await schema.from("ai_model_configs").insert({
        tenant_id: auth.tenantId,
        model_key: input.model,
        revision: 1,
        created_by: auth.userId,
        updated_by: auth.userId,
      }).select().single();
      if (error) {
        if (error.code === "23505") throw new ApiError(409, "AI_MODEL_VERSION_CONFLICT", "模型配置已被其他教研员创建，请刷新后重试");
        throw new ApiError(500, "AI_MODEL_CONFIG_CREATE_FAILED", "AI模型配置保存失败");
      }
      saved = data as AIModelConfigRow;
    }

    await audit(auth, "ai_model_config.updated", "ai_model_config", saved.id, {
      model: saved.model_key,
      revision: saved.revision,
      scope: "all_ai_scenes",
    });
    return { item: { ...aiModelConfigView(saved), updatedByName: auth.displayName } };
  });
}
