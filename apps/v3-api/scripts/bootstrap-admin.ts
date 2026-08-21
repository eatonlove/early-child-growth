import { z } from "zod";
import { config, internalEmail } from "../src/config.js";
import { serviceClient } from "../src/supabase.js";

const input = z.object({
  BOOTSTRAP_TENANT_CODE: z.string().trim().min(2).max(40),
  BOOTSTRAP_TENANT_NAME: z.string().trim().min(2).max(80),
  BOOTSTRAP_ADMIN_USERNAME: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/),
  BOOTSTRAP_ADMIN_DISPLAY_NAME: z.string().trim().min(1).max(40),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(10).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/),
}).parse(process.env);

const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
const { data: existingProfile } = await schema.from("profiles").select("user_id, username").eq("username", input.BOOTSTRAP_ADMIN_USERNAME).maybeSingle();
if (existingProfile) {
  console.log(`教研管理员 ${existingProfile.username} 已存在，无需重复初始化。`);
  process.exit(0);
}

let { data: tenant, error: tenantError } = await schema.from("tenants").select("id, code, name").eq("code", input.BOOTSTRAP_TENANT_CODE).maybeSingle();
if (tenantError) throw tenantError;
if (!tenant) {
  const created = await schema.from("tenants").insert({ code: input.BOOTSTRAP_TENANT_CODE, name: input.BOOTSTRAP_TENANT_NAME }).select("id, code, name").single();
  if (created.error) throw created.error;
  tenant = created.data;
}

const { data: identity, error: identityError } = await serviceClient.auth.admin.createUser({
  email: internalEmail(input.BOOTSTRAP_ADMIN_USERNAME),
  password: input.BOOTSTRAP_ADMIN_PASSWORD,
  email_confirm: true,
  app_metadata: { application: "tongji_v3" },
});
if (identityError || !identity.user) throw identityError ?? new Error("身份创建失败");

const { error: profileError } = await schema.from("profiles").insert({
  user_id: identity.user.id,
  tenant_id: tenant.id,
  username: input.BOOTSTRAP_ADMIN_USERNAME,
  display_name: input.BOOTSTRAP_ADMIN_DISPLAY_NAME,
  role: "researcher",
  status: "active",
});
if (profileError) {
  await serviceClient.auth.admin.deleteUser(identity.user.id);
  throw profileError;
}

console.log(`已创建园所“${tenant.name}”和首个教研管理员“${input.BOOTSTRAP_ADMIN_USERNAME}”。`);
console.log("请立即从运行环境中移除 BOOTSTRAP_ADMIN_PASSWORD，并在首次登录后设置正式密码。");
