import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { KnowledgeRow, MediaForAnalysis, ProfessionalMemoryForAnalysis } from "../ai/contracts.js";
import { createAIProvider } from "../ai/provider.js";
import { effectiveAnalysisResult, flattenAnalysisClaims, legacyClaimDecision, claimDecisions } from "../analysis-claims.js";
import { config } from "../config.js";
import { ApiError, audit, authenticate } from "../http.js";
import { publicSupabaseUrl, serviceClient } from "../supabase.js";

const uuid = z.string().uuid();
const responseSchema = z.object({
  category: z.enum(["experience", "material", "activity"]),
  strategy: z.string().trim().min(2).max(2000),
  nextObservationFocus: z.string().trim().min(2).max(1000),
});
const observationSubjectSchema = z.object({
  childId: uuid,
  role: z.enum(["primary", "participant", "incidental"]),
  contextualFeature: z.string().trim().max(500).default(""),
  evidenceAnchors: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
});
const observationInput = z.object({
  classroomId: uuid,
  childId: uuid.optional(),
  subjects: z.array(observationSubjectSchema).min(1).max(30).optional(),
  templateId: uuid.optional(),
  sourceImportId: uuid.optional(),
  observerIds: z.array(uuid).max(12).default([]),
  groupContext: z.string().trim().max(2000).default(""),
  unlistedParticipantCount: z.number().int().min(0).max(99).default(0),
  occurredAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(1).max(240).optional(),
  scene: z.string().trim().min(1).max(80),
  theme: z.string().trim().min(1).max(120),
  organizationStage: z.enum(["plan", "introduction", "process", "sharing", "evaluation"]),
  observationFocus: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  teacherObservation: z.string().trim().min(10).max(12000),
  teacherIdentification: z.string().trim().min(5).max(6000),
  teacherResponse: responseSchema,
}).superRefine((value, context) => {
  const subjects = value.subjects ?? (value.childId ? [{ childId: value.childId, role: "primary" as const, contextualFeature: "", evidenceAnchors: [] }] : []);
  if (!subjects.length) context.addIssue({ code: "custom", path: ["subjects"], message: "请至少选择一名观察幼儿" });
  if (new Set(subjects.map((item) => item.childId)).size !== subjects.length) context.addIssue({ code: "custom", path: ["subjects"], message: "观察幼儿不能重复" });
  if (subjects.filter((item) => item.role === "primary").length !== 1) context.addIssue({ code: "custom", path: ["subjects"], message: "必须且只能设置一名主要观察幼儿" });
});

const mimeTypes = new Map([
  ["image/jpeg", { type: "photo", ext: "jpg", max: 10 * 1024 * 1024 }],
  ["image/png", { type: "photo", ext: "png", max: 10 * 1024 * 1024 }],
  ["image/webp", { type: "photo", ext: "webp", max: 10 * 1024 * 1024 }],
  ["video/mp4", { type: "video", ext: "mp4", max: 100 * 1024 * 1024 }],
  ["video/quicktime", { type: "video", ext: "mov", max: 100 * 1024 * 1024 }],
  ["application/pdf", { type: "document", ext: "pdf", max: 10 * 1024 * 1024 }],
]);

const aiProvider = createAIProvider({
  mode: config.AI_MODE,
  apiKey: config.qwenApiKey,
  baseUrl: config.QWEN_BASE_URL,
  textModel: config.QWEN_TEXT_MODEL,
  visionModel: config.QWEN_VISION_MODEL,
  timeoutMs: config.QWEN_TIMEOUT_MS,
  fallbackToSimulated: config.aiFallbackToSimulated,
});

async function queueAnalysisMemory(auth: Awaited<ReturnType<typeof authenticate>>, analysis: any, note = "") {
  if (analysis?.decision !== "adopted") return;
  const result = analysis.structured_result ?? {};
  const summary = [result.currentExperience, ...(result.interestsAndStrengths ?? []).slice(0, 3)].filter(Boolean).join("；").slice(0, 3000);
  await serviceClient.schema(config.SUPABASE_SCHEMA).from("professional_memories").upsert({
    tenant_id: auth.tenantId,
    memory_type: "teacher_feedback",
    source_resource_type: "analysis_run",
    source_resource_id: analysis.id,
    title: "教师终审的游戏分析案例",
    summary: summary || "教师已完成该观察的专业终审。",
    retrieval_text: `${result.objectiveSummary ?? ""}\n${summary}\n教师终审说明：${note}`.slice(0, 12000),
    applicability: { classroomId: analysis.classroom_id, childId: analysis.child_id, observationId: analysis.observation_id },
    evidence_refs: [{ observationId: analysis.observation_id, analysisRunId: analysis.id }],
    quality_score: 0.65,
    status: "pending",
    created_by: auth.userId,
  }, { onConflict: "tenant_id,memory_type,source_resource_type,source_resource_id" });
}

