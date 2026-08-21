import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config, internalEmail } from "../config.js";
import { ApiError, audit, authenticate, requireResearcher } from "../http.js";
import { serviceClient } from "../supabase.js";

const uuid = z.string().uuid();
const password = z.string().min(10).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/);
const classroomInput = z.object({
  name: z.string().trim().min(1).max(60),
  grade: z.enum(["small", "middle", "large"]),
  academicYear: z.string().trim().min(4).max(20),
  semester: z.string().trim().min(1).max(30),
});
const childInput = z.object({
  classroomId: uuid,
  internalCode: z.string().trim().min(1).max(40),
  displayName: z.string().trim().min(1).max(40),
  birthMonth: z.string().regex(/^\d{4}-\d{2}-01$/),
  enrolledOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  guardianConsentStatus: z.enum(["granted", "partial", "pending", "withdrawn"]).default("pending"),
  interests: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

export async function managementRoutes(app: FastifyInstance) {
  app.get("/api/classrooms", async (request) => {
    const auth = await authenticate(request);
    const { data, error } = await auth.data.from("classrooms").select("*").order("name");
    if (error) throw new ApiError(500, "CLASSROOM_LIST_FAILED", "班级读取失败");
    return { items: data ?? [] };
  });

  app.post("/api/classrooms", async (request, reply) => {
    const auth = await authenticate(request);
    requireResearcher(auth);
    const input = classroomInput.parse(request.body);
    const { data, error } = await auth.data.from("classrooms").insert({
      tenant_id: auth.tenantId,
      name: input.name,
      grade: input.grade,
      academic_year: input.academicYear,
      semester: input.semester,
      created_by: auth.userId,
    }).select().single();
    if (error) {
      request.log.error({
        dbError: { code: error.code, message: error.message, details: error.details, hint: error.hint },
      }, "classroom creation failed");
      throw new ApiError(error.code === "23505" ? 409 : 500, "CLASSROOM_CREATE_FAILED", error.code === "23505" ? "同一学期已存在同名班级" : "班级创建失败");
    }
    await audit(auth, "classroom.created", "classroom", data.id, { name: data.name });
    return reply.status(201).send({ item: data });
  });

  app.patch("/api/classrooms/:id", async (request) => {
    const auth = await authenticate(request);
    requireResearcher(auth);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const input = classroomInput.partial().extend({ status: z.enum(["active", "archived"]).optional() }).parse(request.body);
    const update = {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.grade !== undefined && { grade: input.grade }),
      ...(input.academicYear !== undefined && { academic_year: input.academicYear }),
      ...(input.semester !== undefined && { semester: input.semester }),
      ...(input.status !== undefined && { status: input.status }),
    };
    const { data, error } = await auth.data.from("classrooms").update(update).eq("id", id).select().single();
    if (error) throw new ApiError(500, "CLASSROOM_UPDATE_FAILED", "班级更新失败");
    await audit(auth, "classroom.updated", "classroom", id, update);
    return { item: data };
  });

  app.get("/api/children", async (request) => {
    const auth = await authenticate(request);
    const query = z.object({ classroomId: uuid.optional(), status: z.enum(["active", "archived"]).optional() }).parse(request.query);
    let builder = auth.data.from("children").select("*").order("display_name");
    if (query.classroomId) builder = builder.eq("classroom_id", query.classroomId);
    if (query.status) builder = builder.eq("status", query.status);
    const { data, error } = await builder;
    if (error) throw new ApiError(500, "CHILD_LIST_FAILED", "幼儿档案读取失败");
    return { items: data ?? [] };
  });

  app.post("/api/children", async (request, reply) => {
    const auth = await authenticate(request);
    const input = childInput.parse(request.body);
    const { data, error } = await auth.data.from("children").insert({
      tenant_id: auth.tenantId,
      classroom_id: input.classroomId,
      internal_code: input.internalCode,
      display_name: input.displayName,
      birth_month: input.birthMonth,
      enrolled_on: input.enrolledOn || null,
      guardian_consent_status: input.guardianConsentStatus,
      interests: input.interests,
      created_by: auth.userId,
    }).select().single();
    if (error) throw new ApiError(error.code === "23505" ? 409 : 500, "CHILD_CREATE_FAILED", error.code === "23505" ? "幼儿编号已存在" : "幼儿档案创建失败");
    await audit(auth, "child.created", "child", data.id, { classroomId: data.classroom_id, displayName: data.display_name });
    return reply.status(201).send({ item: data });
  });

  app.patch("/api/children/:id", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const input = childInput.partial().extend({ status: z.enum(["active", "archived"]).optional() }).parse(request.body);
    const update = {
      ...(input.classroomId !== undefined && { classroom_id: input.classroomId }),
      ...(input.internalCode !== undefined && { internal_code: input.internalCode }),
      ...(input.displayName !== undefined && { display_name: input.displayName }),
      ...(input.birthMonth !== undefined && { birth_month: input.birthMonth }),
      ...(input.enrolledOn !== undefined && { enrolled_on: input.enrolledOn || null }),
      ...(input.guardianConsentStatus !== undefined && { guardian_consent_status: input.guardianConsentStatus }),
      ...(input.interests !== undefined && { interests: input.interests }),
      ...(input.status !== undefined && { status: input.status }),
    };
    const { data, error } = await auth.data.from("children").update(update).eq("id", id).select().single();
    if (error) throw new ApiError(500, "CHILD_UPDATE_FAILED", "幼儿档案更新失败");
    await audit(auth, "child.updated", "child", id, update);
    return { item: data };
  });

  app.get("/api/accounts", async (request) => {
    const auth = await authenticate(request);
    requireResearcher(auth);
    const { data: profiles, error } = await serviceClient.schema(config.SUPABASE_SCHEMA).from("profiles")
      .select("user_id, username, display_name, role, status, disabled_at, disabled_reason, last_login_at, created_at")
      .eq("tenant_id", auth.tenantId)
      .order("created_at");
    if (error) throw new ApiError(500, "ACCOUNT_LIST_FAILED", "账号读取失败");
    const ids = (profiles ?? []).map((item) => item.user_id);
    const { data: assignments } = ids.length
      ? await serviceClient.schema(config.SUPABASE_SCHEMA).from("classroom_teachers").select("user_id, classroom_id").eq("tenant_id", auth.tenantId).in("user_id", ids)
      : { data: [] };
    return { items: (profiles ?? []).map((profile) => ({ ...profile, classroom_ids: (assignments ?? []).filter((item) => item.user_id === profile.user_id).map((item) => item.classroom_id) })) };
  });

  app.post("/api/accounts", async (request, reply) => {
    const auth = await authenticate(request);
    requireResearcher(auth);
    const input = z.object({
      username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/),
      displayName: z.string().trim().min(1).max(40),
      role: z.enum(["teacher", "researcher"]),
      password,
      classroomIds: z.array(uuid).max(20).default([]),
    }).parse(request.body);

    if (input.classroomIds.length) {
      const { count } = await serviceClient.schema(config.SUPABASE_SCHEMA).from("classrooms").select("id", { count: "exact", head: true }).eq("tenant_id", auth.tenantId).in("id", input.classroomIds);
      if (count !== input.classroomIds.length) throw new ApiError(422, "INVALID_CLASSROOM_ASSIGNMENT", "包含无权分配的班级");
    }

    const { data: created, error: authError } = await serviceClient.auth.admin.createUser({
      email: internalEmail(input.username),
      password: input.password,
      email_confirm: true,
      app_metadata: { application: "tongji_v3" },
    });
    if (authError || !created.user) throw new ApiError(authError?.status === 422 ? 409 : 500, "ACCOUNT_CREATE_FAILED", authError?.status === 422 ? "账号已存在或密码不符合要求" : "账号创建失败");

    try {
      const { error: profileError } = await serviceClient.schema(config.SUPABASE_SCHEMA).from("profiles").insert({
        user_id: created.user.id,
        tenant_id: auth.tenantId,
        username: input.username,
        display_name: input.displayName,
        role: input.role,
        status: "active",
        created_by: auth.userId,
      });
      if (profileError) throw profileError;
      if (input.role === "teacher" && input.classroomIds.length) {
        const { error: assignmentError } = await serviceClient.schema(config.SUPABASE_SCHEMA).from("classroom_teachers").insert(input.classroomIds.map((classroomId) => ({ classroom_id: classroomId, user_id: created.user.id, tenant_id: auth.tenantId, assigned_by: auth.userId })));
        if (assignmentError) throw assignmentError;
      }
    } catch (error) {
      await serviceClient
        .schema(config.SUPABASE_SCHEMA)
        .from("profiles")
        .delete()
        .eq("user_id", created.user.id);
      await serviceClient.auth.admin.deleteUser(created.user.id);
      throw new ApiError(500, "ACCOUNT_PROFILE_CREATE_FAILED", "登录身份已回滚，账号资料创建失败");
    }
    await audit(auth, "account.created", "account", created.user.id, { username: input.username, role: input.role, classroomIds: input.classroomIds });
    return reply.status(201).send({ item: { user_id: created.user.id, username: input.username, display_name: input.displayName, role: input.role, status: "active", classroom_ids: input.classroomIds } });
  });

  app.patch("/api/accounts/:userId/status", async (request) => {
    const auth = await authenticate(request);
    requireResearcher(auth);
    const { userId } = z.object({ userId: uuid }).parse(request.params);
    const input = z.object({ status: z.enum(["active", "disabled"]), reason: z.string().trim().max(200).optional() }).parse(request.body);
    if (userId === auth.userId && input.status === "disabled") throw new ApiError(422, "CANNOT_DISABLE_SELF", "不能停用当前登录账号");
    const { data: target } = await serviceClient.schema(config.SUPABASE_SCHEMA).from("profiles").select("user_id, tenant_id, status").eq("user_id", userId).eq("tenant_id", auth.tenantId).maybeSingle();
    if (!target) throw new ApiError(404, "ACCOUNT_NOT_FOUND", "账号不存在");

    if (input.status === "disabled") {
      const { error: profileError } = await serviceClient.schema(config.SUPABASE_SCHEMA).from("profiles").update({ status: "disabled", disabled_at: new Date().toISOString(), disabled_reason: input.reason || "教研员停用" }).eq("user_id", userId).eq("tenant_id", auth.tenantId);
      if (profileError) throw new ApiError(500, "ACCOUNT_DISABLE_FAILED", "账号停用失败");
      const { error: banError } = await serviceClient.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
      if (banError) {
        await serviceClient.schema(config.SUPABASE_SCHEMA).from("profiles").update({ status: "active", disabled_at: null, disabled_reason: null }).eq("user_id", userId);
        throw new ApiError(500, "AUTH_BAN_FAILED", "身份服务停用失败，资料状态已回滚");
      }
    } else {
      const { error: unbanError } = await serviceClient.auth.admin.updateUserById(userId, { ban_duration: "none" });
      if (unbanError) throw new ApiError(500, "AUTH_UNBAN_FAILED", "身份服务恢复失败");
      const { error: profileError } = await serviceClient.schema(config.SUPABASE_SCHEMA).from("profiles").update({ status: "active", disabled_at: null, disabled_reason: null }).eq("user_id", userId).eq("tenant_id", auth.tenantId);
      if (profileError) throw new ApiError(500, "ACCOUNT_ENABLE_FAILED", "账号资料恢复失败");
    }
    await audit(auth, input.status === "disabled" ? "account.disabled" : "account.enabled", "account", userId, { reason: input.reason ?? "" });
    return { status: input.status };
  });

  app.patch("/api/accounts/:userId/password", async (request) => {
    const auth = await authenticate(request);
    requireResearcher(auth);
    const { userId } = z.object({ userId: uuid }).parse(request.params);
    const input = z.object({ password }).parse(request.body);
    const { data: target } = await serviceClient.schema(config.SUPABASE_SCHEMA).from("profiles").select("user_id").eq("user_id", userId).eq("tenant_id", auth.tenantId).maybeSingle();
    if (!target) throw new ApiError(404, "ACCOUNT_NOT_FOUND", "账号不存在");
    const { error } = await serviceClient.auth.admin.updateUserById(userId, { password: input.password });
    if (error) throw new ApiError(500, "PASSWORD_RESET_FAILED", "密码重置失败");
    await audit(auth, "account.password_reset", "account", userId);
    return { ok: true };
  });
}
