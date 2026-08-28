import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolveTenantPrompt } from "../ai/prompt-config.js";
import { createAIProvider } from "../ai/provider.js";
import { classroomReportContentSchema, reportContentSchema } from "../ai/contracts.js";
import { effectiveAnalysisResult } from "../analysis-claims.js";
import { classroomReportEvidenceCoverage, classroomReportMetrics } from "../classroom-report.js";
import { config } from "../config.js";
import { ApiError, audit, authenticate } from "../http.js";
import { chinaCalendarDate, reportEvidenceCoverage } from "../report-evidence.js";
import { serviceClient } from "../supabase.js";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const reportInput = z.object({
  classroomId: uuid,
  childId: uuid.optional(),
  reportType: z.enum(["teacher", "guardian", "classroom"]),
  periodStart: date,
  periodEnd: date,
}).superRefine((value, context) => {
  if (value.periodEnd < value.periodStart) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["periodEnd"], message: "结束日期不能早于开始日期" });
  }
  if (value.reportType !== "classroom" && !value.childId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["childId"], message: "个体报告必须选择幼儿" });
  }
});

const nextSupportStatus: Record<string, string[]> = {
  planned: ["implemented"],
  implemented: ["follow_up"],
  follow_up: ["verified"],
  verified: ["closed"],
  closed: [],
};

const aiProvider = createAIProvider({
  mode: config.AI_MODE,
  apiKey: config.qwenApiKey,
  baseUrl: config.QWEN_BASE_URL,
  textModel: config.QWEN_TEXT_MODEL,
  visionModel: config.QWEN_VISION_MODEL,
  timeoutMs: config.QWEN_TIMEOUT_MS,
  fallbackToSimulated: config.aiFallbackToSimulated,
});

function mostFrequent(values: string[], limit = 4) {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([value]) => value);
}

