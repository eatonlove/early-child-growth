import { InsufficientObservationEvidenceError, anonymizeSubjectNames, uniqueSubjectCues } from "../ai/subject-evidence.js";
import { subjectResults, replaceSubjectResult, mergeSubjectResults } from "../domain/analysis-subject-results.js";
import { hasPlaceholderSupport } from "../ai/text-quality.js";
import { randomUUID } from "node:crypto";
import { observationInput } from "../domain/observation-contracts.js";
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { KnowledgeRow, MediaForAnalysis, ProfessionalMemoryForAnalysis } from "../ai/contracts.js";
import { createAIProvider } from "../ai/provider.js";
import { QwenRequestError } from "../ai/qianwen-client.js";
import { resolveTenantPrompt } from "../ai/prompt-config.js";
import { enqueueAnalysisTask } from "../analysis-task-queue.js";
import { effectiveAnalysisResult, flattenAnalysisClaims, legacyClaimDecision, claimDecisions } from "../analysis-claims.js";
import { config } from "../config.js";
import { ApiError, audit, authenticate } from "../http.js";
import { optimizeMediaFileLosslessly,optimizeMediaLosslessly } from "../media-optimizer.js";
import {boundedUploadStream} from '../resource-library.js';
import { mediaStorage } from "../runtime/media-storage.js";
import { serviceClient } from "../supabase.js";

const uuid = z.string().uuid();

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
  visionTimeoutMs: config.QWEN_VISION_TIMEOUT_MS,
  observationTimeoutMs: config.QWEN_OBSERVATION_TIMEOUT_MS,
  assessIndividualEvidence: true,
  webSearchEnabled: config.qwenWebSearchEnabled,
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
    title: "教师确认的游戏分析案例",
    summary: summary || "教师已确认该观察的专业分析。",
    retrieval_text: `${result.objectiveSummary ?? ""}\n${summary}\n教师确认说明：${note}`.slice(0, 12000),
    applicability: { classroomId: analysis.classroom_id, childId: analysis.child_id, observationId: analysis.observation_id },
    evidence_refs: [{ observationId: analysis.observation_id, analysisRunId: analysis.id }],
    quality_score: 0.65,
    status: "active",
    created_by: auth.userId,
  }, { onConflict: "tenant_id,memory_type,source_resource_type,source_resource_id" });
}

