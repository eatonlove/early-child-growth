import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { KnowledgeRow } from "../ai/contracts.js";
import { createAIProvider } from "../ai/provider.js";
import { effectiveAnalysisResult, flattenAnalysisClaims } from "../analysis-claims.js";
import { config } from "../config.js";
import {
  documentMimeTypes,
  extractDocumentText,
  generateBlankObservationTemplate,
  generateCurriculumDocument,
  generateObservationDocument,
} from "../documents.js";
import { ApiError, audit, authenticate, requireResearcher } from "../http.js";
import { publicSupabaseUrl, serviceClient } from "../supabase.js";

const uuid = z.string().uuid();
const aiProvider = createAIProvider({
  mode: config.AI_MODE,
  apiKey: config.qwenApiKey,
  baseUrl: config.QWEN_BASE_URL,
  textModel: config.QWEN_TEXT_MODEL,
  visionModel: config.QWEN_VISION_MODEL,
  timeoutMs: config.QWEN_TIMEOUT_MS,
  fallbackToSimulated: config.aiFallbackToSimulated,
});

const importMimeTypes = new Map([
  [documentMimeTypes.docx, "docx"],
  [documentMimeTypes.doc, "doc"],
  [documentMimeTypes.pdf, "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
]);

const sectionClaimTypes: Record<string, string[]> = {
  objective: ["objective_summary", "fact"],
  game_experience: ["game_experience", "current_experience", "interpretation", "historical_change"],
  domains: ["domain_experience", "development_reference"],
  dispositions: ["learning_disposition", "interest_strength"],
  possibilities: ["learning_possibility", "game_possibility", "hypothesis", "evidence_gap"],
  response: ["response_plan", "response_suggestion"],
  observation: ["observation_cut", "observation_focus", "next_observation"],
};

const frameworkDimensions = {
  game_experience: ["计划与意图", "材料使用", "角色与情节", "问题解决", "合作协商", "规则与自我调节", "表达与回顾"],
  learning_disposition: ["好奇与探究", "主动性", "专注与坚持", "想象与创造", "合作", "反思与调整"],
} as const;

const safeFileName = (value: string) => value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120);

async function createDocumentExportRequest(auth: Awaited<ReturnType<typeof authenticate>>, input: {
  classroomId: string;
  exportType: "observation_record" | "curriculum_plan";
  documentType: "observation_teacher" | "observation_professional" | "curriculum_plan";
  resourceType: "observation" | "curriculum_plan";
  resourceId: string;
  purpose: string;
  recipient: string;
  fileName: string;
  contentSnapshot: Record<string, unknown>;
}) {
  const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
  const { data: requestRow, error: requestError } = await schema.from("export_requests").insert({
    tenant_id: auth.tenantId,
    classroom_id: input.classroomId,
    requested_by: auth.userId,
    export_type: input.exportType,
    resource_type: input.resourceType,
    resource_id: input.resourceId,
    purpose: input.purpose,
    recipient: input.recipient,
    anonymized: false,
  }).select().single();
  if (requestError) throw new ApiError(500, "DOCUMENT_EXPORT_REQUEST_FAILED", "Word导出申请创建失败");
  const { data: documentExport, error: exportError } = await schema.from("document_exports").insert({
    tenant_id: auth.tenantId,
    classroom_id: input.classroomId,
    export_request_id: requestRow.id,
    document_type: input.documentType,
    resource_type: input.resourceType,
    resource_id: input.resourceId,
    template_version: input.documentType === "curriculum_plan" ? "tongsheng-course.v1" : "observation-record.v1",
    content_snapshot: input.contentSnapshot,
    file_name: safeFileName(input.fileName),
    status: "pending_approval",
    created_by: auth.userId,
  }).select().single();
  if (exportError) {
    await schema.from("export_requests").delete().eq("id", requestRow.id);
    throw new ApiError(500, "DOCUMENT_EXPORT_CREATE_FAILED", "Word导出任务创建失败");
  }
  return { request: requestRow, documentExport };
}

