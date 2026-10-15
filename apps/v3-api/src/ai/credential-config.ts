import { config } from "../config.js";
import { serviceClient } from "../supabase.js";
import { isStandardQwenApiKey } from "./key-validation.js";

export type AICredentialProfile = "YT" | "YQY";

export interface AICredentialConfigRow {
  id: string;
  tenant_id: string;
  profile: AICredentialProfile;
  revision: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export function aiCredentialConfigView(row?: AICredentialConfigRow | null) {
  return {
    profile: row?.profile ?? "YT",
    defaultProfile: "YT" as const,
    source: row ? "tenant" as const : "environment" as const,
    revision: row?.revision ?? 0,
    updatedAt: row?.updated_at ?? null,
    options: (["YT", "YQY"] as const).map((value) => ({
      value,
      label: value,
      configured: isStandardQwenApiKey(config.qwenApiKeys[value]),
    })),
  };
}

export async function readTenantAICredentialConfig(tenantId: string) {
  const { data, error } = await serviceClient.schema(config.SUPABASE_SCHEMA)
    .from("ai_credential_configs")
    .select("id, tenant_id, profile, revision, created_by, updated_by, created_at, updated_at")
    .eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error("AI密钥选择读取失败");
  return data as AICredentialConfigRow | null;
}

export async function resolveTenantAICredentialProfile(tenantId: string): Promise<AICredentialProfile> {
  const row = await readTenantAICredentialConfig(tenantId);
  const profile = row?.profile ?? "YT";
  if (config.AI_MODE === "qianwen" && !isStandardQwenApiKey(config.qwenApiKeys[profile])) {
    throw new Error(`千问密钥 ${profile} 未配置，请联系教研员切换可用密钥`);
  }
  return profile;
}