export async function observationRoutes(app: FastifyInstance) {
  app.get("/api/observations", async (request) => {
    const auth = await authenticate(request);
    const query = z.object({
      classroomId: uuid.optional(), childId: uuid.optional(), status: z.string().optional(),
      academicYear: z.string().trim().min(4).max(20).optional(),
      semester: z.string().trim().min(1).max(40).optional(),
      year: z.coerce.number().int().min(2000).max(2100).optional(),
      month: z.coerce.number().int().min(1).max(12).optional(),
    }).refine((value) => !value.month || value.year, { message: "按月筛选时必须同时提供年份", path: ["year"] }).parse(request.query);
    let observationIds: string[] | null = null;
    if (query.childId) {
      const { data: subjectRows, error: subjectError } = await auth.data.from("observation_subjects").select("observation_id").eq("child_id", query.childId);
      if (subjectError) throw new ApiError(500, "OBSERVATION_SUBJECT_LIST_FAILED", "幼儿观察关联读取失败");
      observationIds = (subjectRows ?? []).map((item) => item.observation_id);
      if (!observationIds.length) return { items: [] };
    }
    let classroomIds: string[] | null = null;
    if (query.academicYear || query.semester) {
      let classroomBuilder = auth.data.from("classrooms").select("id");
      if (query.academicYear) classroomBuilder = classroomBuilder.eq("academic_year", query.academicYear);
      if (query.semester) classroomBuilder = classroomBuilder.eq("semester", query.semester);
      const { data: classRows, error: classError } = await classroomBuilder;
      if (classError) throw new ApiError(500, "OBSERVATION_CLASS_FILTER_FAILED", "观察档案班级范围读取失败");
      classroomIds = (classRows ?? []).map((item) => item.id);
      if (query.classroomId && !classroomIds.includes(query.classroomId)) return { items: [] };
      if (!query.classroomId && !classroomIds.length) return { items: [] };
    }
    let builder = auth.data.from("observations").select("*").order("occurred_at", { ascending: false });
    if (query.classroomId) builder = builder.eq("classroom_id", query.classroomId);
    else if (classroomIds) builder = builder.in("classroom_id", classroomIds);
    if (observationIds) builder = builder.in("id", observationIds);
    if (query.status) builder = builder.eq("status", query.status);
    if (query.year) {
      const startMonth = query.month ?? 1;
      const endYear = query.month === 12 || !query.month ? query.year + 1 : query.year;
      const endMonth = query.month ? (query.month === 12 ? 1 : query.month + 1) : 1;
      const start = new Date(`${query.year}-${String(startMonth).padStart(2, "0")}-01T00:00:00+08:00`);
      const end = new Date(`${endYear}-${String(endMonth).padStart(2, "0")}-01T00:00:00+08:00`);
      builder = builder.gte("occurred_at", start.toISOString()).lt("occurred_at", end.toISOString());
    }
    const { data, error } = await builder;
    if (error) throw new ApiError(500, "OBSERVATION_LIST_FAILED", "观察记录读取失败");
    const ids = (data ?? []).map(item => item.id);
    const {data: confirmed, error: confirmedError} = ids.length ? await auth.data.from('analysis_runs').select('observation_id').in('observation_id', ids).eq('decision', 'adopted') : {data: [], error: null};
    if (confirmedError) throw new ApiError(500, 'OBSERVATION_CONFIRMED_READ_FAILED', '观察已采用状态读取失败');
    const adoptedIds = new Set((confirmed ?? []).map(item => item.observation_id));
    return {items: (data ?? []).map(item => ({...item, has_adopted_analysis: adoptedIds.has(item.id)}))};
  });

  app.get("/api/observations/:id", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const { data: observation, error } = await auth.data.from("observations").select("*").eq("id", id).single();
    if (error || !observation) throw new ApiError(404, "OBSERVATION_NOT_FOUND", "观察记录不存在或无权访问");
    const [{ data: evidence, error: evidenceError }, { data: analyses, error: analysisError }, { data: subjectRows, error: subjectError }, { data: responsePlans, error: responseError }, { data: observers, error: observerError }, { data: analysisJobs, error: analysisJobError }] = await Promise.all([
      auth.data.from("evidence_assets").select("*").eq("observation_id", id).order("created_at"),
      auth.data.from("analysis_runs").select("*").eq("observation_id", id).order("generated_at", { ascending: false }),
      auth.data.from("observation_subjects").select("*").eq("observation_id", id).order("role"),
      auth.data.from("response_plans").select("*").eq("observation_id", id).order("created_at"),
      observation.observer_ids?.length
        ? serviceClient.schema(config.SUPABASE_SCHEMA).from("profiles").select("user_id, display_name, role").eq("tenant_id", auth.tenantId).in("user_id", observation.observer_ids)
        : Promise.resolve({ data: [], error: null }),
      auth.data.from("analysis_jobs").select("*").eq("observation_id", id).order("created_at", { ascending: false }).limit(100),
    ]);
    if (evidenceError || analysisError || subjectError || responseError || observerError || analysisJobError) throw new ApiError(500, "OBSERVATION_DETAIL_FAILED", "观察证据、参与幼儿、观察者或分析结果读取失败");
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
      canDelete: auth.role === 'researcher' || observation.created_by === auth.userId,
      canSupplement: auth.role === 'researcher' || observation.created_by === auth.userId,
      analysisSubjectResults: mergeSubjectResults(analysisJobs ?? []),
      evidence: evidence ?? [],
      analyses: analysesWithClaims,
      subjects: (subjectRows ?? []).map((item) => ({ ...item, display_name: childMap.get(item.child_id) ?? "园内幼儿" })),
      responsePlans: responsePlans ?? [],
      observers: (observers ?? []).map((item) => ({ userId: item.user_id, displayName: item.display_name, role: item.role })),
      analysisJob: analysisJobs?.[0] ?? null,
    };
  });

  app.delete('/api/observations/:id',async(request) => {
    const auth=await authenticate(request);
    const {id}=z.object({id:uuid}).parse(request.params);
    const {data:visible,error:readError}=await auth.data.from('observations').select('id,classroom_id').eq('id',id).maybeSingle();
    if(readError) throw new ApiError(500,'OBSERVATION_LOOKUP_FAILED','观察记录读取失败');
    if(!visible) throw new ApiError(404,'OBSERVATION_NOT_FOUND','观察记录不存在或无权访问');
    const schema=serviceClient.schema(config.SUPABASE_SCHEMA);
    const {data,error}=await schema.rpc('delete_observation',{
      target_tenant_id:auth.tenantId,target_observation_id:id,actor_user_id:auth.userId,
    });
    if(error) {
      if(error.code === 'P0002') throw new ApiError(404,'OBSERVATION_NOT_FOUND','观察记录不存在或无权访问');
      if(error.code === '42501') throw new ApiError(403,'OBSERVATION_DELETE_FORBIDDEN','教师只能删除本人创建且仍负责班级的观察，教研员可删除本园观察');
      const conflicts:Record<string,string>={
        OBSERVATION_ANALYSIS_ACTIVE:'该观察正在等待或进行AI分析，请分析结束后再删除',
        OBSERVATION_USED_IN_REPORT:'该观察已被周期报告引用，请先删除相关报告后重试',
        OBSERVATION_USED_IN_CURRICULUM:'该观察已被课程引用，请先删除相关课程后重试',
        OBSERVATION_USED_IN_RESEARCH:'该观察已被教研活动引用，请先处理相关教研活动后重试',
      };
      const conflictMessage = conflicts[error.message];
      if(error.code === 'P0001' && conflictMessage) throw new ApiError(409,error.message,conflictMessage);
      request.log.error({dbCode:error.code},'observation deletion failed');
      throw new ApiError(500,'OBSERVATION_DELETE_FAILED','观察删除失败，请稍后重试');
    }
    const pendingPaths:string[]=[];
    const blockedPaths:string[]=[];
    for(const path of data.storagePaths as string[]) {
      const prefix:string|undefined=data.storagePrefixes[path];
      const basename=prefix ? path.slice(prefix.length) : '';
      if(!prefix?.startsWith(`${auth.tenantId}/${visible.classroom_id}/`) || !path.startsWith(prefix) || !basename || basename==='.' || basename==='..' || basename.includes('/')) {blockedPaths.push(path);continue;}
      try {const {error:removeError}=await mediaStorage.remove(path);if(removeError) pendingPaths.push(path);}
      catch {pendingPaths.push(path);}
    }
    const {error:auditError}=await schema.from('audit_events').update({detail:{classroomId:visible.classroom_id,pendingStoragePaths:pendingPaths,blockedStoragePaths:blockedPaths,attachmentCount:data.storagePaths.length}})
      .eq('id',data.auditId).eq('tenant_id',auth.tenantId);
    if(auditError || pendingPaths.length || blockedPaths.length) request.log.warn({auditId:data.auditId,pendingAttachments:pendingPaths.length,blockedAttachments:blockedPaths.length,auditCode:auditError?.code},'observation deleted; attachment cleanup requires attention');
    return {ok:true,warning:blockedPaths.length ? '观察记录已删除；部分附件路径异常，已跳过并记录，请管理员核验' : pendingPaths.length ? '观察记录已删除；部分附件待清理，已记录待办供管理员处理' : null};
  });

  app.get("/api/analysis-jobs/:id", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const { data, error } = await auth.data.from("analysis_jobs").select("*").eq("id", id).maybeSingle();
    if (error) throw new ApiError(500, "ANALYSIS_JOB_READ_FAILED", "AI分析任务读取失败");
    if (!data) throw new ApiError(404, "ANALYSIS_JOB_NOT_FOUND", "AI分析任务不存在或无权访问");
    return { item: data };
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
    const observerIds = [...new Set(input.observerIds)];
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
      observer_name_snapshot: input.observerName,
      group_context: input.groupContext || null,
      unlisted_participant_count: input.unlistedParticipantCount,
      title,
      occurred_at: input.occurredAt,
      duration_minutes: input.durationMinutes ?? null,
      scene: input.scene,
      theme: input.theme,
      organization_stage: input.organizationStage,
      observation_focus_category: input.observationFocusCategory,
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
      original_size_bytes: input.sizeBytes,
      optimization_status: "pending",
      upload_status: "pending",
      retention_until: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
      created_by: auth.userId,
    }).select().single();
    if (evidenceError) throw new ApiError(500, "EVIDENCE_CREATE_FAILED", "证据元数据创建失败");
    return reply.status(201).send({ evidenceId: evidence.id, uploadPath: `/api/evidence/${evidence.id}/upload` });
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
    const { data: objects, error: listError } = await mediaStorage.list(folder, { search: fileName, limit: 2 });
    if (listError || !objects?.some((item) => item.name === fileName)) throw new ApiError(409, "UPLOAD_NOT_FOUND", "尚未检测到已上传文件");
    const { data: originalBody, error: downloadError } = await mediaStorage.download(evidence.storage_path);
    if (downloadError || !originalBody) throw new ApiError(503, "MEDIA_OPTIMIZATION_READ_FAILED", "媒体已上传，但暂时无法进入无损优化");
    const expectedSize = evidence.original_size_bytes ?? evidence.size_bytes;
    if (expectedSize && originalBody.length !== expectedSize) {
      await mediaStorage.remove(evidence.storage_path);
      await serviceClient.schema(config.SUPABASE_SCHEMA).from("evidence_assets").update({
        upload_status: "failed", optimization_status: "failed", optimization_error: "上传文件大小与凭证不一致",
      }).eq("id", id).eq("tenant_id", auth.tenantId);
      throw new ApiError(422, "MEDIA_SIZE_MISMATCH", "上传文件不完整或与凭证不一致，原文件未保留");
    }
    let optimized;
    try {
      optimized = await optimizeMediaLosslessly(originalBody, evidence.mime_type);
    } catch (reason) {
      await mediaStorage.remove(evidence.storage_path);
      await serviceClient.schema(config.SUPABASE_SCHEMA).from("evidence_assets").update({
        upload_status: "failed", optimization_status: "failed",
        optimization_error: reason instanceof Error ? reason.message.slice(0, 1000) : "媒体优化失败",
      }).eq("id", id).eq("tenant_id", auth.tenantId);
      throw new ApiError(422, "MEDIA_OPTIMIZATION_FAILED", "媒体无损优化失败，原文件未保留，请检查文件是否完整后重新上传");
    }
    const { error: optimizedUploadError } = await mediaStorage.upload(evidence.storage_path, optimized.body, {
      contentType: optimized.mimeType, cacheControl: "3600", upsert: true,
    });
    if (optimizedUploadError) throw new ApiError(503, "MEDIA_OPTIMIZATION_SAVE_FAILED", "媒体无损优化已完成，但优化文件暂时无法保存");
    const { data: updated, error } = await serviceClient
      .schema(config.SUPABASE_SCHEMA)
      .from("evidence_assets")
      .update({
        upload_status: "ready", size_bytes: optimized.optimizedSizeBytes,
        original_size_bytes: optimized.originalSizeBytes, optimized_size_bytes: optimized.optimizedSizeBytes,
        optimization_status: optimized.status, optimization_mode: optimized.mode,
        optimization_tool: optimized.tool, optimization_error: null, optimized_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("tenant_id", auth.tenantId)
      .select()
      .single();
    if (error) throw new ApiError(500, "EVIDENCE_CONFIRM_FAILED", "证据确认失败");
    await audit(auth, "evidence.uploaded", "evidence", id, {
      observationId: evidence.observation_id, mimeType: evidence.mime_type,
      originalSizeBytes: optimized.originalSizeBytes, optimizedSizeBytes: optimized.optimizedSizeBytes,
      optimizationMode: optimized.mode, uploadChannel: "legacy-signed-complete",
    });
    return { item: updated };
  });

  app.post(
    "/api/evidence/:id/upload",
    { bodyLimit: 100 * 1024 * 1024 },
    async (request) => {
      const auth = await authenticate(request);
      const { id } = z.object({ id: uuid }).parse(request.params);
      if ((!Buffer.isBuffer(request.body)&&!(request.body instanceof Readable))||(Buffer.isBuffer(request.body)&&request.body.length===0)) {
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
      if (Buffer.isBuffer(request.body)&&request.body.length !== evidence.size_bytes) {
        throw new ApiError(422, "MEDIA_SIZE_MISMATCH", "上传文件大小与凭证不一致");
      }
      if (Number(evidence.size_bytes) > media.max) {
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

      const directory=await mkdtemp(join(tmpdir(),'tongji-evidence-'));
      const input=join(directory,`input.${media.ext}`),output=join(directory,`output.${media.ext}`);
      const startedAt=Date.now();
      try{
      const source=Buffer.isBuffer(request.body)?Readable.from([request.body]):request.body as Readable;
      try{await pipeline(boundedUploadStream(source,Number(evidence.size_bytes),media.max),createWriteStream(input));}
      catch(reason){
        await serviceClient.schema(config.SUPABASE_SCHEMA).from('evidence_assets').update({upload_status:'failed',optimization_status:'failed',optimization_error:'上传文件不完整或超过登记大小，文件未保存，请重新选择该文件上传。'}).eq('id',id).eq('tenant_id',auth.tenantId).eq('upload_status','pending');
        throw new ApiError(422,'MEDIA_SIZE_MISMATCH',reason instanceof Error?reason.message:'上传文件不完整，请重试');
      }
      const transferredAt=Date.now();
      let optimized;
      try {
        optimized = await optimizeMediaFileLosslessly(input, evidence.mime_type,output);
      } catch (reason) {
        await serviceClient.schema(config.SUPABASE_SCHEMA).from("evidence_assets").update({
          upload_status: "failed", optimization_status: "failed",
          optimization_error: reason instanceof Error ? reason.message.slice(0, 1000) : "媒体优化失败",
        }).eq("id", id).eq("tenant_id", auth.tenantId);
        request.log.warn({ err: reason, evidenceId: id, mimeType: evidence.mime_type }, "lossless media optimization failed");
        throw new ApiError(422, "MEDIA_OPTIMIZATION_FAILED", "媒体无损优化失败，原文件未写入存储，请检查文件是否完整后重新上传");
      }

      const optimizedAt=Date.now();
      const { error: uploadError } = await mediaStorage.uploadStream(evidence.storage_path,createReadStream(optimized.path), {
          contentType: optimized.mimeType,
          cacheControl: "3600",
          upsert: false,
          sizeBytes:optimized.optimizedSizeBytes,
        });
      if (uploadError) {
        request.log.error({ err: uploadError, evidenceId: id }, "evidence storage upload failed");
        throw new ApiError(500, "MEDIA_UPLOAD_FAILED", "媒体文件写入存储失败");
      }

      const { data: updated, error: updateError } = await serviceClient
        .schema(config.SUPABASE_SCHEMA)
        .from("evidence_assets")
        .update({
          upload_status: "ready", size_bytes: optimized.optimizedSizeBytes,
          original_size_bytes: optimized.originalSizeBytes, optimized_size_bytes: optimized.optimizedSizeBytes,
          optimization_status: optimized.status, optimization_mode: optimized.mode,
          optimization_tool: optimized.tool, optimization_error: null, optimized_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("tenant_id", auth.tenantId)
        .select()
        .single();
      if (updateError) {
        const {data:stillExists,error:readError}=await serviceClient.schema(config.SUPABASE_SCHEMA)
          .from('evidence_assets').select('id').eq('id',id).eq('tenant_id',auth.tenantId).maybeSingle();
        if(!readError && !stillExists) {
          const {error:cleanupError}=await mediaStorage.remove(evidence.storage_path);
          if(cleanupError) request.log.warn({evidenceId:id},'deleted observation upload cleanup failed');
          throw new ApiError(410,'OBSERVATION_DELETED','观察记录已被删除，本次媒体不再保存，请勿重复上传');
        }
        throw new ApiError(500, "EVIDENCE_CONFIRM_FAILED", "媒体已上传，但证据状态确认失败");
      }

      await audit(auth, "evidence.uploaded", "evidence", id, {
        observationId: evidence.observation_id,
        mimeType: evidence.mime_type,
        originalSizeBytes: optimized.originalSizeBytes,
        optimizedSizeBytes: optimized.optimizedSizeBytes,
        optimizationMode: optimized.mode,
        uploadChannel: "api-proxy",
      });
      request.log.info({evidenceId:id,transferMs:transferredAt-startedAt,optimizationMs:optimizedAt-transferredAt,storageMs:Date.now()-optimizedAt,sizeBytes:optimized.optimizedSizeBytes,keptOriginal:optimized.status==='not_applicable'},'evidence upload phases completed');
      return { item: updated };
      }finally{await rm(directory,{recursive:true,force:true});}
    },
  );

  app.get("/api/evidence/:id/download", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const { data: evidence, error: evidenceError } = await auth.data.from("evidence_assets").select("storage_path, upload_status").eq("id", id).maybeSingle();
    if (evidenceError) throw new ApiError(500, "EVIDENCE_LOOKUP_FAILED", "证据读取失败");
    if (!evidence?.storage_path || evidence.upload_status !== "ready") throw new ApiError(404, "EVIDENCE_NOT_READY", "证据不存在或尚未上传完成");
    const { data, error } = await mediaStorage.createSignedUrl(evidence.storage_path, 300);
    if (error || !data) throw new ApiError(500, "DOWNLOAD_URL_FAILED", "证据查看链接创建失败");
    return { url: data.signedUrl, expiresIn: 300 };
  });

  app.patch('/api/observations/:id/subjects/:childId/supplement', async request => {
    const auth = await authenticate(request);
    const {id, childId} = z.object({id: uuid, childId: uuid}).parse(request.params);
    const input = z.object({additionalObservation: z.string().trim().max(6000), contextualFeature: z.string().trim().max(500), evidenceAnchors: z.array(z.string().trim().min(1).max(160)).max(20)}).refine(value => value.additionalObservation || value.contextualFeature || value.evidenceAnchors.length, {message: '请补充观察事实或媒体定位'}).parse(request.body);
    const {data: visible, error: readError} = await auth.data.from('observations').select('id').eq('id', id).maybeSingle();
    if (readError) throw new ApiError(500, 'OBSERVATION_LOOKUP_FAILED', '观察记录读取失败');
    if (!visible) throw new ApiError(404, 'OBSERVATION_NOT_FOUND', '观察记录不存在或无权访问');
    const {data, error} = await serviceClient.schema(config.SUPABASE_SCHEMA).rpc('supplement_observation_subject', {
      target_tenant_id: auth.tenantId, target_observation_id: id, target_child_id: childId, actor_user_id: auth.userId,
      target_additional_observation: input.additionalObservation, target_contextual_feature: input.contextualFeature, target_evidence_anchors: input.evidenceAnchors,
    });
    if (error) {
      if (error.code === '42501') throw new ApiError(403, 'SUPPLEMENT_FORBIDDEN', '仅观察创建教师或本园教研员可以补充这份观察');
      if (error.code === 'P0002') throw new ApiError(404, 'SUBJECT_NOT_FOUND', '观察或参与幼儿不存在');
      if (error.code === 'P0001') throw new ApiError(409, 'OBSERVATION_ANALYSIS_ACTIVE', '本观察正在分析，请结束后再补充，避免改变分析中的证据');
      if (error.code === '22023') throw new ApiError(422, 'SUPPLEMENT_INVALID', '补充内容超出长度限制或没有实际内容');
      throw new ApiError(500, 'SUPPLEMENT_SAVE_FAILED', '补充观察保存失败，请重试');
    }
    return {item: data};
  });

  app.post("/api/observations/:id/analyze", { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } }, async (request, reply) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const {childIds} = z.object({childIds: z.array(uuid).min(1).max(30).refine(ids => new Set(ids).size === ids.length).optional()}).parse(request.body ?? {});
    const { data: observation, error: observationError } = await auth.data.from("observations").select("*").eq("id", id).maybeSingle();
    if (observationError) throw new ApiError(500, "OBSERVATION_LOOKUP_FAILED", "观察记录读取失败");
    if (!observation) throw new ApiError(404, "OBSERVATION_NOT_FOUND", "观察记录不存在或无权访问");
    if (observation.status === "draft") throw new ApiError(409, "OBSERVATION_NOT_SUBMITTED", "请先提交教师观察、识别和应答");
    const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
    const { data: activeJob, error: activeJobError } = await auth.data.from("analysis_jobs").select("*")
      .eq("observation_id", id).in("status", ["queued", "processing"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (activeJobError) throw new ApiError(500, "ANALYSIS_JOB_READ_FAILED", "AI分析任务状态读取失败");
    if (activeJob) return reply.status(202).send({ item: activeJob });
    const {data: queued, error: jobError} = await schema.rpc('create_subject_analysis_job', {
      target_tenant_id: auth.tenantId, target_observation_id: id, actor_user_id: auth.userId, target_child_ids: childIds ?? null,
    });
    if (jobError || !queued?.item) {
      if (jobError?.code === '22023') throw new ApiError(422, 'ANALYSIS_SUBJECT_INVALID', '只能选择本观察中不重复的参与幼儿');
      if (jobError?.code === '42501') throw new ApiError(403, 'ANALYSIS_FORBIDDEN', '无权分析这份观察');
      if (jobError?.code === 'P0002') throw new ApiError(404, 'OBSERVATION_NOT_FOUND', '观察记录不存在');
      throw new ApiError(500, 'ANALYSIS_JOB_CREATE_FAILED', 'AI分析任务创建失败');
    }
    const job = queued.item;
    if (!queued.created) return reply.status(202).send({item: job});
    reply.status(202).send({ item: job });

    const updateJob = async (value: Record<string, unknown>) => {
      const { error } = await schema.from("analysis_jobs").update({ ...value, heartbeat_at: new Date().toISOString() })
        .eq("id", job.id).eq("tenant_id", auth.tenantId);
      if (error) request.log.warn({ dbError: error, analysisJobId: job.id }, "analysis job progress update failed");
    };
    let taskSubjectResults = subjectResults(job.subject_results);
    const createdRunIds: string[] = [];
    enqueueAnalysisTask(async () => {
      await updateJob({ status: "processing", stage: "preparing", progress: 3, attempt_count: 1, started_at: new Date().toISOString() });
      try {
    const [{ data: classroom, error: classroomError }, { data: evidence, error: evidenceError }, { data: allSubjectRows, error: subjectError }, { data: professionalMemories, error: memoryError }, { data: frameworkRows, error: frameworkError }] = await Promise.all([
      schema.from("classrooms").select("id, grade").eq("tenant_id", auth.tenantId).eq("id", observation.classroom_id).single(),
      schema.from("evidence_assets").select("id, evidence_type, transcript, event_segments, upload_status, storage_path, mime_type").eq("tenant_id", auth.tenantId).eq("observation_id", id).eq("upload_status", "ready"),
      schema.from("observation_subjects").select("*").eq("tenant_id", auth.tenantId).eq("observation_id", id).order("role"),
      schema.from("professional_memories").select("id, memory_type, summary, retrieval_text, applicability, quality_score").eq("tenant_id", auth.tenantId).eq("status", "active").order("quality_score", { ascending: false }).limit(24),
      schema.from("analysis_framework_versions").select("id, framework_type, name, version, description, dimensions").eq("tenant_id", auth.tenantId).eq("status", "active").eq("is_default", true).order("framework_type"),
    ]);
    if (classroomError || evidenceError || subjectError || memoryError || frameworkError) throw new ApiError(500, "ANALYSIS_CONTEXT_READ_FAILED", "AI分析上下文读取失败");
    const requestedIds = new Set(taskSubjectResults.map(item => item.childId));
    const subjectRows = (allSubjectRows ?? []).filter(item => requestedIds.has(item.child_id));
    if (!classroom || !subjectRows.length) throw new ApiError(422, "ANALYSIS_CONTEXT_MISSING", "班级或观察幼儿信息不完整");
    const subjectIds = (allSubjectRows ?? []).map((item) => item.child_id);
    const { data: children, error: childError } = await schema.from("children").select("id, display_name, birth_month, guardian_consent_status").eq("tenant_id", auth.tenantId).in("id", subjectIds);
    if (childError || (children ?? []).length !== subjectIds.length) throw new ApiError(500, "ANALYSIS_CHILDREN_READ_FAILED", "观察幼儿信息读取失败");
    const { data: knowledge, error: knowledgeError } = await schema.from("knowledge_cards").select("*")
      .or(`tenant_id.eq.${auth.tenantId},tenant_id.is.null`)
      .eq("grade", classroom.grade).eq("status", "active").limit(200);
    if (knowledgeError || !knowledge?.length) throw new ApiError(409, "KNOWLEDGE_NOT_READY", "当前班级年龄段知识库尚未初始化");
    await updateJob({ stage: "context_ready", progress: 18 });
    const analysisPrompt = await resolveTenantPrompt(auth.tenantId, "observation_analysis");
    const analyses: any[] = [];
    const notices = new Set<string>();
      for (const [subjectIndex, subject] of subjectRows.entries()) {
        const child = (children ?? []).find((item) => item.id === subject.child_id)!;
        let currentRunId: string | null = null;
        taskSubjectResults = replaceSubjectResult(taskSubjectResults, {childId: child.id, status: 'processing', explanation: '', missingInformation: [], analysisRunId: null});
        try {
        await updateJob({
          stage: "analyzing_subject",
          subject_results: taskSubjectResults,
          progress: Math.round(22 + (subjectIndex / subjectRows.length) * 62),
        });
        const { data: historySubjects, error: historySubjectError } = await schema.from("observation_subjects").select("observation_id").eq("tenant_id", auth.tenantId).eq("child_id", child.id).neq("observation_id", id).order("created_at", { ascending: false }).limit(24);
        if (historySubjectError) throw new ApiError(500, "ANALYSIS_HISTORY_READ_FAILED", "历史观察关联读取失败");
        const historyIds = (historySubjects ?? []).map((item) => item.observation_id);
        const { data: historicalObservations, error: historyError } = historyIds.length
          ? await schema.from("observations").select("id, occurred_at, scene, theme, teacher_observation, child_quote, teacher_identification, teacher_response")
            .eq("tenant_id", auth.tenantId).in("id", historyIds).lt("occurred_at", observation.occurred_at).order("occurred_at", { ascending: true }).limit(12)
          : { data: [], error: null };
        if (historyError) throw new ApiError(500, "ANALYSIS_HISTORY_READ_FAILED", "历史观察证据读取失败");
        const historicalIds = (historicalObservations ?? []).map((item) => item.id);
        const { data: historicalAnalyses, error: historicalAnalysisError } = historicalIds.length
          ? await schema.from("analysis_runs").select("*").eq("tenant_id", auth.tenantId).in("observation_id", historicalIds).eq("child_id", child.id).eq("decision", "adopted").order("generated_at", { ascending: false })
          : { data: [], error: null };
        if (historicalAnalysisError) throw new ApiError(500, "ANALYSIS_HISTORY_READ_FAILED", "历史分析证据读取失败");
        const historicalAnalysisIds = (historicalAnalyses ?? []).map((item) => item.id);
        const { data: historicalReviews, error: historicalReviewError } = historicalAnalysisIds.length
          ? await schema.from("analysis_claim_reviews").select("*").eq("tenant_id", auth.tenantId).in("analysis_run_id", historicalAnalysisIds)
          : { data: [], error: null };
        if (historicalReviewError) throw new ApiError(500, "ANALYSIS_HISTORY_REVIEW_READ_FAILED", "历史审核结论读取失败");
        const latestAnalysisByObservation = new Map<string, any>();
        for (const analysis of historicalAnalyses ?? []) if (!latestAnalysisByObservation.has(analysis.observation_id)) latestAnalysisByObservation.set(analysis.observation_id, analysis);
        const adoptedHistoryIds = new Set((historicalAnalyses ?? []).map(item => item.observation_id));
        const history = (historicalObservations ?? []).filter(item => adoptedHistoryIds.has(item.id)).map((item) => {
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
        let mediaExclusionReason='';
        const visualEvidence=(evidence??[]).filter(item=>['photo','video'].includes(item.evidence_type)&&item.storage_path);
        if(visualEvidence.length&&child.guardian_consent_status!=='granted')mediaExclusionReason='该幼儿尚未取得完整监护授权，媒体未发送给AI。';
        else if(visualEvidence.length&&(config.AI_MODE!=='qianwen'||!config.qwenMediaAnalysisEnabled||config.QWEN_MAX_MEDIA===0))mediaExclusionReason='本次服务未启用媒体画面分析，仅使用教师文字。';
        if (config.AI_MODE === "qianwen" && config.qwenMediaAnalysisEnabled && child.guardian_consent_status === "granted") {
          const candidates = (evidence ?? []).filter((item) => ["photo", "video"].includes(item.evidence_type) && item.storage_path).slice(0, config.QWEN_MAX_MEDIA);
          const signed = await Promise.all(candidates.map(async (item) => {
            const { data } = await mediaStorage.createSignedUrl(item.storage_path, 900);
            if (!data?.signedUrl) return null;
            return { id: item.id, evidenceType: item.evidence_type as "photo" | "video", mimeType: item.mime_type || (item.evidence_type === "video" ? "video/mp4" : "image/jpeg"), signedUrl: data.signedUrl } satisfies MediaForAnalysis;
          }));
          media = signed.filter((item): item is MediaForAnalysis => item !== null);
          if(media.length<candidates.length)mediaExclusionReason='部分私有媒体链接创建失败，未成功提供的画面不作为分析证据。';
        }
        const observationForChild = {
          ...observation,
          teacher_observation: anonymizeSubjectNames(observation.teacher_observation, children ?? [], child.id),
          subject_count: (allSubjectRows ?? []).length,
          subject_identification_cues: uniqueSubjectCues(subject.contextual_feature || '', (allSubjectRows ?? []).filter(other => other.child_id !== child.id).map(other => other.contextual_feature || '')),
          subject_additional_observation: anonymizeSubjectNames(subject.additional_observation || '', children ?? [], child.id),
          subject_context: subject.contextual_feature || "未补充本次个体情境特征",
          subject_role: subject.role,
          subject_evidence_anchors: subject.evidence_anchors ?? [],
        };
        const rankedMemories: ProfessionalMemoryForAnalysis[] = ((professionalMemories ?? []) as any[])
          .slice()
          .sort((left: any, right: any) => {
            const leftChild = left.applicability?.childId === child.id ? 1 : 0;
            const rightChild = right.applicability?.childId === child.id ? 1 : 0;
            const leftClass = left.applicability?.classroomId === observation.classroom_id ? 1 : 0;
            const rightClass = right.applicability?.classroomId === observation.classroom_id ? 1 : 0;
            const leftTheme = Array.isArray(left.applicability?.themes) && left.applicability.themes.some((theme: string) => observation.theme.includes(theme) || theme.includes(observation.theme)) ? 1 : 0;
            const rightTheme = Array.isArray(right.applicability?.themes) && right.applicability.themes.some((theme: string) => observation.theme.includes(theme) || theme.includes(observation.theme)) ? 1 : 0;
            const leftGrade = Array.isArray(left.applicability?.grades) && left.applicability.grades.includes(classroom.grade) ? 1 : 0;
            const rightGrade = Array.isArray(right.applicability?.grades) && right.applicability.grades.includes(classroom.grade) ? 1 : 0;
            return (rightChild * 3 + rightClass * 2 + rightTheme * 2 + rightGrade + Number(right.quality_score)) - (leftChild * 3 + leftClass * 2 + leftTheme * 2 + leftGrade + Number(left.quality_score));
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
          peerAnalysisSummaries: analyses.map((item) => ({
            subjectRole: item.subject?.role ?? "participant",
            subjectContext: item.subject?.contextual_feature ?? "",
            currentExperience: item.structured_result?.currentExperience ?? "",
            responseTitles: (item.structured_result?.responsePlans ?? []).map((plan: any) => plan.title),
          })),
          prompt: analysisPrompt,
        });
        notices.add(generated.notice);
        if (generated.fallbackReason) request.log.warn({ observationId: observation.id, childId: child.id, fallbackReason: generated.fallbackReason }, "AI provider used safe fallback");
        const structuredResult = generated.data;
        if(mediaExclusionReason)structuredResult.warnings=[...new Set([mediaExclusionReason,...structuredResult.warnings])].slice(0,8);
        request.log.info({analysisJobId:job.id,observationId:id,childId:child.id,model:generated.model,mediaCount:media.length,diagnostics:generated.diagnostics},'child analysis phases completed');
        const matchedCodes = [...structuredResult.developmentReferences.map((item) => item.indicatorCode), ...structuredResult.domainExperiences.flatMap((item) => item.indicatorCodes)];
        const matchedCards = (knowledge as KnowledgeRow[]).filter((card) => matchedCodes.includes(card.code));
        const now = new Date().toISOString();
        const { data: analysis, error } = await schema.from("analysis_runs").insert({
          tenant_id: auth.tenantId, classroom_id: observation.classroom_id, child_id: child.id,
          observation_id: observation.id, provider: generated.provider, model: generated.model,
          analysis_job_id: job.id,
          prompt_version: generated.promptVersion, knowledge_version: "guide-cn-2012.v1.0.0",
          input_snapshot: {
            observation: observationForChild, subject: { role: subject.role, contextualFeature: subject.contextual_feature, evidenceAnchors: subject.evidence_anchors },
            child, classroom, evidence: (evidence ?? []).map(({ storage_path: _storagePath, ...item }) => item),
            mediaAnalyzed: generated.mediaAnalyzed,
            mediaExclusionReason:mediaExclusionReason||undefined,
            diagnostics:generated.diagnostics,
            history: history.map(({ adopted_analysis, ...item }) => ({ ...item, adoptedAnalysisIncluded: Boolean(adopted_analysis) })),
            professionalMemoryIds: rankedMemories.map((item) => item.id),
            analysisFrameworkVersionIds: (frameworkRows ?? []).map((item) => item.id),
            generatedAt: now,
          },
          knowledge_card_ids: matchedCards.map((card) => card.id), structured_result: structuredResult,
          risk_flags: structuredResult.warnings, generated_by: auth.userId,
        }).select().single();
        if (error) throw new ApiError(500, "AI_ANALYSIS_SAVE_FAILED", `${child.display_name}的AI分析结果保存失败`);
        currentRunId = analysis.id;
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
        createdRunIds.push(analysis.id);
        taskSubjectResults = replaceSubjectResult(taskSubjectResults, {childId: child.id, status: 'completed', explanation: '已生成待教师审核的个人分析。', missingInformation: [], analysisRunId: analysis.id});
        analyses.push({ ...analysis, subject: { ...subject, display_name: child.display_name } });
        await updateJob({
          stage: "saving_subject",
          progress: Math.round(22 + ((subjectIndex + 1) / subjectRows.length) * 62),
          analysis_run_ids: createdRunIds,
          subject_results: taskSubjectResults,
        });
        } catch (reason) {
          if (currentRunId) {
            await schema.from('response_plans').delete().eq('analysis_run_id', currentRunId).eq('tenant_id', auth.tenantId);
            await schema.from('analysis_runs').delete().eq('id', currentRunId).eq('tenant_id', auth.tenantId);
          }
          if (reason instanceof InsufficientObservationEvidenceError) {
            taskSubjectResults = replaceSubjectResult(taskSubjectResults, {childId: child.id, status: 'needs_more_evidence', explanation: reason.reason, missingInformation: reason.missingInformation, analysisRunId: null});
            request.log.info({analysisJobId: job.id, observationId: id, childId: child.id}, 'subject requires more observation evidence');
          } else {
            const explanation = reason instanceof ApiError ? reason.message : reason instanceof QwenRequestError && reason.message === '千问请求超时'
              ? '该幼儿的AI请求超时，可单独重试。' : reason instanceof QwenRequestError && reason.message.startsWith('千问结构化输出未通过业务校验')
              ? '该幼儿的AI草稿内容未通过校验，可单独重试。' : '该幼儿的AI分析暂时失败，可单独重试。';
            taskSubjectResults = replaceSubjectResult(taskSubjectResults, {childId: child.id, status: 'failed', explanation, missingInformation: [], analysisRunId: null});
            request.log.error({err: reason, analysisJobId: job.id, observationId: id, childId: child.id}, 'individual AI analysis failed');
          }
          await updateJob({stage: 'saving_subject', progress: Math.round(22 + ((subjectIndex + 1) / subjectRows.length) * 62), subject_results: taskSubjectResults, analysis_run_ids: createdRunIds});
        }
      }
    if (analyses.length) {
      const {error: statusError} = await schema.from('observations').update({status: 'ai_ready'}).eq('id', observation.id).eq('tenant_id', auth.tenantId);
      if (statusError) throw new ApiError(500, 'AI_ANALYSIS_STATE_FAILED', '已生成个人分析，但观察状态更新失败，请刷新后查看');
    }
    const missingCount = taskSubjectResults.filter(item => item.status === 'needs_more_evidence').length;
    const failedCount = taskSubjectResults.filter(item => item.status === 'failed').length;
    await audit(auth, 'analysis.processed', 'observation', observation.id, {observationId: id, analysisRunIds: createdRunIds, missingChildIds: taskSubjectResults.filter(item => item.status === 'needs_more_evidence').map(item => item.childId), failedChildIds: taskSubjectResults.filter(item => item.status === 'failed').map(item => item.childId)});
    await updateJob({
      status: !analyses.length && failedCount ? 'failed' : 'completed',
      stage: !analyses.length && failedCount ? 'failed' : missingCount || failedCount ? (analyses.length ? 'partially_completed' : 'needs_more_evidence') : 'completed',
      progress: 100, analysis_run_ids: createdRunIds, subject_results: taskSubjectResults,
      ai_notice: `${analyses.length}名幼儿已生成分析；${missingCount}名待补充资料；${failedCount}名可单独重试。${[...notices].join('；')}`,
      error_code: !analyses.length && failedCount ? 'AI_SUBJECT_ANALYSIS_FAILED' : null,
      error_message: !analyses.length && failedCount ? '部分幼儿分析失败，具体原因请查看逐名结果。' : null,
      completed_at: new Date().toISOString(),
    });
      } catch (reason) {
        const error = reason instanceof ApiError
          ? reason
          : new ApiError(502, "AI_ANALYSIS_FAILED", reason instanceof Error ? reason.message : "AI分析暂时不可用");
        request.log.error({ err: reason, observationId: id, analysisJobId: job.id }, "background AI analysis job failed");
        await updateJob({
          status: "failed", stage: "failed", progress: 100,
          subject_results: taskSubjectResults, analysis_run_ids: createdRunIds,
          error_code: error.code, error_message: error.message, completed_at: new Date().toISOString(),
        });
      }
    });
    return reply;
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
    if (input.decision === 'adopted' && hasPlaceholderSupport(analysis.structured_result)) {
      throw new ApiError(409, 'AI_ANALYSIS_OUTPUT_INVALID', '本版应答含无效步骤或提问，请生成新版本并核对后再采用');
    }
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
