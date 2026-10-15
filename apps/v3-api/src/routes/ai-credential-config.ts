import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { aiCredentialConfigView, readTenantAICredentialConfig, type AICredentialConfigRow } from "../ai/credential-config.js";
import { config } from "../config.js";
import { ApiError, audit, authenticate, requireResearcher } from "../http.js";
import { serviceClient } from "../supabase.js";

const updateInput = z.object({
  profile: z.enum(["YT", "YQY"]),
  expectedRevision: z.number().int().min(0),
}).strict();

async function readConfig(tenantId: string) {
  return readTenantAICredentialConfig(tenantId).catch(() => {
    throw new ApiError(500, "AI_CREDENTIAL_CONFIG_READ_FAILED", "AI密钥选择读取失败");
  });
}

export async function aiCredentialConfigRoutes(app: FastifyInstance) {
  app.get("/api/ai-credential-config", async (request, reply) => {
    const auth = await authenticate(request);
    requireResearcher(auth);
    reply.header("Cache-Control", "private, no-store");
    return { item: aiCredentialConfigView(await readConfig(auth.tenantId)) };
  });

  app.put("/api/ai-credential-config", async (request, reply) => {
    const auth = await authenticate(request);
    requireResearcher(auth);
    const input = updateInput.parse(request.body);
    const available = aiCredentialConfigView().options.find((item) => item.value === input.profile)?.configured;
    if (!available) throw new ApiError(422, "AI_CREDENTIAL_NOT_CONFIGURED", `密钥 ${input.profile} 尚未配置，无法切换`);
    const current = await readConfig(auth.tenantId);
    const revision = current?.revision ?? 0;
    const conflict = () => new ApiError(409, "AI_CREDENTIAL_VERSION_CONFLICT", "密钥选择已被其他教研员更新，请重新读取后再保存");
    if (input.expectedRevision !== revision) throw conflict();
    const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
    let saved: AICredentialConfigRow;
    if (current) {
      const { data, error } = await schema.from("ai_credential_configs")
        .update({ profile: input.profile, revision: revision + 1, updated_by: auth.userId })
        .eq("id", current.id).eq("tenant_id", auth.tenantId).eq("revision", revision).select().maybeSingle();
      if (error) throw new ApiError(500, "AI_CREDENTIAL_CONFIG_SAVE_FAILED", "AI密钥选择保存失败");
      if (!data) throw conflict();
      saved = data as AICredentialConfigRow;
    } else {
      const { data, error } = await schema.from("ai_credential_configs")
        .insert({ tenant_id: auth.tenantId, profile: input.profile, revision: 1, created_by: auth.userId, updated_by: auth.userId })
        .select().single();
      if (error?.code === "23505") throw conflict();
      if (error || !data) throw new ApiError(500, "AI_CREDENTIAL_CONFIG_SAVE_FAILED", "AI密钥选择保存失败");
      saved = data as AICredentialConfigRow;
    }
    await audit(auth, "ai_credential_config.updated", "ai_credential_config", saved.id, {
      profile: saved.profile, previousProfile: current?.profile ?? "YT", revision: saved.revision, scope: "all_ai_scenes",
    });
    reply.header("Cache-Control", "private, no-store");
    return { item: aiCredentialConfigView(saved) };
  });
}
