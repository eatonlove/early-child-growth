import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { config, internalEmail } from "../config.js";
import { ApiError, authenticate } from "../http.js";
import { publicAuthClient, serviceClient } from "../supabase.js";

const credentialsSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/),
  password: z.string().min(10).max(128),
});

function setSessionCookies(reply: FastifyReply, session: { access_token: string; refresh_token: string; expires_in: number }) {
  const base = { path: "/api", httpOnly: true, secure: config.cookieSecure, sameSite: "strict" as const };
  reply.setCookie("tj_access", session.access_token, { ...base, maxAge: session.expires_in });
  reply.setCookie("tj_refresh", session.refresh_token, { ...base, maxAge: 60 * 60 * 24 * 7 });
}

function sessionPayload(profile: Record<string, unknown>, tenant: Record<string, unknown> | null) {
  return {
    user: {
      id: profile.user_id,
      tenantId: profile.tenant_id,
      username: profile.username,
      displayName: profile.display_name,
      role: profile.role,
      tenantName: tenant?.name ?? "",
    },
  };
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/auth/login", { config: { rateLimit: { max: 10, timeWindow: "5 minutes" } } }, async (request, reply) => {
    const input = credentialsSchema.parse(request.body);
    const client = publicAuthClient();
    const { data, error } = await client.auth.signInWithPassword({ email: internalEmail(input.username), password: input.password });
    if (error || !data.session || !data.user) throw new ApiError(401, "LOGIN_FAILED", "账号或密码错误");

    const { data: profile, error: profileError } = await serviceClient.schema(config.SUPABASE_SCHEMA).from("profiles")
      .select("user_id, tenant_id, username, display_name, role, status")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (profileError || !profile) throw new ApiError(403, "APP_ACCOUNT_NOT_FOUND", "该账号不属于童迹3.0");
    if (profile.status !== "active") throw new ApiError(403, "ACCOUNT_DISABLED", "账号已停用，请联系教研员");

    const { data: tenant, error: tenantError } = await serviceClient.schema(config.SUPABASE_SCHEMA).from("tenants").select("id, name").eq("id", profile.tenant_id).maybeSingle();
    if (tenantError || !tenant) throw new ApiError(500, "TENANT_LOOKUP_FAILED", "无法读取园所资料");
    const { error: loginAuditError } = await serviceClient.schema(config.SUPABASE_SCHEMA).from("profiles").update({ last_login_at: new Date().toISOString() }).eq("user_id", profile.user_id);
    if (loginAuditError) request.log.warn({ dbError: loginAuditError, userId: profile.user_id }, "last login timestamp update failed");
    reply.header("Cache-Control", "no-store");
    setSessionCookies(reply, data.session);
    return sessionPayload(profile, tenant);
  });

  app.post("/api/auth/refresh", { config: { rateLimit: { max: 30, timeWindow: "5 minutes" } } }, async (request, reply) => {
    const refreshToken = request.cookies.tj_refresh;
    if (!refreshToken) throw new ApiError(401, "REFRESH_REQUIRED", "登录已失效，请重新登录");
    const client = publicAuthClient();
    const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session || !data.user) throw new ApiError(401, "REFRESH_FAILED", "登录已失效，请重新登录");
    const { data: profile, error: profileError } = await serviceClient.schema(config.SUPABASE_SCHEMA).from("profiles")
      .select("user_id, tenant_id, username, display_name, role, status")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (profileError) throw new ApiError(500, "PROFILE_LOOKUP_FAILED", "无法读取账号资料");
    if (!profile || profile.status !== "active") throw new ApiError(403, "ACCOUNT_DISABLED", "账号已停用，请联系教研员");
    const { data: tenant, error: tenantError } = await serviceClient.schema(config.SUPABASE_SCHEMA).from("tenants").select("id, name").eq("id", profile.tenant_id).maybeSingle();
    if (tenantError || !tenant) throw new ApiError(500, "TENANT_LOOKUP_FAILED", "无法读取园所资料");
    reply.header("Cache-Control", "no-store");
    setSessionCookies(reply, data.session);
    return sessionPayload(profile, tenant);
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const accessToken = request.cookies.tj_access;
    const refreshToken = request.cookies.tj_refresh;
    if (accessToken && refreshToken) {
      const client = publicAuthClient();
      const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (!error) await client.auth.signOut({ scope: "local" });
    }
    reply.clearCookie("tj_access", { path: "/api" });
    reply.clearCookie("tj_refresh", { path: "/api" });
    return { ok: true };
  });

  app.get("/api/me", async (request) => {
    const auth = await authenticate(request);
    const { data: tenant, error } = await auth.data.from("tenants").select("id, name").eq("id", auth.tenantId).single();
    if (error || !tenant) throw new ApiError(500, "TENANT_LOOKUP_FAILED", "无法读取园所资料");
    return { user: { id: auth.userId, tenantId: auth.tenantId, username: auth.username, displayName: auth.displayName, role: auth.role, tenantName: tenant?.name ?? "" } };
  });
}