export async function materializeApprovedDocumentExport(exportRequestId: string) {
  const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
  const { data: item, error } = await schema.from("document_exports").select("*").eq("export_request_id", exportRequestId).maybeSingle();
  if (error) throw new Error("Word导出任务读取失败");
  if (!item || item.status === "ready") return item;
  let buffer: Buffer;
  if (item.document_type === "curriculum_plan") {
    buffer = await generateCurriculumDocument(item.content_snapshot as any);
  } else {
    buffer = await generateObservationDocument(item.content_snapshot as any);
  }
  const path = `${item.tenant_id}/${item.classroom_id}/exports/${item.id}/${safeFileName(item.file_name || "同迹文档.docx")}`;
  const { error: uploadError } = await serviceClient.storage.from(config.SUPABASE_STORAGE_BUCKET).upload(path, buffer, {
    contentType: documentMimeTypes.docx,
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadError) {
    await schema.from("document_exports").update({ status: "failed" }).eq("id", item.id);
    throw new Error("Word文件写入存储失败");
  }
  const { data: updated, error: updateError } = await schema.from("document_exports").update({ storage_path: path, status: "ready" }).eq("id", item.id).select().single();
  if (updateError) throw new Error("Word文件状态保存失败");
  return updated;
}

export async function evolutionRoutes(app: FastifyInstance) {
  app.get("/api/observation-template/document", async (request, reply) => {
    await authenticate(request);
    const buffer = await generateBlankObservationTemplate();
    return reply
      .header("Content-Type", documentMimeTypes.docx)
      .header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent("同迹游戏观察记录表模板.docx")}`)
      .send(buffer);
  });

  app.post("/api/observation-imports", async (request, reply) => {
    const auth = await authenticate(request);
    const input = z.object({
      classroomId: uuid,
      fileName: z.string().trim().min(1).max(180),
      mimeType: z.string().trim().min(1).max(160),
      sizeBytes: z.number().int().min(1).max(10 * 1024 * 1024),
    }).parse(request.body);
    const extension = importMimeTypes.get(input.mimeType) ?? (input.fileName.toLowerCase().endsWith(".docx") ? "docx" : input.fileName.toLowerCase().endsWith(".doc") ? "doc" : undefined);
    if (!extension) throw new ApiError(422, "UNSUPPORTED_OBSERVATION_DOCUMENT", "观察表支持DOCX、DOC、PDF、JPG和PNG");
    const { data: classroom, error: classroomError } = await auth.data.from("classrooms").select("id").eq("id", input.classroomId).maybeSingle();
    if (classroomError) throw new ApiError(500, "CLASSROOM_LOOKUP_FAILED", "班级读取失败");
    if (!classroom) throw new ApiError(404, "CLASSROOM_NOT_FOUND", "班级不存在或无权访问");
    const id = randomUUID();
    const path = `${auth.tenantId}/${input.classroomId}/imports/${id}.${extension}`;
    const { data, error } = await auth.data.from("observation_imports").insert({
      id,
      tenant_id: auth.tenantId,
      classroom_id: input.classroomId,
      source_file_name: input.fileName,
      source_mime_type: input.mimeType,
      source_size_bytes: input.sizeBytes,
      storage_path: path,
      created_by: auth.userId,
    }).select().single();
    if (error) throw new ApiError(error.code === "42501" ? 403 : 500, "OBSERVATION_IMPORT_CREATE_FAILED", "观察表导入任务创建失败");
    return reply.status(201).send({ item: data });
  });

  app.post("/api/observation-imports/:id/upload", { bodyLimit: 10 * 1024 * 1024 }, async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) throw new ApiError(422, "EMPTY_DOCUMENT_UPLOAD", "上传的观察表为空");
    const { data: item, error: readError } = await auth.data.from("observation_imports").select("*").eq("id", id).maybeSingle();
    if (readError) throw new ApiError(500, "OBSERVATION_IMPORT_READ_FAILED", "观察表导入任务读取失败");
    if (!item?.storage_path) throw new ApiError(404, "OBSERVATION_IMPORT_NOT_FOUND", "观察表导入任务不存在或无权访问");
    if (item.status !== "pending_upload") throw new ApiError(409, "OBSERVATION_IMPORT_NOT_PENDING", "观察表已经上传或正在处理");
    if (request.body.length !== Number(item.source_size_bytes)) throw new ApiError(422, "DOCUMENT_SIZE_MISMATCH", "上传文件大小与登记信息不一致");
    const { error: uploadError } = await serviceClient.storage.from(config.SUPABASE_STORAGE_BUCKET).upload(item.storage_path, request.body, {
      contentType: item.source_mime_type,
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) throw new ApiError(500, "OBSERVATION_DOCUMENT_UPLOAD_FAILED", "观察表文件写入存储失败");
    const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
    await schema.from("observation_imports").update({ status: "extracting" }).eq("id", id).eq("tenant_id", auth.tenantId);
    try {
      const rawText = await extractDocumentText(request.body, item.source_mime_type, item.source_file_name);
      const { data: children, error: childError } = await auth.data.from("children").select("id, display_name").eq("classroom_id", item.classroom_id).eq("status", "active");
      if (childError) throw new Error("班级幼儿读取失败");
      let mediaUrl: string | undefined;
      if (item.source_mime_type.startsWith("image/") && config.AI_MODE === "qianwen") {
        const { data: signed } = await serviceClient.storage.from(config.SUPABASE_STORAGE_BUCKET).createSignedUrl(item.storage_path, 900);
        if (signed?.signedUrl) mediaUrl = publicSupabaseUrl(signed.signedUrl);
      }
      const generated = await aiProvider.extractObservationDocument({
        fileName: item.source_file_name,
        mimeType: item.source_mime_type,
        rawText,
        classroomChildren: (children ?? []).map((child) => ({ id: child.id, displayName: child.display_name })),
        mediaUrl,
      });
      const childMap = new Map((children ?? []).map((child) => [child.display_name.trim(), child.id]));
      const matchedChildIds = generated.data.subjects.map((subject) => childMap.get(subject.displayName.trim())).filter((value): value is string => Boolean(value));
      const { data: updated, error: updateError } = await schema.from("observation_imports").update({
        extraction_provider: generated.provider,
        extraction_model: generated.model,
        extraction_version: generated.promptVersion,
        extracted_fields: { ...generated.data, rawText },
        field_confidence: generated.data.fieldConfidence,
        matched_child_ids: matchedChildIds,
        status: "needs_review",
      }).eq("id", id).eq("tenant_id", auth.tenantId).select().single();
      if (updateError) throw new Error("提取结果保存失败");
      await audit(auth, "observation_import.extracted", "observation_import", id, { provider: generated.provider, matchedChildCount: matchedChildIds.length });
      return { item: updated, aiNotice: generated.notice };
    } catch (reason) {
      await schema.from("observation_imports").update({ status: "failed", failure_reason: reason instanceof Error ? reason.message.slice(0, 1000) : "提取失败" }).eq("id", id).eq("tenant_id", auth.tenantId);
      throw reason instanceof ApiError ? reason : new ApiError(502, "OBSERVATION_DOCUMENT_EXTRACTION_FAILED", "观察表字段提取失败，请检查文件或稍后重试");
    }
  });

  app.get("/api/observation-imports/:id", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const { data, error } = await auth.data.from("observation_imports").select("*").eq("id", id).maybeSingle();
    if (error) throw new ApiError(500, "OBSERVATION_IMPORT_READ_FAILED", "观察表提取结果读取失败");
    if (!data) throw new ApiError(404, "OBSERVATION_IMPORT_NOT_FOUND", "观察表提取结果不存在或无权访问");
    return { item: data };
  });

  app.patch("/api/analyses/:id/sections/:section", async (request) => {
    const auth = await authenticate(request);
    const { id, section } = z.object({ id: uuid, section: z.enum(Object.keys(sectionClaimTypes) as [string, ...string[]]) }).parse(request.params);
    const input = z.object({
      decision: z.enum(["adopted", "modified", "rejected", "to_verify"]),
      note: z.string().trim().max(2000).default(""),
      edits: z.record(z.string().trim().min(1).max(6000)).default({}),
    }).parse(request.body);
    const { data: analysis, error: analysisError } = await auth.data.from("analysis_runs").select("*").eq("id", id).maybeSingle();
    if (analysisError) throw new ApiError(500, "ANALYSIS_READ_FAILED", "AI分析读取失败");
    if (!analysis) throw new ApiError(404, "ANALYSIS_NOT_FOUND", "AI分析不存在或无权访问");
    if (analysis.decision !== "pending") throw new ApiError(409, "ANALYSIS_ALREADY_FINALIZED", "该分析已经完成终审");
    const allowedTypes = new Set(sectionClaimTypes[section]);
    const claims = flattenAnalysisClaims(analysis.structured_result).filter((claim) => allowedTypes.has(claim.claimType));
    if (!claims.length) throw new ApiError(404, "ANALYSIS_SECTION_EMPTY", "该专业板块没有可审核内容");
    const reviewedAt = new Date().toISOString();
    const rows = claims.map((claim) => ({
      tenant_id: auth.tenantId,
      classroom_id: analysis.classroom_id,
      child_id: analysis.child_id,
      observation_id: analysis.observation_id,
      analysis_run_id: analysis.id,
      claim_key: claim.claimKey,
      claim_type: claim.claimType,
      original_content: claim.originalContent,
      reviewed_content: input.edits[claim.claimKey] ? { ...claim.originalContent, content: input.edits[claim.claimKey] } : null,
      decision: input.edits[claim.claimKey] ? "modified" : input.decision,
      review_note: input.note || null,
      reviewed_by: auth.userId,
      reviewed_at: reviewedAt,
    }));
    const { data, error } = await serviceClient.schema(config.SUPABASE_SCHEMA).from("analysis_claim_reviews").upsert(rows, { onConflict: "analysis_run_id,claim_key" }).select();
    if (error) throw new ApiError(500, "ANALYSIS_SECTION_REVIEW_FAILED", "专业板块审核保存失败");
    await audit(auth, `analysis.section.${input.decision}`, "analysis_section", `${id}:${section}`, { section, claimCount: rows.length, note: input.note });
    return { items: data ?? [] };
  });

  app.post("/api/analyses/:id/revise", async (request, reply) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const input = z.object({ feedback: z.array(z.object({ section: z.string().min(1).max(80), decision: z.string().min(1).max(40), note: z.string().max(2000), content: z.string().max(6000).optional() }).strict()).min(1).max(20) }).parse(request.body);
    const { data: analysis, error: analysisError } = await auth.data.from("analysis_runs").select("*").eq("id", id).maybeSingle();
    if (analysisError) throw new ApiError(500, "ANALYSIS_READ_FAILED", "AI分析读取失败");
    if (!analysis) throw new ApiError(404, "ANALYSIS_NOT_FOUND", "AI分析不存在或无权访问");
    const generated = await aiProvider.reviseAnalysis({ original: analysis.structured_result, teacherFeedback: input.feedback });
    const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
    const { count } = await schema.from("analysis_feedback_versions").select("id", { count: "exact", head: true }).eq("analysis_run_id", id);
    const version = (count ?? 0) + 1;
    const { data: versionRow, error: versionError } = await schema.from("analysis_feedback_versions").insert({
      tenant_id: auth.tenantId, classroom_id: analysis.classroom_id, child_id: analysis.child_id,
      observation_id: analysis.observation_id, analysis_run_id: id, version,
      teacher_feedback: input.feedback, revised_result: generated.data,
      provider: generated.provider, model: generated.model, prompt_version: generated.promptVersion,
      created_by: auth.userId,
    }).select().single();
    if (versionError) throw new ApiError(500, "ANALYSIS_REVISION_SAVE_FAILED", "AI修订版本保存失败");
    const { data: newRun, error: runError } = await schema.from("analysis_runs").insert({
      tenant_id: auth.tenantId, classroom_id: analysis.classroom_id, child_id: analysis.child_id,
      observation_id: analysis.observation_id, provider: generated.provider, model: generated.model,
      prompt_version: generated.promptVersion, knowledge_version: analysis.knowledge_version,
      input_snapshot: { sourceAnalysisId: id, feedbackVersionId: versionRow.id, teacherFeedback: input.feedback },
      knowledge_card_ids: analysis.knowledge_card_ids, structured_result: generated.data,
      risk_flags: generated.data.warnings, generated_by: auth.userId,
    }).select().single();
    if (runError) throw new ApiError(500, "ANALYSIS_REVISION_RUN_FAILED", "AI修订稿创建失败");
    const claims = flattenAnalysisClaims(generated.data).map((claim) => ({
      tenant_id: auth.tenantId, classroom_id: newRun.classroom_id, child_id: newRun.child_id,
      observation_id: newRun.observation_id, analysis_run_id: newRun.id,
      claim_key: claim.claimKey, claim_type: claim.claimType, original_content: claim.originalContent,
    }));
    const responsePlans = generated.data.responsePlans.map((plan, index) => ({
      tenant_id: auth.tenantId, classroom_id: newRun.classroom_id, child_id: newRun.child_id,
      observation_id: newRun.observation_id, analysis_run_id: newRun.id, title: plan.title,
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
    if (claimError || responseError) {
      await schema.from("analysis_runs").delete().eq("id", newRun.id).eq("tenant_id", auth.tenantId);
      await schema.from("analysis_feedback_versions").delete().eq("id", versionRow.id).eq("tenant_id", auth.tenantId);
      throw new ApiError(500, "ANALYSIS_REVISION_ITEMS_FAILED", "AI修订稿审核项或应答方案初始化失败，结果已回滚");
    }
    await Promise.all([
      schema.from("analysis_runs").update({ decision: "abandoned", decision_note: `已由AI修订版本 ${newRun.id} 替代`, decided_by: auth.userId, decided_at: new Date().toISOString() }).eq("id", id).eq("decision", "pending"),
      schema.from("response_plans").update({ status: "rejected" }).eq("analysis_run_id", id).eq("status", "suggested"),
      schema.from("observations").update({ status: "ai_ready" }).eq("id", analysis.observation_id).eq("tenant_id", auth.tenantId),
    ]);
    await audit(auth, "analysis.revised", "analysis", newRun.id, { sourceAnalysisId: id, feedbackVersionId: versionRow.id });
    return reply.status(201).send({ item: newRun, version: versionRow, aiNotice: generated.notice });
  });

  app.get("/api/response-plans", async (request) => {
    const auth = await authenticate(request);
    const query = z.object({ observationId: uuid.optional(), childId: uuid.optional() }).parse(request.query);
    let builder = auth.data.from("response_plans").select("*").order("created_at", { ascending: false });
    if (query.observationId) builder = builder.eq("observation_id", query.observationId);
    if (query.childId) builder = builder.eq("child_id", query.childId);
    const { data, error } = await builder;
    if (error) throw new ApiError(500, "RESPONSE_PLAN_LIST_FAILED", "应答方案读取失败");
    return { items: data ?? [] };
  });

  app.post("/api/response-plans/:id/select", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const { data: plan, error: readError } = await auth.data.from("response_plans").select("*").eq("id", id).maybeSingle();
    if (readError) throw new ApiError(500, "RESPONSE_PLAN_READ_FAILED", "应答方案读取失败");
    if (!plan) throw new ApiError(404, "RESPONSE_PLAN_NOT_FOUND", "应答方案不存在或无权访问");
    if (plan.status !== "suggested") throw new ApiError(409, "RESPONSE_PLAN_ALREADY_DECIDED", "该应答方案已经处理");
    const { data: analysis, error: analysisError } = await auth.data.from("analysis_runs").select("decision").eq("id", plan.analysis_run_id).maybeSingle();
    if (analysisError) throw new ApiError(500, "RESPONSE_PLAN_ANALYSIS_FAILED", "应答方案终审状态读取失败");
    if (analysis?.decision !== "adopted") throw new ApiError(409, "RESPONSE_PLAN_REVIEW_REQUIRED", "请先完成该幼儿AI分析的教师终审，再选择正式应答方案");
    const { data: selected, error } = await auth.data.schema(config.SUPABASE_SCHEMA).rpc("select_response_plan", { target_plan_id: id });
    if (error) {
      if (["23505", "23514"].includes(error.code)) throw new ApiError(409, "RESPONSE_PLAN_SELECT_CONFLICT", "方案状态已变化或分析尚未终审，请刷新后重试");
      throw new ApiError(500, "RESPONSE_PLAN_SELECT_FAILED", "应答方案选择与实施任务创建失败");
    }
    await audit(auth, "response_plan.selected", "response_plan", id, { observationId: plan.observation_id, childId: plan.child_id });
    return { item: selected };
  });

  app.post("/api/response-plans/combine", async (request, reply) => {
    const auth = await authenticate(request);
    const input = z.object({
      title: z.string().trim().min(2).max(160),
      activityPlanId: uuid,
      materialPlanId: uuid,
      experiencePlanId: uuid,
    }).parse(request.body);
    const sourceIds = [...new Set([input.activityPlanId, input.materialPlanId, input.experiencePlanId])];
    const { data: sourcePlans, error: sourceError } = await auth.data.from("response_plans").select("*").in("id", sourceIds);
    if (sourceError) throw new ApiError(500, "RESPONSE_PLAN_COMBINE_READ_FAILED", "组合方案来源读取失败");
    if ((sourcePlans ?? []).length !== sourceIds.length) throw new ApiError(404, "RESPONSE_PLAN_COMBINE_SOURCE_MISSING", "组合方案来源不存在或无权访问");
    const sourceMap = new Map((sourcePlans ?? []).map((item) => [item.id, item]));
    const activitySource = sourceMap.get(input.activityPlanId)!;
    const materialSource = sourceMap.get(input.materialPlanId)!;
    const experienceSource = sourceMap.get(input.experiencePlanId)!;
    const sameAnalysis = (sourcePlans ?? []).every((item) => item.analysis_run_id === activitySource.analysis_run_id && item.child_id === activitySource.child_id && item.observation_id === activitySource.observation_id);
    if (!sameAnalysis || (sourcePlans ?? []).some((item) => item.status !== "suggested")) throw new ApiError(409, "RESPONSE_PLAN_COMBINE_INVALID", "只能组合同一名幼儿、同一分析版本中尚未处理的候选方案");
    const { data: analysis, error: analysisError } = await auth.data.from("analysis_runs").select("decision").eq("id", activitySource.analysis_run_id).maybeSingle();
    if (analysisError) throw new ApiError(500, "RESPONSE_PLAN_ANALYSIS_FAILED", "应答方案终审状态读取失败");
    if (analysis?.decision !== "adopted") throw new ApiError(409, "RESPONSE_PLAN_REVIEW_REQUIRED", "请先完成该幼儿AI分析的教师终审，再组合正式应答方案");
    const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
    const targetExperience = [...new Set((sourcePlans ?? []).flatMap((item) => item.target_experience ?? []))].slice(0, 12);
    const { data: combined, error: createError } = await schema.from("response_plans").insert({
      tenant_id: auth.tenantId,
      classroom_id: activitySource.classroom_id,
      child_id: activitySource.child_id,
      observation_id: activitySource.observation_id,
      analysis_run_id: activitySource.analysis_run_id,
      title: input.title,
      rationale: `教师组合：活动取自“${activitySource.title}”，材料取自“${materialSource.title}”，经验支持取自“${experienceSource.title}”。`,
      target_experience: targetExperience,
      activity_support: activitySource.activity_support,
      material_support: materialSource.material_support,
      experience_support: experienceSource.experience_support,
      observation_cut: experienceSource.observation_cut || activitySource.observation_cut,
      observation_focus: [...new Set([...(activitySource.observation_focus ?? []), ...(materialSource.observation_focus ?? []), ...(experienceSource.observation_focus ?? [])])].slice(0, 8),
      adjustment_condition: experienceSource.adjustment_condition || materialSource.adjustment_condition,
      source_plan_keys: sourceIds.map((id) => `response-plan:${id}`),
      status: "suggested",
      created_by: auth.userId,
    }).select().single();
    if (createError) throw new ApiError(500, "RESPONSE_PLAN_COMBINE_CREATE_FAILED", "正式组合方案创建失败");
    const { data: selected, error: selectError } = await auth.data.schema(config.SUPABASE_SCHEMA).rpc("select_response_plan", { target_plan_id: combined.id });
    if (selectError) {
      await schema.from("response_plans").delete().eq("id", combined.id).eq("tenant_id", auth.tenantId);
      if (["23505", "23514"].includes(selectError.code)) throw new ApiError(409, "RESPONSE_PLAN_COMBINE_CONFLICT", "候选方案状态已变化，本次组合已回滚，请刷新后重试");
      throw new ApiError(500, "RESPONSE_PLAN_COMBINE_ACTIONS_FAILED", "组合方案实施任务创建失败，方案已回滚");
    }
    await audit(auth, "response_plan.combined", "response_plan", combined.id, { observationId: combined.observation_id, childId: combined.child_id, sourceIds });
    return reply.status(201).send({ item: selected });
  });

  app.get("/api/curriculum-templates", async (request) => {
    const auth = await authenticate(request);
    const { data, error } = await auth.data.from("curriculum_template_versions").select("*").eq("status", "active").order("is_default", { ascending: false }).order("version", { ascending: false });
    if (error) throw new ApiError(500, "CURRICULUM_TEMPLATE_LIST_FAILED", "课程模板读取失败");
    return { items: data ?? [] };
  });

  app.get("/api/analysis-frameworks", async (request) => {
    const auth = await authenticate(request);
    const { data, error } = await auth.data.from("analysis_framework_versions").select("*").eq("status", "active").order("framework_type").order("version", { ascending: false });
    if (error) throw new ApiError(500, "ANALYSIS_FRAMEWORK_LIST_FAILED", "园本分析框架读取失败");
    return { items: data ?? [] };
  });

  app.post("/api/analysis-frameworks", async (request, reply) => {
    const auth = await authenticate(request);
    requireResearcher(auth);
    const input = z.object({
      frameworkType: z.enum(["game_experience", "learning_disposition"]),
      code: z.string().trim().min(2).max(80),
      name: z.string().trim().min(2).max(160),
      description: z.string().trim().min(2).max(2000),
      dimensions: z.array(z.object({ label: z.string().trim().min(1).max(80), evidenceReminder: z.string().trim().min(2).max(1000) }).strict()).min(1).max(12),
      isDefault: z.boolean().default(false),
    }).superRefine((value, context) => {
      const expected = frameworkDimensions[value.frameworkType];
      const labels = value.dimensions.map((item) => item.label);
      if (labels.length !== expected.length || expected.some((label) => !labels.includes(label))) {
        context.addIssue({ code: "custom", path: ["dimensions"], message: `当前版本必须完整保留${expected.join("、")}，可调整顺序和证据提醒` });
      }
    }).parse(request.body);
    const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
    const { data: previous, error: previousError } = await schema.from("analysis_framework_versions").select("version").eq("tenant_id", auth.tenantId).eq("code", input.code).order("version", { ascending: false }).limit(1);
    if (previousError) throw new ApiError(500, "ANALYSIS_FRAMEWORK_VERSION_FAILED", "园本分析框架版本读取失败");
    if (input.isDefault) await schema.from("analysis_framework_versions").update({ is_default: false }).eq("tenant_id", auth.tenantId).eq("framework_type", input.frameworkType).eq("is_default", true);
    const { data, error } = await schema.from("analysis_framework_versions").insert({
      tenant_id: auth.tenantId, framework_type: input.frameworkType, code: input.code,
      name: input.name, version: Number(previous?.[0]?.version ?? 0) + 1,
      description: input.description, dimensions: input.dimensions,
      is_default: input.isDefault, status: "active", created_by: auth.userId,
    }).select().single();
    if (error) throw new ApiError(500, "ANALYSIS_FRAMEWORK_CREATE_FAILED", "园本分析框架版本创建失败");
    await audit(auth, "analysis_framework.created", "analysis_framework", data.id, { frameworkType: data.framework_type, code: data.code, version: data.version });
    return reply.status(201).send({ item: data });
  });

  app.post("/api/curriculum-templates", async (request, reply) => {
    const auth = await authenticate(request);
    requireResearcher(auth);
    const input = z.object({
      code: z.string().trim().min(2).max(80), name: z.string().trim().min(2).max(160),
      description: z.string().trim().min(2).max(2000), structure: z.record(z.unknown()),
      isDefault: z.boolean().default(false),
    }).parse(request.body);
    const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
    const { data: previous, error: previousError } = await schema.from("curriculum_template_versions").select("version").eq("tenant_id", auth.tenantId).eq("code", input.code).order("version", { ascending: false }).limit(1);
    if (previousError) throw new ApiError(500, "CURRICULUM_TEMPLATE_VERSION_FAILED", "课程模板版本读取失败");
    if (input.isDefault) await schema.from("curriculum_template_versions").update({ is_default: false }).eq("tenant_id", auth.tenantId).eq("is_default", true);
    const { data, error } = await schema.from("curriculum_template_versions").insert({
      tenant_id: auth.tenantId, code: input.code, name: input.name,
      version: Number(previous?.[0]?.version ?? 0) + 1, description: input.description,
      structure: input.structure, is_default: input.isDefault, status: "active", created_by: auth.userId,
    }).select().single();
    if (error) throw new ApiError(500, "CURRICULUM_TEMPLATE_CREATE_FAILED", "课程模板版本创建失败");
    await audit(auth, "curriculum_template.created", "curriculum_template", data.id, { code: data.code, version: data.version, isDefault: data.is_default });
    return reply.status(201).send({ item: data });
  });

  app.get("/api/professional-memories", async (request) => {
    const auth = await authenticate(request);
    const query = z.object({ status: z.enum(["pending", "active", "disabled"]).optional() }).parse(request.query);
    const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
    let builder = schema.from("professional_memories").select("*").eq("tenant_id", auth.tenantId).order("created_at", { ascending: false });
    if (auth.role !== "researcher") builder = builder.eq("status", "active");
    else if (query.status) builder = builder.eq("status", query.status);
    const { data, error } = await builder;
    if (error) throw new ApiError(500, "PROFESSIONAL_MEMORY_LIST_FAILED", "园所专业经验读取失败");
    return { items: data ?? [] };
  });

  app.patch("/api/professional-memories/:id", async (request) => {
    const auth = await authenticate(request);
    requireResearcher(auth);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const input = z.object({ status: z.enum(["active", "disabled"]), qualityScore: z.number().min(0).max(1).optional() }).parse(request.body);
    const { data, error } = await serviceClient.schema(config.SUPABASE_SCHEMA).from("professional_memories").update({
      status: input.status, ...(input.qualityScore !== undefined && { quality_score: input.qualityScore }),
      approved_by: input.status === "active" ? auth.userId : null,
      approved_at: input.status === "active" ? new Date().toISOString() : null,
    }).eq("id", id).eq("tenant_id", auth.tenantId).select().maybeSingle();
    if (error || !data) throw new ApiError(404, "PROFESSIONAL_MEMORY_UPDATE_FAILED", "园所专业经验不存在或状态更新失败");
    await audit(auth, `professional_memory.${input.status}`, "professional_memory", id, { qualityScore: input.qualityScore ?? data.quality_score });
    return { item: data };
  });

  app.post("/api/curriculum-clues/from-evidence", async (request, reply) => {
    const auth = await authenticate(request);
    const input = z.object({ classroomId: uuid, observationIds: z.array(uuid).min(2).max(100), theme: z.string().trim().min(2).max(160).optional() }).parse(request.body);
    const { data: observations, error } = await auth.data.from("observations").select("*").eq("classroom_id", input.classroomId).in("id", input.observationIds).eq("status", "adopted").order("occurred_at");
    if (error) throw new ApiError(500, "CURRICULUM_EVIDENCE_READ_FAILED", "课程观察证据读取失败");
    if ((observations ?? []).length !== new Set(input.observationIds).size) throw new ApiError(422, "CURRICULUM_EVIDENCE_INVALID", "课程只能使用当前班级已终审采用的观察");
    const { data: subjectRows, error: subjectError } = await auth.data.from("observation_subjects").select("child_id").in("observation_id", input.observationIds);
    if (subjectError) throw new ApiError(500, "CURRICULUM_SUBJECTS_FAILED", "课程参与幼儿读取失败");
    const childIds = [...new Set((subjectRows?.length ? subjectRows : observations ?? []).map((item) => item.child_id))];
    const timePoints = [...new Set((observations ?? []).map((item) => item.occurred_at.slice(0, 10)))];
    if (!((childIds.length >= 2 || observations!.length >= 3) && timePoints.length >= 2)) throw new ApiError(409, "CURRICULUM_EVIDENCE_THRESHOLD", "课程线索至少需要2名幼儿或同一幼儿3次观察，并覆盖2个日期");
    const theme = input.theme || observations![0]!.theme;
    const scope = childIds.length === 1 ? "individual_support" as const : "classroom_curriculum" as const;
    const { data, error: saveError } = await auth.data.from("curriculum_clues").insert({
      tenant_id: auth.tenantId, classroom_id: input.classroomId,
      title: scope === "individual_support" ? `${theme}：教师选证个别支持线索` : `${theme}：教师选证课程线索`, theme,
      origin: `${observations!.length}条教师选择的已终审观察，涉及${childIds.length}名幼儿和${timePoints.length}个时间点。`,
      inquiry_questions: observations!.map((item) => item.teacher_response?.nextObservationFocus).filter(Boolean).slice(0, 8),
      plan: { evidenceSelectionMode: "teacher_selected", scope, version: 1 },
      child_ids: childIds, evidence_observation_ids: input.observationIds,
      time_point_count: timePoints.length, threshold_met: true, status: "clue", created_by: auth.userId,
    }).select().single();
    if (saveError) throw new ApiError(500, "CURRICULUM_CLUE_CREATE_FAILED", "课程线索创建失败");
    await audit(auth, "curriculum.evidence_selected", "curriculum_clue", data.id, { observationIds: input.observationIds });
    return reply.status(201).send({ item: data });
  });

  app.post("/api/curriculum-clues/:id/activity-options", async (request, reply) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const { data: clue, error: clueError } = await auth.data.from("curriculum_clues").select("*").eq("id", id).maybeSingle();
    if (clueError) throw new ApiError(500, "CURRICULUM_CLUE_READ_FAILED", "课程线索读取失败");
    if (!clue?.threshold_met) throw new ApiError(409, "CURRICULUM_CLUE_NOT_READY", "课程线索证据尚未达到生成门槛");
    const [{ data: observations, error: observationError }, { data: classroom, error: classroomError }] = await Promise.all([
      auth.data.from("observations").select("*").in("id", clue.evidence_observation_ids).eq("status", "adopted").order("occurred_at"),
      auth.data.from("classrooms").select("grade").eq("id", clue.classroom_id).single(),
    ]);
    if (observationError || classroomError || !classroom) throw new ApiError(500, "CURRICULUM_CONTEXT_READ_FAILED", "课程生成上下文读取失败");
    const { data: knowledge, error: knowledgeError } = await auth.data.from("knowledge_cards").select("*").eq("grade", classroom.grade).eq("status", "active").limit(200);
    if (knowledgeError) throw new ApiError(500, "CURRICULUM_KNOWLEDGE_READ_FAILED", "课程知识参照读取失败");
    const generated = await aiProvider.generateActivityOptions({
      theme: clue.theme, scope: clue.plan?.scope === "individual_support" ? "individual_support" : "classroom_curriculum", observationCount: observations?.length ?? 0, childCount: clue.child_ids.length,
      timePointCount: clue.time_point_count, observations: observations ?? [], evidenceObservationIds: clue.evidence_observation_ids,
      knowledge: (knowledge ?? []) as KnowledgeRow[],
    });
    const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
    await schema.from("curriculum_activity_options").delete().eq("curriculum_clue_id", id).eq("status", "suggested");
    const rows = generated.data.options.map((option) => ({
      tenant_id: auth.tenantId, classroom_id: clue.classroom_id, curriculum_clue_id: id,
      title: option.title, value_point: option.valuePoint, evidence_observation_ids: clue.evidence_observation_ids,
      core_question: option.coreQuestion, social_nature_self: option.socialNatureSelf,
      development_links: option.developmentLinks, main_activities: option.mainActivities,
      materials: option.materials, teacher_support: option.teacherSupport,
      observation_focus: option.observationFocus, risk_note: option.riskNote, created_by: auth.userId,
    }));
    const { data, error } = await schema.from("curriculum_activity_options").insert(rows).select();
    if (error) throw new ApiError(500, "CURRICULUM_OPTIONS_SAVE_FAILED", "课程活动方向保存失败");
    await audit(auth, "curriculum.options_generated", "curriculum_clue", id, { provider: generated.provider, optionCount: rows.length });
    return reply.status(201).send({ items: data ?? [], aiNotice: generated.notice });
  });

  app.patch("/api/curriculum-clues/:id/activity-options", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const input = z.object({ selectedOptionIds: z.array(uuid).min(1).max(3) }).parse(request.body);
    const { data: options, error: readError } = await auth.data.from("curriculum_activity_options").select("id").eq("curriculum_clue_id", id);
    if (readError) throw new ApiError(500, "CURRICULUM_OPTIONS_READ_FAILED", "课程活动方向读取失败");
    const allowed = new Set((options ?? []).map((item) => item.id));
    if (input.selectedOptionIds.some((optionId) => !allowed.has(optionId))) throw new ApiError(422, "CURRICULUM_OPTION_INVALID", "所选活动方向不属于当前课程线索");
    const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
    await schema.from("curriculum_activity_options").update({ status: "rejected", selected_by: null, selected_at: null }).eq("curriculum_clue_id", id);
    const { data, error } = await schema.from("curriculum_activity_options").update({ status: "selected", selected_by: auth.userId, selected_at: new Date().toISOString() }).in("id", input.selectedOptionIds).eq("tenant_id", auth.tenantId).select();
    if (error) throw new ApiError(500, "CURRICULUM_OPTION_SELECT_FAILED", "课程活动方向选择失败");
    await audit(auth, "curriculum.options_selected", "curriculum_clue", id, { selectedOptionIds: input.selectedOptionIds });
    return { items: data ?? [] };
  });

  app.post("/api/curriculum-clues/:id/plan", async (request, reply) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const input = z.object({ implementationPeriod: z.string().trim().min(2).max(160), templateVersionId: uuid.optional() }).parse(request.body);
    const [{ data: clue, error: clueError }, { data: selectedOptions, error: optionError }] = await Promise.all([
      auth.data.from("curriculum_clues").select("*").eq("id", id).maybeSingle(),
      auth.data.from("curriculum_activity_options").select("*").eq("curriculum_clue_id", id).eq("status", "selected").order("created_at"),
    ]);
    if (clueError || optionError) throw new ApiError(500, "CURRICULUM_PLAN_CONTEXT_FAILED", "课程计划上下文读取失败");
    if (!clue) throw new ApiError(404, "CURRICULUM_CLUE_NOT_FOUND", "课程线索不存在或无权访问");
    if (!selectedOptions?.length) throw new ApiError(409, "CURRICULUM_OPTIONS_REQUIRED", "请先选择1至3个活动方向");
    let templateQuery = auth.data.from("curriculum_template_versions").select("*").eq("status", "active");
    templateQuery = input.templateVersionId ? templateQuery.eq("id", input.templateVersionId) : templateQuery.eq("is_default", true);
    const [{ data: template, error: templateError }, { data: observations, error: observationError }, { data: classroom, error: classroomError }] = await Promise.all([
      templateQuery.limit(1).maybeSingle(),
      auth.data.from("observations").select("*").in("id", clue.evidence_observation_ids).eq("status", "adopted").order("occurred_at"),
      auth.data.from("classrooms").select("name, grade").eq("id", clue.classroom_id).single(),
    ]);
    if (templateError || observationError || classroomError || !template || !classroom) throw new ApiError(500, "CURRICULUM_PLAN_CONTEXT_FAILED", "课程模板或证据读取失败");
    const { data: knowledge, error: knowledgeError } = await auth.data.from("knowledge_cards").select("*").eq("grade", classroom.grade).eq("status", "active").limit(200);
    if (knowledgeError) throw new ApiError(500, "CURRICULUM_KNOWLEDGE_READ_FAILED", "课程知识参照读取失败");
    const normalizedOptions = selectedOptions.map((item) => ({
      title: item.title, valuePoint: item.value_point, coreQuestion: item.core_question,
      socialNatureSelf: item.social_nature_self, developmentLinks: item.development_links,
      mainActivities: item.main_activities, materials: item.materials, teacherSupport: item.teacher_support,
      observationFocus: item.observation_focus, riskNote: item.risk_note,
    }));
    const generated = await aiProvider.generateCurriculumPlan({
      theme: clue.theme, scope: clue.plan?.scope === "individual_support" ? "individual_support" : "classroom_curriculum", observationCount: observations?.length ?? 0, childCount: clue.child_ids.length,
      timePointCount: clue.time_point_count, observations: observations ?? [], evidenceObservationIds: clue.evidence_observation_ids,
      knowledge: (knowledge ?? []) as KnowledgeRow[], classroomName: classroom.name,
      implementationPeriod: input.implementationPeriod, templateStructure: template.structure,
      selectedOptions: normalizedOptions,
    });
    const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
    const { data: versions } = await schema.from("curriculum_plans").select("version").eq("curriculum_clue_id", id).order("version", { ascending: false }).limit(1);
    const version = Number(versions?.[0]?.version ?? 0) + 1;
    const { data, error } = await schema.from("curriculum_plans").insert({
      tenant_id: auth.tenantId, classroom_id: clue.classroom_id, curriculum_clue_id: id,
      template_version_id: template.id, title: clue.title, implementation_period: input.implementationPeriod,
      core_inquiry_clue: normalizedOptions.map((item) => item.coreQuestion).join("；"), content: generated.data,
      evidence_observation_ids: clue.evidence_observation_ids, selected_option_ids: selectedOptions.map((item) => item.id),
      version, created_by: auth.userId,
    }).select().single();
    if (error) throw new ApiError(500, "CURRICULUM_PLAN_SAVE_FAILED", "课程计划保存失败");
    await schema.from("curriculum_clues").update({ status: "draft", plan: { planId: data.id, version, templateVersionId: template.id, aiMeta: { provider: generated.provider, model: generated.model, promptVersion: generated.promptVersion } } }).eq("id", id);
    await audit(auth, "curriculum.plan_generated", "curriculum_plan", data.id, { clueId: id, provider: generated.provider, version });
    return reply.status(201).send({ item: data, aiNotice: generated.notice });
  });

  app.get("/api/curriculum-clues/:id/workspace", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const [{ data: clue, error }, { data: options, error: optionError }, { data: plans, error: planError }] = await Promise.all([
      auth.data.from("curriculum_clues").select("*").eq("id", id).maybeSingle(),
      auth.data.from("curriculum_activity_options").select("*").eq("curriculum_clue_id", id).order("created_at"),
      auth.data.from("curriculum_plans").select("*").eq("curriculum_clue_id", id).order("version", { ascending: false }),
    ]);
    if (error || optionError || planError) throw new ApiError(500, "CURRICULUM_WORKSPACE_READ_FAILED", "课程工作区读取失败");
    if (!clue) throw new ApiError(404, "CURRICULUM_CLUE_NOT_FOUND", "课程线索不存在或无权访问");
    const planIds = (plans ?? []).map((item) => item.id);
    const { data: cycles, error: cycleError } = planIds.length ? await auth.data.from("curriculum_cycles").select("*").in("curriculum_plan_id", planIds).order("cycle_number") : { data: [], error: null };
    if (cycleError) throw new ApiError(500, "CURRICULUM_CYCLES_READ_FAILED", "课程循环读取失败");
    return { item: clue, options: options ?? [], plans: plans ?? [], cycles: cycles ?? [] };
  });

  app.post("/api/curriculum-plans/:id/cycles", async (request, reply) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const input = z.object({
      zone: z.enum(["starting", "focusing", "inquiring", "resolving"]),
      sevenSteps: z.record(z.string().max(3000)), teacherSupport: z.array(z.string().max(2000)).max(20).default([]),
      childActivities: z.array(z.string().max(2000)).max(20).default([]), environmentMaterials: z.array(z.string().max(2000)).max(20).default([]),
      generatedExperience: z.array(z.string().max(2000)).max(20).default([]), newQuestions: z.array(z.string().max(2000)).max(20).default([]),
      evidenceObservationIds: z.array(uuid).max(100).default([]), reflection: z.string().max(6000).default(""), status: z.enum(["active", "completed"]).default("active"),
    }).parse(request.body);
    const { data: plan, error: planError } = await auth.data.from("curriculum_plans").select("id, classroom_id").eq("id", id).maybeSingle();
    if (planError) throw new ApiError(500, "CURRICULUM_PLAN_READ_FAILED", "课程计划读取失败");
    if (!plan) throw new ApiError(404, "CURRICULUM_PLAN_NOT_FOUND", "课程计划不存在或无权访问");
    const { data: last } = await auth.data.from("curriculum_cycles").select("cycle_number").eq("curriculum_plan_id", id).order("cycle_number", { ascending: false }).limit(1);
    const cycleNumber = Number(last?.[0]?.cycle_number ?? 0) + 1;
    const { data, error } = await auth.data.from("curriculum_cycles").insert({
      tenant_id: auth.tenantId, classroom_id: plan.classroom_id, curriculum_plan_id: id, cycle_number: cycleNumber,
      zone: input.zone, seven_steps: input.sevenSteps, teacher_support: input.teacherSupport,
      child_activities: input.childActivities, environment_materials: input.environmentMaterials,
      generated_experience: input.generatedExperience, new_questions: input.newQuestions,
      evidence_observation_ids: input.evidenceObservationIds, reflection: input.reflection || null,
      status: input.status, created_by: auth.userId,
    }).select().single();
    if (error) throw new ApiError(500, "CURRICULUM_CYCLE_CREATE_FAILED", "课程循环保存失败");
    await audit(auth, "curriculum.cycle_created", "curriculum_cycle", data.id, { planId: id, cycleNumber });
    return reply.status(201).send({ item: data });
  });

  app.post("/api/observations/:id/document-exports", async (request, reply) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const input = z.object({ variant: z.enum(["teacher", "professional"]), purpose: z.string().trim().min(2).max(1000), recipient: z.string().trim().min(2).max(300) }).parse(request.body);
    const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
    const { data: observation, error } = await auth.data.from("observations").select("*").eq("id", id).maybeSingle();
    if (error) throw new ApiError(500, "OBSERVATION_READ_FAILED", "观察记录读取失败");
    if (!observation) throw new ApiError(404, "OBSERVATION_NOT_FOUND", "观察记录不存在或无权访问");
    const [{ data: subjectRows }, { data: children }, { data: evidence }, { data: classroom }, { data: tenant }, { data: profiles }, { data: analyses }] = await Promise.all([
      schema.from("observation_subjects").select("*").eq("observation_id", id).order("role"),
      schema.from("children").select("id, display_name").eq("tenant_id", auth.tenantId),
      schema.from("evidence_assets").select("file_name, evidence_type").eq("observation_id", id).eq("upload_status", "ready"),
      schema.from("classrooms").select("name").eq("id", observation.classroom_id).single(),
      schema.from("tenants").select("name").eq("id", auth.tenantId).single(),
      schema.from("profiles").select("user_id, display_name").eq("tenant_id", auth.tenantId).in("user_id", observation.observer_ids?.length ? observation.observer_ids : [observation.created_by]),
      schema.from("analysis_runs").select("*").eq("observation_id", id).eq("decision", "adopted").order("generated_at", { ascending: false }),
    ]);
    const childMap = new Map((children ?? []).map((child) => [child.id, child.display_name]));
    const latestAnalysisByChild = new Map<string, any>();
    for (const analysis of analyses ?? []) {
      if (!latestAnalysisByChild.has(analysis.child_id)) latestAnalysisByChild.set(analysis.child_id, analysis);
    }
    let effectiveAnalyses: Array<{ childId: string; childName: string; result: Record<string, unknown> }> = [];
    if (input.variant === "professional") {
      const subjectChildIds = (subjectRows ?? []).map((subject) => subject.child_id);
      const missingChildIds = subjectChildIds.filter((childId) => !latestAnalysisByChild.has(childId));
      if (missingChildIds.length) throw new ApiError(409, "PROFESSIONAL_ANALYSIS_REQUIRED", "专业版Word需要先完成每名参与幼儿的教师终审");
      const analysisIds = [...latestAnalysisByChild.values()].map((analysis) => analysis.id);
      const { data: reviews, error: reviewError } = await schema.from("analysis_claim_reviews").select("*").in("analysis_run_id", analysisIds);
      if (reviewError) throw new ApiError(500, "ANALYSIS_REVIEW_READ_FAILED", "分析审核记录读取失败");
      effectiveAnalyses = subjectChildIds.map((childId) => {
        const analysis = latestAnalysisByChild.get(childId);
        return {
          childId,
          childName: childMap.get(childId) ?? "园内幼儿",
          result: effectiveAnalysisResult(analysis.structured_result, (reviews ?? []).filter((review) => review.analysis_run_id === analysis.id)),
        };
      });
    }
    const snapshot = {
      variant: input.variant,
      schoolName: tenant?.name ?? "幼儿园",
      classroomName: classroom?.name ?? "班级",
      observerNames: (profiles ?? []).map((profile) => profile.display_name),
      observation,
      subjects: (subjectRows ?? []).map((subject) => ({ displayName: childMap.get(subject.child_id) ?? "园内幼儿", role: subject.role, contextualFeature: subject.contextual_feature })),
      evidence: evidence ?? [],
      analyses: effectiveAnalyses,
      analysis: effectiveAnalyses[0]?.result ?? null,
    };
    const result = await createDocumentExportRequest(auth, {
      classroomId: observation.classroom_id, exportType: "observation_record",
      documentType: input.variant === "professional" ? "observation_professional" : "observation_teacher",
      resourceType: "observation", resourceId: id, purpose: input.purpose, recipient: input.recipient,
      fileName: `${observation.title}-${input.variant === "professional" ? "专业版" : "教师原稿版"}.docx`, contentSnapshot: snapshot,
    });
    await audit(auth, "document_export.requested", "document_export", result.documentExport.id, { exportRequestId: result.request.id, variant: input.variant });
    return reply.status(201).send(result);
  });

  app.post("/api/curriculum-plans/:id/document-exports", async (request, reply) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const input = z.object({ purpose: z.string().trim().min(2).max(1000), recipient: z.string().trim().min(2).max(300) }).parse(request.body);
    const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
    const { data: plan, error } = await auth.data.from("curriculum_plans").select("*").eq("id", id).maybeSingle();
    if (error) throw new ApiError(500, "CURRICULUM_PLAN_READ_FAILED", "课程计划读取失败");
    if (!plan) throw new ApiError(404, "CURRICULUM_PLAN_NOT_FOUND", "课程计划不存在或无权访问");
    const [{ data: classroom }, { data: tenant }, { data: cycles }, { data: clue }] = await Promise.all([
      schema.from("classrooms").select("name").eq("id", plan.classroom_id).single(),
      schema.from("tenants").select("name").eq("id", auth.tenantId).single(),
      schema.from("curriculum_cycles").select("*").eq("curriculum_plan_id", id).order("cycle_number"),
      schema.from("curriculum_clues").select("plan").eq("id", plan.curriculum_clue_id).maybeSingle(),
    ]);
    const isIndividualSupport = clue?.plan?.scope === "individual_support";
    const snapshot = { schoolName: tenant?.name ?? "幼儿园", classroomName: classroom?.name ?? "班级", implementationPeriod: plan.implementation_period, title: plan.title, coreInquiryClue: plan.core_inquiry_clue, content: plan.content, cycles: cycles ?? [] };
    const result = await createDocumentExportRequest(auth, {
      classroomId: plan.classroom_id, exportType: "curriculum_plan", documentType: "curriculum_plan",
      resourceType: "curriculum_plan", resourceId: id, purpose: input.purpose, recipient: input.recipient,
      fileName: `${plan.title}-${isIndividualSupport ? "个别支持计划" : "课程计划"}-V${plan.version}.docx`, contentSnapshot: snapshot,
    });
    await audit(auth, "document_export.requested", "document_export", result.documentExport.id, { exportRequestId: result.request.id, planId: id });
    return reply.status(201).send(result);
  });

  app.get("/api/document-exports/:id/download", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const { data, error } = await auth.data.from("document_exports").select("storage_path, status, file_name").eq("id", id).maybeSingle();
    if (error) throw new ApiError(500, "DOCUMENT_EXPORT_READ_FAILED", "Word导出任务读取失败");
    if (!data?.storage_path || data.status !== "ready") throw new ApiError(409, "DOCUMENT_EXPORT_NOT_READY", "Word文件尚未通过审批或生成完成");
    const { data: signed, error: signedError } = await serviceClient.storage.from(config.SUPABASE_STORAGE_BUCKET).createSignedUrl(data.storage_path, 300);
    if (signedError || !signed) throw new ApiError(500, "DOCUMENT_EXPORT_URL_FAILED", "Word下载链接创建失败");
    return { url: publicSupabaseUrl(signed.signedUrl), expiresIn: 300, fileName: data.file_name };
  });
}
