import { randomBytes } from "node:crypto";
import { config, internalEmail } from "../src/config.js";
import { serviceClient } from "../src/supabase.js";

const baseUrl = (process.argv[2] || "http://web:8080").replace(/\/$/, "");
const username = `smoke.${Date.now()}`;
const password = `Aa9!${randomBytes(18).toString("base64url")}`;
let userId = "";

async function requireOk(path: string, cookie: string) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { Cookie: cookie } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path} -> ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

try {
  const { data: tenant, error: tenantError } = await serviceClient
    .schema(config.SUPABASE_SCHEMA)
    .from("tenants")
    .select("id")
    .limit(1)
    .single();
  if (tenantError || !tenant) throw new Error("没有可用于生产冒烟验证的园所");

  const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
    email: internalEmail(username),
    password,
    email_confirm: true,
    app_metadata: { application: "tongji_v3", purpose: "authenticated_smoke_test" },
  });
  if (createError || !created.user) throw new Error(`临时身份创建失败: ${createError?.message ?? "unknown"}`);
  userId = created.user.id;

  const { error: profileError } = await serviceClient.schema(config.SUPABASE_SCHEMA).from("profiles").insert({
    user_id: userId,
    tenant_id: tenant.id,
    username,
    display_name: "生产接口临时验证",
    role: "researcher",
    status: "active",
    created_by: userId,
  });
  if (profileError) throw new Error(`临时资料创建失败: ${profileError.message}`);

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!loginResponse.ok) throw new Error(`真实登录失败: ${loginResponse.status}`);
  const cookie = loginResponse.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
  if (!cookie.includes("tj_access=") || !cookie.includes("tj_refresh=")) throw new Error("登录未返回安全会话Cookie");

  const paths = [
    "/api/me",
    "/api/dashboard",
    "/api/classrooms",
    "/api/children",
    "/api/observations",
    "/api/observation-templates?grade=middle&scene=%E5%BB%BA%E6%9E%84%E5%8C%BA",
    "/api/knowledge?grade=middle",
    "/api/accounts",
    "/api/quality-reviews",
    "/api/export-requests",
    "/api/research-activities",
    "/api/support-actions",
    "/api/reports",
    "/api/curriculum-clues",
  ];
  for (const path of paths) await requireOk(path, cookie);

  const templatePayload = await requireOk(
    "/api/observation-templates?grade=middle&scene=%E5%BB%BA%E6%9E%84%E5%8C%BA",
    cookie,
  );
  if (!templatePayload.recommendation?.matched) throw new Error("观察模板接口未返回真实推荐上下文");

  console.log(`生产鉴权冒烟通过：真实登录、HttpOnly会话、RLS及${paths.length}个只读接口均可用。`);
} finally {
  if (userId) {
    await serviceClient.schema(config.SUPABASE_SCHEMA).from("profiles").delete().eq("user_id", userId);
    await serviceClient.auth.admin.deleteUser(userId);
  }
}
