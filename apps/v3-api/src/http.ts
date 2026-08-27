import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { config } from "./config.js";
import { authProvider } from "./runtime/auth-provider.js";
import { serviceClient, userClient } from "./supabase.js";

export type AppRole = "teacher" | "researcher";

export interface AuthContext {
  token: string;
  userId: string;
  tenantId: string;
  username: string;
  displayName: string;
  role: AppRole;
  data: ReturnType<typeof userClient>;
}

export class ApiError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message);
  }
}

export async function authenticate(request: FastifyRequest): Promise<AuthContext> {
  const authorization = request.headers.authorization;
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : request.cookies.tj_access;
  if (!token) throw new ApiError(401, "AUTH_REQUIRED", "请先登录");
  const { data: userResult, error: userError } = await authProvider.getUser(token);
  if (userError || !userResult?.user) throw new ApiError(401, "SESSION_INVALID", "登录已失效，请重新登录");

  const { data: profile, error: profileError } = await serviceClient
    .schema(config.SUPABASE_SCHEMA)
    .from("profiles")
    .select("user_id, tenant_id, username, display_name, role, status")
    .eq("user_id", userResult.user.id)
    .maybeSingle();
  if (profileError) throw new ApiError(500, "PROFILE_LOOKUP_FAILED", "无法读取账号资料");
  if (!profile || profile.status !== "active") throw new ApiError(403, "ACCOUNT_DISABLED", "账号已停用，请联系教研员");

  return {
    token,
    userId: profile.user_id,
    tenantId: profile.tenant_id,
    username: profile.username,
    displayName: profile.display_name,
    role: profile.role as AppRole,
    data: userClient(token),
  };
}

export function requireResearcher(auth: AuthContext) {
  if (auth.role !== "researcher") throw new ApiError(403, "RESEARCHER_REQUIRED", "此操作仅限教研员");
}

export async function audit(auth: Pick<AuthContext, "tenantId" | "userId" | "role">, action: string, resourceType: string, resourceId: string, detail: Record<string, unknown> = {}) {
  const { error } = await serviceClient.schema(config.SUPABASE_SCHEMA).from("audit_events").insert({
    tenant_id: auth.tenantId,
    actor_id: auth.userId,
    actor_role: auth.role,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    detail,
  });
  if (error) throw new ApiError(500, "AUDIT_WRITE_FAILED", "操作已完成，但审计记录写入失败");
}

export function registerErrorHandler(app: { setErrorHandler: (handler: (error: Error & { statusCode?: number; code?: string }, request: FastifyRequest, reply: FastifyReply) => void) => void }) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      void reply.status(422).send({ code: "VALIDATION_ERROR", message: "提交内容不完整或格式不正确", fields: error.flatten().fieldErrors });
      return;
    }
    if (error instanceof ApiError) {
      void reply.status(error.statusCode).send({ code: error.code, message: error.message });
      return;
    }
    request.log.error({ err: error }, "unhandled request error");
    void reply.status(error.statusCode && error.statusCode < 500 ? error.statusCode : 500).send({
      code: error.code || "INTERNAL_ERROR",
      message: error.statusCode && error.statusCode < 500 ? error.message : "服务暂时不可用",
    });
  });
}