export async function observationRoutes(app: FastifyInstance) {
  app.get("/api/observations", async (request) => {
    const auth = await authenticate(request);
    const query = z.object({ classroomId: uuid.optional(), childId: uuid.optional(), status: z.string().optional() }).parse(request.query);
    let observationIds: string[] | null = null;
    if (query.childId) {
      const { data: subjectRows, error: subjectError } = await auth.data.from("observation_subjects").select("observation_id").eq("child_id", query.childId);
      if (subjectError) throw new ApiError(500, "OBSERVATION_SUBJECT_LIST_FAILED", "幼儿观察关联读取失败");
      observationIds = (subjectRows ?? []).map((item) => item.observation_id);
      if (!observationIds.length) return { items: [] };
    }
    let builder = auth.data.from("observations").select("*").order("occurred_at", { ascending: false });
    if (query.classroomId) builder = builder.eq("classroom_id", query.classroomId);
    if (observationIds) builder = builder.in("id", observationIds);
    if (query.status) builder = builder.eq("status", query.status);
    const { data, error } = await builder;
    if (error) throw new ApiError(500, "OBSERVATION_LIST_FAILED", "观察记录读取失败");
    return { items: data ?? [] };
  });

  app.get("/api/observations/:id", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const { data: observation, error } = await auth.data.from("observations").select("*").eq("id", id).single();
    if (error || !observation) throw new ApiError(404, "OBSERVATION_NOT_FOUND", "观察记录不存在或无权访问");
    const [{ data: evidence, error: evidenceError }, { data: analyses, error: analysisError }, { data: subjectRows, error: subjectError }, { data: responsePlans, error: responseError }, { data: observers, error: observerError }] = await Promise.all([
      auth.data.from("evidence_assets").select("*").eq("observation_id", id).order("created_at"),
      auth.data.from("analysis_runs").select("*").eq("observation_id", id).order("generated_at", { ascending: false }),
      auth.data.from("observation_subjects").select("*").eq("observation_id", id).order("role"),
      auth.data.from("response_plans").select("*").eq("observation_id", id).order("created_at"),
      serviceClient.schema(config.SUPABASE_SCHEMA).from("profiles").select("user_id, display_name, role").eq("tenant_id", auth.tenantId).in("user_id", observation.observer_ids?.length ? observation.observer_ids : [observation.created_by]),
    ]);
    if (evidenceError || analysisError || subjectError || responseError || observerError) throw new ApiError(500, "OBSERVATION_DETAIL_FAILED", "观察证据、参与幼儿、观察者或分析结果读取失败");
    const subjectChildIds = (subjectRows ?? []).map((item) => item.child_id);
    const { data: subjectChildren, error: childError } = subjectChildIds.length
      ? await auth.data.from("children").select("id, display_name").in("id", subjectChildIds)
      : { data: [], error: null };
    if (childError) throw new ApiError(500, "OBSERVATION_SUBJECT_CHILDREN_FAILED", "参与幼儿信息读取失败");
    const childMap = new Map((subjectChildren ?? []).map((item) => [item.id, item.display_name]));
    const analysisIds = (analyses ?? []).map((item) => item.id);
    const { data: reviewRows, error: reviewError } = analysisIds.length
      ? await auth.data.from("analysis_claim_reviews").select("*").in("analysis_run_id", analysisIds).order("claim_key")
      : { data: [], error: null };
    if (reviewError) throw new ApiError(500, "ANALYSIS_REVIEW_READ_FAILED", "AI逐条审核记录读取失败");
    const reviewsByRun = new Map<string, any[]>();
    for (const review of reviewRows ?? []) reviewsByRun.set(review.analysis_run_id, [...(reviewsByRun.get(review.analysis_run_id) ?? []), review]);
    const analysesWithClaims = (analyses ?? []).map((analysis) => {
      const stored = new Map((reviewsByRun.get(analysis.id) ?? []).map((item) => [item.claim_key, item]));
      const claimReviews = flattenAnalysisClaims(analysis.structured_result).map((claim) => stored.get(claim.claimKey) ?? {
        id: null,
        analysis_run_id: analysis.id,
        claim_key: claim.claimKey,
        claim_type: claim.claimType,
        original_content: claim.originalContent,
        reviewed_content: null,
        decision: legacyClaimDecision(analysis.decision),
        review_note: null,
        reviewed_by: analysis.decided_by ?? null,
        reviewed_at: analysis.decided_at ?? null,
      });
      return { ...analysis, claim_reviews: claimReviews };
    });
    return {
      item: observation,
      evidence: evidence ?? [],
      analyses: analysesWithClaims,
      subjects: (subjectRows ?? []).map((item) => ({ ...item, display_name: childMap.get(item.child_id) ?? "园内幼儿" })),
      responsePlans: responsePlans ?? [],
      observers: (observers ?? []).map((item) => ({ userId: item.user_id, displayName: item.display_name, role: item.role })),
    };
  });

  app.post("/api/observations", async (request, reply) => {
    const auth = await authenticate(request);
    const input = observationInput.parse(request.body);
    const subjects = input.subjects ?? [{ childId: input.childId!, role: "primary" as const, contextualFeature: "", evidenceAnchors: [] }];
    const primary = subjects.find((item) => item.role === "primary")!;
    const childIds = subjects.map((item) => item.childId);
    const [{ data: children, error: childError }, { data: observerProfiles, error: observerError }] = await Promise.all([
      auth.data.from("children").select("id, display_name, classroom_id, status, guardian_consent_status").in("id", childIds),
      input.observerIds.length
        ? serviceClient.schema(config.SUPABASE_SCHEMA).from("profiles").select("user_id, tenant_id, status").eq("tenant_id", auth.tenantId).in("user_id", input.observerIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (childError || observerError) throw new ApiError(500, "OBSERVATION_CONTEXT_LOOKUP_FAILED", "观察对象或协同教师读取失败");
    if ((children ?? []).length !== childIds.length || (children ?? []).some((child) => child.classroom_id !== input.classroomId || child.status !== "active")) {
      throw new ApiError(422, "OBSERVATION_SUBJECT_INVALID", "观察幼儿必须来自当前班级且档案处于在园状态");
    }
    if ((observerProfiles ?? []).length !== input.observerIds.length || (observerProfiles ?? []).some((profile) => profile.status !== "active")) {
      throw new ApiError(422, "OBSERVATION_OBSERVER_INVALID", "协同观察教师不存在或账号已停用");
    }
    const observerIds = [...new Set([auth.userId, ...input.observerIds])];
    const primaryName = (children ?? []).find((child) => child.id === primary.childId)?.display_name ?? "幼儿";
    const occurredDate = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit" }).format(new Date(input.occurredAt));
    const title = `${occurredDate} · ${input.theme} · ${primaryName}${subjects.length > 1 ? `等${subjects.length}名幼儿` : ""}`;
    const { data, error } = await auth.data.from("observations").insert({
      tenant_id: auth.tenantId,
      classroom_id: input.classroomId,
      child_id: primary.childId,
      template_id: input.templateId || null,
      source_type: input.sourceImportId ? "document_import" : "web",
      source_import_id: input.sourceImportId || null,
      observer_ids: observerIds,
      group_context: input.groupContext || null,
      unlisted_participant_count: input.unlistedParticipantCount,
      title,
      occurred_at: input.occurredAt,
      duration_minutes: input.durationMinutes ?? null,
      scene: input.scene,
      theme: input.theme,
      organization_stage: input.organizationStage,
      observation_focus: input.observationFocus,
      teacher_observation: input.teacherObservation,
      child_quote: null,
      teacher_identification: input.teacherIdentification,
      teacher_response: input.teacherResponse,
      status: "submitted",
      submitted_at: new Date().toISOString(),
      created_by: auth.userId,
    }).select().single();
    if (error) throw new ApiError(error.code === "42501" ? 403 : 500, "OBSERVATION_CREATE_FAILED", error.code === "42501" ? "无权为该班级或幼儿创建观察" : "观察记录创建失败");
    const subjectRows = subjects.map((subject) => ({
      tenant_id: auth.tenantId,
      classroom_id: input.classroomId,
      observation_id: data.id,
      child_id: subject.childId,
      role: subject.role,
      contextual_feature: subject.contextualFeature || null,
      evidence_anchors: subject.evidenceAnchors,
      created_by: auth.userId,
    }));
    const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
    const { data: savedSubjects, error: subjectSaveError } = await schema.from("observation_subjects").insert(subjectRows).select();
    if (subjectSaveError) {
      await schema.from("observations").delete().eq("id", data.id).eq("tenant_id", auth.tenantId);
      throw new ApiError(500, "OBSERVATION_SUBJECT_SAVE_FAILED", "参与幼儿保存失败，观察记录已回滚");
    }
    if (input.sourceImportId) {
      const { data: imported, error: importError } = await schema.from("observation_imports").update({
        observation_id: data.id,
        teacher_confirmed_fields: input,
        matched_child_ids: childIds,
        status: "confirmed",
        confirmed_by: auth.userId,
        confirmed_at: new Date().toISOString(),
      }).eq("id", input.sourceImportId).eq("tenant_id", auth.tenantId).eq("status", "needs_review").select("id").maybeSingle();
      if (importError || !imported) {
        await schema.from("observations").delete().eq("id", data.id).eq("tenant_id", auth.tenantId);
        throw new ApiError(409, "OBSERVATION_IMPORT_CONFIRM_FAILED", "观察表导入任务不存在、已确认或无权使用");
      }
    }
    await audit(auth, "observation.submitted", "observation", data.id, { classroomId: data.classroom_id, childIds, sourceType: data.source_type });
    return reply.status(201).send({ item: data, subjects: savedSubjects ?? [] });
  });

  app.post("/api/observations/:id/evidence-ticket", async (request, reply) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const input = z.object({ fileName: z.string().trim().min(1).max(180), mimeType: z.string(), sizeBytes: z.number().int().positive() }).parse(request.body);
    const media = mimeTypes.get(input.mimeType);
    if (!media) throw new ApiError(422, "UNSUPPORTED_MEDIA_TYPE", "仅支持JPG、PNG、WebP、MP4、MOV和PDF");
    if (input.sizeBytes > media.max) throw new ApiError(422, "MEDIA_TOO_LARGE", media.type === "video" ? "视频片段不能超过100MB" : "图片或文档不能超过10MB");

    const { data: observation, error: observationError } = await auth.data.from("observations").select("id, tenant_id, classroom_id, child_id").eq("id", id).maybeSingle();
    if (observationError) throw new ApiError(500, "OBSERVATION_LOOKUP_FAILED", "观察记录读取失败");
    if (!observation) throw new ApiError(404, "OBSERVATION_NOT_FOUND", "观察记录不存在或无权访问");
    const { data: child, error: childError } = await auth.data.from("children").select("guardian_consent_status").eq("id", observation.child_id).single();
    if (childError) throw new ApiError(500, "CHILD_LOOKUP_FAILED", "幼儿授权状态读取失败");
    if (child?.guardian_consent_status === "withdrawn") throw new ApiError(422, "CONSENT_WITHDRAWN", "监护人已撤回授权，不能新增媒体证据");

    const path = `${auth.tenantId}/${observation.classroom_id}/${observation.child_id}/${observation.id}/${randomUUID()}.${media.ext}`;
    const { data: ticket, error: ticketError } = await serviceClient.storage.from(config.SUPABASE_STORAGE_BUCKET).createSignedUploadUrl(path);
    if (ticketError || !ticket) throw new ApiError(500, "UPLOAD_TICKET_FAILED", "上传凭证创建失败");
    const { data: evidence, error: evidenceError } = await auth.data.from("evidence_assets").insert({
      tenant_id: auth.tenantId,
      classroom_id: observation.classroom_id,
      child_id: observation.child_id,
      observation_id: observation.id,
      evidence_type: media.type,
      storage_path: path,
      file_name: input.fileName,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      upload_status: "pending",
      retention_until: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
      created_by: auth.userId,
    }).select().single();
    if (evidenceError) throw new ApiError(500, "EVIDENCE_CREATE_FAILED", "证据元数据创建失败");
    return reply.status(201).send({ evidenceId: evidence.id, path: ticket.path, token: ticket.token, bucket: config.SUPABASE_STORAGE_BUCKET, supabaseUrl: config.SUPABASE_URL, publishableKey: config.SUPABASE_PUBLISHABLE_KEY });
  });

  app.post("/api/evidence/:id/complete", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const { data: evidence, error: evidenceError } = await auth.data.from("evidence_assets").select("*").eq("id", id).maybeSingle();
    if (evidenceError) throw new ApiError(500, "EVIDENCE_LOOKUP_FAILED", "证据读取失败");
    if (!evidence?.storage_path) throw new ApiError(404, "EVIDENCE_NOT_FOUND", "证据不存在或无权访问");
    const slash = evidence.storage_path.lastIndexOf("/");
    const folder = evidence.storage_path.slice(0, slash);
    const fileName = evidence.storage_path.slice(slash + 1);
    const { data: objects, error: listError } = await serviceClient.storage.from(config.SUPABASE_STORAGE_BUCKET).list(folder, { search: fileName, limit: 2 });
    if (listError || !objects?.some((item) => item.name === fileName)) throw new ApiError(409, "UPLOAD_NOT_FOUND", "尚未检测到已上传文件");
    const { data: updated, error } = await serviceClient
      .schema(config.SUPABASE_SCHEMA)
      .from("evidence_assets")
      .update({ upload_status: "ready" })
      .eq("id", id)
      .eq("tenant_id", auth.tenantId)
      .select()
      .single();
    if (error) throw new ApiError(500, "EVIDENCE_CONFIRM_FAILED", "证据确认失败");
    await audit(auth, "evidence.uploaded", "evidence", id, { observationId: evidence.observation_id, mimeType: evidence.mime_type, sizeBytes: evidence.size_bytes });
    return { item: updated };
  });

  app.post(
    "/api/evidence/:id/upload",
    { bodyLimit: 100 * 1024 * 1024 },
    async (request) => {
      const auth = await authenticate(request);
      const { id } = z.object({ id: uuid }).parse(request.params);
      if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
        throw new ApiError(422, "EMPTY_MEDIA_UPLOAD", "上传文件为空");
      }

      const { data: evidence, error: evidenceError } = await auth.data
        .from("evidence_assets")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (evidenceError) throw new ApiError(500, "EVIDENCE_LOOKUP_FAILED", "证据读取失败");
      if (!evidence?.storage_path) {
        throw new ApiError(404, "EVIDENCE_NOT_FOUND", "证据不存在或无权访问");
      }
      if (evidence.upload_status !== "pending") {
        throw new ApiError(409, "EVIDENCE_NOT_PENDING", "该证据已完成上传或不可重复上传");
      }

      const media = mimeTypes.get(evidence.mime_type);
      if (!media) {
        throw new ApiError(422, "UNSUPPORTED_MEDIA_TYPE", "证据媒体类型不受支持");
      }
      if (request.body.length !== evidence.size_bytes) {
        throw new ApiError(422, "MEDIA_SIZE_MISMATCH", "上传文件大小与凭证不一致");
      }
      if (request.body.length > media.max) {
        throw new ApiError(422, "MEDIA_TOO_LARGE", media.type === "video" ? "视频片段不能超过100MB" : "图片或文档不能超过10MB");
      }

      const { data: child, error: childError } = await auth.data
        .from("children")
        .select("guardian_consent_status")
        .eq("id", evidence.child_id)
        .maybeSingle();
      if (childError) throw new ApiError(500, "CHILD_LOOKUP_FAILED", "幼儿授权状态读取失败");
      if (child?.guardian_consent_status === "withdrawn") {
        throw new ApiError(422, "CONSENT_WITHDRAWN", "监护人已撤回授权，不能新增媒体证据");
      }

      const { error: uploadError } = await serviceClient.storage
        .from(config.SUPABASE_STORAGE_BUCKET)
        .upload(evidence.storage_path, request.body, {
          contentType: evidence.mime_type,
          cacheControl: "3600",
          upsert: false,
        });
      if (uploadError) {
        request.log.error({ err: uploadError, evidenceId: id }, "evidence storage upload failed");
        throw new ApiError(500, "MEDIA_UPLOAD_FAILED", "媒体文件写入存储失败");
      }

      const { data: updated, error: updateError } = await serviceClient
        .schema(config.SUPABASE_SCHEMA)
        .from("evidence_assets")
        .update({ upload_status: "ready" })
        .eq("id", id)
        .eq("tenant_id", auth.tenantId)
        .select()
        .single();
      if (updateError) {
        throw new ApiError(500, "EVIDENCE_CONFIRM_FAILED", "媒体已上传，但证据状态确认失败");
      }

      await audit(auth, "evidence.uploaded", "evidence", id, {
        observationId: evidence.observation_id,
        mimeType: evidence.mime_type,
        sizeBytes: evidence.size_bytes,
        uploadChannel: "api-proxy",
      });
      return { item: updated };
    },
  );

  app.get("/api/evidence/:id/download", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const { data: evidence, error: evidenceError } = await auth.data.from("evidence_assets").select("storage_path, upload_status").eq("id", id).maybeSingle();
    if (evidenceError) throw new ApiError(500, "EVIDENCE_LOOKUP_FAILED", "证据读取失败");
    if (!evidence?.storage_path || evidence.upload_status !== "ready") throw new ApiError(404, "EVIDENCE_NOT_READY", "证据不存在或尚未上传完成");
    const { data, error } = await serviceClient.storage.from(config.SUPABASE_STORAGE_BUCKET).createSignedUrl(evidence.storage_path, 300);
    if (error || !data) throw new ApiError(500, "DOWNLOAD_URL_FAILED", "证据查看链接创建失败");
    return { url: publicSupabaseUrl(data.signedUrl), expiresIn: 300 };
  });

  app.post("/api/observations/:id/analyze", { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } }, async (request, reply) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const { data: observation, error: observationError } = await auth.data.from("observations").select("*").eq("id", id).maybeSingle();
    if (observationError) throw new ApiError(500, "OBSERVATION_LOOKUP_FAILED", "观察记录读取失败");
    if (!observation) throw new ApiError(404, "OBSERVATION_NOT_FOUND", "观察记录不存在或无权访问");
    if (observation.status === "draft") throw new ApiError(409, "OBSERVATION_NOT_SUBMITTED", "请先提交教师观察、识别和应答");
    const [{ data: classroom, error: classroomError }, { data: evidence, error: evidenceError }, { data: subjectRows, error: subjectError }, { data: professionalMemories, error: memoryError }, { data: frameworkRows, error: frameworkError }] = await Promise.all([
      auth.data.from("classrooms").select("id, grade").eq("id", observation.classroom_id).single(),
      auth.data.from("evidence_assets").select("id, evidence_type, transcript, event_segments, upload_status, storage_path, mime_type").eq("observation_id", id).eq("upload_status", "ready"),
      auth.data.from("observation_subjects").select("*").eq("observation_id", id).order("role"),
      auth.data.from("professional_memories").select("id, memory_type, summary, retrieval_text, applicability, quality_score").eq("status", "active").order("quality_score", { ascending: false }).limit(24),
      auth.data.from("analysis_framework_versions").select("id, framework_type, name, version, description, dimensions").eq("status", "active").eq("is_default", true).order("framework_type"),
    ]);
    if (classroomError || evidenceError || subjectError || memoryError || frameworkError) throw new ApiError(500, "ANALYSIS_CONTEXT_READ_FAILED", "AI分析上下文读取失败");
    if (!classroom || !subjectRows?.length) throw new ApiError(422, "ANALYSIS_CONTEXT_MISSING", "班级或观察幼儿信息不完整");
    const subjectIds = subjectRows.map((item) => item.child_id);
    const { data: children, error: childError } = await auth.data.from("children").select("id, display_name, birth_month, guardian_consent_status").in("id", subjectIds);
    if (childError || (children ?? []).length !== subjectIds.length) throw new ApiError(500, "ANALYSIS_CHILDREN_READ_FAILED", "观察幼儿信息读取失败");
    const { data: knowledge, error: knowledgeError } = await auth.data.from("knowledge_cards").select("*").eq("grade", classroom.grade).eq("status", "active").limit(200);
    if (knowledgeError || !knowledge?.length) throw new ApiError(409, "KNOWLEDGE_NOT_READY", "当前班级年龄段知识库尚未初始化");
    const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
    const createdRunIds: string[] = [];
    const analyses: any[] = [];
    const notices = new Set<string>();
    try {
      for (const subject of subjectRows) {
        const child = (children ?? []).find((item) => item.id === subject.child_id)!;
        const { data: historySubjects, error: historySubjectError } = await auth.data.from("observation_subjects").select("observation_id").eq("child_id", child.id).neq("observation_id", id).order("created_at", { ascending: false }).limit(24);
        if (historySubjectError) throw new ApiError(500, "ANALYSIS_HISTORY_READ_FAILED", "历史观察关联读取失败");
        const historyIds = (historySubjects ?? []).map((item) => item.observation_id);
        const { data: historicalObservations, error: historyError } = historyIds.length
          ? await auth.data.from("observations").select("id, occurred_at, scene, theme, teacher_observation, child_quote, teacher_identification, teacher_response")
            .in("id", historyIds).eq("status", "adopted").lt("occurred_at", observation.occurred_at).order("occurred_at", { ascending: true }).limit(12)
          : { data: [], error: null };
        if (historyError) throw new ApiError(500, "ANALYSIS_HISTORY_READ_FAILED", "历史观察证据读取失败");
        const historicalIds = (historicalObservations ?? []).map((item) => item.id);
        const { data: historicalAnalyses, error: historicalAnalysisError } = historicalIds.length
          ? await auth.data.from("analysis_runs").select("*").in("observation_id", historicalIds).eq("child_id", child.id).eq("decision", "adopted").order("generated_at", { ascending: false })
          : { data: [], error: null };
        if (historicalAnalysisError) throw new ApiError(500, "ANALYSIS_HISTORY_READ_FAILED", "历史分析证据读取失败");
        const historicalAnalysisIds = (historicalAnalyses ?? []).map((item) => item.id);
        const { data: historicalReviews, error: historicalReviewError } = historicalAnalysisIds.length
          ? await auth.data.from("analysis_claim_reviews").select("*").in("analysis_run_id", historicalAnalysisIds)
          : { data: [], error: null };
        if (historicalReviewError) throw new ApiError(500, "ANALYSIS_HISTORY_REVIEW_READ_FAILED", "历史审核结论读取失败");
        const latestAnalysisByObservation = new Map<string, any>();
        for (const analysis of historicalAnalyses ?? []) if (!latestAnalysisByObservation.has(analysis.observation_id)) latestAnalysisByObservation.set(analysis.observation_id, analysis);
        const history = (historicalObservations ?? []).map((item) => {
          const priorAnalysis = latestAnalysisByObservation.get(item.id);
          const reviews = (historicalReviews ?? []).filter((review) => review.analysis_run_id === priorAnalysis?.id);
          const official = priorAnalysis ? effectiveAnalysisResult(priorAnalysis.structured_result, reviews) : null;
          return { ...item, adopted_analysis: official ? {
            objectiveSummary: official.objectiveSummary,
            currentExperience: official.currentExperience,
            interestsAndStrengths: official.interestsAndStrengths,
            interpretations: official.interpretations,
            developmentReferences: official.developmentReferences,
          } : null };
        });
        let media: MediaForAnalysis[] = [];
        if (config.AI_MODE === "qianwen" && config.qwenMediaAnalysisEnabled && child.guardian_consent_status === "granted") {
          const candidates = (evidence ?? []).filter((item) => ["photo", "video"].includes(item.evidence_type) && item.storage_path).slice(0, config.QWEN_MAX_MEDIA);
          const signed = await Promise.all(candidates.map(async (item) => {
            const { data } = await serviceClient.storage.from(config.SUPABASE_STORAGE_BUCKET).createSignedUrl(item.storage_path, 900);
            if (!data?.signedUrl) return null;
            return { id: item.id, evidenceType: item.evidence_type as "photo" | "video", mimeType: item.mime_type || (item.evidence_type === "video" ? "video/mp4" : "image/jpeg"), signedUrl: publicSupabaseUrl(data.signedUrl) } satisfies MediaForAnalysis;
          }));
          media = signed.filter((item): item is MediaForAnalysis => item !== null);
        }
        const observationForChild = { ...observation, subject_context: subject.contextual_feature || "未补充本次个体情境特征" };
        const rankedMemories: ProfessionalMemoryForAnalysis[] = ((professionalMemories ?? []) as any[])
          .slice()
          .sort((left: any, right: any) => {
            const leftChild = left.applicability?.childId === child.id ? 1 : 0;
            const rightChild = right.applicability?.childId === child.id ? 1 : 0;
            const leftClass = left.applicability?.classroomId === observation.classroom_id ? 1 : 0;
            const rightClass = right.applicability?.classroomId === observation.classroom_id ? 1 : 0;
            return (rightChild * 2 + rightClass + Number(right.quality_score)) - (leftChild * 2 + leftClass + Number(left.quality_score));
          })
          .slice(0, 8)
          .map((item: any) => ({ id: item.id, memoryType: item.memory_type, summary: item.summary, retrievalText: item.retrieval_text, applicability: item.applicability ?? {}, qualityScore: Number(item.quality_score) }));
        const generated = await aiProvider.analyzeObservation({
          observation: observationForChild,
          child,
          classroom,
          knowledge: knowledge as KnowledgeRow[],
          evidence: (evidence ?? []).map(({ storage_path: _storagePath, ...item }) => item),
          media,
          history,
          professionalMemories: rankedMemories,
          analysisFrameworks: (frameworkRows ?? []).map((item: any) => ({ id: item.id, frameworkType: item.framework_type, name: item.name, version: item.version, description: item.description, dimensions: item.dimensions })),
        });
        notices.add(generated.notice);
        if (generated.fallbackReason) request.log.warn({ observationId: observation.id, childId: child.id, fallbackReason: generated.fallbackReason }, "AI provider used safe fallback");
        const structuredResult = generated.data;
        const matchedCodes = [...structuredResult.developmentReferences.map((item) => item.indicatorCode), ...structuredResult.domainExperiences.flatMap((item) => item.indicatorCodes)];
        const matchedCards = (knowledge as KnowledgeRow[]).filter((card) => matchedCodes.includes(card.code));
        const now = new Date().toISOString();
        const { data: analysis, error } = await schema.from("analysis_runs").insert({
          tenant_id: auth.tenantId, classroom_id: observation.classroom_id, child_id: child.id,
          observation_id: observation.id, provider: generated.provider, model: generated.model,
          prompt_version: generated.promptVersion, knowledge_version: "guide-cn-2012.v1.0.0",
          input_snapshot: {
            observation: observationForChild, subject: { role: subject.role, contextualFeature: subject.contextual_feature, evidenceAnchors: subject.evidence_anchors },
            child, classroom, evidence: (evidence ?? []).map(({ storage_path: _storagePath, ...item }) => item),
            mediaAnalyzed: generated.mediaAnalyzed,
            history: history.map(({ adopted_analysis, ...item }) => ({ ...item, adoptedAnalysisIncluded: Boolean(adopted_analysis) })),
            professionalMemoryIds: rankedMemories.map((item) => item.id),
            analysisFrameworkVersionIds: (frameworkRows ?? []).map((item) => item.id),
            generatedAt: now,
          },
          knowledge_card_ids: matchedCards.map((card) => card.id), structured_result: structuredResult,
          risk_flags: structuredResult.warnings, generated_by: auth.userId,
        }).select().single();
        if (error) throw new ApiError(500, "AI_ANALYSIS_SAVE_FAILED", `${child.display_name}的AI分析结果保存失败`);
        createdRunIds.push(analysis.id);
        const claims = flattenAnalysisClaims(structuredResult).map((claim) => ({
          tenant_id: auth.tenantId, classroom_id: observation.classroom_id, child_id: child.id,
          observation_id: observation.id, analysis_run_id: analysis.id,
          claim_key: claim.claimKey, claim_type: claim.claimType, original_content: claim.originalContent,
        }));
        const responsePlans = structuredResult.responsePlans.map((plan, index) => ({
          tenant_id: auth.tenantId, classroom_id: observation.classroom_id, child_id: child.id,
          observation_id: observation.id, analysis_run_id: analysis.id, title: plan.title,
          rationale: plan.rationale, target_experience: plan.targetExperience,
          activity_support: plan.activitySupport, material_support: plan.materialSupport,
          experience_support: plan.experienceSupport, observation_cut: plan.observationCut,
          observation_focus: plan.observationFocus, adjustment_condition: plan.adjustmentCondition,
          source_plan_keys: [`response-plan:${index}`], created_by: auth.userId,
        }));
        const [{ error: claimError }, { error: responseError }] = await Promise.all([
          schema.from("analysis_claim_reviews").insert(claims),
          schema.from("response_plans").insert(responsePlans),
        ]);
        if (claimError || responseError) throw new ApiError(500, "AI_REVIEW_ITEMS_SAVE_FAILED", `${child.display_name}的审核项或应答方案初始化失败`);
        analyses.push({ ...analysis, subject: { ...subject, display_name: child.display_name } });
      }
    } catch (reason) {
      if (createdRunIds.length) await schema.from("analysis_runs").delete().in("id", createdRunIds).eq("tenant_id", auth.tenantId);
      if (reason instanceof ApiError) throw reason;
      request.log.error({ err: reason, observationId: id }, "multi-subject AI analysis failed");
      throw new ApiError(502, "AI_ANALYSIS_FAILED", "AI分析暂时不可用，请稍后重试");
    }
    const { error: statusError } = await serviceClient
      .schema(config.SUPABASE_SCHEMA)
      .from("observations")
      .update({ status: "ai_ready" })
      .eq("id", observation.id)
      .eq("tenant_id", auth.tenantId);
    if (statusError) {
      if (createdRunIds.length) await schema.from("analysis_runs").delete().in("id", createdRunIds).eq("tenant_id", auth.tenantId);
      throw new ApiError(500, "AI_ANALYSIS_STATE_FAILED", "AI分析状态保存失败，结果已回滚");
    }
    await audit(auth, "analysis.generated", "observation", observation.id, {
      observationId: observation.id,
      childIds: subjectIds,
      analysisRunIds: createdRunIds,
      analysisCount: analyses.length,
    });
    const notice = [...notices].join("；");
    return reply.status(201).send({ item: analyses[0], items: analyses, aiNotice: notice, simulationNotice: notice });
  });

  app.post("/api/analyses/:id/decision", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const input = z.object({ decision: z.enum(["adopted", "abandoned"]), note: z.string().trim().max(1000).optional() }).parse(request.body);
    const { data: analysis, error: analysisError } = await auth.data.from("analysis_runs").select("*").eq("id", id).maybeSingle();
    if (analysisError || !analysis) throw new ApiError(404, "ANALYSIS_NOT_FOUND", "AI分析不存在或无权访问");
    const now = new Date().toISOString();
    const rows = flattenAnalysisClaims(analysis.structured_result).map((claim) => ({
      tenant_id: auth.tenantId, classroom_id: analysis.classroom_id, child_id: analysis.child_id,
      observation_id: analysis.observation_id, analysis_run_id: analysis.id,
      claim_key: claim.claimKey, claim_type: claim.claimType, original_content: claim.originalContent,
      reviewed_content: null, decision: input.decision === "adopted" ? "adopted" : "rejected",
      review_note: input.note || null, reviewed_by: auth.userId, reviewed_at: now,
    }));
    const { error: reviewError } = await serviceClient.schema(config.SUPABASE_SCHEMA).from("analysis_claim_reviews").upsert(rows, { onConflict: "analysis_run_id,claim_key" });
    if (reviewError) throw new ApiError(500, "ANALYSIS_REVIEW_SAVE_FAILED", "AI逐条审核结果保存失败");
    const { data, error } = await auth.data.schema(config.SUPABASE_SCHEMA).rpc("finalize_analysis_review", { target_analysis_id: id, target_note: input.note || null });
    if (error) throw new ApiError(error.code === "23505" ? 409 : 500, "ANALYSIS_DECISION_FAILED", error.code === "23505" ? "该AI结果已经处理" : "AI结果处理失败");
    await audit(auth, input.decision === "adopted" ? "analysis.adopted" : "analysis.abandoned", "analysis", id, { note: input.note ?? "" });
    await queueAnalysisMemory(auth, data, input.note ?? "");
    return { item: data };
  });

  app.patch("/api/analyses/:id/claims/:claimKey", async (request) => {
    const auth = await authenticate(request);
    const { id, claimKey } = z.object({ id: uuid, claimKey: z.string().trim().min(1).max(160) }).parse(request.params);
    const input = z.object({
      decision: z.enum(claimDecisions).refine((value) => value !== "pending", "请选择审核决定"),
      content: z.string().trim().min(2).max(4000).optional(),
      note: z.string().trim().max(1000).optional(),
    }).superRefine((value, context) => {
      if (value.decision === "modified" && !value.content) context.addIssue({ code: "custom", message: "修改结论时必须填写修改后内容", path: ["content"] });
    }).parse(request.body);
    const { data: analysis, error: analysisError } = await auth.data.from("analysis_runs").select("*").eq("id", id).maybeSingle();
    if (analysisError) throw new ApiError(500, "ANALYSIS_READ_FAILED", "AI分析读取失败");
    if (!analysis) throw new ApiError(404, "ANALYSIS_NOT_FOUND", "AI分析不存在或无权访问");
    if (analysis.decision !== "pending") throw new ApiError(409, "ANALYSIS_ALREADY_FINALIZED", "该AI分析已完成教师终审");
    const claim = flattenAnalysisClaims(analysis.structured_result).find((item) => item.claimKey === claimKey);
    if (!claim) throw new ApiError(404, "ANALYSIS_CLAIM_NOT_FOUND", "AI结论项不存在");
    const reviewedContent = input.decision === "modified" ? { ...claim.originalContent, content: input.content } : null;
    const row = {
      tenant_id: auth.tenantId, classroom_id: analysis.classroom_id, child_id: analysis.child_id,
      observation_id: analysis.observation_id, analysis_run_id: analysis.id,
      claim_key: claim.claimKey, claim_type: claim.claimType, original_content: claim.originalContent,
      reviewed_content: reviewedContent, decision: input.decision, review_note: input.note || null,
      reviewed_by: auth.userId, reviewed_at: new Date().toISOString(),
    };
    const { data: existing, error: existingError } = await auth.data.from("analysis_claim_reviews").select("id").eq("analysis_run_id", id).eq("claim_key", claimKey).maybeSingle();
    if (existingError) throw new ApiError(500, "ANALYSIS_CLAIM_READ_FAILED", "AI结论审核状态读取失败");
    const operation = existing
      ? serviceClient.schema(config.SUPABASE_SCHEMA).from("analysis_claim_reviews").update({
        reviewed_content: row.reviewed_content,
        decision: row.decision,
        review_note: row.review_note,
        reviewed_by: row.reviewed_by,
        reviewed_at: row.reviewed_at,
      }).eq("id", existing.id).eq("tenant_id", auth.tenantId).select().single()
      : serviceClient.schema(config.SUPABASE_SCHEMA).from("analysis_claim_reviews").insert(row).select().single();
    const { data, error } = await operation;
    if (error) throw new ApiError(500, "ANALYSIS_CLAIM_REVIEW_FAILED", "AI结论审核保存失败");
    await audit(auth, `analysis.claim.${input.decision}`, "analysis_claim", `${id}:${claimKey}`, { analysisId: id, claimKey, note: input.note ?? "" });
    return { item: data };
  });

  app.post("/api/analyses/:id/finalize", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const input = z.object({ note: z.string().trim().max(1000).optional() }).parse(request.body ?? {});
    const { data, error } = await auth.data.schema(config.SUPABASE_SCHEMA).rpc("finalize_analysis_review", {
      target_analysis_id: id,
      target_note: input.note || null,
    });
    if (error) {
      if (error.code === "23514") throw new ApiError(409, "ANALYSIS_CLAIMS_PENDING", "请先逐条处理全部AI结论，再完成教师终审");
      throw new ApiError(error.code === "23505" ? 409 : 500, "ANALYSIS_FINALIZE_FAILED", error.code === "23505" ? "该AI结果已经完成终审" : "AI分析终审失败");
    }
    await audit(auth, data.decision === "adopted" ? "analysis.adopted" : "analysis.abandoned", "analysis", id, { note: input.note ?? "", reviewMode: "claim-level" });
    await queueAnalysisMemory(auth, data, input.note ?? "");
    return { item: data };
  });
}