export async function outcomeRoutes(app: FastifyInstance) {
  app.get("/api/support-actions", async (request) => {
    const auth = await authenticate(request);
    const query = z.object({ childId: uuid.optional(), classroomId: uuid.optional() }).parse(request.query);
    let builder = auth.data.from("support_actions").select("*").order("created_at", { ascending: false });
    if (query.childId) builder = builder.eq("child_id", query.childId);
    if (query.classroomId) builder = builder.eq("classroom_id", query.classroomId);
    const { data, error } = await builder;
    if (error) throw new ApiError(500, "SUPPORT_LIST_FAILED", "应答行动读取失败");
    return { items: data ?? [] };
  });

  app.patch("/api/support-actions/:id", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const input = z.object({
      status: z.enum(["implemented", "follow_up", "verified", "closed"]),
      plannedFor: date.optional(),
      childResponse: z.string().trim().max(3000).optional(),
      effectiveness: z.enum(["supported", "insufficient", "continue"]).optional(),
    }).parse(request.body);
    const { data: current, error: currentError } = await auth.data.from("support_actions").select("*").eq("id", id).maybeSingle();
    if (currentError) throw new ApiError(500, "SUPPORT_READ_FAILED", "应答行动读取失败");
    if (!current) throw new ApiError(404, "SUPPORT_NOT_FOUND", "应答行动不存在或无权访问");
    if (!(nextSupportStatus[current.status] ?? []).includes(input.status)) {
      throw new ApiError(409, "INVALID_SUPPORT_TRANSITION", `不能从“${current.status}”直接变更为“${input.status}”`);
    }
    if (input.status === "verified" && (!input.childResponse || !input.effectiveness)) {
      throw new ApiError(422, "FOLLOW_UP_EVIDENCE_REQUIRED", "完成复察验证时必须记录幼儿反应和效果判断");
    }
    const { data, error } = await auth.data.from("support_actions").update({
      status: input.status,
      ...(input.plannedFor !== undefined && { planned_for: input.plannedFor }),
      ...(input.childResponse !== undefined && { child_response: input.childResponse }),
      ...(input.effectiveness !== undefined && { effectiveness: input.effectiveness }),
      ...(input.status === "implemented" && { implemented_at: new Date().toISOString() }),
    }).eq("id", id).select().single();
    if (error) throw new ApiError(500, "SUPPORT_UPDATE_FAILED", "应答行动更新失败");
    if (current.response_plan_id) {
      const { data: siblings } = await auth.data.from("support_actions").select("status").eq("response_plan_id", current.response_plan_id);
      const statuses = (siblings ?? []).map((item) => item.status);
      const planStatus = statuses.length && statuses.every((status) => ["verified", "closed"].includes(status))
        ? "verified"
        : statuses.some((status) => status === "follow_up") ? "follow_up"
          : statuses.some((status) => status === "implemented") ? "implemented" : undefined;
      if (planStatus) await serviceClient.schema(config.SUPABASE_SCHEMA).from("response_plans").update({ status: planStatus }).eq("id", current.response_plan_id).eq("tenant_id", auth.tenantId);
    }
    if (input.status === "verified") {
      await serviceClient.schema(config.SUPABASE_SCHEMA).from("professional_memories").upsert({
        tenant_id: auth.tenantId,
        memory_type: "response_effect",
        source_resource_type: "support_action",
        source_resource_id: id,
        title: "已完成复察的教师应答经验",
        summary: `${current.strategy}；幼儿后续反应：${input.childResponse}`,
        retrieval_text: `${current.rationale}\n${current.strategy}\n${input.childResponse}\n效果：${input.effectiveness}`,
        applicability: { classroomId: current.classroom_id, childId: current.child_id, category: current.category },
        evidence_refs: [{ observationId: current.observation_id, supportActionId: id }],
        quality_score: input.effectiveness === "supported" ? 0.75 : 0.55,
        status: "active",
        created_by: auth.userId,
      }, { onConflict: "tenant_id,memory_type,source_resource_type,source_resource_id" });
    }
    await audit(auth, `support.${input.status}`, "support_action", id, { effectiveness: input.effectiveness ?? null });
    return { item: data };
  });

  app.get("/api/children/:id/growth", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const { data: child, error: childError } = await auth.data.from("children").select("*").eq("id", id).maybeSingle();
    if (childError) throw new ApiError(500, "CHILD_LOOKUP_FAILED", "幼儿档案读取失败");
    if (!child) throw new ApiError(404, "CHILD_NOT_FOUND", "幼儿不存在或无权访问");
    const { data: subjectRows, error: subjectError } = await auth.data.from("observation_subjects").select("observation_id").eq("child_id", id);
    if (subjectError) throw new ApiError(500, "GROWTH_SUBJECT_READ_FAILED", "幼儿观察关联读取失败");
    const observationIds = (subjectRows ?? []).map((item) => item.observation_id);
    const [{ data: observations, error: observationError }, { data: analyses, error: analysisError }, { data: supports, error: supportError }] = await Promise.all([
      observationIds.length ? auth.data.from("observations").select("*").in("id", observationIds).eq("status", "adopted").order("occurred_at") : Promise.resolve({ data: [], error: null }),
      auth.data.from("analysis_runs").select("*").eq("child_id", id).eq("decision", "adopted").order("generated_at"),
      auth.data.from("support_actions").select("*").eq("child_id", id).order("created_at"),
    ]);
    if (observationError || analysisError || supportError) throw new ApiError(500, "GROWTH_READ_FAILED", "成长轨迹读取失败");
    const analysisIds = (analyses ?? []).map((item) => item.id);
    const { data: claimReviews, error: reviewError } = analysisIds.length
      ? await auth.data.from("analysis_claim_reviews").select("*").in("analysis_run_id", analysisIds)
      : { data: [], error: null };
    if (reviewError) throw new ApiError(500, "GROWTH_REVIEW_READ_FAILED", "成长轨迹正式审核结论读取失败");
    const analysisMap = new Map((analyses ?? []).map((item) => [item.observation_id, {
      ...item,
      structured_result: effectiveAnalysisResult(item.structured_result, (claimReviews ?? []).filter((review) => review.analysis_run_id === item.id)),
      claim_reviews: (claimReviews ?? []).filter((review) => review.analysis_run_id === item.id),
    }]));
    return {
      child,
      timeline: (observations ?? []).map((observation) => ({
        observation,
        analysis: analysisMap.get(observation.id) ?? null,
        supports: (supports ?? []).filter((item) => item.observation_id === observation.id),
      })),
      coverage: {
        observations: observations?.length ?? 0,
        scenes: [...new Set((observations ?? []).map((item) => item.scene))],
        themes: mostFrequent((observations ?? []).map((item) => item.theme)),
        verifiedSupports: (supports ?? []).filter((item) => ["verified", "closed"].includes(item.status)).length,
      },
    };
  });

  app.get("/api/reports", async (request) => {
    const auth = await authenticate(request);
    const query = z.object({ childId: uuid.optional(), classroomId: uuid.optional() }).parse(request.query);
    let builder = auth.data.from("period_reports").select("*").order("created_at", { ascending: false });
    if (query.childId) builder = builder.eq("child_id", query.childId);
    if (query.classroomId) builder = builder.eq("classroom_id", query.classroomId);
    const { data, error } = await builder;
    if (error) throw new ApiError(500, "REPORT_LIST_FAILED", "周期报告读取失败");
    return { items: data ?? [] };
  });

  app.post("/api/reports/generate", async (request, reply) => {
    const auth = await authenticate(request);
    const input = reportInput.parse(request.body);

    if (input.reportType === "classroom") {
      const { data: classroom, error: classroomError } = await auth.data
        .from("classrooms")
        .select("id, name")
        .eq("id", input.classroomId)
        .maybeSingle();
      if (classroomError) throw new ApiError(500, "CLASSROOM_LOOKUP_FAILED", "班级信息读取失败");
      if (!classroom) throw new ApiError(404, "CLASSROOM_NOT_FOUND", "班级不存在或无权访问");
      const [
        { data: observations, error: observationError },
        { data: analyses, error: analysisError },
        { data: supports, error: supportError },
        { data: children, error: childrenError },
        { data: curriculumClues, error: curriculumError },
      ] = await Promise.all([
        auth.data.from("observations").select("*").eq("classroom_id", classroom.id).eq("status", "adopted").gte("occurred_at", `${input.periodStart}T00:00:00+08:00`).lte("occurred_at", `${input.periodEnd}T23:59:59+08:00`).order("occurred_at"),
        auth.data.from("analysis_runs").select("*").eq("classroom_id", classroom.id).eq("decision", "adopted"),
        auth.data.from("support_actions").select("*").eq("classroom_id", classroom.id),
        auth.data.from("children").select("id").eq("classroom_id", classroom.id).eq("status", "active"),
        auth.data.from("curriculum_clues").select("id, title, theme, status").eq("classroom_id", classroom.id).neq("status", "archived").order("updated_at", { ascending: false }).limit(20),
      ]);
      if (observationError || analysisError || supportError || childrenError || curriculumError) {
        throw new ApiError(500, "CLASSROOM_REPORT_CONTEXT_FAILED", "班级周期报告证据读取失败");
      }
      const adoptedObservations = observations ?? [];
      const observationIds = adoptedObservations.map((item) => item.id);
      const { data: subjectRows, error: subjectError } = observationIds.length
        ? await auth.data.from("observation_subjects").select("observation_id, child_id").in("observation_id", observationIds)
        : { data: [], error: null };
      if (subjectError) throw new ApiError(500, "CLASSROOM_REPORT_SUBJECTS_FAILED", "班级报告参与幼儿读取失败");
      const reportObservations = adoptedObservations.map((item) => ({
        ...item,
        participant_child_ids: (subjectRows ?? []).filter((subject) => subject.observation_id === item.id).map((subject) => subject.child_id),
      }));
      const coverage = classroomReportEvidenceCoverage(reportObservations);
      if (!coverage.eligible) {
        throw new ApiError(409, "CLASSROOM_REPORT_COVERAGE_REQUIRED", "班级报告至少需要覆盖2名幼儿、2条观察、2个不同日期，且观察均已完成教师终审");
      }
      const usedAnalyses = (analyses ?? []).filter((item) => observationIds.includes(item.observation_id));
      const analysisIds = usedAnalyses.map((item) => item.id);
      const { data: claimReviews, error: reviewError } = analysisIds.length
        ? await auth.data.from("analysis_claim_reviews").select("*").in("analysis_run_id", analysisIds)
        : { data: [], error: null };
      if (reviewError) throw new ApiError(500, "CLASSROOM_REPORT_REVIEW_CONTEXT_FAILED", "班级报告正式审核结论读取失败");
      const effectiveAnalyses = usedAnalyses.map((analysis) => ({
        ...analysis,
        structured_result: effectiveAnalysisResult(analysis.structured_result, (claimReviews ?? []).filter((review) => review.analysis_run_id === analysis.id)),
      }));
      const usedSupports = (supports ?? []).filter((item) => observationIds.includes(item.observation_id));
      const metrics = classroomReportMetrics({
        observations: reportObservations,
        analyses: effectiveAnalyses,
        supports: usedSupports,
        totalChildCount: children?.length ?? 0,
        curriculumClues: curriculumClues ?? [],
      });
      let generated;
      try {
        generated = await aiProvider.generateClassroomReport({
          classroomName: classroom.name,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          observations: reportObservations,
          analyses: effectiveAnalyses,
        supports: usedSupports,
        metrics,
        prompt: await resolveTenantPrompt(auth.tenantId, "classroom_period_report"),
      });
      } catch {
        throw new ApiError(502, "AI_CLASSROOM_REPORT_FAILED", "AI班级报告生成暂时不可用，请稍后重试");
      }
      if (generated.fallbackReason) {
        request.log.warn({ classroomId: classroom.id, fallbackReason: generated.fallbackReason }, "AI classroom report provider used safe fallback");
      }
      const content = {
        ...generated.data,
        aiMeta: {
          provider: generated.provider,
          model: generated.model,
          promptVersion: generated.promptVersion,
          fallbackUsed: Boolean(generated.fallbackReason),
        },
      };
      const { data, error } = await auth.data.from("period_reports").insert({
        tenant_id: auth.tenantId,
        classroom_id: classroom.id,
        child_id: null,
        report_type: "classroom",
        period_start: input.periodStart,
        period_end: input.periodEnd,
        content,
        evidence_observation_ids: observationIds,
        created_by: auth.userId,
      }).select().single();
      if (error) throw new ApiError(500, "CLASSROOM_REPORT_GENERATE_FAILED", "班级周期报告生成失败");
      await audit(auth, "report.generated", "period_report", data.id, {
        reportType: "classroom",
        evidenceCount: observationIds.length,
        timePointCount: coverage.timePointCount,
        childCount: coverage.childCount,
        provider: generated.provider,
        model: generated.model,
        fallbackUsed: Boolean(generated.fallbackReason),
      });
      return reply.status(201).send({ item: data, aiNotice: generated.notice });
    }

    const childId = input.childId;
    if (!childId) throw new ApiError(422, "CHILD_REQUIRED", "个体报告必须选择幼儿");
    const { data: child, error: childError } = await auth.data.from("children").select("id, classroom_id, display_name").eq("id", childId).eq("classroom_id", input.classroomId).maybeSingle();
    if (childError) throw new ApiError(500, "CHILD_LOOKUP_FAILED", "幼儿档案读取失败");
    if (!child) throw new ApiError(404, "CHILD_NOT_FOUND", "幼儿不存在、班级不匹配或无权访问");
    const { data: reportSubjects, error: reportSubjectError } = await auth.data.from("observation_subjects").select("observation_id").eq("child_id", child.id);
    if (reportSubjectError) throw new ApiError(500, "REPORT_SUBJECT_READ_FAILED", "个体报告观察关联读取失败");
    const reportObservationIds = (reportSubjects ?? []).map((item) => item.observation_id);
    const [{ data: observations, error: observationError }, { data: analyses, error: analysisError }, { data: supports, error: supportError }] = await Promise.all([
      reportObservationIds.length
        ? auth.data.from("observations").select("*").in("id", reportObservationIds).eq("status", "adopted").gte("occurred_at", `${input.periodStart}T00:00:00+08:00`).lte("occurred_at", `${input.periodEnd}T23:59:59+08:00`).order("occurred_at")
        : Promise.resolve({ data: [], error: null }),
      auth.data.from("analysis_runs").select("*").eq("child_id", child.id).eq("decision", "adopted"),
      auth.data.from("support_actions").select("*").eq("child_id", child.id),
    ]);
    if (observationError || analysisError || supportError) throw new ApiError(500, "REPORT_CONTEXT_READ_FAILED", "周期报告证据读取失败");
    const coverage = reportEvidenceCoverage(observations ?? []);
    if (!coverage.eligible) {
      throw new ApiError(409, "REPORT_MULTI_TIMEPOINT_REQUIRED", "周期报告至少需要2条、跨2个不同日期且经教师终审采用的观察证据");
    }
    const observationIds = (observations ?? []).map((item) => item.id);
    const usedAnalyses = (analyses ?? []).filter((item) => observationIds.includes(item.observation_id));
    const analysisIds = usedAnalyses.map((item) => item.id);
    const { data: claimReviews, error: reviewError } = analysisIds.length
      ? await auth.data.from("analysis_claim_reviews").select("*").in("analysis_run_id", analysisIds)
      : { data: [], error: null };
    if (reviewError) throw new ApiError(500, "REPORT_REVIEW_CONTEXT_FAILED", "报告正式审核结论读取失败");
    const effectiveAnalyses = usedAnalyses.map((analysis) => ({
      ...analysis,
      structured_result: effectiveAnalysisResult(analysis.structured_result, (claimReviews ?? []).filter((review) => review.analysis_run_id === analysis.id)),
    }));
    const usedSupports = (supports ?? []).filter((item) => observationIds.includes(item.observation_id));
    let generated;
    try {
      generated = await aiProvider.generateReport({
        reportType: input.reportType,
        childName: child.display_name,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        observations: observations ?? [],
        analyses: effectiveAnalyses,
        supports: usedSupports,
        prompt: await resolveTenantPrompt(auth.tenantId, "individual_period_report"),
      });
    } catch {
      throw new ApiError(502, "AI_REPORT_FAILED", "AI报告生成暂时不可用，请稍后重试");
    }
    if (generated.fallbackReason) {
      request.log.warn({
        childId: child.id,
        reportType: input.reportType,
        fallbackReason: generated.fallbackReason,
      }, "AI report provider used safe fallback");
    }
    const content = {
      ...generated.data,
      aiMeta: {
        provider: generated.provider,
        model: generated.model,
        promptVersion: generated.promptVersion,
        fallbackUsed: Boolean(generated.fallbackReason),
      },
    };
    const { data, error } = await auth.data.from("period_reports").insert({
      tenant_id: auth.tenantId,
      classroom_id: input.classroomId,
      child_id: childId,
      report_type: input.reportType,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      content,
      evidence_observation_ids: observationIds,
      created_by: auth.userId,
    }).select().single();
    if (error) throw new ApiError(500, "REPORT_GENERATE_FAILED", "周期报告生成失败");
    await audit(auth, "report.generated", "period_report", data.id, {
      reportType: data.report_type,
      evidenceCount: observationIds.length,
      timePointCount: coverage.timePointCount,
      provider: generated.provider,
      model: generated.model,
      fallbackUsed: Boolean(generated.fallbackReason),
    });
    return reply.status(201).send({ item: data, aiNotice: generated.notice });
  });

  app.patch("/api/reports/:id", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const input = z.object({ content: z.record(z.unknown()) }).parse(request.body);
    const { data: current, error: currentError } = await auth.data.from("period_reports").select("*").eq("id", id).maybeSingle();
    if (currentError) throw new ApiError(500, "REPORT_READ_FAILED", "报告读取失败");
    if (!current) throw new ApiError(404, "REPORT_NOT_FOUND", "报告不存在或无权访问");
    const merged = { ...(current.content ?? {}), ...input.content } as Record<string, unknown>;
    const aiMeta = merged.aiMeta;
    delete merged.aiMeta;
    delete merged.teacherEditedAt;
    const validated = current.report_type === "classroom"
      ? classroomReportContentSchema.parse(merged)
      : reportContentSchema.parse(merged);
    const { data, error } = await auth.data.from("period_reports").update({
      content: { ...validated, ...(aiMeta ? { aiMeta } : {}), teacherEditedAt: new Date().toISOString() },
      status: "draft",
    }).eq("id", id).select().single();
    if (error) throw new ApiError(500, "REPORT_UPDATE_FAILED", "报告修改保存失败");
    await audit(auth, "report.updated", "period_report", id);
    return { item: data };
  });

  app.post("/api/reports/:id/revise", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const { instruction } = z.object({ instruction: z.string().trim().min(2).max(2000) }).parse(request.body);
    const { data: current, error: currentError } = await auth.data.from("period_reports").select("*").eq("id", id).maybeSingle();
    if (currentError) throw new ApiError(500, "REPORT_READ_FAILED", "报告读取失败");
    if (!current) throw new ApiError(404, "REPORT_NOT_FOUND", "报告不存在或无权访问");
    const existing = { ...(current.content ?? {}) } as Record<string, unknown>;
    delete existing.aiMeta;
    delete existing.teacherEditedAt;
    const existingContent = current.report_type === "classroom"
      ? classroomReportContentSchema.parse(existing)
      : reportContentSchema.parse(existing);
    let generated;
    try {
      generated = await aiProvider.reviseReport({
        reportType: current.report_type,
        existingContent,
        instruction,
        prompt: await resolveTenantPrompt(auth.tenantId, "report_revision"),
      });
    } catch {
      throw new ApiError(502, "AI_REPORT_REVISION_FAILED", "AI报告修订暂时不可用，请稍后重试");
    }
    const { data, error } = await auth.data.from("period_reports").update({
      content: {
        ...generated.data,
        aiMeta: {
          provider: generated.provider,
          model: generated.model,
          promptVersion: generated.promptVersion,
          fallbackUsed: Boolean(generated.fallbackReason),
        },
      },
      status: "draft",
    }).eq("id", id).select().single();
    if (error) throw new ApiError(500, "REPORT_REVISION_SAVE_FAILED", "AI修订报告保存失败");
    await audit(auth, "report.ai_revised", "period_report", id, { instruction, provider: generated.provider });
    return { item: data, aiNotice: generated.notice };
  });

  app.delete("/api/reports/:id", async (request, reply) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const { data: current, error: currentError } = await auth.data.from("period_reports").select("id").eq("id", id).maybeSingle();
    if (currentError) throw new ApiError(500, "REPORT_READ_FAILED", "报告读取失败");
    if (!current) throw new ApiError(404, "REPORT_NOT_FOUND", "报告不存在或无权访问");
    const { error } = await serviceClient.schema(config.SUPABASE_SCHEMA).from("period_reports").delete().eq("id", id).eq("tenant_id", auth.tenantId);
    if (error) throw new ApiError(500, "REPORT_DELETE_FAILED", "报告删除失败");
    await audit(auth, "report.deleted", "period_report", id);
    return reply.status(204).send();
  });

  app.patch("/api/reports/:id/status", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const input = z.object({ status: z.enum(["reviewed", "published", "withdrawn"]) }).parse(request.body);
    const { data: current, error: currentError } = await auth.data.from("period_reports").select("status").eq("id", id).maybeSingle();
    if (currentError) throw new ApiError(500, "REPORT_READ_FAILED", "报告状态读取失败");
    if (!current) throw new ApiError(404, "REPORT_NOT_FOUND", "报告不存在或无权访问");
    const allowed: Record<string, string[]> = { draft: ["reviewed"], reviewed: ["published"], published: ["withdrawn"], withdrawn: [] };
    if (!(allowed[current.status] ?? []).includes(input.status)) throw new ApiError(409, "INVALID_REPORT_TRANSITION", "报告状态必须按草稿、审核、发布、撤回顺序推进");
    const { data, error } = await auth.data.from("period_reports").update({
      status: input.status,
      ...(input.status === "reviewed" && { reviewed_by: auth.userId }),
      ...(input.status === "published" && { published_at: new Date().toISOString() }),
    }).eq("id", id).select().single();
    if (error) throw new ApiError(500, "REPORT_STATUS_FAILED", "报告状态更新失败");
    await audit(auth, `report.${input.status}`, "period_report", id);
    return { item: data };
  });

  app.get("/api/curriculum-clues", async (request) => {
    const auth = await authenticate(request);
    const query = z.object({ classroomId: uuid.optional() }).parse(request.query);
    let builder = auth.data.from("curriculum_clues").select("*").order("updated_at", { ascending: false });
    if (query.classroomId) builder = builder.eq("classroom_id", query.classroomId);
    const { data, error } = await builder;
    if (error) throw new ApiError(500, "CURRICULUM_LIST_FAILED", "课程线索读取失败");
    return { items: data ?? [] };
  });

  app.post("/api/curriculum-clues/scan", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (request) => {
    const auth = await authenticate(request);
    const { classroomId } = z.object({ classroomId: uuid }).parse(request.body);
    const { data: observations, error } = await auth.data.from("observations").select("id, child_id, scene, theme, occurred_at, teacher_identification, teacher_response").eq("classroom_id", classroomId).eq("status", "adopted").order("occurred_at");
    if (error) throw new ApiError(500, "CURRICULUM_SCAN_FAILED", "课程线索扫描失败");
    if (!observations?.length) return { items: [] };
    const [clusteringPrompt, curriculumPrompt] = await Promise.all([
      resolveTenantPrompt(auth.tenantId, "curriculum_interest_clustering"),
      resolveTenantPrompt(auth.tenantId, "curriculum_draft"),
    ]);
    let clustered;
    try {
      clustered = await aiProvider.clusterInterests({ observations: observations.map((item) => ({
        id: item.id,
        theme: item.theme,
        scene: item.scene,
        teacher_identification: item.teacher_identification,
        teacher_response: item.teacher_response,
      })), prompt: clusteringPrompt });
    } catch {
      throw new ApiError(502, "AI_INTEREST_CLUSTER_FAILED", "兴趣语义聚类暂时不可用，请稍后重试");
    }
    if (clustered.fallbackReason) request.log.warn({ classroomId, fallbackReason: clustered.fallbackReason }, "interest clustering used safe fallback");
    const observationMap = new Map(observations.map((item) => [item.id, item]));
    const results = [];
    for (const cluster of clustered.data.clusters) {
      const theme = cluster.label;
      const group = cluster.observationIds.map((id) => observationMap.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
      if (!group || group.length < 2) continue;
      const groupObservationIds = group.map((item) => item.id);
      const { data: groupSubjects, error: groupSubjectError } = await auth.data.from("observation_subjects").select("child_id").in("observation_id", groupObservationIds);
      if (groupSubjectError) throw new ApiError(500, "CURRICULUM_SUBJECTS_FAILED", "课程参与幼儿读取失败");
      const childIds = [...new Set((groupSubjects?.length ? groupSubjects : group).map((item) => item.child_id))];
      const timePoints = [...new Set(group.map((item) => chinaCalendarDate(item.occurred_at)))];
      const thresholdMet = (childIds.length >= 2 || group.length >= 3) && timePoints.length >= 2;
      const scope = childIds.length === 1 ? "individual_support" as const : "classroom_curriculum" as const;
      let generated = null;
      if (thresholdMet) {
        try {
          generated = await aiProvider.generateCurriculum({
            theme,
            scope,
            observationCount: group.length,
            childCount: childIds.length,
            timePointCount: timePoints.length,
            observations: group,
            prompt: curriculumPrompt,
          });
        } catch {
          throw new ApiError(502, "AI_CURRICULUM_FAILED", "AI课程草案生成暂时不可用，请稍后重试");
        }
        if (generated.fallbackReason) {
          request.log.warn({
            classroomId,
            theme,
            fallbackReason: generated.fallbackReason,
          }, "AI curriculum provider used safe fallback");
        }
      }
      const draft = generated?.data;
      const payload = {
        tenant_id: auth.tenantId,
        classroom_id: classroomId,
        title: draft?.title ?? (scope === "individual_support" ? `${theme}：个别支持线索` : `${theme}：持续探究课程线索`),
        theme,
        origin: draft?.origin ?? `${group.length}条已采用观察，涉及${childIds.length}名幼儿、${timePoints.length}个时间点。`,
        inquiry_questions: draft?.inquiryQuestions ?? group.map((item) => item.teacher_response?.nextObservationFocus).filter(Boolean).slice(0, 6),
        plan: draft ? {
          scope,
          existingExperience: draft.existingExperience,
          keyExperiences: draft.keyExperiences,
          environmentAndMaterials: draft.materialsAndEnvironment,
          possiblePathways: draft.possiblePaths,
          observationFocus: draft.observationFocus,
          familyAndCommunity: draft.familyAndCommunity,
          adjustmentBasis: draft.adjustmentBasis,
          aiMeta: {
            provider: generated?.provider,
            model: generated?.model,
            promptVersion: generated?.promptVersion,
            fallbackUsed: Boolean(generated?.fallbackReason),
          },
          semanticCluster: {
            label: cluster.label,
            aliases: cluster.aliases,
            rationale: cluster.rationale,
            provider: clustered.provider,
            model: clustered.model,
            promptVersion: clustered.promptVersion,
            fallbackUsed: Boolean(clustered.fallbackReason),
          },
          version: 1,
        } : {
          scope,
          existingExperience: group.map((item) => item.teacher_identification).filter(Boolean).slice(0, 6),
          semanticCluster: {
            label: cluster.label,
            aliases: cluster.aliases,
            rationale: cluster.rationale,
            provider: clustered.provider,
            model: clustered.model,
            promptVersion: clustered.promptVersion,
            fallbackUsed: Boolean(clustered.fallbackReason),
          },
          version: 1,
        },
        child_ids: childIds,
        evidence_observation_ids: group.map((item) => item.id),
        time_point_count: timePoints.length,
        threshold_met: thresholdMet,
        status: thresholdMet ? "draft" : "clue",
        created_by: auth.userId,
      };
      const { data: existing, error: existingError } = await auth.data.from("curriculum_clues").select("id, plan").eq("classroom_id", classroomId).eq("theme", theme).neq("status", "archived").maybeSingle();
      if (existingError) throw new ApiError(500, "CURRICULUM_CLUE_READ_FAILED", "课程线索读取失败");
      const operation = existing
        ? auth.data.from("curriculum_clues").update({ ...payload, plan: { ...payload.plan, version: Number(existing.plan?.version ?? 0) + 1 } }).eq("id", existing.id).select().single()
        : auth.data.from("curriculum_clues").insert(payload).select().single();
      const { data: saved, error: saveError } = await operation;
      if (saveError) throw new ApiError(500, "CURRICULUM_CLUE_SAVE_FAILED", "课程线索保存失败");
      results.push(saved);
    }
    await audit(auth, "curriculum.scanned", "classroom", classroomId, {
      observationCount: observations?.length ?? 0,
      clueCount: results.length,
      aiMode: config.AI_MODE,
      clusteringProvider: clustered.provider,
      clusteringModel: clustered.model,
    });
    return { items: results };
  });

  app.patch("/api/curriculum-clues/:id", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const input = z.object({
      title: z.string().trim().min(2).max(160).optional(),
      inquiryQuestions: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
      plan: z.record(z.unknown()).optional(),
      status: z.enum(["clue", "draft", "reviewed", "active", "reflected", "archived"]).optional(),
    }).parse(request.body);
    const { data: current, error: currentError } = await auth.data.from("curriculum_clues").select("plan, status").eq("id", id).maybeSingle();
    if (currentError) throw new ApiError(500, "CURRICULUM_CLUE_READ_FAILED", "课程线索读取失败");
    if (!current) throw new ApiError(404, "CURRICULUM_CLUE_NOT_FOUND", "课程线索不存在或无权访问");
    if (input.status !== undefined) {
      const allowed: Record<string, string[]> = { clue: ["draft", "archived"], draft: ["reviewed", "archived"], reviewed: ["active", "archived"], active: ["reflected", "archived"], reflected: ["archived"], archived: [] };
      if (!(allowed[current.status] ?? []).includes(input.status)) throw new ApiError(409, "INVALID_CURRICULUM_TRANSITION", "课程状态推进顺序不正确");
    }
    const { data, error } = await auth.data.from("curriculum_clues").update({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.inquiryQuestions !== undefined && { inquiry_questions: input.inquiryQuestions }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.plan !== undefined && { plan: { ...input.plan, version: Number(current.plan?.version ?? 0) + 1 } }),
    }).eq("id", id).select().single();
    if (error) throw new ApiError(500, "CURRICULUM_UPDATE_FAILED", "课程草案更新失败");
    await audit(auth, "curriculum.updated", "curriculum_clue", id, { status: data.status, version: data.plan?.version });
    return { item: data };
  });
}
