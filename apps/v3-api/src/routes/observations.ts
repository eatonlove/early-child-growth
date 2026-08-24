import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { KnowledgeRow, MediaForAnalysis } from "../ai/contracts.js";
import { createAIProvider } from "../ai/provider.js";
import { config } from "../config.js";
import { ApiError, audit, authenticate } from "../http.js";
import { publicSupabaseUrl, serviceClient } from "../supabase.js";

const uuid = z.string().uuid();
const responseSchema = z.object({
  category: z.enum(["experience", "material", "activity"]),
  strategy: z.string().trim().min(2).max(2000),
  nextObservationFocus: z.string().trim().min(2).max(1000),
});
const observationInput = z.object({
  classroomId: uuid,
  childId: uuid,
  templateId: uuid.optional(),
  title: z.string().trim().min(1).max(120),
  occurredAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(1).max(240).optional(),
  scene: z.string().trim().min(1).max(80),
  theme: z.string().trim().min(1).max(120),
  organizationStage: z.enum(["plan", "introduction", "process", "sharing", "evaluation"]),
  observationFocus: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  teacherObservation: z.string().trim().min(10).max(12000),
  childQuote: z.string().trim().max(3000).optional(),
  teacherIdentification: z.string().trim().min(5).max(6000),
  teacherResponse: responseSchema,
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

export async function observationRoutes(app: FastifyInstance) {
  app.get("/api/observations", async (request) => {
    const auth = await authenticate(request);
    const query = z.object({ classroomId: uuid.optional(), childId: uuid.optional(), status: z.string().optional() }).parse(request.query);
    let builder = auth.data.from("observations").select("*").order("occurred_at", { ascending: false });
    if (query.classroomId) builder = builder.eq("classroom_id", query.classroomId);
    if (query.childId) builder = builder.eq("child_id", query.childId);
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
    const [{ data: evidence, error: evidenceError }, { data: analyses, error: analysisError }] = await Promise.all([
      auth.data.from("evidence_assets").select("*").eq("observation_id", id).order("created_at"),
      auth.data.from("analysis_runs").select("*").eq("observation_id", id).order("generated_at", { ascending: false }),
    ]);
    if (evidenceError || analysisError) throw new ApiError(500, "OBSERVATION_DETAIL_FAILED", "观察证据或分析结果读取失败");
    return { item: observation, evidence: evidence ?? [], analyses: analyses ?? [] };
  });

  app.post("/api/observations", async (request, reply) => {
    const auth = await authenticate(request);
    const input = observationInput.parse(request.body);
    const { data, error } = await auth.data.from("observations").insert({
      tenant_id: auth.tenantId,
      classroom_id: input.classroomId,
      child_id: input.childId,
      template_id: input.templateId || null,
      title: input.title,
      occurred_at: input.occurredAt,
      duration_minutes: input.durationMinutes ?? null,
      scene: input.scene,
      theme: input.theme,
      organization_stage: input.organizationStage,
      observation_focus: input.observationFocus,
      teacher_observation: input.teacherObservation,
      child_quote: input.childQuote || null,
      teacher_identification: input.teacherIdentification,
      teacher_response: input.teacherResponse,
      status: "submitted",
      submitted_at: new Date().toISOString(),
      created_by: auth.userId,
    }).select().single();
    if (error) throw new ApiError(error.code === "42501" ? 403 : 500, "OBSERVATION_CREATE_FAILED", error.code === "42501" ? "无权为该班级或幼儿创建观察" : "观察记录创建失败");
    await audit(auth, "observation.submitted", "observation", data.id, { classroomId: data.classroom_id, childId: data.child_id });
    return reply.status(201).send({ item: data });
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
    const [{ data: classroom, error: classroomError }, { data: child, error: childError }, { data: evidence, error: evidenceError }] = await Promise.all([
      auth.data.from("classrooms").select("id, grade").eq("id", observation.classroom_id).single(),
      auth.data.from("children").select("id, display_name, birth_month, guardian_consent_status").eq("id", observation.child_id).single(),
      auth.data.from("evidence_assets").select("id, evidence_type, transcript, event_segments, upload_status, storage_path, mime_type").eq("observation_id", id).eq("upload_status", "ready"),
    ]);
    if (classroomError || childError || evidenceError) throw new ApiError(500, "ANALYSIS_CONTEXT_READ_FAILED", "AI分析上下文读取失败");
    if (!classroom || !child) throw new ApiError(422, "ANALYSIS_CONTEXT_MISSING", "幼儿或班级信息不完整");
    const { data: knowledge, error: knowledgeError } = await auth.data.from("knowledge_cards").select("*").eq("grade", classroom.grade).eq("status", "active").limit(200);
    if (knowledgeError || !knowledge?.length) throw new ApiError(409, "KNOWLEDGE_NOT_READY", "当前班级年龄段知识库尚未初始化");

    let media: MediaForAnalysis[] = [];
    if (config.AI_MODE === "qianwen" && config.qwenMediaAnalysisEnabled && child.guardian_consent_status === "granted") {
      const candidates = (evidence ?? [])
        .filter((item) => ["photo", "video"].includes(item.evidence_type) && item.storage_path)
        .slice(0, config.QWEN_MAX_MEDIA);
      const signed = await Promise.all(candidates.map(async (item) => {
        const { data } = await serviceClient.storage.from(config.SUPABASE_STORAGE_BUCKET).createSignedUrl(item.storage_path, 900);
        if (!data?.signedUrl) return null;
        return {
          id: item.id,
          evidenceType: item.evidence_type as "photo" | "video",
          mimeType: item.mime_type || (item.evidence_type === "video" ? "video/mp4" : "image/jpeg"),
          signedUrl: publicSupabaseUrl(data.signedUrl),
        } satisfies MediaForAnalysis;
      }));
      media = signed.filter((item): item is MediaForAnalysis => item !== null);
    }

    let generated;
    try {
      generated = await aiProvider.analyzeObservation({
        observation,
        child,
        classroom,
        knowledge: knowledge as KnowledgeRow[],
        evidence: (evidence ?? []).map(({ storage_path: _storagePath, ...item }) => item),
        media,
      });
    } catch {
      throw new ApiError(502, "AI_ANALYSIS_FAILED", "AI分析暂时不可用，请稍后重试");
    }
    if (generated.fallbackReason) {
      request.log.warn(
        { observationId: observation.id, fallbackReason: generated.fallbackReason },
        "AI provider used safe fallback",
      );
    }
    const structuredResult = generated.data;
    const matchedCodes = structuredResult.developmentReferences.map((item) => item.indicatorCode);
    const matchedCards = (knowledge as KnowledgeRow[]).filter((card) => matchedCodes.includes(card.code));
    const now = new Date().toISOString();
    const inputSnapshot = {
      observation,
      child,
      classroom,
      evidence: (evidence ?? []).map(({ storage_path: _storagePath, ...item }) => item),
      mediaAnalyzed: generated.mediaAnalyzed,
      generatedAt: now,
    };
    const { data: analysis, error } = await serviceClient.schema(config.SUPABASE_SCHEMA).from("analysis_runs").insert({
      tenant_id: auth.tenantId,
      classroom_id: observation.classroom_id,
      child_id: observation.child_id,
      observation_id: observation.id,
      provider: generated.provider,
      model: generated.model,
      prompt_version: generated.promptVersion,
      knowledge_version: "guide-cn-2012.v1.0.0",
      input_snapshot: inputSnapshot,
      knowledge_card_ids: matchedCards.map((card) => card.id),
      structured_result: structuredResult,
      risk_flags: structuredResult.warnings,
      generated_by: auth.userId,
    }).select().single();
    if (error) throw new ApiError(500, "AI_ANALYSIS_SAVE_FAILED", "AI分析结果保存失败");
    const { error: statusError } = await serviceClient
      .schema(config.SUPABASE_SCHEMA)
      .from("observations")
      .update({ status: "ai_ready" })
      .eq("id", observation.id)
      .eq("tenant_id", auth.tenantId);
    if (statusError) {
      await serviceClient.schema(config.SUPABASE_SCHEMA).from("analysis_runs").delete().eq("id", analysis.id);
      throw new ApiError(500, "AI_ANALYSIS_STATE_FAILED", "AI分析状态保存失败，结果已回滚");
    }
    await audit(auth, "analysis.generated", "analysis", analysis.id, {
      observationId: observation.id,
      provider: generated.provider,
      model: generated.model,
      mediaAnalyzed: generated.mediaAnalyzed,
      fallbackUsed: Boolean(generated.fallbackReason),
      fallbackReason: generated.fallbackReason ?? null,
      knowledgeCardIds: matchedCards.map((card) => card.id),
    });
    return reply.status(201).send({ item: analysis, aiNotice: generated.notice, simulationNotice: generated.notice });
  });

  app.post("/api/analyses/:id/decision", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const input = z.object({ decision: z.enum(["adopted", "abandoned"]), note: z.string().trim().max(1000).optional() }).parse(request.body);
    const { data, error } = await auth.data.schema(config.SUPABASE_SCHEMA).rpc("decide_analysis", {
      target_analysis_id: id,
      target_decision: input.decision,
      target_note: input.note || null,
    });
    if (error) throw new ApiError(error.code === "23505" ? 409 : 500, "ANALYSIS_DECISION_FAILED", error.code === "23505" ? "该AI结果已经处理" : "AI结果处理失败");
    await audit(auth, input.decision === "adopted" ? "analysis.adopted" : "analysis.abandoned", "analysis", id, { note: input.note ?? "" });
    return { item: data };
  });
}
